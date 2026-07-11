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
   (SNI 1729 Bab E, tekuk lentur)~~ ✅ · ~~**Tool #5** Balok Baja / Lentur (SNI 1729 Bab F, LTB + tekuk lokal)~~ ✅ ·
   ~~**Tool #6** Daya Dukung Tanah / Fondasi Dangkal (Terzaghi, Meyerhof, Vesic)~~ ✅ ·
   ~~**Tool #7** Penurunan Fondasi / Settlement (elastis Steinbrenner + konsolidasi e–log p + laju Terzaghi)~~ ✅ **SELESAI**.
   Kandidat tier-2 berikutnya di registry `coming-soon`: **Daya Dukung Tiang** (SNI 8460), **Kombinasi Beban**.
   **Melengkapi seri geoteknik** (Tool #6/#7 siap dipakai ulang polanya): daya dukung + **eksentrisitas & beban miring**
   (faktor ic/iq/iγ, luas efektif B′×L′), daya dukung tiang tunggal, penurunan pasir (Schmertmann/N-SPT), sekunder (creep).
   **Melengkapi seri baja** (library siap dipakai ulang): **Geser balok baja (Bab G)** — pelengkap alami Tool #5
   (butuh Aw, Cv, kn — bisa dari geometri); **Kombinasi lentur+aksial (Bab H)** menyatukan Tool #4 & #5;
   Sambungan (baut/las). Untuk menaikkan mutu Tool #5: badan non-kompak/langsing (F4/F5, Rpc/Rpg) & siku
   tunggal (F10)/tak-simetris (F12) — perlu tambah **Zx/Zy, J, Cw, pusat geser/sumbu utama** ke `steel-profiles.js`
   (saat ini Zx/Zy/J/Cw WF & UNP dihitung on-the-fly di module; sebaiknya dipindah ke library agar dipakai bersama).
2. ✅ **Standarisasi kanvas terverifikasi live** — `steel-compression` (helper `canvasCap`/`canvasTip` yang sama)
   diuji reload-bersih di preview: `.cap` dinamis muncul & update, tanpa error konsol, penampang + kurva tergambar.
   Sisa konfirmasi visual `development-length`/`beam-flexure` bersifat kosmetik (wiring identik) — tak memblok.
2. **Fase 3**: `core/renderer.js` + `orbit-controls.js` (extract dari `staad-viewer.html`), lalu Anchor Bolt Group (3D).
3. Opsional: logo EDFS resmi (SVG), PNG favicon 192/512 untuk dukungan iOS, halaman kategori.

## Verifikasi rilis v0.1.0

Diuji di browser (server lokal): shell & routing, tema light/dark + repaint kanvas, kalkulasi ulir/polos
(D19→560 mm, Ø19 polos→1110 mm), diagram, dispose bersih, collapse+persist, modal Tentang, laporan teks & **PDF
tervalidasi struktur** (header/xref/EOF, 0 byte non-ASCII), PWA (SW active, manifest valid). Nol console error.
