# Monetisasi — Freemium (Simpan Pekerjaan + Unduh PDF)

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

## 5. Yang menyusul (belum dikerjakan)

- **Fase B** — "Simpan Pekerjaan" (Firestore `savedWorks` subcollection, panel "Pekerjaan Saya").
- **Fase C** — Integrasi **Midtrans Snap** (perlu akun Midtrans + upgrade Firebase ke plan **Blaze** untuk Cloud Functions), gating nyata `core/report.js` (PDF premium, unduh teks dinonaktifkan).
- **Fase D** — Halaman lead-gen/cross-sell (`modules/promo-dts/`).

Detail arsitektur & data model lengkap: lihat memory project / plan file monetisasi.
