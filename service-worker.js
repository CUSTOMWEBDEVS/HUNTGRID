const CACHE_VERSION = 'huntgrid-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app.css',
  './app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const isTile =
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('arcgisonline') ||
    url.hostname.includes('opentopomap');

  const isGas =
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com');

  if (isTile) {
    event.respondWith(cacheFirst(event.request, TILE_CACHE));
    return;
  }

  if (isGas) {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  if (event.request.method === 'GET') {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }

    return fresh;
  } catch {
    return new Response('Offline content unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.ok && request.method === 'GET') {
      cache.put(request, fresh.clone());
    }

    return fresh;
  } catch {
    const cached = await cache.match(request);

    if (cached) return cached;

    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Offline'
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
