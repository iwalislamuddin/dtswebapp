# EDFS Civil Tools

Alat bantu rekayasa sipil dalam satu aplikasi terpasang (**PWA**) — kumpulan mini-app perhitungan
teknik sipil berbasis SNI, dengan visual dan laporan siap dokumentasi.

Dikembangkan oleh **Iwal · Edifisia · PT. DTS Engineering**.

- **Zero build step** — HTML/CSS/JS murni. Deploy = upload isi folder ini ke `public_html` (cPanel).
- **Modular** — tambah tool = tambah 1 folder di `modules/` + 1 baris di `core/module-registry.js`. Shell tidak pernah diubah.
- **PWA** — installable, offline-capable (service worker).

---

## Menjalankan secara lokal

Karena ini situs statis, cukup jalankan server statis apa pun dari root proyek:

```bash
python -m http.server 5188
# lalu buka http://localhost:5188
```

> Service worker meng-cache agresif. Saat mengembangkan, naikkan `CACHE` di `sw.js`
> dan/atau hard-reload (Ctrl+Shift+R). Cache versi saat ini: **civil-tools-v7**.

## Deploy (cPanel)

Upload seluruh isi folder `civil-tools/` ke `public_html` (atau subfolder). Tidak ada build/compile.
`start_url` dan `scope` di `manifest.json` memakai path relatif (`./`), jadi aman di subfolder.

---

## Struktur

```
index.html                 Shell — satu-satunya entry point
manifest.json, sw.js       PWA (manifest + service worker cache-first)
favicon/                   Logo EDFS (edfs-mark.svg, edfs-icon.svg)
assets/
  shell.css                Tema (variabel warna EDFS) + layout + UI kit (.ck-*)
  shell.js                 Router hash, module loader, lifecycle, tema, collapse, modal Tentang
core/
  module-registry.js       Daftar tool (SATU-SATUNYA file yang diedit saat menambah tool)
  ui-kit.js                toast, form generator, hero/kv/note, disposeObject
  canvas2d.js              Helper kanvas 2D (hi-DPI, auto-resize, repaint saat ganti tema)
  report.js                Generator laporan monospace → PDF (Courier, tanpa library) / .txt
modules/
  development-length/      Tool #1 — Panjang Penyaluran Tulangan Tarik (SNI 2847:2019)
  _template/               Starter kit — copy untuk membuat module baru
```

Detail arsitektur lengkap: [`ARCHITECTURE.md`](ARCHITECTURE.md).
Rangkuman sesi & langkah berikutnya: [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Tiga tier rendering (pilih paling ringan yang cukup)

1. **Pure form + tabel** — kalkulator murni (`ui-kit.js`).
2. **Kanvas 2D interaktif** — `core/canvas2d.js`. **Default** mayoritas tool sipil.
3. **3D WebGL** — `core/renderer.js` + `orbit-controls.js` (belum dibuat; menyusul untuk tool 3D).

## Menambah tool baru

1. `cp -r modules/_template modules/<id>` lalu isi `mount()`/`unmount()` (kontrak di `ARCHITECTURE.md` §5).
2. Tambah 1 entry di `core/module-registry.js`.
3. (Opsional) tambah file baru ke daftar precache di `sw.js` dan bump `CACHE`.

---

## Status

| Bagian | Status |
|---|---|
| Shell (nav, router, tema light/dark, collapse, modal Tentang) | ✅ Selesai |
| Tema/brand EDFS (palet dari `dtsapp.pdf`) | ✅ Selesai |
| Tool #1 — Panjang Penyaluran Tulangan Tarik (ulir + polos) | ✅ Selesai |
| Laporan unduh PDF/teks | ✅ Selesai |
| PWA (manifest, service worker, installable) | ✅ Selesai |
| Tool #2–#5 (roadmap `coming-soon` di registry) | ⏳ Berikutnya |
| Infrastruktur 3D + Anchor Bolt Group | ⏳ Fase 3 |

## Standar & disclaimer

Perhitungan mengacu **SNI** (tool #1: SNI 2847:2019). Hasil adalah **alat bantu** dan tidak
menggantikan penilaian teknis — verifikasi seluruh keluaran oleh insinyur profesional yang
bertanggung jawab sebelum dipakai untuk desain, gambar kerja, atau konstruksi.
