# Migrasi Domain + Hosting — cPanel → Domain Sendiri + Cloudflare Pages

Runbook untuk pindah dari `tools.dtsengineering.co.id` (subdomain, hosting cPanel
manual) ke domain sendiri di **Cloudflare Pages** (deploy otomatis dari `git push`).

**Kenapa sekarang:** data Search Console (dicek 2026-09-17) menunjukkan domain
lama baru punya 13 impression / 0 klik dalam 6 bulan, dan cuma halaman depan yang
pernah tampil di Google (36 halaman tool belum pernah ter-index sama sekali) —
jadi nyaris tidak ada SEO equity yang perlu "dilindungi" dengan redirect map
rumit. Ini momen termurah untuk pindah.

Langkah 1–4 di bawah **harus dilakukan manual oleh Anda** (buat akun/beli domain
tidak bisa dilakukan asisten AI). Langkah 5 ("Kode yang perlu diubah") saya
kerjakan begitu domain final sudah aktif.

---

## 1. Pilih & daftarkan nama domain

**Soal `edfs.web.id` yang sudah dipikirkan:** ini pilihan yang valid — pendek,
sesuai brand, dan Anda sudah terbiasa proses registrasinya. Satu hal teknis untuk
dipertimbangkan (bukan pembatal, sekadar info): domain `.id`/`.web.id` diperlakukan
Google sebagai **country-targeted ke Indonesia** secara otomatis (ccTLD). Karena
target utama memang tetap user Indonesia (versi English yang direncanakan pun
terutama untuk kebutuhan **laporan** user Indonesia, bukan akuisisi audiens
internasional) — ini **tidak masalah** untuk kasus Anda. Baru jadi pertimbangan
serius kalau suatu saat target audiens internasional jadi prioritas utama (bukan
bonus) — silakan pakai `edfs.web.id` dengan tenang untuk rencana saat ini.

Alternatif nama (kalau mau bandingkan dulu sebelum memutuskan), semua dicek
ketersediaan saat registrasi nanti — bukan garansi tersedia:
- `edfs.web.id` — pilihan awal Anda, brand-first, singkat.
- `edfscivil.web.id` / `edfstools.web.id` — brand + kata kunci produk, sedikit lebih jelas untuk orang yang belum kenal brand.
- `civiltools.id` — murni deskriptif, tapi domain generik populer begini kemungkinan lebih mahal/sudah diambil, dan `.id` (bukan `.web.id`) butuh dokumen usaha lebih lengkap.

Registrar lokal ber-akreditasi PANDI untuk `.web.id`: Niagahoster, Rumahweb,
Domainesia, Dewaweb — siapkan KTP (atau NPWP badan usaha PT. DTS Engineering
kalau mau atas nama perusahaan, lebih pas untuk brand ini).

## 2. Buat akun Cloudflare + hubungkan repo

1. Daftar di [dash.cloudflare.com](https://dash.cloudflare.com) (gratis).
2. **Workers & Pages > Create > Pages > Connect to Git** → pilih repo `iwalislamuddin/dtswebapp` (perlu otorisasi GitHub App Cloudflare ke akun/organisasi GitHub Anda).
3. Konfigurasi build:
   - **Build command:** `bash scripts/cf-build.sh`
   - **Build output directory:** `dist`
   - **Root directory:** biarkan default (root repo)
4. Deploy pertama akan jalan otomatis — cek hasilnya di URL sementara `*.pages.dev` yang diberikan Cloudflare (situs sudah hidup di sini sebelum domain custom dipasang, bagus untuk uji coba dulu).

Skrip `scripts/cf-build.sh` (sudah saya siapkan di repo) menyalin **hanya berkas
publik** yang sama seperti daftar di [docs/DEPLOY.md](DEPLOY.md) — `docs/`,
`.claude/`, `firebase/`, `README.md`, `ARCHITECTURE.md` TIDAK ikut ter-publish.
File `_redirects` (SPA fallback, pengganti `.htaccess` rewrite) dan `_headers`
(cache-control, pengganti blok `mod_headers` di `.htaccess`) juga sudah dibuat
di root repo — otomatis ikut tersalin ke `dist/` oleh skrip.

## 3. Pasang domain custom di Cloudflare Pages

1. Di project Pages yang baru dibuat → **Custom domains > Set up a domain** → masukkan domain dari langkah 1.
2. Cloudflare akan minta DNS domain itu dikelola oleh Cloudflare (ubah nameserver di registrar ke nameserver Cloudflare yang ditampilkan), ATAU kalau domain didaftarkan lewat registrar lain dan tidak mau pindah nameserver, tambahkan CNAME manual sesuai instruksi yang muncul.
3. HTTPS otomatis terpasang oleh Cloudflare (Universal SSL) — biasanya aktif dalam beberapa menit sampai ~24 jam setelah DNS propagasi.

## 4. Setelah domain baru hidup — jangan lupa

- **Google Search Console**: tambah **Property baru** untuk domain baru (properti lama untuk `tools.dtsengineering.co.id` biarkan saja, tidak perlu dihapus — datanya tetap berguna sebagai riwayat). Submit sitemap baru.
- **Google Analytics 4**: property yang sama boleh dipakai lagi — cukup pastikan tidak ada domain-lock yang menolak hit dari domain baru (default GA4 tidak mengunci per-domain, jadi biasanya otomatis jalan begitu `index.html` yang baru di-deploy).
- **Firebase Auth** (fitur akun yang sedang dibangun, Fase A): tambahkan domain baru ke **Authentication > Settings > Authorized domains** — WAJIB sebelum login/Google sign-in bisa jalan di domain baru.
- Domain lama `tools.dtsengineering.co.id` boleh tetap hidup sebagai **redirect 301** ke domain baru (bukan dimatikan mendadak) — supaya link yang sudah beredar di LinkedIn/bookmark PWA tidak mati total. Bisa diatur lewat `.htaccess` di cPanel lama: `RewriteRule ^(.*)$ https://DOMAIN-BARU/$1 [R=301,L]`.

## 5. Kode yang perlu diubah (saya kerjakan setelah domain final dikonfirmasi)

Checklist internal — **jangan dikerjakan sebelum domain benar-benar aktif**,
supaya tidak bolak-balik ubah dua kali:

- [ ] `assets/shell.js` — konstanta `SITE` (dipakai canonical URL & Open Graph)
- [ ] `index.html` — semua `<meta property="og:...">`, `<link rel="canonical">`, JSON-LD `url`
- [ ] `sitemap.xml` — 37 `<loc>` ganti domain
- [ ] `manifest.json` — `start_url`/`scope` bila memakai absolute URL
- [ ] `robots.txt` — baris `Sitemap:`
- [ ] `docs/DEPLOY.md` — update jadi runbook Cloudflare (bukan lagi cPanel manual) atau simpan cPanel sbg fallback opsional
- [ ] Bump versi SW (`sw.js` `CACHE`) sekali lagi setelah semua URL berubah

## 6. Di luar scope migrasi ini — versi English

Rencana versi English (untuk kebutuhan laporan PDF berbahasa Inggris bagi user
Indonesia, dengan user internasional sebagai bonus) **belum digarap di sini** —
ini keputusan arsitektur terpisah (mis. toggle bahasa di `core/report.js` untuk
output laporan vs. UI multibahasa penuh) yang lebih baik direncanakan sendiri
setelah migrasi domain & fitur premium (Fase A–D monetisasi) selesai, supaya
tidak menumpuk terlalu banyak perubahan sekaligus.
