/*
 * Sınav Hocası — uygulama
 * Güvenlik ilkeleri:
 *  - Kullanıcı/dosya/sunucu kaynaklı hiçbir metin HTML olarak yorumlanmaz (innerHTML yok, yalnızca textContent).
 *  - Dosya türü uzantıya değil, dosyanın ilk baytlarına (imza) bakılarak doğrulanır.
 *  - Saklanan ve içe aktarılan veriler okunurken şemaya göre temizlenir.
 *  - Gizli anahtar istemcide tutulmaz; yapay zekâ yalnızca sunucu üzerinden çağrılır.
 */
(function () {
  'use strict';

  const E = window.SHEngine;
  const VERSION = '1.3.0';
  const API_BASE = 'https://sinav-hocasi.aliyuksekal.workers.dev';
  const MB = 1024 * 1024;
  const LIMITS = { imageBytes: 30 * MB, pdfBytes: 250 * MB, materials: 120, textChars: 400000, sessions: 300, answerChars: 4000, nameChars: 120, titleChars: 80 };
  const SUBJECTS = ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'Hayat Bilgisi', 'T.C. İnkılap Tarihi', 'Din Kültürü', 'İngilizce', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Biyoloji', 'Fizik', 'Kimya', 'Felsefe', 'Diğer'];
  const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Diğer'];
  const IS_NATIVE = typeof window.SHNative === 'object' && window.SHNative !== null;
  const MEB_URL = 'https://tymm.meb.gov.tr/ders-kitaplari';
  const SITE = 'https://aliyuksekal.github.io/sinav-hocasi/';
  const DOWNLOAD_URL = SITE + 'indir.html';
  const ID_RE = /^[A-Za-z0-9_-]{22,64}$/;

  // ======================================================================
  // DOM yardımcıları (güvenli)
  // ======================================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = String(v);
        else if (k === 'on') { for (const ev of Object.keys(v)) el.addEventListener(ev, v[ev]); }
        else if (k === 'css') { for (const c of Object.keys(v)) el.style.setProperty(c, v[c]); }
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else if (/^on/i.test(k) || k === 'style' || k === 'innerHTML' || k === 'srcdoc') continue; // güvenlik
        else if (k === 'href' || k === 'src') { const u = safeUrl(v, k === 'src'); if (u) el.setAttribute(k, u); }
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  // replaceChildren null/false değerleri "null" yazısına çevirir; bu yardımcı onları atlar
  function fill(el) { el.replaceChildren(); for (let i = 1; i < arguments.length; i++) append(el, arguments[i]); return el; }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => append(el, x)); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function safeUrl(u, isSrc) {
    u = String(u);
    if (/^#/.test(u) || /^(icons|vendor|downloads)\//.test(u) || /^\.?\/?[a-z0-9_-]+\.html$/i.test(u)) return u;
    if (isSrc && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(u)) return u;
    if (isSrc && /^blob:/.test(u)) return u;
    if (/^https:\/\//i.test(u)) return u;
    return '';
  }

  const ICONS = {
    camera: [['path', { d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' }], ['circle', { cx: 12, cy: 13, r: 4 }]],
    image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }], ['path', { d: 'm21 15-5-5L5 21' }]],
    pdf: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 2v6h6M9 13h6M9 17h6M9 9h1' }]],
    text: [['path', { d: 'M4 7V4h16v3M9 20h6M12 4v16' }]],
    book: [['path', { d: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z' }]],
    trash: [['path', { d: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }]],
    left: [['path', { d: 'm15 18-6-6 6-6' }]],
    right: [['path', { d: 'm9 18 6-6-6-6' }]],
    check: [['path', { d: 'M20 6 9 17l-5-5' }]],
    info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4M12 8h.01' }]],
    warn: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01' }]],
    spark: [['path', { d: 'M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z' }]],
    scan: [['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10' }]],
    x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
    play: [['path', { d: 'm6 4 14 8-14 8z' }]],
    share: [['circle', { cx: 18, cy: 5, r: 3 }], ['circle', { cx: 6, cy: 12, r: 3 }], ['circle', { cx: 18, cy: 19, r: 3 }], ['path', { d: 'm8.6 13.5 6.8 4M15.4 6.5l-6.8 4' }]],
    lock: [['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
    download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' }]],
    upload: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12' }]],
    edit: [['path', { d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }]],
    bulb: [['path', { d: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z' }]],
    refresh: [['path', { d: 'M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16' }]],
    home: [['path', { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]],
    chart: [['path', { d: 'M3 3v18h18' }], ['path', { d: 'm7 15 4-4 3 3 5-6' }]],
    users: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' }]],
    student: [['path', { d: 'M22 10 12 5 2 10l10 5 10-5z' }], ['path', { d: 'M6 12v5c3 3 9 3 12 0v-5' }]],
    parent: [['circle', { cx: 12, cy: 7, r: 4 }], ['path', { d: 'M5.5 21a6.5 6.5 0 0 1 13 0' }], ['path', { d: 'M12 14v3' }]],
    cloud: [['path', { d: 'M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z' }]],
    link: [['path', { d: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7' }], ['path', { d: 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' }]],
    target: [['circle', { cx: 12, cy: 12, r: 10 }], ['circle', { cx: 12, cy: 12, r: 6 }], ['circle', { cx: 12, cy: 12, r: 2 }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    more: [['circle', { cx: 12, cy: 5, r: 1.6 }], ['circle', { cx: 12, cy: 12, r: 1.6 }], ['circle', { cx: 12, cy: 19, r: 1.6 }]],
    clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
    ticket: [['path', { d: 'M9 11h6M9 15h4M7 3h10a2 2 0 0 1 2 2v14l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2z' }]],
    wave: [['path', { d: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L3 13.7a1.5 1.5 0 0 1 2.4-1.8L8 15' }]]
  };
  function icon(name) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (ICONS[name] || []).forEach(([t, a]) => {
      const n = document.createElementNS(SVGNS, t);
      Object.keys(a).forEach((k) => n.setAttribute(k, a[k]));
      svg.appendChild(n);
    });
    return svg;
  }
  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }

  const fmtNum = (n) => Number(n || 0).toLocaleString('tr-TR');
  const fmtSize = (b) => (b >= MB ? (b / MB).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const fmtDate = (t) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  const fmtDateTime = (t) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtMin = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? m + ' dk' : Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk'; };
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const uid = () => { const a = new Uint8Array(9); crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join(''); };
  const clampStr = (s, n) => String(s == null ? '' : s).slice(0, n);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ======================================================================
  // Kalıcı durum (localStorage) — okurken şemaya göre temizlenir
  // ======================================================================
  const KEY = 'sh:v1';
  const DEFAULT_SETTINGS = { theme: 'auto', accent: 'blue', textSize: 'normal', name: '', ai: true, autoOcr: true, role: '', introDone: false };
  const ACCENTS = [['blue', 'Mavi'], ['teal', 'Turkuaz'], ['purple', 'Mor'], ['green', 'Yeşil'], ['orange', 'Turuncu']];

  function sanitizeQuestion(q, i) {
    if (!q || typeof q !== 'object') return null;
    const text = clampStr(q.q, 600).trim();
    if (!text) return null;
    return {
      id: clampStr(q.id || 'q' + (i + 1), 20),
      type: clampStr(q.type || 'acikla', 12),
      q: text,
      ref: clampStr(q.ref, 1500),
      keys: Array.isArray(q.keys) ? q.keys.slice(0, 8).map((k) => clampStr(k, 60)).filter(Boolean) : [],
      exact: clampStr(q.exact, 60),
      topic: clampStr(q.topic, 80)
    };
  }
  function sanitizeEval(r) {
    if (!r || typeof r !== 'object') return null;
    const list = (a) => (Array.isArray(a) ? a.slice(0, 6).map((x) => clampStr(x, 400)).filter(Boolean) : []);
    const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    return {
      score,
      verdict: ['dogru', 'kismen', 'gelistir'].includes(r.verdict) ? r.verdict : score >= 75 ? 'dogru' : score >= 45 ? 'kismen' : 'gelistir',
      good: list(r.good), improve: list(r.improve),
      explanation: clampStr(r.explanation, 1500),
      by: r.by === 'ai' ? 'ai' : 'yerel'
    };
  }
  function sanitizeSession(s) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string') return null;
    const questions = (Array.isArray(s.questions) ? s.questions : []).slice(0, 40).map(sanitizeQuestion).filter(Boolean);
    if (!questions.length) return null;
    const answers = {};
    if (s.answers && typeof s.answers === 'object') {
      questions.forEach((q) => {
        const a = s.answers[q.id];
        if (a && typeof a === 'object') {
          const ev = sanitizeEval(a.eval);
          answers[q.id] = { text: clampStr(a.text, LIMITS.answerChars), at: Number(a.at) || Date.now(), hint: !!a.hint, eval: ev };
        }
      });
    }
    return {
      id: clampStr(s.id, 40), title: clampStr(s.title, LIMITS.titleChars) || 'Çalışma',
      subject: SUBJECTS.includes(s.subject) ? s.subject : 'Diğer',
      grade: GRADES.includes(String(s.grade)) ? String(s.grade) : 'Diğer',
      level: ['kolay', 'orta', 'zor'].includes(s.level) ? s.level : 'orta',
      source: s.source === 'demo' ? 'demo' : 'materyal',
      engine: s.engine === 'ai' ? 'ai' : 'yerel',
      createdAt: Number(s.createdAt) || Date.now(),
      finishedAt: Number(s.finishedAt) || null,
      idx: Math.max(0, Math.min(questions.length - 1, Number(s.idx) || 0)),
      activeMs: Math.max(0, Math.min(36e6, Number(s.activeMs) || 0)),
      questions, answers
    };
  }
  // Öğrenciden veliye giden özet: cevap metni ve materyal içeriği taşımaz
  function sanitizeSummary(x) {
    if (!x || typeof x !== 'object') return null;
    const n = (v, a, b) => { const k = Number(v); return Number.isFinite(k) ? Math.max(a, Math.min(b, Math.round(k))) : null; };
    const arr = (a, m) => (Array.isArray(a) ? a.slice(0, m).filter((r) => r && typeof r === 'object') : []);
    const days = {};
    if (x.days && typeof x.days === 'object') Object.keys(x.days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).slice(-60).forEach((k) => { days[k] = n(x.days[k], 0, 864e5) || 0; });
    const t = x.totals || {};
    return {
      v: 1, name: clampStr(x.name, 30), updatedAt: n(x.updatedAt, 0, 4e12) || 0,
      totals: { answered: n(t.answered, 0, 1e6) || 0, avg: n(t.avg, 0, 100), ms: n(t.ms, 0, 1e11) || 0 },
      streak: n(x.streak, 0, 3650) || 0, days,
      subjects: arr(x.subjects, 20).map((r) => ({ subject: clampStr(r.subject, 40), avg: n(r.avg, 0, 100) || 0, n: n(r.n, 0, 1e6) || 0 })).filter((r) => r.subject),
      weak: arr(x.weak, 8).map((r) => ({ topic: clampStr(r.topic, 80), subject: clampStr(r.subject, 40), avg: n(r.avg, 0, 100) || 0, n: n(r.n, 0, 1e6) || 0 })).filter((r) => r.topic),
      sessions: arr(x.sessions, 40).map((r) => ({ title: clampStr(r.title, 80), subject: clampStr(r.subject, 40), grade: clampStr(r.grade, 10), at: n(r.at, 0, 4e12) || 0, answered: n(r.answered, 0, 100) || 0, total: n(r.total, 0, 100) || 0, avg: n(r.avg, 0, 100), ms: n(r.ms, 0, 1e9) || 0 })).filter((r) => r.title),
      materials: n(x.materials, 0, 1e4) || 0
    };
  }

  function sanitizeState(raw) {
    const st = { v: 1, settings: Object.assign({}, DEFAULT_SETTINGS), sessions: [], drafts: {}, parent: null, days: {}, sync: null, children: [] };
    if (!raw || typeof raw !== 'object') return st;
    const s = raw.settings || {};
    st.settings.theme = ['auto', 'light', 'dark', 'amoled'].includes(s.theme) ? s.theme : 'auto';
    st.settings.accent = ['blue', 'teal', 'purple', 'green', 'orange'].includes(s.accent) ? s.accent : 'blue';
    st.settings.textSize = s.textSize === 'large' ? 'large' : 'normal';
    st.settings.name = clampStr(s.name, 30).replace(/[<>]/g, '');
    st.settings.ai = s.ai !== false;
    st.settings.autoOcr = s.autoOcr !== false;
    st.settings.role = ['ogrenci', 'veli'].includes(s.role) ? s.role : '';
    st.settings.introDone = s.introDone === true;
    const sy = raw.sync;
    if (sy && typeof sy === 'object' && ID_RE.test(sy.familyId || '') && ID_RE.test(sy.token || '')) {
      st.sync = { familyId: sy.familyId, token: sy.token, lastPush: Number(sy.lastPush) || 0, lastHash: clampStr(sy.lastHash, 32), error: clampStr(sy.error, 200) };
    }
    if (Array.isArray(raw.children)) {
      st.children = raw.children.slice(0, 8).filter((c) => c && ID_RE.test(c.familyId || '') && ID_RE.test(c.token || '')).map((c) => ({
        familyId: c.familyId, token: c.token, name: clampStr(c.name, 30), addedAt: Number(c.addedAt) || Date.now(),
        fetchedAt: Number(c.fetchedAt) || 0, revoked: !!c.revoked, sum: sanitizeSummary(c.sum), nick: clampStr(c.nick, 30).replace(/[<>]/g, '')
      }));
    }
    st.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).slice(-LIMITS.sessions).map(sanitizeSession).filter(Boolean);
    if (raw.drafts && typeof raw.drafts === 'object') {
      Object.keys(raw.drafts).slice(0, 200).forEach((k) => { if (typeof raw.drafts[k] === 'string') st.drafts[clampStr(k, 80)] = clampStr(raw.drafts[k], LIMITS.answerChars); });
    }
    const p = raw.parent;
    if (p && typeof p === 'object' && /^[a-f0-9]{64}$/.test(p.hash || '') && /^[a-f0-9]{32}$/.test(p.salt || '')) {
      st.parent = { hash: p.hash, salt: p.salt, iter: Math.max(1000, Math.min(1e6, Number(p.iter) || 150000)), algo: p.algo === 'sha-loop' ? 'sha-loop' : 'pbkdf2', fails: Math.max(0, Number(p.fails) || 0), lockUntil: Number(p.lockUntil) || 0 };
    }
    if (raw.days && typeof raw.days === 'object') {
      Object.keys(raw.days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-400).forEach((k) => { st.days[k] = Math.max(0, Math.min(864e5, Number(raw.days[k]) || 0)); });
    }
    return st;
  }

  let memoryOnly = false;
  function loadState() {
    try { return sanitizeState(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { memoryOnly = true; return sanitizeState(null); }
  }
  const S = loadState();
  let saveTimer = 0;
  function save(now) {
    clearTimeout(saveTimer);
    const run = () => {
      if (memoryOnly) return;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {
        // Kota doldu: en eski demo/oturumları budayıp tekrar dene
        if (S.sessions.length > 20) { S.sessions.splice(0, Math.ceil(S.sessions.length / 4)); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e2) { /* yok say */ } }
      }
    };
    if (now) run(); else saveTimer = setTimeout(run, 250);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Timer.flush(); save(true); if (typeof Sync !== 'undefined') Sync.push(); } });
  window.addEventListener('pagehide', () => { Timer.flush(); save(true); });

  // ======================================================================
  // IndexedDB — materyaller ve dosyalar
  // ======================================================================
  const DB = (() => {
    let dbp = null;
    const mem = { meta: new Map(), blob: new Map() };
    let useMem = false;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve) => {
        let req;
        try { req = indexedDB.open('sinav-hocasi', 1); } catch (e) { useMem = true; resolve(null); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('materials')) db.createObjectStore('materials', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { useMem = true; resolve(null); };
        req.onblocked = () => { useMem = true; resolve(null); };
      });
      return dbp;
    }
    function tx(store, mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        if (!db) { resolve(fn(null)); return; }
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let out;
        Promise.resolve(fn(os)).then((v) => { out = v; });
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('İşlem iptal edildi'));
      }));
    }
    const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return {
      get memory() { return useMem; },
      async all() {
        const db = await open();
        if (!db) return Array.from(mem.meta.values());
        return tx('materials', 'readonly', (os) => reqP(os.getAll()));
      },
      async put(m) {
        const db = await open();
        if (!db) { mem.meta.set(m.id, m); return; }
        return tx('materials', 'readwrite', (os) => { os.put(m); });
      },
      async putBlob(id, blob) {
        const db = await open();
        if (!db) { mem.blob.set(id, blob); return; }
        return tx('blobs', 'readwrite', (os) => { os.put(blob, id); });
      },
      async getBlob(id) {
        const db = await open();
        if (!db) return mem.blob.get(id) || null;
        return tx('blobs', 'readonly', (os) => reqP(os.get(id)));
      },
      async del(id) {
        const db = await open();
        if (!db) { mem.meta.delete(id); mem.blob.delete(id); return; }
        await tx('materials', 'readwrite', (os) => { os.delete(id); });
        await tx('blobs', 'readwrite', (os) => { os.delete(id); });
      },
      async clear() {
        const db = await open();
        if (!db) { mem.meta.clear(); mem.blob.clear(); return; }
        await tx('materials', 'readwrite', (os) => { os.clear(); });
        await tx('blobs', 'readwrite', (os) => { os.clear(); });
      }
    };
  })();

  function sanitizeMaterial(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string') return null;
    return {
      id: clampStr(m.id, 40),
      name: clampStr(m.name, LIMITS.nameChars) || 'Materyal',
      kind: ['image', 'pdf', 'text'].includes(m.kind) ? m.kind : 'text',
      size: Math.max(0, Number(m.size) || 0),
      addedAt: Number(m.addedAt) || Date.now(),
      thumb: typeof m.thumb === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.thumb) && m.thumb.length < 200000 ? m.thumb : '',
      text: clampStr(m.text, LIMITS.textChars),
      textSource: clampStr(m.textSource, 20),
      pages: Math.max(0, Math.min(5000, Number(m.pages) || 0)),
      pageFrom: Math.max(0, Number(m.pageFrom) || 0),
      pageTo: Math.max(0, Number(m.pageTo) || 0),
      origin: clampStr(m.origin, 20),
      frontPages: Math.max(0, Math.min(200, Number(m.frontPages) || 0))
    };
  }

  let MATS = [];
  const busy = new Map(); // materyal id → { label, pct }
  async function loadMaterials() {
    try { MATS = (await DB.all()).map(sanitizeMaterial).filter(Boolean).sort((a, b) => b.addedAt - a.addedAt); } catch (e) { MATS = []; }
  }

  // ======================================================================
  // Yerel Android köprüsü (varsa)
  // ======================================================================
  const Native = (() => {
    const pending = new Map();
    let info = {};
    if (IS_NATIVE) { try { info = JSON.parse(window.SHNative.info()) || {}; } catch (e) { info = {}; } }
    window.SHBridge = Object.freeze({
      resolve(id, payload) {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        let data = null;
        try { data = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { data = { ok: false, error: 'Yanıt okunamadı' }; }
        if (data && data.ok) p.resolve(data); else p.reject(new Error((data && data.error) || 'İşlem başarısız'));
      },
      onBookProgress(payload) { try { const d = JSON.parse(payload); bookProgress(d); } catch (e) { /* yok say */ } },
      onBookDownloaded(payload) { try { const d = JSON.parse(payload); importDownloadedBook(d); } catch (e) { toast('İndirilen kitap içe aktarılamadı.', true); } },
      onBookError(msg) { toast(clampStr(msg, 200) || 'Kitap indirilemedi.', true); bookProgress(null); }
    });
    function call(method, args, timeout) {
      return new Promise((resolve, reject) => {
        if (!IS_NATIVE || typeof window.SHNative[method] !== 'function') { reject(new Error('Bu cihazda yok')); return; }
        const id = uid();
        pending.set(id, { resolve, reject });
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Zaman aşımı')); } }, timeout || 60000);
        try { window.SHNative[method].apply(window.SHNative, [id].concat(args || [])); } catch (e) { pending.delete(id); reject(e); }
      });
    }
    return {
      has: IS_NATIVE,
      info,
      can: (f) => IS_NATIVE && !!info[f],
      ocr: (b64) => call('ocr', [b64], 90000),
      openBooks: () => { try { window.SHNative.openBookStore(); return true; } catch (e) { return false; } },
      releaseDownload: (name) => { try { window.SHNative.releaseDownload(String(name)); } catch (e) { /* yok say */ } },
      share: (text) => { try { window.SHNative.share(String(text)); return true; } catch (e) { return false; } },
      openExternal: (url) => { try { window.SHNative.openExternal(String(url)); return true; } catch (e) { return false; } },
      setTheme: (dark) => { try { window.SHNative.setTheme(!!dark); } catch (e) { /* yok say */ } },
      setColors: (dark, hex) => { try { if (typeof window.SHNative.setColors !== 'function') return false; window.SHNative.setColors(!!dark, String(hex)); return true; } catch (e) { return false; } },
      shareImage: (b64, text) => { try { if (typeof window.SHNative.shareImage !== 'function') return false; window.SHNative.shareImage(String(b64), String(text)); return true; } catch (e) { return false; } }
    };
  })();

  function openExternal(url) {
    if (!/^https:\/\//.test(url)) return;
    if (Native.has && Native.openExternal(url)) return;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
  }

  // ======================================================================
  // Yapay zekâ sunucusu (isteğe bağlı) — yanıtlar doğrulanır
  // ======================================================================
  const Server = (() => {
    let status = 'bilinmiyor';
    let checking = null;
    const caps = { ai: false, sync: false };
    async function req(path, body, timeout) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout || 30000);
      try {
        const r = await fetch(API_BASE + path, {
          method: body ? 'POST' : 'GET',
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', mode: 'cors'
        });
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Sunucu beklenmeyen yanıt verdi');
        const txt = await r.text();
        if (txt.length > 400000) throw new Error('Sunucu yanıtı çok büyük');
        const data = JSON.parse(txt);
        if (!r.ok) { const er = new Error(clampStr(data && data.error, 200) || 'Sunucu hatası (' + r.status + ')'); er.status = r.status; throw er; }
        return data;
      } finally { clearTimeout(t); }
    }
    return {
      get status() { return status; },
      get ready() { return status === 'bagli' && caps.ai && S.settings.ai; },
      get canSync() { return status === 'bagli' && caps.sync; },
      get caps() { return caps; },
      async sync(action, body) {
        if (!/^[a-z-]{2,12}$/.test(action)) throw new Error('Geçersiz işlem');
        return req('/api/es/' + action, body, 20000);
      },
      check() {
        if (checking) return checking;
        if (!navigator.onLine) { status = 'cevrimdisi'; return Promise.resolve(status); }
        checking = req('/api/saglik', null, 6000)
          .then((d) => { status = d && d.ok ? 'bagli' : 'kapali'; caps.ai = !!(d && (d.ai || (d.ok && d.ai === undefined))); caps.sync = !!(d && d.sync); })
          .catch(() => { status = 'kapali'; })
          .then(() => { checking = null; return status; });
        return checking;
      },
      async questions(payload) {
        const d = await req('/api/sorular', payload, 60000);
        const qs = (Array.isArray(d.questions) ? d.questions : []).map(sanitizeQuestion).filter(Boolean);
        if (!qs.length) throw new Error('Sunucu soru üretemedi');
        return qs;
      },
      async evaluate(payload) {
        const d = await req('/api/degerlendir', payload, 40000);
        const ev = sanitizeEval(Object.assign({}, d, { by: 'ai' }));
        if (!ev) throw new Error('Değerlendirme okunamadı');
        return ev;
      },
      async ocr(b64) {
        const d = await req('/api/metin', { image: b64 }, 60000);
        if (typeof d.text !== 'string') throw new Error('Metin okunamadı');
        return clampStr(d.text, 60000);
      }
    };
  })();

  // ======================================================================
  // Harici kütüphaneler (aynı sunucudan, ilk ihtiyaçta yüklenir)
  // ======================================================================
  const loaded = {};
  function loadScript(src) {
    if (!/^vendor\/[a-z0-9_./-]+\.js$/i.test(src)) return Promise.reject(new Error('Geçersiz betik'));
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete loaded[src]; s.remove(); reject(new Error('Kütüphane yüklenemedi: ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function getPdfjs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScript('vendor/pdfjs/pdf.min.js');
    if (!window.pdfjsLib) throw new Error('PDF okuyucu yüklenemedi');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    return window.pdfjsLib;
  }
  let tessWorker = null;
  async function getTesseract(onProgress) {
    if (tessWorker) return tessWorker;
    await loadScript('vendor/tesseract/tesseract.min.js');
    if (!window.Tesseract) throw new Error('Metin tanıma yüklenemedi');
    const base = new URL('vendor/tesseract/', location.href).href;
    tessWorker = await window.Tesseract.createWorker('tur', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base + 'core',
      langPath: base + 'lang',
      workerBlobURL: false,
      gzip: true,
      logger: (m) => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.progress, m.status); }
    });
    return tessWorker;
  }
  const libAvailable = { pdf: null, ocr: null };
  async function probe(path) {
    try { const r = await fetch(path, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (e) { return false; }
  }

  // ======================================================================
  // Dosya doğrulama ve içe aktarma
  // ======================================================================
  async function sniff(blob) {
    const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    const ascii = String.fromCharCode.apply(null, b);
    if (hex.startsWith('ffd8ff')) return 'jpeg';
    if (hex.startsWith('89504e470d0a1a0a')) return 'png';
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
    if (ascii.startsWith('GIF8')) return 'gif';
    if (ascii.indexOf('%PDF-') >= 0 && ascii.indexOf('%PDF-') < 8) return 'pdf';
    if (ascii.slice(4, 8) === 'ftyp' && /heic|heix|hevc|heif|mif1|msf1|avif/.test(ascii.slice(8, 12))) return ascii.slice(8, 12) === 'avif' ? 'avif' : 'heic';
    return 'unknown';
  }
  const IMG_KINDS = ['jpeg', 'png', 'webp', 'gif'];
  function cleanName(name, fallback) {
    let n = String(name || '').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) n = fallback;
    return n.slice(0, LIMITS.nameChars);
  }

  async function makeThumb(blob) {
    let bmp = null, url = null;
    try {
      if (window.createImageBitmap) bmp = await createImageBitmap(blob);
      else {
        url = URL.createObjectURL(blob);
        bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      }
      const w = bmp.width, hgt = bmp.height;
      if (!w || !hgt) return '';
      const sc = Math.min(1, 220 / Math.max(w, hgt));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(hgt * sc));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) { return ''; } finally {
      if (bmp && bmp.close) bmp.close();
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function importFiles(files, origin) {
    const list = Array.from(files || []);
    if (!list.length) return; // iptal: sessizce çık
    const added = [];
    for (const f of list) {
      if (MATS.length + added.length >= LIMITS.materials) { toast('En fazla ' + LIMITS.materials + ' materyal ekleyebilirsin. Önce kullanmadıklarını kaldır.', true); break; }
      try {
        const m = await importOne(f, origin);
        if (m) added.push(m);
      } catch (e) { toast(f.name ? '“' + cleanName(f.name, 'Dosya') + '” eklenemedi: ' + e.message : e.message, true); }
    }
    if (!added.length) return;
    await loadMaterials();
    toast(added.length === 1 ? '“' + added[0].name + '” eklendi.' : added.length + ' materyal eklendi.');
    render();
    // Metne dönüştürmeyi arka planda başlat
    for (const m of added) {
      if (m.kind === 'image' && S.settings.autoOcr && (await ocrAvailable())) extract(m.id).catch(() => {});
      if (m.kind === 'pdf' && m.pages > 0 && m.pages <= 30 && libAvailable.pdf !== false) extract(m.id).catch(() => {});
    }
  }

  async function importOne(f, origin) {
    if (!(f instanceof Blob)) throw new Error('Geçersiz dosya');
    if (f.size === 0) throw new Error('Dosya boş.');
    const kind = await sniff(f);
    const mime = String(f.type || '').toLowerCase();
    const ext = (String(f.name || '').match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1].toLowerCase();
    if (kind === 'heic' || kind === 'avif') throw new Error('Bu fotoğraf biçimi (HEIC/AVIF) desteklenmiyor. Kamerayı “Uyumlu/JPEG” biçimine al ya da ekran görüntüsü alıp onu ekle.');
    if (kind === 'unknown') throw new Error('Dosya fotoğraf ya da PDF değil.');
    // Tarayıcı MIME bildiriyorsa içerikle çelişmemeli (boş MIME kabul)
    if (mime && kind === 'pdf' && !/pdf|octet-stream/.test(mime)) throw new Error('Dosya türü ile içeriği uyuşmuyor.');
    if (mime && IMG_KINDS.includes(kind) && !/^image\//.test(mime) && !/octet-stream/.test(mime)) throw new Error('Dosya türü ile içeriği uyuşmuyor.');
    if (ext && kind === 'pdf' && ext !== 'pdf') throw new Error('Dosya uzantısı içeriğiyle uyuşmuyor.');
    const isPdf = kind === 'pdf';
    if (isPdf && f.size > LIMITS.pdfBytes) throw new Error('PDF çok büyük (en fazla ' + fmtSize(LIMITS.pdfBytes) + ').');
    if (!isPdf && f.size > LIMITS.imageBytes) throw new Error('Fotoğraf çok büyük (en fazla ' + fmtSize(LIMITS.imageBytes) + ').');

    const id = uid();
    const m = sanitizeMaterial({
      id, kind: isPdf ? 'pdf' : 'image', size: f.size, addedAt: Date.now(), origin: origin || '',
      name: cleanName(f.name, isPdf ? 'PDF belgesi' : 'Fotoğraf ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))
    });
    const stored = f.type ? f : new Blob([f], { type: isPdf ? 'application/pdf' : 'image/' + kind });
    if (isPdf) {
      try {
        const lib = await getPdfjs();
        libAvailable.pdf = true;
        const doc = await lib.getDocument({ data: new Uint8Array(await stored.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, enableXfa: false }).promise;
        m.pages = doc.numPages;
        m.pageFrom = 1; m.pageTo = Math.min(doc.numPages, 30);
        if (doc.numPages > 6) {
          // Kitabın giriş sayfalarını (İstiklal Marşı, Hitabe, künye, içindekiler, önsöz…) atla
          const texts = [];
          for (let p = 1; p <= Math.min(40, doc.numPages); p++) {
            try { const pg = await doc.getPage(p); texts.push(joinPdfItems((await pg.getTextContent()).items)); pg.cleanup(); } catch (e) { texts.push(''); }
          }
          const start = E.contentStart(texts);
          if (start > 1 && start <= doc.numPages) {
            m.pageFrom = start; m.pageTo = Math.min(doc.numPages, start + 29); m.frontPages = start - 1;
          }
        }
        m.thumb = await pdfThumb(doc);
        closeDoc(doc);
      } catch (e) {
        if (/şifre|password/i.test(String(e && (e.name + e.message)))) throw new Error('PDF şifreli; şifresiz bir kopya ekle.');
        if (/Invalid PDF|bozuk|corrupt/i.test(String(e && e.message))) throw new Error('PDF bozuk görünüyor.');
        console.warn('PDF okunamadı:', e && e.message); libAvailable.pdf = false; // okuyucu yok — dosyayı yine de sakla
      }
    } else {
      m.thumb = await makeThumb(stored);
      if (!m.thumb) throw new Error('Fotoğraf açılamadı; dosya bozuk olabilir.');
    }
    await DB.putBlob(id, stored);
    await DB.put(m);
    return m;
  }

  function closeDoc(doc) { try { if (typeof doc.destroy === 'function') doc.destroy(); else if (typeof doc.cleanup === 'function') doc.cleanup(); } catch (e) { /* yok say */ } }

  async function pdfThumb(doc) {
    try {
      const page = await doc.getPage(1);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 220 / Math.max(vp0.width, vp0.height) });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) { return ''; }
  }

  async function addTextMaterial(title, text) {
    const t = E.cleanText(text).slice(0, LIMITS.textChars);
    if (t.length < 20) throw new Error('Metin çok kısa. En az birkaç cümle yapıştır.');
    const m = sanitizeMaterial({ id: uid(), kind: 'text', name: cleanName(title, 'Yapıştırılan metin'), size: t.length, addedAt: Date.now(), text: t, textSource: 'elle' });
    await DB.put(m);
    await loadMaterials();
    return m;
  }

  async function removeMaterial(id) {
    await DB.del(id);
    busy.delete(id);
    await loadMaterials();
  }

  // MEB kitabı (yerel uygulama indirdi) → içe aktar
  let bookState = null;
  function bookProgress(d) {
    bookState = d && typeof d === 'object' ? { name: clampStr(d.name, 120), pct: Math.max(0, Math.min(100, Number(d.pct) || 0)) } : null;
    const el = $('#bookProgress');
    if (el) renderBookProgress(el);
  }
  async function importDownloadedBook(d) {
    bookProgress(null);
    const file = clampStr(d && d.file, 80);
    if (!/^[a-z0-9_-]+\.pdf$/i.test(file)) { toast('İndirilen dosya tanınmadı.', true); return; }
    try {
      const r = await fetch('downloads/' + file, { cache: 'no-store' });
      if (!r.ok) throw new Error('Dosya okunamadı');
      const blob = await r.blob();
      const f = new File([blob], cleanName(d.name, 'MEB ders kitabı') + '.pdf', { type: 'application/pdf' });
      await importFiles([f], 'meb');
    } catch (e) { toast('Kitap içe aktarılamadı: ' + e.message, true); } finally { Native.releaseDownload(file); }
  }

  // ======================================================================
  // Metne dönüştürme (OCR ve PDF metni)
  // ======================================================================
  async function ocrAvailable() {
    if (Native.can('ocr')) return true;
    if (Server.ready) return true;
    if (libAvailable.ocr === null) libAvailable.ocr = await probe('vendor/tesseract/tesseract.min.js');
    return libAvailable.ocr;
  }

  async function blobToJpegB64(src, maxSide) {
    let bmp;
    if (src instanceof HTMLCanvasElement) bmp = src;
    else if (window.createImageBitmap) bmp = await createImageBitmap(src);
    else {
      const url = URL.createObjectURL(src);
      try { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Görsel açılamadı')); im.src = url; }); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    const w = bmp.width, hgt = bmp.height;
    const sc = Math.min(1, maxSide / Math.max(w, hgt));
    const c = document.createElement('canvas');
    c.width = Math.round(w * sc); c.height = Math.round(hgt * sc);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return { canvas: c, b64: c.toDataURL('image/jpeg', 0.86).split(',')[1] };
  }

  // Sağlayıcı sırası: cihaz üstü (Android) → sunucu → tarayıcı içi (Tesseract)
  async function ocr(src, onProgress) {
    const errors = [];
    if (Native.can('ocr')) {
      try { const { b64 } = await blobToJpegB64(src, 2400); const r = await Native.ocr(b64); return { text: clampStr(r.text, 80000), by: 'cihaz' }; } catch (e) { errors.push(e.message); }
    }
    if (Server.ready) {
      try { const { b64 } = await blobToJpegB64(src, 1800); return { text: await Server.ocr(b64), by: 'ai' }; } catch (e) { errors.push(e.message); }
    }
    if (libAvailable.ocr !== false) {
      try {
        const { canvas } = await blobToJpegB64(src, 2400);
        const w = await getTesseract(onProgress);
        libAvailable.ocr = true;
        const r = await w.recognize(canvas);
        return { text: clampStr(r && r.data && r.data.text, 80000), by: 'tarayici' };
      } catch (e) { libAvailable.ocr = false; errors.push(e.message); }
    }
    throw new Error('Bu cihazda metin tanıma kullanılamıyor. Metni “Metni düzenle” bölümüne kendin yazabilirsin.');
  }

  function joinPdfItems(items) {
    let out = '';
    items.forEach((it) => {
      if (typeof it.str !== 'string') return;
      out += it.str;
      out += it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : '');
    });
    return out.replace(/[ \t]+\n/g, '\n');
  }

  async function extract(id, opts) {
    if (busy.has(id)) return;
    const m = MATS.find((x) => x.id === id);
    if (!m || m.kind === 'text') return;
    opts = opts || {};
    const set = (label, pct) => { busy.set(id, { label, pct }); updateBusyUI(id); };
    set('Hazırlanıyor', 0);
    try {
      const blob = await DB.getBlob(id);
      if (!blob) throw new Error('Dosya bulunamadı.');
      let text = '', source = '';
      let skippedNote = '';
      if (m.kind === 'image') {
        set('Metin tanınıyor', 5);
        const r = await ocr(blob, (p) => set('Metin tanınıyor', Math.round(5 + p * 90)));
        text = r.text; source = r.by;
      } else {
        const lib = await getPdfjs();
        const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: true, enableXfa: false }).promise;
        const from = Math.max(1, Math.min(doc.numPages, opts.from || m.pageFrom || 1));
        const to = Math.max(from, Math.min(doc.numPages, opts.to || m.pageTo || Math.min(doc.numPages, 30), from + 79));
        const parts = [];
        const skippedKinds = [];
        let scanned = 0;
        for (let p = from; p <= to; p++) {
          set('Sayfa ' + p + ' / ' + to, Math.round(((p - from) / (to - from + 1)) * 100));
          const page = await doc.getPage(p);
          let t = joinPdfItems((await page.getTextContent()).items);
          if (t.replace(/\s/g, '').length < 40) {
            // Taranmış sayfa: görüntüye çevirip metin tanı
            scanned++;
            try {
              const vp = page.getViewport({ scale: 2 });
              const c = document.createElement('canvas');
              c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
              await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
              t = (await ocr(c)).text;
            } catch (e) { t = ''; }
          }
          const kind = E.pageKind(t);
          if (kind) skippedKinds.push(kind);
          else if (t.trim()) parts.push(t.trim());
          page.cleanup();
        }
        closeDoc(doc);
        if (!parts.length && skippedKinds.length) throw new Error('Seçtiğin sayfalar kitabın giriş ya da son bölümü (' + Array.from(new Set(skippedKinds)).join(', ') + '). Konuların olduğu bir sayfa aralığı seç.');
        if (skippedKinds.length) skippedNote = skippedKinds.length + ' giriş/son sayfa atlandı (' + Array.from(new Set(skippedKinds)).slice(0, 3).join(', ') + ').';
        text = parts.join('\n\n');
        source = scanned ? 'pdf+ocr' : 'pdf';
        m.pageFrom = from; m.pageTo = to;
      }
      text = E.cleanText(text);
      if (m.kind === 'image' && text.length >= 20) {
        const fm = E.stripFrontMatter(text);
        if (fm.skipped.length && fm.text.trim().length < 40) throw new Error('Bu sayfa kitabın “' + fm.skipped[0] + '” bölümü; sorular ders konularından hazırlanır. Konu anlatılan bir sayfanın fotoğrafını çek.');
        if (fm.skipped.length) { text = E.cleanText(fm.text); skippedNote = '“' + fm.skipped[0] + '” bölümü atlandı.'; }
      }
      if (text.length < 20) throw new Error('Bu materyalde okunabilir metin bulunamadı. Daha net bir fotoğraf dene ya da metni kendin yaz.');
      m.text = text.slice(0, LIMITS.textChars);
      m.textSource = source;
      await DB.put(m);
      toast('“' + m.name + '” metne dönüştürüldü.' + (skippedNote ? ' ' + skippedNote : ''));
    } catch (e) {
      toast(e.message || 'Metne dönüştürülemedi.', true);
      throw e;
    } finally {
      busy.delete(id);
      await loadMaterials();
      updateBusyUI(id, true);
    }
  }

  // ======================================================================
  // Soru üretimi ve değerlendirme
  // ======================================================================
  async function createSession(opts) {
    let text = '';
    if (opts.demo) text = E.DEMO_TEXT;
    else {
      const mats = opts.materialIds.map((id) => MATS.find((m) => m.id === id)).filter((m) => m && m.text);
      text = mats.map((m) => m.text).join('\n\n');
    }
    if (text.length < 60) throw new Error('Soru üretmek için yeterli metin yok. Önce materyali metne dönüştür.');
    let questions = null, engine = 'yerel';
    if (!opts.demo && Server.ready) {
      try {
        questions = await Server.questions({ text: text.slice(0, 24000), count: opts.count, level: opts.level, subject: opts.subject, grade: opts.grade, title: opts.title });
        engine = 'ai';
      } catch (e) { questions = null; }
    }
    if (!questions) questions = E.generate(text.slice(0, 120000), { count: opts.count, level: opts.level }).map(sanitizeQuestion).filter(Boolean);
    if (!questions.length) throw new Error('Bu metinden soru çıkarılamadı. Daha uzun ya da açıklayıcı bir bölüm seç.');
    const s = sanitizeSession({
      id: uid(), title: opts.title || (opts.demo ? 'Demo: Fotosentez' : 'Çalışma'), subject: opts.subject, grade: opts.grade, level: opts.level,
      source: opts.demo ? 'demo' : 'materyal', engine, createdAt: Date.now(), questions, answers: {}, idx: 0
    });
    S.sessions.push(s);
    if (S.sessions.length > LIMITS.sessions) S.sessions.splice(0, S.sessions.length - LIMITS.sessions);
    save(true);
    return s;
  }

  async function evaluateAnswer(s, q, text) {
    if (s.source !== 'demo' && Server.ready) {
      try { return await Server.evaluate({ question: q.q, reference: q.ref, keys: q.keys, answer: text, grade: s.grade, subject: s.subject }); } catch (e) { /* yerel değerlendirmeye düş */ }
    }
    return sanitizeEval(E.evaluate(q, text));
  }

  // ======================================================================
  // Çalışma süresi ölçümü
  // ======================================================================
  const Timer = (() => {
    let sid = null, start = 0;
    return {
      start(id) { this.flush(); sid = id; start = Date.now(); },
      flush() {
        if (!sid || !start) return;
        const now = Date.now();
        const d = Math.min(now - start, 20 * 60000); // tek seferde en fazla 20 dk say (unutulan ekran)
        const s = S.sessions.find((x) => x.id === sid);
        if (s && d > 0) {
          s.activeMs += d;
          if (s.source !== 'demo') { const k = dayKey(now); S.days[k] = (S.days[k] || 0) + d; }
          save();
        }
        start = document.hidden ? 0 : now;
      },
      stop() { this.flush(); sid = null; start = 0; },
      live(id) { return id === sid && start ? Math.min(Date.now() - start, 20 * 60000) : 0; },
      resume() { if (sid && !start) start = Date.now(); }
    };
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Timer.resume(); });

  // ======================================================================
  // Bildirimler, alt sayfalar, onay
  // ======================================================================
  function toast(msg, bad) {
    const wrap = $('#toasts');
    const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg, role: bad ? 'alert' : 'status' });
    wrap.appendChild(t);
    setTimeout(() => t.remove(), bad ? 6000 : 3200);
  }

  let sheetOpen = null;
  function openSheet(title, build, opts) {
    closeSheet(true);
    const layer = $('#layer');
    const scrim = h('div', { class: 'scrim', on: { click: () => closeSheet() } });
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Kapat', on: { click: () => closeSheet() } }, icon('x'));
    const body = h('div', { class: 'stack' });
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'grab' }),
      h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn),
      body);
    layer.append(scrim, sheet);
    const prevFocus = document.activeElement;
    sheetOpen = { scrim, sheet, prevFocus, onClose: opts && opts.onClose };
    history.pushState({ sheet: true }, '', location.href);
    build(body, () => closeSheet());
    setTimeout(() => { const f = sheet.querySelector('input, textarea, select, button:not(.icon-btn)'); (f || closeBtn).focus({ preventScroll: true }); }, 60);
    return () => closeSheet();
  }
  function closeSheet(silent) {
    if (!sheetOpen) return;
    const s = sheetOpen; sheetOpen = null;
    s.scrim.remove(); s.sheet.remove();
    if (s.onClose) try { s.onClose(); } catch (e) { /* yok say */ }
    if (!silent && history.state && history.state.sheet) { ignorePop = true; history.back(); }
    if (s.prevFocus && s.prevFocus.focus) s.prevFocus.focus({ preventScroll: true });
  }
  let ignorePop = false;
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (sheetOpen) closeSheet(true);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

  function confirmBox(title, message, okText, danger) {
    return new Promise((resolve) => {
      let done = false;
      openSheet(title, (b, close) => {
        b.append(
          h('p', { class: 'muted', text: message }),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-secondary', type: 'button', text: 'Vazgeç', on: { click: () => close() } }),
            h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', text: okText, on: { click: () => { done = true; close(); } } }))
        );
      }, { onClose: () => resolve(done) });
    });
  }

  function notice(text, kind) {
    return h('div', { class: 'notice' + (kind ? ' ' + kind : '') }, icon(kind === 'info' ? 'info' : 'warn'), h('div', {}, text));
  }

  // ======================================================================
  // Tema
  // ======================================================================
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const t = S.settings.theme;
    const black = t === 'amoled';
    const dark = black || t === 'dark' || (t === 'auto' && mq && mq.matches);
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (black) root.setAttribute('data-black', '1'); else root.removeAttribute('data-black');
    if (S.settings.accent && S.settings.accent !== 'blue') root.setAttribute('data-accent', S.settings.accent); else root.removeAttribute('data-accent');
    if (S.settings.textSize === 'large') root.setAttribute('data-size', 'large'); else root.removeAttribute('data-size');
    const bg = getComputedStyle(root).getPropertyValue('--bg-top').trim();
    if (!Native.setColors(dark, /^#[0-9a-f]{6}$/i.test(bg) ? bg : '')) Native.setTheme(dark);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg || (dark ? '#061229' : '#e6f2fe')));
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);

  // ======================================================================
  // Yönlendirme
  // ======================================================================
  function route() {
    const parts = (location.hash || '#/ana').replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x));
    return { name: parts[0] || 'ana', arg: parts[1] || '' };
  }
  function go(path) { if (location.hash !== '#/' + path) location.hash = '#/' + path; else render(); }
  window.addEventListener('hashchange', () => { closeSheet(true); render(); window.scrollTo(0, 0); });

  const TAB_OF = { ana: 'ana', materyaller: 'materyaller', calis: 'calis', sinav: 'calis', sonuc: 'calis', ilerleme: 'ilerleme', oturum: 'ilerleme', veli: 'veli', vozet: 'vozet', vcocuk: 'vcocuk', vpaylas: 'vpaylas' };
  const TABS = {
    ogrenci: [['ana', 'Ana sayfa', 'home'], ['materyaller', 'Materyaller', 'book'], ['calis', 'Çalış', 'edit'], ['ilerleme', 'İlerleme', 'chart'], ['veli', 'Veli', 'users']],
    veli: [['vozet', 'Özet', 'chart'], ['vcocuk', 'Çocuklarım', 'users'], ['vpaylas', 'Paylaş', 'share']]
  };
  let tabMode = '';
  function renderTabbar(mode, tab) {
    const nav = $('.tabbar');
    if (tabMode !== mode) {
      tabMode = mode;
      nav.style.setProperty('grid-template-columns', 'repeat(' + TABS[mode].length + ', 1fr)');
      fill(nav, ...TABS[mode].map(([id, label, ic]) => h('a', { href: '#/' + id, 'data-tab': id }, h('span', { class: 'pill' }, icon(ic)), label)));
    }
    nav.querySelectorAll('a').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  let pollTimer = 0;
  function render() {
    const r = route();
    const view = $('#view');
    clearInterval(pollTimer);
    if (fabEl) fabEl.hidden = true;
    if (r.name !== 'sinav') Timer.stop();
    if (r.name !== 'veli') parentUnlocked = false; // Veli sekmesinden çıkınca panel yeniden kilitlenir
    let node;
    const role = S.settings.role;
    const bare = !S.settings.introDone || !role;
    document.body.classList.toggle('no-tabs', bare);
    try {
      if (!S.settings.introDone) node = viewIntro();
      else if (!role) node = viewRole();
      else if (role === 'veli') {
        const name = ['vozet', 'vcocuk', 'vpaylas'].includes(r.name) ? r.name : 'vozet';
        renderTabbar('veli', name);
        node = name === 'vcocuk' ? viewKids() : name === 'vpaylas' ? viewShareHub() : viewKidSummary();
      } else {
        const tab = TAB_OF[r.name] && !/^v(ozet|cocuk|paylas)$/.test(r.name) ? TAB_OF[r.name] : 'ana';
        renderTabbar('ogrenci', tab);
        switch (r.name) {
          case 'materyaller': node = viewMaterials(); break;
          case 'calis': node = viewStudy(); break;
          case 'sinav': node = viewExam(r.arg); break;
          case 'sonuc': node = viewResult(r.arg); break;
          case 'ilerleme': node = viewProgress(); break;
          case 'oturum': node = viewReview(r.arg); break;
          case 'veli': node = viewParent(); break;
          default: node = viewHome();
        }
      }
    } catch (e) {
      node = h('div', { class: 'empty' }, h('b', { text: 'Bu ekran açılamadı.' }), h('p', { text: 'Ana sayfaya dönüp tekrar dene.' }), h('button', { class: 'btn btn-primary', type: 'button', text: 'Ana sayfaya dön', on: { click: () => go(S.settings.role === 'veli' ? 'vozet' : 'ana') } }));
      console.error(e);
    }
    fill(view, h('div', { class: 'view' }, node));
  }

  // ======================================================================
  // İstatistik yardımcıları
  // ======================================================================
  function sessionStats(s) {
    const evs = s.questions.map((q) => s.answers[q.id] && s.answers[q.id].eval).filter(Boolean);
    const avg = evs.length ? Math.round(evs.reduce((a, e) => a + e.score, 0) / evs.length) : null;
    return { answered: evs.length, total: s.questions.length, avg, done: !!s.finishedAt || evs.length === s.questions.length };
  }
  function realSessions() { return S.sessions.filter((s) => s.source !== 'demo'); }
  function totals(list) {
    let answered = 0, sum = 0, ms = 0;
    list.forEach((s) => { const st = sessionStats(s); answered += st.answered; if (st.avg !== null) sum += st.avg * st.answered; ms += s.activeMs; });
    return { answered, avg: answered ? Math.round(sum / answered) : null, ms };
  }
  function streak() {
    let n = 0;
    const d = new Date();
    if (!S.days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (S.days[dayKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function bySubject(list) {
    const map = new Map();
    list.forEach((s) => {
      const st = sessionStats(s);
      if (!st.answered) return;
      const k = s.subject;
      const o = map.get(k) || { subject: k, sum: 0, n: 0 };
      o.sum += st.avg * st.answered; o.n += st.answered;
      map.set(k, o);
    });
    return Array.from(map.values()).map((o) => ({ subject: o.subject, avg: Math.round(o.sum / o.n), n: o.n })).sort((a, b) => b.n - a.n);
  }
  function weakTopics(list) {
    const map = new Map();
    list.forEach((s) => s.questions.forEach((q) => {
      const a = s.answers[q.id];
      if (!a || !a.eval) return;
      const k = (q.topic || s.title).trim();
      const o = map.get(k) || { topic: k, subject: s.subject, sum: 0, n: 0 };
      o.sum += a.eval.score; o.n++;
      map.set(k, o);
    }));
    return Array.from(map.values()).map((o) => ({ topic: o.topic, subject: o.subject, avg: Math.round(o.sum / o.n), n: o.n })).filter((o) => o.avg < 60).sort((a, b) => a.avg - b.avg).slice(0, 5);
  }
  const scoreClass = (v) => (v >= 75 ? 'ok' : v >= 45 ? 'warn' : 'bad');
  const greet = () => { const hr = new Date().getHours(); return hr < 6 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar'; };

  // ======================================================================
  // EKRAN: Ana sayfa
  // ======================================================================
  function dayLabel(t) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const diff = Math.floor((d0 - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
    return diff <= 0 ? 'Bugün' : diff === 1 ? 'Dün' : fmtDate(t);
  }

  function viewHome() {
    const name = S.settings.name;
    const real = realSessions();
    const active = [...S.sessions].reverse().find((s) => !sessionStats(s).done);
    const withText = MATS.filter((m) => m.text);
    const t = totals(real);
    const lastDone = [...real].reverse().find((s) => sessionStats(s).answered);

    let sub;
    if (active) { const st = sessionStats(active); sub = '“' + active.title + '” çalışmanda ' + st.answered + '/' + st.total + ' soru tamam.'; }
    else if (real.length) sub = 'Bugün de harika bir adım atıyorsun!';
    else if (withText.length) sub = withText.length + ' materyalin soru üretmeye hazır.';
    else if (MATS.length) sub = 'Materyallerini metne dönüştür, soruları hazırlayayım.';
    else sub = 'Kitabının sayfasını çek, sana özel sorular hazırlayayım.';

    const score = h('button', { class: 'score-card', type: 'button', on: { click: () => go('ilerleme') } },
      ring(t.avg || 0, 84, { accent: true, prefix: '%', label: 'Genel başarı' }),
      h('span', {}, h('b', { text: 'Genel Başarı Oranı' }), h('small', { text: t.answered ? fmtNum(t.answered) + ' soru · ' + fmtMin(t.ms) + ' çalışma' : 'İlk çalışmanı bitirince burada görünür' })),
      icon('right'));

    const tile = (cls, ic, title, subText, onClick) => h('button', { class: 'tile ' + cls, type: 'button', on: { click: onClick } }, h('span', { class: 'ic' }, icon(ic)), h('span', {}, h('b', { text: title }), h('small', { text: subText })));
    const tiles = h('div', { class: 'tiles' },
      tile('t-green', 'book', 'Materyallerim', MATS.length ? MATS.length + ' materyal' : 'Ekle', () => go('materyaller')),
      tile('t-purple', 'edit', 'Çalış', active ? 'Devam et' : 'Yeni çalışma', () => go(active ? 'sinav/' + active.id : 'calis')),
      tile('t-orange', 'ticket', 'Sınav Kâğıdı', lastDone ? 'Son sonuç' : 'Yeni sınav', () => go(lastDone ? 'sonuc/' + lastDone.id : 'calis')),
      tile('t-blue', 'chart', 'İlerleme', 'Sonuçlar', () => go('ilerleme')));

    const recent = [...real].reverse().slice(0, 4);
    const activity = recent.length ? h('div', {},
      h('div', { class: 'section-head' }, h('h2', { text: 'Son Aktiviteler' }), h('button', { class: 'link-btn', type: 'button', text: 'Tümü', on: { click: () => go('ilerleme') } })),
      h('div', { class: 'activity' }, recent.map((s) => {
        const st = sessionStats(s);
        return h('button', { class: 'act-item', type: 'button', on: { click: () => go(st.done ? 'sonuc/' + s.id : 'sinav/' + s.id) } },
          h('span', { class: 'ic' }, icon('edit')),
          h('span', { css: { 'min-width': '0' } }, h('b', { text: s.title + (s.grade !== 'Diğer' ? ' · ' + s.grade + '. Sınıf' : '') }), h('small', { text: dayLabel(s.createdAt) + ' · ' + st.answered + ' soru' })),
          st.avg === null ? h('span', {}) : h('span', { class: 'chip ' + scoreClass(st.avg), text: '%' + st.avg }),
          icon('right'));
      }))) : null;

    const steps = h('ol', { class: 'steps' },
      h('li', { class: MATS.length ? 'done' : '' }, h('div', {}, h('b', { text: 'Materyal ekle' }), h('p', { class: 'muted small', text: 'Kitap sayfasının fotoğrafını çek, PDF seç ya da MEB kitabını indir.' }))),
      h('li', { class: withText.length ? 'done' : '' }, h('div', {}, h('b', { text: 'Metne dönüştür' }), h('p', { class: 'muted small', text: 'Hoca sayfadaki yazıyı okur; istersen düzeltebilirsin.' }))),
      h('li', { class: real.length ? 'done' : '' }, h('div', {}, h('b', { text: 'Soruları kendi cümlelerinle cevapla' }), h('p', { class: 'muted small', text: 'Her cevaba puan ve “neyi geliştirebilirsin” notu gelir.' }))));

    return h('div', {},
      h('section', { class: 'greet' }, h('h1', {}, 'Merhaba', name ? h('span', { text: ', ' + name }) : null, ' 👋'), h('p', { text: sub })),
      score,
      active ? h('button', { class: 'btn btn-primary btn-block', type: 'button', css: { 'margin-top': '14px' }, on: { click: () => go('sinav/' + active.id) } }, icon('play'), 'Kaldığın yerden devam et') : null,
      tiles,
      activity,
      !real.length ? h('div', {}, h('div', { class: 'section-head' }, h('h2', { text: 'Nasıl çalışır?' })), h('div', { class: 'panel' }, steps)) : null,
      !real.length ? h('div', { class: 'panel tight', css: { 'margin-top': '12px' } },
        h('div', { class: 'row spread' }, h('div', {}, h('b', { text: 'Önce denemek ister misin?' }), h('p', { class: 'muted small', text: 'Hazır bir Fen konusu üzerinde akışı dene. Sonuçlar “Demo” olarak işaretlenir.' })),
          h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'Demoyu aç', on: { click: startDemo } }))) : null,
      h('div', { css: { 'margin-top': '16px' } }, shareAppCard()));
  }

  async function startDemo() {
    try {
      const s = await createSession({ demo: true, title: 'Demo: Fotosentez', subject: 'Fen Bilimleri', grade: '6', count: 5, level: 'orta' });
      go('sinav/' + s.id);
    } catch (e) { toast(e.message, true); }
  }

  // ======================================================================
  // EKRAN: Materyaller
  // ======================================================================
  function pick(id) {
    const el = document.getElementById(id);
    el.value = '';
    try { if (el.showPicker) el.showPicker(); else el.click(); } catch (e) { el.click(); }
  }

  let matFilter = 'all';
  const FILTERS = [['all', 'Tümü'], ['pdf', 'PDF'], ['image', 'Görsel'], ['text', 'Metin']];
  function addOptions(close) {
    const run = (fn) => () => { if (close) close(); setTimeout(fn, 60); };
    const item = (ic, title, sub, fn) => h('button', { type: 'button', on: { click: run(fn) } }, h('span', { class: 'ic' }, icon(ic)), h('span', {}, title, h('small', { text: sub })));
    return h('div', { class: 'menu-list' },
      item('camera', 'Fotoğraf çek', 'Kitap sayfasını kamerayla çek', () => pick('inCamera')),
      item('image', 'Galeriden seç', 'Birden fazla fotoğraf seçebilirsin', () => pick('inGallery')),
      item('pdf', 'PDF ekle', 'Bir ya da daha fazla PDF', () => pick('inPdf')),
      item('text', 'Metin yapıştır', 'Not ya da kopyaladığın yazı', openPasteSheet),
      item('book', 'MEB ders kitabı indir', Native.can('books') ? 'Güncel kitabı resmî siteden uygulamaya indir' : 'Güncel kitapları resmî siteden bul ve ekle', openBooksSheet));
  }
  function openAddSheet() { openSheet('Materyal ekle', (b, close) => b.append(addOptions(close))); }

  function viewMaterials() {
    const counts = { all: MATS.length, pdf: 0, image: 0, text: 0 };
    MATS.forEach((m) => { counts[m.kind]++; });
    if (!counts[matFilter]) matFilter = 'all';
    const shown = MATS.filter((m) => matFilter === 'all' || m.kind === matFilter);
    const filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Türe göre süz' }, FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(matFilter === k), text: label + ' (' + counts[k] + ')', on: { click: () => { matFilter = k; render(); } } })));
    showFab(true);
    if (!MATS.length) {
      return h('div', {},
        h('div', { class: 'page-head' }, h('h1', { text: 'Materyallerim' })),
        h('div', { class: 'empty', css: { 'margin-bottom': '14px' } }, h('b', { text: 'Henüz materyal yok' }), h('p', { text: 'Kitap sayfasının fotoğrafını çek, PDF ekle ya da güncel MEB kitabını indir.' })),
        h('div', { class: 'panel', css: { padding: '8px' } }, addOptions()),
        DB.memory ? h('div', { css: { 'margin-top': '12px' } }, notice('Bu tarayıcı dosya saklamaya izin vermiyor; eklediklerin sayfa kapanınca silinir.')) : null);
    }
    return h('div', {},
      h('div', { class: 'page-head' }, h('h1', { text: 'Materyallerim' }), h('span', { class: 'chip info', text: MATS.length + ' dosya' })),
      MATS.length > 1 ? filters : null,
      h('div', { class: 'mat-list' }, shown.map(materialCard)),
      MATS.length > 1 ? h('div', { css: { 'text-align': 'center', 'margin-top': '8px' } }, h('button', { class: 'link-btn', type: 'button', text: 'Listeyi temizle', on: { click: clearAllMaterials } })) : null,
      DB.memory ? h('div', { css: { 'margin-top': '12px' } }, notice('Bu tarayıcı dosya saklamaya izin vermiyor; eklediklerin sayfa kapanınca silinir.')) : null);
  }

  let fabEl = null;
  function showFab(on) {
    if (!fabEl) {
      fabEl = h('button', { class: 'fab', type: 'button', 'aria-label': 'Materyal ekle', on: { click: openAddSheet } }, icon('plus'));
      document.body.appendChild(fabEl);
    }
    fabEl.hidden = !on;
  }

  async function clearAllMaterials() {
    if (!(await confirmBox('Tüm materyaller silinsin mi?', 'Eklediğin bütün fotoğraf, PDF ve metinler bu cihazdan silinir. Çözdüğün sorular ve ilerlemen kalır.', 'Hepsini sil', true))) return;
    await DB.clear();
    busy.clear();
    await loadMaterials();
    toast('Materyal listesi temizlendi.');
    render();
  }

  function textStatusChip(m) {
    const b = busy.get(m.id);
    if (b) return h('span', { class: 'chip info' }, h('span', { class: 'dot' }), b.label + (b.pct ? ' %' + b.pct : ''));
    if (m.text) return h('span', { class: 'chip ok', text: 'Metin hazır, ' + fmtNum(m.text.length) + ' karakter' });
    return h('span', { class: 'chip warn', text: 'Metin yok' });
  }

  function materialActions(m) {
    openSheet(m.name, (b, close) => {
      const item = (ic, title, fn, danger) => h('button', { type: 'button', class: danger ? 'danger' : '', on: { click: () => { close(); setTimeout(fn, 60); } } }, h('span', { class: 'ic' }, icon(ic)), h('span', { text: title }));
      b.append(h('div', { class: 'menu-list' },
        item('edit', 'Aç ve düzenle', () => openMaterialSheet(m.id)),
        m.kind !== 'text' && !busy.get(m.id) ? item('scan', m.text ? 'Metni yeniden çıkar' : 'Metne dönüştür', () => (m.kind === 'pdf' && m.pages > 30 ? openMaterialSheet(m.id) : extract(m.id).catch(() => {}))) : null,
        m.text ? item('play', 'Bununla çalış', () => { preselect = [m.id]; go('calis'); }) : null,
        item('trash', 'Kaldır', async () => { if (await confirmBox('Kaldırılsın mı?', '“' + m.name + '” bu cihazdan silinecek.', 'Kaldır', true)) { await removeMaterial(m.id); toast('Materyal kaldırıldı.'); render(); } }, true)));
    });
  }

  function materialCard(m) {
    const kindLabel = m.kind === 'pdf' ? 'PDF' : m.kind === 'image' ? 'Görsel' : 'Metin';
    const fic = m.kind === 'image' && m.thumb
      ? h('div', { class: 'file-ic f-img' }, h('img', { src: m.thumb, alt: '' }))
      : h('div', { class: 'file-ic ' + (m.kind === 'pdf' ? 'f-pdf' : m.kind === 'image' ? 'f-img' : 'f-txt') }, icon(m.kind === 'pdf' ? 'pdf' : m.kind === 'image' ? 'image' : 'text'));
    const b = busy.get(m.id);
    const sub = [kindLabel, m.kind === 'pdf' && m.pages ? m.pages + ' sayfa' : null, m.kind !== 'text' ? fmtSize(m.size) : null, new Date(m.addedAt).toLocaleDateString('tr-TR')].filter(Boolean).join(' · ');
    const meta = h('div', { class: 'mat-meta' }, textStatusChip(m), m.origin === 'meb' ? h('span', { class: 'chip info', text: 'MEB' }) : null);
    const prog = b ? h('div', { class: 'progress-line' }, h('i', { css: { width: (b.pct || 3) + '%' } })) : null;
    return h('article', { class: 'mat', 'data-mat': m.id },
      fic,
      h('button', { class: 'mat-body', type: 'button', 'aria-label': m.name + ' materyalini aç', on: { click: () => openMaterialSheet(m.id) } },
        h('div', { class: 'mat-name', text: m.name }), h('div', { class: 'mat-sub', text: sub }), meta, prog),
      h('button', { class: 'kebab', type: 'button', 'aria-label': m.name + ' için seçenekler', on: { click: () => materialActions(m) } }, icon('more')));
  }

  function updateBusyUI(id, finished) {
    const card = document.querySelector('[data-mat="' + CSS.escape(id) + '"]');
    const m = MATS.find((x) => x.id === id);
    if (card && m) card.replaceWith(materialCard(m));
    if (finished && sheetOpen && sheetOpen.matId === id) openMaterialSheet(id);
    const det = document.getElementById('matBusy');
    if (det && det.dataset.id === id) { const b = busy.get(id); det.textContent = b ? b.label + (b.pct ? ' %' + b.pct : '') : ''; }
  }

  function openPasteSheet() {
    openSheet('Metin yapıştır', (b, close) => {
      const title = h('input', { type: 'text', maxlength: LIMITS.nameChars, placeholder: 'Örn. Hücre ve bölümleri', id: 'pTitle' });
      const area = h('textarea', { id: 'pText', rows: 10, maxlength: LIMITS.textChars, placeholder: 'Ders notunu ya da kitaptan kopyaladığın metni buraya yapıştır.' });
      b.append(
        h('label', { class: 'field' }, h('span', { text: 'Başlık' }), title),
        h('label', { class: 'field' }, h('span', { text: 'Metin' }), area),
        h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Materyal olarak ekle', on: { click: async () => {
          try { await addTextMaterial(title.value, area.value); close(); toast('Metin materyal olarak eklendi.'); render(); } catch (e) { toast(e.message, true); }
        } } }));
    });
  }

  function renderBookProgress(el) {
    if (!bookState) { fill(el); return; }
    fill(el, h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('div', { class: 'grow' }, h('div', { text: 'İndiriliyor: ' + (bookState.name || 'ders kitabı') }), h('div', { class: 'progress-line' }, h('i', { css: { width: bookState.pct + '%' } })))));
  }

  function openBooksSheet() {
    openSheet('MEB ders kitapları', (b) => {
      const prog = h('div', { id: 'bookProgress' });
      renderBookProgress(prog);
      if (Native.can('books')) {
        b.append(
          h('p', { class: 'muted', text: 'Millî Eğitim Bakanlığı’nın resmî kitap sitesi uygulamanın içinde açılır. Sınıfını, dersini seç ve kitabın “PDF” bağlantısına dokun; kitap otomatik olarak materyallerine eklenir.' }),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', on: { click: () => { if (!Native.openBooks()) toast('Kitap sitesi açılamadı.', true); } } }, icon('book'), 'Kitap sitesini aç'),
          prog,
          notice('Ders kitapları büyük dosyalardır (20–100 MB). Wi-Fi’de indirmen önerilir. Eklendikten sonra çalışacağın sayfa aralığını seçerek metne dönüştür.', 'info'));
      } else {
        b.append(
          h('p', { class: 'muted', text: 'Güncel ders kitapları Millî Eğitim Bakanlığı’nın resmî sitesinde ücretsiz PDF olarak yayımlanır. Tarayıcı güvenliği nedeniyle web sürümü kitabı doğrudan indiremez; iki adımda eklersin:' }),
          h('ol', { class: 'steps' },
            h('li', {}, h('div', {}, h('b', { text: 'Resmî siteyi aç' }), h('p', { class: 'muted small', text: 'Sınıfını ve dersini seç, kitabın PDF’ini telefonuna indir.' }))),
            h('li', {}, h('div', {}, h('b', { text: 'PDF olarak ekle' }), h('p', { class: 'muted small', text: 'İndirdiğin dosyayı “PDF ekle” ile seç.' })))),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => openExternal(MEB_URL) } }, icon('book'), 'Siteyi aç'),
            h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => { closeSheet(); setTimeout(() => pick('inPdf'), 80); } } }, icon('pdf'), 'PDF ekle')),
          notice('Android uygulamasında kitap tek dokunuşla uygulamanın içine iner.', 'info'));
      }
      b.append(h('p', { class: 'xs muted', text: 'Kaynak: tymm.meb.gov.tr (Türkiye Yüzyılı Maarif Modeli ders kitapları).' }));
    });
  }

  async function openMaterialSheet(id) {
    const m = MATS.find((x) => x.id === id);
    if (!m) return;
    let objUrl = null;
    openSheet(m.name, async (b, close) => {
      const b0 = busy.get(id);
      const preview = h('div', {});
      b.append(preview);
      if (m.kind === 'image') {
        const blob = await DB.getBlob(id);
        if (blob) { objUrl = URL.createObjectURL(blob); preview.append(h('img', { class: 'preview-img', src: objUrl, alt: m.name })); }
      } else if (m.thumb) preview.append(h('img', { class: 'preview-img', src: m.thumb, alt: '', css: { 'max-height': '28vh' } }));

      const status = h('p', { class: 'small muted', id: 'matBusy', 'data-id': id, text: b0 ? b0.label : '' });
      if (m.kind === 'pdf') {
        const from = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: m.pages || 9999, value: m.pageFrom || 1, 'aria-label': 'Başlangıç sayfası' });
        const to = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: m.pages || 9999, value: m.pageTo || Math.min(m.pages || 1, 30), 'aria-label': 'Bitiş sayfası' });
        b.append(h('div', { class: 'panel tight stack' },
          h('div', { class: 'label', text: 'Hangi sayfaları çalışacaksın?' }),
          h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', { class: 'hint', text: 'Başlangıç' }), from), h('label', { class: 'field' }, h('span', { class: 'hint', text: 'Bitiş' + (m.pages ? ' (en fazla ' + m.pages + ')' : '') }), to)),
          h('p', { class: 'hint', text: 'Tek seferde en fazla 80 sayfa dönüştürülür. İstiklal Marşı, Gençliğe Hitabe, İçindekiler, Önsöz, kitap tanıtımı, cevap anahtarı ve kaynakça sayfaları kendiliğinden atlanır.' + (m.frontPages ? ' Bu kitapta konular ' + (m.frontPages + 1) + '. sayfadan başlıyor.' : '') }),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: !!b0, on: { click: () => {
            const f = Math.max(1, parseInt(from.value, 10) || 1), t = Math.max(f, parseInt(to.value, 10) || f);
            if (m.pages && f > m.pages) { toast('Başlangıç sayfası kitaptaki sayfa sayısından büyük.', true); return; }
            extract(id, { from: f, to: Math.min(t, f + 79) }).catch(() => {});
            status.textContent = 'Başladı…';
          } } }, icon('scan'), m.text ? 'Bu sayfaları yeniden dönüştür' : 'Metne dönüştür'),
          status));
      } else if (m.kind === 'image') {
        b.append(h('button', { class: 'btn ' + (m.text ? 'btn-secondary' : 'btn-primary') + ' btn-block', type: 'button', disabled: !!b0, on: { click: () => { extract(id).catch(() => {}); status.textContent = 'Başladı…'; } } }, icon('scan'), m.text ? 'Metni yeniden tanı' : 'Metne dönüştür'), status);
      }

      const area = h('textarea', { rows: 9, maxlength: LIMITS.textChars, value: m.text, placeholder: 'Henüz metin yok. Dönüştürebilir ya da kendin yazabilirsin.', 'aria-label': 'Materyal metni' });
      const nameIn = h('input', { type: 'text', maxlength: LIMITS.nameChars, value: m.name, 'aria-label': 'Materyal adı' });
      b.append(
        h('label', { class: 'field' }, h('span', { text: 'Ad' }), nameIn),
        h('label', { class: 'field' }, h('span', { text: 'Metni düzenle' }), h('span', { class: 'hint', text: 'Tanınan yazıda hata varsa düzelt. Sorular bu metinden üretilir.' }), area),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', type: 'button', text: 'Kaydet', on: { click: async () => {
            const cur = MATS.find((x) => x.id === id);
            if (!cur) return;
            cur.name = cleanName(nameIn.value, cur.name);
            cur.text = E.cleanText(area.value).slice(0, LIMITS.textChars);
            if (cur.text && !cur.textSource) cur.textSource = 'elle';
            await DB.put(cur); await loadMaterials(); toast('Kaydedildi.'); close(); render();
          } } }),
          h('button', { class: 'btn btn-primary', type: 'button', disabled: !m.text, on: { click: () => { close(); preselect = [id]; go('calis'); } } }, 'Bununla çalış')));
      if (m.textSource) b.append(h('p', { class: 'xs muted', text: 'Metin kaynağı: ' + ({ cihaz: 'cihaz üstü metin tanıma', ai: 'yapay zekâ ile metin tanıma', tarayici: 'tarayıcı içi metin tanıma', pdf: 'PDF içindeki yazı', 'pdf+ocr': 'PDF yazısı + taranmış sayfalarda metin tanıma', elle: 'elle girildi' }[m.textSource] || m.textSource) }));
    }, { onClose: () => { if (objUrl) URL.revokeObjectURL(objUrl); } });
    if (sheetOpen) sheetOpen.matId = id;
  }

  // ======================================================================
  // EKRAN: Çalış (yeni çalışma oluştur)
  // ======================================================================
  let preselect = null;
  const form = { title: '', subject: 'Fen Bilimleri', grade: '6', count: 10, level: 'orta' };

  function seg(options, current, onPick, label) {
    const box = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    options.forEach(([v, t]) => box.append(h('button', { type: 'button', 'aria-pressed': String(v === current), text: t, on: { click: () => { box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); box.children[options.findIndex((o) => o[0] === v)].setAttribute('aria-pressed', 'true'); onPick(v); } } })));
    return box;
  }

  function viewStudy() {
    const open = [...S.sessions].reverse().filter((s) => !sessionStats(s).done).slice(0, 3);
    const usableMats = MATS.filter((m) => m.text);
    const sel = new Set((preselect || (usableMats[0] ? [usableMats[0].id] : [])).filter((id) => usableMats.some((m) => m.id === id)));
    preselect = null;
    const busyBox = h('div', {});
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, icon('spark'), 'Soruları oluştur');

    const titleIn = h('input', { type: 'text', maxlength: LIMITS.titleChars, value: form.title, placeholder: 'Örn. Fotosentez', on: { input: (e) => { form.title = e.target.value; } } });
    const subj = h('select', { on: { change: (e) => { form.subject = e.target.value; mathNote.hidden = form.subject !== 'Matematik'; } } }, SUBJECTS.map((s) => h('option', { value: s, text: s })));
    subj.value = form.subject;
    const grade = h('select', { on: { change: (e) => { form.grade = e.target.value; } } }, GRADES.map((g) => h('option', { value: g, text: g === 'Diğer' ? 'Diğer' : g + '. sınıf' })));
    grade.value = form.grade;
    const mathNote = notice('Matematikte işlem soruları üretilemez; konu anlatımı ve tanımlar üzerinden sorular hazırlanır.', 'info');
    mathNote.hidden = form.subject !== 'Matematik';

    const matList = usableMats.length
      ? h('div', { class: 'check-list' }, usableMats.map((m) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: sel.has(m.id), on: { change: (e) => { if (e.target.checked) sel.add(m.id); else sel.delete(m.id); submit.disabled = !sel.size; } } }),
          h('span', { class: 'grow' }, h('span', { class: 'mat-name', css: { display: 'block' }, text: m.name }), h('span', { class: 'xs muted', text: fmtNum(m.text.length) + ' karakter' })))))
      : h('div', { class: 'empty' }, h('b', { text: 'Soru üretecek metin yok' }), h('p', { text: 'Önce bir materyal ekleyip metne dönüştür.' }),
          h('button', { class: 'btn btn-primary', type: 'button', text: 'Materyallere git', css: { 'margin-top': '12px' }, on: { click: () => go('materyaller') } }));
    submit.disabled = !sel.size;
    submit.addEventListener('click', async () => {
      if (!sel.size) return;
      submit.disabled = true;
      fill(busyBox, h('div', { class: 'busy', role: 'status' }, h('div', { class: 'spinner' }), 'Hoca soruları hazırlıyor…'));
      try {
        const firstName = (MATS.find((m) => sel.has(m.id)) || {}).name || 'Çalışma';
        const s = await createSession({ materialIds: Array.from(sel), title: form.title.trim() || firstName, subject: form.subject, grade: form.grade, count: form.count, level: form.level });
        const note = s.questions.length < form.count ? ' Metin kısa olduğu için ' + s.questions.length + ' soru çıkarılabildi.' : '';
        toast((s.engine === 'ai' ? 'Sorular yapay zekâ ile hazırlandı.' : 'Sorular cihazında hazırlandı.') + note);
        go('sinav/' + s.id);
      } catch (e) { toast(e.message, true); fill(busyBox); submit.disabled = false; }
    });

    const engineNote = Server.ready
      ? notice('Sorular ve değerlendirme yapay zekâ ile yapılır. Seçtiğin materyalin metni bu işlem için sunucuya gönderilir, saklanmaz.', 'info')
      : notice('Sorular internet gerekmeden cihazında, metindeki tanım, neden-sonuç ve önemli bilgilerden çıkarılır. Yapay zekâ bağlandığında daha zengin sorular gelir.', 'info');

    return h('div', {},
      h('h1', { text: 'Çalış', css: { margin: '8px 0 14px' } }),
      open.length ? h('div', { class: 'stack', css: { 'margin-bottom': '22px' } }, h('h2', { text: 'Yarım kalanlar' }),
        open.map((s) => { const st = sessionStats(s); return h('button', { class: 'hist-item', type: 'button', on: { click: () => go('sinav/' + s.id) } },
          h('div', {}, h('b', { text: s.title }), h('div', { class: 'xs muted', text: st.answered + '/' + st.total + ' soru, ' + fmtDate(s.createdAt) }), s.source === 'demo' ? h('span', { class: 'chip demo', text: 'Demo' }) : null), icon('right')); })) : null,
      h('div', { class: 'panel stack' },
        h('h2', { text: 'Yeni çalışma' }),
        h('div', { class: 'field' }, h('span', { text: 'Materyal' }), matList),
        h('label', { class: 'field' }, h('span', { text: 'Konu başlığı' }), titleIn),
        h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', { text: 'Ders' }), subj), h('label', { class: 'field' }, h('span', { text: 'Sınıf' }), grade)),
        mathNote,
        h('div', { class: 'field' }, h('span', { text: 'Soru sayısı' }), seg([[5, '5'], [10, '10'], [15, '15'], [20, '20']], form.count, (v) => { form.count = v; }, 'Soru sayısı')),
        h('div', { class: 'field' }, h('span', { text: 'Zorluk' }), seg([['kolay', 'Kolay'], ['orta', 'Orta'], ['zor', 'Zor']], form.level, (v) => { form.level = v; }, 'Zorluk')),
        engineNote, submit, busyBox),
      h('div', { class: 'panel tight', css: { 'margin-top': '14px' } },
        h('div', { class: 'row spread' },
          h('div', {}, h('div', { class: 'row' }, h('b', { text: 'Demo örneği' }), h('span', { class: 'chip demo', text: 'Demo' })), h('p', { class: 'muted small', text: 'Hazır bir Fen metniyle akışı dene; ilerlemene sayılmaz.' })),
          h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'Dene', on: { click: startDemo } }))));
  }

  // ======================================================================
  // EKRAN: Sınav kâğıdı
  // ======================================================================
  function ring(score, size, opts) {
    size = size || 84; opts = opts || {};
    const sw = size > 120 ? 12 : 8;
    const r = size / 2 - sw / 2 - 2, c = 2 * Math.PI * r;
    const color = opts.accent ? 'var(--accent)' : score >= 75 ? 'var(--ok)' : score >= 45 ? 'var(--amber)' : 'var(--bad)';
    const svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' });
    svg.append(svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': sw }));
    svg.append(svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - Math.max(0, Math.min(100, score)) / 100) }));
    const label = h('b', {}, opts.prefix ? opts.prefix + score : String(score), opts.suffix ? h('small', { text: opts.suffix }) : null);
    return h('div', { class: 'ring', role: 'img', 'aria-label': (opts.label || 'Puan') + ' ' + score }, svg, label);
  }

  function gradeCard(q, a, onRetry, onNext, isLast) {
    const ev = a.eval;
    const verdictText = { dogru: 'Doğru', kismen: 'Kısmen doğru', gelistir: 'Geliştirilmeli' }[ev.verdict];
    return h('section', { class: 'grade', 'aria-label': 'Değerlendirme' },
      h('div', { class: 'grade-top' }, ring(ev.score),
        h('div', {}, h('span', { class: 'chip ' + scoreClass(ev.score), text: verdictText }), h('h3', { css: { 'margin-top': '6px' }, text: ev.score >= 75 ? 'Harika, konuyu anlamışsın.' : ev.score >= 45 ? 'Yaklaştın, birkaç eksik var.' : 'Bu konuyu bir kez daha okuyalım.' }),
          a.hint ? h('p', { class: 'xs muted', text: 'İpucu kullanıldı.' }) : null)),
      h('div', { class: 'grade-body' },
        ev.good.length ? h('div', {}, h('h3', { text: 'Neyi doğru yaptın?' }), h('ul', {}, ev.good.map((x) => h('li', { text: x })))) : null,
        ev.improve.length ? h('div', {}, h('h3', { text: 'Neyi geliştirebilirsin?' }), h('ul', {}, ev.improve.map((x) => h('li', { text: x })))) : null,
        (ev.explanation || q.ref) ? h('div', {}, h('h3', { text: 'Örnek açıklama' }), h('div', { class: 'ref', text: ev.explanation || q.ref })) : null,
        h('p', { class: 'by', text: ev.by === 'ai' ? 'Yapay zekâ değerlendirmesi: anlamı değerlendirir, yine de hata yapabilir.' : 'Cihaz içi değerlendirme: kavramlara ve anlam benzerliğine bakar; yaklaşık bir puandır.' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', type: 'button', on: { click: onRetry } }, icon('refresh'), 'Tekrar dene'),
          h('button', { class: 'btn btn-primary', type: 'button', on: { click: onNext } }, isLast ? 'Sonucu gör' : 'Sonraki soru', icon('right')))));
  }

  function viewExam(sid) {
    const s = S.sessions.find((x) => x.id === sid);
    if (!s) return h('div', { class: 'empty' }, h('b', { text: 'Çalışma bulunamadı' }), h('button', { class: 'btn btn-primary', type: 'button', text: 'Çalış ekranına dön', on: { click: () => go('calis') } }));
    Timer.start(s.id);
    const wrap = h('div', {});
    let editing = false;

    function draw() {
      const q = s.questions[s.idx];
      const a = s.answers[q.id];
      const draftKey = s.id + ':' + q.id;
      const st = sessionStats(s);
      const isLast = s.idx === s.questions.length - 1;

      const dots = h('div', { class: 'qdots', role: 'tablist', 'aria-label': 'Sorular' }, s.questions.map((qq, i) => {
        const aa = s.answers[qq.id];
        const cls = (i === s.idx ? 'cur ' : '') + (aa && aa.eval ? 'r-' + aa.eval.verdict : '');
        return h('button', { class: cls, type: 'button', role: 'tab', 'aria-selected': String(i === s.idx), 'aria-label': (i + 1) + '. soru' + (aa && aa.eval ? ', puan ' + aa.eval.score : ''), text: i + 1, on: { click: () => { s.idx = i; editing = false; save(); draw(); } } });
      }));

      const paper = h('div', { class: 'sheet-paper' },
        h('div', { class: 'row spread' }, h('span', { class: 'qnum', text: 'Soru ' + (s.idx + 1) + ' / ' + s.questions.length }), h('div', { class: 'row' }, q.topic ? h('span', { class: 'chip', text: clampStr(q.topic, 24) }) : null, h('button', { class: 'qshare', type: 'button', 'aria-label': 'Bu soruyu arkadaşlarınla paylaş', title: 'Soruyu paylaş', on: { click: () => shareQuestion(s, q) } }, icon('share')))),
        h('p', { class: 'qtext', id: 'qtext', text: q.q }));

      const showForm = !a || !a.eval || editing;
      if (showForm) {
        const area = h('textarea', { class: 'answer', id: 'answer', maxlength: LIMITS.answerChars, 'aria-labelledby': 'qtext', placeholder: 'Cevabını kendi cümlelerinle buraya yaz…', value: S.drafts[draftKey] != null ? S.drafts[draftKey] : (a ? a.text : '') });
        const count = h('span', { text: '' });
        const send = h('button', { class: 'btn btn-primary', type: 'button' }, icon('check'), 'Cevabı gönder');
        const sync = () => { const n = area.value.trim().length; count.textContent = fmtNum(area.value.length) + ' / ' + fmtNum(LIMITS.answerChars); send.disabled = n < 2; };
        area.addEventListener('input', () => { S.drafts[draftKey] = area.value; save(); sync(); });
        sync();
        const hintBox = h('div', {});
        const hintBtn = q.keys.length && !q.exact ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', on: { click: () => {
          const used = s.answers[q.id] || (s.answers[q.id] = { text: '', at: Date.now(), hint: false, eval: null });
          used.hint = true; save();
          fill(hintBox, notice('İpucu: cevabında “' + q.keys[0] + '” ile ilgili bilgiye yer ver. ' + (q.keys.length > 1 ? 'Toplam ' + q.keys.length + ' önemli noktaya değinmeye çalış.' : ''), 'info'));
          hintBtn.remove();
        } } }, icon('bulb'), 'İpucu') : null;
        send.addEventListener('click', async () => {
          const text = area.value.trim();
          if (text.length < 2) { toast('Önce bir cevap yaz.', true); area.focus(); return; }
          send.disabled = true; area.readOnly = true;
          fill(send, h('span', { class: 'spinner' }), 'Değerlendiriliyor…');
          const ev = await evaluateAnswer(s, q, text.slice(0, LIMITS.answerChars));
          const prev = s.answers[q.id];
          s.answers[q.id] = { text: text.slice(0, LIMITS.answerChars), at: Date.now(), hint: !!(prev && prev.hint), eval: ev };
          delete S.drafts[draftKey];
          if (Object.keys(s.answers).filter((k) => s.answers[k].eval).length === s.questions.length && !s.finishedAt) s.finishedAt = Date.now();
          Sync.schedule();
          editing = false;
          Timer.flush(); save(true);
          draw();
          const g = wrap.querySelector('.grade');
          if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        paper.append(area, h('div', { class: 'answer-meta' }, h('span', { text: 'Taslağın otomatik saklanır.' }), count));
        fill(wrap, 
          examHead(s, st), dots, paper, hintBox,
          h('div', { class: 'exam-nav' },
            h('button', { class: 'btn btn-secondary icon-only', type: 'button', 'aria-label': 'Önceki soru', disabled: s.idx === 0, on: { click: () => { s.idx--; editing = false; save(); draw(); } } }, icon('left')),
            send,
            h('button', { class: 'btn btn-secondary icon-only', type: 'button', 'aria-label': 'Sonraki soru', disabled: isLast, on: { click: () => { s.idx++; editing = false; save(); draw(); } } }, icon('right'))),
          hintBtn ? h('div', { css: { 'margin-top': '8px', 'text-align': 'center' } }, hintBtn) : null);
      } else {
        paper.append(h('div', { class: 'stack', css: { 'margin-top': '14px' } }, h('div', { class: 'label', text: 'Cevabın' }), h('p', { css: { 'white-space': 'pre-wrap' }, text: a.text })));
        fill(wrap, examHead(s, st), dots, paper,
          gradeCard(q, a, () => { editing = true; S.drafts[draftKey] = a.text; draw(); setTimeout(() => { const t = $('#answer'); if (t) t.focus(); }, 50); },
            () => { if (isLast || st.answered === st.total) { if (st.answered === st.total) { if (!s.finishedAt) { s.finishedAt = Date.now(); save(true); } go('sonuc/' + s.id); } else { const next = s.questions.findIndex((qq) => !(s.answers[qq.id] && s.answers[qq.id].eval)); s.idx = next < 0 ? s.idx : next; save(); draw(); window.scrollTo(0, 0); } } else { s.idx++; save(); draw(); window.scrollTo(0, 0); } }, isLast && st.answered === st.total));
      }
    }
    draw();
    return wrap;
  }

  const mmss = (ms) => { const sec = Math.floor(ms / 1000); const m = Math.floor(sec / 60); return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec % 60).padStart(2, '0'); };
  function examHead(s, st) {
    const timer = h('span', { class: 'timer', id: 'examTimer', 'aria-label': 'Çalışma süresi' }, icon('clock'), h('span', { text: mmss(s.activeMs + Timer.live(s.id)) }));
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { const el = document.getElementById('examTimer'); if (el && el.lastChild) el.lastChild.textContent = mmss(s.activeMs + Timer.live(s.id)); }, 1000);
    return h('div', {},
      h('div', { class: 'exam-bar' },
        h('span', { class: 'row' }, icon('refresh'), 'Soru ' + (s.idx + 1) + ' / ' + s.questions.length),
        timer),
      h('div', { class: 'exam-head' },
        h('div', { class: 'grow' }, h('h2', { text: s.title }), h('div', { class: 'row wrap', css: { 'margin-top': '6px', gap: '6px' } },
          h('span', { class: 'chip', text: s.subject }),
          s.source === 'demo' ? h('span', { class: 'chip demo', text: 'Demo örneği' }) : null,
          h('span', { class: 'chip ' + (s.engine === 'ai' ? 'info' : ''), text: s.engine === 'ai' ? 'Yapay zekâ soruları' : 'Cihazda üretildi' }))),
        h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: st.answered === st.total ? 'Sonuç' : 'Bitir', on: { click: async () => {
          if (st.answered < st.total && !(await confirmBox('Çalışma bitirilsin mi?', 'Cevaplanmayan ' + (st.total - st.answered) + ' soru puana katılmaz. İstersen daha sonra devam edebilirsin.', 'Bitir'))) return;
          s.finishedAt = s.finishedAt || Date.now(); save(true); go('sonuc/' + s.id);
        } } })));
  }

  // ======================================================================
  // EKRAN: Sonuç ve tekrar
  // ======================================================================
  function viewResult(sid) {
    const s = S.sessions.find((x) => x.id === sid);
    if (!s) return viewProgress();
    const st = sessionStats(s);
    const weak = s.questions.filter((q) => { const a = s.answers[q.id]; return !a || !a.eval || a.eval.score < 60; });
    const cnt = { dogru: 0, kismen: 0, gelistir: 0, bos: 0 };
    s.questions.forEach((q) => { const a = s.answers[q.id]; if (a && a.eval) cnt[a.eval.verdict]++; else cnt.bos++; });
    const n = s.questions.length;
    const pct = (k) => '%' + Math.round((cnt[k] / n) * 100);
    const avg = st.avg || 0;
    const row = (cls, ic, label, k) => h('div', { class: 'res-row ' + cls }, h('span', { class: 'ic' }, icon(ic)), h('span', { text: label }), h('b', { text: cnt[k] }), h('em', { text: pct(k) }));
    const details = h('div', { class: 'hist', hidden: true, css: { 'margin-top': '14px' } }, s.questions.map((q, i) => {
      const a = s.answers[q.id];
      const sc = a && a.eval ? a.eval.score : null;
      return h('button', { class: 'hist-item', type: 'button', on: { click: () => { s.idx = i; save(); go('sinav/' + s.id); } } },
        h('div', { class: 'grow' }, h('div', { class: 'xs muted', text: (i + 1) + '. soru' }), h('div', { text: clampStr(q.q, 110) })),
        h('span', { class: 'score-pill chip ' + (sc === null ? '' : scoreClass(sc)), text: sc === null ? '–' : sc }));
    }));
    const detBtn = h('button', { class: 'btn btn-secondary btn-block', type: 'button', text: 'Detayları gör' });
    detBtn.addEventListener('click', () => { details.hidden = !details.hidden; detBtn.textContent = details.hidden ? 'Detayları gör' : 'Detayları gizle'; if (!details.hidden) details.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    return h('div', {},
      h('section', { class: 'res-hero' },
        ring(avg, 176, { accent: true, suffix: '/100', label: 'Ortalama puan' }),
        h('h1', { text: st.answered === 0 ? 'Çalışma kaydedildi' : avg >= 75 ? 'Tebrikler!' : avg >= 45 ? 'İyi gidiyorsun!' : 'Pes etmek yok!' }),
        h('p', { text: avg >= 75 ? 'Harika bir performans gösterdin.' : weak.length ? weak.length + ' soruyu tekrar çalışmanı öneririm.' : 'Biraz daha tekrarla zirve senin.' }),
        h('div', { class: 'row', css: { 'justify-content': 'center', 'margin-top': '10px', gap: '6px' } },
          h('span', { class: 'chip', text: s.title }), h('span', { class: 'chip', text: fmtMin(s.activeMs) }),
          s.source === 'demo' ? h('span', { class: 'chip demo', text: 'Demo' }) : null)),
      h('div', { class: 'res-stats' },
        row('rr-ok', 'check', 'Doğru', 'dogru'),
        row('rr-mid', 'info', 'Kısmen doğru', 'kismen'),
        row('rr-bad', 'x', 'Geliştirilmeli', 'gelistir'),
        row('rr-empty', 'clock', 'Boş', 'bos')),
      h('div', { class: 'stack', css: { 'margin-top': '16px' } },
        detBtn,
        h('button', { class: 'btn btn-primary btn-block', type: 'button', on: { click: () => retryWeak(s, weak.length ? weak : s.questions) } }, icon('refresh'), weak.length ? 'Zayıf soruları tekrar çöz' : 'Tekrar dene'),
        st.answered ? h('button', { class: 'btn btn-soft btn-block', type: 'button', on: { click: () => shareResult(s) } }, icon('share'), 'Sonucumu paylaş') : null,
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Ana sayfaya dön', on: { click: () => go('ana') } })),
      details);
  }

  function retryWeak(s, weak) {
    const ns = sanitizeSession({ id: uid(), title: clampStr('Tekrar: ' + s.title, LIMITS.titleChars), subject: s.subject, grade: s.grade, level: s.level, source: s.source, engine: s.engine, createdAt: Date.now(), questions: weak.map((q, i) => Object.assign({}, q, { id: 'q' + (i + 1) })), answers: {}, idx: 0 });
    S.sessions.push(ns); save(true);
    go('sinav/' + ns.id);
  }

  function viewReview(sid) {
    const s = S.sessions.find((x) => x.id === sid);
    return s ? viewResult(sid) : viewProgress();
  }

  // ======================================================================
  // EKRAN: İlerleme
  // ======================================================================
  function trendChart(list) {
    return trendSvg(list.map((s) => sessionStats(s).avg));
  }
  function trendSvg(values) {
    const pts = values.filter((v) => v !== null && v !== undefined).slice(-12).map((v) => ({ st: { avg: v } }));
    if (pts.length < 2) return h('p', { class: 'muted small', text: 'Eğilim grafiği için en az iki tamamlanmış çalışma gerekir.' });
    const W = 340, H = 150, P = 26;
    const x = (i) => P + (i * (W - P - 10)) / (pts.length - 1);
    const y = (v) => H - 20 - (v / 100) * (H - 36);
    const svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Son çalışmaların puan eğilimi' });
    [0, 50, 100].forEach((v) => { svg.append(svgEl('line', { class: 'grid', x1: P, x2: W - 6, y1: y(v), y2: y(v) })); const t = svgEl('text', { x: 0, y: y(v) + 4 }); t.textContent = '%' + v; svg.append(t); });
    let d = '', area = '';
    pts.forEach((p, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.st.avg).toFixed(1); });
    area = d + 'L' + x(pts.length - 1).toFixed(1) + ' ' + y(0) + 'L' + x(0) + ' ' + y(0) + 'Z';
    svg.append(svgEl('path', { class: 'ar', d: area }), svgEl('path', { class: 'ln', d }));
    pts.forEach((p, i) => svg.append(svgEl('circle', { class: 'pt', cx: x(i), cy: y(p.st.avg), r: 4 })));
    return svg;
  }

  function subjectBars(list) { return barsFromRows(bySubject(list)); }
  function barsFromRows(rows) {
    if (!rows.length) return h('p', { class: 'muted small', text: 'Henüz ders bazında veri yok.' });
    return h('div', { class: 'bars' }, rows.map((r) => h('div', { class: 'bar' },
      h('span', { text: r.subject }),
      h('div', { class: 'track', role: 'img', 'aria-label': r.subject + ' ortalama %' + r.avg }, h('i', { class: r.avg >= 75 ? 'high' : r.avg >= 45 ? 'mid' : 'low', css: { width: Math.max(4, r.avg) + '%' } })),
      h('b', { text: '%' + r.avg }))));
  }

  function weekStrip(daysMap) {
    const days = daysMap || S.days;
    const names = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
    const box = h('div', { class: 'week' });
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ms = days[dayKey(d)] || 0;
      box.append(h('div', {}, h('i', { class: ms > 0 ? 'on' : '', title: fmtMin(ms) }), names[d.getDay()]));
    }
    return box;
  }

  function viewProgress() {
    const real = realSessions();
    const demo = S.sessions.filter((s) => s.source === 'demo');
    const showDemo = !real.length && demo.length;
    const list = real.length ? real : demo;
    if (!list.length) {
      return h('div', {}, h('h1', { text: 'İlerlemem', css: { margin: '8px 0 14px' } }),
        h('div', { class: 'empty' }, h('b', { text: 'Henüz çalışma yok' }), h('p', { text: 'İlk çalışmanı bitirdiğinde başarı eğilimin, ders ortalamaların ve zorlandığın konular burada görünür.' }),
          h('div', { class: 'btn-row', css: { 'margin-top': '14px' } }, h('button', { class: 'btn btn-primary', type: 'button', text: 'Çalışmaya başla', on: { click: () => go('calis') } }), h('button', { class: 'btn btn-secondary', type: 'button', text: 'Demoyu dene', on: { click: startDemo } }))));
    }
    const t = totals(list);
    const weak = weakTopics(list);
    return h('div', {},
      h('div', { class: 'row spread', css: { margin: '8px 0 14px' } }, h('h1', { text: 'İlerlemem' }), showDemo ? h('span', { class: 'chip demo', text: 'Demo verisi' }) : null),
      showDemo ? notice('Gösterilenler yalnızca demo çalışmalarından. Kendi materyalinle çalıştığında gerçek ilerlemen görünür.') : null,
      h('div', { class: 'stats', css: { 'margin-top': showDemo ? '12px' : '0' } },
        h('div', { class: 'stat' }, h('b', { text: fmtNum(t.answered) }), h('span', { text: 'çözülen soru' })),
        h('div', { class: 'stat' }, h('b', { text: t.avg === null ? '–' : '%' + t.avg }), h('span', { text: 'ortalama başarı' })),
        h('div', { class: 'stat' }, h('b', { text: fmtMin(t.ms) }), h('span', { text: 'toplam çalışma' })),
        h('div', { class: 'stat' }, h('b', { text: streak() + ' gün' }), h('span', { text: 'çalışma serisi' }))),
      h('div', { class: 'section-head' }, h('h2', { text: 'Bu hafta' })),
      h('div', { class: 'panel' }, weekStrip()),
      h('div', { class: 'section-head' }, h('h2', { text: 'Başarı eğilimi' })),
      h('div', { class: 'panel' }, trendChart(list)),
      h('div', { class: 'section-head' }, h('h2', { text: 'Derslere göre' })),
      h('div', { class: 'panel' }, subjectBars(list)),
      h('div', { class: 'section-head' }, h('h2', { text: 'Zorlandığın konular' })),
      weak.length ? h('div', { class: 'hist' }, weak.map((w) => h('div', { class: 'hist-item' }, h('div', {}, h('b', { text: w.topic }), h('div', { class: 'xs muted', text: w.subject + ', ' + w.n + ' soru' })), h('span', { class: 'score-pill chip ' + scoreClass(w.avg), text: '%' + w.avg }))))
        : h('p', { class: 'muted small', text: 'Ortalaması %60’ın altında kalan konu yok.' }),
      h('div', { class: 'section-head' }, h('h2', { text: 'Geçmiş çalışmalar' })),
      h('div', { class: 'hist' }, [...list].reverse().slice(0, 30).map((s) => {
        const st = sessionStats(s);
        return h('button', { class: 'hist-item', type: 'button', on: { click: () => go('oturum/' + s.id) } },
          h('div', {}, h('b', { text: s.title }), h('div', { class: 'xs muted', text: fmtDateTime(s.createdAt) + ', ' + s.subject + ', ' + st.answered + '/' + st.total + ' soru' })),
          h('span', { class: 'score-pill chip ' + (st.avg === null ? '' : scoreClass(st.avg)), text: st.avg === null ? '–' : '%' + st.avg }));
      })));
  }

  // ======================================================================
  // EKRAN: Veli paneli (PIN korumalı)
  // ======================================================================
  let parentUnlocked = false;

  // crypto.subtle olmayan ortamlar (ör. dosyadan açma) için yedek SHA-256
  function sha256Hex(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = new TextEncoder().encode(str);
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 4, l * 8); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) { const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0; const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0; hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
      H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + hh].map((x) => x >>> 0);
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
  }
  async function hashPin(pin, salt, iter, algo) {
    if (algo === 'pbkdf2' && window.crypto && crypto.subtle) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: iter, hash: 'SHA-256' }, key, 256);
      return Array.from(new Uint8Array(bits), (x) => x.toString(16).padStart(2, '0')).join('');
    }
    let hsh = salt + ':' + pin;
    for (let i = 0; i < Math.min(iter, 4000); i++) hsh = sha256Hex(hsh + salt);
    return hsh;
  }
  function eqConst(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

  function pinPad(title, sub, onDone) {
    let val = '';
    const dots = h('div', { class: 'pin', 'aria-hidden': 'true' });
    const live = h('p', { class: 'small muted', 'aria-live': 'polite', css: { 'text-align': 'center', 'min-height': '20px', margin: '0 0 8px' } });
    const okBtn = h('button', { class: 'fn', type: 'button', text: 'Tamam', 'aria-label': 'PIN’i onayla' });
    const paint = () => { fill(dots, ...Array.from({ length: Math.max(4, val.length) }, (_, i) => h('i', { class: i < val.length ? 'on' : '' }))); okBtn.disabled = val.length < 4; };
    const press = (d) => { if (val.length < 8) { val += d; paint(); } };
    okBtn.addEventListener('click', async () => { if (val.length < 4) return; const v = val; val = ''; paint(); await onDone(v, live); });
    const pad = h('div', { class: 'keypad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => h('button', { type: 'button', text: d, on: { click: () => press(d) } })),
      h('button', { class: 'fn', type: 'button', text: 'Sil', 'aria-label': 'Son rakamı sil', on: { click: () => { val = val.slice(0, -1); paint(); } } }),
      h('button', { type: 'button', text: '0', on: { click: () => press('0') } }), okBtn);
    paint();
    const node = h('div', { class: 'panel pin-panel' }, h('div', { class: 'lock-ic' }, icon('lock')), h('h2', { text: title }), h('p', { class: 'muted small', text: sub }), dots, live, pad);
    node.addEventListener('keydown', (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { val = val.slice(0, -1); paint(); } else if (e.key === 'Enter') okBtn.click(); });
    node.tabIndex = -1;
    return node;
  }

  function viewParent() {
    const box = h('div', {});
    const head = h('div', { class: 'row spread', css: { margin: '8px 0 14px' } }, h('h1', { text: 'Veli paneli' }), parentUnlocked ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', on: { click: () => { parentUnlocked = false; render(); } } }, icon('lock'), 'Kilitle') : null);
    box.append(head);
    if (!S.parent) {
      let first = null;
      const pad = pinPad('Veli PIN’i oluştur', 'Paneli çocuğunun açmaması için 4–8 haneli bir PIN belirle.', async (v, live) => {
        if (!first) { first = v; live.textContent = 'Onaylamak için PIN’i tekrar gir.'; return; }
        if (first !== v) { first = null; live.textContent = 'PIN’ler eşleşmedi. Baştan gir.'; return; }
        const saltB = new Uint8Array(16); crypto.getRandomValues(saltB);
        const salt = Array.from(saltB, (x) => x.toString(16).padStart(2, '0')).join('');
        const algo = window.crypto && crypto.subtle ? 'pbkdf2' : 'sha-loop';
        const iter = algo === 'pbkdf2' ? 150000 : 4000;
        S.parent = { hash: await hashPin(v, salt, iter, algo), salt, iter, algo, fails: 0, lockUntil: 0 };
        save(true); parentUnlocked = true; toast('Veli PIN’i oluşturuldu.'); render();
      });
      box.append(pad, h('div', { css: { 'margin-top': '12px' } }, notice('PIN bu cihazda saklanır, kimseyle paylaşılmaz. Unutursan Ayarlar’dan tüm verileri silerek sıfırlayabilirsin.', 'info')));
      return box;
    }
    if (!parentUnlocked) {
      const p = S.parent;
      const pad = pinPad('Veli PIN’i', 'Raporu görmek için PIN’i gir.', async (v, live) => {
        const now = Date.now();
        if (p.lockUntil > now) { live.textContent = 'Çok fazla deneme. ' + Math.ceil((p.lockUntil - now) / 1000) + ' sn sonra tekrar dene.'; return; }
        const hsh = await hashPin(v, p.salt, p.iter, p.algo);
        if (eqConst(hsh, p.hash)) { p.fails = 0; p.lockUntil = 0; save(true); parentUnlocked = true; render(); return; }
        p.fails++;
        if (p.fails >= 5) p.lockUntil = now + Math.min(3600e3, 30e3 * Math.pow(2, p.fails - 5));
        save(true);
        live.textContent = p.lockUntil > now ? 'Çok fazla yanlış deneme. ' + Math.ceil((p.lockUntil - now) / 1000) + ' sn bekle.' : 'PIN yanlış. Kalan deneme: ' + (5 - p.fails);
      });
      box.append(pad);
      setTimeout(() => pad.focus({ preventScroll: true }), 50);
      return box;
    }
    box.append(
      pairingPanel(),
      h('div', { class: 'section-head' }, h('h2', { text: 'Bu cihazdaki rapor' })),
      notice('Öğrencinin yazdığı cevap metinleri gizlilik için gösterilmez.', 'info'),
      h('div', { css: { 'margin-top': '12px' } }, renderSummary(buildSummary())),
      h('div', { class: 'section-head' }, h('h2', { text: 'Güvenlik' })),
      h('div', { class: 'panel stack' },
        h('button', { class: 'btn btn-secondary btn-block', type: 'button', text: 'PIN’i değiştir', on: { click: async () => { if (await confirmBox('PIN değiştirilsin mi?', 'Mevcut PIN silinecek ve yeni bir PIN oluşturacaksın.', 'Değiştir')) { S.parent = null; save(true); parentUnlocked = false; render(); } } } })));
    return box;
  }

  // ======================================================================
  // Özet: öğrencinin ilerlemesi (cevap metni içermez) — yerel rapor ve bulut için ortak
  // ======================================================================
  function buildSummary() {
    const real = realSessions();
    const t = totals(real);
    const days = {};
    for (let i = 0; i < 35; i++) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d); if (S.days[k]) days[k] = Math.round(S.days[k]); }
    return sanitizeSummary({
      name: S.settings.name, updatedAt: Date.now(),
      totals: { answered: t.answered, avg: t.avg, ms: t.ms }, streak: streak(), days,
      subjects: bySubject(real).slice(0, 16), weak: weakTopics(real),
      sessions: real.slice(-30).reverse().map((s) => { const st = sessionStats(s); return { title: s.title, subject: s.subject, grade: s.grade, at: s.createdAt, answered: st.answered, total: st.total, avg: st.avg, ms: s.activeMs }; }),
      materials: MATS.length
    });
  }

  function weekMs(days) { let ms = 0; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); ms += days[dayKey(d)] || 0; } return ms; }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'az önce' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' sa önce' : fmtDateTime(t); };

  function renderSummary(sum, opts) {
    opts = opts || {};
    const box = h('div', {});
    if (!sum || (!sum.totals.answered && !sum.sessions.length)) {
      box.append(h('div', { class: 'empty' }, h('b', { text: 'Henüz rapor oluşacak çalışma yok' }), h('p', { text: opts.cloud ? 'Çocuğun kendi materyaliyle çalıştıkça ders, süre ve başarı bilgileri burada otomatik görünür.' : 'Kendi materyalinle çalıştıkça burada ders, süre ve başarı bilgileri görünür. Demo çalışmalar sayılmaz.' })));
      return box;
    }
    const strong = sum.subjects.filter((r) => r.avg >= 75);
    box.append(
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', { text: fmtMin(weekMs(sum.days)) }), h('span', { text: 'son 7 gün çalışma' })),
        h('div', { class: 'stat' }, h('b', { text: fmtNum(sum.totals.answered) }), h('span', { text: 'tamamlanan soru' })),
        h('div', { class: 'stat' }, h('b', { text: sum.totals.avg === null ? '–' : '%' + sum.totals.avg }), h('span', { text: 'genel başarı' })),
        h('div', { class: 'stat' }, h('b', { text: sum.streak + ' gün' }), h('span', { text: 'kesintisiz çalışma' }))),
      h('div', { class: 'section-head' }, h('h2', { text: 'Çalıştığı günler' })),
      h('div', { class: 'panel' }, weekStrip(sum.days)),
      h('div', { class: 'section-head' }, h('h2', { text: 'Başarı eğilimi' })),
      h('div', { class: 'panel' }, trendSvg(sum.sessions.slice().reverse().map((x) => x.avg))),
      h('div', { class: 'section-head' }, h('h2', { text: 'Derslere göre başarı' })),
      h('div', { class: 'panel' }, barsFromRows(sum.subjects)),
      h('div', { class: 'section-head' }, h('h2', { text: 'Güçlü ve zayıf alanlar' })),
      h('div', { class: 'panel stack' },
        h('div', {}, h('b', { text: 'Güçlü olduğu dersler' }), h('p', { class: 'muted', text: strong.length ? strong.map((r) => r.subject).join(', ') : 'Henüz %75’in üzerinde ortalaması olan ders yok.' })),
        h('div', {}, h('b', { text: 'Tekrar önerileri' }), sum.weak.length ? h('ul', { css: { margin: '4px 0 0', 'padding-left': '20px' } }, sum.weak.map((w) => h('li', { text: w.topic + ' (' + w.subject + ', %' + w.avg + ')' }))) : h('p', { class: 'muted', text: 'Şu an tekrar gerektiren konu görünmüyor.' }))),
      h('div', { class: 'section-head' }, h('h2', { text: 'Çalışma geçmişi' })),
      h('div', { class: 'hist' }, sum.sessions.slice(0, 25).map((x) => h('div', { class: 'hist-item' },
        h('div', {}, h('b', { text: x.title }), h('div', { class: 'xs muted', text: fmtDateTime(x.at) + ', ' + x.subject + ', ' + x.answered + '/' + x.total + ' soru, ' + fmtMin(x.ms) })),
        h('span', { class: 'score-pill chip ' + (x.avg === null ? '' : scoreClass(x.avg)), text: x.avg === null ? '–' : '%' + x.avg })))),
      h('div', { class: 'btn-row', css: { 'margin-top': '18px' } },
        h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => shareText(summaryText(sum), 'Sınav Hocası raporu') } }, icon('share'), 'Raporu paylaş')));
    return box;
  }

  function summaryText(sum) {
    const lines = ['📊 Sınav Hocası çalışma raporu (' + new Date().toLocaleDateString('tr-TR') + ')' + (sum.name ? ' – ' + sum.name : '')];
    lines.push('Son 7 gün: ' + fmtMin(weekMs(sum.days)) + ' çalışma, toplam ' + sum.totals.answered + ' soru, ortalama ' + (sum.totals.avg === null ? '-' : '%' + sum.totals.avg));
    const last = sum.sessions[0];
    if (last) lines.push('Son çalışma: ' + fmtDateTime(last.at) + ' – ' + last.title + ' (' + last.subject + ')');
    sum.subjects.forEach((r) => lines.push('• ' + r.subject + ': %' + r.avg + ' (' + r.n + ' soru)'));
    if (sum.weak.length) lines.push('Tekrar önerisi: ' + sum.weak.map((w) => w.topic).join(', '));
    return lines.join('\n');
  }

  // ======================================================================
  // Paylaşım: uygulama, soru (görsel kart + çözme bağlantısı), sonuç
  // ======================================================================
  async function shareText(text, title) {
    if (Native.has && Native.share(text)) return;
    if (navigator.share) { try { await navigator.share({ title: title || 'Sınav Hocası', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Panoya kopyalandı; istediğin gruba yapıştırabilirsin.'); } catch (e) { toast('Paylaşma bu cihazda desteklenmiyor.', true); }
  }
  async function shareWithImage(canvas, text, title) {
    try {
      const b64 = canvas.toDataURL('image/png').split(',')[1];
      if (Native.has && Native.shareImage(b64, text)) return;
      if (navigator.canShare) {
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], 'sinav-hocasi.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text, title }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      }
    } catch (e) { /* metinle devam */ }
    shareText(text, title);
  }

  function appInviteText() {
    return 'Ders çalışırken Sınav Hocası’nı kullanıyorum 🦉 Kitabın sayfasını çekiyorsun, senin kitabından soru soruyor ve cevabını değerlendiriyor. Ücretsiz, sen de dene: ' + DOWNLOAD_URL;
  }
  function shareApp() { shareText(appInviteText(), 'Sınav Hocası'); }

  function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function questionLink(s, q) {
    const data = { v: 1, q: clampStr(q.q, 500), r: clampStr(q.ref, 900), k: q.keys.slice(0, 6), e: q.exact || '', s: s.subject, g: s.grade, t: clampStr(s.title, 60) };
    return SITE + 'soru.html#' + b64urlEncode(JSON.stringify(data));
  }

  const imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) imgCache[src] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    return imgCache[src];
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }
  async function cardCanvas(kicker, mainText, footer) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0a1a3a'); g.addColorStop(1, '#040918');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const glow = x.createRadialGradient(W * 0.8, 180, 10, W * 0.8, 180, 520); glow.addColorStop(0, 'rgba(54,194,241,.35)'); glow.addColorStop(1, 'rgba(54,194,241,0)');
    x.fillStyle = glow; x.fillRect(0, 0, W, H);
    const logo = await loadImg('icons/mark-144.png');
    if (logo) x.drawImage(logo, 80, 80, 120, 120);
    const font = '"Roboto", "Segoe UI", system-ui, sans-serif';
    x.fillStyle = '#ffffff'; x.font = '800 60px ' + font; x.fillText('Sınav', 226, 158);
    const sw = x.measureText('Sınav ').width; x.fillStyle = '#4cc3f0'; x.fillText('Hocası', 226 + sw, 158);
    x.fillStyle = '#f2b24c'; x.font = '700 40px ' + font; x.fillText(kicker, 80, 330);
    // kâğıt
    x.fillStyle = '#fffefb'; const px = 60, py = 380, pw = W - 120, ph = 700;
    x.beginPath(); if (x.roundRect) x.roundRect(px, py, pw, ph, 36); else x.rect(px, py, pw, ph); x.fill();
    x.fillStyle = '#f2b8b8'; x.fillRect(px + 52, py, 4, ph);
    x.fillStyle = '#0c1a35'; x.font = '600 52px ' + font;
    const lines = wrapLines(x, mainText, pw - 140, 9);
    lines.forEach((l, i) => x.fillText(l, px + 90, py + 110 + i * 70));
    x.fillStyle = '#e9f1ff'; x.font = '700 44px ' + font; x.fillText(footer, 80, 1180);
    x.fillStyle = '#4cc3f0'; x.font = '600 36px ' + font; x.fillText(SITE.replace('https://', ''), 80, 1250);
    return c;
  }

  async function shareQuestion(s, q) {
    const link = questionLink(s, q);
    const text = '📚 ' + s.subject + (s.grade !== 'Diğer' ? ' (' + s.grade + '. sınıf)' : '') + ' sorusu:\n' + q.q + '\n\nSen de çöz, cevabını Hoca değerlendirsin 👉 ' + link;
    try { const c = await cardCanvas(s.subject + ' sorusu', q.q, 'Sen de çöz, cevabını Hoca değerlendirsin!'); await shareWithImage(c, text, 'Sınav Hocası sorusu'); }
    catch (e) { shareText(text, 'Sınav Hocası sorusu'); }
  }

  async function shareResult(s) {
    const st = sessionStats(s);
    const text = '🎯 “' + s.title + '” konusunda ' + st.answered + ' soru çözdüm, başarım %' + (st.avg || 0) + '! Sınav Hocası kendi kitabımdan soru soruyor. Sen de dene: ' + DOWNLOAD_URL;
    try { const c = await cardCanvas('Çalışma sonucum', s.title + ' konusunda ' + st.answered + ' soru çözdüm. Başarım: %' + (st.avg || 0), 'Kendi kitabından soru çöz, sen de dene!'); await shareWithImage(c, text, 'Sınav Hocası sonucu'); }
    catch (e) { shareText(text); }
  }

  function shareAppCard() {
    return h('button', { class: 'share-card', type: 'button', on: { click: shareApp } },
      h('span', { class: 'ic' }, icon('share')),
      h('span', {}, h('b', { css: { display: 'block' }, text: 'Arkadaşlarınla birlikte çalış' }), h('span', { class: 'small muted', text: 'Sınıf ya da veli grubuna Sınav Hocası’nı öner; soruları birbirinize gönderin.' })));
  }

  // ======================================================================
  // Bulut eşitleme — öğrenci cihazı özetini yükler
  // ======================================================================
  const Sync = {
    timer: 0,
    schedule(delay) {
      if (!S.sync || S.settings.role !== 'ogrenci') return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), delay == null ? 6000 : delay);
    },
    async push(force) {
      if (!S.sync || S.settings.role !== 'ogrenci') return false;
      const sum = buildSummary();
      const sig = sha256Hex(JSON.stringify(Object.assign({}, sum, { updatedAt: 0 }))).slice(0, 24);
      if (!force && sig === S.sync.lastHash) return true;
      try {
        await Server.sync('yukle', { familyId: S.sync.familyId, token: S.sync.token, summary: sum });
        S.sync.lastHash = sig; S.sync.lastPush = Date.now(); S.sync.error = '';
        save();
        return true;
      } catch (e) {
        if (e.status === 401 || e.status === 404) { S.sync = null; toast('Veli bağlantısı kaldırılmış.', true); }
        else if (S.sync) S.sync.error = navigator.onLine ? e.message : 'İnternet yok';
        save();
        return false;
      }
    }
  };

  function syncUnavailable() {
    return notice(Server.status === 'cevrimdisi' ? 'İnternet bağlantısı yok. Bağlanınca tekrar dene.' : 'Bulut eşitleme sunucusu şu an kullanılamıyor. Sunucu kurulunca bu özellik çalışır.');
  }

  // Öğrenci cihazında (PIN arkasında): veli telefonunu bağlama
  function pairingPanel() {
    const panel = h('div', { class: 'panel stack' });
    const draw = () => {
      fill(panel, h('div', { class: 'row' }, h('span', { class: 'lock-ic', css: { margin: '0' } }, icon('cloud')), h('div', {}, h('h2', { text: 'Veli telefonu' }), h('p', { class: 'small muted', text: S.sync ? 'Bağlı. İlerleme özeti otomatik gönderiliyor.' : 'Velinin telefonunda ilerlemeyi görmesi için bağla.' }))));
      if (!S.sync) {
        const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, icon('link'), 'Veli telefonunu bağla');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await Server.check();
            const d = await Server.sync('olustur', {});
            if (!ID_RE.test(d.familyId || '') || !ID_RE.test(d.token || '') || !/^[A-Z0-9]{6}$/.test(d.code || '')) throw new Error('Sunucu yanıtı geçersiz');
            S.sync = { familyId: d.familyId, token: d.token, lastPush: 0, lastHash: '', error: '' };
            save(true);
            await Sync.push(true);
            draw(); showCode(d.code);
          } catch (e) { toast(e.message || 'Bağlantı kurulamadı.', true); btn.disabled = false; }
        });
        panel.append(
          h('ol', { class: 'steps' },
            h('li', {}, h('div', {}, h('b', { text: 'Bu düğmeye dokun' }), h('p', { class: 'muted small', text: '6 haneli bir kod çıkar.' }))),
            h('li', {}, h('div', {}, h('b', { text: 'Velinin telefonunda Sınav Hocası’nı aç' }), h('p', { class: 'muted small', text: '“Veliyim”i seç ve kodu yaz.' })))),
          btn,
          h('p', { class: 'xs muted', text: 'Gönderilen: çalışma süresi, ders, puan ve konu başlıkları. Cevap metinleri ve kitap sayfaları gönderilmez.' }));
      } else {
        panel.append(
          h('div', { class: 'status-list' },
            h('div', {}, h('span', { text: 'Son gönderim' }), h('span', { class: 'chip ' + (S.sync.error ? 'warn' : 'ok'), text: S.sync.lastPush ? ago(S.sync.lastPush) : 'Bekliyor' })),
            S.sync.error ? h('div', {}, h('span', { class: 'small muted', text: S.sync.error }), h('button', { class: 'btn btn-sm btn-soft', type: 'button', text: 'Şimdi gönder', on: { click: async () => { if (await Sync.push(true)) toast('Gönderildi.'); draw(); } } })) : null),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-secondary', type: 'button', on: { click: async () => { try { const d = await Server.sync('kod', { familyId: S.sync.familyId, token: S.sync.token }); showCode(d.code); } catch (e) { toast(e.message, true); } } } }, icon('link'), 'Başka veli ekle'),
            h('button', { class: 'btn btn-secondary', type: 'button', on: { click: listParents } }, icon('users'), 'Bağlı veliler')),
          h('button', { class: 'btn btn-danger btn-block', type: 'button', on: { click: async () => {
            if (!(await confirmBox('Bağlantı kaldırılsın mı?', 'Bütün veli telefonlarının bağlantısı kesilir ve buluttaki ilerleme özeti silinir.', 'Kaldır', true))) return;
            try { await Server.sync('ayril', { familyId: S.sync.familyId, token: S.sync.token }); } catch (e) { if (e.status !== 401 && e.status !== 404) { toast(e.message, true); return; } }
            S.sync = null; save(true); toast('Veli bağlantısı kaldırıldı.'); draw();
          } } }, 'Bağlantıyı kaldır'));
      }
    };
    draw();
    return panel;
  }

  function showCode(code) {
    openSheet('Veli bağlantı kodu', (b) => {
      b.append(
        h('p', { class: 'muted', text: 'Velinin telefonunda Sınav Hocası’nı aç, “Veliyim”i seç ve bu kodu yaz. Kod 10 dakika geçerli ve tek kullanımlık.' }),
        h('div', { class: 'code-show', 'aria-label': 'Kod: ' + code.split('').join(' '), text: code.slice(0, 3) + ' ' + code.slice(3) }),
        h('button', { class: 'btn btn-secondary btn-block', type: 'button', on: { click: () => shareText('Sınav Hocası veli bağlantı kodum: ' + code + '\nUygulamayı aç → Veliyim → kodu yaz. (10 dakika geçerli)\nUygulama yoksa: ' + DOWNLOAD_URL, 'Veli kodu') } }, icon('share'), 'Kodu veliye gönder'));
    });
  }

  async function listParents() {
    try {
      const d = await Server.sync('veliler', { familyId: S.sync.familyId, token: S.sync.token });
      const list = Array.isArray(d.parents) ? d.parents.slice(0, 6) : [];
      openSheet('Bağlı veliler', (b, close) => {
        if (!list.length) { b.append(h('p', { class: 'muted', text: 'Henüz bağlanan veli yok. Kodu veliye gönder.' })); return; }
        list.forEach((p, i) => b.append(h('div', { class: 'hist-item' },
          h('div', {}, h('b', { text: (i + 1) + '. veli telefonu' }), h('div', { class: 'xs muted', text: 'Bağlandı: ' + fmtDateTime(Number(p.at) || 0) })),
          h('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Çıkar', on: { click: async () => {
            try { await Server.sync('veli-sil', { familyId: S.sync.familyId, token: S.sync.token, parentId: clampStr(p.id, 40) }); toast('Veli çıkarıldı.'); close(); } catch (e) { toast(e.message, true); }
          } } }))));
      });
    } catch (e) { toast(e.message, true); }
  }

  // ======================================================================
  // VELİ MODU — buluttan gelen ilerleme
  // ======================================================================
  let activeKid = 0;
  const kidName = (k, i) => k.nick || (k.sum && k.sum.name) || k.name || (i + 1) + '. çocuk';
  function renameKid(i) {
    const k = S.children[i];
    if (!k) return;
    openSheet('Çocuğuna isim ver', (b, close) => {
      const input = h('input', { type: 'text', maxlength: 30, value: k.nick || (k.sum && k.sum.name) || '', placeholder: 'Örn. Elif', 'aria-label': 'Çocuğun adı' });
      b.append(
        h('p', { class: 'muted small', text: 'Bu isim yalnızca senin telefonunda görünür.' }),
        input,
        h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Kaydet', on: { click: () => { k.nick = clampStr(input.value, 30).replace(/[<>]/g, '').trim(); save(true); close(); render(); } } }));
    });
  }
  async function fetchKid(kid) {
    try {
      const d = await Server.sync('oku', { familyId: kid.familyId, token: kid.token });
      kid.sum = sanitizeSummary(d.summary);
      if (kid.sum && kid.sum.name) kid.name = kid.sum.name;
      kid.fetchedAt = Date.now(); kid.revoked = false; kid.error = '';
      save();
    } catch (e) {
      if (e.status === 401 || e.status === 404) kid.revoked = true;
      kid.error = navigator.onLine ? e.message : 'İnternet yok';
    }
  }

  function viewKidSummary() {
    if (!S.children.length) return viewPairParent();
    activeKid = Math.min(activeKid, S.children.length - 1);
    const kid = S.children[activeKid];
    const wrap = h('div', {});
    const draw = () => {
      const line = h('div', { class: 'sync-line' },
        h('span', { text: kid.revoked ? 'Bağlantı kaldırılmış' : kid.sum && kid.sum.updatedAt ? 'Son güncelleme: ' + ago(kid.sum.updatedAt) : 'Henüz veri gelmedi' }),
        h('button', { class: 'btn btn-sm btn-soft', type: 'button', on: { click: async (e) => { e.currentTarget.disabled = true; await fetchKid(kid); draw(); } } }, icon('refresh'), 'Yenile'));
      fill(wrap, 
        h('div', { class: 'row spread', css: { margin: '8px 0 12px' } }, h('h1', { text: kidName(kid, activeKid) }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'İsim ver', title: 'İsim ver', on: { click: () => renameKid(activeKid) } }, icon('edit'))),
        S.children.length > 1 ? h('div', { class: 'kids', role: 'group', 'aria-label': 'Çocuk seç' }, S.children.map((k, i) => h('button', { type: 'button', 'aria-pressed': String(i === activeKid), text: kidName(k, i), on: { click: () => { activeKid = i; render(); } } }))) : null,
        line,
        kid.revoked ? notice('Öğrenci telefonundan bağlantı kaldırılmış. “Çocuklarım” bölümünden yeni kodla tekrar bağlanabilirsin.') : null,
        kid.error && !kid.revoked ? notice(kid.error) : null,
        renderSummary(kid.sum, { cloud: true }));
    };
    draw();
    if (!kid.revoked && Date.now() - kid.fetchedAt > 20000) fetchKid(kid).then(() => { if (route().name === 'vozet' || !location.hash) draw(); });
    pollTimer = setInterval(() => { if (!document.hidden && !kid.revoked) fetchKid(kid).then(draw); }, 60000);
    return wrap;
  }

  function codeInput(onDone) {
    const input = h('input', { type: 'text', class: 'code-in', inputmode: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false', maxlength: 7, placeholder: 'ABC123', 'aria-label': '6 haneli bağlantı kodu' });
    const nameIn = h('input', { type: 'text', maxlength: 30, placeholder: 'Çocuğunun adı (isteğe bağlı)', 'aria-label': 'Çocuğunun adı' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, icon('link'), 'Bağlan');
    input.addEventListener('input', () => { const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); input.value = v; btn.disabled = v.length !== 6; });
    btn.addEventListener('click', async () => {
      const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) return;
      btn.disabled = true;
      try {
        await Server.check();
        const d = await Server.sync('katil', { code });
        if (!ID_RE.test(d.familyId || '') || !ID_RE.test(d.token || '')) throw new Error('Sunucu yanıtı geçersiz');
        if (S.children.some((k) => k.familyId === d.familyId)) { toast('Bu çocuk zaten ekli.'); onDone(); return; }
        const kid = { familyId: d.familyId, token: d.token, name: clampStr(d.name, 30), nick: clampStr(nameIn.value, 30).replace(/[<>]/g, '').trim(), addedAt: Date.now(), fetchedAt: 0, revoked: false, sum: null };
        S.children.push(kid); activeKid = S.children.length - 1;
        save(true);
        await fetchKid(kid);
        toast('Bağlandı. İlerleme artık buraya gelecek.');
        onDone();
      } catch (e) { toast(e.status === 404 ? 'Kod bulunamadı ya da süresi doldu. Çocuğun telefonundan yeni kod al.' : (e.message || 'Bağlanamadı.'), true); btn.disabled = false; }
    });
    return [input, nameIn, btn];
  }

  function viewPairParent() {
    const [input, nameIn, btn] = codeInput(() => go('vozet'));
    return h('div', {},
      h('section', { class: 'hoca' },
        h('div', { class: 'hoca-face' }, h('img', { src: 'icons/mark-144.png', alt: '', width: 76, height: 76 })),
        h('div', { class: 'bubble' }, h('h1', { text: 'Çocuğunu bağla' }), h('p', { text: 'Bağlandığında çocuğunun çalışma süresi, çözdüğü sorular ve başarısı buraya otomatik gelir.' }))),
      h('div', { class: 'panel stack', css: { 'margin-top': '16px' } },
        h('ol', { class: 'steps' },
          h('li', {}, h('div', {}, h('b', { text: 'Çocuğunun telefonunda Sınav Hocası’nı aç' }), h('p', { class: 'muted small', text: '“Veli” sekmesine gir, veli PIN’ini oluştur ya da gir.' }))),
          h('li', {}, h('div', {}, h('b', { text: '“Veli telefonunu bağla”ya dokun' }), h('p', { class: 'muted small', text: 'Ekranda 6 haneli bir kod çıkar.' }))),
          h('li', {}, h('div', {}, h('b', { text: 'Kodu buraya yaz' }), h('p', { class: 'muted small', text: 'Kod 10 dakika geçerli ve tek kullanımlık.' })))),
        input, nameIn, btn),
      !Server.canSync && Server.status !== 'bilinmiyor' ? h('div', { css: { 'margin-top': '12px' } }, syncUnavailable()) : null,
      h('p', { class: 'xs muted', css: { 'margin-top': '14px' }, text: 'Çocuğun cevap metinleri ve kitap sayfaları velilere gönderilmez; yalnızca süre, ders, puan ve konu başlıkları paylaşılır.' }));
  }

  function viewKids() {
    return h('div', {},
      h('h1', { text: 'Çocuklarım', css: { margin: '8px 0 14px' } }),
      S.children.length ? h('div', { class: 'hist' }, S.children.map((k, i) => h('div', { class: 'hist-item' },
        h('div', {}, h('b', { text: kidName(k, i) }), h('div', { class: 'xs muted', text: k.revoked ? 'Bağlantı kaldırılmış' : k.sum && k.sum.updatedAt ? 'Son güncelleme: ' + ago(k.sum.updatedAt) : 'Henüz veri yok' })),
        h('div', { class: 'row', css: { gap: '4px' } }, h('button', { class: 'btn btn-sm btn-soft', type: 'button', 'aria-label': kidName(k, i) + ' için isim ver', on: { click: () => renameKid(i) } }, icon('edit'), 'İsim'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': kidName(k, i) + ' bağlantısını kaldır', on: { click: async () => {
          if (!(await confirmBox('Bu çocuk listeden çıkarılsın mı?', 'Bu telefon artık onun ilerlemesini görmez. İstersen yeni kodla tekrar bağlanabilirsin.', 'Çıkar', true))) return;
          try { await Server.sync('ayril', { familyId: k.familyId, token: k.token }); } catch (e) { /* bağlantı zaten yoksa da listeden çıkar */ }
          S.children.splice(i, 1); activeKid = 0; save(true); render();
        } } }, icon('trash')))))) : h('div', { class: 'empty' }, h('b', { text: 'Henüz bağlı çocuk yok' }), h('p', { text: 'Aşağıdan kodla ekle.' })),
      h('div', { class: 'section-head' }, h('h2', { text: 'Çocuk ekle' })),
      h('div', { class: 'panel stack' }, h('p', { class: 'small muted', text: 'Çocuğunun telefonunda Veli sekmesi → “Veli telefonunu bağla” (ya da “Başka veli ekle”) ile çıkan kodu yaz.' }), ...codeInput(() => go('vozet'))));
  }

  function viewShareHub() {
    return h('div', { class: 'stack' },
      h('h1', { text: 'Paylaş', css: { margin: '8px 0 6px' } }),
      h('p', { class: 'muted', text: 'Sınıf veli grubunda ve arkadaşlarınızla paylaşın; çocuklar birlikte ders çalışma alışkanlığı kazansın.' }),
      shareAppCard(),
      S.children.length && S.children[activeKid] && S.children[activeKid].sum ? h('button', { class: 'btn btn-secondary btn-block', type: 'button', on: { click: () => shareText(summaryText(S.children[activeKid].sum), 'Sınav Hocası raporu') } }, icon('share'), 'Çocuğumun raporunu paylaş') : null);
  }

  // ======================================================================
  // İlk açılış: tanıtım ve rol seçimi
  // ======================================================================
  const SLIDES = [
    { art: 'logo', title: 'Sınav Hocası', text: 'Daha iyi bir gelecek, doğru hazırlıkla başlar.' },
    { art: 'camera', badge: 'book', title: 'Kitabını göster', text: 'Sayfanın fotoğrafını çek, PDF ekle ya da güncel MEB ders kitabını uygulamanın içine indir.' },
    { art: 'edit', badge: 'check', title: 'Kendi cümlelerinle cevapla', text: 'Hoca cevabını anlamına göre puanlar; neyi doğru yaptığını ve neyi geliştirebileceğini söyler.' },
    { art: 'users', badge: 'cloud', title: 'Velin ilerlemeni görsün', text: 'Uygulamayı velinin telefonuna da kur, bağla. Çalışma süren ve başarın onun ekranına otomatik gelir.' },
    { art: 'share', badge: 'target', title: 'Birlikte çalışın', text: 'Soruları sınıf grubunda paylaş, arkadaşların da çözsün. Birlikte çalışmak daha keyifli.' }
  ];
  let slideIdx = 0;
  function viewIntro() {
    const wrap = h('div', { class: 'intro' });
    const draw = () => {
      const sl = SLIDES[slideIdx];
      const last = slideIdx === SLIDES.length - 1;
      const art = sl.art === 'logo'
        ? h('div', { class: 'slide-art' }, h('img', { class: 'owl', src: 'icons/owl-512.png', alt: 'Sınav Hocası baykuşu' }))
        : h('div', { class: 'slide-art' }, h('div', { class: 'big' }, icon(sl.art)), sl.badge ? h('div', { class: 'badge' }, icon(sl.badge)) : null);
      const title = sl.art === 'logo' ? h('h1', { class: 'wordmark' }, 'Sınav ', h('span', { text: 'Hocası' })) : h('h1', { text: sl.title });
      const slide = h('div', { class: 'slide' + (sl.art === 'logo' ? ' splash' : ''), 'aria-live': 'polite' }, art, title, h('p', { text: sl.text }));
      let sx = null;
      slide.addEventListener('pointerdown', (e) => { sx = e.clientX; });
      slide.addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (dx < -50 && !last) { slideIdx++; draw(); } else if (dx > 50 && slideIdx > 0) { slideIdx--; draw(); } });
      fill(wrap, 
        h('div', { class: 'intro-top' }, slideIdx ? h('img', { src: 'icons/mark-144.png', alt: '' }) : h('span', {}), !last ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Geç', on: { click: finishIntro } }) : h('span', {})),
        slide,
        h('div', { class: 'dots', 'aria-hidden': 'true' }, SLIDES.map((_, i) => h('i', { class: i === slideIdx ? 'on' : '' }))),
        h('div', { class: 'btn-row' },
          slideIdx > 0 ? h('button', { class: 'btn btn-secondary', type: 'button', 'aria-label': 'Önceki', on: { click: () => { slideIdx--; draw(); } } }, icon('left')) : null,
          h('button', { class: 'btn btn-primary', type: 'button', css: { flex: '3 1 200px' }, on: { click: () => { if (last) finishIntro(); else { slideIdx++; draw(); } } } }, last || slideIdx === 0 ? 'Başlayalım' : 'Devam', icon('right'))));
    };
    draw();
    return wrap;
  }
  function finishIntro() { S.settings.introDone = true; slideIdx = 0; save(true); render(); window.scrollTo(0, 0); }

  function viewRole() {
    const pickRole = (r) => {
      S.settings.role = r; save(true);
      if (r === 'ogrenci') Sync.schedule(1000);
      go(r === 'veli' ? 'vozet' : 'ana');
    };
    return h('div', { class: 'intro' },
      h('div', { class: 'intro-top' }, h('img', { src: 'icons/mark-144.png', alt: '' }), h('span', {})),
      h('div', { css: { margin: 'auto 0' } },
        h('h1', { text: 'Bu telefonu kim kullanacak?' }),
        h('p', { class: 'muted', css: { 'margin-top': '8px' }, text: 'Tek uygulama, iki kullanım. İstediğin zaman Ayarlar’dan değiştirebilirsin.' }),
        h('div', { class: 'role-cards' },
          h('button', { class: 'role-card', type: 'button', on: { click: () => pickRole('ogrenci') } }, h('span', { class: 'ic' }, icon('student')), h('span', {}, h('b', { text: 'Öğrenciyim' }), h('small', { text: 'Kitabımdan soru çözeceğim, ilerlememi takip edeceğim.' })), icon('right')),
          h('button', { class: 'role-card', type: 'button', on: { click: () => pickRole('veli') } }, h('span', { class: 'ic' }, icon('parent')), h('span', {}, h('b', { text: 'Veliyim' }), h('small', { text: 'Çocuğumun çalışmasını kendi telefonumdan göreceğim.' })), icon('right')))));
  }

  // ======================================================================
  // Ayarlar ve durum
  // ======================================================================
  async function openSettings() {
    const [hasPdf, hasOcr] = await Promise.all([probe('vendor/pdfjs/pdf.min.js'), probe('vendor/tesseract/tesseract.min.js')]);
    libAvailable.pdf = hasPdf; if (libAvailable.ocr === null) libAvailable.ocr = hasOcr;
    Server.check().then(() => { const el = $('#aiStatus'); if (el) el.replaceWith(aiChip()); });
    openSheet('Ayarlar', (b) => {
      const nameIn = h('input', { type: 'text', maxlength: 30, value: S.settings.name, placeholder: 'İsteğe bağlı', on: { change: (e) => { S.settings.name = clampStr(e.target.value, 30).replace(/[<>]/g, '').trim(); save(); } } });
      const ai = h('input', { type: 'checkbox', role: 'switch', checked: S.settings.ai, on: { change: (e) => { S.settings.ai = e.target.checked; save(); } } });
      const ocrAuto = h('input', { type: 'checkbox', role: 'switch', checked: S.settings.autoOcr, on: { change: (e) => { S.settings.autoOcr = e.target.checked; save(); } } });
      const chip = (ok, okT, noT) => h('span', { class: 'chip ' + (ok ? 'ok' : 'warn'), text: ok ? okT : noT });
      b.append(
        h('div', { class: 'field' }, h('span', { text: 'Bu telefonu kim kullanıyor?' }), seg([['ogrenci', 'Öğrenci'], ['veli', 'Veli']], S.settings.role || 'ogrenci', async (v) => {
          if (v === S.settings.role) return;
          closeSheet();
          if (!(await confirmBox(v === 'veli' ? 'Veli kullanımına geçilsin mi?' : 'Öğrenci kullanımına geçilsin mi?', v === 'veli' ? 'Ekran, bağlı çocuklarının buluttan gelen ilerlemesini gösterecek. Bu telefondaki çalışmalar silinmez.' : 'Ekran soru çözme uygulamasına dönecek. Bağlı çocukların listede kalır.', 'Geç'))) return;
          S.settings.role = v; save(true); go(v === 'veli' ? 'vozet' : 'ana');
        }, 'Kullanım')),
        h('div', { class: 'field' }, h('span', { text: 'Görünüm' }), seg([['auto', 'Otomatik'], ['light', 'Açık'], ['dark', 'Koyu'], ['amoled', 'AMOLED']], S.settings.theme, (v) => { S.settings.theme = v; save(); applyTheme(); }, 'Tema')),
        h('div', { class: 'field' }, h('span', { text: 'Renk teması' }), (() => {
          const box = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Renk teması' });
          ACCENTS.forEach(([k, label]) => box.append(h('button', { class: 'sw-' + k, type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(S.settings.accent === k), on: { click: () => {
            S.settings.accent = k; save(); applyTheme();
            box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.classList.contains('sw-' + k))));
          } } })));
          return box;
        })()),
        h('div', { class: 'field' }, h('span', { text: 'Yazı boyutu' }), seg([['normal', 'Normal'], ['large', 'Büyük']], S.settings.textSize, (v) => { S.settings.textSize = v; save(); applyTheme(); }, 'Yazı boyutu')),
        h('label', { class: 'field' }, h('span', { text: 'Öğrencinin adı' }), nameIn, h('span', { class: 'hint', text: 'Yalnızca selamlamada kullanılır, cihazdan çıkmaz.' })),
        h('div', { class: 'panel tight' },
          h('label', { class: 'switch' }, h('span', {}, h('b', { css: { display: 'block' }, text: 'Yapay zekâyı kullan' }), h('span', { class: 'hint', text: 'Açıkken seçtiğin metin ve cevaplar değerlendirme için sunucuya gönderilir; saklanmaz. Kapalıyken her şey cihazda yapılır.' })), ai),
          h('label', { class: 'switch' }, h('span', {}, h('b', { css: { display: 'block' }, text: 'Fotoğrafı otomatik metne dönüştür' }), h('span', { class: 'hint', text: 'Fotoğraf eklenince yazı hemen tanınır.' })), ocrAuto)),
        h('h2', { text: 'Özellik durumu', css: { 'margin-top': '22px' } }),
        h('div', { class: 'panel status-list' },
          h('div', {}, h('span', { text: 'Kamera, galeri ve PDF ekleme' }), chip(true, 'Cihazda çalışır', '')),
          h('div', {}, h('span', { text: 'PDF içindeki yazıyı okuma' }), chip(hasPdf, 'Cihazda çalışır', 'Bu sürümde yok')),
          h('div', {}, h('span', { text: 'Fotoğraftaki yazıyı tanıma' }), chip(Native.can('ocr') || hasOcr, Native.can('ocr') ? 'Cihazda, internetsiz' : 'Cihazda (ilk kullanımda indirilir)', 'Yalnızca sunucuyla')),
          h('div', {}, h('span', { text: 'Soru üretme ve değerlendirme' }), chip(true, 'Cihazda çalışır', '')),
          h('div', {}, h('span', { text: 'Yapay zekâ sunucusu' }), aiChip()),
          h('div', {}, h('span', { text: 'MEB kitabını uygulama içine indirme' }), chip(Native.can('books'), 'Çalışır', 'Android uygulamasında')),
          h('div', {}, h('span', { text: 'Veli telefonuyla bulut eşitleme' }), chip(Server.canSync, 'Hazır', 'Sunucu bekleniyor'))),
        h('button', { class: 'btn btn-soft btn-block', type: 'button', css: { 'margin-top': '14px' }, on: { click: shareApp } }, icon('share'), 'Uygulamayı paylaş'),
        h('h2', { text: 'Verilerim', css: { 'margin-top': '22px' } }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', type: 'button', on: { click: exportBackup } }, icon('download'), 'Yedeği indir'),
          h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => pick('inBackup') } }, icon('upload'), 'Yedeği yükle')),
        h('p', { class: 'hint', text: 'Yedek; ilerlemeni, ayarlarını ve materyallerin metnini içerir. Fotoğraf ve PDF dosyaları yedeğe girmez.' }),
        h('button', { class: 'btn btn-danger btn-block', type: 'button', on: { click: wipeAll } }, icon('trash'), 'Tüm verileri sil'),
        h('div', { class: 'row spread', css: { 'margin-top': '18px' } },
          h('span', { class: 'xs muted', text: 'Sınav Hocası ' + VERSION + (Native.has ? ' (Android ' + clampStr(Native.info.version, 12) + ')' : ' (web)') + ', geliştirici: matali' }),
          h('a', { class: 'link-btn', href: 'gizlilik.html', text: 'Gizlilik' })));
    });
  }
  function aiChip() {
    const st = Server.status;
    const map = { bagli: ['ok', 'Bağlı'], kapali: ['warn', 'Bağlı değil'], cevrimdisi: ['warn', 'İnternet yok'], bilinmiyor: ['', 'Kontrol ediliyor'] };
    const [c, t] = map[st] || map.bilinmiyor;
    return h('span', { class: 'chip ' + c, id: 'aiStatus', text: S.settings.ai ? t : 'Kapalı' });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    a.href = url;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function exportBackup() {
    const data = { app: 'sinav-hocasi', v: 1, exportedAt: new Date().toISOString(), state: Object.assign({}, S, { parent: null }), materials: MATS.filter((m) => m.text).map((m) => ({ id: m.id, name: m.name, text: m.text, addedAt: m.addedAt, origin: m.origin })) };
    const json = JSON.stringify(data);
    if (Native.has && typeof window.SHNative.saveFile === 'function') { try { window.SHNative.saveFile('sinav-hocasi-yedek-' + dayKey(Date.now()) + '.json', json); return; } catch (e) { /* tarayıcı yoluna düş */ } }
    download('sinav-hocasi-yedek-' + dayKey(Date.now()) + '.json', json);
    toast('Yedek indirildi.');
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 30 * MB) throw new Error('Yedek dosyası çok büyük.');
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'sinav-hocasi' || data.v !== 1) throw new Error('Bu bir Sınav Hocası yedeği değil.');
      if (!(await confirmBox('Yedek yüklensin mi?', 'Mevcut ilerlemen ve ayarların yedektekiyle değiştirilecek. Materyal metinleri listene eklenecek.', 'Yükle'))) return;
      const ns = sanitizeState(data.state);
      ns.parent = S.parent; // PIN yedekten alınmaz
      Object.keys(S).forEach((k) => delete S[k]);
      Object.assign(S, ns);
      save(true);
      const mats = Array.isArray(data.materials) ? data.materials.slice(0, LIMITS.materials) : [];
      for (const m of mats) {
        const clean = sanitizeMaterial({ id: uid(), kind: 'text', name: m.name, text: m.text, addedAt: m.addedAt, size: String(m.text || '').length, textSource: 'elle', origin: m.origin });
        if (clean && clean.text.length >= 20) await DB.put(clean);
      }
      await loadMaterials();
      applyTheme();
      toast('Yedek yüklendi.');
      closeSheet(); render();
    } catch (e) { toast(e instanceof SyntaxError ? 'Yedek dosyası okunamadı.' : e.message, true); }
  }

  async function wipeAll() {
    if (!(await confirmBox('Tüm veriler silinsin mi?', 'Materyaller, çalışmalar, ilerleme, ayarlar ve veli PIN’i bu cihazdan kalıcı olarak silinir. Bu işlem geri alınamaz.', 'Her şeyi sil', true))) return;
    await DB.clear();
    try { localStorage.removeItem(KEY); } catch (e) { /* yok say */ }
    const fresh = sanitizeState(null);
    Object.keys(S).forEach((k) => delete S[k]);
    Object.assign(S, fresh);
    parentUnlocked = false;
    await loadMaterials();
    applyTheme();
    toast('Tüm veriler silindi.');
    go('ana');
  }

  // ======================================================================
  // Başlangıç
  // ======================================================================
  function bindInputs() {
    const handler = (origin) => async (e) => {
      const input = e.target;
      const files = Array.from(input.files || []);
      input.value = ''; // aynı dosya tekrar seçilebilsin
      if (!files.length) return; // iptal edildi
      if (route().name !== 'materyaller') go('materyaller');
      await importFiles(files, origin);
    };
    $('#inCamera').addEventListener('change', handler('kamera'));
    $('#inGallery').addEventListener('change', handler('galeri'));
    $('#inPdf').addEventListener('change', handler('pdf'));
    $('#inBackup').addEventListener('change', async (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; await importBackup(f); });
    $('#btnSettings').addEventListener('click', openSettings);
    const tb = $('#topbar');
    window.addEventListener('scroll', () => tb.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
    window.addEventListener('online', () => Server.check());
  }

  async function init() {
    applyTheme();
    bindInputs();
    await loadMaterials();
    render();
    Server.check().then(() => { if (['calis', 'vozet', 'vcocuk', 'veli'].includes(route().name) && !sheetOpen) render(); Sync.schedule(2000); });
    probe('vendor/pdfjs/pdf.min.js').then((ok) => { libAvailable.pdf = ok; });
    if ('serviceWorker' in navigator && location.protocol === 'https:' && !Native.has && location.hostname !== 'appassets.androidplatform.net') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı önbellek isteğe bağlı */ });
    }
  }

  window.addEventListener('error', (e) => { if (e && e.message && !/ResizeObserver/.test(e.message)) console.error('Hata:', e.message); });
  window.addEventListener('unhandledrejection', (e) => { console.error('Beklenmeyen hata:', e && e.reason); });

  init();
})();
