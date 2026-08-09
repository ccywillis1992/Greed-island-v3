// Greed Island PWA Service Worker (Module 13)
const CACHE_NAME = 'greed-island-v2';

// Static app shell resources to pre-cache on SW install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './pwa-192.png',
  './pwa-512.png',
  './apple-touch-icon.png',
];

// SW Installation: Pre-cache app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// SW Activation: Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('[Greed Island SW] Purging legacy cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// SW Fetch Interceptor
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Non-GET requests (POST, PUT, DELETE): pass directly to network
  if (request.method !== 'GET') {
    return;
  }

  // 2. LIVE PRICE API REQUESTS:
  // MUST attempt live network calls when online and MUST NOT cache stale price API responses!
  // Checks if endpoint is an API route (/api/prices, /api/fx, etc.), custom worker, or external pricing host
  const isPriceApiRequest =
    url.pathname.includes('/api/') ||
    url.pathname.includes('/price') ||
    url.hostname.includes('finance.yahoo') ||
    url.hostname.includes('coingecko') ||
    url.hostname.includes('binance') ||
    url.searchParams.has('ticker');

  if (isPriceApiRequest) {
    // Attempt live network call directly without caching stale responses
    event.respondWith(
      fetch(request).catch((err) => {
        console.warn('[Greed Island SW] Live price fetch offline fallback:', url.href);
        // Return a 503 Service Unavailable so priceEngine catches it and uses localStorage priceCache
        return new Response(
          JSON.stringify({
            error: 'Network offline. Using local cached price data.',
            offline: true,
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // 3. NAVIGATION REQUESTS (App Shell Loading):
  // Try network first, fall back to cached index.html if offline
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const respClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone));
          }
          return response;
        })
        .catch(() => {
          console.log('[Greed Island SW] Serving offline index.html for navigation:', request.url);
          return caches.match('./index.html').then((cachedHtml) => {
            return cachedHtml || caches.match('/');
          });
        })
    );
    return;
  }

  // 4. STATIC ASSETS & APP SHELL BUNDLES (JS, CSS, Images, Fonts):
  // Cache-first with network fallback & background cache update
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const respClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Ignore network errors for static asset background updates
        });

      return cachedResponse || fetchPromise;
    })
  );
});
