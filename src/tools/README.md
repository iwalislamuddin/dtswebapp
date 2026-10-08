# `src/tools` — UI tool (kontrak, Tahap 5)

Contoh acuan: **`steel-beam-analysis/`** (tool percontohan; daftar beban `RowTable`, diagram gaya dalam) dan
**`bolt-connection/`** · **`weld-connection/`** (form datar, pilihan bersyarat, diagram batang kapasitas vs beban). Arah tampilan: [docs/UI.md](../../docs/UI.md).

## Berkas per tool

| Berkas | Isi |
|---|---|
| `form.ts` | Bersama: `parseNum()` (koma desimal diterima) & `FieldErrors`. |
| `<id>/model.ts` | Bentuk input UI (`…Input`, JSON murni, angka sebagai **teks form**), `…_DEFAULTS`, `validate()` → `{ kunciField: pesan }`, adapter ke `src/calc/<id>.ts`, `compute…(input)` → hasil atau `null` bila ada field tidak valid. Tanpa React — diuji Vitest. |
| `<id>/report.ts` | `Report` dari hasil (`src/report/model.ts`) + `default export { defaults, build }`. Sumber tunggal tab Detail & PDF. |
| `<id>/index.tsx` | Default export komponen `({ tab })`. Dimuat malas oleh `registry.ts` (satu chunk per tool). |
| `<id>/*.tsx` | Preview & diagram SVG tool tersebut. |
| `<id>/model.test.ts` | Input bawaan UI = kasus golden default (angka identik build lama), adapter, validasi, laporan. |

## Aturan

1. **State input** lewat `useToolInput(id, DEFAULTS, version)` (`src/app/tool-state.ts`): bertahan saat pindah tab /
   tool, dipulihkan dari `sessionStorage`, dan objek yang sama kelak menjadi `state_json` Simpan Pekerjaan.
   Naikkan `version` bila bentuk input berubah.
2. **Hitung otomatis, tanpa tombol Hitung**: `useAutoCompute(input, compute)`. Field tidak valid → kontrol merah +
   pesan di bawahnya; hasil sah terakhir tetap tampil **diredupkan** (`.stale`) dengan pesan di panel hasil.
3. **Laporan** (`report.ts`) memakai model `src/report/model.ts`: `summary`, bagian bernomor berisi `h` (subjudul),
   `p`, `rows` (kv/check), `calc` (langkah **rumus → substitusi → hasil**, markup `_{}` `^{}` `\frac{}{}`), `table`,
   `figure` (op berwarna `c: 'load' | 'v' | 'm' | …`). `useToolReport(id, report)` mendaftarkannya untuk tombol PDF;
   tab Detail = `<DetailTab report … />` (gating Premium di dalamnya).
   Judul laporan tanpa deskripsi/metode di bawahnya (dihapus 2026-10-08); deskripsi isian pengguna ("Balok lift
   lantai atap") hanya di PDF, lewat dialog Cetak PDF (diingat per tool). Format laporan (patokan semua tool):
   heading = latar sorot saja (jingga hanya di pita atas halaman pertama PDF), langkah rumus = garis kiri tipis
   tanpa latar, PDF menunda gambar yang tak muat ke halaman berikut dan tidak menyisakan halaman berisi penutup saja.
4. **Tata letak tab Input**: `ToolLayout` — kiri kartu bernomor (`Card n={1} …`), kanan atas `Panel "Preview"`, kanan
   bawah `Panel "Diagram"` dengan `SubTabs` + `StatTiles` "Nilai maksimum". Halaman tidak di-scroll; kolom input
   scroll sendiri. ≤ 900 px kolom menumpuk.
5. **Kontrol**: `NumField` (label · input · satuan), `SelectField`, `Segmented`, `RowTable` (daftar beban/lapisan:
   tambah, edit langsung, hapus; kunci error `prefix.indeks.kolom`). Angka desimal boleh koma.
6. **Gambar**: SVG ukuran piksel nyata (`<Sized>` / `useSize` dari `src/ui/kit.tsx`), warna dari token `--dg-*` (terang/gelap); diagram gaya dalam
   memakai `Curve`/`XAxis` dari `src/ui/diagram.tsx` (label ekstrem + bidik hover); cek kapasitas memakai
   `CapacityBars` dari `src/ui/bars.tsx` (batang φR per keadaan batas, garis = beban terfaktor).
7. Angka hasil pakai `fx(n, dp)`; teks satuan dengan simbol Unicode (kN·m, cm⁴) — dipakai langsung di tab Detail & PDF (font Unicode).
8. **Field bersyarat**: kontrol yang tak berlaku disembunyikan (mis. Fnt/Fnv hanya untuk mutu Kustom, spasi s hanya
   bila baris > 1) dan **tidak divalidasi** selama tersembunyi — field tersembunyi tak boleh memblokir hitung.
