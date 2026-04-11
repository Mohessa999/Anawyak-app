/**
 * ANA WYAK Service Worker v2.0 — أنا وياك
 * Cache version bumped — clears old stale cache on deploy
 */

const CACHE_NAME = 'ana-wyak-v2.0';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(a => cache.add(a)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const bypass = ['anthropic.com', 'googleapis.com', 'gstatic.com', 'supabase.co', 'cdnjs.cloudflare.com', 'workers.dev'];
  if (bypass.some(d => url.hostname.includes(d))) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Stale-while-revalidate
        fetch(event.request).then(r => {
          if (r && r.status === 200) caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone()));
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') return caches.match('./index.html');
      });
    })
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'أنا وياك 💕', {
      body: data.body || 'رسالة جديدة من شريكك 💕',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || self.registration.scope }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url === target && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});