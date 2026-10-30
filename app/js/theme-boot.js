// Tema ilk boyamadan önce uygulanır (beyaz ekran yanıp sönmesin)
(function () {
  try {
    var raw = localStorage.getItem('sh:v1');
    var s = raw ? JSON.parse(raw) : null;
    var t = s && s.settings && s.settings.theme;
    var size = s && s.settings && s.settings.textSize;
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (size === 'large') document.documentElement.setAttribute('data-size', 'large');
  } catch (e) {
    if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark');
  }
  try { if (window.SHNative) document.documentElement.classList.add('native'); } catch (e) {}
  if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = 'none'; } }
})();
