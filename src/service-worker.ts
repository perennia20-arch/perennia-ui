import { build, files, version } from '$service-worker';
const CACHE = `perennia-shell-${version}`;
const ASSETS = new Set([...build, ...files]);
const sw = self as any;
sw.addEventListener('install', (e: any) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...ASSETS])).then(() => sw.skipWaiting()));
});
sw.addEventListener('activate', (e: any) => {
  e.waitUntil(caches.keys().then(async (keys) => {
    for (const k of keys) if (k !== CACHE) await caches.delete(k);
    await sw.clients.claim();
  }));
});
sw.addEventListener('fetch', (e: any) => {
  const req: Request = e.request;
  if (req.method !== 'GET' || (req.cache === 'only-if-cached' && req.mode !== 'same-origin')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname, accept = req.headers.get('accept') || '';
  if (p === '/api' || p.startsWith('/api/') || p === '/v1' || p.startsWith('/v1/') || accept.includes('text/event-stream')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (ASSETS.has(p)) { const hit = await cache.match(req); if (hit) return hit; }
    try {
      const res = await fetch(req);
      if (res.status === 200 && ASSETS.has(p)) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const fb = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('/') : undefined);
      if (fb) return fb;
      throw err;
    }
  })());
});
