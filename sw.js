/**
 * ANA WYAK Service Worker v3.1 — أنا وياك
 * v3.1: real email verification via Resend, marketing lead capture, verification UX fix
 */

const CACHE_NAME = 'ana-wyak-v3.1';
const ASSETS = ['./', './index.html', './manifest.json', './pricing.html', './pricing-ar.html', './terms.html', './terms-ar.html', './privacy.html', './privacy-ar.html', './refund.html', './refund-ar.html', './subscribe.html', './offline.html', './styles.css', './app.js', './icons/icon-192.png', './icons/icon-512.png', 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Nunito:wght@400;500;600;700;800&family=Cairo:wght@400;500;600;700&display=swap'];

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
  const bypass = ['anthropic.com', 'supabase.co', 'workers.dev'];
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
        const accept = event.request.headers.get('Accept') || '';
        if (event.request.destination === 'document' || accept.includes('text/html')) return caches.match('./offline.html');
        if (event.request.destination === 'image') return caches.match('./icons/icon-192.png');
        return caches.match(event.request);
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