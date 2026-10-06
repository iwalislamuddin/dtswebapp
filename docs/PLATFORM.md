# Penyelarasan dengan Platform Edifisia

Status: **rencana aktif**, diputuskan 2026-10-06. Belum ada kode yang diubah.
Dokumen ini menggantikan arah di [MONETIZATION.md](MONETIZATION.md) (Firebase) dan
pilihan domain di [DOMAIN_MIGRATION.md](DOMAIN_MIGRATION.md) (`edfs.web.id`).

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
5. **Stack UI: Vite** — prinsip *zero build* ditinggalkan. Acuan stack Matrix:
   Vite + React + TypeScript + `vite-plugin-pwa` + `@supabase/supabase-js` dari npm
   (framework final dikonfirmasi di awal tahap rombak UI).
6. **Semua 36 tool tetap gratis** untuk siapa pun. Premium hanya untuk **Save** dan
   **Download Report** (PDF/.txt). Tidak ada modul premium.
7. **Batas 50 pekerjaan tersimpan per user.**
8. **Login Google diaktifkan** di Supabase (ikut berlaku untuk Matrix, karena satu
   project Supabase = satu konfigurasi provider untuk semua aplikasi).

Keputusan platform yang ikut berlaku (repo `D:\edifisia-platform`, dan
`docs/rencana/akses-premium.md` di repo Matrix):

- **Satu Edifisia Premium membuka semua aplikasi** (Matrix, Civil Tools, berikutnya).
  Tidak dijual per aplikasi, tidak ada bundle. Library tidak termasuk.
- **Sekali bayar bermasa aktif**, bukan langganan. Perpanjangan:
  `expires_at baru = max(sekarang, expires_at lama) + durasi`.
- **Trial Premium 7 hari** otomatis saat registrasi (trigger platform).
- Tiga status: **Guest**, **Free User** (login tanpa Premium aktif), **Premium**
  (termasuk trial).
- **Registrasi, reset password, dan pembelian hanya di `edifisia.com`.** Login boleh
  dari dialog di tiap aplikasi.

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
(slug modul), `name` (sudah di-trim, 1–120), `state_json` (objek JSON snapshot stash, ≤ 256 KB),
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

Masterplan menulis gating Download Report "di sisi server". Di Civil Tools laporan
PDF **dibuat di browser** (`core/report.js`), jadi gating unduhan tetap di browser:
cukup untuk pengguna biasa, tetapi bisa diakali oleh orang yang paham DevTools.
Pilihan:

- **A (disarankan untuk sekarang):** tetap di browser seperti hasil Fase C.
  Nilai premium yang sungguh terlindungi adalah Save (RLS).
- **B (nanti, bila perlu):** pindahkan pembuatan PDF ke edge function yang mengecek
  `has_premium` lebih dulu.

## 3. Yang dipertahankan dari Fase A–C

Mekanisme yang tidak bergantung pada Firebase tetap dipakai:

- **Snapshot stash** `works.js`: semua kunci sessionStorage berprefiks
  `civiltools-state:{toolId}:` → satu JSON → ditulis balik + `CivilShell.openTool(id,{force:true})`.
  Nol perubahan di `modules/*`; stash tambahan (`ta`, `layers`) ikut otomatis.
- **Satu titik gating** di `core/report.js` (`downloadPDF` / `downloadText`),
  termasuk pratinjau gambar ±97 DPI dengan geometri halaman PDF yang sama.
- **Pengaman deploy setengah jadi**: paywall hanya menyala bila konfigurasi
  akun sudah lengkap (dulu `paywallActive()`, kini dicek terhadap config Supabase).

## 4. Yang perlu dibangun

1. **Lapisan akun versi Supabase** (pengganti `core/auth.js`): login email + password
   dan **Google** (`signInWithOAuth`), baca `premium_status()`, ekspor API yang sama
   (`window.CivilAuth`) agar `works.js` dan `report.js` berubah sesedikit mungkin.
   Tombol "Daftar" dan "Lupa password" mengarah ke `edifisia.com`.
2. **`core/works.js`**: ganti Firestore dengan query `tools.saved_works`.
3. **`core/billing.js`**: tidak lagi membuka Midtrans Snap. Cukup tombol
   "Beli / Perpanjang Premium" ke halaman beli `edifisia.com`. Tampilan status
   mengikuti Matrix: "Trial s/d …", "Premium s/d …", peringatan ≤ 7 hari,
   "Premium berakhir … · Perpanjang".
4. **Sesi lintas subdomain**: storage adapter `supabase-js` berbasis cookie
   `Domain=.edifisia.com`, dipakai bersama Matrix. Selama belum ada, login berlaku
   per aplikasi (seperti Matrix sekarang, `localStorage`).
5. **Hapus Firebase**: `functions/`, `firebase/`, `firebase.json`, `.firebaserc`,
   blok `FIREBASE_CONFIG` / `MIDTRANS_CONFIG` dan skrip `gstatic.com/firebasejs`
   di `index.html`.
6. **Domain & hosting**: Cloudflare Pages + `tools.edifisia.com`
   ([DOMAIN_MIGRATION.md](DOMAIN_MIGRATION.md) §5).
7. **Migrasi ke Vite**: shell + `core/*` jadi modul ES, 36 tool di-*lazy load* per
   rute (`import()` → satu chunk per tool), Three.js dari npm, PWA lewat
   `vite-plugin-pwa` (pengganti `sw.js` manual + bump `CACHE`). Output `dist/`
   menggantikan `scripts/cf-build.sh`.
   **Peluang SEO:** pre-render HTML statis per rute (`/beam-flexure` dst., dengan
   title/description/canonical sendiri) saat build — 36 halaman tool belum pernah
   terindeks Google karena semuanya kini satu `index.html` yang diisi JavaScript.
8. **Rombak UI** di atas Vite + lapisan akun yang baru.

## 5. Urutan kerja

Daftar centang rinci per tahap: [TODO.md](TODO.md).

| # | Langkah | Bergantung pada |
|---|---|---|
| 1 | Cloudflare Pages (tanpa custom domain), Google OAuth di Supabase | — (paralel) |
| 2 | Skema `tools` + RLS + test (rollback) di Supabase development | Platform (sudah live) |
| 3 | Migrasi ke Vite **tanpa mengubah tampilan** (36 tool tetap jalan, regresi nol) | — |
| 4 | Akun & Save versi Supabase di atas Vite, Firebase dicabut | 2, 3 |
| 5 | Rombak UI | 4 |
| 6 | Production: skema `tools`, domain `tools.edifisia.com`, rilis **v0.8.0** | 1, 5 |
| 7 | Redirect 301 dari `tools.dtsengineering.co.id`, pensiunkan Firebase & cPanel | 6 |
| 8 | Sesi lintas subdomain bersama Matrix | Halaman akun `edifisia.com` |

Vite dikerjakan **sebelum** Supabase supaya `supabase-js` langsung dipasang dari npm,
tidak dua kali (CDN dulu lalu npm). Migrasi Vite dipisah dari rombak UI agar
regresi hitungan 36 tool terdeteksi sebelum tampilan berubah.

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
- Framework UI di atas Vite: React + TypeScript seperti Matrix (disarankan, komponen
  akun bisa dibagi) atau vanilla TS.
