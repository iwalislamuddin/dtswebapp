# Catatan Rilis — EDFS Civil Tools

Catatan rilis **internal**: tidak lagi ditampilkan di dalam aplikasi (dialog Tentang hanya memuat versi & tanggal
build). Teks di sini disiapkan untuk halaman produk di homepage Edifisia. Terbaru di atas.

Saat rilis: naikkan `version` di `package.json` (tampil di dialog Tentang; tanggal build otomatis dari
`vite.config.ts`) lalu tambahkan bagian baru di sini. Salinan untuk situs Edifisia (format
`web/src/content/changelog/civil-tools/<versi>.<id|en>.md` di edifisia-platform, juga sumber newsletter bulanan) ada
di [`docs/release-notes/civil-tools/`](release-notes/civil-tools/).

---

## v1.0.0 — 2026-11-20

Rilis stabil pertama EDFS Civil Tools: 37 kalkulator rekayasa sipil sesuai SNI dalam 7 kategori — Beton, Baja,
Struktur Bawah, Geoteknik, Pembebanan, Hidraulika, dan Analisis Struktur.

**Tampilan & pengalaman**
- Tampilan baru bergaya aplikasi desktop: menu File & Help, navigasi kiri per kategori, tab Input dan Detail.
- Tema Light & Dark dengan warna olive EDFS, logo & ikon baru Civil Tools.
- Input yang nyaman di ponsel: tombol −/+ dan pilihan nilai umum (chip) pada isian angka.
- Bisa dipasang sebagai aplikasi (PWA) dan dibuka langsung lewat alamat per tool.
- Tautan contoh perhitungan (tombol "Lihat detail" di halaman Coba edifisia.com) membuka tool dengan input terisi.

**Akun & Premium**
- Masuk dengan akun Edifisia (email atau Google) — satu akun untuk semua aplikasi Edifisia.
- Simpan & Buka Pekerjaan (Premium): input tool disimpan ke akun Edifisia (cloud, maks. 50 pekerjaan, bisa dibuka
  dari perangkat lain) atau sebagai file `.edft`. Pekerjaan di cloud tetap bisa dibuka & dihapus walau Premium
  berakhir.
- Tab Detail dengan langkah perhitungan berumus dan laporan PDF bergambar (Premium), kini tersedia juga dalam
  Bahasa Inggris.

**Tool baru & pembaruan**
- Beban Gempa (SNI 1726:2019): parameter dari peta gempa Indonesia, spektrum desain, KDS, geser dasar gedung &
  nongedung.
- Cek Desain Balok Beton: lentur lapangan & tumpuan, geser, dan torsi opsional.
- Base Plate: tumpuan sendi & jepit, dengan beban aktual atau desain kapasitas.
- Diagram P–M Kolom menerima banyak kombinasi beban sekaligus; D/C terbesar menentukan.
- Daya Dukung Tiang (SPT): metode O'Neill & Reese (FHWA, tiang bor) menggantikan SPT Meyerhof; pilihan metode Statik
  (α/β) atau O'Neill & Reese. Lempung: fs = α·cu (α = 0,55 → 0,45), ujung Nc*·cu ≤ 3.830 kPa (faktor tiang pendek
  L < 3D). Pasir: fs = β·σ′v ≤ 200 kPa (β = 1,5 − 0,245√z, × N/15 bila N < 15), ujung 57,5N ≤ 4.300 kPa (× 1,27/D
  bila D > 1,27 m). Opsi abaikan selimut lempung 1,5 m teratas & 1D terbawah; cu lempung dipakai. Pekerjaan lama
  bermetode SPT dibuka sebagai O'Neill & Reese (hasil bisa berbeda).
- Daya Dukung Tiang (SPT): data tanah berupa tabel Z–N-SPT (γ/cu dari korelasi bila kosong), pile cut-off,
  diameter dalam mm, gesekan negatif, kapasitas tarik, dan penulangan tiang beton.
- Daya Dukung Tanah (CPT) dipindah ke kelompok Daya Dukung Tanah.
- Pile Cap: input koordinat tiang, poer poligon, dan sketsa penulangan (denah + potongan).
- Beban Angin: tipe gudang pelana, atap bebas, dan rangka terbuka.
- Balok Menerus dan Pelat Satu Arah kini tool terpisah, dengan gambar penulangan, retak, dan lendutan.
- Mesin hitung ditulis ulang dan dikunci dengan uji terhadap versi sebelumnya.

---

## Riwayat sebelumnya

| Versi | Tanggal | Isi |
|---|---|---|
| 0.7.3 | 2026-08-21 | Tool baru Geser & Torsi Balok (35 tool). |
| 0.7.2 | 2026-08-18 | Tool baru Slab Komposit + Metal Deck. |
| 0.7.1 | 2026-08-06 | Tool baru Desain Tangga Beton; slider skala deformasi. |
| 0.7.0 | 2026-08-04 | Kategori Analisis Struktur: Analisis Portal & Portal Gable. |
| 0.6.0 | 2026-07-28 | Analisis Balok Baja, Desain Pondasi Tapak, Pelat Dua Arah. |
| 0.5.0 | 2026-07-22 | Dinding Penahan Tanah batu kali & beton; laporan PDF bergambar. |
| 0.4.0 | 2026-07-21 | Base Plate & Anchor Rod. |
| 0.3.0 | 2026-07-21 | Tulangan Minimum, Balok Menerus, Pile Cap, Broms, Analisis P-Y. |
| 0.2.0 | 2026-07-14 | 19 tool dalam 6 kategori, library profil baja, URL per tool. |
| 0.1.0 | 2026-07-10 | Rilis awal: Panjang Penyaluran Tulangan Tarik. |

Versi 0.8.0 tidak dirilis terpisah (berjalan sebagai `0.8.0-dev`); isinya masuk ke v1.0.0.
