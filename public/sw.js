const CACHE = 'yulios-shell-v2';
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

// Web Push: new incident and the 08:00 open-tasks digest. The tag collapses duplicates
// (incident-<id>, daily-tasks-<YYYY-MM-DD>).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'YuliOS';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/dashboard' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if ('navigate' in open) { try { await open.navigate(target); } catch {} }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
