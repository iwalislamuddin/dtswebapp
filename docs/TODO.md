# TODO — Penyelarasan Platform Edifisia + Rombak UI

Rencana & alasan: [PLATFORM.md](PLATFORM.md). File ini hanya daftar kerja yang **terbuka**;
yang selesai dicentang, lalu dipindah ke HANDOFF.md saat satu tahap rampung.

Penanda pelaksana: **[Anda]** = manual di dashboard/akun (tidak bisa dikerjakan asisten) ·
**[Claude]** = kode/dokumen di repo · **[Bersama]** = Claude menyiapkan, Anda menjalankan/menyetujui ·
**[Platform]** = pekerjaan repo platform Edifisia, bukan repo ini.

> Civil Tools **tidak butuh server/VPS sendiri**: aplikasinya statis (Cloudflare Pages), akun & data di
> Supabase. VPS Edifisia hanya untuk backend Matrix/platform.

---

## Tahap 0 — Keputusan ✅ (2026-10-06/07)

Vite + **React + TypeScript**; semua tool gratis, Premium = Save, tab Detail & PDF (Detail dikunci 2026-10-08); batas 50 pekerjaan per user;
login Google. Rincian: [PLATFORM.md](PLATFORM.md) §1.

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
- [x] **[Anda]** Uji login Google di dev — 2026-10-06 berhasil; baris trial 7 hari terkonfirmasi 2026-10-07.
      Prod diuji saat Tahap 6
- [ ] **[Platform]** Kebijakan akun ganda: email sama lewat password & Google — Supabase menautkan otomatis bila
      email terverifikasi; pastikan perilaku ini sesuai untuk trial (satu trial per akun)
- [ ] Opsional nanti: Supabase custom domain (mis. `auth.edifisia.com`, add-on berbayar) agar layar Google
      menampilkan domain Edifisia, bukan `<ref>.supabase.co`

## Tahap 2 — Database: skema `tools` ✅ (2026-10-07)

`tools.saved_works` (RLS, batas 50) + test SQL (rollback) + `scripts/db_migrate.py` (pengganti `supabase db push`)
— diterapkan & lulus di **development**, skema `tools` di-expose, URL + publishable key dev/prod tercatat.
Perintah & detail: [PLATFORM.md](PLATFORM.md) §2. Production menyusul di Tahap 6.

## Tahap 3 — Fondasi React + mesin hitung `src/calc` ✅ (2026-10-07)

Urutan diubah 2026-10-07: tool **tidak** dibungkus dulu lalu ditulis ulang (kerja dua kali). Perhitungan dikeluarkan
ke `src/calc/` (TypeScript murni, tanpa UI) dengan *golden test* terhadap build lama, lalu tiap tool langsung
ditulis ulang dengan UI baru di Tahap 5. Arah UI: [UI.md](UI.md).

- [x] **[Claude]** Tooling: `package.json` (TypeScript + Vitest + oxlint, versi seperti Matrix), `tsconfig` strict —
      React & Vite dipasang bersama shell
- [x] **[Claude]** Harness golden: `scripts/golden/extract.mjs` menjalankan `compute()` modul lama atas daftar
      kasus → `src/calc/__golden__/*.json`; test TS wajib sama (toleransi relatif 1e-9)
- [x] **[Claude]** Port perhitungan per tool ke `src/calc/<tool>.ts` + golden test + kasus hitung tangan dari
      HANDOFF; fungsi bersama di `src/calc/shared/`. Panduan: [`src/calc/README.md`](../src/calc/README.md).
      **34/35 selesai 2026-10-07** (`load-combo` sengaja tidak di-port), 717 test lulus, rekam ulang acuan identik byte-per-byte (`_template` tidak dihitung):
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
      - [x] Baja: `steel-tension`, `steel-compression`, `steel-flexure`, `steel-beam-analysis`, `base-plate`
            (+ `shared/steel-profiles.ts` 1:1 dari `core/steel-profiles.js`, `shared/steel.ts`) — 2026-10-07
      - [x] Analisis struktur: `portal-frame`, `gable-frame` (+ `shared/frame2d.ts`, dipakai juga `concrete-stair`)
            — 2026-10-07
      - [x] Pembebanan & hidraulika: `wind-load`, `rational-method`, `open-channel`, `pipe-flow`
            (+ `shared/hydraulics.ts`) — 2026-10-07
      - [x] Baja (sambungan sederhana): `bolt-connection`, `weld-connection`, `anchor-bolt-group` — 73 kasus golden +
            hitung tangan, uji mutasi — 2026-10-07 (sambungan lengkap → EDFS Nexus, PLATFORM.md §1a)
      - ⏸ **`load-combo`** — TIDAK di-port; disembunyikan di UI baru, akan dihapus atau diganti formatnya
        (2026-10-07). Fitur handoff "Kirim ke…" ikut ditinjau ulang bersamanya
- [x] **[Claude]** Katalog tool `src/tools.ts` (id, nama, kategori, status, SEO) dari registry lama + test
      konsistensi; kategori **"Umum" → "Pembebanan"** (keputusan pemilik 2026-10-07), `load-combo` `hidden`,
      sambungan `pending` — 2026-10-07
- [x] **[Bersama]** Diskusi sambungan → aplikasi terpisah **EDFS Nexus** (sekelas Limcon / IDEA StatiCa);
      `base-plate` pindah ke Nexus, baut & las sederhana tetap di Civil Tools — 2026-10-07 (PLATFORM.md §1a)
- [x] **[Claude]** `base-plate` keluar dari navigasi: status baru `moved` (`movedTo: 'EDFS Nexus'`), rute
      `/base-plate` menampilkan pemberitahuan pindah (noindex); `src/calc/base-plate.ts` disimpan sebagai bahan
      Nexus — 2026-10-07. Tautan ke Nexus ditambahkan saat Nexus rilis
- [x] **[Anda]** `anchor-bolt-group` tetap di Civil Tools; pondasi Civil Tools = pondasi tunggal (Radix = seluruh
      bangunan); baut & las → kategori Baja, "Sambungan" dihapus; Radix & Nexus ikut satu Edifisia Premium — 2026-10-07
- [x] **[Claude]** `src/tools.ts`: baut, las, `anchor-bolt-group` → Baja; kategori Sambungan dihapus; kategori
      **Struktur Bawah** (tapak, pile cap, DPT batu kali & beton). `pending` kini berarti "belum di-port, tampil
      setelah port" — 2026-10-07
- [ ] **[Anda]** Gating fitur Premium di EDFS Radix & EDFS Nexus (belum ditentukan)
- [x] **[Claude]** Shell React sesuai UI.md: menu bar File/Help, navigasi kiri (cari tool, laci di layar sempit),
      header, tab Input/Detail, tema Light/Dark (token `[data-theme]`, aksen `#566246`, tipografi Matrix), dialog
      Tentang & Catatan Rilis, halaman depan & 404 — 2026-10-07. Struktur: ARCHITECTURE.md §A.1a
- [x] **[Claude]** Routing path `/{tool}` (tanpa library) + lazy load UI per tool (`src/tools/registry.ts`);
      head per rute (`src/app/head.ts`); PWA `vite-plugin-pwa` prompt update; GA4 hanya di domain produksi —
      2026-10-07
- [x] **[Claude]** Pre-render HTML per rute saat build (plugin di `vite.config.ts` → `src/app/seo.ts`):
      `<id>.html` per tool (title, description, canonical/noindex, Open Graph, isi statis), `404.html` (status 404
      asli, bukan fallback SPA), `sitemap.xml` (tool aktif) + `robots.txt` & `_headers` di `web/public/` — 2026-10-07
- [x] **[Claude]** Kontrak UI tool (state input, hitung otomatis, Detail/Report) — ditetapkan bersama tool
      percontohan 2026-10-08: [`src/tools/README.md`](../src/tools/README.md)
- [x] **[Claude]** Laporan dari satu sumber per tool (`src/report/`): model `Report` → tab Detail (HTML + SVG ikut
      tema) dan PDF — diganti 2026-10-08: PDF pdf-lib berwarna, .txt dihapus. Modul laporan per tool di
      `src/tools/<id>/report.ts`; contoh acuan `bolt-connection` (tab Detail memakai input bawaan sampai UI barunya
      ada). File > Download Report aktif bila tool punya laporan — 2026-10-07. Sisa: laporan 17 tool lain ditulis
      bersama UI-nya di Tahap 5 (kelompok Baja & Beton sudah ditulis ulang berumus 2026-10-08); gating Premium di Tahap 4
- [x] **[Claude]** CI GitHub Actions (`.github/workflows/ci.yml`): typecheck, lint, test, rekam ulang golden harus
      identik, build — 2026-10-07

### Perbaikan isi tool — SETELAH semua tool selesai di-port

Port dibuat 1:1 (golden test). Perubahan rumus/perilaku dikumpulkan di sini lalu dikerjakan sebagai commit
terpisah yang memperbarui acuan golden secara sadar.

- [ ] **[Anda]** Daftar tool yang isinya ingin diubah — sudah: tapak → `shallow-foundation`, pile cap →
      `deep-foundation`, Library Data, `load-combo`; menyusul: tool lain bila ada
- [ ] ⚠️ **Profil siku (L) di `core/steel-profiles.js` salah baca kolom** (ditemukan 2026-10-07): Sx = Sy = nilai imin
      (L75×75×6 → 1,46 cm³, seharusnya ±8,5) dan imin = undefined. Akibat: cek kelangsingan L/r siku di
      `steel-tension` terlewati diam-diam; lentur siku `steel-flexure` (F10 indikatif) ±6× terlalu kecil. Juga cek
      `steel-compression` siku memakai ix/iy, bukan iv (sumbu lemah utama) → tekuk siku tunggal tidak konservatif.
      Perbaiki bersama penggantian sumber ke tabel JIS Matrix (punya Iu/Iv/iu/iv). **Prioritas pertama setelah port.**
- [ ] ⚠️ `weld-connection` (ditemukan 2026-10-08 saat tulis ulang UI): las end-loaded dengan Lw/w > 300 memakai
      β = 0,6, padahal J2.2b menetapkan panjang efektif 180w (β efektif = 180/(Lw/w) < 0,6) — **tidak konservatif**.
      Peringatan Lw < 4w juga keliru redaksi: J2.2b membatasi *ukuran* efektif las ≤ Lw/4, bukan "panjang efektif
      25% Lw". Laporan baru menampilkan β apa adanya dari mesin hitung
- [ ] `footing-design` → **`shallow-foundation`** dan `pile-cap` → **`deep-foundation`** (+ redirect 301), tab
      Settlement opsional — spesifikasi: [TOOL-REVISIONS.md](TOOL-REVISIONS.md) §1–3
- [ ] **Library Data** (Premium; tanah, profil lapis, CPT, N-SPT, material; nama + deskripsi, tanpa proyek) —
      [TOOL-REVISIONS.md](TOOL-REVISIONS.md) §4 (keputusan 2026-10-07)
- [ ] Profil baja: ganti sumber ke tabel JIS EDFS Matrix (perubahan angka sadar) — TOOL-REVISIONS.md §4
- [ ] ⚠️ **`retaining-stone` / `retaining-concrete`: `qmax` salah bila resultan condong ke heel** (ditemukan 2026-10-14):
      `basePressure` (`shared/retaining.ts`) pada kasus trapesium (|e| ≤ B/6) mengembalikan `qmax` = tekanan di toe
      walau e < 0 — padahal maksimum ada di heel (kasus golden "lereng curam ke heel": qmax 16,7 < qmin 53,6 kPa).
      Cek daya dukung (`dcQ`, `okQ`, peringatan) jadi **tidak konservatif**. UI & laporan baru memakai tekanan toe/heel
      sebenarnya (`basePressures` di `src/tools/_retaining/common.ts`); mesin hitung dibiarkan 1:1 sampai perbaikan
      disengaja (perbarui golden). Perlu juga `tri`-cabang dicek bila e < −B/6 (sudah benar)
- [ ] `pile-cap` (2026-10-14): UI memakai tabel koordinat tiang (mesin hitung menerima `piles`, reaksi via titik berat + Ixy,
      tepi poer = bounding box nyata). Susunan n/s lama masih menganggap poer simetris terhadap kolom — **tak tepat untuk
      3 tiang** (pons tiang); dibiarkan demi golden. Poer poligon (segitiga untuk 3 tiang) selesai 2026-10-14: selubung tiang + overhang dengan sudut terpangkas; lebar lentur/geser = potongan poligon di muka kolom / jarak d (sisi penentu), pons tiang memangkas keliling dengan tepi poligon. Batas: penampang kritis hanya tegak lurus sumbu X/Y (tidak sejajar sisi miring); pons kolom diasumsikan keliling di dalam poer
- [ ] `retaining-concrete`: cabang tekanan tumpu terfaktor segitiga ke arah heel tidak tercapai oleh kasus uji
      (dinding nyata praktis tak mencapainya) — tambahkan uji langsung saat fungsi tumpu terfaktor dirapikan
- [ ] `settlement`: derajat konsolidasi melompat kecil di U ≈ 60% (batas cabang Tv = 0,2827; rumus log memberi
      59,66% di sana) — geser batas ke Tv ≈ 0,286 agar kontinu
- `steel-flexure`: SHS/RHS dengan sayap langsing (mis. SHS 200×6, Fy kustom 450) membuat build lama **crash**
  (`f.lamF` tak ada pada F7); port memakai λ klasifikasi sayap — diuji langsung, kasus dikeluarkan dari golden
- `concrete-stair`: tumpuan rol-rol (mekanisme) membuat build lama **crash** (solusi layan null tidak dicek); port
  melaporkan "Struktur tidak stabil" — diuji langsung, kasus ini dikeluarkan dari golden
- β1 disatukan ke versi Tabel 22.2.2.4.3 (0,65 untuk f'c ≥ 55 MPa) di `shared/concrete.ts`. Modul lama tapak,
  pelat dua arah, dinding beton, kolom P-M, pelat komposit, tangga memakai rumus tanpa batas itu → β1 0,657 pada
  55 ≤ f'c < 56 MPa; kini 0,65 (perbedaan hanya di rentang itu, di luar kasus golden)
- Sudah diselaraskan saat port (tidak memengaruhi angka hasil): penanda φ > 50° Terzaghi yang bocor antar
  perhitungan (`bearing-capacity`); parser CPT `cpt-bearing` kini mengonversi satuan kolom fs seperti `cpt-pile`
  (fs tidak dipakai di hitungan fondasi dangkal)

## Tahap 4 — Akun & Save versi Supabase (di shell React)

> Ditunda (keputusan pemilik 2026-10-08): Tahap 5 dikerjakan lebih dulu. Titik sambung sudah disiapkan — input tool
> = objek JSON (`useToolInput`) untuk Simpan/Buka, dan Download Report lewat satu titik (menu File / `ReportView`).

- [x] **[Claude]** Lapisan akun (2026-10-15): `@supabase/ssr` + cookie `.edifisia.com` (SSO, sama dengan Matrix &
      edifisia.com), status dari `platform.premium_status()`, tombol Masuk / menu akun (badge Trial/Premium s/d …,
      Akun Edifisia, Keluar). **Di `*.edifisia.com` login = redirect** ke `<pusat akun>/masuk?next=<halaman>` (Site
      URL & Redirect URLs Supabase menunjuk edifisia.com); di localhost / `*.pages.dev` dialog lokal (email + sandi,
      Google dengan `redirectTo` halaman ini). **Database dipilih menurut alamat** (satu build untuk semua, keputusan
      pemilik 2026-10-15): `tools.edifisia.com` → prod + `edifisia.com`; `*.pages.dev` (URL development) &
      localhost → dev + `staging.edifisia.com`. `VITE_AUTH_TARGET=prod` di `.env.local` memaksa prod untuk uji lokal
- [x] **[Anda]** Uji login Google di `npm run dev` (DB dev) — berhasil 2026-10-15
- [x] **[Anda]** Redirect URLs project **dev**: `https://dtswebapp.pages.dev/**`, `https://*.dtswebapp.pages.dev/**`
- [ ] **[Anda]** Uji login email & Google di `https://dtswebapp.pages.dev`
- [ ] Saat rilis v0.8.0 (`tools.edifisia.com` dipasang ke `main`): buat branch **`dev`** → URL uji tetap
      `https://dev.dtswebapp.pages.dev` (database dev); kerja di `dev`, merge ke `main` = rilis
- [ ] **[Claude]** Simpan Pekerjaan → `tools.saved_works` (`state_json` = objek input tool); Free User buka & hapus
      saja; pesan jelas saat batas 50 tercapai (hint `saved_works_limit`)
- [ ] **[Claude]** Status "Trial/Premium s/d …", peringatan ≤ 7 hari; tombol beli disembunyikan selama
      `PREMIUM_URL` belum ada
- [x] **[Claude]** `src/app/premium.ts` (`usePremium`) mengacu status Supabase — satu titik gating tab Detail & PDF.
      **Dinyalakan 2026-10-17** (`PREMIUM_GATE = true`): Free User/Guest → tab Detail terkunci (daftar isi saja), PDF
      nonaktif, Simpan Pekerjaan tetap nonaktif (sengaja). Panel terkunci: Guest → tombol Masuk + tautan daftar ("trial
      Premium 7 hari"); trial/Premium habis → tautan Akun Edifisia; status dibaca → "Memeriksa status Premium…".
      Trial 7 hari = trigger platform `grant_trial_on_confirm` (sama dengan Matrix), tak ada kode di Civil Tools
- [ ] **[Claude]** Uji empat akun: Guest, Premium/trial, Free User (trial habis), Premium expired — email & Google
- [ ] **[Anda]** Siapkan akun uji di dev; grant/expire manual lewat SQL `platform.grant_premium` (README platform)

## Tahap 5 — Tool di UI baru (berjalan sejak 2026-10-08)

> Sesi 2026-10-08 ditutup saat **menunggu tinjauan pemilik atas tab Detail & PDF** percontohan. Setelah disetujui:
> tool berikutnya mengikuti [`src/tools/README.md`](../src/tools/README.md).

- [x] **[Bersama]** Tinjauan pemilik 2026-10-08 → diterapkan: header kategori navigasi kontras & bisa dilipat; tab
      Detail = laporan dengan heading, rumus → substitusi → hasil, tabel, gambar berwarna; Detail & PDF Premium;
      tombol PDF di kanan baris tab; ekspor .txt dihapus; PDF baru (pdf-lib + font DejaVu, A4, berwarna, footer
      bernomor halaman) menggantikan PDF monospace tanpa library. Tab Input disetujui
- [ ] **[Bersama]** Tool percontohan **Analisis Balok Baja** (`steel-beam-analysis`, dipilih 2026-10-08 karena paling
      dekat mockup "Balok Sederhana") — dibangun 2026-10-08; **tinjauan putaran 2** (laporan/PDF baru) sebelum tool lain diikuti.
      Hitung otomatis sudah diputuskan (UI.md). Catatan percontohan: bawaan profil WF 300×150 (build lama memilih
      ukuran tengah daftar, WF 500×200); batas 3 beban merata / 4 terpusat dari mesin hitung lama dipertahankan
  - [x] Tinjauan format Detail & PDF putaran 2 — 2026-10-08: halaman setengah kosong & halaman penutup yatim,
        deskripsi judul dihapus, dialog Cetak PDF + Deskripsi (diingat per tool, localStorage), jingga heading dihapus,
        rumus tanpa sorot (garis kiri tipis), jeda setelah ringkasan. Tabel/header/footer disetujui
  - [ ] **[Anda]** Tinjauan redaksi laporan (sekaligus, nanti)
- [ ] **[Claude]** Tulis ulang tiap tool di atas `src/calc` (input, preview, diagram, ringkasan, Detail) — **33/33 tool aktif, semua kelompok lengkap**:
  - [x] `steel-beam-analysis` (percontohan) — 2026-10-08
  - [x] `bolt-connection` — 2026-10-08: 4 kartu input (mutu/ulir/Fnt-Fnv kustom bersyarat, d, bidang geser
        tunggal/ganda; pola; pelat tumpu; beban), preview denah + potongan bidang geser, diagram batang kapasitas
        Grup / Per baut, laporan baru berumus (Ab, dh, syarat geometri J3.3–J3.5, J3-1, J3-6a/c, tabel kapasitas
        grup efektif, J3-3a) + 2 gambar berwarna. Input bawaan = golden default; 8 kasus golden diuji lewat input UI
  - [x] `weld-connection` — 2026-10-08: 4 kartu (las, arah beban, logam dasar, beban), preview las + arah θ +
        potongan throat, diagram Kapasitas / Faktor arah kd(θ), laporan berumus (te, Awe, J2-5, J2-1, J2-4, J4-3,
        J4-4) + 2 gambar. Grafik batang kapasitas kini komponen bersama `src/ui/bars.tsx` (baut & las)
  - [x] `steel-tension`, `steel-compression`, `steel-flexure`, `anchor-bolt-group` — 2026-10-08. Bagian bersama
        `src/tools/_steel/` (geometri penampang untuk SVG & laporan, pemilih profil, mutu baja: Fy/Fu diisi hanya
        bila Kustom). Laporan berumus: tarik D2-1/D2-2 + L/r; tekan E3/E4-2 + elemen B4.1a + kurva kolom; lentur per
        pasal F2/F3, F6, F7 (+F7.4), F8, indikatif + kurva Mn–Lb; angkur 17.6.1/17.6.2/17.7.1–17.7.3/17.8 + diagram
        interaksi. **Kelompok Baja lengkap** (7/7)
  - [x] Kelompok **Beton lengkap** (9/9) — 2026-10-08: `development-length` (ld + tabel per diameter),
        `beam-flexure` (kesetimbangan gaya, φ–εt, φMn vs jumlah batang), `min-reinforcement` (5 elemen),
        `beam-shear-torsion` (22.5/22.7, Al, spasi), `two-way-slab` (jalur silang, jalur tepi, lendutan Ie),
        `column-pm` (P–Mx, P–My, kontur biaksial), `continuous-beam` (koefisien 6.5, desain & geser),
        `composite-slab` (konstruksi/komposit/konektor; properti dek dari tabel bisa ditimpa), `concrete-stair`
  - [x] **Balok Menerus & Pelat Satu Arah Menerus dipisah** (2026-10-14): tool baru `one-way-slab`; satu mesin
        `src/calc/continuous-beam.ts` (+ `one-way-slab.ts`) membungkus metode koefisien lama
        (`shared/coefficient-method.ts`, tetap terkunci golden). Opsi **Otomatis / Koefisien / Solver**: syarat 6.5.1
        gagal (qL > 3qD, beda bentang > 20%) → analisis elastis sebenarnya (`shared/beam-solver.ts` di atas
        `frame2d`, EI per elemen, amplop pola beban hidup, momen direduksi ke muka tumpuan). **Pengaruh retak**: Ig /
        Ie rata-rata per bentang (24.2.3.7) / Ie(x) bervariasi per 1/10 bentang (iterasi dengan As terpasang).
        **Balok T/L**: lebar tributari + tebal pelat sayap (beban pelat ikut), lebar efektif Tabel 6.3.2.1 per bentang,
        lentur positif sebagai T, negatif b_w (`shared/tee.ts`). Lendutan selalu dari solver (δD, δL, λΔ, L/360 &
        L/480|360|240). **Gambar penulangan** (`_continuous/rebar.ts`, tab Preview "Penulangan" + bagian laporan/PDF): balok = elevasi sengkang per zona Vu(x) + potongan lapangan & tumpuan; pelat = potongan memanjang + melintang lajur 1 m (tulangan bagi). Spasi sengkang & tulangan pelat kelipatan 25 mm; tulangan atas dipotong ≈ 0,3 ln (indikatif, panjang penyaluran belum dicek). Catatan: ujung eksterior solver dipilih sendi/jepit manual (tanpa pegas kolom); tulangan
        tunggal; pembersihan: ID lama `continuous-beam` kini khusus balok (URL pelat lama → `/one-way-slab`)
  - [x] Kelompok **Struktur Bawah lengkap** (4/4) — 2026-10-14: `footing-design` (denah tekanan sudut + kern, rasio D/C,
        laporan stabilitas + lentur 2 arah + geser 1 arah + pons), `pile-cap` (2–6 tiang, denah reaksi, mode beban kolom /
        kapasitas tiang, lentur, geser, pons kolom & tiang), `retaining-stone` & `retaining-concrete` (penampang bersama
        di `src/tools/_retaining/`: geometri, tekanan dasar, stabilitas; beton + tumpu terfaktor, stem/toe/heel, susut,
        BOQ, skema tulangan). 4 tool: 20/33 aktif
  - [ ] Kelompok **Geoteknik lengkap** (7/7) — 2026-10-14: [x] `bearing-capacity` (potongan fondasi + baji, batang q izin 3
        metode, komposisi suku q_u, laporan faktor + rincian; golden identik 21 kasus), [x] `settlement` (potongan + lapisan, batang Se/Sc/total, kurva waktu–penurunan, laporan
        Steinbrenner + e–log p + laju; golden identik 24 kasus). [x] `pile-capacity` (editor lapisan tanah, profil + tiang, batang Qs/Qp/Qu/Q izin & Decourt, fs per lapis, laporan per segmen;
        golden identik 17 kasus), [x] `cpt-bearing` (data sondir tempel via `_cpt/data.tsx` bersama, profil qc + zona
        pengaruh, batang q izin, laporan Meyerhof/Skempton; golden identik 14 kasus), [x] `cpt-pile` (data z–qc–fs tempel, profil qc + jendela Schmertmann, fs terpakai, batang kapasitas;
        golden identik 11 kasus), [x] `lateral-broms` (tiang + beban + diagram tekanan batas, batang pendek/panjang,
        laporan 4 kombinasi tanah×kepala; golden identik 11 kasus), [x] `py-analysis` (bentuk terdefleksi, profil y/M/p,
        kurva H–y₀, laporan parameter + tabel profil; golden identik 8 kasus). 27/33 tool aktif
  - [x] Kelompok **Pembebanan lengkap** (1/1; `load-combo` tetap tersembunyi) — 2026-10-14: `wind-load` (elevasi gedung +
        profil windward/leeward dengan bidik qz per elevasi, diagram tekanan dinding ±GCpi & geser kumulatif dari atap,
        laporan qh/Cp/tekanan desain/geser dasar + beban minimum Ps. 27.1.5; golden identik 13 kasus). Faktor Kd/Kzt/Ke/G
        = 0 kini ditolak validasi (build lama diam-diam memakai nilai bawaan). 28/33 tool aktif
  - [x] Kelompok **Hidraulika & Hidrologi lengkap** (3/3) — 2026-10-14. Bersama: `src/tools/_hydraulics/` (`XYChart` grafik XY
        dengan sumbu log & bidik hover, `chartFigure` padanannya untuk laporan). `rational-method` (skema DAS + lintasan,
        kurva IDF Mononobe + titik tc, batang Q per tutupan lahan, laporan Kirpich/Mononobe/Q + tabel pembanding; golden
        identik 7 kasus), `open-channel` (penampang + muka air + yc, kurva debit Q(y), energi spesifik E(y), laporan
        geometri per bentuk + Manning + yc/Fr; Q > kapasitas gorong-gorong → pesan mesin; golden identik 15 kasus),
        `pipe-flow` (profil EGL/HGL, kurva sistem Darcy/HW terhadap Q, diagram Moody ε/D vs pipa licin, laporan Re, f
        Swamee–Jain/64/Re, hf/hm, pembanding HW; golden identik 9 kasus). C kustom > 1, n/ν/C kustom 0 kini ditolak
        validasi (build lama diam-diam memakai bawaan). 31/33 tool aktif
  - [x] Kelompok **Analisis Struktur lengkap** (2/2) — 2026-10-14. Bersama: `src/tools/_frame/` (geometri rangka bidang
        `geom.ts` satu sumber untuk SVG & laporan: diagram M di sisi serat tarik / V / N tegak lurus batang, bentuk
        terdeformasi Hermite; `FrameSvg` + panel Diagram dengan bidik hover per titik batang; `figure.ts`; bagian laporan
        bersama `report.ts`; input penampang baja/beton `section.tsx`). `portal-frame` (penampang baja/beton per batang,
        model + beban, M/V/N/deformasi/reaksi, laporan penampang + E beton, metode kekakuan + FEF, kesetimbangan ΣV/ΣH,
        gaya ujung per batang, σ elastis informatif, perpindahan simpul + cek H/500…H/250 & L/360…L/240; golden identik 7
        kasus), `gable-frame` (+ geometri atap f/L_r, penguraian beban atap ke w⊥/w∥, turun puncak; golden identik 6 kasus).
        Posisi beban terpusat di luar 0…L & α > 75° kini ditolak validasi (build lama memotong + peringatan); f'c / b = 0
        ditolak (build lama memakai f'c 1). **33/33 tool aktif**
- [ ] **[Claude]** Verifikasi tiap tool di browser (angka = golden, kanvas, PDF, simpan/buka), konsol bersih
- [ ] **[Claude]** Pembersihan build lama: `assets/`, `core/`, `modules/`, `sw.js`, `scripts/cf-build.sh`,
      `.htaccess`, Firebase (`functions/`, `firebase/`, `firebase.json`, `.firebaserc`); README/ARCHITECTURE.
      Pindahkan `web/index.html` & `web/public/` ke akar, hapus `root: 'web'` + alias `/src/` di `vite.config.ts`,
      favicon lama `favicon/` → `public/`
- [x] **[Anda]** Cloudflare Pages: build command → `npm ci && npm run build`, output `dist`, env `NODE_VERSION` — 2026-10-17;
      build baru live di `https://dtswebapp.pages.dev` (database dev) sejak commit 93439d9

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
