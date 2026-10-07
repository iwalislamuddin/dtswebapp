# Arsitektur — EDFS Civil Tools

Dua arsitektur hidup berdampingan sampai rilis v0.8.0: **build baru** (sasaran, sedang dibangun) dan **build lama**
(zero-build, masih live). Rencana & urutan kerja: [`docs/PLATFORM.md`](docs/PLATFORM.md), [`docs/TODO.md`](docs/TODO.md).

---

## A. Build baru (sasaran v0.8.0)

### A.1 Lapisan

```
┌──────────────────────────────────────────────────────────────────────────┐
│ UI — React + TypeScript (Vite), shell sesuai docs/UI.md                  │  Tahap 3–5
│   menu bar · navigasi kategori · header · tab Input/Detail · tema L/D    │
├──────────────────────────────────────────────────────────────────────────┤
│ Katalog tool — src/tools.ts (id/slug, nama, kategori, status, SEO)       │  ✅
├──────────────────────────────────────────────────────────────────────────┤
│ Mesin hitung — src/calc/<id>.ts + src/calc/shared/*  (TS murni)         │  ✅ 31/35
├──────────────────────────────────────────────────────────────────────────┤
│ Akun & data — @supabase/supabase-js → platform.premium_status(),          │  skema ✅,
│   tools.saved_works (RLS), Library Data (rencana)                        │  klien Tahap 4
└──────────────────────────────────────────────────────────────────────────┘
```

- **Aplikasi statis** di Cloudflare Pages (`tools.edifisia.com`); tidak ada server sendiri. Keamanan data dijaga
  RLS Supabase; browser memakai publishable key.
- **Satu tool = satu rute** `/{id}` (id dari `src/tools.ts`), di-*lazy load* per rute; HTML tiap rute di-pre-render
  untuk SEO (title/description/canonical dari `seo`).
- **PWA** lewat `vite-plugin-pwa` dengan prompt update (pola EDFS Matrix), menggantikan `sw.js` manual.

### A.2 Mesin hitung `src/calc`

- **Fungsi murni & deterministik**: input form (angka atau teks) → objek hasil (angka, status, peringatan).
  Tanpa DOM, storage, waktu, atau acak. UI, laporan Detail, dan Download Report membaca hasil yang sama.
- **Satu file per tool** (`<id>.ts`, nama = id katalog) + `<id>.test.ts`.
- **Rumus yang dipakai ≥ 2 tool tinggal di `shared/`**:

| Modul | Isi | Dipakai oleh |
|---|---|---|
| `geotech.ts` | Nq/Nγ, σ'v berlapis, Kp & Ka Rankine | daya dukung, tiang, Broms, P-Y, dinding penahan |
| `cpt.ts` | parser sondir, interpolasi & rata-rata qc/fs | CPT fondasi dangkal & tiang |
| `concrete.ts` | β1, ρ min/susut, Rn→ρ, Vc, pons, desain pelat per meter, Icr/Ie | 11 tool beton & struktur bawah |
| `retaining.ts` | tekanan tanah, stabilitas guling/geser/tekanan dasar | dinding batu kali & beton |
| `steel-profiles.ts`, `steel.ts` | library profil baja, E & mutu baja | tool baja, portal, gable |
| `frame2d.ts` | matrix stiffness rangka bidang, FEF, diagram N/V/M | portal, gable, tangga beton |
| `hydraulics.ts`, `num.ts`, `format.ts` | gravitasi; parse angka form; format angka | beberapa tool |

- **Golden test**: `scripts/golden/` menjalankan `compute()` modul lama (sandbox `vm`, file modul tidak diubah)
  atas daftar kasus → `src/calc/__golden__/<id>.json`; port wajib identik (toleransi relatif 1e-9, teks persis).
  Rekam ulang seluruh acuan menghasilkan file identik byte-per-byte. Aturan & resep:
  [`src/calc/README.md`](src/calc/README.md).
- **Perubahan rumus** setelah port dilakukan sebagai commit terpisah yang memperbarui acuan golden secara sadar
  (daftar di TODO "Perbaikan isi tool").

### A.3 Database (skema `tools`)

- `tools.saved_works`: pekerjaan tersimpan; baca/hapus pemilik, simpan/timpa pemilik + Premium; batas 50 per user.
  Migrasi `supabase/migrations/`, diterapkan dengan `scripts/db_migrate.py` (riwayat `tools.schema_migrations`),
  test `tests/tools_test.sql` (selalu rollback). Detail: [`docs/PLATFORM.md`](docs/PLATFORM.md) §2.
- Rencana: `tools.library_items` untuk Library Data ([`docs/TOOL-REVISIONS.md`](docs/TOOL-REVISIONS.md) §4).

### A.4 Tooling

`npm test` (Vitest) · `npm run typecheck` (tsc strict) · `npm run lint` (oxlint) · `npm run golden` (rekam acuan).
CI GitHub Actions menyusul (TODO Tahap 3).

---

## B. Build lama (zero-build, dirawat sampai v0.8.0)

Dihapus di Tahap 5 setelah semua tool berjalan di build baru. Ringkasan untuk perawatan:

- **Shell** `index.html` + `assets/shell.js` + `assets/shell.css`: router path `/{id}` (SPA fallback `.htaccess` /
  `_redirects`), navigasi per kategori dari `core/module-registry.js`, tema light/dark, modal Tentang (catatan rilis).
- **Kontrak modul** `modules/<id>/module.js`: IIFE yang mendaftarkan `window.CivilModules[id] = { meta, mount,
  unmount }`. `compute(v)` privat di dalam IIFE (sumber golden test). `unmount()` wajib melepas listener dan
  `destroy()` kanvas / dispose Three.js — jumlah `<canvas>` harus tetap 1 setelah berpindah tool.
- **Runtime bersama** `core/`: `ui-kit.js` (form generator, `canvasCap`/`canvasTip`), `canvas2d.js`, `report.js`
  (PDF tanpa library, ASCII-only), `steel-profiles.js`, `renderer.js` + `orbit-controls.js` (satu konteks WebGL
  bersama), `auth.js`/`works.js`/`billing.js` (Firebase — akan dihapus).
- **Rilis**: naikkan `CACHE` di `sw.js`, `APP_VER` tool yang berubah, catatan rilis di `index.html`, `sitemap.xml`.
  Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md) (cPanel) atau `scripts/cf-build.sh` (Cloudflare Pages).
- **Gotcha penting** (pita judul kanvas `.cap`, SW + HTTP-cache saat testing, PDF ASCII-only):
  [`docs/HANDOFF.md`](docs/HANDOFF.md) bagian "Gotchas".
