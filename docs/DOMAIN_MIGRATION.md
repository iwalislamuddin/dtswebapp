# Migrasi Domain + Hosting — cPanel → `tools.edifisia.com` (Cloudflare Pages)

Runbook untuk pindah dari `tools.dtsengineering.co.id` (subdomain, hosting cPanel
manual) ke **`tools.edifisia.com`** di **Cloudflare Pages** (deploy otomatis dari
`git push`).

**Domain final diputuskan 2026-10-06: `tools.edifisia.com`**, sebagai bagian dari
penyelarasan dengan platform Edifisia ([PLATFORM.md](PLATFORM.md)). Pilihan lama
`edfs.web.id` dibatalkan. Alasan subdomain `edifisia.com`: otoritas SEO terkumpul
di satu brand, satu DNS/SSL, dan sesi login bisa dibagi lewat cookie
`.edifisia.com` dengan EDFS Matrix (`matrix.edifisia.com`).

**Kenapa pindah sekarang:** data Search Console (dicek 2026-09-17) menunjukkan
domain lama baru punya 13 impression / 0 klik dalam 6 bulan, dan cuma halaman
depan yang pernah tampil di Google (halaman tool belum pernah ter-index) —
nyaris tidak ada SEO equity yang perlu "dilindungi" dengan redirect map rumit.

Langkah 1–4 di bawah **dilakukan manual oleh pemilik akun**. Langkah 5 dikerjakan
di repo.

---

## 1. Domain — ✅ sudah ada

`edifisia.com` sudah dimiliki dan DNS-nya di Cloudflare (dipakai
`matrix.edifisia.com`). Tidak perlu registrasi baru; cukup subdomain `tools`.

## 2. Buat project Cloudflare Pages + hubungkan repo

Akun Cloudflare sudah ada (dipakai Matrix).

1. **Workers & Pages > Create > Pages > Connect to Git** → repo `iwalislamuddin/dtswebapp`.
2. Konfigurasi build:
   - **Build command:** `bash scripts/cf-build.sh`
   - **Build output directory:** `dist`
   - **Root directory:** default (root repo)
3. Deploy pertama jalan otomatis — uji dulu di URL sementara `*.pages.dev`.

`scripts/cf-build.sh` menyalin **hanya berkas publik** (whitelist sama seperti
[DEPLOY.md](DEPLOY.md)) — `docs/`, `.claude/`, `firebase/`, `functions/`,
`supabase/`, `README.md`, `ARCHITECTURE.md` TIDAK ikut ter-publish. `_redirects`
(SPA fallback, pengganti `.htaccess`) dan `_headers` (cache-control) ikut tersalin.

> **Pelajaran dari Matrix:** Browser Cache TTL di zona Cloudflare **menimpa**
> `Cache-Control` dari `_headers`. Pastikan setelan zona `edifisia.com`
> (Caching > Configuration > Browser Cache TTL) = *Respect Existing Headers*,
> supaya `sw.js` / `index.html` tetap `no-cache`.

## 3. Pasang domain custom

1. Project Pages → **Custom domains > Set up a domain** → `tools.edifisia.com`.
2. Karena zona `edifisia.com` sudah di Cloudflare, record CNAME dibuat otomatis.
3. HTTPS (Universal SSL) aktif otomatis dalam beberapa menit.

## 4. Setelah domain baru hidup — jangan lupa

- **Google Search Console**: tambah property untuk `tools.edifisia.com` (atau
  Domain property `edifisia.com` yang mencakup semua subdomain), submit sitemap baru.
  Property lama biarkan sebagai riwayat.
- **Google Analytics 4**: property yang sama (`G-2MDVZFKNSE`) tetap dipakai.
- **Supabase Auth** (pengganti Firebase Authorized domains): tambahkan
  `https://tools.edifisia.com` ke **Authentication > URL Configuration > Redirect URLs**
  di project production (dan `http://localhost:*` di development) — wajib sebelum
  login/reset password jalan di domain baru.
- Domain lama `tools.dtsengineering.co.id` tetap hidup sebagai **redirect 301**
  (path dipertahankan), supaya link LinkedIn/bookmark PWA tidak mati. Di cPanel lama,
  `.htaccess`: `RewriteRule ^(.*)$ https://tools.edifisia.com/$1 [R=301,L]`.
  Catatan: PWA yang sudah terpasang dari domain lama tidak ikut pindah origin;
  pengguna perlu memasang ulang dari domain baru.

## 5. Kode yang perlu diubah

Domain dipasang bersamaan dengan rilis build baru (v0.8.0, TODO Tahap 6), jadi perubahan dikerjakan di build baru,
bukan di build lama:

- [ ] Satu konstanta origin `https://tools.edifisia.com` untuk canonical, Open Graph/Twitter, JSON-LD, dan
      pre-render HTML per rute (title/description dari `src/tools.ts`)
- [ ] `sitemap.xml` & `robots.txt` dibangkitkan saat build dari katalog tool aktif
- [ ] Manifest PWA (`vite-plugin-pwa`): `start_url`/`scope` relatif
- [ ] Cloudflare Pages: build command `npm ci && npm run build`, output `dist`
- [ ] `docs/DEPLOY.md` — jadi runbook Cloudflare Pages; cPanel hanya untuk redirect domain lama

Bila build lama sempat dipasang di Pages sebelum v0.8.0, URL-nya ada di `assets/shell.js` (`SITE`), `index.html`
(canonical/OG/JSON-LD), `sitemap.xml`, `robots.txt` — lalu bump `CACHE` di `sw.js`.

## 6. Di luar scope migrasi ini — versi English

Rencana versi English (laporan PDF berbahasa Inggris untuk user Indonesia, user
internasional sebagai bonus) direncanakan terpisah setelah penyelarasan platform
dan rombak UI selesai.
