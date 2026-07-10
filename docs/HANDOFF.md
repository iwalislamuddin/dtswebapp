# Handoff — EDFS Civil Tools

Ringkasan pengembangan sampai **rilis v0.1.0** (2026-07-10). Dokumen ini untuk melanjutkan
pekerjaan tanpa kehilangan konteks. Arsitektur teknis: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Apa yang sudah jadi

**Shell & infrastruktur**
- `index.html` + `assets/shell.js` — router hash-based, module loader (inject `<script>`, cache di memori),
  lifecycle `mount()`/`unmount()`, tema light/dark, sidebar **collapsible** (klik logo → rail 66px, persist di localStorage),
  modal **Tentang**.
- `core/ui-kit.js` — `toast()`, **form generator** (`buildForm`), result builder (`hero/kv/note`), `disposeObject()`,
  serta **helper kanvas seragam** `canvasCap(host)` (judul kiri-atas dinamis, `.set()`) & `canvasTip(ctx,opts)`
  (pill hover ber-posisi aman: turun ke bawah kursor bila dekat atas, clamp ke tepi). **Semua tool kanvas wajib pakai
  keduanya** — mencegah tumpukan teks di pita atas. CSS `.cap` global di `shell.css` (`max-width:58%` + ellipsis).
- `core/canvas2d.js` — kanvas 2D hi-DPI, auto-resize (ResizeObserver), **redraw sinkron** (bukan rAF, agar
  tidak macet di tab background), **repaint otomatis saat tema berganti** (MutationObserver `data-theme`), `destroy()`.
- `core/report.js` — laporan monospace gaya DOS → **PDF buatan tangan** (font bawaan `/Courier`, tanpa library,
  ASCII-only agar offset xref akurat) atau `.txt`; fallback ke teks bila PDF gagal.
- `core/steel-profiles.js` — **library database profil baja** (global `window.SteelProfiles`, juga di `runtime.steel`).
  Dipakai bersama semua tool baja. 7 tipe / ±138 ukuran: **WF** (17, JIS G3192), **UNP** (13, DIN 1026),
  **Siku L** (21, JIS G3192) — nilai **tabel**; **SHS** (29), **RHS** (25), **Pipa** (30), **CNP** (13) — **dihitung
  dari geometri** (Pipa eksak; SHS/RHS sudut tajam; CNP metode garis-tengah/linear AISI). API: `types`, `list(type)`,
  `get(type,name)`, `typeInfo`, `AgMm2`, `rminMm`, `tGov`, `build.*`. Satuan simpan: mm · cm² · kg/m · cm⁴ · cm · cm³.
  ⚠️ Nilai hollow/CNP idealisasi sudut tajam (≈2–5% > tabel pabrikan ber-radius) — flag verifikasi otomatis muncul di hasil.
- PWA: `manifest.json` + `sw.js` (cache-first, precache shell+core, runtime-cache modul). **Versi cache: `civil-tools-v14`.**
  (`steel-profiles.js` ditambahkan ke precache & dimuat di `index.html` sebelum `module-registry.js`.)

**Brand EDFS** (palet dari `D:\Downloads\dtsapp.pdf`)
- Orange `#F28F3B` (aksen) · Olive `#566246` · Sage `#A4C2A5` · Sky `#30BCED` · Ink `#050401`.
- Dark & light theme di CSS variables `assets/shell.css`. Variabel `--amber*` = aksen orange (dipertahankan namanya).
- Logo hexagon `favicon/edfs-mark.svg` (header/favicon) + `favicon/edfs-icon.svg` (maskable).
  ⚠️ **Rekonstruksi geometris** brand-colored, bukan vektor resmi — bila ada SVG resmi, timpa `edfs-mark.svg`.
- Nama app: **"EDFS Civil Tools"**, tagline "Alat Bantu Rekayasa Sipil". Nama Edifisia/DTS hanya di modal Tentang
  (kredit: "Iwal | Edifisia | DTS Engineering").

**Tool #1 — Panjang Penyaluran Tulangan Tarik** (`modules/development-length/`)
- SNI 2847:2019 Ps. 25.4.2.4a (bentuk SI): `ld = fy·ψt·ψe·ψs·ψg / (1.1·λ·√f'c·((cb+Ktr)/db)) · db`.
- Batasan: √f'c ≤ 8.3; (cb+Ktr)/db ≤ 2.5; ψt·ψe ≤ 1.7; ld ≥ 300 mm.
- **Ulir (D10–D36)** dan **Polos (Ø8,10,12,16,19)**. Polos = pendekatan konservatif **ld = 2.0 × ld ulir setara**
  dengan peringatan eksplisit (SNI mensyaratkan kait standar untuk polos — ini bukan rumus resmi polos lurus).
- Diagram kanvas 2D live (batang tertanam; ulir ber-ulir, polos mulus), hover readout, panel hasil, tombol
  **Download PDF / Teks**.

**Tool #2 — Kapasitas Lentur Balok φMn** (`modules/beam-flexure/`)
- SNI 2847:2019 — balok persegi bertulangan **tunggal & rangkap**, blok tegangan persegi ekuivalen.
- β1 (Ps. 22.2.2.4.3), φ dari regangan tarik neto εt (Ps. 21.2.2, sengkang ikat 0,65–0,90), As,min (Ps. 9.6.1.2),
  batas daktilitas εt ≥ 0,004 (Ps. 9.3.3.1).
- **Kesetimbangan gaya diselesaikan umum via bisection** dengan fs = min(fy, Es·0,003·(d−c)/c) dan
  fs' = min(fy, …·(c−d')/c) → benar untuk under- maupun **over-reinforced** (tul. tarik tak leleh) tunggal/rangkap.
  Bukan sekadar rumus As·fy — divalidasi vs hitung tangan (3D19→φMn 132,6 kN·m; 8D25 over→φ 0,65 getas).
- **Multi-lapis tulangan tarik** (1–3 lapis): gaya tarik dipusatkan di **centroid grup** → tinggi efektif `d`,
  sedangkan **εt dihitung di baja tarik terluar `dt`** (lapis terbawah). Sebaran batang: sisa ditaruh di lapis bawah.
- **Selimut samping** diterapkan (inset batang = cc+sengkang+db/2) → hitung **spasi bersih horizontal** & **peringatan**
  bila < maks(25 mm, db) (Ps. 25.2.1); spasi antar-lapis (Ps. 25.2.2) via input `sv` (default 25 mm, muncul saat >1 lapis).
- Diagram kanvas 2D: penampang + blok tegangan `a` (arsir) + sumbu netral `c` (putus-putus) + **diagram regangan**
  (segitiga εcu 0,003 → εt di `dt`), tiap lapis batang digambar di kedalamannya, **dimensi `b` di bawah** (tak berdempet
  judul), `d`/`h` di kiri, readout φMn, hover klasifikasi. Download PDF/Teks (ASCII-only tervalidasi).
- Asumsi: penampang persegi, Es = 200.000 MPa, perpindahan beton oleh baja tekan diabaikan, batang tersebar merata
  per lapis, spasi min mengabaikan syarat 4/3·ukuran agregat.

**Tool #3 — Batang Tarik Baja** (`modules/steel-tension/`)
- SNI 1729:2020 (adopsi AISC 360-16), **DFBK & ASD** sekaligus. Dua keadaan batas:
  leleh bruto `Pn=Fy·Ag` (φ=0,90 / Ω=1,67) vs fraktur neto efektif `Pn=Fu·Ae`, `Ae=U·An` (φ=0,75 / Ω=2,00).
  φPn/Pa desain = keadaan batas terkecil; keadaan menentukan ditandai.
- Luas neto baut: `An=Ag−Σ(dh·t)`, `dh=db+kelonggaran` (default 2 mm), tebal berlubang auto dari `SP.tGov`
  (WF/UNP→tf, siku/hollow→t). Las/tanpa lubang → An=Ag. **Shear lag U** preset (1,0/0,90/0,85/0,80/0,70) + manual.
- Kelangsingan `L/rmin ≤ 300` (rekomendasi). Rasio D/C opsional: input Pu (DFBK) dan/atau Pa (ASD).
- Profil dipilih dari **library** (`runtime.steel`): dropdown tipe → ukuran (repopulasi dinamis, tampil kg/m).
  Mutu baja preset (BJ37/41/50/55, SS400, A36, A572, A992, custom) auto-isi Fy/Fu.
- Kanvas 2D: **penampang tergambar to-scale per shape** (I/C/L/box/pipa, bibir CNP), marker lubang baut skematik,
  dimensi b/h/D; **bar perbandingan keadaan batas** (leleh vs fraktur, yg menentukan di-amber) + garis demand Pu.
  Hover → φPn & keadaan menentukan. Download PDF/Teks (ASCII-only tervalidasi: 0 byte non-ASCII).
- **TIDAK termasuk**: blok geser (block shear), koreksi zig-zag s²/4g, batas 0,85Ag pelat sambung, desain sambungan.
  Divalidasi vs hitung tangan (WF400×200 BJ37, 2×Ø18 di tf13, U=1 → φPn 1817,0 kN leleh; Pipa Ø114,3×6 → Ag 2041 mm² eksak).

**Tool #4 — Batang Tekan Baja** (`modules/steel-compression/`)
- SNI 1729:2020 (adopsi AISC 360-16) **Bab E — tekuk lentur**, DFBK & ASD sekaligus. `Pn=Fcr·Ag`;
  `Fe=π²E/(KL/r)²`; bila `KL/r ≤ 4,71√(E/Fy)` (↔ Fy/Fe≤2,25) → `Fcr=0,658^(Fy/Fe)·Fy` (inelastis),
  selain itu `Fcr=0,877·Fe` (elastis). φc=0,90 / Ωc=1,67; E=200.000 MPa tetap.
- **Dua sumbu**: `KLx/rx` & `KLy/ry` dari `rx=ix·10`, `ry=iy·10` (library); KL/r menentukan = **maksimum**,
  sumbu penentu ditandai. K preset (Tabel C-A-7.1: 1,0 / 0,65 / 0,80 / 1,2 / 2,0 / 2,1) + manual. `KL/r ≤ 200` (rekomendasi).
- **Tekuk torsi (Ps. E4-2)** — **DIIMPLEMENTASI untuk WF** (dwi-simetris terbuka): `Fe=[π²ECw/(Kz·Lz)²+GJ]/(Ix+Iy)`,
  lalu `Fcr` dari `Fe` (pers. E3). `J=⅓·[2·bf·tf³+(d−2tf)·tw³]` (thin-wall **tanpa fillet → konservatif**),
  `Cw=Iy·(d−tf)²/4`, `G=77.200 MPa`. **`Pn=min(lentur, torsi)`**. Input tambahan `Kz`,`Lz` (muncul hanya utk WF).
  Torsi biasanya menentukan bila **Lz > Ly** (mis. kolom dg pengaku sumbu lemah di tengah, puntir tak terkekang penuh).
  **SHS/RHS/Pipa** (tertutup) **dikecualikan** dari E4 (J besar). **UNP/Siku/CNP** (tunggal/tak-simetris) → E4/E5 lentur-torsi
  **belum dihitung** (butuh pusat geser x0/y0, ro — belum ada di library); diberi peringatan "berpotensi tidak konservatif".
- **Cek elemen langsing** (Tabel B4.1a) per shape: sayap `0,56√(E/Fy)`, badan `1,49√(E/Fy)`, siku `0,45√(E/Fy)`,
  dinding box `1,40√(E/Fy)`, pipa `0,11·E/Fy`. Bila langsing → peringatan (**Ps. E7 luas efektif TIDAK diterapkan**).
- Kanvas: **penampang** (reuse drawer tarik; sumbu tekuk lentur ATAU simbol puntir bila E4 menentukan) + **kurva kolom**
  `Fcr vs KL/r` dengan **dua titik operasi** (E3 lentur & E4 torsi, keduanya jatuh di kurva; yg menentukan di-amber),
  transisi λ-batas, garis 200. Hover → φPn & keadaan batas. Download PDF/Teks (ASCII-only).
- **TIDAK termasuk**: lentur-torsi E4/E5 untuk UNP/Siku/CNP, reduksi elemen langsing (E7).
  Divalidasi vs hitung tangan (WF200×200×8×12 BJ37, K=1: L=3000 → KL/r 60, Fcr 200,1 MPa, φPn 1144,2 kN, **lentur E3**;
  L=9000 → KL/r 179, Fcr 53,9 MPa elastis, φPn 307,9 kN). **Torsi WF** divalidasi vs AISC: `Cw` cocok W8×31 (530 in⁶ ≈
  141.376 cm⁶), `J≈26 cm⁴`; kasus Ly=1500/Lz=6000 → **E4 menentukan** φPn 1092,6 kN < lentur 1290,2 kN.

## Keputusan penting (kenapa)

- **Tool pertama BUKAN Anchor Bolt Group** (walau dokumen asli menaruhnya pertama): butuh 3D + rumus ACI belum
  dikonfirmasi → berisiko meleset target rilis cepat. Diganti kalkulator non-3D rumus baku.
- **3 tier rendering** — jangan paksa Three.js untuk semua. Kanvas 2D interaktif jadi default (ringan, tak ada
  risiko konteks WebGL bocor).
- **PDF tanpa library** — konsisten dengan prinsip zero-build; font Courier bawaan PDF sudah cukup untuk look DOS.

## Gotchas / catatan operasional

- **Service worker cache**: setiap ubah file shell/core, **bump `CACHE` di `sw.js`** (mis. v7 → v8) agar SW purge
  cache lama. Saat testing, hard-reload (Ctrl+Shift+R) atau unregister SW.
- **PDF ASCII-only**: `report.js` mengandalkan panjang byte = panjang karakter untuk offset xref. Jangan masukkan
  non-ASCII ke stream; `module.js` `buildReport()` sudah mentransliterasi (ψ→psi, √→sqrt, ·→*, dst).
- **Kontrak module**: `unmount()` wajib membersihkan listener, `canvas2d.destroy()`, dan dispose Three.js (tool 3D).
  Sudah diuji: pindah antar tool berkali-kali → jumlah `<canvas>` tetap 1 (tidak bocor).
- Screenshot di preview harness kadang timeout; verifikasi banyak dilakukan via pixel-sampling/eval (bukan indikasi bug app).

## Langkah berikutnya

1. ~~**Tool #2** Kapasitas Balok φMn~~ ✅ · ~~**Tool #3** Batang Tarik Baja~~ ✅ · ~~**Tool #4** Batang Tekan Baja
   (SNI 1729 Bab E, tekuk lentur)~~ ✅ **SELESAI**.
   Kandidat tier-2 berikutnya di registry `coming-soon`: Daya Dukung Tiang (SNI 8460), Kombinasi Beban.
   **Library baja siap dipakai ulang** untuk seri baja lanjutan (Balok baja φMn — LTB pakai Zx/Sx yang sudah ada;
   Sambungan). Untuk melengkapi kolom: **E4-2 torsi WF sudah ada**; sisanya lentur-torsi E4/E5 untuk UNP/Siku/CNP
   (perlu tambah pusat geser x0/y0, ro, J, Cw ke `steel-profiles.js`) & reduksi elemen langsing (E7).
2. ✅ **Standarisasi kanvas terverifikasi live** — `steel-compression` (helper `canvasCap`/`canvasTip` yang sama)
   diuji reload-bersih di preview: `.cap` dinamis muncul & update, tanpa error konsol, penampang + kurva tergambar.
   Sisa konfirmasi visual `development-length`/`beam-flexure` bersifat kosmetik (wiring identik) — tak memblok.
2. **Fase 3**: `core/renderer.js` + `orbit-controls.js` (extract dari `staad-viewer.html`), lalu Anchor Bolt Group (3D).
3. Opsional: logo EDFS resmi (SVG), PNG favicon 192/512 untuk dukungan iOS, halaman kategori.

## Verifikasi rilis v0.1.0

Diuji di browser (server lokal): shell & routing, tema light/dark + repaint kanvas, kalkulasi ulir/polos
(D19→560 mm, Ø19 polos→1110 mm), diagram, dispose bersih, collapse+persist, modal Tentang, laporan teks & **PDF
tervalidasi struktur** (header/xref/EOF, 0 byte non-ASCII), PWA (SW active, manifest valid). Nol console error.
