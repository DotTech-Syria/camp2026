const CACHE_NAME = 'camp-pwa-cache-v11';
const DYNAMIC_CACHE_NAME = 'camp-dynamic-cache-v11';
const urlsToCache = [
  '/',
  '/index.html',
  '/book.json',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/gallery.js',
  '/js/firebase-config.js',
  '/assets/img/logo.png',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Roboto:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
        .map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests and http/https schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // If it's an image from Google Drive or our storage, use Cache First then Network
  if (event.request.url.includes('drive.google.com/thumbnail') || event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then(networkResponse => {
          return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
            cache.put(event.request.url, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {
          // Fallback if offline and no image
          return new Response('');
        });
      })
    );
  } else {
    // Stale-While-Revalidate for other assets
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          return cachedResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});
