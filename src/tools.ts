// Katalog tool Civil Tools untuk app baru (navigasi, routing /{id}, SEO).
// Diturunkan dari core/module-registry.js (2026-10-07). Perubahan terhadap registry lama:
//   - kategori "Umum" → "Pembebanan" (keputusan pemilik 2026-10-07);
//   - load-combo disembunyikan (akan dihapus atau diganti formatnya);
//   - kategori "Struktur Bawah" (pondasi tunggal & dinding penahan, dari Beton Bertulang/Geoteknik) dan
//     kategori "Sambungan" dihapus: baut, las, angkur → Baja; base-plate pindah ke EDFS Nexus (2026-10-07);
//   - icon/entry/accepts (khusus build lama & handoff Kombinasi Beban) tidak dibawa.
// Rencana revisi isi tool: docs/TOOL-REVISIONS.md.

/**
 * active = tampil; hidden = tidak tampil di navigasi; pending = belum di-port (tampil setelah port);
 * moved = pindah ke aplikasi lain (`movedTo`) — rutenya menampilkan tautan ke sana.
 */
export type ToolStatus = 'active' | 'hidden' | 'pending' | 'moved'

export interface ToolEntry {
  /** Slug URL (/{id}) = nama file perhitungan src/calc/{id}.ts. */
  id: string
  /** Label navigasi (boleh disingkat). */
  name: string
  category: ToolCategory
  status: ToolStatus
  /** Perhitungan sudah dipindah ke src/calc. */
  ported: boolean
  /** Slug pengganti setelah revisi isi (lama di-redirect 301). */
  plannedId?: string
  /** Aplikasi tujuan untuk status `moved`. */
  movedTo?: string
  /** <title> & meta description halaman tool. */
  seo: { title: string; desc: string }
}

/** Urutan kategori di navigasi. */
export const TOOL_CATEGORIES = ["Analisis Struktur","Beton Bertulang","Baja","Struktur Bawah","Geoteknik","Pembebanan","Hidraulika & Hidrologi"] as const

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]

export const TOOLS: ToolEntry[] = [
  {
    id: "portal-frame",
    name: "Analisis Portal",
    category: "Analisis Struktur",
    status: "active",
    ported: true,
    seo: {
      title: "Analisis Portal Sederhana — Reaksi, BMD, Geser & Aksial (Metode Kekakuan Matriks)",
      desc: "Analisis portal satu bentang–satu tingkat (2 kolom + 1 balok) metode kekakuan langsung rangka bidang: penampang baja (WF/UNP/SHS/RHS/Pipa) atau beton persegi untuk kolom & balok, beban gravitasi (berat sendiri + merata + terpusat) dan lateral, tumpuan sendi–sendi atau jepit–jepit. Menghasilkan reaksi, diagram momen (BMD), gaya lintang & aksial dengan nilai maks/min, deformasi terskala, plus laporan PDF/teks.",
    },
  },
  {
    id: "gable-frame",
    name: "Analisis Portal Gable",
    category: "Analisis Struktur",
    status: "active",
    ported: true,
    seo: {
      title: "Analisis Portal Gable (Rangka Atap Pelana) — Reaksi, BMD, Geser & Aksial (Metode Kekakuan Matriks)",
      desc: "Analisis portal gable satu bentang (2 kolom + 2 rafter miring bertemu di puncak) metode kekakuan langsung rangka bidang: penampang baja (WF/UNP/SHS/RHS/Pipa) untuk kolom & rafter, kemiringan atap α menentukan tinggi puncak, beban gravitasi atap (berat sendiri + merata proyeksi horizontal + terpusat) dan lateral, tumpuan sendi–sendi atau jepit–jepit. Menghasilkan reaksi, diagram momen (BMD), gaya lintang & aksial dengan nilai maks/min, deformasi terskala, plus laporan PDF/teks.",
    },
  },
  {
    id: "development-length",
    name: "Penyaluran Tul. Tarik",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Panjang Penyaluran Tulangan Tarik (SNI 2847:2019)",
      desc: "Hitung panjang penyaluran tulangan tarik (ld) batang ulir & polos sesuai SNI 2847:2019 Ps. 25.4.2, lengkap dengan diagram batang tertanam.",
    },
  },
  {
    id: "beam-flexure",
    name: "Kapasitas Balok (φMn)",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Kapasitas Lentur Balok Beton φMn (SNI 2847:2019)",
      desc: "Hitung kapasitas lentur balok beton bertulang (φMn) penampang persegi sesuai SNI 2847:2019 — cek rasio tulangan, daktilitas, dan diagram regangan.",
    },
  },
  {
    id: "column-pm",
    name: "Diagram P–M Kolom",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Diagram Interaksi P-M Kolom Beton — Persegi/Lingkaran/L/T Biaksial 3D (SNI 2847:2019)",
      desc: "Permukaan interaksi 3D aksial-momen dua arah (P-Mx-My) kolom beton bertulang — persegi, lingkaran, L, atau T — via kompatibilitas regangan sumbu netral miring: cek biaksial kontur beban eksak (bukan Bresler), plafon 0,80·Po, φ transisi, sesuai SNI 2847:2019.",
    },
  },
  {
    id: "continuous-beam",
    name: "Balok/Pelat Menerus",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Momen & Geser Balok / Pelat Satu Arah Menerus — Metode Koefisien (SNI 2847:2019 Ps. 6.5)",
      desc: "Hitung momen positif-negatif dan geser ultimit balok atau pelat satu arah menerus dengan metode koefisien SNI 2847:2019 Tabel 6.5.2 & 6.5.4 — berat sendiri otomatis, wu = 1,2D+1,6L, diagram momen interaktif, termasuk statika eksak untuk satu bentang.",
    },
  },
  {
    id: "min-reinforcement",
    name: "Tulangan Minimum",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Tulangan Minimum Beton — Balok, Kolom, Pelat, Pile Cap (SNI 2847:2019)",
      desc: "Hitung tulangan minimum SNI 2847:2019 dalam satu tool: As,min lentur & sengkang minimum balok, Ast 1% kolom persegi/lingkaran + spiral ρs, tulangan susut-suhu pelat, dan tulangan pile cap per meter — lengkap dengan jumlah batang, spasi, dan gambar penampang.",
    },
  },
  {
    id: "footing-design",
    name: "Desain Pondasi Tapak",
    category: "Struktur Bawah",
    status: "active",
    ported: true,
    plannedId: "shallow-foundation",
    seo: {
      title: "Desain Pondasi Tapak (Spread Footing) — Stabilitas, Penulangan & Geser Pons (SNI 2847:2019)",
      desc: "Desain pondasi telapak beban gabungan (aksial + geser + momen biaksial): stabilitas guling-geser-daya dukung, tekanan tanah sudut & eksentrisitas/kern, tulangan lentur dua arah (spasi kelipatan 25 mm), geser satu-arah & geser pons SNI 2847:2019, lengkap visual 3D distribusi tegangan tanah.",
    },
  },
  {
    id: "pile-cap",
    name: "Desain Pile Cap",
    category: "Struktur Bawah",
    status: "active",
    ported: true,
    plannedId: "deep-foundation",
    seo: {
      title: "Desain Pile Cap / Poer 2–6 Tiang — Lentur, Geser & Pons (SNI 2847:2019)",
      desc: "Desain poer/pile cap 2–6 tiang metode kaku SNI 2847:2019: reaksi tiang dari beban ultimate kolom (Pu) atau kapasitas tekan tiang (desain kapasitas), lentur di muka kolom, geser satu-arah, pons dua-arah kolom & pons tiang — lengkap denah interaktif dan rasio D/C.",
    },
  },
  {
    id: "two-way-slab",
    name: "Pelat Dua Arah",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Pelat Dua Arah — Penulangan & Lendutan Momen Inersia Efektif (SNI 2847:2019)",
      desc: "Desain pelat beton dua arah tertumpu 4 sisi metode jalur silang (Grashof–Marcus) dengan kondisi penjepitan per arah: pembagian beban, momen lapangan-tumpuan, penulangan dua arah (spasi kelipatan 25 mm), dan lendutan maksimum dengan momen inersia efektif (retak) Branson SNI 2847:2019 Ps. 24.2.3.5.",
    },
  },
  {
    id: "concrete-stair",
    name: "Desain Tangga Beton",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Desain Tangga Beton Bertulang — Rangka Bidang Matriks Kekakuan, Penulangan & Cek Lendutan (SNI 2847:2019)",
      desc: "Desain tangga beton bertulang dimodelkan sebagai rangka bidang menerus (bordes bawah L₁ – flight miring L₂/H – bordes atas L₃) dengan metode matriks kekakuan (elemen aksial+lentur, ≤4 simpul × 3 DOF): penampang beton persegi per meter (Ec=4700√f'c), beban flight per proyeksi horizontal diuraikan ke komponen batang miring sehingga gaya aksial/thrust & momen kink terhitung, tumpuan sendi/rol/jepit bebas di kedua ujung. Menghasilkan penulangan lentur lapangan & tumpuan, tulangan bagi, cek geser pelat φVc, serta lendutan seketika penampang utuh (Ig) vs retak (Ie Branson) dibanding L/360 & L/250 — lengkap diagram BMD/geser/aksial terlipat dan bentuk lendutan.",
    },
  },
  {
    id: "composite-slab",
    name: "Slab Komposit + Metal Deck",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Slab Beton Komposit di Atas Metal Deck (Bondek/Smartdek) — Konstruksi, Komposit, Tulangan & Shear Connector (SNI 2847:2019)",
      desc: "Desain slab beton komposit di atas metal deck dua tahap: tahap konstruksi dek sebagai bekisting (momen vs kapasitas pabrikan, lendutan beton basah ≤ L/180 ≤ 20 mm, opsi topangan sementara tengah bentang Le=L/2) dan tahap komposit (momen positif dek sebagai tulangan tarik Ase·fyd, tulangan negatif tumpuan menerus, tulangan susut-suhu, lendutan Ie retak Branson vs L/250 & L/360). Properti penampang dek dari tabel katalog Lysaght Bondek/Bondek II (re-entrant 54 mm, rusuk 200 mm) & Smartdek (profil W, cover 960 mm) — Ase, Ix, Zx, dcb, fy & massa per BMT. 1/2/≥3 bentang, opsi komposit/non-komposit, plus shear connector (stud headed atau tulangan ulir dilas) ke balok baja penumpu per SNI 1729:2020/AISC I8.",
    },
  },
  {
    id: "beam-shear-torsion",
    name: "Geser & Torsi Balok",
    category: "Beton Bertulang",
    status: "active",
    ported: true,
    seo: {
      title: "Geser & Torsi Balok Beton Bertulang — φVn, φTn, Sengkang Minimum & Rasio Kekuatan (SNI 2847:2019)",
      desc: "Cek kombinasi geser (Vu) + torsi (Tu) balok beton persegi bertulang sesuai SNI 2847:2019: kapasitas geser φ(Vc+Vs) dengan Vc = 0,17·λ·√f'c·bw·d & Vs = Av·fyt·d/s (batas Vs,maks 0,66√f'c·bw·d), torsi batas Tth yang boleh diabaikan, kapasitas torsi φTn = φ·2·Ao·At·fyt·cotθ/s (θ=45°, Ao=0,85·Aoh), cek kecukupan dimensi penampang solid Ps. 22.7.7.1, sengkang minimum gabungan (Av+2At)/s (Ps. 9.6.4.2), tulangan longitudinal torsi Al & Al,min (Ps. 9.6.4.3), spasi maksimum sengkang, plus rasio kekuatan D/C. Input dimensi, mutu material, sengkang tertutup (jumlah kaki), tulangan longitudinal & gaya dalam — lengkap diagram penampang, sengkang tertutup, aliran torsi, dan laporan PDF/teks.",
    },
  },
  {
    id: "steel-tension",
    name: "Batang Tarik Baja",
    category: "Baja",
    status: "active",
    ported: true,
    seo: {
      title: "Batang Tarik Baja (SNI 1729:2020)",
      desc: "Desain batang tarik baja: leleh penampang bruto & fraktur penampang neto efektif (Ae) sesuai SNI 1729:2020 (DFBK), lengkap dengan rasio D/C.",
    },
  },
  {
    id: "steel-compression",
    name: "Batang Tekan Baja",
    category: "Baja",
    status: "active",
    ported: true,
    seo: {
      title: "Batang Tekan Baja — Tekuk Lentur (SNI 1729:2020)",
      desc: "Hitung kapasitas tekan kolom/batang tekan baja terhadap tekuk lentur sesuai SNI 1729:2020 (DFBK), profil WF/HSS dengan panjang efektif KL.",
    },
  },
  {
    id: "steel-flexure",
    name: "Balok Baja (Lentur)",
    category: "Baja",
    status: "active",
    ported: true,
    seo: {
      title: "Balok Baja Lentur — LTB (SNI 1729:2020)",
      desc: "Desain balok baja lentur: momen nominal, cek tekuk torsi lateral (LTB) dan klasifikasi penampang kompak sesuai SNI 1729:2020 (DFBK).",
    },
  },
  {
    id: "steel-beam-analysis",
    name: "Analisis Balok Baja",
    category: "Baja",
    status: "active",
    ported: true,
    seo: {
      title: "Analisis Balok Baja Sederhana — Reaksi, SFD, BMD & Lendutan",
      desc: "Analisis statika balok baja di atas dua tumpuan (sendi–rol): reaksi, diagram gaya geser (SFD), momen lentur (BMD) dan lendutan. Beban merata/segitiga/trapesium (w1, w2, a1, a2) + hingga 4 beban terpusat, profil WF/UNP/CNP/RHS/SHS, lendutan via integrasi ganda M/EI, plus Mmaks, Vmaks, δmaks & rasio L/δ.",
    },
  },
  {
    id: "bearing-capacity",
    name: "Daya Dukung Tanah",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Daya Dukung Tanah Pondasi Dangkal (Terzaghi, Meyerhof, Vesic)",
      desc: "Hitung daya dukung tanah pondasi dangkal dengan metode Terzaghi, Meyerhof, dan Vesic — faktor bentuk, kedalaman, dan kemiringan beban.",
    },
  },
  {
    id: "settlement",
    name: "Penurunan Fondasi",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Penurunan Fondasi — Segera & Konsolidasi",
      desc: "Hitung penurunan fondasi: penurunan segera (elastis) dan konsolidasi primer tanah lempung, dihitung per lapisan tanah.",
    },
  },
  {
    id: "pile-capacity",
    name: "Daya Dukung Tiang",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Daya Dukung Tiang Tunggal (Aksial)",
      desc: "Hitung daya dukung aksial tiang tunggal (tahanan ujung + selimut) pada profil tanah berlapis, untuk kondisi tekan maupun tarik.",
    },
  },
  {
    id: "cpt-bearing",
    name: "Daya Dukung CPT",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Daya Dukung Fondasi Dangkal dari CPT/Sondir",
      desc: "Hitung daya dukung izin fondasi dangkal langsung dari data sondir (qc): metode Meyerhof untuk pasir (penurunan 25 mm) dan su dari qc + Skempton untuk lempung — tempel data z–qc dari Excel.",
    },
  },
  {
    id: "cpt-pile",
    name: "Daya Dukung Tiang (CPT)",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Daya Dukung Tiang dari CPT/Sondir (Schmertmann)",
      desc: "Kapasitas aksial tiang tunggal dari data sondir: tahanan ujung Schmertmann (rata-rata 4D/8D) + selimut dari fs sondir atau rasio gesek, Q izin = Qp/3 + Qs/5 sesuai praktik sondir Indonesia.",
    },
  },
  {
    id: "lateral-broms",
    name: "Lateral Tiang — Broms",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Kapasitas Lateral Tiang — Metode Broms (Lempung & Pasir)",
      desc: "Hitung kapasitas lateral ultimit tiang tunggal dengan metode Broms 1964: tanah lempung (9·cu·D) & pasir (3·Kp·γ'·z·D), kepala bebas/jepit, klasifikasi tiang pendek (kegagalan tanah) vs panjang (leleh lentur), momen maksimum, dan diagram tekanan tanah interaktif.",
    },
  },
  {
    id: "py-analysis",
    name: "Analisis P-Y",
    category: "Geoteknik",
    status: "active",
    ported: true,
    seo: {
      title: "Analisis P-Y Tiang Dibebani Lateral — Beda Hingga (Matlock & API)",
      desc: "Analisis tiang dibebani lateral metode kurva p-y (beam on nonlinear Winkler) dengan beda hingga: kurva Matlock lempung lunak & API pasir, kepala bebas/jepit, profil defleksi & momen sepanjang tiang, dan kurva beban–defleksi kepala (H–y0).",
    },
  },
  {
    id: "retaining-stone",
    name: "DPT Batu Kali",
    category: "Struktur Bawah",
    status: "active",
    ported: true,
    seo: {
      title: "Dinding Penahan Tanah Batu Kali (Gravitasi) — Stabilitas & Volume",
      desc: "Desain DPT pasangan batu kali tipe gravitasi: badan trapesium siku-siku (sisi tegak atau miring ke tanah) + tapak persegi, tekanan aktif Rankine (lereng β & beban merata), cek guling, geser, daya dukung (e, qmax/qmin) dan volume pasangan — lengkap potongan interaktif.",
    },
  },
  {
    id: "retaining-concrete",
    name: "DPT Beton Kantilever",
    category: "Struktur Bawah",
    status: "active",
    ported: true,
    seo: {
      title: "Dinding Penahan Tanah Beton Kantilever — Stabilitas, Penulangan & BOQ (SNI 2847:2019)",
      desc: "Desain DPT beton bertulang kantilever: stem trapesium siku-siku, tapak toe/heel bebas menjorok, stabilitas guling-geser-daya dukung, tumpuan terfaktor 1,2D+1,6H+1,6L → tulangan stem/toe/heel per SNI 2847:2019, plus BOQ beton, estimasi besi & bekisting.",
    },
  },
  {
    id: "load-combo",
    name: "Kombinasi Beban",
    category: "Pembebanan",
    status: "hidden",
    ported: false,
    seo: {
      title: "Kombinasi Beban SNI 1727:2020 (LRFD/DFBK)",
      desc: "Bangun kombinasi beban ultimit & layan sesuai SNI 1727:2020 (LRFD/DFBK) dan kirim beban terfaktor langsung ke tool desain baja.",
    },
  },
  {
    id: "anchor-bolt-group",
    name: "Anchor Bolt Group",
    category: "Baja",
    status: "pending",
    ported: false,
    seo: {
      title: "Anchor Bolt Group — Tarik, Geser & Interaksi (ACI 318-19 / SNI 2847:2019)",
      desc: "Cek grup baut angkur cor-di-tempat terhadap tarik & geser: baja + breakout beton grup + pryout + interaksi tarik-geser sesuai ACI 318-19 Ch. 17 (SNI 2847:2019 Ps. 17), dengan visual 3D kerucut breakout interaktif.",
    },
  },
  {
    id: "base-plate",
    name: "Base Plate & Anchor",
    category: "Baja",
    status: "moved",
    movedTo: "EDFS Nexus",
    ported: true,
    seo: {
      title: "Base Plate & Anchor Rod Kolom Baja — Tumpu, Tebal Pelat & Tarik Angkur (AISC Design Guide 1)",
      desc: "Desain pelat landas (base plate) & angkur kolom baja satu sistem: tumpu beton (AISC 360-22 J8 / ACI 318-19), tebal pelat leleh lentur, rezim konsentrik / momen kecil / momen besar (e vs ecrit) dengan gaya tarik angkur, dan geser dasar gesekan — metode Drake & Elkin (AISC Design Guide 1, 2nd Ed.), lengkap elevasi blok tumpu & denah interaktif.",
    },
  },
  {
    id: "wind-load",
    name: "Beban Angin",
    category: "Pembebanan",
    status: "active",
    ported: true,
    seo: {
      title: "Beban Angin Gedung — Prosedur Pengarah (SNI 1727:2020)",
      desc: "Hitung tekanan angin desain dinding SPGAU/MWFRS gedung tertutup kaku: qz, Kz eksposur B/C/D, tekanan windward/leeward/samping ± internal, dan geser dasar sesuai SNI 1727:2020 (ASCE 7-16).",
    },
  },
  {
    id: "bolt-connection",
    name: "Sambungan Baut",
    category: "Baja",
    status: "pending",
    ported: false,
    seo: {
      title: "Sambungan Baut — Geser, Tarik & Tumpu (SNI 1729:2020)",
      desc: "Cek sambungan baut tipe tumpu: kuat geser & tarik baut, kombinasi tarik-geser, dan tumpu/sobek lubang sesuai SNI 1729:2020 (AISC 360-16) Ps. J3 — mutu A325/A490/Gr.8.8/Gr.10.9.",
    },
  },
  {
    id: "weld-connection",
    name: "Sambungan Las",
    category: "Baja",
    status: "pending",
    ported: false,
    seo: {
      title: "Sambungan Las Sudut / Fillet (SNI 1729:2020)",
      desc: "Hitung kuat las sudut (fillet): throat efektif, faktor arah beban, reduksi las panjang, dan cek logam dasar sesuai SNI 1729:2020 (AISC 360-16) Ps. J2 & J4.",
    },
  },
  {
    id: "rational-method",
    name: "Debit Banjir Rasional",
    category: "Hidraulika & Hidrologi",
    status: "active",
    ported: true,
    seo: {
      title: "Debit Banjir Rencana — Metode Rasional (Kirpich + Mononobe)",
      desc: "Hitung debit puncak drainase kawasan: Q = 0,00278·C·i·A dengan waktu konsentrasi Kirpich dan intensitas hujan Mononobe dari hujan harian rencana R24.",
    },
  },
  {
    id: "open-channel",
    name: "Saluran Terbuka (Manning)",
    category: "Hidraulika & Hidrologi",
    status: "active",
    ported: true,
    seo: {
      title: "Desain Saluran Terbuka — Manning (Persegi/Trapesium/Lingkaran)",
      desc: "Kapasitas & kedalaman normal saluran drainase/irigasi dengan persamaan Manning — penampang persegi, trapesium, segitiga, dan gorong-gorong lingkaran terisi sebagian, lengkap kedalaman kritis & angka Froude.",
    },
  },
  {
    id: "pipe-flow",
    name: "Aliran Pipa (Tertutup)",
    category: "Hidraulika & Hidrologi",
    status: "active",
    ported: true,
    seo: {
      title: "Kehilangan Energi Pipa — Darcy-Weisbach & Hazen-Williams",
      desc: "Hitung kehilangan energi pipa bertekanan: faktor gesek Swamee-Jain (Colebrook), kehilangan minor ΣK, gradien hidraulik, dan pembanding Hazen-Williams untuk PVC/HDPE/baja/besi cor.",
    },
  },
]

/** Tool yang tampil di navigasi. */
export const visibleTools = (): ToolEntry[] => TOOLS.filter((t) => t.status === 'active')

/** Entri katalog untuk slug URL (termasuk hidden/pending/moved), atau undefined. */
export const toolById = (id: string): ToolEntry | undefined => TOOLS.find((t) => t.id === id)

/** Tool yang tampil, dikelompokkan per kategori sesuai urutan TOOL_CATEGORIES (kategori kosong dilewati). */
export function toolGroups(): { category: ToolCategory; tools: ToolEntry[] }[] {
  const tools = visibleTools()
  return TOOL_CATEGORIES.map((category) => ({ category, tools: tools.filter((t) => t.category === category) })).filter(
    (g) => g.tools.length > 0,
  )
}
