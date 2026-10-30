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

**Sınav Hocası Plus (ödeme)**
- Plus kararı yalnızca sunucuda verilir. İstemcideki "Plus etkin" bilgisi sadece görüntü içindir; değiştirilmesi hiçbir şeyi açmaz (testlerle doğrulandı).
- Satın alma jetonu Google Play Developer API (subscriptionsv2) ile doğrulanır; sunucu satın almayı Google'a onaylar (acknowledge).
- Satın alma, ödeme sırasında verilen rastgele gizli hesap kimliğiyle (`obfuscatedAccountId`) eşleşmek zorundadır; bir jeton başka hesapta ya da sahte aile bağlantısıyla kullanılamaz.
- Etkin abonelik günde bir, süresi geçmiş abonelik en fazla 10 dakikada bir Google'a yeniden sorulur: iade/geri alma en geç 24 saatte işlenir, yenileme hemen açılır. Otomatik yenilemesi kapatılan abonelik ödenen dönem sonuna kadar geçerlidir.
- Yapay zekâ uçları yalnızca eşleşmiş ve Plus'lı ailenin jetonuyla çalışır, aile başına günlük kota vardır (anahtar kötüye kullanılamaz).
- İsteğe bağlı Play Integrity (Standard API): istek hash'i, paket adı, `PLAY_RECOGNIZED` ve `MEETS_DEVICE_INTEGRITY` sonuçları ve zaman damgası sunucuda kontrol edilir; değiştirilmiş APK ve root'lu cihazlar reddedilir.
- Ödeme köprüsü (Android) yalnızca Google'ın verdiği jetonu sayfaya taşır, karar vermez; teklif jetonu ve hesap kimliği biçim kontrolünden geçer.

**Sunucu (server/)**
- API anahtarı yalnızca Worker gizli değişkenindedir; uygulamada ya da repoda yoktur.
- Yalnızca izinli kökenlere CORS izni, IP başına hız sınırı, istek boyutu sınırı, JSON şeması zorlaması.
- Materyal ve cevap metinleri modele "veri" olarak işaretlenerek gönderilir (komut enjeksiyonuna karşı), model çıktısı araç şemasıyla zorlanır ve tekrar doğrulanır.
- İstek içerikleri kaydedilmez.

## Bilinen sınırlar
- Veli paneli PIN'i cihaz içi bir engeldir; telefonun kilidinin yerini tutmaz.
- Köken (Origin) kontrolü tarayıcılar için geçerlidir; ücretli uçlarda asıl koruma Plus ve kota kontrolüdür. `INTEGRITY=zorunlu` yapılınca yalnızca gerçek uygulama kabul edilir.
- Cihaz içi (ücretsiz) özellikler ve öğrencinin kendi telefonundaki veriler, root'lu bir cihazda sahibi tarafından değiştirilebilir (ör. ilerleme özeti). Bu, Plus'ı açmaz; yalnızca o cihazın kendi verisini etkiler.

## Bildirim
Bir güvenlik açığı bulursan lütfen herkese açık issue açmadan önce matali.truz@gmail.com adresine yaz.
