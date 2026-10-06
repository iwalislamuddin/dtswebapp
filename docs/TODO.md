# TODO — Penyelarasan Platform Edifisia + Rombak UI

Rencana & alasan: [PLATFORM.md](PLATFORM.md). File ini hanya daftar kerja yang **terbuka**;
yang selesai dicentang, lalu dipindah ke HANDOFF.md saat satu tahap rampung.

Penanda pelaksana: **[Anda]** = manual di dashboard/akun (tidak bisa dikerjakan asisten) ·
**[Claude]** = kode/dokumen di repo · **[Bersama]** = Claude menyiapkan, Anda menjalankan/menyetujui ·
**[Platform]** = pekerjaan repo platform Edifisia, bukan repo ini.

> Civil Tools **tidak butuh server/VPS sendiri**: aplikasinya statis (Cloudflare Pages), akun & data di
> Supabase. VPS Edifisia hanya untuk backend Matrix/platform.

---

## Tahap 0 — Keputusan ✅ (2026-10-06)

- [x] Stack UI: **Vite** (acuan stack Matrix)
- [x] **Semua tool gratis**; Premium hanya **Save** dan **Download Report**
- [x] Batas **50** pekerjaan tersimpan per user
- [x] **Login Google** diaktifkan (berlaku juga untuk Matrix)
- [x] Framework di atas Vite: **React + TypeScript** seperti Matrix (2026-10-07)

## Tahap 1 — Hosting & OAuth (bisa mulai sekarang, paralel)

Nama project Supabase: **`edifisia-dev`** (Sydney, dulu `edfs-matrix`) & **`edifisia-prod`** (Singapore) —
rename 2026-10-06.

**Cloudflare Pages**
- [ ] **[Anda]** Cloudflare > Workers & Pages > Create > Pages > Connect to Git → repo `iwalislamuddin/dtswebapp`
      (otorisasi GitHub App Cloudflare). Production branch `main`. Build command sementara
      `bash scripts/cf-build.sh`, output `dist` (diganti `npm run build` setelah Tahap 3)
- [ ] **[Anda]** Cek hasil di URL `*.pages.dev` (tool terbuka, deep-link `/beam-flexure` tidak 404)
- [ ] **[Anda]** Zona `edifisia.com` > Caching > Configuration > **Browser Cache TTL = Respect Existing Headers**
      (mungkin sudah diset saat Matrix)
- [ ] ⚠️ **Jangan pasang custom domain `tools.edifisia.com` dulu** — build `main` masih memuat paywall Firebase
      yang aktif otomatis. Domain dipasang di Tahap 6
- [x] **[Claude]** `X-Robots-Tag: noindex` untuk host `*.pages.dev` agar URL sementara tidak terindeks
      (`_headers`, 2026-10-06) → **[Anda]** setelah deploy pertama cek: DevTools > Network > dokumen → header ada

**Login Google** (satu kali untuk semua aplikasi Edifisia — Matrix ikut memakai)
- [x] **[Anda]** Google Cloud: **project baru `Edifisia`** (jangan pakai project Firebase `edfs-civil-tools-e3a59`,
      yang akan dihapus di Tahap 7 — ikut menghapus OAuth client dan mematikan login semua aplikasi)
- [x] **[Anda]** Google Auth Platform > **Branding**: nama app `Edifisia`, email dukungan, **tanpa logo dulu**
      (logo memicu verifikasi brand), Authorized domains `edifisia.com` + `<ref-dev>.supabase.co` +
      `<ref-prod>.supabase.co`, email kontak developer
- [ ] **[Anda]** **Audience**: External ✅. Sisa: *Publish app* (In production) — selama status Testing hanya
      Test users yang bisa login. Scope dasar
      (email, profile, openid) tidak perlu review Google
- [x] **[Anda]** **Data Access**: scope `openid`, `userinfo.email`, `userinfo.profile`
- [x] **[Anda]** **Clients**: dua OAuth client *Web application* — `Supabase dev` & `Supabase prod`, redirect URI
      = Callback URL dari panel Google di Supabase (`https://<ref>.supabase.co/auth/v1/callback`).
      **Salin Client Secret saat dibuat** (Google hanya menampilkannya sekali)
- [x] **[Anda]** Supabase **dev & prod** > Authentication > Sign In / Providers > **Google**: aktifkan, isi Client ID +
      Client Secret. Secret hanya di dashboard — jangan ke repo/chat
- [x] **[Anda]** Supabase dev & prod > Authentication > URL Configuration > Redirect URLs: tambah
      `https://matrix.edifisia.com/**`, `https://tools.edifisia.com/**`, dan (dev saja) `http://localhost:*/**`
      (2026-10-06; prod Site URL `https://matrix.edifisia.com`)
- [x] **[Anda]** Supabase **dev** Site URL: ganti default `http://localhost:3000` → `http://localhost:5173` (dev Matrix) — 2026-10-06
- [x] **[Anda]** Putus integrasi GitHub Supabase di `edifisia-dev` (migrasi dikelola tiap repo, bukan integrasi) — 2026-10-06
- [ ] Nanti (Tahap 8): tambah `https://edifisia.com/**` di prod saat halaman akun platform ada
- [x] **[Anda]** Uji cepat: buka `https://<ref>.supabase.co/auth/v1/authorize?provider=google` → pilih akun Google →
      kembali ke Site URL; user baru muncul di Supabase > Authentication > Users (dan mendapat trial 7 hari)
      ✅ 2026-10-06: login Google dev berhasil, user muncul di Authentication > Users (redirect ke
      `localhost:5173` gagal tampil hanya karena dev server Matrix tidak jalan — normal). Belum dicek: baris trial di
      `platform.entitlements` untuk user Google itu → cek di awal Tahap 2. Prod belum diuji (uji saat Tahap 6)
- [ ] **[Platform]** Kebijakan akun ganda: email sama lewat password & Google — Supabase menautkan otomatis bila
      email terverifikasi; pastikan perilaku ini sesuai untuk trial (satu trial per akun)
- [ ] Opsional nanti: Supabase custom domain (mis. `auth.edifisia.com`, add-on berbayar) agar layar Google
      menampilkan domain Edifisia, bukan `<ref>.supabase.co`

## Tahap 2 — Database: skema `tools` di Supabase

- [x] **[Claude]** Folder `supabase/` + migrasi `tools.saved_works` (RLS: baca/hapus pemilik; tulis pemilik +
      `platform.has_premium()`; trigger `updated_at`; trigger batas **50** per user) — 2026-10-06
- [x] **[Claude]** `tests/tools_test.sql` + runner (pola repo platform, transaksi selalu di-rollback) — lulus di
      Postgres lokal (PGlite + skema platform asli + tiruan `auth`); 12 mutasi sengaja, 10 tertangkap, 2 sisanya
      tetap aman karena lapisan lain (RLS select / with check)
- [x] **[Claude]** `scripts/db_migrate.py` — **pengganti `supabase db push`** (riwayat CLI milik repo platform;
      push dari repo ini akan ditolak). Riwayat di `tools.schema_migrations`. Lihat PLATFORM.md §2
- [x] **[Anda]** ✅ 2026-10-07 diterapkan & lulus. Jalankan di **development** (Sydney), di PowerShell (password tetap di tangan Anda, jangan ke chat):
      ```
      pip install psycopg2-binary
      $env:DATABASE_URL = "<session pooler dev>"
      python tests/run.py                    # migrasi + test, rollback — harus "semua lulus"
      python scripts/db_migrate.py --dry-run
      python scripts/db_migrate.py
      python tests/run.py --applied
      Remove-Item Env:DATABASE_URL
      ```
- [x] **[Anda]** Cek trial user Google dev (sisa Tahap 1) — 2026-10-07: akun Google punya baris `trial` 7 hari ✅
- [x] **[Anda]** Supabase dev > Settings > Data API > **Exposed schemas**: tambah `tools` — 2026-10-07
- [x] **[Anda]** Kirim ke Claude: **Project URL + anon/publishable key** dev dan prod — 2026-10-07, dicatat di
      PLATFORM.md §2 (Konfigurasi klien)

## Tahap 3 — Fondasi React + mesin hitung `src/calc`

Urutan diubah 2026-10-07: tool **tidak** dibungkus dulu lalu ditulis ulang (kerja dua kali). Perhitungan dikeluarkan
ke `src/calc/` (TypeScript murni, tanpa UI) dengan *golden test* terhadap build lama, lalu tiap tool langsung
ditulis ulang dengan UI baru di Tahap 5. Arah UI: [UI.md](UI.md).

- [x] **[Claude]** Tooling: `package.json` (React + TS + Vite + Vitest + oxlint, versi seperti Matrix), `tsconfig`
- [x] **[Claude]** Harness golden: `scripts/golden/extract.mjs` menjalankan `compute()` modul lama atas daftar
      kasus → `src/calc/__golden__/*.json`; test TS wajib sama (toleransi relatif 1e-9)
- [ ] **[Claude]** Port perhitungan per tool ke `src/calc/<tool>.ts` + golden test + kasus hitung tangan dari
      HANDOFF; fungsi bersama di `src/calc/shared/`. Panduan: [`src/calc/README.md`](../src/calc/README.md).
      35 tool (`_template` tidak dihitung):
      - [x] Geoteknik: `bearing-capacity`, `pile-capacity` (+ `shared/geotech.ts`) — 2026-10-07
      - [x] Geoteknik: `settlement`, `cpt-bearing`, `cpt-pile` (+ `shared/cpt.ts`) — 2026-10-07
      - [x] Geoteknik: `lateral-broms`, `py-analysis` (+ `rankineKp` di `shared/geotech.ts`) — 2026-10-07 —
            **kelompok geoteknik lengkap**
      - [x] Struktur bawah: `footing-design`, `pile-cap`, `retaining-concrete`, `retaining-stone`
            (+ `shared/concrete.ts`, `shared/retaining.ts`) — 2026-10-07
      - [x] Beton gelombang 1: `development-length`, `beam-flexure`, `beam-shear-torsion`, `min-reinforcement`,
            `two-way-slab` (+ `rhoMinBeam`, `stripDesign` di `shared/concrete.ts`) — 2026-10-07
      - [x] Beton gelombang 2: `column-pm`, `continuous-beam`, `composite-slab`, `concrete-stair`
            (+ `crackedInertia`, `effectiveInertia` di `shared/concrete.ts`) — 2026-10-07 — **kelompok beton lengkap**
      - [ ] Baja (port `core/steel-profiles.js` → `shared/` dulu): `steel-tension`, `steel-compression`,
            `steel-flexure`, `steel-beam-analysis`, `base-plate`
      - [ ] Sambungan: `bolt-connection`, `weld-connection`, `anchor-bolt-group`
      - [ ] Analisis struktur: `portal-frame`, `gable-frame`
      - [ ] Umum & hidraulika: `load-combo`, `wind-load`, `rational-method`, `open-channel`, `pipe-flow`
- [ ] **[Claude]** Shell React sesuai UI.md: menu bar File/Help, navigasi kiri, header, tab Input/Detail, tema
      Light/Dark (token `[data-theme]`, aksen `#566246`, tipografi Matrix)
- [ ] **[Claude]** Routing path `/{tool}` + lazy load per tool; PWA `vite-plugin-pwa` (prompt update seperti Matrix);
      pre-render HTML per rute (title/description/canonical) untuk SEO
- [ ] **[Claude]** Laporan (Detail + Download PDF/.txt) dari satu sumber data per tool; PDF tetap tanpa library
- [ ] **[Claude]** Lint + test di CI (GitHub Actions), pola Matrix

### Perbaikan isi tool — SETELAH semua tool selesai di-port

Port dibuat 1:1 (golden test). Perubahan rumus/perilaku dikumpulkan di sini lalu dikerjakan sebagai commit
terpisah yang memperbarui acuan golden secara sadar.

- [ ] **[Anda]** Daftar tool yang isinya ingin diubah (disampaikan pemilik 2026-10-07, rinciannya menyusul)
- [ ] `footing-design` → **`shallow-foundation`** dan `pile-cap` → **`deep-foundation`** (+ redirect 301), tab
      Settlement opsional — spesifikasi: [TOOL-REVISIONS.md](TOOL-REVISIONS.md) §1–3
- [ ] **Library Data** (Premium; tanah, profil lapis, CPT, N-SPT, material; nama + deskripsi, tanpa proyek) —
      [TOOL-REVISIONS.md](TOOL-REVISIONS.md) §4 (keputusan 2026-10-07)
- [ ] Profil baja: ganti sumber ke tabel JIS EDFS Matrix (perubahan angka sadar) — TOOL-REVISIONS.md §4
- [ ] `retaining-concrete`: cabang tekanan tumpu terfaktor segitiga ke arah heel tidak tercapai oleh kasus uji
      (dinding nyata praktis tak mencapainya) — tambahkan uji langsung saat fungsi tumpu terfaktor dirapikan
- [ ] `settlement`: derajat konsolidasi melompat kecil di U ≈ 60% (batas cabang Tv = 0,2827; rumus log memberi
      59,66% di sana) — geser batas ke Tv ≈ 0,286 agar kontinu
- `concrete-stair`: tumpuan rol-rol (mekanisme) membuat build lama **crash** (solusi layan null tidak dicek); port
  melaporkan "Struktur tidak stabil" — diuji langsung, kasus ini dikeluarkan dari golden
- β1 disatukan ke versi Tabel 22.2.2.4.3 (0,65 untuk f'c ≥ 55 MPa) di `shared/concrete.ts`. Modul lama tapak,
  pelat dua arah, dinding beton, kolom P-M, pelat komposit, tangga memakai rumus tanpa batas itu → β1 0,657 pada
  55 ≤ f'c < 56 MPa; kini 0,65 (perbedaan hanya di rentang itu, di luar kasus golden)
- Sudah diselaraskan saat port (tidak memengaruhi angka hasil): penanda φ > 50° Terzaghi yang bocor antar
  perhitungan (`bearing-capacity`); parser CPT `cpt-bearing` kini mengonversi satuan kolom fs seperti `cpt-pile`
  (fs tidak dipakai di hitungan fondasi dangkal)

## Tahap 4 — Akun & Save versi Supabase (di shell React)

- [ ] **[Claude]** Lapisan akun: `@supabase/supabase-js`, email + password + **Google**, status dari
      `platform.premium_status()`; "Daftar"/"Lupa password" → `edifisia.com` (sementara: dialog lokal, seperti Matrix)
- [ ] **[Claude]** Simpan Pekerjaan → `tools.saved_works` (`state_json` = objek input tool); Free User buka & hapus
      saja; pesan jelas saat batas 50 tercapai (hint `saved_works_limit`)
- [ ] **[Claude]** Status "Trial/Premium s/d …", peringatan ≤ 7 hari; tombol beli disembunyikan selama
      `PREMIUM_URL` belum ada
- [ ] **[Claude]** Gating Download Report di satu titik mengacu status Supabase; tab Detail tetap terbuka
- [ ] **[Claude]** Uji empat akun: Guest, Premium/trial, Free User (trial habis), Premium expired — email & Google
- [ ] **[Anda]** Siapkan akun uji di dev; grant/expire manual lewat SQL `platform.grant_premium` (README platform)

## Tahap 5 — 36 tool di UI baru

- [ ] **[Bersama]** Tool percontohan (mis. Kapasitas Lentur Balok) disetujui dulu sebelum tool lain diikuti;
      putuskan hitung otomatis vs tombol Hitung (UI.md)
- [ ] **[Claude]** Tulis ulang tiap tool di atas `src/calc` (input, preview, diagram, ringkasan, Detail)
- [ ] **[Claude]** Verifikasi tiap tool di browser (angka = golden, kanvas, PDF, simpan/buka), konsol bersih
- [ ] **[Claude]** Pembersihan build lama: `assets/`, `core/`, `modules/`, `sw.js`, `scripts/cf-build.sh`,
      `.htaccess`, Firebase (`functions/`, `firebase/`, `firebase.json`, `.firebaserc`); README/ARCHITECTURE
- [ ] **[Anda]** Cloudflare Pages: build command → `npm ci && npm run build`, output `dist`, env `NODE_VERSION`

## Tahap 6 — Rilis v0.8.0 di `tools.edifisia.com`

- [ ] **[Claude]** URL kanonik → `https://tools.edifisia.com` (DOMAIN_MIGRATION.md §5), sitemap, robots,
      catatan rilis v0.8.0 di modal Tentang
- [ ] **[Anda]** Supabase **production**: `scripts/db_migrate.py` + `tests/run.py --applied` (Session pooler prod),
      Exposed schemas `tools`
- [ ] **[Anda]** Cloudflare Pages > Custom domains > `tools.edifisia.com` (CNAME & SSL otomatis)
- [ ] **[Bersama]** Uji asap di domain asli: login email & Google, simpan, buka, unduh PDF Premium & non-Premium
- [ ] **[Anda]** Google Search Console: **Domain property `edifisia.com`** (verifikasi TXT di DNS Cloudflare)
      → submit `https://tools.edifisia.com/sitemap.xml` → Request indexing halaman depan + beberapa tool
- [ ] **[Anda]** GA4 `G-2MDVZFKNSE`: cek hit dari domain baru masuk (Realtime)

## Tahap 7 — Pensiunkan hosting & layanan lama

- [ ] **[Claude]** Siapkan `.htaccess` redirect 301 (path dipertahankan) untuk domain lama
- [ ] **[Anda]** cPanel `tools.dtsengineering.co.id`: ganti isi document root dengan `.htaccess` redirect saja
- [ ] **[Anda]** Firebase `edfs-civil-tools-e3a59`: hapus Cloud Functions → matikan billing Blaze → hapus project
- [ ] **[Anda]** Midtrans Dashboard (sandbox): kosongkan Payment Notification URL lama (Cloud Function)

## Tahap 8 — Menunggu platform

- [ ] **[Platform]** Halaman register/akun/beli + Kebijakan Privasi & Syarat Layanan di `edifisia.com` →
      isi `REGISTER_URL` / `PREMIUM_URL` Civil Tools (juga dibutuhkan consent screen Google)
- [ ] **[Platform]** Webhook Midtrans + harga Edifisia Premium → tombol beli muncul
- [ ] **[Platform]** *Confirm email* + custom SMTP sebelum launch publik (cegah penyalahgunaan trial)
- [ ] **[Bersama]** Sesi lintas subdomain: cookie `Domain=.edifisia.com` bersama Matrix
