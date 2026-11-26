# Capture screenshot — video bagian 2 (login, Detail, PDF, simpan ke cloud)

Skrip ini dijalankan **di laptop Anda**. Ia membuka browser, mengambil screenshot desktop (1600×900) dan mobile
(390 px, layout HP), lalu menulis koordinat tombol/dialog ke `out/boxes.json` supaya video bisa disusun otomatis.

## Privasi
- **Skrip tidak pernah meminta atau menyimpan sandi.** Anda masuk sendiri di jendela browser yang terbuka.
- Email akun **disamarkan** di semua screenshot menjadi `nama@email.com` (setelah login terdeteksi).
- Sesi login (cookie/token) disimpan di `.state/` agar mobile tidak perlu login lagi. Folder itu sudah di-`.gitignore`.
  **Jangan commit atau kirim `.state/`.** Hapus setelah selesai: `rm -rf .state`.
- Pakai **akun uji** dengan Premium/trial aktif (akun baru dapat trial 7 hari). Tanpa Premium, tab Detail dan PDF terkunci.

## Menjalankan
Butuh Node 20+.

```bash
cd docs/promosi/daya-dukung-tanah/capture
npm install
npx playwright install chromium
node capture.mjs
```

Yang terjadi:
1. Jendela browser terbuka, skrip memotret layar tamu dan mengklik **Masuk** (halaman masuk ikut dipotret).
2. **Anda login** di jendela itu (email/sandi/Google/2FA — bebas). Skrip menunggu sampai tombol akun muncul
   (maksimal 10 menit). Kalau tidak kembali otomatis ke Civil Tools, ketik alamat tool di tab yang sama:
   `https://tools.edifisia.com/bearing-capacity`.
3. Setelah itu semuanya otomatis (±3–5 menit): isi contoh input, menu akun, tab Detail (per irisan), File › Download
   Report (PDF) dan **unduh PDF**, File › Simpan Pekerjaan (ke **Cloud**), File › Buka Pekerjaan — lalu diulang
   dalam mode HP. Jangan klik apa pun di jendela saat skrip bekerja.

Opsi: `--only=desktop` / `--only=mobile`, `--reuse-session` (pakai `.state/` yang sudah ada, tanpa login ulang),
`CHANNEL=chrome` (pakai Google Chrome terpasang), `BASE_URL=...` (mis. staging), `OUT=folder`.

## Hasil
`out/desktop/*.png`, `out/mobile/*.png`, `out/pdf/laporan.pdf` (+ PNG halaman 1–3 bila `pdftoppm` ada),
`out/boxes.json`, `out/log.txt` (ringkasan: langkah mana berhasil/gagal).

Skrip membuat dua pekerjaan di cloud: **Pondasi gedung A** (desktop) dan **Pondasi gedung B** (HP). Hapus lewat
File › Buka Pekerjaan setelah selesai bila tidak dipakai.

## Mengirim hasil kembali
- **Lewat git:** `git add -f out && git commit -m "Screenshot video bagian 2" && git push` (di branch ini).
  `out/` bukan `.state/`; isinya aman setelah email disamarkan — cek sekilas dulu isi `out/desktop/d20-*.png`.
- **Atau** zip folder `out/` dan lampirkan di chat.

## Mengulang dengan akun lain
Hapus sesi dan hasil lama dulu, lalu jalankan lagi dan login dengan akun yang Premium-nya aktif:

```powershell
git pull
Remove-Item -Recurse -Force .state, out -ErrorAction SilentlyContinue   # macOS/Linux: rm -rf .state out
node capture.mjs
```
Aplikasi tidak punya jalur khusus admin: Detail, PDF, dan simpan cloud hanya terbuka bila akun itu punya Premium/trial
aktif (label di menu akun). Setelah login, skrip membaca label itu dan **berhenti sendiri** bila Premium tidak aktif.

## Bila ada yang gagal
- Detail terkunci / log berisi "PERHATIAN: Detail masih terkunci" → akun bukan Premium/trial aktif.
- Langkah bertanda ✗ di akhir log: ulangi dengan `node capture.mjs --reuse-session --only=desktop` (atau `mobile`),
  atau kirim `out/log.txt`; langkah yang gagal tidak menggagalkan langkah lain.
