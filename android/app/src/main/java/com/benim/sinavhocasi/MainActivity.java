package com.benim.sinavhocasi;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Sınav Hocası ana ekranı.
 * Web arayüzü uygulamanın içinden, güvenli https://appassets.androidplatform.net kökeninden yüklenir.
 * Yalnızca bu köken çalışabilir; dış bağlantılar sistem tarayıcısında açılır.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/assets/index.html";
    static final Pattern SAFE_FILE = Pattern.compile("^[a-z0-9_-]{1,64}\\.pdf$");

    private static final int REQ_FILES = 11;
    private static final int REQ_CAMERA = 12;
    private static final int REQ_BOOKS = 13;
    private static final int REQ_SAVE = 14;
    private static final int MAX_OCR_B64 = 16 * 1024 * 1024;

    private WebView web;
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private File cameraFile;
    private String pendingSave;
    private String pendingBookJs;
    private volatile boolean pageReady = false;
    private volatile String currentUrl = "";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextRecognizer recognizer;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int bg = night ? Color.rgb(5, 11, 26) : Color.rgb(243, 246, 251);

        root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyInsets();
        setBarsDark(night);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/downloads/", path -> {
                    // Kitap tarayıcısının indirdiği PDF'ler, yalnızca güvenli adla ve önbellek klasöründen
                    if (!SAFE_FILE.matcher(path).matches()) return null;
                    File f = new File(new File(getCacheDir(), "books"), path);
                    try {
                        if (!f.exists()) return null;
                        return new WebResourceResponse("application/pdf", null, new FileInputStream(f));
                    } catch (Exception e) { return null; }
                })
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost()) && "https".equals(u.getScheme())) return false;
                if ("https".equals(u.getScheme())) openExternal(u.toString());
                return true; // başka hiçbir yere gidilmez
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                currentUrl = url == null ? "" : url;
                pageReady = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                currentUrl = url == null ? "" : url;
                pageReady = true;
                if (pendingBookJs != null) {
                    String js = pendingBookJs;
                    pendingBookJs = null;
                    web.evaluateJavascript(js, null);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                return openChooser(params);
            }
        });

        web.addJavascriptInterface(new Bridge(), "SHNative");

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        if (web.getUrl() == null) web.loadUrl(START_URL);
    }

    private void applyInsets() {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                l = bars.left; t = bars.top; r = bars.right; b = Math.max(bars.bottom, ime.bottom);
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @SuppressWarnings("deprecation")
    private void setBarsDark(boolean dark) {
        int bg = dark ? Color.rgb(5, 11, 26) : Color.rgb(243, 246, 251);
        root.setBackgroundColor(bg);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? Color.TRANSPARENT : Color.BLACK);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        } else if (Build.VERSION.SDK_INT >= 23) {
            int f = root.getSystemUiVisibility();
            if (dark) f &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) {
                if (dark) f &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR; else f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            root.setSystemUiVisibility(f);
        }
    }

    private void handleBack() {
        if (web != null && web.canGoBack()) web.goBack();
        else finish();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT >= 33) { handleBack(); return; }
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ------------------------------------------------------------------
    // Dosya seçici: kamera, galeri, PDF
    // ------------------------------------------------------------------
    private boolean openChooser(WebChromeClient.FileChooserParams params) {
        String[] accept = params.getAcceptTypes();
        boolean wantsImage = false, wantsPdf = false, wantsJson = false;
        for (String a : accept) {
            if (a == null) continue;
            String x = a.trim().toLowerCase();
            if (x.startsWith("image/")) wantsImage = true;
            if (x.contains("pdf")) wantsPdf = true;
            if (x.contains("json")) wantsJson = true;
        }
        boolean multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;

        if (params.isCaptureEnabled() && wantsImage) {
            try {
                File dir = new File(getCacheDir(), "camera");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("klasör");
                cameraFile = new File(dir, "sayfa_" + System.currentTimeMillis() + ".jpg");
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", cameraFile);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                cam.setClipData(ClipData.newRawUri("", cameraUri));
                startActivityForResult(cam, REQ_CAMERA);
                return true;
            } catch (ActivityNotFoundException e) {
                toast("Bu telefonda kamera uygulaması bulunamadı. Galeriden seçebilirsin.");
            } catch (Exception e) {
                toast("Kamera açılamadı. Galeriden seçebilirsin.");
            }
            // kamera yoksa galeriye düş
        }

        Intent pick;
        if (wantsImage && !wantsPdf && Build.VERSION.SDK_INT >= 33) {
            pick = new Intent(MediaStore.ACTION_PICK_IMAGES);
            pick.setType("image/*");
            if (multiple) pick.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(MediaStore.getPickImagesMaxLimit(), 30));
        } else {
            pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (wantsPdf) { pick.setType("application/pdf"); }
            else if (wantsJson) { pick.setType("*/*"); pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"}); }
            else { pick.setType("image/*"); }
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        }
        try {
            startActivityForResult(pick, REQ_FILES);
            return true;
        } catch (ActivityNotFoundException e) {
            try {
                Intent fb = new Intent(Intent.ACTION_GET_CONTENT);
                fb.addCategory(Intent.CATEGORY_OPENABLE);
                fb.setType(wantsPdf ? "application/pdf" : wantsImage ? "image/*" : "*/*");
                fb.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
                startActivityForResult(fb, REQ_FILES);
                return true;
            } catch (ActivityNotFoundException e2) {
                toast("Dosya seçici açılamadı.");
                fileCallback.onReceiveValue(null);
                fileCallback = null;
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILES || requestCode == REQ_CAMERA) {
            if (fileCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (requestCode == REQ_CAMERA) {
                    if (cameraFile != null && cameraFile.exists() && cameraFile.length() > 0) result = new Uri[]{cameraUri};
                } else if (data != null) {
                    List<Uri> uris = new ArrayList<>();
                    ClipData clip = data.getClipData();
                    if (clip != null) for (int i = 0; i < clip.getItemCount() && i < 50; i++) uris.add(clip.getItemAt(i).getUri());
                    else if (data.getData() != null) uris.add(data.getData());
                    if (!uris.isEmpty()) result = uris.toArray(new Uri[0]);
                }
            }
            fileCallback.onReceiveValue(result); // iptalde null: sayfa bozulmaz
            fileCallback = null;
        } else if (requestCode == REQ_BOOKS) {
            if (resultCode == RESULT_OK && data != null) {
                String file = data.getStringExtra(BookBrowserActivity.EXTRA_FILE);
                String name = data.getStringExtra(BookBrowserActivity.EXTRA_NAME);
                if (file != null && SAFE_FILE.matcher(file).matches()) {
                    try {
                        JSONObject o = new JSONObject();
                        o.put("file", file);
                        o.put("name", name == null ? "MEB ders kitabı" : name);
                        String js = "window.SHBridge&&window.SHBridge.onBookDownloaded(" + JSONObject.quote(o.toString()) + ")";
                        if (pageReady) web.evaluateJavascript(js, null); else pendingBookJs = js;
                    } catch (Exception ignored) { }
                }
            }
        } else if (requestCode == REQ_SAVE) {
            String content = pendingSave;
            pendingSave = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && content != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os == null) throw new IllegalStateException();
                    os.write(content.getBytes(StandardCharsets.UTF_8));
                    toast("Yedek kaydedildi.");
                } catch (Exception e) { toast("Yedek kaydedilemedi."); }
            }
        }
    }

    // ------------------------------------------------------------------
    // Yardımcılar
    // ------------------------------------------------------------------
    private void toast(String msg) { ui.post(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show()); }

    private void openExternal(String url) {
        try {
            Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme())) return;
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) { toast("Bağlantı açılamadı."); }
    }

    private boolean fromOurPage() {
        String u = currentUrl;
        return u != null && u.startsWith("https://" + HOST + "/");
    }

    private void resolveJs(String id, JSONObject payload) {
        String js = "window.SHBridge&&window.SHBridge.resolve(" + JSONObject.quote(id) + "," + JSONObject.quote(payload.toString()) + ")";
        ui.post(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private static JSONObject fail(String msg) {
        JSONObject o = new JSONObject();
        try { o.put("ok", false); o.put("error", msg); } catch (Exception ignored) { }
        return o;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) { recognizer.close(); recognizer = null; }
        if (web != null) {
            web.removeJavascriptInterface("SHNative");
            root.removeView(web);
            web.destroy();
            web = null;
        }
        // Kamera geçici dosyalarını temizle
        File cam = new File(getCacheDir(), "camera");
        File[] list = cam.listFiles();
        if (list != null) for (File f : list) if (System.currentTimeMillis() - f.lastModified() > 3600_000L) //noinspection ResultOfMethodCallIgnored
            f.delete();
        super.onDestroy();
    }

    // ------------------------------------------------------------------
    // JavaScript köprüsü — yalnızca uygulamanın kendi sayfasına hizmet verir
    // ------------------------------------------------------------------
    final class Bridge {

        @JavascriptInterface
        public String info() {
            JSONObject o = new JSONObject();
            try {
                o.put("version", BuildConfig.VERSION_NAME);
                o.put("ocr", true);
                o.put("books", true);
                o.put("shareImage", true);
            } catch (Exception ignored) { }
            return o.toString();
        }

        @JavascriptInterface
        public void ocr(String id, String b64) {
            if (!fromOurPage() || id == null || id.length() > 40) return;
            if (b64 == null || b64.length() > MAX_OCR_B64) { resolveJs(id, fail("Görsel çok büyük.")); return; }
            new Thread(() -> {
                try {
                    byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                    BitmapFactory.Options opt = new BitmapFactory.Options();
                    opt.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opt);
                    if (opt.outWidth <= 0 || opt.outHeight <= 0) { resolveJs(id, fail("Görsel okunamadı.")); return; }
                    int sample = 1;
                    while (opt.outWidth / sample > 3000 || opt.outHeight / sample > 3000) sample *= 2;
                    BitmapFactory.Options real = new BitmapFactory.Options();
                    real.inSampleSize = sample;
                    Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, real);
                    if (bmp == null) { resolveJs(id, fail("Görsel okunamadı.")); return; }
                    synchronized (MainActivity.this) {
                        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                    }
                    recognizer.process(InputImage.fromBitmap(bmp, 0))
                            .addOnSuccessListener(result -> {
                                JSONObject o = new JSONObject();
                                try { o.put("ok", true); o.put("text", result.getText()); } catch (Exception ignored) { }
                                resolveJs(id, o);
                                bmp.recycle();
                            })
                            .addOnFailureListener(e -> { resolveJs(id, fail("Metin tanınamadı.")); bmp.recycle(); });
                } catch (OutOfMemoryError e) {
                    resolveJs(id, fail("Görsel bu cihaz için çok büyük."));
                } catch (Exception e) {
                    resolveJs(id, fail("Metin tanınamadı."));
                }
            }, "sh-ocr").start();
        }

        @JavascriptInterface
        public void openBookStore() {
            if (!fromOurPage()) return;
            ui.post(() -> {
                try { startActivityForResult(new Intent(MainActivity.this, BookBrowserActivity.class), REQ_BOOKS); }
                catch (Exception e) { toast("Kitap sitesi açılamadı."); }
            });
        }

        @JavascriptInterface
        public void releaseDownload(String name) {
            if (!fromOurPage() || name == null || !SAFE_FILE.matcher(name).matches()) return;
            File f = new File(new File(getCacheDir(), "books"), name);
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }

        @JavascriptInterface
        public void share(String text) {
            if (!fromOurPage() || text == null) return;
            String t = text.length() > 8000 ? text.substring(0, 8000) : text;
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, t);
                try { startActivity(Intent.createChooser(i, "Raporu paylaş")); } catch (Exception e) { toast("Paylaşılamadı."); }
            });
        }

        @JavascriptInterface
        public void shareImage(String b64png, String text) {
            if (!fromOurPage() || b64png == null || b64png.length() > 12 * 1024 * 1024) return;
            final String t = text == null ? "" : (text.length() > 8000 ? text.substring(0, 8000) : text);
            new Thread(() -> {
                try {
                    byte[] png = Base64.decode(b64png, Base64.DEFAULT);
                    // Yalnızca PNG imzası taşıyan veri yazılır
                    if (png.length < 8 || (png[0] & 0xFF) != 0x89 || png[1] != 'P' || png[2] != 'N' || png[3] != 'G') { toast("Görsel hazırlanamadı."); return; }
                    File dir = new File(getCacheDir(), "share");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File f = new File(dir, "sinav-hocasi.png");
                    try (java.io.FileOutputStream fo = new java.io.FileOutputStream(f)) { fo.write(png); }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                    ui.post(() -> {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType("image/png");
                        i.putExtra(Intent.EXTRA_STREAM, uri);
                        i.putExtra(Intent.EXTRA_TEXT, t);
                        i.setClipData(ClipData.newRawUri("", uri));
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try { startActivity(Intent.createChooser(i, "Paylaş")); } catch (Exception e) { toast("Paylaşılamadı."); }
                    });
                } catch (Exception e) { toast("Paylaşılamadı."); }
            }, "sh-share").start();
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (!fromOurPage() || url == null || !url.startsWith("https://")) return;
            ui.post(() -> MainActivity.this.openExternal(url));
        }

        @JavascriptInterface
        public void setTheme(boolean dark) {
            if (!fromOurPage()) return;
            ui.post(() -> setBarsDark(dark));
        }

        @JavascriptInterface
        public void setColors(boolean dark, String hex) {
            if (!fromOurPage()) return;
            final int color;
            try { color = (hex != null && hex.matches("^#[0-9a-fA-F]{6}$")) ? Color.parseColor(hex) : (dark ? Color.rgb(6, 18, 41) : Color.rgb(230, 242, 254)); }
            catch (Exception e) { return; }
            ui.post(() -> { setBarsDark(dark); root.setBackgroundColor(color); if (web != null) web.setBackgroundColor(color); });
        }

        @JavascriptInterface
        public void saveFile(String name, String content) {
            if (!fromOurPage() || name == null || content == null || content.length() > 40 * 1024 * 1024) return;
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (safe.length() > 80) safe = safe.substring(0, 80);
            final String fname = safe;
            ui.post(() -> {
                pendingSave = content;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, fname);
                try { startActivityForResult(i, REQ_SAVE); } catch (Exception e) { pendingSave = null; toast("Kaydetme ekranı açılamadı."); }
            });
        }
    }
}
