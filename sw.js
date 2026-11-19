const CACHE_NAME = 'hoshizaki-service-pwa-v1063-deep-repaired';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './hzk_enterprise_modules.js',
  './parts_catalog.json'
];
const DATA_ASSETS = [
  './serial_db.json',
  './parts_catalog.json',
  './quotation_archive.json'
];
const LAZY_BACKEND_ASSETS = [
  './Hoshizaki_Google_AppsScript_Enterprise_v1011.js'
];
const OCR_CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL_ASSETS);
      for (const url of DATA_ASSETS.concat(OCR_CDN_ASSETS)) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) await cache.put(url, res);
        } catch (e) {}
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never cache confidential cost JSON if ever requested
  if (url.pathname.includes('parts_cost_2025.json')) {
    return;
  }

  // Lazy-cache backend script on demand
  if (LAZY_BACKEND_ASSETS.some((asset) => url.pathname.endsWith(asset.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Cache Tesseract.js worker, core wasm, and traineddata language packs for instant offline OCR
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('projectnaptha.com') || url.pathname.endsWith('.traineddata.gz')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
