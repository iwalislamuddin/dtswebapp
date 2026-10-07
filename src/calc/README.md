# `src/calc` — mesin hitung Civil Tools

Perhitungan murni (TypeScript, tanpa DOM/React/kanvas) untuk semua tool. UI (Tahap 5) hanya memanggil fungsi di
sini; laporan (tab Detail & Download Report) dibangun dari hasilnya. Rencana: [docs/PLATFORM.md](../../docs/PLATFORM.md),
arah UI: [docs/UI.md](../../docs/UI.md).

## Struktur

| Lokasi | Isi |
|---|---|
| `shared/` | Rumus yang dipakai lebih dari satu tool — daftar & pemakainya di [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §A.2. Satu rumus = satu tempat. |
| `<tool-id>.ts` | Perhitungan satu tool: tipe input/hasil + `compute<Nama>()`. Nama file = id tool (= path URL). |
| `<tool-id>.test.ts` | Golden test + kasus hitung tangan. |
| `__golden__/<tool-id>.json` | Acuan dari build lama (jangan diedit tangan). |

## Aturan port dari `modules/<id>/module.js`

1. **Port 1:1 dulu.** Rumus, urutan operasi, cabang, pesan peringatan, dan bentuk hasil sama dengan `compute()` lama
   — golden test memastikannya (angka toleransi relatif 1e-9, teks persis). Perbaikan rumus atau perubahan
   perilaku dikerjakan **sesudahnya** sebagai commit terpisah yang memperbarui acuan golden secara sadar.
   Pengecualian yang boleh: bug keadaan global (mis. `ngTerz._cap` lama yang bocor antar panggilan) diganti fungsi
   murni, dan dua salinan yang sedikit berbeda disatukan ke `shared/` bila perbedaannya tidak memengaruhi hasil
   hitungan (mis. parser CPT). Catat di TODO bagian "Perbaikan isi tool".
2. **Rumus yang muncul di dua tool atau lebih → `shared/`**, lalu kedua tool memakainya.
3. Input menerima `NumLike` (angka atau teks form) dan di-parse dengan `num()` seperti build lama (`numFinite()`
   bila modul lama memakai `isFinite`).
4. Hasil selalu punya `valid` dan `warn`; field lain mengikuti hasil `compute()` lama (opsional saat tidak valid),
   bertipe lengkap — tanpa `[key: string]: unknown`.
5. Tanpa akses `window`, `document`, `sessionStorage`, atau waktu/acak — fungsi deterministik.

## Langkah per tool

```bash
# 1. tambahkan kasus di scripts/golden/cases.mjs (default form, kasus HANDOFF, tiap cabang, nilai tepat di
#    batas cabang, input tak valid). Fungsi selain compute: { fn }; data CPT: { $parse: [teks, satuan] }
npm run golden -- <tool-id>        # rekam acuan dari modul lama
# 2. tulis src/calc/<tool-id>.ts + <tool-id>.test.ts (pola bearing-capacity / pile-capacity)
npm test && npm run typecheck && npm run lint
```

Uji mutasi bila ragu: ubah satu konstanta di port, test harus gagal.

Acuan besar (> 500 KB, mis. permukaan interaksi P–M) ditulis ringkas dengan 12 digit signifikan. Kasus yang hanya
mengganti beban pada penampang yang sama boleh memakai `omit: ['surf']` agar data identik tidak disimpan ulang.
Bila modul lama crash pada suatu input, jangan rekam kasusnya: perbaiki di port, uji langsung, dan catat di TODO.

Harness memuat library inti (`core/steel-profiles.js`) ke sandbox dan mengisi variabel yang biasanya diisi
`mount()` (`SP`, `state.steel`). Library inti direkam dengan id `core:<nama>`. Modul yang membaca profil dari
state UI memakai `profile: [tipe, ukuran]` pada kasus — profil ikut direkam sebagai argumen terakhir.
