// Offline support: pre-cache the app shell, then serve cache-first with a
// background refresh so updates land on the next visit.
// Bump the cache name on every release.
const PREFIX = 'tetrachrome-';
const CACHE = `${PREFIX}v1.3.1`;
const ASSETS = [
  './',
  './index.html',
  './style.css?v=1.3.1',
  './js/app.js?v=1.3.1',
  './js/voronoi.js?v=1.3.1',
  './js/solver.js?v=1.3.1',
  './manifest.webmanifest?v=1.3.1',
  // icons are content-immutable (rename on redesign), so no ?v= — iOS can
  // ignore apple-touch-icon URLs that carry query strings
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Only ever cache the known app shell: keeps the cache bounded and avoids
// hoarding one-off requests.
const ASSET_URLS = new Set(ASSETS.map((a) => new URL(a, self.location).href));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          // only our own old caches: the origin (masarusz.github.io) is
          // shared with other apps whose caches must survive
          .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const cacheable = ASSET_URLS.has(req.url) || req.mode === 'navigate';

  const fresh = (async () => {
    const res = await fetch(req);
    if (res.ok && cacheable) {
      const c = await caches.open(CACHE);
      await c.put(req, res.clone());
    }
    return res;
  })();
  // Registered synchronously so the worker isn't terminated before a
  // background refresh (cache already had a hit) finishes writing.
  e.waitUntil(fresh.catch(() => {}));

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      return await fresh;
    } catch {
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
