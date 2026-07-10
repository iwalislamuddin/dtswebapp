# Civil Tools — Modular PWA Architecture

## 1. Ringkasan Proyek

Kumpulan mini-app engineering sipil dalam satu shell aplikasi (mirip pola Geo5), diakses lewat navigasi kiri, dengan area kerja tengah–kanan. Setiap tool adalah **module** independen yang di-mount/unmount ke dalam shell. Tidak ada build step — semua file adalah HTML/CSS/JS murni, siap upload langsung via cPanel ke `public_html`. Berjalan sebagai PWA (installable, offline-capable untuk shell + module yang sudah pernah dibuka).

Dikembangkan oleh: PT. DTS Engineering (Iwal). Referensi visual/kode: `staad-viewer.html` (palet warna, custom OrbitControls, Three.js r128 via cdnjs, font Space Grotesk + JetBrains Mono).

## 2. Prinsip Desain

- **Zero build step.** Tidak ada bundler, tidak ada npm install untuk deploy. Semua via `<script>` tag dan ES module native (`type="module"`) atau plain script — pilih plain global-function module pattern (lihat §5) supaya konsisten dengan gaya STAAD viewer dan menghindari isu CORS saat load module via `fetch()` di beberapa hosting shared.
- **Modular murni.** Menambah tool baru = menambah 1 folder di `/modules/` + 1 baris registry. Shell tidak pernah diubah untuk menambah tool.
- **Shared runtime, bukan shared state.** Shell menyediakan sistem tema (CSS variables), toast, router, form generator, dan helper kanvas — semua lewat objek `runtime` yang di-pass ke `mount()`. Setiap module punya scene/canvas/controls sendiri — didekonstruksi total saat berpindah tool agar tidak bocor memori.
- **Tiga tier rendering — pilih yang paling ringan yang cukup.** Jangan paksakan Three.js untuk semua tool. Urut dari paling ringan:
  1. **Pure form + tabel** — kalkulator murni tanpa gambar (`needsRenderer: false`, `needsCanvas: false`). Cukup `ui-kit.js`.
  2. **Kanvas 2D interaktif** (`needsCanvas: true`) — diagram teknik 2D: penampang, denah, diagram gaya, batang tertanam, dst. Pakai helper `core/canvas2d.js` (hi-DPI, auto-resize, dispose bersih). **Default untuk mayoritas tool sipil** — jauh lebih ringan dari WebGL, tidak ada risiko konteks WebGL bocor, dan cukup untuk sebagian besar visualisasi teknik.
  3. **3D WebGL** (`needsRenderer: true`) — hanya untuk tool yang benar-benar butuh 3D (mis. Anchor Bolt Group: kerucut breakout, orbit). Pakai `core/renderer.js` + `core/orbit-controls.js`.
- **Konsisten visual dengan STAAD viewer**: palet warna graphite/amber, font yang sama, gaya panel kaca (`backdrop-filter: blur`).
- **Mobile-aware** tapi prioritas desktop (engineer kerja di laptop/desktop untuk tool teknik).

## 3. Struktur File

```
/civil-tools/
├── index.html                  # Shell app — satu-satunya entry point
├── manifest.json                # PWA manifest
├── sw.js                        # Service worker
├── favicon/                     # Ikon PWA berbagai ukuran
│
├── assets/
│   ├── shell.css                 # Variabel tema + layout shell + komponen UI reusable
│   ├── shell.js                  # Router, module loader, render nav, lifecycle
│   └── three.min.js              # (opsional) cache lokal Three.js r128, fallback jika CDN down
│
├── core/
│   ├── module-registry.js        # Daftar semua module terdaftar (SATU-SATUNYA file yang diedit saat menambah tool)
│   ├── ui-kit.js                  # Helper UI reusable: toast(), form generator, hero/kv/note result builder, disposeObject()
│   ├── canvas2d.js                # Tier 2 — helper kanvas 2D hi-DPI: setup, auto-resize, redraw sinkron, repaint saat ganti tema, dispose
│   ├── report.js                  # Generator laporan monospace (DOS-style): unduh PDF (font Courier, tanpa library) atau teks .txt
│   ├── steel-profiles.js          # Library DB profil baja (WF/UNP/Siku/SHS/RHS/Pipa/CNP) — dipakai bersama tool baja (window.SteelProfiles / runtime.steel)
│   ├── renderer.js                # Tier 3 — factory shared THREE.WebGLRenderer + resize handling (belum ada sampai tool 3D pertama)
│   └── orbit-controls.js          # Tier 3 — custom OrbitCtrl (di-extract dari staad-viewer.html, dipakai ulang oleh semua module 3D)
│
└── modules/
    ├── anchor-bolt-group/
    │   ├── module.js              # WAJIB: export mount()/unmount() — lihat §5 kontrak module
    │   ├── meta.json              # Metadata: id, name, icon, kategori, deskripsi singkat
    │   └── icon.svg
    │
    ├── pile-cap/                  # (kosong dulu, placeholder struktur)
    │   └── meta.json
    │
    └── _template/                 # Starter kit — copy folder ini untuk bikin module baru
        ├── module.js
        └── meta.json
```

### Kenapa `core/` terpisah dari `assets/`?
`assets/` = infrastruktur shell (tidak ada logic engineering). `core/` = runtime yang **dipakai bersama oleh module-module** (form generator, kanvas 2D, renderer 3D, controls) tapi bukan bagian dari shell UI itu sendiri. Pemisahan ini membuat jelas per tier: kalkulator murni cukup `ui-kit.js`; tool bergambar 2D tambah `canvas2d.js`; hanya tool 3D yang menyentuh `renderer.js` + `orbit-controls.js`. Tool tidak pernah membayar ongkos tier yang tidak dipakai.

## 4. Alur Kerja Shell

1. `index.html` load `shell.css`, `three.min.js` (CDN cdnjs r128), `core/*.js`, `assets/shell.js`.
2. `shell.js` baca `core/module-registry.js` → render daftar tool di nav kiri (grouped by kategori: Geoteknik, Baja, Sambungan, dll).
3. User klik nav item → `shell.js`:
   a. Jika module aktif sebelumnya ada → panggil `activeModule.unmount()` (wajib dispose scene/geometry/material Three.js, remove event listener, clear container DOM).
   b. `fetch()` atau `<script>` inject `modules/{id}/module.js` (cache di memori setelah load pertama, tidak perlu fetch ulang).
   c. Panggil `Module.mount(container, sharedRuntime)`.
4. Routing pakai `location.hash` (`#anchor-bolt-group`) supaya bisa deep-link dan tombol back browser jalan, serta agar PWA bisa reopen ke tool terakhir.
5. `sw.js` cache shell + module yang sudah pernah dibuka (cache-first untuk asset statis, network-first untuk kemungkinan update module).

## 5. Kontrak Module (WAJIB diikuti tiap module.js)

Setiap `module.js` harus mengekspos objek global dengan nama unik (pola sama seperti STAAD viewer yang self-contained, tapi dibungkus namespace):

```js
window.CivilModules = window.CivilModules || {};

window.CivilModules['anchor-bolt-group'] = {
  meta: {
    id: 'anchor-bolt-group',
    name: 'Anchor Bolt Group',
    category: 'Sambungan',
    needsCanvas: false,   // true → tool pakai kanvas 2D (tier 2)
    needsRenderer: true   // true → tool pakai Three.js/WebGL (tier 3)
  },

  // container: elemen DOM kosong yang disediakan shell
  // runtime: { UI, canvas2d, THREE, getRenderer } — dependency shared dari shell
  mount(container, runtime) {
    // 1. Bangun DOM (form input kiri via runtime.UI.buildForm, area gambar)
    // 2a. Tier 2: buat kanvas via runtime.canvas2d.create(el, drawFn) — hi-DPI & auto-resize
    // 2b. Tier 3: inisialisasi scene/camera/controls SENDIRI, attach ke runtime.getRenderer()
    // 3. Simpan referensi internal untuk dibersihkan di unmount()
  },

  unmount() {
    // WAJIB:
    // - cancelAnimationFrame loop lokal (jangan pakai requestAnimationFrame global shell)
    // - dispose semua geometry/material/texture
    // - remove semua event listener yang didaftarkan module ini
    // - container.innerHTML = '' (shell juga akan clear, tapi eksplisit lebih aman)
  }
};
```

**Aturan tambahan:**
- Module TIDAK BOLEH memodifikasi `shell.css` atau file di luar foldernya sendiri.
- Module boleh punya CSS sendiri via `<style>` inject saat mount (scoped dengan prefix class, misal `.abg-panel`), atau file `module.css` opsional yang di-load sama seperti `module.js`.
- **Tier 2 (kanvas 2D):** pakai `runtime.canvas2d.create(container, drawFn)` — helper mengurus hi-DPI (devicePixelRatio), auto-resize via ResizeObserver, dan mengembalikan handle dengan `.redraw()` + `.destroy()`. `drawFn(ctx, w, h)` dipanggil tiap resize/redraw. Di `unmount()` **wajib** panggil `handle.destroy()`.
- **Judul & tooltip kanvas — WAJIB pakai helper bersama (standar seragam, cegah tumpukan teks):**
  1. **Judul kanvas** via `runtime.UI.canvasCap(canvasHost)` → mengembalikan `{ el, set(teks) }`. Panggil `.set()` tiap update dengan teks **pendek & dinamis** (readout kunci, mis. `phiMn 132.6 kN.m · daktail`). Ini **satu-satunya** teks di pita atas kanvas. CSS `.cap` sudah global di `shell.css` (kiri-atas, `max-width:58%` + ellipsis sebagai pengaman) — host kanvas cukup `position:relative`.
  2. **Pill hover** via `runtime.UI.canvasTip(ctx, { mx, my, w, h, text })` → posisi otomatis aman (turun ke bawah kursor saat dekat atas agar tak menimpa judul, clamp ke tepi). **Jangan** menggambar pill hover sendiri.
  3. **Larangan:** jangan menggambar judul/readout lain di pita atas kiri kanvas (top ~30 px) — itu direservasi untuk `.cap`. Readout tambahan taruh di bawah/sisi, bukan menumpuk di atas.
- **Tier 3 (Three.js):** **harus** pakai renderer shared dari `runtime.getRenderer()` (bukan `new THREE.WebGLRenderer()` sendiri) — ini kunci performa saat berpindah-pindah tool. Dispose semua geometry/material/texture di `unmount()`.
- Module tanpa gambar (murni form + tabel hasil) set `needsCanvas: false` dan `needsRenderer: false` — cukup `runtime.UI`.

## 6. `core/module-registry.js` — Satu-satunya Titik Perubahan

```js
export const MODULE_REGISTRY = [
  {
    id: 'anchor-bolt-group',
    name: 'Anchor Bolt Group',
    category: 'Sambungan',
    icon: 'modules/anchor-bolt-group/icon.svg',
    entry: 'modules/anchor-bolt-group/module.js',
    status: 'active'        // 'active' | 'beta' | 'coming-soon'
  },
  {
    id: 'pile-cap',
    name: 'Pile Cap Layout',
    category: 'Geoteknik',
    icon: 'modules/pile-cap/icon.svg',
    entry: 'modules/pile-cap/module.js',
    status: 'coming-soon'
  }
  // tambah entry baru di sini setiap kali ada module baru
];
```

`status: 'coming-soon'` membuat item muncul di nav tapi disabled (abu-abu, tanpa klik) — berguna untuk menunjukkan roadmap tanpa module.js harus ada dulu.

## 7. Spesifikasi Tool 3D Andalan: Anchor Bolt Group

> **Catatan revisi:** tool yang **benar-benar dirilis pertama** adalah **Panjang Penyaluran Tulangan Tarik**
> (tier-2 kanvas 2D, SNI 2847:2019 Ps. 25.4.2, sudah selesai — lihat `modules/development-length/`).
> Anchor Bolt Group digeser jadi tool 3D andalan pada Fase 3 (butuh `renderer.js` + `orbit-controls.js`),
> karena butuh 3D penuh dan rumus ACI yang harus dikonfirmasi terpisah. Spesifikasi di bawah tetap
> menjadi acuan saat tool 3D dikerjakan.

**Tujuan:** Visualisasi & cek kapasitas grup baut angkur eksentris/breakout cone (referensi ACI 318 App. D / SNI 2847 pasal terkait anchoring to concrete).

**Input (form panel kiri-dalam):**
- Pola baut: circular / rectangular grid (jumlah baut, radius atau spacing X/Z)
- Diameter baut, embedment depth (hef)
- Mutu beton f'c, mutu baut (Fu)
- Beban: axial tension, shear, momen (Mx, Mz) di pusat grup

**Output visual (Three.js):**
- Render 3D: pelat dasar, posisi tiap baut sebagai silinder, kerucut breakout tiap baut (concrete breakout cone, sudut 35° umum digunakan)
- Overlap zone antar kerucut di-highlight warna berbeda (indikasi reduksi kapasitas grup)
- Vektor gaya per baut (tarik/tekan akibat momen — pola instantaneous center sederhana untuk kasus linear-elastis)
- Klik baut individual → panel kanan tampilkan gaya tarik/geser & D/C ratio baut tsb (pola UI sama seperti `selectObject()` di STAAD viewer)

**Output numerik (panel kanan, mirip Inspector STAAD viewer):**
- Kapasitas breakout tunggal & grup (ACI 318-19 Eq. 17.6.2 concept, disederhanakan)
- D/C ratio tiap baut & grup
- Warning jika overlap breakout > threshold

Detail rumus & referensi code akan dikonfirmasi terpisah sebelum implementasi kalkulasi (bukan bagian dokumentasi struktur ini).

## 8. PWA Setup

**`manifest.json`** — minimal:
```json
{
  "name": "Civil Tools — DTS Engineering",
  "short_name": "CivilTools",
  "start_url": "/civil-tools/",
  "display": "standalone",
  "background_color": "#0b1017",
  "theme_color": "#0b1017",
  "icons": [
    { "src": "favicon/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "favicon/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**`sw.js`** — strategi cache:
- Precache: `index.html`, `shell.css`, `shell.js`, `core/*.js`, `three.min.js`, `manifest.json`
- Runtime cache (cache-first, fallback network): setiap `modules/{id}/*` saat pertama kali diakses
- Versioning: bump `CACHE_NAME = 'civil-tools-v1'` setiap kali struktur core berubah agar SW purge cache lama

## 9. Urutan Pengerjaan (revisi — rilis bertahap, 3D ditunda)

**Fase 1 — Shell + tool pertама tier-2 (rilis awal 1–2 hari):**
1. Scaffold struktur folder sesuai §3
2. `core/ui-kit.js` — `toast()`, `disposeObject()`, `roundRect()` + **form generator** + result builder (hero/kv/note)
3. `assets/shell.css` + `assets/shell.js` — layout nav kiri + container, routing hash-based, lifecycle
4. `core/module-registry.js` dengan entry tool pertama + roadmap `coming-soon`
5. `modules/_template/` — validasi kontrak mount/unmount
6. `core/canvas2d.js` — helper kanvas 2D hi-DPI (tier 2)
7. `modules/development-length/module.js` — **tool pertama**: kalkulator SNI 2847:2019 Ps. 25.4.2 + diagram kanvas 2D batang tertanam
8. `manifest.json` + `sw.js` + icon set — PWA installable → **RILIS**

**Fase 2 — tambah tool tier-2 lain (sepekan berikutnya):** duplikat `_template`, pakai form generator + `canvas2d.js`. Tiap kalkulator ± ½–1 hari.

**Fase 3 — infrastruktur & tool 3D:**
9. `core/orbit-controls.js` (extract dari `staad-viewer.html`) + `core/renderer.js` — hanya saat menyiapkan tool 3D pertama
10. `modules/anchor-bolt-group/module.js` — implementasi sesuai §7

**Sepanjang jalan — Test:** buka shell → pindah antar tool beberapa kali → cek memory tidak naik terus (indikasi `unmount()`/`destroy()` bekerja).

## 10. Catatan Konsistensi dengan Proyek Existing

- Palet warna, font, dan gaya panel **disamakan** dengan `staad-viewer.html` (variabel CSS `--bg`, `--amber`, `--panel`, dll) supaya seluruh koleksi tool terasa satu keluarga produk.
- STAAD viewer saat ini **berdiri sendiri** (single file) dan tetap begitu — tidak perlu dipaksa masuk sebagai module di collection ini kecuali diminta eksplisit nanti.
- Custom OrbitControls dari STAAD viewer terbukti lebih stabil daripada versi contoh Three.js — jadikan basis `core/orbit-controls.js`, jangan tulis ulang dari nol.
