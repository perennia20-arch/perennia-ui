import { build, files, version } from '$service-worker';

const CACHE = `perennia-netfirst-${version}`;
const PUBLIC_PRECACHE = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const KNOWN_ASSETS = new Set([...build, ...files]);
const sw = self as any;

sw.addEventListener('install', (e: any) => {
  sw.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PUBLIC_PRECACHE)).catch(() => {})
  );
});

sw.addEventListener('activate', (e: any) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    for (const k of keys) {
      if (k !== CACHE) await caches.delete(k);
    }
    await sw.clients.claim();
    const clients = await sw.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'PERENNIA_SW_UPDATED', version });
    }
  })());
});

sw.addEventListener('fetch', (e: any) => {
  const req: Request = e.request;
  if (req.method !== 'GET' || (req.cache === 'only-if-cached' && req.mode !== 'same-origin')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  const accept = req.headers.get('accept') || '';
  if (p === '/api' || p.startsWith('/api/') || p === '/v1' || p.startsWith('/v1/') || p === '/service-worker.js' || accept.includes('text/event-stream')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && KNOWN_ASSETS.has(p)) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const fb = await cache.match(req);
      if (fb) return fb;
      throw err;
    }
  })());
});
