# Penyelarasan dengan Platform Edifisia

Status: **rencana aktif**, diputuskan 2026-10-06. Progres: [TODO.md](TODO.md) & [HANDOFF.md](HANDOFF.md).
Dokumen ini menggantikan rencana monetisasi versi Firebase (Fase A–C; dokumennya dihapus 2026-10-07, tersedia di
riwayat git) dan pilihan domain lama `edfs.web.id`.

## 1. Keputusan (2026-10-06)

1. **Firebase dibuang.** Login, Simpan Pekerjaan, dan pembayaran Civil Tools pindah
   ke platform Edifisia yang sudah dipakai EDFS Matrix.
2. **Supabase** (project yang sama dengan Matrix) jadi satu-satunya sumber akun dan
   hak akses.
   Dua project: **`edifisia-dev`** (Sydney, development; dulu bernama `edfs-matrix`)
   dan **`edifisia-prod`** (Singapore, production).
3. **Domain produksi: `tools.edifisia.com`** di Cloudflare Pages. Domain lama
   `tools.dtsengineering.co.id` menjadi redirect 301.
4. Dikerjakan **bersamaan dengan rombak mayor UI** (Fase 1 masterplan Edifisia),
   supaya login dan gating tidak dibangun dua kali.
5. **Stack UI: Vite + React + TypeScript** (framework dikonfirmasi 2026-10-07) — prinsip *zero build*
   ditinggalkan. Acuan stack Matrix: `vite-plugin-pwa`, `@supabase/supabase-js` dari npm.
6. **Semua tool tetap gratis** untuk siapa pun (tab Input: input, diagram, ringkasan hasil). Premium untuk **Save**,
   **tab Detail** (laporan perhitungan langkah demi langkah) dan **Download Report PDF** — Detail ikut dikunci
   (keputusan pemilik 2026-10-08); ekspor .txt dihapus. Tidak ada modul premium.
7. **Batas 50 pekerjaan tersimpan per user.**
8. **Login Google diaktifkan** di Supabase (ikut berlaku untuk Matrix, karena satu
   project Supabase = satu konfigurasi provider untuk semua aplikasi).

Keputusan platform yang ikut berlaku (repo `D:\edifisia-platform`, dan
`docs/rencana/akses-premium.md` di repo Matrix):

- **Satu Edifisia Premium membuka semua aplikasi** (Matrix, Civil Tools, Radix, Nexus, berikutnya).
  Tidak dijual per aplikasi, tidak ada bundle. Library tidak termasuk.
- **Sekali bayar bermasa aktif**, bukan langganan. Perpanjangan:
  `expires_at baru = max(sekarang, expires_at lama) + durasi`.
- **Trial Premium 7 hari** otomatis saat registrasi (trigger platform).
- Tiga status: **Guest**, **Free User** (login tanpa Premium aktif), **Premium**
  (termasuk trial).
- **Registrasi, reset password, dan pembelian hanya di `edifisia.com`.** Login boleh
  dari dialog di tiap aplikasi.

## 1a. Lini produk Edifisia (masterplan diperbarui pemilik, 2026-10-07)

Pemilik sudah memperbarui masterplan Edifisia dengan dua produk baru. Ketiganya aplikasi **terpisah** di platform
yang sama (akun Supabase, design system, aturan Premium di atas):

| Produk | Isi | Acuan pasar |
|---|---|---|
| **EDFS Matrix** | (sudah ada) | — |
| **EDFS Civil Tools** | kalkulator cepat per elemen (repo ini) | — |
| **EDFS Radix** | analisis & desain **pondasi** berbasis proyek | GS AFES, STAAD Foundation |
| **EDFS Nexus** | perhitungan **sambungan baja** berbasis proyek: base plate, beam–column, beam splice, column splice, rafter, bracing, end plate, angle connection, dll. | Limcon, IDEA StatiCa |

**Kenapa terpisah (bukan modul Civil Tools):** cara kerja berbeda (proyek berisi banyak sambungan/pondasi, banyak
kombinasi beban, impor gaya dari software analisis, model 3D) vs kalkulator satu elemen; jumlah jenis sambungan akan
mendominasi navigasi, SEO dan citra Civil Tools; jadwal Civil Tools tidak tersandera proyek besar.

**Dampak ke Civil Tools**
- **`base-plate` pindah ke EDFS Nexus.** Port `src/calc/base-plate.ts` (sudah selesai) dibawa sebagai bahan Nexus;
  di Civil Tools dikeluarkan dari katalog (redirect/tautan ke Nexus saat Nexus rilis).
- **Baut & las sederhana tetap di Civil Tools** (`bolt-connection`, `weld-connection`: konsentris, cek kapasitas
  langsung) — sebagai kalkulator cepat & pintu masuk ke Nexus. Status berubah dari *hold* menjadi **perlu di-port**.
- Kode hitung baja yang dipakai bersama (library profil JIS, mutu baut/las, fungsi SNI 1729) sebaiknya kelak
  menjadi paket bersama Civil Tools ↔ Nexus agar perbaikan (mis. profil siku) berlaku di keduanya.

**Keputusan lanjutan (pemilik, 2026-10-07)**
- **`anchor-bolt-group` tetap di Civil Tools.**
- **Batas Civil Tools ↔ Radix:** tool pondasi Civil Tools (`shallow-foundation`, `deep-foundation`, dll.) hanya
  **pondasi tunggal — satu titik tumpuan**. **Radix** untuk **satu bangunan/struktur**: menghitung & mendesain semua
  pondasi struktur sekaligus (banyak titik tumpuan, reaksi dari analisis struktur).
- **Baut & las sederhana masuk kategori Baja**; kategori "Sambungan" di Civil Tools dihapus (`anchor-bolt-group`
  ikut kelompok yang sesuai saat susunan kategori final ditetapkan di shell React).
- **Radix & Nexus ikut dibuka oleh satu Edifisia Premium** (sesuai aturan platform di §1). **Gating fitur di
  Radix/Nexus belum ditentukan** pemilik.

## 2. Arsitektur sasaran

Civil Tools tetap aplikasi statis tanpa backend sendiri. Browser memakai `supabase-js`
dengan **anon key** (publik by design); keamanan dijaga **RLS** di database.

| Kebutuhan | Dulu (Firebase) | Sasaran (platform) |
|---|---|---|
| Akun | Firebase Auth (email + Google) | Supabase Auth, akun Edifisia yang sama dengan Matrix |
| Status Premium | `users/{uid}.premium` di Firestore | `platform.premium_status()` → `active`, `expires_at`, `is_trial` |
| Simpan Pekerjaan | Firestore `users/{uid}/savedWorks` | Tabel `tools.saved_works` (skema `tools`, milik repo ini) |
| Pembelian | Cloud Functions `createSnapTransaction` + `midtransWebhook` | Halaman beli `edifisia.com` + webhook platform (Fase 2 masterplan) |
| Harga | Rp 14rb / 39rb / 129rb (khusus Civil Tools) | Harga Edifisia Premium, **belum diputuskan** di platform |
| Kedaluwarsa | Cloud Function `expirePremium` harian | Tidak perlu: status dihitung dari `expires_at` saat dibaca |
| Sesi lintas aplikasi | — | Cookie bersama `.edifisia.com` (belum ada, lihat §4) |

### Hak akses di Civil Tools

| Kemampuan | Guest | Free User | Premium (termasuk trial) |
|---|---|---|---|
| Semua kalkulasi, kanvas, hasil di layar | ✔ | ✔ | ✔ |
| Pratinjau laporan (gambar resolusi rendah) | ✔ | ✔ | ✔ |
| Unduh PDF / .txt | ✘ | ✘ | ✔ |
| Simpan pekerjaan baru / timpa | ✘ | ✘ | ✔ |
| Buka & hapus pekerjaan milik sendiri | — | ✔ | ✔ |

Hak Free User atas data miliknya sama dengan aturan di Matrix: pekerjaan tidak
disandera, tetap bisa dibuka dan dihapus.

Tidak ada modul premium (keputusan 2026-10-06): semua tool gratis dihitung,
demi SEO dan konversi.

### Skema `tools` (migrasi di repo ini)

Terimplementasi (2026-10-06): [`supabase/migrations/20261006000000_tools_saved_works.sql`](../supabase/migrations/20261006000000_tools_saved_works.sql).

`tools.saved_works`: `id`, `user_id` (default `auth.uid()`, cascade saat akun dihapus), `tool_id`
(id katalog `src/tools.ts`), `name` (sudah di-trim, 1–120), `state_json` (objek input tool, ≤ 256 KB),
`created_at`, `updated_at` (trigger).

- **Save ditegakkan di database** (RLS memanggil `platform.has_premium()`), jadi tidak
  bisa diakali dari browser. Baca & hapus: pemilik. Simpan baru & timpa: pemilik + Premium.
- Hak per kolom: klien hanya mengisi `tool_id, name, state_json` (insert) dan `name, state_json`
  (update); `id`, `user_id`, waktu diisi database. `anon` tidak punya akses.
- **Maksimal 50 pekerjaan per user**, ditegakkan trigger `before insert` (kunci advisory per user
  agar simpan bersamaan tidak lolos). Galat membawa `hint = 'saved_works_limit'` — UI mendeteksi
  lewat hint itu, bukan teks pesan. Menimpa tetap boleh saat penuh.
- Skema `tools` perlu ditambahkan ke *Exposed schemas* Data API Supabase (Matrix
  tidak perlu karena backend-nya memakai koneksi langsung).
- Alur: development → test → production. **Tidak memakai `supabase db push`**: riwayat CLI
  (`supabase_migrations.schema_migrations`) milik repo platform, dan CLI menolak push bila riwayat
  remote berisi versi yang tak ada di folder lokal. Repo ini memakai `scripts/db_migrate.py` dengan
  riwayat sendiri di `tools.schema_migrations`. Test: `tests/run.py` (selalu rollback).

```bash
pip install psycopg2-binary
DATABASE_URL=postgresql://... python tests/run.py                  # migrasi + test, rollback (sebelum diterapkan)
DATABASE_URL=postgresql://... python scripts/db_migrate.py --dry-run
DATABASE_URL=postgresql://... python scripts/db_migrate.py
DATABASE_URL=postgresql://... python tests/run.py --applied        # test saja, rollback
```

**Konfigurasi klien** (publik, aman di repo; dipakai `supabase-js` di Tahap 4). `service_role`/secret key
TIDAK PERNAH masuk repo.

| | Project URL | Publishable key |
|---|---|---|
| dev (`edifisia-dev`, Sydney) | `https://djfkyyibydwyplgzexwz.supabase.co` | `sb_publishable_lEIKRrtGZAIB3-1eeTNYYg_I5Ey5JZV` |
| prod (`edifisia-prod`, Singapore) | `https://tqxkqxtijubcracpmlav.supabase.co` | `sb_publishable_vZKpECd2_uAwnmtv9ixXZw_Q9rqmGt6` |

`DATABASE_URL` = string koneksi *Session pooler* (dashboard Supabase > Connect), password
di-percent-encode. Set di terminal sendiri, jangan ke repo/chat.

### Catatan jujur soal gating PDF

Masterplan menulis gating Download Report "di sisi server". Di Civil Tools laporan PDF **dibuat di browser**, jadi
gating unduhan tetap di browser: cukup untuk pengguna biasa, tetapi bisa diakali oleh orang yang paham DevTools.

- **A (dipakai):** gating di browser, satu titik (`src/app/premium.ts`) untuk tab Detail & PDF. Nilai premium yang sungguh terlindungi adalah
  Save (RLS).
- **B (nanti, bila perlu):** pindahkan pembuatan PDF ke edge function yang mengecek `has_premium` lebih dulu.

## 3. Pelajaran dari Fase A–C (Firebase) yang dibawa

Kode Fase A–C tidak dipakai ulang (UI ditulis ulang di React); yang dibawa hanya polanya:

- **Satu titik gating** unduhan laporan, dengan **pratinjau** resolusi rendah untuk Guest/Free User.
- **Pengaman deploy setengah jadi**: paywall hanya menyala bila konfigurasi akun lengkap — kebalikannya pelajaran
  `MIDTRANS_CONFIG` yang membuat paywall Firebase menyala otomatis (§7).
- Simpan Pekerjaan menyimpan **objek input tool** (`state_json`), bukan lagi snapshot `sessionStorage` per modul.

## 4. Yang perlu dibangun

1. **Lapisan akun** (React) — **selesai 2026-10-15** (`src/app/auth/`): `@supabase/ssr`, status dari
   `platform.premium_status()`. Karena Site URL & Redirect URLs Supabase menunjuk `edifisia.com`, **login di
   `*.edifisia.com` = redirect** ke `<pusat akun>/masuk?next=<halaman>`; sesi kembali lewat cookie `.edifisia.com`.
   Di localhost / `*.pages.dev` (cookie bersama tak terbaca) dialog lokal: email + sandi dan Google
   (`redirectTo` = halaman ini). "Daftar" & "Lupa password" selalu ke pusat akun. Database dipilih **menurut alamat**
   (`src/app/auth/config.ts`, satu build untuk semua): `tools.edifisia.com` → `edifisia-prod` + `edifisia.com`;
   `*.pages.dev` (URL development Cloudflare) & localhost → `edifisia-dev` + `staging.edifisia.com`. Tidak ada URL
   staging khusus Civil Tools (keputusan pemilik 2026-10-15).
2. **Simpan Pekerjaan** ke `tools.saved_works`; Free User hanya buka & hapus; galat batas 50 dikenali lewat
   `hint = 'saved_works_limit'`.
3. **Status & beli**: tampilan mengikuti Matrix ("Trial s/d …", "Premium s/d …", peringatan ≤ 7 hari,
   "Premium berakhir … · Perpanjang"); tombol beli ke `edifisia.com` disembunyikan selama `PREMIUM_URL` belum ada.
4. **Sesi lintas subdomain** — terpasang 2026-10-15: `createBrowserClient` dengan cookie `Domain=.edifisia.com`,
   konfigurasi sama dengan Matrix & edifisia.com (`docs/sso.md` repo platform). Keluar = keluar dari semua aplikasi.
5. **Hapus Firebase & build lama**: `functions/`, `firebase/`, `firebase.json`, `.firebaserc`, lalu `assets/`,
   `core/`, `modules/`, `sw.js` setelah semua tool berjalan di build baru.
6. **Domain & hosting**: Cloudflare Pages + `tools.edifisia.com` ([DOMAIN_MIGRATION.md](DOMAIN_MIGRATION.md)).
7. **Fondasi React + `src/calc`** (diubah 2026-10-07): perhitungan dikeluarkan ke `src/calc/` dengan *golden test*
   terhadap `compute()` build lama — **34/35 tool selesai** (`load-combo` tidak di-port); shell
   React sesuai [UI.md](UI.md); tool di-*lazy load* per rute, Three.js dari npm, PWA lewat `vite-plugin-pwa`.
   **Peluang SEO:** pre-render HTML statis per rute dengan title/description/canonical dari `src/tools.ts` —
   halaman tool belum pernah terindeks Google karena build lama hanya satu `index.html` yang diisi JavaScript.
8. **Tool ditulis ulang langsung di UI baru** di atas `src/calc` (tanpa lapisan jembatan ke modul lama).

## 5. Urutan kerja

Daftar centang rinci per tahap: [TODO.md](TODO.md).

| # | Langkah | Bergantung pada |
|---|---|---|
| 1 | Cloudflare Pages (tanpa custom domain), Google OAuth di Supabase | — (paralel) |
| 2 | Skema `tools` + RLS + test (rollback) di Supabase development | Platform (sudah live) |
| 3 | Fondasi React + `src/calc` (golden test vs build lama) + shell UI baru | — |
| 4 | Akun & Save versi Supabase di shell React | 2, 3 |
| 5 | Tool di UI baru, build lama + Firebase dicabut | 3, 4 |
| 6 | Production: skema `tools`, domain `tools.edifisia.com`, rilis **v0.8.0** | 1, 5 |
| 7 | Redirect 301 dari `tools.dtsengineering.co.id`, pensiunkan Firebase & cPanel | 6 |
| 8 | Sesi lintas subdomain bersama Matrix | Halaman akun `edifisia.com` |

Vite dikerjakan **sebelum** Supabase supaya `supabase-js` langsung dipasang dari npm,
tidak dua kali (CDN dulu lalu npm). Rencana awal (bungkus tool lama di Vite, baru rombak UI)
diganti 2026-10-07 karena berarti tiap tool dikerjakan dua kali; pengaman regresi hitungan kini
*golden test* `src/calc` terhadap `compute()` build lama, sebelum UI mana pun ditulis.

Halaman beli dan webhook pembayaran adalah pekerjaan **platform** (Fase 2
masterplan), bukan repo ini. Sampai ada, tombol beli Civil Tools disembunyikan
dan Premium hanya didapat dari trial atau grant manual (`platform.grant_premium`),
sama seperti Matrix sekarang (`PREMIUM_URL = null`).

## 6. Pembersihan Firebase (manual oleh pemilik project, setelah langkah 5)

- Project `edfs-civil-tools-e3a59`: hapus Cloud Functions, matikan billing Blaze,
  lalu hapus project. Tidak ada data pengguna nyata, hanya akun uji sandbox
  (`iwal@`, `finance@`).
- Midtrans Merchant `M099838`: **tetap dipakai**, dipindah ke webhook platform.
  Payment Notification URL lama (Cloud Function) dikosongkan setelah webhook
  platform aktif.
- Secret `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` di Secret Manager Firebase
  ikut terhapus bersama project.

## 7. Sementara itu: jangan deploy build repo saat ini ke produksi

Build di `main` memuat paywall Firebase yang **menyala otomatis** karena
`MIDTRANS_CONFIG` sudah terisi. Menaikkannya ke produksi berarti mengunci unduhan
pengguna di sistem yang akan dibuang. Bila tool baru perlu naik lebih dulu,
kosongkan `MIDTRANS_CONFIG` di `index.html` (paywall mati, semua unduhan bebas).

## 8. Belum diputuskan

- Harga dan durasi paket Edifisia Premium (platform).
- Masa tenggang setelah expired (platform, cukup di `premium_status`).
- ~~Framework UI~~ → **React + TypeScript** seperti Matrix (diputuskan 2026-10-07).
- Gating fitur Premium di EDFS Radix & EDFS Nexus (keduanya ikut satu Edifisia Premium) — lihat §1a.
