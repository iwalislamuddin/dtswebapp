# UI Civil Tools v0.8 — arah desain

Disepakati 2026-10-07 (konsep dari pemilik, mockup "Balok Sederhana"). Diimplementasikan di Tahap 5
bersama penulisan ulang tiap tool di React. Detail visual per tool menyusul; dokumen ini adalah patokan.

## Prinsip

- **Mirip aplikasi Windows seperti EDFS Matrix, tanpa Ribbon.**
- **Tipografi sama dengan Matrix**: `'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, Roboto,
  sans-serif`, dasar 13px/1.35; angka hasil & laporan monospace (`ui-monospace, Consolas`).
- **Warna tema hijau olive `#566246`** (warna logo Civil Tools) sebagai aksen — pengganti biru `#0f6cbd` Matrix.
  Latar utama **putih** seperti Matrix.
- **Hanya 2 tema: Light & Dark.** Semua warna lewat token CSS di `[data-theme]` (pola `index.css` Matrix);
  kanvas/diagram membaca token yang sama.

## Kerangka jendela

```
┌ Menu bar: File · Help ──────────────────────────── [Premium] [Akun] ┐
├──────────────┬──────────────────────────────────────────────────────┤
│ Navigasi     │ HEADER: judul tool + deskripsi singkat               │
│ (kiri)       ├──────────────────────────────────────────────────────┤
│ - buka/tutup │ CONTENT (tab):  [Input] [Detail]                     │
│ - scrollable │                                                      │
│ - kategori   │  Input : input · ilustrasi/diagram · ringkasan hasil │
│   + tool     │  Detail: detail perhitungan langkah demi langkah     │
└──────────────┴──────────────────────────────────────────────────────┘
```

- **Menu bar**: `File` (Simpan / Buka pekerjaan, Download Report, …) dan `Help` (Tentang, catatan rilis, …).
  Di kanan: status Premium/Trial dan menu akun.
- **Panel navigasi kiri**: bisa dibuka-tutup (seperti sekarang), **scrollable sendiri**, dikelompokkan per
  kategori, item aktif disorot hijau, ada kotak **Cari tool**. Kategori & urutannya dari `src/tools.ts`
  (`TOOL_CATEGORIES`), **final 2026-10-07**: Analisis Struktur · Beton Bertulang · Baja · **Struktur Bawah** ·
  Geoteknik · Pembebanan · Hidraulika & Hidrologi. Struktur Bawah = tapak/shallow-foundation, pile
  cap/deep-foundation, DPT batu kali & beton; Sambungan dihapus (baut, las, angkur → Baja; base-plate → EDFS Nexus).
  Di layar ≤ 760 px panel menjadi laci di atas konten (tertutup saat halaman dimuat).
- **Jendela utama** = **header** (judul + deskripsi) + **content**.
- **Content berbentuk tab**, hanya dua:
  - **Input** — semua input, ilustrasi/diagram, dan ringkasan hasil dalam satu layar.
  - **Detail** — detail perhitungan (pengganti laporan teks di layar; sumber yang sama dengan Download Report).
- **Content diusahakan tidak di-scroll.** Bila perlu scroll, scroll **parsial di dalam panel** (mis. kolom
  input atau tabel beban), sehingga header, tab, dan panel lain tetap diam.

## Tata letak tab Input (dari mockup)

- **Kiri: kartu input** bernomor (`1. Data …`, `2. Beban`, `3. Opsi`); tabel dinamis untuk daftar (beban,
  lapisan tanah) dengan tombol Tambah/Edit/Hapus; tombol aksi utama hijau.
- **Kanan atas: Preview** — ilustrasi elemen + beban, ikut berubah saat input diubah.
- **Kanan bawah: Diagram/hasil** — sub-tab bila lebih dari satu diagram (mis. Reaksi · Geser · Momen ·
  Lendutan), kartu **Nilai Maksimum** / ringkasan hasil di bawahnya.

## Keputusan pemilik 2026-10-07

- Navigasi memakai kelompok **Struktur Bawah** (lihat di atas).
- **Hitung otomatis** saat input berubah, **tanpa tombol Hitung** (perilaku build lama dipertahankan; tombol hijau
  di mockup tidak dipakai). Hitungan berat diberi debounce; input tidak valid → hasil lama diredupkan + pesan.

## Shell terpasang (2026-10-07)

- Menu `File`: Halaman Depan · Simpan Pekerjaan… · Buka Pekerjaan… · Download Report… (tiga terakhir tampil
  "segera" sampai akun Supabase Tahap 4). Menu `Help`: Catatan Rilis · Tentang. Kanan: Perbarui aplikasi (PWA),
  tema, akun ("Masuk", nonaktif sampai Tahap 4). Tombol panel di kiri menu bar membuka/menutup navigasi.
- Header tool: kategori, nama, deskripsi SEO (2 baris). Tool tanpa UI baru menampilkan placeholder di kedua tab.

## Masih dibahas (Tahap 5)

- Isi menu `File` / `Help` final, pintasan keyboard.
- Perilaku di layar sempit/ponsel (panel menumpuk; scroll halaman diizinkan di bawah lebar tertentu).
