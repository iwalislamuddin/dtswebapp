# EDFS Civil Tools

Alat bantu rekayasa sipil dalam satu aplikasi web terpasang (PWA): kumpulan kalkulator teknik sipil berbasis SNI
(beton, baja, geoteknik, pembebanan, hidraulika) dengan visual dan laporan siap dokumentasi.

Dikembangkan oleh **Iwal · Edifisia · PT. DTS Engineering**. Bagian dari platform **Edifisia** — satu akun dan satu
Edifisia Premium bersama EDFS Matrix ([`docs/PLATFORM.md`](docs/PLATFORM.md)).

## Status (2026-10-08)

Repo sedang berada di tengah migrasi dari app **zero-build** (build lama, live) ke app **Vite + React + TypeScript**
(build baru, belum rilis):

| Lapisan | Lokasi | Status |
|---|---|---|
| Build lama — shell, 35 tool, PWA | `index.html`, `assets/`, `core/`, `modules/`, `sw.js` | Dirawat sampai build baru rilis; live ≈ v0.5.1 di `tools.dtsengineering.co.id` |
| Mesin hitung build baru | `src/calc/` | 34/35 tool di-port (`load-combo` tidak); 730 test lulus |
| Katalog tool build baru | `src/tools.ts` | Selesai (kategori, status, SEO) |
| Database `tools` (Supabase) | `supabase/`, `tests/`, `scripts/db_migrate.py` | Diterapkan di development |
| Shell React, SEO pre-render, laporan & PDF | `web/`, `src/app/`, `src/ui/`, `src/report/` | Selesai |
| UI tool baru | `src/tools/<id>/` | Percontohan Analisis Balok Baja selesai; tool lain berikutnya ([`docs/TODO.md`](docs/TODO.md) Tahap 5) |
| Akun & Simpan (Supabase) | — | Ditunda setelah Tahap 5 |

Produksi akan pindah ke **`tools.edifisia.com`** (Cloudflare Pages) pada rilis v0.8.0.

## Menjalankan

**App baru** (Node ≥ 20):

```bash
npm install
npm run dev         # app React (Vite), entry web/index.html
npm test            # golden test, hitung tangan, laporan & PDF
npm run typecheck
npm run lint
npm run build       # dist/: app + halaman pre-render per tool + sitemap
```

**Build lama** (situs statis — jalankan lewat HTTP, bukan `file:///`):

```bash
python -m http.server 5188
```

Service worker build lama meng-cache agresif: naikkan `CACHE` di `sw.js` tiap rilis; saat mengembangkan, ganti port
bila registry/shell tampak basi (lihat gotcha di [`docs/HANDOFF.md`](docs/HANDOFF.md)).

**Database** (skema `tools`): [`docs/PLATFORM.md`](docs/PLATFORM.md) §2.

## Struktur

```
web/                    Entry Vite (index.html, public/) — pindah ke akar saat build lama dibersihkan
src/
  app/                  Router, SEO/pre-render, state UI & input tool, gating Premium
  ui/                   Shell (menu, navigasi, halaman tool), kit komponen input, diagram, tampilan laporan
  report/               Model laporan, markup rumus, PDF (pdf-lib)
  tools/<id>/           UI satu tool: model, laporan, preview & diagram — kontrak di src/tools/README.md
  calc/                 Mesin hitung TypeScript murni — satu file per tool (src/calc/<id>.ts) + test
    shared/             Rumus bersama: geotech, cpt, concrete, retaining, steel, steel-profiles, frame2d, hydraulics
    __golden__/         Acuan golden dari build lama (dibuat scripts/golden, jangan diedit tangan)
    README.md           Aturan & resep port
  tools.ts              Katalog tool (id = slug URL, kategori, status, SEO)
scripts/
  golden/               Perekam acuan golden dari modules/<id>/module.js
  db_migrate.py         Penerap migrasi skema tools (riwayat sendiri, bukan supabase db push)
  cf-build.sh           Staging build lama untuk Cloudflare Pages
supabase/migrations/    Migrasi skema tools (tools.saved_works)
tests/                  Test SQL skema tools (selalu rollback)
index.html, assets/, core/, modules/, sw.js, manifest.json   Build lama (zero-build)
functions/, firebase/, firebase.json, .firebaserc            Sisa stack Firebase — dihapus di Tahap 5
docs/                   Rencana, daftar kerja, runbook
```

## Dokumen

| Dokumen | Isi |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Arsitektur build baru (sasaran) & build lama |
| [`docs/PLATFORM.md`](docs/PLATFORM.md) | Keputusan & rencana penyelarasan platform Edifisia (rencana aktif) |
| [`docs/TODO.md`](docs/TODO.md) | Daftar kerja per tahap, siapa mengerjakan apa |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Status terkini + catatan teknis per tool build lama |
| [`docs/UI.md`](docs/UI.md) | Arah desain UI baru |
| [`docs/TOOL-REVISIONS.md`](docs/TOOL-REVISIONS.md) | Revisi isi tool (shallow/deep foundation) & Library Data |
| [`docs/DOMAIN_MIGRATION.md`](docs/DOMAIN_MIGRATION.md) | Pindah ke Cloudflare Pages + `tools.edifisia.com` |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Deploy cPanel (warisan, sampai domain lama dipensiunkan) |
| [`src/calc/README.md`](src/calc/README.md) | Aturan port perhitungan & golden test |

## Standar & disclaimer

Perhitungan mengacu SNI (2847:2019 beton, 1729:2020 baja, 1727:2020 pembebanan, 8460:2017 geoteknik) dan acuan
yang disebut di tiap tool. Hasil adalah **alat bantu** dan tidak menggantikan penilaian teknis — verifikasi seluruh
keluaran oleh insinyur profesional yang bertanggung jawab sebelum dipakai untuk desain, gambar kerja, atau konstruksi.
