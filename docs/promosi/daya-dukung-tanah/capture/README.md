# Capture screenshot — video bagian 2 (login, Detail, PDF, simpan ke cloud)

Skrip ini dijalankan **di laptop Anda**. Ia membuka browser, mengambil screenshot desktop (1600×900) dan mobile
(390 px, layout HP), lalu menulis koordinat tombol/dialog ke `out/boxes.json` supaya video bisa disusun otomatis.

## Sekali saja: akun demo khusus video

Supaya tidak perlu login manual setiap membuat video, pakai **satu akun khusus** dengan Premium jangka panjang.

1. **Buat akun** di https://edifisia.com/daftar dengan email khusus, mis. `tutorial@edifisia.com` atau alias
   `nama+tutorial@...`. Konfirmasi emailnya (akun baru otomatis dapat trial 7 hari).
   - Sandi unik, jangan dipakai di tempat lain.
   - **Jangan** jadikan akun ini admin (jangan masukkan ke `platform.admins`). Jangan pakai akun admin/pribadi di sini.
2. **Beri Premium panjang** lewat https://edifisia.com/admin → Pengguna → cari email akun demo → Grant, mis.
   **1825 hari** (5 tahun), catatan "akun demo video tutorial". Tercatat di audit log.
   (Tanpa /admin: SQL di README repo `edifisia-platform`, bagian "Grant manual lewat SQL".)
3. **Simpan email & sandi di laptop** sebagai file `.env.demo` di folder ini (sudah di-`.gitignore`):

   ```
   EDFS_DEMO_EMAIL=tutorial@edifisia.com
   EDFS_DEMO_PASSWORD=sandi-akun-demo
   ```
   File ini teks biasa: hanya untuk akun demo, jangan di-commit, jangan dikirim ke siapa pun.

Setelah itu setiap `node capture.mjs` login sendiri. Sesi juga disimpan di `.state/` dan **dipakai ulang**, jadi login
lewat form hanya terjadi bila sesi sudah tidak berlaku. Tanpa `.env.demo`, skrip menunggu Anda login manual di jendela
browser (maksimal 10 menit).

## Privasi
- Email akun **disamarkan** di semua screenshot menjadi `nama@email.com`.
- Halaman masuk dipotret **sebelum** apa pun diketik; sandi tidak pernah ditulis ke log atau screenshot.
- `.state/` (cookie + token sesi) dan `.env.demo` sudah di-`.gitignore`. **Jangan commit atau kirim keduanya.**

## Menjalankan
Butuh Node 20+. Di PowerShell pakai `npm.cmd` / `npx.cmd` bila `npm` ditolak.

```bash
cd docs/promosi/daya-dukung-tanah/capture
npm install                      # sekali
npx playwright install chromium  # sekali
node capture.mjs
```

Urutan kerja (±3–5 menit, jangan klik apa pun di jendela):
1. Layar tamu + klik **Masuk** (halaman masuk dipotret), lalu login (otomatis / manual).
2. Skrip membaca label status di menu akun dan **berhenti sendiri** bila Premium tidak aktif.
3. Desktop: isi contoh input, menu akun, tab Detail (per irisan), File › Download Report (PDF) + **unduh PDF**,
   File › Simpan Pekerjaan (**Cloud**), File › Buka Pekerjaan. Lalu hal yang sama dalam mode HP.

Opsi: `--only=desktop` / `--only=mobile`, `--fresh-login` (abaikan sesi tersimpan), `--allow-no-premium`,
`CHANNEL=chrome` (pakai Google Chrome terpasang), `BASE_URL=...` (mis. staging), `OUT=folder`.

## Hasil
`out/desktop/*.png`, `out/mobile/*.png`, `out/pdf/laporan.pdf` (+ PNG halaman 1–3 bila `pdftoppm` ada),
`out/boxes.json`, `out/log.txt` (ringkasan langkah berhasil/gagal).

Skrip membuat dua pekerjaan di cloud: **Pondasi gedung A** (desktop) dan **Pondasi gedung B** (HP). Pada akun demo
boleh dibiarkan (dijalankan ulang → ditimpa, bukan bertambah).

## Mengirim hasil kembali
- **Lewat git:** `git add -f out && git commit -m "Screenshot video bagian 2" && git push` (di branch ini).
  Cek sekilas dulu `out/desktop/d20-*.png` (email harus tersamarkan).
- **Atau** zip folder `out/` dan lampirkan di chat.

## Mengulang
Hapus hasil lama lalu jalankan lagi (PowerShell):

```powershell
git pull
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue   # macOS/Linux: rm -rf out
node capture.mjs
```
Ganti akun: ubah `.env.demo`, lalu `node capture.mjs --fresh-login`.

## Bila ada yang gagal
- "pesan dari halaman masuk: Email atau kata sandi salah" → periksa `.env.demo`.
- "Akun ini TIDAK punya Premium/trial aktif" → grant Premium ke akun demo (langkah 2 di atas).
- Langkah bertanda ✗ di akhir log: ulangi dengan `--only=desktop` atau `--only=mobile`, atau kirim `out/log.txt`;
  langkah yang gagal tidak menggagalkan langkah lain.
