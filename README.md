<p align="center"><img src="app/icons/icon-192.png" width="120" alt="Sınav Hocası"></p>

# Sınav Hocası

Öğrencinin **kendi ders kitabından** soru üreten, cevaplarını **kendi cümleleriyle** yazmasını isteyip değerlendiren ve veliye anlaşılır çalışma raporu sunan Android uygulaması (ve web sürümü).

## Neler yapar?

| Özellik | Nasıl çalışır |
|---|---|
| Kitap sayfası ekleme | Kamera ile çek, galeriden çoklu seç, birden fazla PDF ekle ya da metin yapıştır |
| **MEB ders kitabı indirme** | Android uygulamasında resmî site (tymm.meb.gov.tr) uygulamanın içinde açılır; PDF'e dokununca kitap doğrudan materyallere eklenir |
| Metne dönüştürme | Fotoğraflar cihazda, **internetsiz** tanınır (Google ML Kit). PDF yazısı doğrudan okunur, taranmış sayfalar otomatik tanınır. Sayfa aralığı seçilebilir |
| Soru üretme | İnternet gerekmez: metindeki tanım, neden-sonuç, sıralama, tarih/sayı ve önemli bilgilerden açık uçlu sorular. Sunucu bağlıysa yapay zekâ ile daha zengin sorular |
| Değerlendirme | Kavram kapsamı + anlam benzerliği (Türkçe ek ve ünsüz yumuşaması toleranslı), olumsuzluk kontrolü, ezber uyarısı. Sunucu bağlıysa yapay zekâ cevabın anlamını değerlendirir |
| Geri bildirim | Puan, "Neyi doğru yaptın?", "Neyi geliştirebilirsin?", örnek açıklama, ipucu, tekrar deneme |
| İlerleme | Haftalık çalışma günleri, seri, başarı eğilimi grafiği, ders ortalamaları, zorlanılan konular, geçmiş |
| Veli paneli | PIN korumalı (PBKDF2, deneme kilidi). Süre, ders, başarı, tekrar önerileri, rapor paylaşma. Öğrencinin cevap metinlerini göstermez |
| Görünüm | Açık / koyu / otomatik tema, büyük yazı seçeneği, ekran okuyucu etiketleri |
| Veri | Her şey cihazda. Yedek indir / yükle, tek dokunuşla tümünü sil |

## Telefona kurulum

1. Repo'da **Releases** (Sürümler) bölümüne gir.
2. En üstteki sürümdeki `SinavHocasi-…apk` dosyasına dokunup indir.
3. Dosyayı aç → "Bilinmeyen kaynaklara izin ver" sorulursa izin ver → **Yükle**.

Her `main` güncellemesinde GitHub Actions yeni APK'yı otomatik derleyip yayımlar.

### Google Play için imzalı sürüm

Repo → Settings → Secrets and variables → Actions bölümüne şu 4 gizli değeri ekle; sonraki derlemede imzalı **APK + AAB** üretilir:

| Ad | Değer |
|---|---|
| `KEYSTORE_BASE64` | `.jks` imza dosyasının base64 hali |
| `KEYSTORE_PASSWORD` | Anahtar deposu şifresi |
| `KEY_ALIAS` | Anahtar adı |
| `KEY_PASSWORD` | Anahtar şifresi |

Paket adı: `com.benim.sinavhocasi` (test sürümü `com.benim.sinavhocasi.test` olarak ayrı kurulur).

## Web sürümü

`app/` klasörü GitHub Pages ile yayımlanır: **https://aliyuksekal.github.io/sinav-hocasi/**
(Repo → Settings → Pages → Source: **GitHub Actions** seçili olmalı.) Web sürümü ana ekrana eklenebilir (PWA) ve çevrimdışı açılır; kitabı doğrudan indiremez, PDF'i elle eklersin.

## Yapay zekâ sunucusu (isteğe bağlı)

Uygulama sunucusuz tam çalışır. Daha akıllı soru ve değerlendirme için `server/` klasöründeki Cloudflare Worker yayımlanır:

```bash
cd server
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
```

Adres `https://sinav-hocasi.aliyuksekal.workers.dev` olur; uygulama bunu kendisi algılar (Ayarlar → Özellik durumu → "Bağlı"). Anahtar yalnızca sunucuda durur.

## Proje yapısı

```
app/                 Arayüz (HTML/CSS/JS) — hem Android'in içine gömülür hem web'de yayımlanır
  js/engine.js       Türkçe soru üretme ve cevap değerlendirme motoru (internetsiz)
  js/app.js          Uygulama: depolama, içe aktarma, metin tanıma, sınav akışı, ilerleme, veli paneli
android/             Yerel Android kabuğu (Java): güvenli WebView, kamera, ML Kit metin tanıma, MEB kitap indirici
server/              Cloudflare Worker: yapay zekâ uç noktaları
scripts/             pdf.js ve Tesseract'ı sabit sürümle indiren betik
.github/workflows/   APK/AAB derleme ve web yayını
```

## Güvenlik

Ayrıntılar için [SECURITY.md](SECURITY.md).

Geliştirici: **matali** · matali.truz@gmail.com
