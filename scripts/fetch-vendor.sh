#!/usr/bin/env bash
# PDF okuyucu (pdf.js) ve tarayıcı içi metin tanıma (Tesseract) kütüphanelerini
# sabit sürümlerle npm'den indirip app/vendor/ altına kopyalar.
# Dosyalar uygulamayla aynı yerden sunulur; dışarıdaki bir CDN'e güvenilmez.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/app/vendor"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PDFJS="3.11.174"
TESS="5.1.1"
TESS_CORE="5.1.1"
TESS_TUR="1.0.0"

cd "$WORK"
npm init -y >/dev/null
npm install --no-audit --no-fund --ignore-scripts --loglevel=error \
  "pdfjs-dist@$PDFJS" "tesseract.js@$TESS" "tesseract.js-core@$TESS_CORE" "@tesseract.js-data/tur@$TESS_TUR"

rm -rf "$OUT"
mkdir -p "$OUT/pdfjs" "$OUT/tesseract/core" "$OUT/tesseract/lang"

need() { [ -s "$1" ] || { echo "Eksik dosya: $1" >&2; exit 1; }; }

need node_modules/pdfjs-dist/build/pdf.min.js
need node_modules/pdfjs-dist/build/pdf.worker.min.js
cp node_modules/pdfjs-dist/build/pdf.min.js node_modules/pdfjs-dist/build/pdf.worker.min.js "$OUT/pdfjs/"
cp node_modules/pdfjs-dist/LICENSE "$OUT/pdfjs/LICENSE" 2>/dev/null || true

need node_modules/tesseract.js/dist/tesseract.min.js
need node_modules/tesseract.js/dist/worker.min.js
cp node_modules/tesseract.js/dist/tesseract.min.js node_modules/tesseract.js/dist/worker.min.js "$OUT/tesseract/"
cp node_modules/tesseract.js/LICENSE.md "$OUT/tesseract/LICENSE.md" 2>/dev/null || true

cp node_modules/tesseract.js-core/tesseract-core*.js "$OUT/tesseract/core/"
cp node_modules/tesseract.js-core/tesseract-core*.wasm "$OUT/tesseract/core/" 2>/dev/null || true
ls "$OUT/tesseract/core/" | grep -q 'lstm' || { echo "Tesseract çekirdeği bulunamadı" >&2; exit 1; }

TUR="$(find node_modules/@tesseract.js-data/tur -name 'tur.traineddata.gz' | grep -m1 best_int || find node_modules/@tesseract.js-data/tur -name 'tur.traineddata.gz' | head -n1)"
need "$TUR"
cp "$TUR" "$OUT/tesseract/lang/tur.traineddata.gz"

# Bütünlük kaydı
( cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )
echo "Kütüphaneler hazır:"
du -sh "$OUT"/*
