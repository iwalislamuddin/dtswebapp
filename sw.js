/* ============================================================
   Civil Tools — Service Worker
   - Precache: shell + core (cache-first)
   - Runtime cache: modules/* saat pertama diakses (cache-first, fallback network)
   - Bump CACHE setiap kali core/shell berubah agar SW purge cache lama
   ============================================================ */
const CACHE = 'civil-tools-v52';

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
  'core/orbit-controls.js',
  'core/renderer.js',
  'core/module-registry.js',
  'favicon/edfs-mark.svg',
  'favicon/edfs-icon.svg',
  'modules/development-length/icon.svg',
  'modules/beam-flexure/icon.svg',
  'modules/min-reinforcement/icon.svg',
  'modules/continuous-beam/icon.svg',
  'modules/pile-cap/icon.svg',
  'modules/lateral-broms/icon.svg',
  'modules/py-analysis/icon.svg',
  'modules/steel-tension/icon.svg',
  'modules/steel-compression/icon.svg',
  'modules/steel-flexure/icon.svg',
  'modules/steel-beam-analysis/icon.svg',
  'modules/portal-frame/icon.svg',
  'modules/bearing-capacity/icon.svg',
  'modules/settlement/icon.svg',
  'modules/pile-capacity/icon.svg',
  'modules/load-combo/icon.svg',
  'modules/anchor-bolt-group/icon.svg',
  'modules/bolt-connection/icon.svg',
  'modules/weld-connection/icon.svg',
  'modules/wind-load/icon.svg',
  'modules/cpt-bearing/icon.svg',
  'modules/cpt-pile/icon.svg',
  'modules/column-pm/icon.svg',
  'modules/rational-method/icon.svg',
  'modules/open-channel/icon.svg',
  'modules/pipe-flow/icon.svg',
  'modules/base-plate/icon.svg',
  'modules/retaining-stone/icon.svg',
  'modules/retaining-concrete/icon.svg',
  'modules/footing-design/icon.svg',
  'modules/two-way-slab/icon.svg'
];

self.addEventListener('install', (e) => {
  // Cache tiap item SATU per SATU (bukan addAll yang all-or-nothing): satu
  // aset gagal/flaky tak boleh membatalkan seluruh precache — terutama
  // index.html yang dibutuhkan fallback offline. Gagal per-item diabaikan;
  // yang belum ter-cache akan terisi runtime saat pertama diakses.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(PRECACHE.map((url) =>
        c.add(new Request(url, { cache: 'reload' })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
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

  // Navigasi (deep-link /{id}): app adalah SPA, jadi SEMUA rute disajikan oleh
  // index.html. Network-first agar index.html selalu segar; fallback ke cache
  // saat offline atau saat server dev tak punya SPA-rewrite (mis. python http.server
  // membalas 404 untuk /beam-flexure). Ini membuat reload deep-link tetap jalan.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => (res && res.ok) ? res : caches.match('index.html'))
        .catch(() => caches.match('index.html'))
    );
    return;
  }

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
