/* ============================================================
   Civil Tools — Service Worker
   - Precache: shell + core (cache-first)
   - Runtime cache: modules/* saat pertama diakses (cache-first, fallback network)
   - Bump CACHE setiap kali core/shell berubah agar SW purge cache lama
   ============================================================ */
const CACHE = 'civil-tools-v17';

const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'assets/shell.css',
  'assets/shell.js',
  'core/ui-kit.js',
  'core/canvas2d.js',
  'core/report.js',
  'core/steel-profiles.js',
  'core/module-registry.js',
  'favicon/edfs-mark.svg',
  'favicon/edfs-icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Lewati request lintas-origin (mis. font Google, CDN Three.js) — biarkan network tangani
  if (url.origin !== self.location.origin) return;

  // Cache-first untuk semua asset se-origin, isi cache saat pertama diakses
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
