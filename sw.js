// Offline support: pre-cache the app shell, then serve cache-first with a
// background refresh so updates land on the next visit.
// Bump the cache name on every release.
const CACHE = 'tetrachrome-v1.2.0';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=1.2.0',
  './js/app.js?v=1.2.0',
  './js/voronoi.js?v=1.2.0',
  './js/solver.js?v=1.2.0',
  './manifest.webmanifest?v=1.2.0',
  './icons/icon-180.png?v=1.2.0',
  './icons/icon-192.png?v=1.2.0',
  './icons/icon-512.png?v=1.2.0',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return cached || fresh;
    })
  );
});
