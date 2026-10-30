/*
 * Sınav Hocası — yerel metin motoru
 * İnternet ya da sunucu olmadan çalışır:
 *  - Türkçe metni temizler, cümlelere ayırır
 *  - Cümlelerden farklı türde sorular üretir (tanım, neden-sonuç, sıralama, boşluk doldurma, açıklama)
 *  - Öğrencinin kendi cümleleriyle verdiği cevabı kavram kapsamı + anlam benzerliği ile puanlar
 * Bu motor yaklaşık çalışır; sunucu bağlıysa yapay zekâ değerlendirmesi tercih edilir.
 */
(function (root) {
  'use strict';

  const STOP = new Set((
    've veya ile bir bu şu o da de ki mi mı mu mü için gibi daha çok en ise ama fakat ancak olarak olan olur oldu ' +
    'olduğu olduğunu olduğundan kadar her hem ne nasıl neden niçin yani sonra önce göre kendi biz siz onlar ben sen ' +
    'bunun bunu buna bunlar bunların bundan şey var yok değil diğer ayrıca aynı tüm bütün bazı birçok eden eder ' +
    'ederek edilir edilen yapılır yapılan olmak etmek ya hep artık iki üç dört beş on yüz bin ilk son ise yine ' +
    'veya ya da hangi hangisi kim kime neler nedir nelerdir midir mıdır şöyle böyle şekilde şekil durum ' +
    'çeşitli farklı önemli birlikte arasında üzerinde içinde içerisinde tarafından olarak sahip sağlar olur ' +
    'bulunur bulunan vardır yoktur dır dir dur dür tır tir tur tür olabilir olmaktadır gelir gelen gerekir ' +
    'denir denilir verilir adı adlandırılır tanımlanır ifade eder kendi kendine onun ona onu ondan onların ' +
    'şunlar şunu böylece dolayı çünkü nedeniyle sebebiyle sayesinde yüzünden ayrı her biri biri birbirine ' +
    'bize size bana sana az fazla pek kez defa zaman zamanda sırasında örneğin mesela yaklaşık bile sadece yalnızca'
  ).split(/\s+/));

  const NEG_RE = /\b(değil|değildir|yok|yoktur|olmaz|olmamak|asla|hiçbir|hiç)\b|m[ae]z(?:l[ae]r)?\b/;
  const CAUSE_RE = /\s(çünkü|bu nedenle|bu yüzden|bundan dolayı|bu sebeple|bu sayede|dolayısıyla)\s/i;
  const POST_CAUSE_RE = /((?:[^\s,;:]+\s+){0,3}[^\s,;:]+)\s+(sayesinde|nedeniyle|sebebiyle|yüzünden|için)\b/i;
  const VERBISH_RE = /(arak|erek|ınca|ince|unca|ünce|ken|mak|mek|maz|mez|yor|acak|ecek|dı|di|du|dü|tı|ti|tu|tü|mış|miş|muş|müş|ır|ir|ur|ür|[dt][ıiuü]k(l[ae]r[ıi]?|[ıiuü])?|[dt][ıiuü]ğ[ıiuü](n[dt][ae]n?)?|[ae]n|[ıi]rse|[ae]rse)$/;
  const DEF_RE = /^(.{6,220}?)\s+([^\s,;:]+(?:\s+[^\s,;:]+)?)\s+(denir|denilir|adı verilir|ad verilir|olarak adlandırılır|olarak tanımlanır|olarak bilinir)\s*[.!]?$/i;
  const COPULA_DEF_RE = /^([A-ZÇĞİÖŞÜ][^,;:]{2,40}),\s+(.{15,240}?)(dır|dir|dur|dür|tır|tir|tur|tür)\.?$/;
  const LIST_RE = /(şunlardır|faktörler|faktörleri|aşamaları|evreleri|çeşitleri|türleri|özellikleri|görevleri|bölümleri|katmanları|unsurları|öğeleri|ilkeleri|nedenleri|sonuçları|etkileri|yararları|zararları|kuralları)\b/i;
  const NUM_RE = /\b(1[0-9]{3}|20[0-9]{2})\b|\b\d+(?:[.,]\d+)?\s?(?:%|km|m|cm|mm|kg|g|°C|derece|yıl|yüzyıl|milyon|bin)\b/;

  const lower = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

  function normalize(s) {
    return lower(s)
      .replace(/[âà]/g, 'a').replace(/[îì]/g, 'i').replace(/[ûù]/g, 'u')
      .replace(/[’'`´]/g, "'")
      .replace(/[^a-zçğıöşü0-9'\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(s) {
    return normalize(s).split(' ').map((t) => t.replace(/'.*$/, '')).filter((t) => t.length > 1);
  }

  function contentTokens(s) {
    return tokens(s).filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
  }

  // Türkçe sondan eklemeli bir dil: kelimenin baş kısmı çoğu zaman kökü taşır.
  function stem(t) {
    if (t.length <= 5) return t;
    if (t.length <= 7) return t.slice(0, 5);
    return t.slice(0, 6);
  }

  function trigrams(t) {
    const s = '  ' + t + ' ';
    const out = new Set();
    for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
    return out;
  }

  function dice(a, b) {
    const A = trigrams(a), B = trigrams(b);
    let n = 0;
    A.forEach((g) => { if (B.has(g)) n++; });
    return (2 * n) / (A.size + B.size);
  }

  // Ünsüz yumuşaması (ışık → ışığı, kitap → kitabı) karşılaştırmayı bozmasın
  const canon = (t) => t.replace(/ğ/g, 'k').replace(/b/g, 'p').replace(/d/g, 't').replace(/c/g, 'ç');

  // İki kelimenin aynı kavrama işaret etme olasılığı (0..1)
  function wordSim(a, b) {
    if (a === b) return 1;
    a = canon(a); b = canon(b);
    if (a === b) return 0.97;
    let cp = 0;
    const m = Math.min(a.length, b.length);
    while (cp < m && a[cp] === b[cp]) cp++;
    if (cp >= 5 || (cp >= 4 && m <= 5) || (cp === m && m >= 3)) return 0.92;
    const d = dice(a, b);
    return d >= 0.55 ? d : 0;
  }

  // ---------- Metin hazırlama ----------
  function cleanText(raw) {
    let s = String(raw || '').replace(/\r/g, '');
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
    s = s.replace(/(\p{L})-\n(\p{L})/gu, '$1$2'); // satır sonu tirelemesi
    s = s.replace(/[ \t]+/g, ' ');
    return s.trim();
  }

  // Satırları paragraflara ve başlıklara ayırır
  function splitBlocks(text) {
    const lines = cleanText(text).split('\n').map((l) => l.trim());
    const blocks = [];
    let buf = [];
    let heading = '';
    const flush = () => {
      if (buf.length) blocks.push({ heading, text: buf.join(' ') });
      buf = [];
    };
    for (const l of lines) {
      if (!l) { flush(); continue; }
      const isHeading = l.length <= 70 && !/[.!?:;,]$/.test(l) && /^[\p{Lu}0-9]/u.test(l) &&
        l.split(' ').length <= 9 && !/^\d+$/.test(l);
      if (isHeading && (buf.length === 0 || /[.!?]$/.test(buf[buf.length - 1]))) {
        flush();
        heading = l.replace(/^\d+(\.\d+)*\s*[-.)]?\s*/, '').trim() || heading;
      } else {
        buf.push(l);
      }
    }
    flush();
    return blocks;
  }

  function splitSentences(paragraph) {
    const protectedAbbr = paragraph.replace(/\b(vb|vs|örn|bkz|yy|sf|Dr|Prof|Doç|Av|Alm|İng|Fr|Lat|No)\./g, '$1․');
    return protectedAbbr
      .split(/(?<=[.!?…])\s+(?=["“'(]?[\p{Lu}0-9])/u)
      .map((s) => s.replace(/․/g, '.').trim())
      .filter(Boolean);
  }

  function analyze(text) {
    const blocks = splitBlocks(text);
    const sents = [];
    blocks.forEach((b) => {
      splitSentences(b.text).forEach((s) => sents.push({ text: s, heading: b.heading, idx: sents.length }));
    });
    const df = new Map();
    sents.forEach((s) => {
      s.toks = contentTokens(s.text);
      s.stems = s.toks.map(stem);
      new Set(s.stems).forEach((st) => df.set(st, (df.get(st) || 0) + 1));
    });
    const tf = new Map();
    sents.forEach((s) => s.stems.forEach((st) => tf.set(st, (tf.get(st) || 0) + 1)));
    const N = Math.max(1, sents.length);
    const weight = (st) => {
      const f = tf.get(st) || 0;
      const d = df.get(st) || 1;
      return Math.log(1 + f) * (0.6 + Math.log((N + 1) / d));
    };
    sents.forEach((s) => {
      const uniq = Array.from(new Set(s.stems));
      const w = uniq.reduce((a, st) => a + weight(st), 0);
      s.score = uniq.length ? w / Math.sqrt(uniq.length + 2) : 0;
    });
    return { sents, blocks, weight, tf };
  }

  function usable(s) {
    const len = s.text.length;
    if (len < 35 || len > 320) return false;
    if (s.toks.length < 4) return false;
    if (/^(şekil|tablo|görsel|resim|etkinlik|soru|cevap|sayfa)\b/i.test(s.text)) return false;
    if (/\?$/.test(s.text)) return false;
    const letters = (s.text.match(/\p{L}/gu) || []).length;
    return letters / len > 0.6;
  }

  // Bir cümlenin en anlamlı kelimeleri (yüzey biçimiyle)
  function keyTerms(sentenceText, weight, excludeStems, max) {
    const seen = new Set();
    const out = [];
    contentTokens(sentenceText).forEach((t) => {
      const st = stem(t);
      if (seen.has(st) || (excludeStems && excludeStems.has(st))) return;
      seen.add(st);
      const verbish = VERBISH_RE.test(t) && t.length > 5 ? 0.45 : 1;
      out.push({ word: t, stem: st, w: (weight(st) + Math.min(t.length, 10) * 0.05) * verbish });
    });
    out.sort((a, b) => b.w - a.w);
    return out.slice(0, max).map((k) => k.word);
  }

  // Ekli kelimenin metindeki en yalın biçimini bulmaya çalışır (kloroplastlarda → kloroplast)
  function lemma(word, allToks) {
    const st = stem(word);
    let best = word;
    allToks.forEach((t) => { if (t.length >= 4 && t.length < best.length && stem(t) === st && word.startsWith(t.slice(0, Math.max(4, t.length - 1)))) best = t; });
    if (best === word) {
      const m = word.match(/^(.{4,}?)(larından|lerinden|larında|lerinde|lardan|lerden|larda|lerde|ları|leri|lar|ler|ndan|nden|nda|nde|dan|den|tan|ten|da|de|ta|te|nın|nin|nun|nün|ın|in|un|ün|ını|ini|unu|ünü|yı|yi|yu|yü|ya|ye|na|ne|sı|si|su|sü)$/);
      if (m && m[1].length >= 4) best = m[1].replace(/ğ$/, 'k');
    }
    return best;
  }

  function cap(s) {
    s = s.trim();
    return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s;
  }

  function cleanTerm(t) {
    return t.replace(/["“”'’]/g, '').replace(/['’](n?[ıiuü]n|[ae]|y[ae]|d[ae]|t[ae]|d[ae]n|t[ae]n)$/i, '').trim();
  }

  // ---------- Soru üretimi ----------
  function generate(text, opts) {
    opts = opts || {};
    const count = Math.max(1, Math.min(30, opts.count || 10));
    const level = opts.level || 'orta';
    const nKeys = level === 'kolay' ? 3 : level === 'zor' ? 6 : 4;
    const A = analyze(text);
    const cands = [];
    const allToks = [];
    A.sents.forEach((x) => x.toks.forEach((tk) => allToks.push(tk)));
    A.sents.filter(usable).forEach((s) => {
      const t = s.text.replace(/\s+/g, ' ').trim();
      let m;
      if ((m = t.match(DEF_RE))) {
        let term = cleanTerm(m[2]);
        const parts = term.split(' ');
        if (parts.length === 2 && (STOP.has(lower(parts[0])) || /(e|a|ye|ya|ne|na|i|ı|u|ü|in|ın|un|ün|den|dan)$/i.test(parts[0]))) term = parts[1];
        if (term.length >= 3 && !STOP.has(lower(term))) {
          const ex = new Set(contentTokens(term).map(stem));
          cands.push({ s, type: 'tanim', bonus: 3, q: '«' + cap(term) + '» nedir? Kendi cümlelerinle açıkla.', ref: t, keys: keyTerms(m[1], A.weight, ex, nKeys) });
          return;
        }
      }
      if ((m = t.match(COPULA_DEF_RE)) && m[1].split(' ').length <= 4) {
        const term = cleanTerm(m[1]);
        const ex = new Set(contentTokens(term).map(stem));
        cands.push({ s, type: 'tanim', bonus: 2.2, q: '«' + term + '» nedir? Açıkla.', ref: t, keys: keyTerms(m[2], A.weight, ex, nKeys) });
        return;
      }
      const pc = level !== 'kolay' ? t.match(POST_CAUSE_RE) : null;
      if (pc && (lower(pc[2]) !== 'için' || /(d|t)[ıiuü]ğ[ıiuü](nd[ae]n)?$/.test(lower(pc[1])))) {
        let reason = pc[1].replace(/^(ancak|fakat|ama|ve|bu|şu|o)\s+/i, '');
        if (lower(pc[2]) !== 'için') {
          const w = reason.split(/\s+/);
          reason = w.length >= 2 && /(n?[ıiuü]n)$/.test(lower(w[w.length - 2])) ? w.slice(-2).join(' ') : w[w.length - 1];
        }
        if (contentTokens(reason).length >= 1 && reason.length >= 4) {
          const blanked = t.replace(reason + ' ' + pc[2], '_____ ' + pc[2]);
          const ex = new Set(contentTokens(t.replace(reason, '')).map(stem));
          const ks = keyTerms(reason, A.weight, null, nKeys);
          cands.push({ s, type: 'neden', bonus: 2.4, q: 'Boşluğa gelen nedeni kendi cümlelerinle açıkla: «' + clip(blanked, 230) + '»', ref: t, keys: ks.length ? ks : contentTokens(reason).slice(0, nKeys), _ex: ex });
          return;
        }
      }
      if ((m = t.match(CAUSE_RE)) && level !== 'kolay') {
        const i = t.search(CAUSE_RE);
        const before = t.slice(0, i).trim();
        const after = t.slice(i + m[0].length).trim();
        const conn = lower(m[1]);
        // "A sayesinde/nedeniyle B" → neden A tarafında; "A, çünkü B" → neden B tarafında
        const reasonFirst = /bu sayede/.test(conn) ? false : false;
        const reason = reasonFirst ? before : after;
        const result = reasonFirst ? after : before;
        if (result.length > 12 && reason.length > 12) {
          const ex = new Set(contentTokens(result).map(stem));
          cands.push({ s, type: 'neden', bonus: 2.5, q: 'Nedenini açıkla: «' + clip(cap(result.replace(/[.,;]+$/, '')), 140) + '». Bunun sebebi nedir?', ref: t, keys: keyTerms(reason, A.weight, ex, nKeys) });
          return;
        }
      }
      if ((m = t.match(LIST_RE)) && (t.includes(':') || (t.match(/,/g) || []).length >= 2)) {
        const colon = t.indexOf(':');
        const subject = (colon > 0 ? t.slice(0, colon) : t.slice(0, t.search(LIST_RE) + m[0].length)).replace(/\s+(şunlardır|şunlar|şöyledir|şöyle sıralanabilir)\s*$/i, '');
        const listPart = colon > 0 ? t.slice(colon + 1) : t.slice(t.search(LIST_RE) + m[0].length);
        const ex = new Set(contentTokens(subject).map(stem));
        if (subject.length >= 8 && subject.length <= 140) {
          cands.push({ s, type: 'liste', bonus: 2, q: cap(subject.replace(/[.,;:]+$/, '').trim()) + ' nelerdir? Açıklayarak yaz.', ref: t, keys: keyTerms(listPart, A.weight, ex, Math.max(nKeys, 4)) });
          return;
        }
      }
      if ((m = t.match(NUM_RE)) && level !== 'zor') {
        const val = m[0];
        const blanked = t.replace(val, '_____');
        cands.push({ s, type: 'bosluk', bonus: 1.2, q: 'Boşluğa gelecek bilgiyi yaz: «' + clip(blanked, 220) + '»', ref: t, keys: [val], exact: val });
        return;
      }
      const ranked = keyTerms(t, A.weight, null, 3);
      // Türkçede özne çoğunlukla başta gelir; ilk anlamlı kelime yeterince önemliyse onu seç
      const first = contentTokens(t).find((w) => !VERBISH_RE.test(w) || w.length <= 5);
      const top = first && ranked.includes(first) ? first : ranked[0];
      if (top) {
        const term = lemma(top, allToks);
        const ex = new Set([stem(top)]);
        const topic = s.heading && s.heading.length < 50 && stem(lower(s.heading)) !== stem(term) ? ' (' + s.heading + ')' : '';
        cands.push({ s, type: 'acikla', bonus: 0, q: 'Metne göre «' + term + '» hakkında ne öğrendin' + topic + '? Kendi cümlelerinle açıkla.', ref: t, keys: keyTerms(t, A.weight, ex, nKeys) });
      }
    });

    const scored = cands
      .filter((c) => c.keys && c.keys.length >= 1)
      .map((c) => ({ c, v: c.s.score + c.bonus + (level === 'kolay' && (c.type === 'tanim' || c.type === 'bosluk') ? 1.5 : 0) + (level === 'zor' && (c.type === 'neden' || c.type === 'liste') ? 1.5 : 0) }))
      .sort((a, b) => b.v - a.v);

    // Tek tip soruya yığılmamak için türlere kota uygula
    const perType = Math.max(2, Math.ceil(count * 0.5));
    const used = {}, pickedIdx = new Set(), picked = [], seenQ = new Set();
    scored.forEach((x, i) => { if (seenQ.has(x.c.q)) x.dup = true; seenQ.add(x.c.q); });
    for (let i = scored.length - 1; i >= 0; i--) if (scored[i].dup) scored.splice(i, 1);
    for (const { c } of scored) {
      if (picked.length >= count) break;
      if ((used[c.type] || 0) >= perType) continue;
      if (pickedIdx.has(c.s.idx) || pickedIdx.has(c.s.idx - 1)) continue;
      used[c.type] = (used[c.type] || 0) + 1;
      pickedIdx.add(c.s.idx);
      picked.push(c);
    }
    for (const { c } of scored) { // kota yüzünden eksik kalırsa tamamla
      if (picked.length >= count) break;
      if (!pickedIdx.has(c.s.idx)) { pickedIdx.add(c.s.idx); picked.push(c); }
    }
    picked.sort((a, b) => a.s.idx - b.s.idx);
    return picked.map((c, i) => ({
      id: 'q' + (i + 1),
      type: c.type,
      q: c.q,
      ref: c.ref,
      keys: Array.from(new Set(c.keys)).slice(0, 8),
      exact: c.exact || '',
      topic: c.s.heading || ''
    }));
  }

  // ---------- Değerlendirme ----------
  function evaluate(question, answer) {
    const ans = String(answer || '').trim();
    const res = { score: 0, verdict: 'gelistir', good: [], improve: [], explanation: question.ref || '', by: 'yerel' };
    const aToks = contentTokens(ans);
    if (!ans || aToks.length === 0) {
      res.improve.push('Cevap boş görünüyor. Bildiğin kadarını kendi cümlelerinle yaz.');
      return res;
    }
    const qStems = new Set(contentTokens(question.q).map(stem));

    if (question.exact) {
      const want = normalize(question.exact).replace(/\s/g, '');
      const got = normalize(ans).replace(/\s/g, '');
      if (got.includes(want)) {
        res.score = 100; res.verdict = 'dogru';
        res.good.push('Boşluğa gelen bilgiyi doğru yazdın: ' + question.exact + '.');
      } else {
        const digits = (question.exact.match(/\d+/) || [''])[0];
        if (digits && got.includes(digits)) { res.score = 70; res.verdict = 'kismen'; res.good.push('Sayıyı doğru yazdın.'); res.improve.push('Birimi de ekle: ' + question.exact + '.'); }
        else res.improve.push('Doğru bilgi: ' + question.exact + '. Bu cümleyi bir kez daha oku.');
      }
      return res;
    }

    const aU = Array.from(new Set(aToks));
    // 1) Kavram kapsamı
    const keys = (question.keys || []).filter(Boolean);
    const hit = [], miss = [];
    keys.forEach((k) => {
      const kt = contentTokens(k);
      if (!kt.length) return;
      const ok = kt.every((part) => aU.some((w) => wordSim(part, w) >= 0.55));
      (ok ? hit : miss).push(k);
    });
    const coverage = keys.length ? hit.length / keys.length : 0;

    // 2) Anlam benzerliği (soru kelimeleri hariç, kök + yazım toleransı)
    const refU = Array.from(new Set(contentTokens(question.ref))).filter((t) => !qStems.has(stem(t)));
    const ansU = aU.filter((t) => !qStems.has(stem(t)));
    let m1 = 0;
    refU.forEach((r) => { let b = 0; ansU.forEach((a) => { b = Math.max(b, wordSim(r, a)); }); m1 += b; });
    let m2 = 0;
    ansU.forEach((a) => { let b = 0; refU.forEach((r) => { b = Math.max(b, wordSim(r, a)); }); m2 += b; });
    const recall = refU.length ? m1 / refU.length : 0;
    const precision = ansU.length ? m2 / ansU.length : 0;
    const f = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
    const sem = Math.min(1, recall * 0.65 + f * 0.6);

    let score = Math.round(100 * (0.6 * coverage + 0.4 * sem));

    // 3) Düzeltmeler
    const negA = NEG_RE.test(normalize(ans));
    const negR = NEG_RE.test(normalize(question.ref));
    if (negA !== negR && coverage >= 0.5) {
      score -= 25;
      res.improve.push(negA ? 'Cevabında olumsuz bir ifade var; kaynakta durum olumlu anlatılıyor. Anlamı tersine çevirmiş olabilirsin.' : 'Kaynakta bir olumsuzluk ("değil", "olmaz" gibi) var; cevabında bu eksik. Anlam değişmiş olabilir.');
    }
    const onlyQuestion = ansU.length === 0;
    if (onlyQuestion) { score = Math.min(score, 10); res.improve.push('Soruyu tekrar etmek yerine cevabı yaz.'); }
    if (aToks.length < 3) { score = Math.min(score, 45); res.improve.push('Cevabın çok kısa. En az bir tam cümle kur.'); }
    const copy = dice(normalize(ans), normalize(question.ref)) > 0.85;
    score = Math.max(0, Math.min(100, score));
    res.score = score;
    res.verdict = score >= 75 ? 'dogru' : score >= 45 ? 'kismen' : 'gelistir';

    if (hit.length) res.good.push('Doğru kavramları kullandın: ' + hit.join(', ') + '.');
    if (score >= 75 && !copy) res.good.push('Konuyu kendi cümlelerinle anlatabildin.');
    if (precision > 0.6 && ansU.length >= 4) res.good.push('Yazdıkların büyük ölçüde konuyla ilgili.');
    if (!res.good.length) res.good.push('Soruyu cevaplamaya çalıştın; bu iyi bir başlangıç.');
    if (miss.length) res.improve.push('Şu noktalara da değin: ' + miss.join(', ') + '.');
    if (copy) res.improve.push('Cevabın kaynak cümleye çok benziyor. Ezber yerine kendi cümlelerinle anlatmayı dene.');
    if (!res.improve.length && score < 100) res.improve.push('Bir örnek ekleyerek cevabını daha da güçlendirebilirsin.');
    return res;
  }

  // ---------- Demo içerik (yalnızca deneme amaçlı) ----------
  const DEMO_TEXT = [
    'Fotosentez',
    'Yeşil bitkilerin ışık enerjisini kullanarak karbondioksit ve sudan besin üretmesine fotosentez denir. Fotosentez sırasında havaya oksijen verilir.',
    'Fotosentez bitki hücrelerindeki kloroplastlarda gerçekleşir. Kloroplastlarda bulunan klorofil, güneş ışığını soğurur ve bitkiye yeşil rengini verir.',
    'Fotosentezin hızını etkileyen faktörler şunlardır: ışık şiddeti, karbondioksit miktarı, sıcaklık ve su miktarı.',
    'Işık şiddeti belirli bir seviyeye kadar arttıkça fotosentez hızı da artar. Ancak sıcaklık çok yükselirse enzimler bozulduğu için fotosentez hızı azalır.',
    'Bitkiler ürettikleri besinin bir kısmını solunumda kullanır, fazlasını ise nişasta olarak depolar. Canlılar oksijen ihtiyaçlarını büyük ölçüde fotosentez sayesinde karşılar.'
  ].join('\n');

  const api = { generate, evaluate, analyze, cleanText, normalize, contentTokens, stem, wordSim, DEMO_TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SHEngine = Object.freeze(api);
})(typeof self !== 'undefined' ? self : this);
