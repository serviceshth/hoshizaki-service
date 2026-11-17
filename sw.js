const CACHE_NAME = 'hoshizaki-service-pwa-v1013-final';
const BASE_PATH = '/hoshizaki-service-management-system';

const CORE_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/serial_db.json`,
  `${BASE_PATH}/parts_catalog.json`,
  `${BASE_PATH}/quotation_archive.json`
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-store' })
            .then((res) => {
              if (res && res.ok) return cache.put(url, res);
            })
            .catch(() => null)
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Security Guard: ห้ามแคชไฟล์ข้อมูลต้นทุนลับลงเบราว์เซอร์โดยเด็ดขาด
  if (url.pathname.includes('parts_cost_2025.json')) return;
  if (url.origin !== self.location.origin) return;

  // Network-First สำหรับหน้า HTML หลัก เพื่อรับอัปเดตล่าสุดทันที
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === `${BASE_PATH}/`) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return networkRes;
        })
        .catch(() => caches.match(`${BASE_PATH}/index.html`))
    );
    return;
  }

  // Cache-First + Background Refresh สำหรับไฟล์ฐานข้อมูล JSON
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
