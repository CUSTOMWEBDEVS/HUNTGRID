const CACHE_VERSION = 'hunttrack-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;
const STATIC_ASSETS = [
  './','./index.html','./manifest.json','./css/app.css',
  './js/app.js','./js/map.js','./js/storage.js','./js/ui.js','./js/waypoints.js',
  './js/tracks.js','./js/layers.js','./js/sync.js',
  './assets/markers/camp.svg','./assets/markers/stand.svg','./assets/markers/trail.svg',
  './assets/markers/water.svg','./assets/markers/harvest.svg','./assets/markers/observation.svg','./assets/markers/custom.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => !key.startsWith(CACHE_VERSION)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isTile = /tile|arcgisonline|opentopomap|openstreetmap/.test(url.hostname + url.pathname);
  const isScriptApi = /script\.google\.com|script\.googleusercontent\.com/.test(url.hostname);

  if (isTile) {
    event.respondWith(cacheFirst(event.request, TILE_CACHE));
    return;
  }

  if (isScriptApi) {
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
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    return new Response('Tiles unavailable offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && request.method === 'GET') cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ ok:false, error:'Offline' }), { status: 503, headers:{ 'Content-Type':'application/json' } });
  }
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_TILE_URLS') {
    event.waitUntil(cacheTileUrls(event.data.urls || []));
  }
});

async function cacheTileUrls(urls) {
  const cache = await caches.open(TILE_CACHE);
  await Promise.all(urls.map(async url => {
    try {
      const req = new Request(url, { mode: 'no-cors' });
      const res = await fetch(req);
      await cache.put(req, res);
    } catch (error) {}
  }));
}
