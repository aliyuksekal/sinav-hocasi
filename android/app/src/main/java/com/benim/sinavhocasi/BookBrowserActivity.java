package com.benim.sinavhocasi;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;

/**
 * MEB'in resmî ders kitabı sitesini (tymm.meb.gov.tr) uygulama içinde açar.
 * - Yalnızca *.meb.gov.tr adreslerine HTTPS ile gidilebilir; diğer bağlantılar sistem tarayıcısında açılır.
 * - Bu sayfaya uygulama köprüsü verilmez (site uygulamaya komut veremez).
 * - PDF bağlantısına dokunulunca dosya indirilir, imzası (%PDF) ve boyutu doğrulanır, materyallere eklenir.
 */
public class BookBrowserActivity extends Activity {

    static final String EXTRA_FILE = "file";
    static final String EXTRA_NAME = "name";
    private static final String START = "https://tymm.meb.gov.tr/ders-kitaplari";
    private static final long MAX_BYTES = 250L * 1024 * 1024;

    private WebView web;
    private ProgressBar bar;
    private TextView status;
    private Button cancel;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile boolean cancelled = false;

    static boolean allowedHost(Uri u) {
        if (u == null || !"https".equals(u.getScheme())) return false;
        String h = u.getHost();
        if (h == null) return false;
        h = h.toLowerCase(Locale.ROOT);
        return h.equals("meb.gov.tr") || h.endsWith(".meb.gov.tr") || h.equals("eba.gov.tr") || h.endsWith(".eba.gov.tr");
    }

    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int bg = night ? Color.rgb(12, 23, 48) : Color.WHITE;
        int ink = night ? Color.rgb(233, 241, 255) : Color.rgb(12, 26, 53);
        int accent = night ? Color.rgb(76, 195, 240) : Color.rgb(11, 127, 192);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bg);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(12), dp(8), dp(8), dp(8));

        TextView title = new TextView(this);
        title.setText("MEB ders kitapları");
        title.setTextColor(ink);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        top.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button close = new Button(this);
        close.setText("Kapat");
        close.setAllCaps(false);
        close.setOnClickListener(v -> { cancelled = true; setResult(RESULT_CANCELED); finish(); });
        top.addView(close);
        root.addView(top);

        status = new TextView(this);
        status.setText("Sınıfını ve dersini seç, kitabın “PDF” bağlantısına dokun. Kitap otomatik olarak eklenecek.");
        status.setTextColor(ink);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        status.setPadding(dp(14), 0, dp(14), dp(8));
        root.addView(status);

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setIndeterminate(true);
        bar.setVisibility(View.GONE);
        if (Build.VERSION.SDK_INT >= 21) bar.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(6)));

        cancel = new Button(this);
        cancel.setText("İndirmeyi duraklat");
        cancel.setAllCaps(false);
        cancel.setVisibility(View.GONE);
        cancel.setOnClickListener(v -> cancelled = true);
        root.addView(cancel);

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); // site filtreleri için gerekli
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (allowedHost(u)) {
                    String p = u.getPath() == null ? "" : u.getPath().toLowerCase(Locale.ROOT);
                    if (p.endsWith(".pdf")) { startDownload(u.toString(), null); return true; }
                    return false;
                }
                if ("https".equals(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            Uri u = Uri.parse(url);
            if (!allowedHost(u)) { toast("Bu adresten indirme yapılamaz."); return; }
            startDownload(url, URLUtil.guessFileName(url, contentDisposition, mimetype));
        });

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> {
                if (web.canGoBack()) web.goBack(); else finish();
            });
        }
        web.loadUrl(START);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    private void toast(String m) { ui.post(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    private String niceName(String url, String guessed) {
        String t = web != null ? web.getTitle() : null;
        String n = guessed;
        if (n == null || n.isEmpty()) {
            String last = Uri.parse(url).getLastPathSegment();
            n = last == null ? "ders-kitabi.pdf" : last;
        }
        n = n.replaceAll("(?i)\\.pdf$", "").replaceAll("_\\d{8}_\\d{6}_\\d+$", "").replace('-', ' ').replace('_', ' ').trim();
        if (n.length() < 4 && t != null) n = t;
        if (n.length() > 100) n = n.substring(0, 100);
        if (!n.isEmpty()) n = n.substring(0, 1).toUpperCase(new Locale("tr")) + n.substring(1);
        return n.isEmpty() ? "MEB ders kitabı" : n;
    }

    // ------------------------------------------------------------------
    // İndirme: kopmaya dayanıklı, kaldığı yerden devam eder (HTTP Range)
    //  - Yarım dosya books/partial/<url-özeti>.part olarak saklanır
    //  - Bağlantı koparsa artan aralıklarla 8 kez yeniden dener
    //  - Sunucu dosyayı değiştirmişse (ETag/Last-Modified) baştan başlar
    // ------------------------------------------------------------------
    private static final int MAX_TRIES = 8;

    private static String keyOf(String url) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 12; i++) sb.append(String.format(Locale.ROOT, "%02x", d[i]));
            return sb.toString();
        } catch (Exception e) { return Integer.toHexString(url.hashCode()); }
    }

    private static String readText(File f) {
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            byte[] b = new byte[(int) Math.min(f.length(), 4096)];
            int n = in.read(b);
            return n > 0 ? new String(b, 0, n, "UTF-8") : "";
        } catch (Exception e) { return ""; }
    }

    private static void writeText(File f, String s) {
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(s.getBytes("UTF-8")); } catch (Exception ignored) { }
    }

    private static boolean startsWithPdf(File f) {
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            byte[] b = new byte[1024];
            int n = in.read(b);
            return n > 0 && new String(b, 0, n, "ISO-8859-1").contains("%PDF-");
        } catch (Exception e) { return false; }
    }

    private void cleanOldPartials(File partDir) {
        File[] list = partDir.listFiles();
        if (list == null) return;
        long now = System.currentTimeMillis();
        for (File f : list) if (now - f.lastModified() > 7L * 24 * 3600 * 1000) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    private void ui(String msg, int pct) {
        ui.post(() -> {
            status.setText(msg);
            if (pct >= 0) { bar.setIndeterminate(false); bar.setProgress(pct); } else bar.setIndeterminate(true);
        });
    }

    private void startDownload(String url, String guessed) {
        if (!downloading.compareAndSet(false, true)) { toast("Bir kitap zaten iniyor."); return; }
        cancelled = false;
        final String name = niceName(url, guessed);
        final String ua = web.getSettings().getUserAgentString();
        bar.setVisibility(View.VISIBLE);
        bar.setIndeterminate(true);
        cancel.setVisibility(View.VISIBLE);
        status.setText("İndiriliyor: " + name);

        new Thread(() -> {
            File dir = new File(getCacheDir(), "books");
            File partDir = new File(dir, "partial");
            //noinspection ResultOfMethodCallIgnored
            partDir.mkdirs();
            cleanOldPartials(partDir);
            String key = keyOf(url);
            File part = new File(partDir, key + ".part");
            File meta = new File(partDir, key + ".meta");
            String validator = meta.exists() ? readText(meta) : "";
            long total = -1;
            if (part.length() > 0 && !startsWithPdf(part)) { //noinspection ResultOfMethodCallIgnored
                part.delete(); validator = ""; }
            if (part.length() > 0) ui("Kaldığı yerden devam ediliyor: " + name + " (" + (part.length() / (1024 * 1024)) + " MB hazır)", -1);

            String error = null;
            boolean done = false;
            for (int attempt = 1; attempt <= MAX_TRIES && !done && !cancelled; attempt++) {
                HttpURLConnection c = null;
                try {
                    long have = part.length();
                    String current = url;
                    int code;
                    for (int hop = 0; ; hop++) {
                        if (hop > 5) throw new SecurityException("Çok fazla yönlendirme.");
                        if (!allowedHost(Uri.parse(current))) throw new SecurityException("Güvenilmeyen adres.");
                        c = (HttpsURLConnection) new URL(current).openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", ua);
                        c.setRequestProperty("Accept", "application/pdf,*/*;q=0.5");
                        c.setRequestProperty("Accept-Encoding", "identity");
                        String cookie = CookieManager.getInstance().getCookie(current);
                        if (cookie != null) c.setRequestProperty("Cookie", cookie);
                        if (have > 0) {
                            c.setRequestProperty("Range", "bytes=" + have + "-");
                            if (!validator.isEmpty()) c.setRequestProperty("If-Range", validator);
                        }
                        code = c.getResponseCode();
                        if (code >= 300 && code < 400) {
                            String loc = c.getHeaderField("Location");
                            c.disconnect();
                            if (loc == null) throw new SecurityException("Yönlendirme hatalı.");
                            current = new URL(new URL(current), loc).toString();
                            continue;
                        }
                        break;
                    }
                    boolean append;
                    if (code == 206 && have > 0) {
                        append = true;
                        String cr = c.getHeaderField("Content-Range"); // bytes 100-199/2000
                        if (cr != null && cr.contains("/")) {
                            try { total = Long.parseLong(cr.substring(cr.lastIndexOf('/') + 1).trim()); } catch (Exception ignored) { total = -1; }
                            String startStr = cr.replaceAll("^bytes\\s+(\\d+)-.*$", "$1");
                            if (!startStr.equals(String.valueOf(have))) { //noinspection ResultOfMethodCallIgnored
                                part.delete(); validator = ""; throw new java.io.IOException("aralık uyuşmadı"); }
                        }
                    } else if (code == 200) {
                        append = false; have = 0;
                        total = c.getContentLengthLong();
                    } else if (code == 416 && have > 0) {
                        // Elimizdeki parça zaten tam olabilir
                        total = have; done = true; break;
                    } else {
                        throw new SecurityException("Sunucu yanıtı: " + code);
                    }
                    if (total > MAX_BYTES) throw new SecurityException("Dosya çok büyük.");
                    String et = c.getHeaderField("ETag");
                    String lm = c.getHeaderField("Last-Modified");
                    String v = et != null && !et.startsWith("W/") ? et : (lm != null ? lm : "");
                    if (!append || validator.isEmpty()) { validator = v; writeText(meta, v); }

                    long got = have;
                    int lastPct = -1;
                    try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(part, append)) {
                        byte[] buf = new byte[64 * 1024];
                        int r;
                        boolean first = !append;
                        while ((r = in.read(buf)) != -1) {
                            if (cancelled) throw new java.io.InterruptedIOException("iptal");
                            if (first) {
                                String head = new String(buf, 0, Math.min(r, 1024), "ISO-8859-1");
                                if (!head.contains("%PDF-")) throw new SecurityException("İndirilen dosya PDF değil. Kitabın sayfasındaki “PDF” bağlantısını dene.");
                                first = false;
                            }
                            got += r;
                            if (got > MAX_BYTES) throw new SecurityException("Dosya çok büyük.");
                            fo.write(buf, 0, r);
                            if (total > 0) {
                                int pct = (int) (got * 100 / total);
                                if (pct != lastPct) { lastPct = pct; ui("İndiriliyor: " + name + " (%" + pct + ", " + (got / (1024 * 1024)) + " MB)", pct); }
                            }
                        }
                    }
                    if (total > 0 && part.length() < total) throw new java.io.IOException("eksik");
                    done = true;
                } catch (SecurityException e) {
                    error = e.getMessage(); //noinspection ResultOfMethodCallIgnored
                    part.delete(); //noinspection ResultOfMethodCallIgnored
                    meta.delete();
                    break;
                } catch (java.io.InterruptedIOException e) {
                    if (cancelled) break;
                    error = "Bağlantı zaman aşımına uğradı.";
                } catch (Exception e) {
                    error = "Bağlantı kesildi.";
                } finally {
                    if (c != null) c.disconnect();
                }
                if (!done && !cancelled && error != null && attempt < MAX_TRIES && !error.startsWith("Dosya") && !error.startsWith("İndirilen") && !error.startsWith("Sunucu") && !error.startsWith("Güvenilmeyen") && !error.startsWith("Çok") && !error.startsWith("Yönlendirme")) {
                    long wait = Math.min(20000, 2000L << (attempt - 1));
                    ui("Bağlantı kesildi. " + (part.length() / (1024 * 1024)) + " MB saklandı; " + (wait / 1000) + " sn sonra kaldığı yerden devam edilecek (" + attempt + "/" + (MAX_TRIES - 1) + ")", -1);
                    try { Thread.sleep(wait); } catch (InterruptedException ie) { break; }
                    error = null;
                } else if (error != null) {
                    break;
                }
            }

            if (done && part.length() >= 1024 && startsWithPdf(part)) {
                byte[] rnd = new byte[8];
                new SecureRandom().nextBytes(rnd);
                StringBuilder id = new StringBuilder("kitap_");
                for (byte b : rnd) id.append(String.format(Locale.ROOT, "%02x", b));
                File out = new File(dir, id + ".pdf");
                if (!part.renameTo(out)) { error = "Dosya kaydedilemedi."; }
                else {
                    //noinspection ResultOfMethodCallIgnored
                    meta.delete();
                    Intent res = new Intent();
                    res.putExtra(EXTRA_FILE, out.getName());
                    res.putExtra(EXTRA_NAME, name);
                    ui.post(() -> { setResult(RESULT_OK, res); finish(); });
                    downloading.set(false);
                    return;
                }
            }
            final String msg = cancelled
                    ? "İndirme duraklatıldı. " + (part.length() / (1024 * 1024)) + " MB saklandı; aynı kitaba tekrar dokununca kaldığı yerden devam eder."
                    : (error == null ? "Kitap indirilemedi." : error) + (part.length() > 0 ? " İnen kısım saklandı; tekrar dokununca kaldığı yerden devam eder." : "");
            ui.post(() -> { bar.setVisibility(View.GONE); cancel.setVisibility(View.GONE); status.setText(msg); });
            toast(msg);
            downloading.set(false);
        }, "sh-book").start();
    }

    @Override
    protected void onDestroy() {
        cancelled = true;
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
