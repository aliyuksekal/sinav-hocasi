# JavaScript köprüsü metotları korunur
-keepclassmembers class com.benim.sinavhocasi.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
