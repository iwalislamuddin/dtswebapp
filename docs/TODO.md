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
- [ ] **[Anda]** Framework di atas Vite: React + TypeScript seperti Matrix (disarankan) atau vanilla TS —
      cukup diputuskan sebelum Tahap 3

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
- [ ] **[Claude]** `X-Robots-Tag: noindex` untuk host `*.pages.dev` agar URL sementara tidak terindeks

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

- [ ] **[Claude]** Folder `supabase/` + migrasi `tools.saved_works` (RLS: baca/hapus pemilik; tulis pemilik +
      `platform.has_premium()`; trigger `updated_at`; trigger batas **50** per user)
- [ ] **[Claude]** `tests/tools_test.sql` + runner (pola repo platform, transaksi selalu di-rollback)
- [ ] **[Anda]** Jalankan di **development** (Sydney): `supabase.cmd db push --db-url "<session pooler dev>"`
      lalu test. Password DB tetap di tangan Anda — jangan ditempel ke chat
- [ ] **[Anda]** Supabase dev > Settings > Data API > **Exposed schemas**: tambah `tools`
- [ ] **[Anda]** Kirim ke Claude: **Project URL + anon/publishable key** dev dan prod (keduanya publik,
      aman di repo). **Jangan** kirim `service_role` key

## Tahap 3 — Migrasi ke Vite (tanpa mengubah tampilan)

- [ ] **[Claude]** Scaffold Vite (+ framework pilihan Tahap 0) di root repo; `index.html` jadi entry Vite
- [ ] **[Claude]** `core/*` + `assets/shell.js` jadi modul ES; `window.Civil*` dipertahankan sementara sebagai
      jembatan agar 36 `modules/*/module.js` tetap jalan
- [ ] **[Claude]** Tool di-*lazy load* per rute (`import()`, satu chunk per tool); Three.js dari npm
- [ ] **[Claude]** PWA lewat `vite-plugin-pwa` (pengganti `sw.js` manual + bump `CACHE`); prompt update seperti Matrix
- [ ] **[Claude]** Pre-render HTML per rute (title/description/canonical per tool) untuk SEO
- [ ] **[Claude]** Uji regresi: angka hasil tiap tool sama dengan build lama (kasus default), PDF tetap valid
- [ ] **[Claude]** Lint + test di CI (GitHub Actions), pola Matrix
- [ ] **[Anda]** Cloudflare Pages: ganti build command → `npm ci && npm run build`, output `dist`,
      env `NODE_VERSION` sesuai Matrix
- [ ] **[Claude]** Hapus `scripts/cf-build.sh`, `.htaccess`; perbarui README/ARCHITECTURE (bukan lagi zero build)

## Tahap 4 — Akun & Save versi Supabase

- [ ] **[Claude]** Lapisan akun: `@supabase/supabase-js`, email + password + **Google**, status dari
      `platform.premium_status()`; "Daftar"/"Lupa password" → `edifisia.com` (sementara: dialog lokal, seperti Matrix)
- [ ] **[Claude]** Simpan Pekerjaan → `tools.saved_works` (snapshot stash dipertahankan); Free User buka & hapus
      saja; pesan jelas saat batas 50 tercapai
- [ ] **[Claude]** Status "Trial/Premium s/d …", peringatan ≤ 7 hari; tombol beli disembunyikan selama
      `PREMIUM_URL` belum ada
- [ ] **[Claude]** Gating unduh PDF/.txt di satu titik (`report`) mengacu status Supabase; pratinjau tetap
- [ ] **[Claude]** Hapus `functions/`, `firebase/`, `firebase.json`, `.firebaserc`, `core/billing.js` (Snap),
      config Firebase/Midtrans di `index.html`
- [ ] **[Claude]** Uji empat akun: Guest, Premium/trial, Free User (trial habis), Premium expired — email & Google
- [ ] **[Anda]** Siapkan akun uji di dev; grant/expire manual lewat SQL `platform.grant_premium` (README platform)

## Tahap 5 — Rombak UI

- [ ] **[Bersama]** Arah desain (mockup 1–2 layar kunci) disepakati sebelum coding
- [ ] **[Claude]** Implementasi shell baru + penyesuaian 36 tool
- [ ] **[Claude]** Verifikasi tiap tool di browser (hitung, kanvas, PDF, simpan/buka), konsol bersih

## Tahap 6 — Rilis v0.8.0 di `tools.edifisia.com`

- [ ] **[Claude]** URL kanonik → `https://tools.edifisia.com` (DOMAIN_MIGRATION.md §5), sitemap, robots,
      catatan rilis v0.8.0 di modal Tentang
- [ ] **[Anda]** Supabase **production**: `db push` migrasi `tools` + test, Exposed schemas `tools`
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
