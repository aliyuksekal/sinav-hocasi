// Paylaşılan soruyu tarayıcıda çözdürür. Soru adresin # kısmında taşınır; sunucuya hiç gitmez.
(function () {
  'use strict';
  const E = window.SHEngine;
  const DOWNLOAD = 'indir.html';
  const root = document.getElementById('soru');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const clamp = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);

  function decode() {
    try {
      const raw = location.hash.slice(1);
      if (!raw || raw.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
      const b64 = raw.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((raw.length + 3) % 4);
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const d = JSON.parse(new TextDecoder().decode(bytes));
      if (!d || d.v !== 1) return null;
      const q = { q: clamp(d.q, 500).trim(), ref: clamp(d.r, 900), keys: Array.isArray(d.k) ? d.k.slice(0, 6).map((k) => clamp(k, 60)).filter(Boolean) : [], exact: clamp(d.e, 60), subject: clamp(d.s, 40), grade: clamp(d.g, 10), title: clamp(d.t, 60) };
      return q.q ? q : null;
    } catch (e) { return null; }
  }

  function cta() {
    const box = el('div', 'panel stack');
    box.append(el('h2', null, 'Kendi kitabından soru çöz'), el('p', 'muted', 'Sınav Hocası; ders kitabının sayfasını çektiğinde sana özel sorular hazırlar, cevabını değerlendirir ve velinin ilerlemeni görmesini sağlar. Ücretsiz.'));
    const a = el('a', 'btn btn-primary btn-block', 'Sınav Hocası’nı indir'); a.href = DOWNLOAD;
    const b = el('a', 'btn btn-secondary btn-block', 'Tarayıcıda dene'); b.href = 'index.html';
    box.append(a, b);
    return box;
  }

  function header() {
    const top = el('div', 'row'); top.style.margin = '16px 0';
    const img = el('img'); img.src = 'icons/mark-144.png'; img.alt = ''; img.width = 44; img.height = 44; img.style.borderRadius = '12px';
    const name = el('div', 'brand-name'); name.append('Sınav ', el('span', null, 'Hocası'));
    top.append(img, name);
    return top;
  }

  window.addEventListener('hashchange', () => location.reload());
  const q = decode();
  root.append(header());
  if (!q) {
    const e = el('div', 'empty'); e.append(el('b', null, 'Soru açılamadı'), el('p', null, 'Bağlantı eksik ya da bozuk olabilir. Gönderen kişiden tekrar paylaşmasını iste.'));
    root.append(e, el('div', null), cta());
    return;
  }

  const bubble = el('div', 'bubble');
  bubble.append(el('h1', null, 'Sana bir soru var!'), el('p', null, 'Bir arkadaşın Sınav Hocası’ndan bu soruyu gönderdi. Cevabını kendi cümlelerinle yaz, Hoca değerlendirsin.'));
  root.append(bubble);

  const chips = el('div', 'row wrap'); chips.style.margin = '14px 0 10px';
  if (q.subject) chips.append(el('span', 'chip', q.subject));
  if (q.grade && q.grade !== 'Diğer') chips.append(el('span', 'chip', q.grade + '. sınıf'));
  if (q.title) chips.append(el('span', 'chip info', q.title));
  root.append(chips);

  const paper = el('div', 'sheet-paper');
  paper.append(el('span', 'qnum', 'Soru'), el('p', 'qtext', q.q));
  const area = el('textarea', 'answer'); area.placeholder = 'Cevabını buraya yaz…'; area.maxLength = 4000; area.setAttribute('aria-label', 'Cevabın');
  paper.append(area);
  root.append(paper);

  const btn = el('button', 'btn btn-primary btn-block', 'Cevabımı değerlendir'); btn.type = 'button'; btn.disabled = true; btn.style.marginTop = '14px';
  area.addEventListener('input', () => { btn.disabled = area.value.trim().length < 2; });
  const out = el('div');
  btn.addEventListener('click', () => {
    const r = E.evaluate(q, area.value.trim());
    const g = el('section', 'grade');
    const top = el('div', 'grade-top');
    const ring = el('div', 'ring'); const b = el('b', null, String(r.score)); ring.append(b); ring.style.border = '8px solid ' + (r.score >= 75 ? 'var(--ok)' : r.score >= 45 ? 'var(--amber)' : 'var(--bad)'); ring.style.borderRadius = '50%';
    const t = el('div'); t.append(el('span', 'chip ' + (r.score >= 75 ? 'ok' : r.score >= 45 ? 'warn' : 'bad'), r.score >= 75 ? 'Doğru' : r.score >= 45 ? 'Kısmen doğru' : 'Geliştirilmeli'));
    top.append(ring, t);
    const body = el('div', 'grade-body');
    const list = (title, items) => { if (!items.length) return; const d = el('div'); d.append(el('h3', null, title)); const ul = el('ul'); items.forEach((x) => ul.append(el('li', null, x))); d.append(ul); body.append(d); };
    list('Neyi doğru yaptın?', r.good);
    list('Neyi geliştirebilirsin?', r.improve);
    if (q.ref) { const d = el('div'); d.append(el('h3', null, 'Örnek açıklama'), el('div', 'ref', q.ref)); body.append(d); }
    body.append(el('p', 'by', 'Tarayıcıda yapılan yaklaşık değerlendirme. Uygulamada daha ayrıntılı geri bildirim alırsın.'));
    g.append(top, body);
    out.replaceChildren(g);
    g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.append(btn, out);
  const gap = el('div'); gap.style.height = '18px';
  root.append(gap, cta());
})();
