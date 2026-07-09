# Handoff — EDFS Civil Tools

Ringkasan pengembangan sampai **rilis v0.1.0** (2026-07-10). Dokumen ini untuk melanjutkan
pekerjaan tanpa kehilangan konteks. Arsitektur teknis: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Apa yang sudah jadi

**Shell & infrastruktur**
- `index.html` + `assets/shell.js` — router hash-based, module loader (inject `<script>`, cache di memori),
  lifecycle `mount()`/`unmount()`, tema light/dark, sidebar **collapsible** (klik logo → rail 66px, persist di localStorage),
  modal **Tentang**.
- `core/ui-kit.js` — `toast()`, **form generator** (`buildForm`), result builder (`hero/kv/note`), `disposeObject()`.
- `core/canvas2d.js` — kanvas 2D hi-DPI, auto-resize (ResizeObserver), **redraw sinkron** (bukan rAF, agar
  tidak macet di tab background), **repaint otomatis saat tema berganti** (MutationObserver `data-theme`), `destroy()`.
- `core/report.js` — laporan monospace gaya DOS → **PDF buatan tangan** (font bawaan `/Courier`, tanpa library,
  ASCII-only agar offset xref akurat) atau `.txt`; fallback ke teks bila PDF gagal.
- PWA: `manifest.json` + `sw.js` (cache-first, precache shell+core, runtime-cache modul). **Versi cache: `civil-tools-v7`.**

**Brand EDFS** (palet dari `D:\Downloads\dtsapp.pdf`)
- Orange `#F28F3B` (aksen) · Olive `#566246` · Sage `#A4C2A5` · Sky `#30BCED` · Ink `#050401`.
- Dark & light theme di CSS variables `assets/shell.css`. Variabel `--amber*` = aksen orange (dipertahankan namanya).
- Logo hexagon `favicon/edfs-mark.svg` (header/favicon) + `favicon/edfs-icon.svg` (maskable).
  ⚠️ **Rekonstruksi geometris** brand-colored, bukan vektor resmi — bila ada SVG resmi, timpa `edfs-mark.svg`.
- Nama app: **"EDFS Civil Tools"**, tagline "Alat Bantu Rekayasa Sipil". Nama Edifisia/DTS hanya di modal Tentang
  (kredit: "Iwal | Edifisia | DTS Engineering").

**Tool #1 — Panjang Penyaluran Tulangan Tarik** (`modules/development-length/`)
- SNI 2847:2019 Ps. 25.4.2.4a (bentuk SI): `ld = fy·ψt·ψe·ψs·ψg / (1.1·λ·√f'c·((cb+Ktr)/db)) · db`.
- Batasan: √f'c ≤ 8.3; (cb+Ktr)/db ≤ 2.5; ψt·ψe ≤ 1.7; ld ≥ 300 mm.
- **Ulir (D10–D36)** dan **Polos (Ø8,10,12,16,19)**. Polos = pendekatan konservatif **ld = 2.0 × ld ulir setara**
  dengan peringatan eksplisit (SNI mensyaratkan kait standar untuk polos — ini bukan rumus resmi polos lurus).
- Diagram kanvas 2D live (batang tertanam; ulir ber-ulir, polos mulus), hover readout, panel hasil, tombol
  **Download PDF / Teks**.

## Keputusan penting (kenapa)

- **Tool pertama BUKAN Anchor Bolt Group** (walau dokumen asli menaruhnya pertama): butuh 3D + rumus ACI belum
  dikonfirmasi → berisiko meleset target rilis cepat. Diganti kalkulator non-3D rumus baku.
- **3 tier rendering** — jangan paksa Three.js untuk semua. Kanvas 2D interaktif jadi default (ringan, tak ada
  risiko konteks WebGL bocor).
- **PDF tanpa library** — konsisten dengan prinsip zero-build; font Courier bawaan PDF sudah cukup untuk look DOS.

## Gotchas / catatan operasional

- **Service worker cache**: setiap ubah file shell/core, **bump `CACHE` di `sw.js`** (mis. v7 → v8) agar SW purge
  cache lama. Saat testing, hard-reload (Ctrl+Shift+R) atau unregister SW.
- **PDF ASCII-only**: `report.js` mengandalkan panjang byte = panjang karakter untuk offset xref. Jangan masukkan
  non-ASCII ke stream; `module.js` `buildReport()` sudah mentransliterasi (ψ→psi, √→sqrt, ·→*, dst).
- **Kontrak module**: `unmount()` wajib membersihkan listener, `canvas2d.destroy()`, dan dispose Three.js (tool 3D).
  Sudah diuji: pindah antar tool berkali-kali → jumlah `<canvas>` tetap 1 (tidak bocor).
- Screenshot di preview harness kadang timeout; verifikasi banyak dilakukan via pixel-sampling/eval (bukan indikasi bug app).

## Langkah berikutnya

1. **Tool #2** (tier-2, cepat karena form generator sudah ada). Kandidat roadmap `coming-soon` di registry:
   Kapasitas Balok φMn (beton), Batang Tarik Baja (SNI 1729), Daya Dukung Tiang (SNI 8460), Kombinasi Beban.
2. **Fase 3**: `core/renderer.js` + `orbit-controls.js` (extract dari `staad-viewer.html`), lalu Anchor Bolt Group (3D).
3. Opsional: logo EDFS resmi (SVG), PNG favicon 192/512 untuk dukungan iOS, halaman kategori.

## Verifikasi rilis v0.1.0

Diuji di browser (server lokal): shell & routing, tema light/dark + repaint kanvas, kalkulasi ulir/polos
(D19→560 mm, Ø19 polos→1110 mm), diagram, dispose bersih, collapse+persist, modal Tentang, laporan teks & **PDF
tervalidasi struktur** (header/xref/EOF, 0 byte non-ASCII), PWA (SW active, manifest valid). Nol console error.
