# Revisi isi tool & Library Data

Permintaan pemilik (2026-10-07). Dikerjakan **setelah semua tool di-port** ke `src/calc` (1:1, golden test) dan shell
React tersedia — lihat urutan di [TODO.md](TODO.md). Perhitungan lama yang sudah di-port menjadi bahan dasar;
perubahan angka dilakukan sadar dengan memperbarui acuan golden.

## 1. `shallow-foundation` (menggantikan `footing-design`)

Perhitungan & desain pondasi tapak dalam satu tool:

| Bagian | Isi | Bahan dari `src/calc` |
|---|---|---|
| Daya dukung tanah | qu/q_izin Terzaghi/Meyerhof/Vesic; parameter tanah diambil dari Library Data atau diisi langsung | `bearing-capacity.ts` (dipanggil langsung, bukan salin angka) |
| Tekanan dasar & stabilitas | tekanan sudut biaksial, kern/uplift, guling | `footing-design.ts` |
| Tahanan lateral (sliding) | gesekan dasar μ·N **+ adhesi & pasif** (sekarang hanya μ·N) | `footing-design.ts`, `shared/retaining.ts` (pola Pp) |
| Geser 1 & 2 arah | satu arah di d, pons di d/2 | `footing-design.ts`, `shared/concrete.ts` |
| Penulangan lentur | kantilever 2 arah, As,min, spasi | `footing-design.ts` |
| Settlement (opsional) | tab khusus di panel content; segera + konsolidasi | `settlement.ts` |

Catatan:
- "Terhubung ke tool Daya Dukung Tanah" diwujudkan dengan **memanggil fungsi hitung yang sama** di dalam tool ini
  (input tanah satu kali, hasil selalu konsisten), plus tautan "Buka rincian di Daya Dukung Tanah" yang membawa
  input yang sama. Tidak ada salin-tempel angka qa manual (opsi isi manual tetap ada).
- Tab content: `Input` · `Detail` · **`Settlement`** (muncul bila diaktifkan). Perlu penyesuaian kecil di
  [UI.md](UI.md) (tab ketiga opsional per tool).

## 2. `deep-foundation` (menggantikan `pile-cap`)

| Bagian | Isi | Bahan |
|---|---|---|
| Daya dukung aksial tiang tunggal | statik/SPT (profil berlapis) atau CPT | `pile-capacity.ts`, `cpt-pile.ts` |
| Kelompok tiang | efisiensi grup (mis. Converse-Labarre), blok keruntuhan lempung, reaksi tiang dari Pu+Mx+My | **baru** + `pile-cap.ts` (reaksi) |
| Lateral | Broms (kapasitas) & P-Y (defleksi/momen) | `lateral-broms.ts`, `py-analysis.ts` |
| Desain pile cap | lentur, geser 1 arah, pons kolom & tiang | `pile-cap.ts` |
| Settlement (opsional) | tab khusus; metode untuk kelompok tiang (mis. rakit ekuivalen di 2/3 L) | **baru** + `settlement.ts` |

Keputusan yang perlu diambil saat dikerjakan: susunan tiang tetap 2–6 (sekarang) atau grid bebas m×n; metode
efisiensi grup & settlement kelompok yang dipakai.

## 3. Tool lama setelah revisi

- `bearing-capacity`, `pile-capacity`, `cpt-pile`, `lateral-broms`, `py-analysis`, `settlement` **tetap ada**
  sebagai tool mandiri (berguna & terindeks sendiri).
- Slug lama `footing-design` dan `pile-cap`: **redirect 301** ke slug baru (`_redirects` Cloudflare Pages) agar
  tautan & indeks Google tidak putus; pekerjaan tersimpan (`tools.saved_works.tool_id`) dimigrasi bila sudah ada.
- `retaining-concrete`, `retaining-stone`: **tidak diubah** (keputusan pemilik).

## 4. Library Data (simpan data yang dipakai ulang)

Tujuan: data yang sama (tanah, sondir, N-SPT, material) tidak diinput berulang di tool berbeda.

**Keputusan pemilik (2026-10-07)**
- Istilah **"Library"** dipakai di semua bahasa (termasuk UI Bahasa Indonesia) — bukan "Pustaka".
- **Fitur Premium** (seperti Save). Free User tetap bisa melihat & menghapus item miliknya, seperti pekerjaan
  tersimpan; Guest tidak punya Library.
- **Tanpa pengelompokan proyek**: tiap item cukup **nama + deskripsi singkat** (nama proyek boleh ditulis di
  salah satunya).

**Penempatan**
- **Menu `File > Library Data…`** — dialog pengelola: daftar per jenis, cari, tambah/ubah/hapus/duplikat, impor
  (tempel dari Excel/CSV) & ekspor.
- **Di setiap kartu input yang relevan** — tombol `Library ▾`: *Ambil dari Library* / *Simpan ke Library*.
- `Setting` hanya untuk preferensi aplikasi (tema, satuan, format angka).

**Jenis data awal**

| Jenis | Isi | Dipakai oleh |
|---|---|---|
| Parameter tanah | γ, γsat, c, φ, cu, Es, μ, Cc/Cr/e0, cv | daya dukung, settlement, dinding penahan, shallow-foundation |
| Profil tanah berlapis | daftar lapis + MAT | pile-capacity, deep-foundation, (P-Y nanti) |
| Data sondir (CPT) | z–qc–fs + satuan | cpt-bearing, cpt-pile, deep-foundation |
| Data N-SPT | z–N | pile-capacity (SPT), deep-foundation |
| Material beton & tulangan | f'c, Ec, fy, fyt | tool beton, tapak, pile cap, dinding |
| Mutu baja | Fy, Fu | tool baja & sambungan |

**Penyimpanan**
- Tabel `tools.library_items` (id, user_id, kind, name, description, data jsonb, created_at/updated_at): RLS
  baca/hapus pemilik, tulis pemilik + `platform.has_premium()`, batas jumlah per user — pola `tools.saved_works`.
- Item disalin ke input tool saat diambil (bukan referensi hidup), sehingga pekerjaan tersimpan tidak ikut berubah.

**Hubungan dengan EDFS Matrix** (dicek 2026-10-07 di repo Matrix)
- Matrix punya **data referensi bawaan**, bukan library milik user: tabel profil baja JIS
  (`frontend/src/model/steel/jis.json` + `library.ts`, dibangun dari tabel standar oleh
  `tools/section_library/build_jis.py`, lihat `docs/SECTIONS.md` di repo Matrix) dan preset material
  (`model/materialPresets.ts`: mutu beton termasuk konversi K, BJ37/41/…).
- Rekomendasi: saat port kelompok baja, **pakai tabel JIS Matrix sebagai sumber** profil baja Civil Tools
  (nilai tabel standar, lebih akurat daripada `core/steel-profiles.js` yang sebagian dihitung dari geometri
  sudut tajam) — disalin dulu, kelak dijadikan paket bersama bila ada aplikasi ketiga. Angka tool baja akan
  bergeser sedikit → dikerjakan sebagai perubahan sadar (acuan golden diperbarui), bukan bagian port 1:1.
- Library Data milik user (tabel di atas) khusus Civil Tools dulu; bisa dinaikkan ke level platform bila Matrix
  kelak juga butuh.
