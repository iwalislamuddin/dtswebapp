# Monetisasi — Freemium (Simpan Pekerjaan + Unduh PDF)

> **⚠️ ARSIP — digantikan 2026-10-06.** Firebase dibuang; akun, Premium, dan
> pembelian Civil Tools pindah ke platform Edifisia (Supabase, satu Edifisia
> Premium untuk semua aplikasi, trial 7 hari, beli di `edifisia.com`). Harga di
> dokumen ini (Rp 14/39/129 rb) **tidak berlaku lagi**. Rencana aktif:
> **[PLATFORM.md](PLATFORM.md)**.
>
> Dokumen ini disimpan sebagai catatan bagaimana Fase A–C dibangun, karena
> mekanisme yang tidak bergantung Firebase dipertahankan: snapshot stash
> (§5), titik gating dan pratinjau di `core/report.js` (§6), serta pelajaran
> webhook Midtrans (§6 langkah 6, `--data-file` untuk secret). Langkah setup
> Firebase dan papan kerja §7 **jangan dikerjakan lagi**.

Runbook implementasi & setup untuk fitur akun/premium. Rencana lengkap (arsitektur,
data model, rasionale) ada di percakapan/plan file terkait — dokumen ini fokus ke
**langkah setup yang harus dilakukan manual oleh pemilik project** (bukan lewat kode),
karena membuat akun/project cloud tidak bisa dilakukan oleh asisten AI.

Status implementasi: **Fase A (akun login/daftar) — kode sudah ditulis, config sudah diisi
(project `edfs-civil-tools-e3a59`), TINGGAL langkah 3** (aktifkan Auth + buat Firestore di
Console). Langkah 1 & 2 selesai.

---

## 1. Buat project Firebase — ✅ SELESAI

1. Buka [console.firebase.google.com](https://console.firebase.google.com), masuk dengan akun Google yang mau jadi pemilik project.
2. **Add project** → beri nama (mis. `edfs-civil-tools`) → boleh matikan Google Analytics bawaan Firebase (sudah pakai GA4 sendiri via measurement ID di `index.html`).
3. Setelah project dibuat, klik ikon **`</>`** (Web app) di halaman Project Overview untuk mendaftarkan web app → beri nickname (mis. `civil-tools-web`) → **JANGAN** centang "Firebase Hosting" (kita tetap pakai cPanel).
4. Firebase akan menampilkan objek `firebaseConfig` — salin `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

## 2. Isi config di `index.html` — ✅ SELESAI

Blok `window.FIREBASE_CONFIG` di `index.html` sudah berisi config project
`edfs-civil-tools-e3a59`.

> **Soal `apiKey` yang terlihat publik:** itu wajar dan aman. API key Firebase bukan
> rahasia — ia hanya *identifier* project, dan memang harus ikut terkirim ke browser
> setiap pengunjung. Yang benar-benar menjaga data adalah **Firestore Rules**
> (`firebase/firestore.rules`) + daftar **Authorized domains** di Authentication.
> (Opsional, kalau mau rapi: Google Cloud Console > APIs & Services > Credentials >
> key "Browser key (auto created by Firebase)" > Application restrictions > HTTP
> referrers > isi `tools.dtsengineering.co.id/*` + `localhost:*`.)

## 3. Aktifkan Auth & Firestore — ⏳ BELUM (ini yang tersisa)

Hasil pengecekan langsung dari browser terhadap project `edfs-civil-tools-e3a59`
(21 Sep 2026): Authentication membalas `auth/configuration-not-found` (belum
di-*Get started* / provider belum diaktifkan), dan Firestore membalas
`403 Cloud Firestore API has not been used in project ... before or it is disabled`
(database belum dibuat). Dua hal itu **hanya bisa diklik manual** di Console:

Di Firebase Console, project yang baru dibuat:

- **Build > Authentication > Get started** → tab **Sign-in method** → aktifkan **Email/Password** dan **Google**.
  - Untuk Google sign-in: isi "Project support email" bila diminta.
  - Tab **Settings > Authorized domains** → pastikan `tools.dtsengineering.co.id` ada di daftar (biasanya otomatis untuk domain custom perlu ditambah manual — tambahkan di sini).
- **Build > Firestore Database > Create database** → pilih lokasi region terdekat (mis. `asia-southeast2` / Jakarta) → mode **Production** (bukan test mode).
- Tab **Rules** di Firestore → tempel isi [`firebase/firestore.rules`](../firebase/firestore.rules) dari repo ini → **Publish**.

Setelah ketiga langkah ini + config diisi, reload situs — tombol **"👤 Masuk"** di pojok kiri bawah nav akan aktif (form Masuk/Daftar + Google sign-in).

## 4. Verifikasi Fase A

- Daftar akun baru via email → cek dokumen baru muncul di Firestore `users/{uid}` (field `premium.active` harus `false`).
- Logout, login lagi, refresh halaman → sesi tetap tersimpan (Firebase persist otomatis, tak perlu login ulang).
- Login dengan Google → cek juga dokumen `users/{uid}` terbuat.
- Belum ada perubahan pada fitur kalkulator/unduh PDF apa pun di fase ini — itu menyusul di Fase B & C.

## 5. Fase B — "Simpan Pekerjaan" (kode selesai, menunggu Firestore aktif)

Kode Fase B sudah ada di repo: [`core/works.js`](../core/works.js) + tombol nav
**★ Pekerjaan Saya** + panel `#works-ov`. Nol perubahan di `modules/*`.

**Cara kerjanya.** Tiap tool sudah menulis nilai formnya ke sessionStorage lewat
`CivilUI.stash` (kunci `civiltools-state:{toolId}:{suffix}`). `works.js` memotret
SEMUA kunci milik tool aktif, menyimpannya sebagai satu string JSON di
`users/{uid}/savedWorks/{workId}.stateJson`, lalu saat dibuka kembali menulis
kunci-kunci itu balik ke sessionStorage dan meminta shell mount ulang tool
(`CivilShell.openTool(id, {force:true})`). Karena berbasis prefiks, tool dengan
stash tambahan (`cpt-bearing`/`cpt-pile` → `ta`, `pile-capacity` → `layers`) ikut
tersimpan otomatis tanpa daftar khusus. Satu perubahan kecil di `core/ui-kit.js`:
`buildForm` kini merekam nilai awal sekali saat form dibangun, supaya pekerjaan
tetap bisa disimpan walau pengguna belum mengubah satu field pun.

**Gate**: guest → modal Masuk; sudah masuk tapi belum premium → modal bridging;
premium → panel terbuka.

### Cara menguji Fase B sebelum pembayaran ada (Fase C)

Belum ada cara membeli premium, jadi aktifkan manual untuk akun sendiri:

1. Login di situs → Firebase Console > Firestore > koleksi `users` → buka dokumen
   dengan uid Anda.
2. Edit field `premium`: set `active` = `true` (boleh isi `plan` = `"manual"`).
   Rules memang melarang *client* menulis field ini — tapi edit lewat Console
   memakai hak admin, jadi diizinkan.
3. Reload situs: tombol akun & **★ Pekerjaan Saya** berubah jadi aksen oranye,
   panel bisa dibuka.
4. Buka sebuah tool → ubah beberapa input → **★ Pekerjaan Saya** → beri nama →
   **Simpan**. Cek dokumen baru di `users/{uid}/savedWorks`.
5. Ubah input jadi nilai lain → buka panel → klik pekerjaan tadi → form harus
   kembali ke nilai yang tersimpan. Coba juga dari tool lain (harus pindah tool
   sendiri) dan dari perangkat/browser lain dengan akun yang sama.
6. Hapus: klik × sekali (berubah jadi "Hapus?"), klik lagi untuk konfirmasi.

## 6. Fase C — Berlangganan (Midtrans Snap) & gating PDF

**Status: SELESAI & TERVERIFIKASI LANGSUNG (22 Sep 2026).** Pembayaran sandbox
paket 3 bulan mengaktifkan premium sepenuhnya otomatis: Snap → webhook Midtrans
→ `orders/{id}.status = paid` → `users/{uid}.premium.expiresAt` maju 3 bulan,
tanpa campur tangan manual. Idempotensi diuji (notifikasi sama dikirim 3×:
`activated`, lalu `already-paid`, `already-paid`) dan notifikasi bersignature
palsu memakai order ID asli ditolak tanpa mengubah apa pun.

### Harga paket (sumber kebenaran ada di server)

| Paket | Harga | Setara / bulan |
|---|---|---|
| 1 bulan | Rp 14.000 | Rp 14.000 |
| 3 bulan | Rp 39.000 | Rp 13.000 (hemat 7%) |
| 12 bulan | Rp 129.000 | Rp 10.750 (hemat 23%) |

Harga tertulis di **dua** tempat dan wajib diubah bersamaan:
`functions/index.js` (`PLANS` — dipakai server saat menagih) dan
`core/billing.js` (`PLANS` — hanya tampilan). Browser tidak pernah mengirim
nominal; ia hanya mengirim `planId`.

### Apa yang berubah untuk pengguna

- **Unduh PDF / teks** kini premium. Non-premium yang menekan tombol unduh tetap
  mendapat laporannya — dihitung penuh — tapi sebagai **pratinjau gambar
  resolusi rendah** (±100 DPI, teks tidak bisa diseleksi/disalin, ada penanda
  "PRATINJAU" di tiap halaman), dengan tombol menuju paket berlangganan.
  Seluruh perhitungan, diagram, dan hasil di layar tetap gratis.
- Pratinjau dirender ulang di kanvas memakai geometri halaman yang sama dengan
  PDF (612×792 pt, Courier 9pt), jadi yang dilihat persis yang akan diunduh.
- Catatan: unduh **.txt** tidak dimatikan total seperti rencana awal, melainkan
  ikut dipagari premium. Alasannya celah bypass-nya tertutup sama rapat (teks
  hanya keluar untuk pelanggan), sementara pelanggan tetap dapat format mentah
  yang berguna. Untuk mematikannya total, ubah `downloadText` di
  `core/report.js` agar selalu memanggil `openPreview`.

### Perpanjangan

Pelanggan yang masih aktif tetap bisa membeli lagi — itu perpanjangan, bukan
pembelian ulang. Pintunya ada di **popover akun** (klik tombol akun di kiri
bawah): baris "★ Premium s/d <tanggal>" + tombol **Perpanjang Premium**. Modal
paket menjelaskan bahwa masa baru ditambahkan dari tanggal kedaluwarsa yang ada,
dan `midtransWebhook` memang menghitungnya begitu (`base = expiresAt bila masih
berlaku, selain itu now`) — tidak ada sisa hari yang hangus. Pengguna yang belum
premium melihat tombol "★ Berlangganan Premium" di tempat yang sama.

### Alur uang (kenapa tidak bisa dipalsukan)

1. Browser memanggil callable `createSnapTransaction` dengan `planId` saja.
2. Cloud Function membaca harga dari tabelnya sendiri, membuat `orders/{orderId}`
   berstatus `pending`, lalu meminta Snap token ke Midtrans dengan **server key**
   yang tidak pernah dikirim ke browser.
3. Popup Snap terbuka; pengguna membayar (kartu, VA, e-wallet, QRIS).
4. Midtrans memanggil `midtransWebhook`. Function memverifikasi signature
   SHA-512, mencocokkan nominal dengan order, lalu memperpanjang
   `users/{uid}.premium` — satu-satunya penulis field itu (client dilarang oleh
   rules). Idempoten: notifikasi berulang tidak menambah masa aktif dua kali,
   dan perpanjangan menambah dari sisa masa aktif, bukan menghanguskannya.
5. Browser mengetahui premium menyala lewat listener Firestore yang sudah ada.

### Langkah setup (manual, oleh pemilik project)

1. ✅ **Upgrade Firebase ke plan Blaze** — sudah dilakukan (22 Sep 2026).
   Pasang **budget alert** (Console > ⚙ > Usage and billing > Budgets & alerts),
   mis. Rp 50.000/bulan, supaya tidak ada kejutan tagihan.
2. ✅ **Daftar Midtrans** — sudah (Merchant ID `M099838`, mode **Sandbox**).
3. ✅ **Client Key sandbox** sudah terisi di `window.MIDTRANS_CONFIG`
   (`index.html`), `production: false`.
4. ✅ **`npm --prefix functions install`** — sudah dijalankan; `functions/node_modules`
   ada di mesin lokal (tidak ikut git).
5. ⏳ **Pasang secret & deploy functions.** Semua perintah dijalankan dari
   **root repo** (`D:\dts homepage app\civil-tools`) di PowerShell/Terminal biasa
   — bukan dari dalam `functions/`, karena `firebase.json` ada di root.

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase functions:secrets:set MIDTRANS_SERVER_KEY
   firebase functions:secrets:set MIDTRANS_CLIENT_KEY
   firebase deploy --only functions
   ```

   `functions:secrets:set` akan **meminta nilainya lewat prompt** — tempel key di
   situ. Jangan pernah menaruh **Server Key** di dalam berkas repo mana pun;
   tempatnya hanya di Secret Manager. (Client Key beda urusan: memang publik.)

   Deploy pertama akan meminta izin mengaktifkan beberapa API Google Cloud
   (Cloud Build, Artifact Registry, Cloud Run, Secret Manager, Cloud Scheduler)
   — jawab **yes**.

   `firebase.json` & `.firebaserc` sudah ada di repo; keduanya beserta folder
   `functions/` TIDAK ikut ter-publish ke hosting statis — `scripts/cf-build.sh`
   dan daftar zip di [DEPLOY.md](DEPLOY.md) memakai whitelist.
6. ⏳ Salin URL `midtransWebhook` yang tercetak saat deploy → Midtrans Dashboard >
   Settings > Configuration > **Payment Notification URL** (isi juga di tab
   Production nanti). Biarkan Finish/Unfinish/Error URL kosong — Snap popup
   tidak memakai redirect.

   > Tombol **Test notification URL** di dashboard mengirim payload dengan
   > `order_id` contoh (`payment_notif_test_...`) yang tentu saja tidak ada di
   > Firestore. Karena itu webhook sengaja membalas **200 untuk semua payload
   > yang tidak bisa diproses** (order tak dikenal, signature tidak cocok,
   > payload tak lengkap) dan hanya menyisakan 5xx untuk error internal yang
   > memang layak dikirim ulang. Keamanannya tetap: premium hanya berubah bila
   > signature sah **dan** order ada **dan** nominal cocok.
7. ⏳ Deploy rules bila belum pernah: `firebase deploy --only firestore:rules`.
### Uji coba (sandbox, tanpa uang sungguhan)

- Buka tool → **Download PDF** → pratinjau muncul → **Lihat Paket Premium** →
  pilih paket → popup Snap.
- Kartu uji Midtrans: **4811 1111 1111 1114**, CVV `123`, kedaluwarsa bulan/tahun
  mana pun di masa depan, OTP `112233`.
- Setelah bayar: cek `orders/{orderId}.status` = `paid`, dan
  `users/{uid}.premium.active` = `true` dengan `expiresAt` sesuai paket. Tombol
  akun & Pekerjaan Saya berubah beraksen oranye tanpa perlu reload.
- Uji idempotensi: di Midtrans Dashboard, kirim ulang notifikasi order yang sama
  → `expiresAt` tidak boleh bertambah lagi.
- Naik ke produksi, tiga hal harus berubah bersamaan:
  `MIDTRANS_IS_PRODUCTION = true` di `functions/index.js`, `production: true` +
  client key produksi di `index.html`, dan kedua secret di-set ulang dengan key
  produksi — lalu `firebase deploy --only functions`.

## 7. Papan kerja berikutnya (per 2026-09-22) — USANG

> Seluruh daftar di bawah digantikan oleh [PLATFORM.md §5](PLATFORM.md) (2026-10-06).
> Yang masih relevan sudah dibawa ke sana: jangan deploy paywall Firebase,
> bump ke v0.8.0 saat rilis, Midtrans produksi (kini lewat webhook platform),
> riwayat pembelian & pengingat kedaluwarsa (kini tugas platform).

Fase A–C selesai **di repo** dan terverifikasi di sandbox. Yang live di
`tools.dtsengineering.co.id` masih build lama (≈ v0.5.1) — belum ada akun,
belum ada paywall. Daftar di bawah urut menurut apa yang memblok apa.

### 🔴 P0 — Wajib beres SEBELUM deploy berikutnya

Ketiganya satu paket: deploy tanpa salah satunya membuat situs lebih buruk
daripada sekarang.

1. **Tambahkan `tools.dtsengineering.co.id` ke Firebase Auth > Settings >
   Authorized domains.** Ini bukan sekadar "nanti juga bisa": paywall menyala
   otomatis begitu `MIDTRANS_CONFIG` terisi (sudah terisi di repo). Kalau
   domain produksi belum diizinkan, login gagal (`auth/unauthorized-domain`)
   → tidak ada yang bisa jadi premium → **semua unduhan PDF berubah jadi
   pratinjau untuk semua orang**. Regresi total. Verifikasi: buka situs
   produksi, klik Masuk, pastikan login Google berhasil.
2. **Naikkan versi app ke v0.8.0 + tulis catatan rilis** di modal Tentang
   (`index.html`). Angkanya sendiri kosmetik, tapi modal Tentang adalah
   satu-satunya changelog yang dilihat pengguna, dan versi di sana masih
   **v0.7.3 (21 Agu 2026)** — tertinggal dua siklus (revisi Tool #16 P–M kolom,
   lalu akun + Simpan Pekerjaan + paywall). Menerbitkan paywall tanpa memberi
   tahu apa yang berubah = gelombang pertanyaan pengguna. Bump *minor*
   (0.7.x → 0.8.0) karena ini fitur baru, bukan perbaikan.
   Catatan: **SW cache tidak menunggu ini** — sudah di `civil-tools-v64` dan
   itu yang mengurus invalidasi cache; nomor versi app murni komunikasi.
3. **Deploy backlog v0.5.1 → v0.8.0 ke cPanel** (whitelist di
   [DEPLOY.md](DEPLOY.md); `functions/`, `firebase/`, `firebase.json`,
   `.firebaserc` TIDAK ikut). Sesudahnya uji di domain asli: login, simpan
   pekerjaan, unduh PDF sebagai non-premium (harus pratinjau).

### 🟠 P1 — Segera setelah live

4. **Midtrans produksi.** Perlu verifikasi bisnis dulu. Saat lolos, tiga hal
   berubah bersamaan: `MIDTRANS_IS_PRODUCTION = true` di `functions/index.js`,
   `production: true` + client key produksi di `index.html`, dan kedua secret
   di-set ulang (`--data-file`, jangan prompt) lalu `firebase deploy --only functions`.
   Daftarkan juga Payment Notification URL di tab **Production** Midtrans —
   setelan sandbox tidak terbawa.
5. **Satu transaksi produksi sungguhan** (paket 1 bulan, Rp 14.000, dari akun
   pribadi) sebagai uji asap sebelum diumumkan. Refund manual bila perlu.
6. **Budget alert** di Google Cloud Billing (mis. Rp 50.000/bulan) — Blaze
   sudah aktif, dan tanpa alert tidak ada rem kalau ada lonjakan aneh.
7. **Bersihkan data uji**: order `pending` sisa pengujian, dan premium sandbox
   di akun `iwal@` (s/d 22 Des 2026) & `finance@` (s/d 22 Okt 2026).

### 🟡 P2 — Peningkatan produk (tidak memblok apa pun)

8. **Fase D** — halaman lead-gen/cross-sell `modules/promo-dts/` + kategori nav
   "DTS Engineering" (jasa konsultasi + ebook seri SAP2000).
9. **Halaman harga publik** (mis. `/premium`) — saat ini paket hanya terlihat
   di dalam modal, jadi tidak bisa diindeks Google maupun dibagikan tautannya.
10. **Riwayat pembelian** di panel akun (baca `orders` milik sendiri — rules
    sudah mengizinkan).
11. **Pengingat kedaluwarsa** H-7 dan tanda terima via email (Firebase Extension
    "Trigger Email" atau fungsi kecil + SMTP).

### ⚪ P3 — Utang teknis & kebersihan

12. `firebase-functions` v6 → v7 (CLI sudah memperingatkan "outdated"), plus
    `npm audit` di `functions/` (8 moderate saat dipasang).
13. **App Check** untuk Firestore & callable — mencegah penyalahgunaan endpoint
    dari luar aplikasi (disarankan sendiri oleh Console).
14. Keputusan **domain + migrasi Cloudflare Pages** (`docs/DOMAIN_MIGRATION.md`)
    masih menggantung. Kalau domain berubah, Authorized domains (P0 no.1) dan
    URL kanonik harus diubah lagi — mengerjakannya lebih awal menghemat satu
    putaran.
15. Matikan unduh `.txt` sepenuhnya bila kelak dianggap perlu (satu baris di
    `core/report.js`, lihat §6).

Detail arsitektur & data model lengkap: lihat memory project / plan file monetisasi.
