/* ============================================================
   Ahmed Store — Service Worker v1.0
   Strategy: Cache-First for assets, Network-First for data
   ============================================================ */

const CACHE_NAME   = 'ahmed-store-v4';
const CACHE_STATIC = 'ahmed-static-v4';

// Files to cache immediately on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Cairo:wght@400;500;600;700;800;900&display=swap'
];

// ── Install ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Pre-caching assets...');
      return cache.addAll(PRECACHE_ASSETS.filter(url => !url.startsWith('http') || url.includes('fonts')));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Network-first for Google Fonts (always fresh)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for local assets (CSS, JS, HTML)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
});

// ── Strategies ───────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('<h2>أنت غير متصل بالإنترنت</h2><p>النظام يعمل offline بالبيانات المحفوظة</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || 'أحمد ستور';
  const options = {
    body:    data.body    || 'لديك إشعار جديد',
    icon:    data.icon    || './manifest.json',
    badge:   data.badge   || '',
    tag:     data.tag     || 'ahmed-store',
    data:    data.url     || '/',
    dir:     'rtl',
    lang:    'ar',
    vibrate: [200, 100, 200],
    actions: data.actions || []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) {
        return list[0].focus();
      }
      return clients.openWindow(event.notification.data || '/');
    })
  );
});
