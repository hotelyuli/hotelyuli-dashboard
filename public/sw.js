const CACHE = 'yulios-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                      // never cache writes/auth
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // ignore Supabase/Google/etc.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req); }                   // live when online
      catch { return (await caches.match(OFFLINE_URL)) || Response.error(); }
    })());
  }
});
