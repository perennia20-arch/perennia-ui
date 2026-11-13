// Perennia Network-First PWA Service Worker (perennia-pwa-1794613201728)
const CACHE_NAME = 'perennia-pwa-1794613201728';
const PRECACHE_URLS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE_URLS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const accept = req.headers.get('accept') || '';
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/') || url.pathname === '/service-worker.js' || accept.includes('text/event-stream')) {
    return;
  }
  event.respondWith((async () => {
    try {
      const netRes = await fetch(req);
      if (netRes && netRes.ok && netRes.type === 'basic') {
        const clone = netRes.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
      }
      return netRes;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw new Error('Offline');
    }
  })());
});
