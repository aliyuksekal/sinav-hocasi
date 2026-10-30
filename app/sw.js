// Sınav Hocası — çevrimdışı önbellek (yalnızca aynı kaynaktan GET istekleri)
const CACHE = 'sh-v1.0.0';
const SHELL = ['./', 'index.html', 'gizlilik.html', 'css/app.css', 'js/theme-boot.js', 'js/engine.js', 'js/app.js', 'manifest.webmanifest', 'icons/mark-144.png', 'icons/icon-48.png', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // sunucu çağrıları önbelleğe alınmaz
  const isVendor = url.pathname.includes('/vendor/');
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok && res.type === 'basic' && (isVendor || SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/'))))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return isVendor ? hit || net : net.then((r) => r || hit).catch(() => hit);
    })
  );
});
