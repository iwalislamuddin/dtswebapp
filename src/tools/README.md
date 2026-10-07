# `src/tools` — UI tool (kontrak, Tahap 5)

Contoh acuan: **`steel-beam-analysis/`** (tool percontohan). Arah tampilan: [docs/UI.md](../../docs/UI.md).

## Berkas per tool

| Berkas | Isi |
|---|---|
| `<id>/model.ts` | Bentuk input UI (`…Input`, JSON murni, angka sebagai **teks form**), `…_DEFAULTS`, `validate()` → `{ kunciField: pesan }`, adapter ke `src/calc/<id>.ts`, `compute…(input)` → hasil atau `null` bila ada field tidak valid. Tanpa React — diuji Vitest. |
| `<id>/report.ts` | `Report` dari hasil (`src/report/model.ts`) + `default export { defaults, build }`. Sumber tunggal tab Detail, .txt, PDF. |
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
   `p`, `rows` (kv/check), `calc` (langkah **rumus → substitusi → hasil**, markup `_{}` `^{}` `rac{}{}`), `table`,
   `figure` (op berwarna `c: 'load' | 'v' | 'm' | …`). `useToolReport(id, report)` mendaftarkannya untuk tombol PDF;
   tab Detail = `<DetailTab report … />` (gating Premium di dalamnya).
4. **Tata letak tab Input**: `ToolLayout` — kiri kartu bernomor (`Card n={1} …`), kanan atas `Panel "Preview"`, kanan
   bawah `Panel "Diagram"` dengan `SubTabs` + `StatTiles` "Nilai maksimum". Halaman tidak di-scroll; kolom input
   scroll sendiri. ≤ 900 px kolom menumpuk.
5. **Kontrol**: `NumField` (label · input · satuan), `SelectField`, `Segmented`, `RowTable` (daftar beban/lapisan:
   tambah, edit langsung, hapus; kunci error `prefix.indeks.kolom`). Angka desimal boleh koma.
6. **Gambar**: SVG ukuran piksel nyata (`useSize`), warna dari token `--dg-*` (terang/gelap); diagram gaya dalam
   memakai `Curve`/`XAxis` dari `src/ui/diagram.tsx` (label ekstrem + bidik hover).
7. Angka hasil pakai `fx(n, dp)`; teks satuan dengan simbol Unicode (kN·m, cm⁴) — laporan .txt/PDF mengubahnya ke ASCII.
