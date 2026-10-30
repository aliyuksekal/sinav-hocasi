package com.benim.sinavhocasi;

import android.app.Activity;

import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Sınav Hocası Plus — Google Play Faturalandırma (Billing Library 8) ve Play Integrity.
 *
 * Güvenlik notu: Bu sınıf hiçbir zaman "Plus etkin" kararı VERMEZ. Yalnızca Google'dan aldığı
 * satın alma jetonunu sayfaya iletir; sayfa jetonu sunucuya gönderir, sunucu Google Play
 * Developer API ile doğrular. Bu yüzden cihazda yapılacak bir değişiklik (root, yamalı APK,
 * sahte faturalandırma uygulaması) Plus'ı açamaz.
 */
final class PlusBilling {

    interface Sink { void emit(String event, JSONObject data); }

    static final String PRODUCT = "sinav_hocasi_plus";
    private static final Pattern ACCOUNT = Pattern.compile("^[a-f0-9]{32,64}$");
    private static final Pattern HASH = Pattern.compile("^[a-f0-9]{64}$");

    private final Activity activity;
    private final Sink sink;
    private BillingClient client;
    private boolean connecting;
    private final List<Runnable> waiting = new ArrayList<>();
    private ProductDetails details;

    private StandardIntegrityManager.StandardIntegrityTokenProvider integrityProvider;
    private boolean integrityPreparing;
    private final List<Runnable> integrityWaiting = new ArrayList<>();

    PlusBilling(Activity activity, Sink sink) {
        this.activity = activity;
        this.sink = sink;
    }

    static boolean integrityConfigured() { return BuildConfig.CLOUD_PROJECT_NUMBER > 0L; }

    // ------------------------------------------------------------ bağlantı
    private void ready(Runnable r, String id) {
        if (client != null && client.isReady()) { r.run(); return; }
        waiting.add(r);
        if (connecting) return;
        connecting = true;
        if (client == null) {
            client = BillingClient.newBuilder(activity)
                    .setListener(this::onPurchasesUpdated)
                    .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                    .build();
        }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                activity.runOnUiThread(() -> {
                    connecting = false;
                    List<Runnable> run = new ArrayList<>(waiting);
                    waiting.clear();
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Runnable x : run) x.run();
                    } else {
                        sink.emit("plus", err(id, "Google Play ödeme hizmetine bağlanılamadı (" + result.getResponseCode() + ")."));
                    }
                });
            }
            @Override public void onBillingServiceDisconnected() {
                activity.runOnUiThread(() -> connecting = false);
            }
        });
    }

    void destroy() {
        if (client != null) { client.endConnection(); client = null; }
    }

    // ------------------------------------------------------------ ürünler
    void products(String id) {
        ready(() -> {
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(PRODUCT)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()))
                    .build();
            client.queryProductDetailsAsync(params, (result, res) -> activity.runOnUiThread(() -> {
                List<ProductDetails> list = res == null ? null : res.getProductDetailsList();
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null || list.isEmpty()) {
                    sink.emit("plus", err(id, "Abonelik bilgisi alınamadı. Uygulamanın Google Play'den yüklendiğinden emin ol."));
                    return;
                }
                details = list.get(0);
                JSONObject o = ok(id);
                try {
                    JSONArray plans = new JSONArray();
                    List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                    if (offers != null) for (ProductDetails.SubscriptionOfferDetails off : offers) {
                        JSONObject p = new JSONObject();
                        p.put("basePlan", off.getBasePlanId());
                        p.put("offer", off.getOfferId() == null ? "" : off.getOfferId());
                        p.put("token", off.getOfferToken());
                        JSONArray phases = new JSONArray();
                        for (ProductDetails.PricingPhase ph : off.getPricingPhases().getPricingPhaseList()) {
                            JSONObject q = new JSONObject();
                            q.put("price", ph.getFormattedPrice());
                            q.put("micros", ph.getPriceAmountMicros());
                            q.put("currency", ph.getPriceCurrencyCode());
                            q.put("period", ph.getBillingPeriod());
                            q.put("cycles", ph.getBillingCycleCount());
                            q.put("mode", ph.getRecurrenceMode());
                            phases.put(q);
                        }
                        p.put("phases", phases);
                        plans.put(p);
                    }
                    o.put("plans", plans);
                } catch (Exception ignored) { }
                sink.emit("plus", o);
            }));
        }, id);
    }

    // ------------------------------------------------------------ satın alma
    void buy(String id, String offerToken, String account) {
        if (account == null || !ACCOUNT.matcher(account).matches() || offerToken == null || offerToken.length() > 2000) {
            sink.emit("plus", err(id, "Geçersiz istek."));
            return;
        }
        ready(() -> {
            if (details == null) { sink.emit("plus", err(id, "Önce planlar yüklenmeli.")); return; }
            boolean known = false;
            List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
            if (offers != null) for (ProductDetails.SubscriptionOfferDetails off : offers) if (offerToken.equals(off.getOfferToken())) known = true;
            if (!known) { sink.emit("plus", err(id, "Plan bulunamadı.")); return; }
            BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offerToken)
                            .build()))
                    .setObfuscatedAccountId(account)
                    .build();
            BillingResult r = client.launchBillingFlow(activity, params);
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                sink.emit("plus", err(id, r.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED
                        ? "Bu Google hesabında zaten Plus var. \"Satın alımı geri yükle\"yi dene." : "Ödeme ekranı açılamadı (" + r.getResponseCode() + ")."));
            } else {
                sink.emit("plus", ok(id)); // sonuç onPurchasesUpdated ile gelir
            }
        }, id);
    }

    private void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        activity.runOnUiThread(() -> {
            JSONObject o = new JSONObject();
            try {
                o.put("code", result.getResponseCode());
                o.put("purchases", toJson(purchases));
                o.put("cancelled", result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED);
            } catch (Exception ignored) { }
            sink.emit("purchase", o);
        });
    }

    void restore(String id) {
        ready(() -> client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (result, purchases) -> activity.runOnUiThread(() -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        sink.emit("plus", err(id, "Satın alımlar okunamadı (" + result.getResponseCode() + ")."));
                        return;
                    }
                    JSONObject o = ok(id);
                    try { o.put("purchases", toJson(purchases)); } catch (Exception ignored) { }
                    sink.emit("plus", o);
                })), id);
    }

    void manage() {
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://play.google.com/store/account/subscriptions?sku=" + PRODUCT + "&package=" + activity.getPackageName()));
            activity.startActivity(i);
        } catch (Exception ignored) { }
    }

    private static JSONArray toJson(List<Purchase> purchases) throws Exception {
        JSONArray a = new JSONArray();
        if (purchases == null) return a;
        for (Purchase p : purchases) {
            if (!p.getProducts().contains(PRODUCT)) continue;
            JSONObject o = new JSONObject();
            o.put("token", p.getPurchaseToken());
            o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased"
                    : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unknown");
            o.put("acknowledged", p.isAcknowledged());
            AccountIdentifiers ids = p.getAccountIdentifiers();
            o.put("account", ids != null && ids.getObfuscatedAccountId() != null ? ids.getObfuscatedAccountId() : "");
            a.put(o);
        }
        return a;
    }

    // ------------------------------------------------------------ Play Integrity (Standard API)
    void integrity(String id, String requestHash) {
        if (!integrityConfigured()) { sink.emit("plus", err(id, "Cihaz doğrulaması bu sürümde kapalı.")); return; }
        if (requestHash == null || !HASH.matcher(requestHash).matches()) { sink.emit("plus", err(id, "Geçersiz istek.")); return; }
        Runnable go = () -> integrityProvider.request(StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                        .setRequestHash(requestHash).build())
                .addOnSuccessListener(t -> {
                    JSONObject o = ok(id);
                    try { o.put("token", t.token()); } catch (Exception ignored) { }
                    sink.emit("plus", o);
                })
                .addOnFailureListener(e -> {
                    integrityProvider = null; // bir sonraki denemede yeniden hazırla
                    sink.emit("plus", err(id, "Cihaz doğrulanamadı."));
                });
        if (integrityProvider != null) { go.run(); return; }
        integrityWaiting.add(go);
        if (integrityPreparing) return;
        integrityPreparing = true;
        StandardIntegrityManager mgr = IntegrityManagerFactory.createStandard(activity.getApplicationContext());
        mgr.prepareIntegrityToken(StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                        .setCloudProjectNumber(BuildConfig.CLOUD_PROJECT_NUMBER).build())
                .addOnSuccessListener(p -> {
                    integrityPreparing = false;
                    integrityProvider = p;
                    List<Runnable> run = new ArrayList<>(integrityWaiting);
                    integrityWaiting.clear();
                    for (Runnable r : run) r.run();
                })
                .addOnFailureListener(e -> {
                    integrityPreparing = false;
                    integrityWaiting.clear();
                    sink.emit("plus", err(id, "Cihaz doğrulaması hazırlanamadı."));
                });
    }

    // ------------------------------------------------------------ yardımcılar
    private static JSONObject ok(String id) {
        JSONObject o = new JSONObject();
        try { o.put("id", id); o.put("ok", true); } catch (Exception ignored) { }
        return o;
    }

    private static JSONObject err(String id, String msg) {
        JSONObject o = new JSONObject();
        try { o.put("id", id); o.put("ok", false); o.put("error", msg); } catch (Exception ignored) { }
        return o;
    }
}
