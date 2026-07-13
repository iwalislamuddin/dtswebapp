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
  **Versi cache dinaikkan ke `civil-tools-v15`** saat menambah Tool #5 (registry di-precache, jadi bump wajib).
  **Versi cache dinaikkan ke `civil-tools-v16`** saat menambah Tool #6 (registry di-precache, jadi bump wajib).
  **Versi cache dinaikkan ke `civil-tools-v17`** saat menambah Tool #7 (registry di-precache, jadi bump wajib).
  **Versi cache dinaikkan ke `civil-tools-v18`** saat menambah Tool #8 (registry di-precache, jadi bump wajib).
  **Versi cache dinaikkan ke `civil-tools-v19`** saat menyambungkan ikon modul (shell.js diubah + 8 `icon.svg`
  ditambahkan ke precache — shell.js di-precache, jadi bump wajib).

**Ikon modul (icon.svg) — TERSAMBUNG** (2026-07-13)
- Sebelumnya tiap modul punya `icon.svg` tapi `shell.js` `iconMarkup()` mengabaikannya (selalu ikon generik).
- Sekarang `hydrateIcons()` di `shell.js` **fetch isi `m.icon` lalu inline-swap** ke placeholder tiap `.nav-item .ico`
  (di-cache di memori, gagal-diam ke ikon generik). **Inline SVG** dipilih (bukan `<img>`) agar `stroke="currentColor"`
  ikut tema. Placeholder generik dirender sinkron dulu (layout stabil), lalu di-swap async. Modul roadmap tanpa file
  (load-combo, anchor-bolt-group, _template) tetap pakai generik. Terverifikasi live: 8/8 ikon khusus ter-swap, 0 error.

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

**Tool #5 — Balok Baja (Lentur)** (`modules/steel-flexure/`)
- SNI 1729:2020 (adopsi AISC 360-16) **Bab F**, DFBK (φb=0,90) & ASD (Ωb=1,67). `Mn` → `φMn` / `Mn/Ω`.
- **F2/F3 — I dwi-simetris & KANAL, sumbu kuat**: leleh `Mp=Fy·Zx`; **LTB** `Lp=1,76·ry·√(E/Fy)`,
  `Lr` pers. F2-6, `Lb≤Lp→Mp`, inelastis linear (Cb), `Lb>Lr→Fcr·Sx` (pers. F2-4); **FLB** sayap non-kompak/langsing
  (F3). `Mn` sumbu kuat = min(LTB, FLB). **Cb** input (preset 1,0/1,14/1,32 + manual).
- **F6 — sumbu lemah I (WF)**: `Mn=min(Fy·Zy, 1,6Fy·Sy)` + FLB sayap; tanpa LTB. **F7 — HSS persegi
  (SHS/RHS/box)**: `Mp=Fy·Z`, tekuk lokal sayap (F7.2) & badan (F7.3), **LTB kotak (F7.4) hanya RHS sumbu
  kuat H>B** (SHS bujursangkar & sumbu lemah dikecualikan). **F8 — HSS bundar (Pipa)**: D/t kompak/non-kompak/langsing.
- **Zx/Zy WF & UNP DIHITUNG dari geometri** (tak ada di tabel library): `Zx=bf·tf·(d−tf)+tw·(d−2tf)²/4`,
  `Zy=tf·bf²/2+(d−2tf)·tw²/4`. **J & Cw dihitung** (J thin-wall tanpa fillet → konservatif; `Cw` WF=`Iy·ho²/4`,
  **kanal pakai rumus pendekatan** `Cw=(ho²bf³tf/12)·(3bf·tf+2ho·tw)/(6bf·tf+ho·tw)` + faktor `c=(ho/2)√(Iy/Cw)`).
  `rts=√(√(Iy·Cw)/Sx)`. **Klasifikasi kekompakan** sayap & badan otomatis (Tabel B4.1b, lentur).
- Kanvas: **penampang** (reuse drawer + sumbu lentur & arsir sayap tekan) + **kurva Mn–Lb** (plateau Mp→Lp,
  garis inelastis→Mr di Lr, ekor elastis, titik operasi Lb, garis Mu/φ) untuk kasus LTB; **bar kapasitas**
  (Mp/Mn/φMn/Mn·Ω + demand) untuk kasus tanpa LTB (sumbu lemah, pipa, SHS). Download PDF/Teks (ASCII-only).
- **TIDAK termasuk**: badan non-kompak/langsing penuh (F4/F5 Rpc/Rpg — hanya diperingatkan); **siku tunggal
  (F10) & penampang tak-simetris/CNP (F12)** → hanya **leleh elastis Mn=Fy·Sx indikatif** + peringatan
  "bukan desain akhir" (butuh sumbu utama & pusat geser, belum di library); geser (Bab G), lendutan, tekuk
  badan akibat beban terpusat. Sumbu lemah kanal (UNP) tak dihitung (asimetris → ditampilkan sumbu kuat).
- **Tervalidasi vs hitung tangan** (WF400×200×8×13 BJ37, Cb=1): `Zx`=1286 cm³, `Lp`=2307 mm, `Lr`=6866 mm,
  `Mp`=308,6 kN·m, `Mr`=199,9 kN·m; Lb=3000 (inelastis) → `Mn`=292,1 → **φMn 262,9 kN·m**; Lb=9000 (elastis)
  → φMn 122,0. Kurva Mn(Lb) kontinu di Lp & Lr. Semua tipe profil diuji live: WF x/y, UNP, SHS (leleh F7.1),
  RHS (LTB F7.4), Pipa (F8.1), Siku (F10* indikatif) — nol error konsol, kanvas tergambar (penampang+kurva).

**Tool #6 — Daya Dukung Tanah (Fondasi Dangkal)** (`modules/bearing-capacity/`) — kategori **Geoteknik** (tool geoteknik pertama)
- **TIGA METODE sekaligus** ditampilkan & dibandingkan: **Terzaghi (1943)**, **Meyerhof (1963)**, **Vesic (1973)**.
  Persamaan umum `qu = c·Nc·sc·dc + q·Nq·sq·dq + ½·γ·B·Nγ·sγ·dγ`; `q` = overburden efektif di dasar (dikoreksi MAT).
- **Faktor daya dukung**: Terzaghi `Nq = e^(2(3π/4−φ/2)tanφ)/(2cos²(45+φ/2))`, `Nc=(Nq−1)cotφ` (5,7 @ φ=0),
  **Nγ dari tabel Terzaghi general-shear (Bowles/Das) interpolasi log-linear**. Meyerhof/Vesic `Nq=e^(π tanφ)tan²(45+φ/2)`
  (Prandtl), `Nc=(Nq−1)cotφ` (5,14 @ φ=0); **Meyerhof Nγ=(Nq−1)tan(1,4φ)**, **Vesic Nγ=2(Nq+1)tanφ**.
- **Faktor bentuk & kedalaman**: Terzaghi via **koefisien** (strip 1/0,5 · bujur sangkar 1,3/0,4 · lingkaran 1,3/0,3 ·
  persegi `(1+0,3B/L)`/`(1−0,2B/L)·0,5`), **tanpa faktor kedalaman**. Meyerhof: `s,d` fungsi `Nφ=tan²(45+φ/2)` & `Df/B`
  (φ≥10 utk sq/sγ,dq,dγ). Vesic: bentuk Vesic (`sc=1+(Nq/Nc)B/L`, `sq=1+B/L·tanφ`, `sγ=1−0,4B/L≥0,6`) + **kedalaman Hansen**
  (`k=Df/B` bila ≤1, else `atan(Df/B)`). Bentuk: menerus / bujur sangkar / lingkaran / persegi panjang.
- **Koreksi muka air tanah (Das)**: 4 kasus (Dw≥Df+B tanpa efek · baji Df..Df+B γ efektif rata-rata · 0..Df berlapis,
  suku Nγ pakai γ′ · Dw≤0 seluruh γ′), `γ′=γsat−9,81`. **Keruntuhan lokal Terzaghi** (opsi): `c*=⅔c, tanφ*=⅔tanφ`
  (hanya Terzaghi). FS (default 3) → `q_izin=qu/FS` gross & net; input `q kerja` opsional → rasio D/C.
- Kanvas: **penampang fondasi to-scale** (permukaan tanah + arsir, telapak+kolom, beban P, garis MAT ▽ biru, baji
  keruntuhan skematik, dimensi B & Df, label q) + **bar perbandingan qu 3 metode** (metode utama di-amber, garis q_izin
  biru, garis q-kerja). Tabel perbandingan Nc/Nq/Nγ/qu/q_izin di panel hasil. Download PDF/Teks (ASCII-only tervalidasi).
- **Tervalidasi live vs hitung tangan** (bujur sangkar B=2, Df=1,5, c=10 kPa, φ=30°, γ=18, FS=3, tanpa air):
  Terzaghi Nc=37,2/Nq=22,5/Nγ=19,7 → **qu=1373 kPa** (q_izin 458); Meyerhof Nc=30,1/Nq=18,4/Nγ=15,7 → **qu=1752**
  (584); Vesic Nc=30,1/Nq=18,4/Nγ=22,4 → **qu=1826** (609) — semua faktor cocok nilai baku literatur. φ=0 (undrained):
  Nc 5,7/5,14, Nq=1, Nγ=0 (T 398 · M 382 · V 426). MAT Dw=0,5: q=19,2 kPa, γ_eff=10,2 (cocok). Report 60 baris 0 non-ASCII.
- **TIDAK termasuk**: beban **miring/eksentris** (faktor inklinasi ic/iq/iγ & eksentrisitas B′/L′), dasar/lereng miring,
  **penurunan (settlement)** — sering menentukan pada pasir/fondasi lebar, tanah berlapis, kompresibilitas/scale-effect
  Vesic penuh, fondasi dalam (Df/B>4 → peringatan). Verifikasi mis. **SNI 8460:2017**.

**Tool #7 — Penurunan Fondasi (Settlement)** (`modules/settlement/`) — kategori **Geoteknik** (pelengkap Tool #6)
- **DUA komponen** dihitung & ditampilkan bersama: penurunan **SEGERA/elastis (Se)** + penurunan **KONSOLIDASI primer (Sc)**;
  total `S = Se + Sc`. Plus **laju konsolidasi** (Terzaghi Tv–U) opsional → `St = Se + U·Sc`.
- **Segera (teori elastisitas, Das/Bowles)** — faktor pengaruh **Steinbrenner** `Is = F1 + (1−2μs)/(1−μs)·F2`
  (F1,F2 fungsi m'=L/B, n'=H/B'; A0/A1/A2 bentuk tertutup) → menangani **lapisan berhingga H** di bawah dasar.
  **Pusat** fondasi lentur via superposisi 4-kuadran `Se = 4·q0·(B/2)·(1−μs²)/Es·Is·If`; **sudut** `Se = q0·B·…·Is`;
  **rata-rata lentur ≈ 0,85·pusat**, **kaku ≈ 0,93·rata-rata ≈ 0,79·pusat`. Koreksi kedalaman **Fox If** (input,
  default 1,0 konservatif). Es input **MPa** (→ ×1000 kPa). Lingkaran → luas ekuivalen persegi (B=L=0,886·D).
  Segmen kekakuan lentur/kaku memilih Se yang masuk ke total.
- **Konsolidasi (e–log p)** — `Sc = C·H/(1+e0)·log10(σ'f/σ'0)` dengan **klasifikasi NC/OC** via σ'c: NC pakai Cc penuh;
  OC & σ'f≤σ'c pakai Cr; OC melewati σc → **dua tahap** (Cr sampai σc + Cc setelahnya). Tambahan tegangan **Δσ metode
  2:1** (persegi `q0BL/((B+z)(L+z))`, strip `q0B/(B+z)`) dengan **rata-rata Simpson** (atas + 4·tengah + bawah)/6
  di sepanjang lempung; σ'0 (efektif di tengah lempung) diinput langsung.
- **Laju konsolidasi** (Terzaghi 1-D) — `Tv=cv·t/Hdr²`, `Hdr=Hc` (drainase tunggal) / `Hc/2` (ganda); U≤60% `U=√(4Tv/π)`,
  U>60% `Tv=1,781−0,933·log10(100−U%)`; hitung **t50/t90** dan U pada waktu t. cv=0 → laju dilewati (anggap penuh).
- Kanvas: **profil tanah to-scale** (permukaan, fondasi+kolom di Df, **lapisan lempung ber-arsir** sage dengan dimensi Hc,
  **sebaran tegangan 2:1** garis putus, panah penurunan biru, dimensi B & Df, label q0) + **bar komponen penurunan**
  (Se biru · Sc sage · Total tumpuk Se+Sc di-amber · St(t)) dengan legenda & U% pada waktu t. Download PDF/Teks (ASCII-only).
- **Tervalidasi live vs hitung tangan** (bujur sangkar B=2, Df=1,5, q0=150 kPa; Es=10 MPa, μ=0,3, H=8 m, If=1;
  lempung z=3/Hc=4, e0=0,9, Cc=0,25, Cr=0,05, σ'0=60, σ'c=80; cv=1,5 m²/th, drainase ganda, t=3 th):
  **Is pusat 0,494 · Se pusat 26,95 mm**; Δσ atas/tengah/bawah 49,0/19,8/10,7 → **Δσ,avg 23,2 kPa**, σ'f 83,2, OC (OCR 1,33)
  → **Sc 22,02 mm** (dua tahap); **S_total 48,96 mm**; Tv 1,125 → **U 95,0 %**, t50 0,53 / t90 2,26 th, **St 47,85 mm**.
  Kasus NC (σ'c=60) → Sc melonjak **74,62 mm** (Cc penuh); strip → Se 41,3 mm (lebih besar); lingkaran → S 37,7 mm;
  kaku → 43,3 mm; cv=0 → laju tersembunyi. Report 0 byte non-ASCII. Nol console error; canvas tetap 1 saat pindah tool.
- **TIDAK termasuk**: pemampatan **sekunder (creep)**, lempung **berlapis banyak** (satu lapisan lempung), penurunan pasir
  metode **Schmertmann/N-SPT**, **Δσ Boussinesq penuh**, interaksi tanah–struktur. Verifikasi mis. **SNI 8460:2017**.

**Tool #8 — Daya Dukung Tiang Tunggal (Aksial)** (`modules/pile-capacity/`) — kategori **Geoteknik** (tiga tool geoteknik)
- **Profil tanah BERLAPIS** (editor kartu-lapis kustom, bukan `buildForm` — komponen tabel dinamis PERTAMA di app):
  tiap lapis punya jenis (lempung/pasir), tebal, γ, cu **atau** φ, N-SPT, dan **pilihan metode per-lapis** (statik / SPT).
  Tombol ＋ tambah / ✕ hapus lapis. Panel kiri pakai **`ck-layout wide-form`** (400px) agar muat.
- `Qu = Qp + Qs`; `Q_izin = Qu/FS` (opsi **kurangi berat sendiri** Wp = Ap·L·24). **Selimut per-lapis** dijumlah
  di zona tertanam (segmen dipotong di L): **lempung metode-α (API RP2A)** `fs=α·cu`,
  `α=0,5·ψ^-0,5 (ψ≤1)` / `0,5·ψ^-0,25 (ψ>1)`, ≤1, `ψ=cu/σ'v`; **pasir metode-β** `fs=K·σ'v·tanδ`,
  `K=cK·(1−sinφ)` (cK: bor 1,0 / pancang 1,4), `δ=cDelta·φ` (beton 0,8 / baja 0,6); **SPT Meyerhof** `fs=nf·N`
  (nf: bor 1 / pancang 2). fs dibatasi lunak 120 kPa (peringatan bila tercapai).
- **Ujung** di lapis tempat ujung tiang: lempung `qp=9·cu`; pasir `qp=σ'v·Nq` (Nq Prandtl, sama Tool #6) **dibatasi
  Meyerhof** `ql=0,5·pa·Nq·tanφ` (pa=100); SPT `qp=40·N·(L/D) ≤ 400N (pasir)/300N (lempung)`. `Qp=Ap·qp`.
- **σ'v efektif berlapis** dengan koreksi MAT (`γ'=γ−9,81` di bawah Dw, split di batas MAT). L>profil → ujung diklamp
  ke dasar profil + peringatan. **Cross-check Decourt-Quaresma** (bila SEMUA lapis tertanam punya N>0):
  `fs=10(Ns/3+1)`, `qp=C·Np` (C: lempung 120 / pasir 400) — pembanding empiris (α,β=1).
- Kanvas: **profil tanah berlapis to-scale** (lempung sage+arsir garis, pasir dotted), tiang tertanam, **panah selimut**
  amber (panjang ∝ fs) di kedua sisi per segmen, **panah ujung qp** biru, MAT ▽, beban kepala, dimensi L & D + label lapis;
  **bar Qs/Qp/Qu(tumpuk Qs+Qp)/Q_izin/Qu·DQ**. Download PDF/Teks (ASCII-only).
- **Tervalidasi live vs hitung tangan** (bulat D=0,4 m, L=12, pancang beton, Dw=2, FS=2,5; L1 lempung H4 γ17 cu40,
  L2 pasir H6 γ18 φ32, L3 pasir H8 γ19 φ36, semua statik): fs 19,2/23,0/33,9 kPa → **Qs 355,0**; ujung L3 pasir σ'v 115,9,
  Nq 37,8, ql 1371 → qp 1371 kPa, **Qp 172,3**; **Qu 527,4 → Q_izin 211 kN**. SPT di L3 → qp 14.000 kPa (cap 400N),
  selimut jadi 2N → **882 kN**; L=8 (ujung pindah L2) → **116 kN**; persegi Ap 0,16/perim 1,6; Decourt Ns 16,8, fs 66,1,
  Qp 1759, **Qu 2756**. Report 66 baris 0 non-ASCII; canvas tetap 1 (unmount ×3 bersih); repaint tema OK; nol console error.
- **TIDAK termasuk**: efisiensi **KELOMPOK** tiang, **gesekan negatif** (downdrag), beban **lateral & cabut** (uplift),
  **penurunan** tiang, tekuk, beban gempa. qp pasir statik memakai batas Meyerhof (konservatif) → wajar berbeda jauh dari
  Decourt (base tak-dibatasi); tampilkan rentang, gunakan penilaian teknik. Verifikasi mis. **SNI 8460:2017**.

## Keputusan penting (kenapa)

- **Tool pertama BUKAN Anchor Bolt Group** (walau dokumen asli menaruhnya pertama): butuh 3D + rumus ACI belum
  dikonfirmasi → berisiko meleset target rilis cepat. Diganti kalkulator non-3D rumus baku.
- **3 tier rendering** — jangan paksa Three.js untuk semua. Kanvas 2D interaktif jadi default (ringan, tak ada
  risiko konteks WebGL bocor).
- **PDF tanpa library** — konsisten dengan prinsip zero-build; font Courier bawaan PDF sudah cukup untuk look DOS.

## Gotchas / catatan operasional

- ⚠️ **PITA JUDUL `.cap` — JANGAN gambar apa pun di sana** (BUG BERULANG: kena di Tool #7 label q0 & Tool #8 label Q/D).
  `.cap` = div HTML overlay `position:absolute; left:14px; top:12px; font 10px` → menempati **band vertikal y≈0–28 px**
  dan **membentang horizontal sampai 58% lebar host**. Banyak modul menaruh sumbu elemen (fondasi/tiang) di tengah kiri,
  **di dalam** rentang horizontal itu → teks kanvas di y<~30 pasti menumpuk cap. **Aturan wajib tiap drawer profil**:
  (1) `padT ≥ 34` (Tool #7 pakai 60, Tool #8 pakai 64) sehingga permukaan tanah & semua anotasi turun di bawah band;
  (2) **panah beban + label nilai (Q/q0/P) & dimensi (D/B) digambar di y ≥ ~34**, geser ke SISI elemen (kiri/kanan telapak),
  bukan di puncak kanvas; (3) Q_izin/hasil sudah tampil di `.cap` + panel + hover `canvasTip` → **jangan** diulang sebagai
  teks statik di pita atas. **Verifikasi**: sampling `getImageData(0,0,splitX*dpr, 30*dpr)` di region PROFIL harus
  **0 piksel tercat** (bukan region bars — bars punya header sendiri). Uji di viewport lebar-normal, bukan yang kolaps.
- **Service worker cache**: setiap ubah file shell/core, **bump `CACHE` di `sw.js`** (mis. v7 → v8) agar SW purge
  cache lama. Saat testing, hard-reload (Ctrl+Shift+R) atau unregister SW.
- **PDF ASCII-only**: `report.js` mengandalkan panjang byte = panjang karakter untuk offset xref. Jangan masukkan
  non-ASCII ke stream; `module.js` `buildReport()` sudah mentransliterasi (ψ→psi, √→sqrt, ·→*, dst).
- **Kontrak module**: `unmount()` wajib membersihkan listener, `canvas2d.destroy()`, dan dispose Three.js (tool 3D).
  Sudah diuji: pindah antar tool berkali-kali → jumlah `<canvas>` tetap 1 (tidak bocor).
- Screenshot di preview harness kadang timeout; verifikasi banyak dilakukan via pixel-sampling/eval (bukan indikasi bug app).
- ⚠️ **SW + HTTP-cache death-loop saat testing** (2026-07-13, buang banyak langkah): `python http.server` **tidak kirim
  `Cache-Control`** → browser cache heuristik menahan file lama TANPA revalidasi, dan **SW cache-first meng-cache yang stale
  itu lalu terus di-serve** meski `caches.delete` + `unregister` (SW re-register tiap load dari `index.html`, controller
  balik `true`). Gejala: edit file benar di disk (cek `fetch(url+'?bust=')`) tapi `window.MODULE_REGISTRY` tetap versi lama.
  **Solusi paling andal: ganti PORT di `.claude/launch.json`** (mis. 5188→5199) lalu restart preview → **origin baru = tanpa
  SW & tanpa HTTP-cache**, dijamin fresh. (Port civil-tools sekarang **5199**.) Alternatif lemah `cache:'reload'`/hard-reload
  sering kalah oleh SW controller. Untuk user produksi tetap cukup **bump `CACHE`** — masalah ini khusus dev lokal.

## Tool #9 — Kombinasi Beban + handoff "kirim ke tool lain" ✅ SELESAI (2026-07-13)

**Status: terimplementasi & tervalidasi live.** `modules/load-combo/` (module.js + icon.svg), status `active`.
- Kombinasi **LRFD (Ps. 2.3.1)** & **ASD (Ps. 2.4.1)**, SNI 1727:2020 (ASCE 7-16). (Lr|R)=maks(Lr,R); W & E ±.
- Segment **Kuantitas** (Aksial/Momen/Geser → unit & tujuan handoff) + **Sistem** (LRFD/ASD) + opsi reduksi 0,5L.
- Output: hero beban terfaktor maks, **tabel semua kombinasi** (maks di-`ok`, min-negatif di-`bad` + ◄), kanvas
  **bar chart** (nol-axis, bar amber=maks, sky=min-uplift, sage=lainnya; hover `canvasTip`; **pita `.cap` 0 piksel** terverifikasi).
- **Handoff**: infra generik di shell (`runtime.handoff.send(targetId,payload,fromLabel)` → sessionStorage → hash) +
  `applyHandoff()` (baca `entry.accepts` registry + `window.CivilForms[id].applyInputs` → isi field + recompute + toast).
  `buildForm` argumen ke-4 `formId` mendaftarkan form. Tombol "Kirim ke…" dibangun dinamis dari registry (`accepts`).
  Retrofit penerima: `steel-tension`/`steel-compression` (`accepts:{axial:'Pu'}`), `steel-flexure` (`accepts:{moment:'Mu'}`).
- **Tervalidasi live vs hitung tangan**: default (D100,L80,LRFD,aksial) → 3 komb, maks **248 kN** (komb 2: 1,2·100+1,6·80). ✓
  Momen D50/L40/W200 → 8 komb, maks **300** (4+: 1,2·50+200+40), min **−155** (6−: 0,9·50−200) ditandai uplift. ✓
  W+E penuh (D120,L90,W150,E110) → **12 kombinasi**, maks 384. ASD → handoff nonaktif (catatan LRFD-only, 0 tombol). ✓
  Handoff klik: Pu=248 & Mu=300 terisi di tool tujuan + toast "diterima dari Kombinasi Beban" + sessionStorage terkonsumsi.
  Kanvas tetap 1 (unmount bersih ×4 navigasi); nol console error. **Versi cache SW dinaikkan ke `civil-tools-v20`**.

⚠️ **OPSI 2 masih DITUNDA** (lihat di bawah) — beam-flexure & geoteknik jadi penerima (butuh field demand + D/C).

### Rencana asli & arsitektur (disepakati 2026-07-13)

- **Tujuan**: jembatan hulu — hitung beban terfaktor (LRFD/kuat & ASD/layan, SNI 1727:2020 ≈ ASCE 7) dari beban
  layan D/L/Lr/R/W/E, tampilkan **tabel semua kombinasi** + tandai **kombinasi kritis** (maks & min utk uplift),
  lalu **kirim nilai puncak** ke tool lain sebagai input (Pu/Mu/…).
- **Arsitektur handoff (generik, future-proof)**:
  - **Pengirim (Tool #9) NOL edit ke depan** — ia hanya **baca registry**: cari modul yang punya `accepts` untuk
    kuantitas yang dihitung (mis. `axial`,`moment`), bangun menu "Kirim ke …" dinamis. Tool baru cukup deklarasi
    `accepts` di registry → otomatis muncul sebagai tujuan.
  - **Penerima butuh 2 penyesuaian kecil sekali-saja**: (1) `accepts:{axial:'Pu'}` di **registry entry**;
    (2) panggil `UI.buildForm(host, schema, onChange, ID)` — argumen ID ke-4 agar `buildForm` **mendaftarkan form ke
    `window.CivilForms[ID]`** sehingga shell bisa `setValue`+recompute setelah `mount()`. (buildForm tak memberi id/name
    ke input → DOM-scraping tak bisa, jadi registrasi form wajib.)
  - **Infra di shell + ui-kit** (sekali bangun): `runtime.handoff.send(targetId,payload)` simpan payload →
    `location.hash='#'+targetId`; shell saat mount cek payload + `registry.accepts` → isi field + `toast` "diterima dari
    Kombinasi Beban". Payload di sessionStorage (bertahan lintas reload PWA).
- **Scope retrofit awal = OPSI 1**: hanya **3 tool baja** yang sudah punya field beban terfaktor tunggal →
  `steel-tension` (`Pu`←axial), `steel-compression` (`Pu`←axial), `steel-flexure` (`Mu`←moment). Backward-compatible.
- ⏳ **OPSI 2 — DITUNDA (jangan lupa)**: agar **beam-flexure & tool geoteknik (pile/bearing)** bisa jadi penerima juga,
  perlu **tambah field beban demand + cek D/C** ke tool-tool itu dulu (sekarang capacity-only/ASD tanpa slot demand):
  beam-flexure ← `Mu` (bandingkan φMn), pile/bearing ← beban layan (bandingkan Q_izin/q_izin, jalur ASD).
  Begitu field demand ada, retrofit-nya identik pola Opsi 1 (accepts + buildForm ID). Kerjakan pada iterasi berikutnya.

## Infrastruktur 3D (Fase 3) — TERPASANG (2026-07-13)

**Tier-3 rendering akhirnya dibangun** (prasyarat tool 3D pertama). ⚠️ Catatan: `staad-viewer.html` &
`assets/three.min.js` **tidak ada di repo** (ada di PC) — jadi orbit-controls **ditulis dari nol**, bukan extract.
- `core/orbit-controls.js` (`window.CivilOrbit.create(camera, dom, opts)`) — orbit/pan/zoom kamera **tanpa
  dependensi addon** (Three.js r128 dari CDN tak memuat contoh OrbitControls). Mouse (drag=orbit, kanan/Shift=pan,
  roda=dolly) + sentuh (1 jari orbit, 2 jari pinch+pan), **damping/inersia**, spherical coords, `setView()`, `dispose()`.
- `core/renderer.js` (`window.CivilRenderer.get()`) — **factory WebGLRenderer BERSAMA (satu konteks WebGL untuk
  seluruh app)**; satu `<canvas>` dipindah antar tool 3D via `mount(container)`/`unmount()` → cegah kebocoran konteks
  (browser batasi jumlah konteks). Kelola `setSize`+`ResizeObserver` (`onResize` callback) & loop rAF (`start(fn)`/`stop()`).
  Renderer TIDAK di-dispose saat pindah tool — hanya scene/geometry/material milik module (pakai `UI.disposeObject`).
- **Wiring shell**: `runtime.getRenderer()` → `CivilRenderer.get()` (null bila WebGL gagal / core belum dimuat),
  `runtime.orbit` → `CivilOrbit`. `index.html` memuat kedua core sebelum `module-registry.js`; keduanya di-precache di `sw.js`.
- **Kontrak module 3D**: `meta.needsRenderer:true`. Di `mount`: `var R=runtime.getRenderer(); R.mount(view);
  R.onResize=…; controls=runtime.orbit.create(cam, R.canvas, …); R.start(()=>{controls.update(); R.renderer.render(scene,cam)})`.
  Di `unmount` **WAJIB**: lepas listener → `R.stop(); R.unmount()` (canvas dicopot, renderer tetap hidup) →
  `controls.dispose()` → `UI.disposeObject(scene)`. **Terverifikasi**: pindah antar tool ×N → `<canvas>` tetap 1 (tak bocor).
- **Versi cache SW**: dinaikkan **v20 → v24** (2 core baru precache), **→ v25** (module.js + registry seo geser),
  **→ v26** (registry status `active`).

## Tool #10 — Anchor Bolt Group (3D) ✅ SELESAI (2026-07-13)

**Modul 3D pertama** (Three.js/WebGL, tier-3). `modules/anchor-bolt-group/` (module.js + meta.json + icon.svg),
status **`active`**, kategori **Sambungan**. Grup baut angkur **cor-di-tempat (cast-in)** menahan **tarik + momen + geser**.
Referensi **ACI 318-19 Ch. 17** (adopsi **SNI 2847:2019 Ps. 17**), beton normal (λ=1).

- **Distribusi gaya baut ELASTIS pelat-kaku** (pendahuluan, bukan model bearing sumbu-netral):
  `Ti = Nu/n + Mx·xi/Σxi² + My·yi/Σyi²` (baut tarik/tekan; +tarik). `Tmax` untuk cek baja, `ΣTt` (baut tertarik) untuk breakout grup.
- **TARIK**: baja/angkur (17.6.1) `Nsa=Ase·futa` (φ=0,75); **breakout grup (17.6.2)** `Ncbg=(ANc/ANco)·ψec·ψed·ψc·ψcp·Nb`,
  `Nb=10·λ·√f'c·hef^1,5`, `ANco=9·hef²`; `ANc` proyeksi grup dibatasi 1,5hef & tepi `ca`; φ=0,70/0,75 (kondisi B/A).
  `ψec` dari eksentrisitas resultan tarik (dua arah), `ψed` tepi, `ψc` retak(1,0)/tak-retak(1,25).
- **GESER (17.7)**: baja `Vsa=0,6·Ase·futa` (×0,8 bila grout, φ=0,65), geser **dibagi rata Vu/n**;
  **breakout grup (17.7.2)** `Vcbg=(AVc/AVco)·ψec,V·ψed,V·ψc,V·ψh,V·Vb`,
  `Vb=min[0,66·(le/da)^0,2·√da·√f'c·ca1^1,5 ; 3,7·√f'c·ca1^1,5]`, `le=min(hef,8da)`, `AVco=4,5·ca1²`, **searah satu tepi ca1=ca**;
  **pryout (17.7.3)** `Vcpg=kcp·Ncbg0` (kcp 1,0 bila hef<65mm else 2,0; Ncbg0 = breakout tarik konsentris).
- **Interaksi tarik-geser (17.8)**: bila keduanya > utilisasi 0,2 → `(UN)^5/3 + (UV)^5/3 ≤ 1,0`. **Govern = maks(tarik, geser, interaksi)**.
- **Ase**: perkiraan `≈0,58·da²` (auto-isi saat `da` diubah; dapat ditimpa manual).
- **Visual 3D**: blok beton semi-transparan, pelat dasar, baut silinder + mur, **KERUCUT BREAKOUT** tiap angkur
  (apex di −hef, radius 1,5hef di permukaan) + lingkaran proyeksi; **overlap kerucut di-highlight** amber bila spasi<3hef
  (indikasi grup, sudah tercermin di ANc/ANco). **Vektor gaya**: tarik vertikal (merah, ∝T) + geser horizontal (biru, searah beban).
  Grid + sumbu; **orbit/pan/zoom + auto-fit + tombol reset**; **klik baut → inspektur** (gaya T, geser Vu/n, D/C baja tarik & geser).
  `rebuild()` tiap input berubah; **recolor saat tema berganti** (MutationObserver `data-theme`). Skala scene `S=0,01` (mm→unit).
- Laporan PDF/teks (ASCII-only; `tolatin` map ψ→psi, φ→phi, Σ→sum, ·→*, dst).
- **Tervalidasi live vs hitung tangan** (Chromium headless + WebGL SwiftShader; default 2×2, sx=sy=250, da24/Ase353,
  hef375, ca600, ha600, f'c25, futa400, Nu120, Mx20, Vu80 arah-X): Tmax **70,0 kN**, ΣTt 140; **tarik** φNsa 105,9 → D/C **0,66**,
  breakout φNcbg → D/C **0,45**; **geser** Vsa **84,7**/φVsa 55,1 → D/C 0,36, Vb **271,9** (min 2 pers.), φVcbg **159,3** → D/C 0,50,
  kcp 2, φVcpg **759,4** → D/C 0,11; **interaksi** UN 0,66/UV 0,50 → **0,82** ≤ 1 (menentukan). Nu=400 → 1,91 (NG, live).
  Dispose bersih (canvas tetap 1 setelah pindah tool & balik); nol console error.
- **TIDAK termasuk** (increment berikutnya): pecah sisi **side-face blowout (17.6.4)**, **tulangan angkur** (anchor reinf, 17.5.2.1),
  **angkur pasca-pasang** (post-installed — hanya cast-in), **eksentrisitas geser** (ψec,V=1), model **bearing sumbu-netral** pelat,
  pola baut **circular** (baru rectangular grid). Verifikasi mis. **ACI 318-19 / SNI 2847:2019** oleh insinyur penanggung jawab.

## Tool #11–#19 — Batch 9 modul + kategori Hidraulika & Hidrologi ✅ SELESAI (2026-07-14)

**Sembilan modul tier-2 (kanvas) sekaligus**, semua status `active`, dikerjakan di branch `claude/tools-batch-2`.
SW cache **v26 → v31** (bump per batch commit). Semua **tervalidasi live vs hitung tangan** (origin fresh port 5202,
pola port-bump untuk menghindari SW death-loop dev): nol console error, canvas tetap 1 setelah pindah 9 tool
berturut-turut (dispose bersih).

**#11 Sambungan Baut** (`bolt-connection`, Sambungan) — SNI 1729:2020 Ps. J3 DFBK. Geser (Fnv·Ab·m), tarik (Fnt·Ab),
kombinasi J3.7 (F'nt=1,3Fnt−Fnt/(φFnv)·frv, ambang 30%), tumpu/sobek J3.10 (1,2·lc·t·Fu ≤ 2,4·d·t·Fu; lc tepi/dalam;
dh=d+2/d+3). **Kapasitas grup geser = Σ min(geser, tumpu) per baut**. Mutu A325/8.8, A490/10.9 (N/X), A307, kustom.
Cek spasi 2,67d/3d & tepi Tabel J3.4M. `accepts:{shear:'Vu', axial:'Tu'}`. Kanvas: denah grup + bar keadaan batas.
Validasi: 2×2 M20 A325-N t10 → φrnv 87,7 / lc 29/48 / φRn grup 350,6 / D/C 0,43; Tu=200 → F'nt 540,7, D/C 0,39. ✓

**#12 Sambungan Las** (`weld-connection`, Sambungan) — Ps. J2/J4. Fillet Rn=0,6·FEXX·kd·β·Awe (Awe=0,707wL, φ=0,75),
kd=(1+0,5sin^1,5θ) opsional, β end-loaded Lw/w>100; logam dasar leleh (1,0·0,6FyAgv) vs fraktur (0,75·0,6FuAnv);
batas w min Tabel J2.4/maks t−2/panjang 4w. `accepts:{shear:'Ru'}`. Validasi: w6 L200 E70 → φRn 184,0 (las govern),
base 288/333; θ=90° → kd 1,5 → 276. ✓ BELUM: groove, grup eksentris (ICR), J2.4(c), fatik.

**#13 Beban Angin** (`wind-load`, Umum) — SNI 1727:2020 Bab 26–27 prosedur pengarah, SPGAU dinding, gedung tertutup kaku.
qz=0,613·Kz·Kzt·Kd·Ke·V² (Kz power-law B/C/D); windward +0,8 variasi z, leeward interp L/B (−0,5/−0,3/−0,2), samping −0,7;
GCpi ±0,18/±0,55/0; geser dasar integrasi 40 strip + momen guling; beban minimum 0,77 kPa (27.1.5). Kanvas: elevasi + profil
tekanan + panah leeward, hover z→Kz/qz/p. Validasi: V35 C H24 B30 L20 → Kh 1,204, qh 0,768, p_ww 0,384/0,661, F 554,6 kN. ✓
BELUM: atap (uplift), Gf fleksibel, K&K Bab 30, parapet. Jalankan 2 arah (tukar B↔L).

**#14 Daya Dukung CPT** (`cpt-bearing`, Geoteknik) — **input tabel CPT via TEXTAREA paste** (pola baru; parser
z-qc-[fs], kg/cm² ↔ MPa, 1 kg/cm²=98,0665 kPa, interpolasi linear + rata-rata jendela numerik). PASIR: Meyerhof 1956
(SI Bowles) q_izin NETO penurunan 25 mm (qc̄/15 · Kd atau (qc̄/25)((B+0,3)/B)²·Kd, Kd≤1,33); LEMPUNG: su=(qc̄−σv0)/Nk
(default 14) + Skempton 5·su·(1+0,2Df/B)(1+0,2B/L). qc̄ jendela Df..Df+B. Kanvas: profil qc-z + fondasi + arsir jendela.
Validasi: sampel B1,5 Df1 → qc̄ 14 kg/cm², Kd 1,22, qa 96 kPa; clay → su 96,9, qult 659, qa 220. ✓
BELUM: MAT otomatis (pakai γ efektif manual), CPTu qt, lapisan campuran.

**#15 Daya Dukung Tiang CPT** (`cpt-pile`, Geoteknik) — ujung **Schmertmann–Nottingham disederhanakan**
qp=(avg qc L..L+4D + avg L−8D..L)/2 (tanpa jalur-minimum); selimut fs kolom sondir ATAU Rf%·qc, cap 120 kPa,
Qs=∫fs·K·dz (200 strip); **Q_izin = Qp/3 + Qs/5** (praktik sondir Indonesia) + pembanding Qu/2,5. Kanvas: profil qc +
tiang + arsir jendela 8D/4D + bar Qs/Qp/Qu/Qall. Validasi: Ø0,4 L12 sampel → qc1 19,07/qc2 13,61/qp 16,34 MPa,
Qp 2053, Qs 1198 (capped), Q_izin 924 kN. ✓ BELUM: efisiensi kelompok, downdrag, LCPC kc/α, struktural tiang.

**#16 Diagram P–M Kolom** (`column-pm`, Beton Bertulang) — **DI-UPGRADE ke BIAKSIAL 3D pada v0.2.0** (tier-3 WebGL,
modul 3D kedua setelah anchor-bolt-group). SNI 2847:2019 kompatibilitas regangan dengan **SUMBU NETRAL MIRING**:
sapuan 48 sudut θ × 34 kedalaman c (log-spaced) → **permukaan interaksi P–Mx–My**. Blok tekan = poligon
penampang ∩ halfplane u≤β1·c (**clipping Sutherland–Hodgman** + shoelace centroid), Cc di centroid blok; baja per
BATANG (posisi x,y aktual) elastoplastis ±fy + koreksi beton terdesak; φ dari εt baja terjauh; plafon 0,80/0,85·Po.
**Cek biaksial = kontur beban EKSAK**: iris permukaan desain di P=Pu (interpolasi per meridian), D/C = |Mu|/|φMn|
pada arah β=atan2(Muy,Mux) — bukan pendekatan resiprokal Bresler. Visual 3D: mesh permukaan transparan +
meridian/paralel, sumbu P/Mx/My berwarna, grid di P=0, **cincin kontur iris di Pu** + titik demand merah + titik
kapasitas se-arah; orbit/zoom/pan + reset; recolor saat ganti tema; rebuild men-dispose bersih (geometri renderer
steady 29 setelah 5× rebuild). `accepts:{axial:'Pu', moment:'Mux'}`.
Validasi PRESISI (400×400 8D19 fc25 fy400 d'60): formulasi poligon mereproduksi uniaksial tervalidasi **persis** —
Balanced-X = Balanced-Y: cb 204 → **Pb 1462 & Mb 260** (cocok hitung tangan), M0x=M0y=142, Po 4259, φPn,maks 2215,
Pnt −907; iris Pu=1200 arah-x → |φMn| 160,1 → D/C 0,94; **biaksial** Mux150+Muy100 → |Mu| 180,3 @34°, kapasitas
se-arah 140,6 (kontur membulat < uniaksial 160 — perilaku benar) → D/C 1,28 NG. 4110 tri + 930 garis per frame;
nol console error; canvas tetap 1 saat pindah tool. ✓ BELUM: kelangsingan 6.6.4, Ps. 18, penampang non-persegi.
⚠️ Laporan mencantumkan sampel kontur kapasitas di P=Pu (bukan lagi sampel kurva 2D).

**#17 Debit Banjir Rasional** (`rational-method`, **Hidraulika & Hidrologi — kategori BARU**) — Q=0,00278·C·i·A;
tc Kirpich 0,0195L^0,77·S^−0,385 atau manual; i Mononobe (R24/24)(24/tc)^⅔; preset C tutupan lahan. Kanvas: kurva
intensitas + titik tc. Validasi: A10 C0,7 R24=120 L800 ΔH8 → tc 19,7 mnt, i 87,3, Q 1,699 m³/s. ✓
Peringatan batas metode (≤±80–300 ha), Mononobe = pendekatan bila IDF lokal tak ada.

**#18 Saluran Terbuka Manning** (`open-channel`, Hidraulika) — V=(1/n)R^⅔√S; persegi/trapesium/segitiga/**lingkaran
terisi sebagian** (gorong-gorong, relasi θ; kapasitas maks ≈0,94D; desain y/D≤0,8); mode y→Q dan **Q→y (bisection,
lingkaran dibatasi cabang naik)**; yc dari Q²T/gA³=1, Froude+rezim, cek V 0,6–3 m/s; preset n. Kanvas: potongan +
muka air + garis yc. Validasi: trap b1 m1,5 y0,8 n0,013 S0,001 → A 1,76/P 3,884/V 1,435/Q 2,526/Fr 0,637/yc 0,634;
lingkaran y/D 0,7 → A 0,5872/P 1,982/T 0,917 (eksak θ); inversi Q→y balik 0,800. ✓ BELUM: backwater, loncatan hidraulik.

**#19 Aliran Pipa** (`pipe-flow`, Hidraulika) — Darcy–Weisbach, f **Swamee–Jain** (laminar 64/Re; validitas
diperingatkan), minor ΣK·V²/2g, gradien m/km; **pembanding Hazen–Williams** SI dengan preset ε & C per material.
Kanvas: profil EGL/HGL. Validasi: Ø100 L200 Q10 L/s PVC → V 1,273/Re 1,27e5/f 0,01711/hf 2,83/HW 2,92 (+3,2%). ✓
BELUM: jaringan (Hardy-Cross), pompa, water hammer.

⚠️ Catatan pola baru batch ini: (1) **textarea paste** utk data tabular (cpt-bearing/cpt-pile) — disisipkan manual ke
grup form pertama, listener `input` di-remove di unmount; (2) kategori nav baru cukup lewat `category` di registry
(urutan = kemunculan pertama); (3) verifikasi dev pakai **bump port** launch.json (5188→5201→5202→5203) tiap kali
registry berubah — SW origin lama tetap menyajikan registry stale (gotcha lama, makin akut dengan banyak batch).

## Rilis v0.2.0 (2026-07-14) ✅

- **Versi**: `APP_VER = 'v0.2.0'` di SEMUA 19 module.js (footer laporan); modal Tentang di `index.html` →
  `v0.2.0` + **Catatan Rilis dalam kartu scrollable** (`.modal-relnotes`, max-height 230px, riwayat v0.2.0 & v0.1.0).
  CSS baru `.modal-relnotes`/`.rel-ver` di `shell.css`. **SW cache v32**.
- **Isi rilis**: 19 tool aktif / 6 kategori + infra 3D + handoff + path-routing SEO (ringkas di modal Tentang).
- Tool #16 di-upgrade biaksial 3D pada rilis ini (lihat blok #16 di atas).
- Verifikasi WebGL via `CivilRenderer.get().renderer.info` (readPixels selalu kosong — preserveDrawingBuffer false);
  screenshot harness kadang berhasil, jangan diandalkan.

## Langkah berikutnya

1. ~~**Tool #2** Kapasitas Balok φMn~~ ✅ · ~~**Tool #3** Batang Tarik Baja~~ ✅ · ~~**Tool #4** Batang Tekan Baja
   (SNI 1729 Bab E, tekuk lentur)~~ ✅ · ~~**Tool #5** Balok Baja / Lentur (SNI 1729 Bab F, LTB + tekuk lokal)~~ ✅ ·
   ~~**Tool #6** Daya Dukung Tanah / Fondasi Dangkal (Terzaghi, Meyerhof, Vesic)~~ ✅ ·
   ~~**Tool #7** Penurunan Fondasi / Settlement (elastis Steinbrenner + konsolidasi e–log p + laju Terzaghi)~~ ✅ ·
   ~~**Tool #8** Daya Dukung Tiang Tunggal (statik α/β berlapis + SPT Meyerhof + Decourt-Quaresma)~~ ✅ **SELESAI**.
   ~~**Tool #9** Kombinasi Beban (SNI 1727:2020 LRFD/ASD + handoff "kirim ke tool lain")~~ ✅ **SELESAI**.
   ~~**Tool #10** Anchor Bolt Group 3D (ACI 318-19 Ch.17 — tarik+geser+interaksi; infra Fase 3)~~ ✅ **SELESAI** (status `active`).
   ~~**Tool #11–#19** batch: Sambungan Baut/Las (J3/J2), Beban Angin (SNI 1727), CPT dangkal+tiang, Diagram P–M
   Kolom, kategori Hidraulika & Hidrologi (Rasional, Manning, Pipa)~~ ✅ **SELESAI** (2026-07-14, 9 modul aktif).
   Lanjutan wajar batch ini: geser eksentris baut (ICR) & blok geser J4.3, grup las eksentris, beban angin ATAP +
   K&K (Bab 30), kolom biaksial (Bresler) & kelangsingan (6.6.4), penurunan tiang dari CPT, kurva IDF dari data
   hujan (analisis frekuensi Gumbel/LP-III), HSS Nakayasu.
   Lanjutan Tool #10: side-face blowout, tulangan angkur, pola circular, eksentrisitas geser. Prioritas non-3D: **OPSI 2 handoff**
   (field demand + D/C untuk beam-flexure & geoteknik → jadi penerima Kombinasi Beban), geser balok baja (Bab G).
   **Melengkapi seri geoteknik** (Tool #6/#7/#8 siap dipakai ulang polanya): daya dukung dangkal + **eksentrisitas & beban
   miring** (faktor ic/iq/iγ, luas efektif B′×L′), **penurunan pasir** (Schmertmann/N-SPT — tabel-lapis dari Tool #8 dipakai
   ulang), pemampatan sekunder (creep), **efisiensi kelompok tiang** & gesekan negatif (pelengkap Tool #8).
   **Melengkapi seri baja** (library siap dipakai ulang): **Geser balok baja (Bab G)** — pelengkap alami Tool #5
   (butuh Aw, Cv, kn — bisa dari geometri); **Kombinasi lentur+aksial (Bab H)** menyatukan Tool #4 & #5;
   Sambungan (baut/las). Untuk menaikkan mutu Tool #5: badan non-kompak/langsing (F4/F5, Rpc/Rpg) & siku
   tunggal (F10)/tak-simetris (F12) — perlu tambah **Zx/Zy, J, Cw, pusat geser/sumbu utama** ke `steel-profiles.js`
   (saat ini Zx/Zy/J/Cw WF & UNP dihitung on-the-fly di module; sebaiknya dipindah ke library agar dipakai bersama).
2. ✅ **Standarisasi kanvas terverifikasi live** — `steel-compression` (helper `canvasCap`/`canvasTip` yang sama)
   diuji reload-bersih di preview: `.cap` dinamis muncul & update, tanpa error konsol, penampang + kurva tergambar.
   Sisa konfirmasi visual `development-length`/`beam-flexure` bersifat kosmetik (wiring identik) — tak memblok.
2. ~~**Fase 3**: `core/renderer.js` + `orbit-controls.js`, lalu Anchor Bolt Group (3D)~~ ✅ **SELESAI** (orbit-controls ditulis dari nol — `staad-viewer.html` tak ada di repo).
3. Opsional: logo EDFS resmi (SVG), PNG favicon 192/512 untuk dukungan iOS, halaman kategori.

## Verifikasi rilis v0.1.0

Diuji di browser (server lokal): shell & routing, tema light/dark + repaint kanvas, kalkulasi ulir/polos
(D19→560 mm, Ø19 polos→1110 mm), diagram, dispose bersih, collapse+persist, modal Tentang, laporan teks & **PDF
tervalidasi struktur** (header/xref/EOF, 0 byte non-ASCII), PWA (SW active, manifest valid). Nol console error.
