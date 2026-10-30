// Tema ilk boyamadan önce uygulanır (beyaz ekran yanıp sönmesin)
(function () {
  var root = document.documentElement;
  try {
    var raw = localStorage.getItem('sh:v1');
    var s = raw ? JSON.parse(raw) : null;
    var st = (s && s.settings) || {};
    var t = st.theme;
    var black = t === 'amoled';
    var dark = black || t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (black) root.setAttribute('data-black', '1');
    if (/^(teal|purple|green|orange)$/.test(st.accent || '')) root.setAttribute('data-accent', st.accent);
    if (st.textSize === 'large') root.setAttribute('data-size', 'large');
  } catch (e) {
    if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) root.setAttribute('data-theme', 'dark');
  }
  try { if (window.SHNative) root.classList.add('native'); } catch (e) {}
  if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (e) { root.style.display = 'none'; } }
})();
