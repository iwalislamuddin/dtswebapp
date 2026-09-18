# Monetisasi — Freemium (Simpan Pekerjaan + Unduh PDF)

Runbook implementasi & setup untuk fitur akun/premium. Rencana lengkap (arsitektur,
data model, rasionale) ada di percakapan/plan file terkait — dokumen ini fokus ke
**langkah setup yang harus dilakukan manual oleh pemilik project** (bukan lewat kode),
karena membuat akun/project cloud tidak bisa dilakukan oleh asisten AI.

Status implementasi: **Fase A (akun login/daftar) — kode sudah ditulis, BELUM aktif**
sampai langkah 1–3 di bawah selesai (config masih placeholder `GANTI...`).

---

## 1. Buat project Firebase

1. Buka [console.firebase.google.com](https://console.firebase.google.com), masuk dengan akun Google yang mau jadi pemilik project.
2. **Add project** → beri nama (mis. `edfs-civil-tools`) → boleh matikan Google Analytics bawaan Firebase (sudah pakai GA4 sendiri via measurement ID di `index.html`).
3. Setelah project dibuat, klik ikon **`</>`** (Web app) di halaman Project Overview untuk mendaftarkan web app → beri nickname (mis. `civil-tools-web`) → **JANGAN** centang "Firebase Hosting" (kita tetap pakai cPanel).
4. Firebase akan menampilkan objek `firebaseConfig` — salin `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

## 2. Isi config di `index.html`

Ganti blok `window.FIREBASE_CONFIG` (dekat bagian GA4) dengan nilai dari langkah 1.4 di atas — persis pola `window.GA4_MEASUREMENT_ID` yang sudah ada.

## 3. Aktifkan Auth & Firestore

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
