# Güvenlik

## Uygulanan önlemler

**Arayüz (app/)**
- Sıkı İçerik Güvenlik Politikası (CSP): yalnızca uygulamanın kendi betikleri, satır içi betik/stil yok, `eval` yok, çerçeve/form/eklenti yasak, ağ erişimi yalnızca kendi sunucusuna.
- Kullanıcıdan, dosyalardan ya da sunucudan gelen hiçbir metin HTML olarak yorumlanmaz (`innerHTML` kullanılmaz; yalnızca `textContent`). Bağlantı ve görsel adresleri izin listesinden geçer.
- Dosya türü uzantıya göre değil **dosyanın ilk baytlarına (imza)** göre doğrulanır; MIME türü ve uzantı içerikle çelişirse dosya reddedilir. SVG, HTML ve bilinmeyen türler kabul edilmez. Boyut ve adet sınırları vardır.
- `localStorage` ve yedek dosyasından okunan her veri şemaya göre temizlenir (tür, uzunluk, izinli değerler). Bozuk ya da kötü niyetli veri uygulamayı bozamaz.
- Veli PIN'i saklanmaz; rastgele tuzla PBKDF2-SHA256 (150.000 tur) özeti tutulur, sabit zamanlı karşılaştırılır. 5 yanlış denemeden sonra artan süreli kilit.
- Sunucu yanıtları boyut, tür ve şema bakımından doğrulanır; zaman aşımı vardır.
- Harici kütüphaneler (pdf.js, Tesseract) CDN'den değil, sabit sürümle derleme sırasında indirilip uygulamayla aynı yerden sunulur; `SHA256SUMS` kaydı tutulur.
- Başka bir sitenin çerçevesi içinde açılması engellenir.

**Android (android/)**
- Arayüz yalnızca uygulama içinden, `https://appassets.androidplatform.net` güvenli kökeninden yüklenir. Başka hiçbir adrese gidilemez; dış bağlantılar sistem tarayıcısında açılır.
- WebView'da dosya/içerik erişimi kapalı, karma içerik yasak, Safe Browsing açık, yalnızca HTTPS (ağ güvenlik yapılandırması, kullanıcı sertifikalarına güvenilmez).
- JavaScript köprüsünün her metodu çağrının uygulamanın kendi sayfasından geldiğini doğrular; girdiler boyut ve biçim bakımından sınırlanır.
- Kamera izni istenmez (sistem kamera uygulaması kullanılır); yalnızca İnternet izni vardır.
- MEB kitap tarayıcısına köprü verilmez; yalnızca `*.meb.gov.tr` / `*.eba.gov.tr` adreslerine HTTPS ile gidilir. İndirilen dosyanın PDF imzası ve boyutu doğrulanır, yönlendirmeler de izin listesinden geçer. Dosya adları rastgele üretilir ve yalnızca güvenli adla okunabilir.
- Sürüm derlemesinde R8 küçültme/karartma açıktır; hata ayıklama yalnızca test sürümünde açılır.

**Sunucu (server/)**
- API anahtarı yalnızca Worker gizli değişkenindedir; uygulamada ya da repoda yoktur.
- Yalnızca izinli kökenlere CORS izni, IP başına hız sınırı, istek boyutu sınırı, JSON şeması zorlaması.
- Materyal ve cevap metinleri modele "veri" olarak işaretlenerek gönderilir (komut enjeksiyonuna karşı), model çıktısı araç şemasıyla zorlanır ve tekrar doğrulanır.
- İstek içerikleri kaydedilmez.

## Bilinen sınırlar
- Veli paneli PIN'i cihaz içi bir engeldir; telefonun kilidinin yerini tutmaz.
- Köken (Origin) kontrolü tarayıcılar için geçerlidir; sunucu kötüye kullanımına karşı asıl koruma hız sınırıdır. Daha sıkı koruma için Play Integrity doğrulaması eklenebilir.

## Bildirim
Bir güvenlik açığı bulursan lütfen herkese açık issue açmadan önce matali.truz@gmail.com adresine yaz.
