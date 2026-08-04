/* ============================================================
   Civil Tools — core/module-registry.js
   SATU-SATUNYA file yang diedit saat menambah tool baru.
   Tambah 1 entry di sini + buat folder di /modules/{id}/.
   status: 'active' | 'beta' | 'coming-soon'

   seo: { title, desc } — dipakai shell untuk <title>, meta description,
   canonical, dan Open Graph saat tool dibuka (URL /{id}). Wajib diisi
   untuk tool 'active' agar terindeks Google dengan baik. 'name' tetap
   dipakai untuk label nav (boleh disingkat), 'seo.title' untuk mesin cari.
   ============================================================ */
window.MODULE_REGISTRY = [
  {
    id: 'portal-frame',
    name: 'Analisis Portal',
    category: 'Analisis Struktur',
    icon: 'modules/portal-frame/icon.svg',
    entry: 'modules/portal-frame/module.js',
    status: 'active',
    seo: {
      title: 'Analisis Portal Sederhana — Reaksi, BMD, Geser & Aksial (Metode Kekakuan Matriks)',
      desc: 'Analisis portal satu bentang–satu tingkat (2 kolom + 1 balok) metode kekakuan langsung rangka bidang: penampang baja (WF/UNP/SHS/RHS/Pipa) atau beton persegi untuk kolom & balok, beban gravitasi (berat sendiri + merata + terpusat) dan lateral, tumpuan sendi–sendi atau jepit–jepit. Menghasilkan reaksi, diagram momen (BMD), gaya lintang & aksial dengan nilai maks/min, deformasi terskala, plus laporan PDF/teks.'
    }
  },

  {
    id: 'development-length',
    name: 'Penyaluran Tul. Tarik',
    category: 'Beton Bertulang',
    icon: 'modules/development-length/icon.svg',
    entry: 'modules/development-length/module.js',
    status: 'active',
    seo: {
      title: 'Panjang Penyaluran Tulangan Tarik (SNI 2847:2019)',
      desc: 'Hitung panjang penyaluran tulangan tarik (ld) batang ulir & polos sesuai SNI 2847:2019 Ps. 25.4.2, lengkap dengan diagram batang tertanam.'
    }
  },

  {
    id: 'beam-flexure',
    name: 'Kapasitas Balok (φMn)',
    category: 'Beton Bertulang',
    icon: 'modules/beam-flexure/icon.svg',
    entry: 'modules/beam-flexure/module.js',
    status: 'active',
    seo: {
      title: 'Kapasitas Lentur Balok Beton φMn (SNI 2847:2019)',
      desc: 'Hitung kapasitas lentur balok beton bertulang (φMn) penampang persegi sesuai SNI 2847:2019 — cek rasio tulangan, daktilitas, dan diagram regangan.'
    }
  },

  {
    id: 'column-pm',
    name: 'Diagram P–M Kolom',
    category: 'Beton Bertulang',
    icon: 'modules/column-pm/icon.svg',
    entry: 'modules/column-pm/module.js',
    accepts: { axial: 'Pu', moment: 'Mux' },  // terima beban terfaktor dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Diagram Interaksi P-M Kolom Beton — Biaksial 3D (SNI 2847:2019)',
      desc: 'Permukaan interaksi 3D aksial-momen dua arah (P-Mx-My) kolom beton bertulang persegi via kompatibilitas regangan sumbu netral miring: cek biaksial kontur beban eksak (bukan Bresler), plafon 0,80·Po, φ transisi, sesuai SNI 2847:2019.'
    }
  },

  {
    id: 'continuous-beam',
    name: 'Balok/Pelat Menerus',
    category: 'Beton Bertulang',
    icon: 'modules/continuous-beam/icon.svg',
    entry: 'modules/continuous-beam/module.js',
    status: 'active',
    seo: {
      title: 'Momen & Geser Balok / Pelat Satu Arah Menerus — Metode Koefisien (SNI 2847:2019 Ps. 6.5)',
      desc: 'Hitung momen positif-negatif dan geser ultimit balok atau pelat satu arah menerus dengan metode koefisien SNI 2847:2019 Tabel 6.5.2 & 6.5.4 — berat sendiri otomatis, wu = 1,2D+1,6L, diagram momen interaktif, termasuk statika eksak untuk satu bentang.'
    }
  },

  {
    id: 'min-reinforcement',
    name: 'Tulangan Minimum',
    category: 'Beton Bertulang',
    icon: 'modules/min-reinforcement/icon.svg',
    entry: 'modules/min-reinforcement/module.js',
    status: 'active',
    seo: {
      title: 'Tulangan Minimum Beton — Balok, Kolom, Pelat, Pile Cap (SNI 2847:2019)',
      desc: 'Hitung tulangan minimum SNI 2847:2019 dalam satu tool: As,min lentur & sengkang minimum balok, Ast 1% kolom persegi/lingkaran + spiral ρs, tulangan susut-suhu pelat, dan tulangan pile cap per meter — lengkap dengan jumlah batang, spasi, dan gambar penampang.'
    }
  },

  {
    id: 'pile-cap',
    name: 'Desain Pile Cap',
    category: 'Beton Bertulang',
    icon: 'modules/pile-cap/icon.svg',
    entry: 'modules/pile-cap/module.js',
    accepts: { axial: 'Pu' },  // terima Pu terfaktor dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Desain Pile Cap / Poer 2–6 Tiang — Lentur, Geser & Pons (SNI 2847:2019)',
      desc: 'Desain poer/pile cap 2–6 tiang metode kaku SNI 2847:2019: reaksi tiang dari beban ultimate kolom (Pu) atau kapasitas tekan tiang (desain kapasitas), lentur di muka kolom, geser satu-arah, pons dua-arah kolom & pons tiang — lengkap denah interaktif dan rasio D/C.'
    }
  },

  {
    id: 'footing-design',
    name: 'Desain Pondasi Tapak',
    category: 'Beton Bertulang',
    icon: 'modules/footing-design/icon.svg',
    entry: 'modules/footing-design/module.js',
    accepts: { axial: 'P', moment: 'Mx' },  // terima beban dari tool lain bila tersedia
    status: 'active',
    seo: {
      title: 'Desain Pondasi Tapak (Spread Footing) — Stabilitas, Penulangan & Geser Pons (SNI 2847:2019)',
      desc: 'Desain pondasi telapak beban gabungan (aksial + geser + momen biaksial): stabilitas guling-geser-daya dukung, tekanan tanah sudut & eksentrisitas/kern, tulangan lentur dua arah (spasi kelipatan 25 mm), geser satu-arah & geser pons SNI 2847:2019, lengkap visual 3D distribusi tegangan tanah.'
    }
  },

  {
    id: 'two-way-slab',
    name: 'Pelat Dua Arah',
    category: 'Beton Bertulang',
    icon: 'modules/two-way-slab/icon.svg',
    entry: 'modules/two-way-slab/module.js',
    status: 'active',
    seo: {
      title: 'Pelat Dua Arah — Penulangan & Lendutan Momen Inersia Efektif (SNI 2847:2019)',
      desc: 'Desain pelat beton dua arah tertumpu 4 sisi metode jalur silang (Grashof–Marcus) dengan kondisi penjepitan per arah: pembagian beban, momen lapangan-tumpuan, penulangan dua arah (spasi kelipatan 25 mm), dan lendutan maksimum dengan momen inersia efektif (retak) Branson SNI 2847:2019 Ps. 24.2.3.5.'
    }
  },

  {
    id: 'steel-tension',
    name: 'Batang Tarik Baja',
    category: 'Baja',
    icon: 'modules/steel-tension/icon.svg',
    entry: 'modules/steel-tension/module.js',
    accepts: { axial: 'Pu' },     // terima beban aksial terfaktor (DFBK) dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Batang Tarik Baja (SNI 1729:2020)',
      desc: 'Desain batang tarik baja: leleh penampang bruto & fraktur penampang neto efektif (Ae) sesuai SNI 1729:2020 (DFBK), lengkap dengan rasio D/C.'
    }
  },

  {
    id: 'steel-compression',
    name: 'Batang Tekan Baja',
    category: 'Baja',
    icon: 'modules/steel-compression/icon.svg',
    entry: 'modules/steel-compression/module.js',
    accepts: { axial: 'Pu' },     // terima beban aksial terfaktor (DFBK) dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Batang Tekan Baja — Tekuk Lentur (SNI 1729:2020)',
      desc: 'Hitung kapasitas tekan kolom/batang tekan baja terhadap tekuk lentur sesuai SNI 1729:2020 (DFBK), profil WF/HSS dengan panjang efektif KL.'
    }
  },

  {
    id: 'steel-flexure',
    name: 'Balok Baja (Lentur)',
    category: 'Baja',
    icon: 'modules/steel-flexure/icon.svg',
    entry: 'modules/steel-flexure/module.js',
    accepts: { moment: 'Mu' },    // terima momen terfaktor (DFBK) dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Balok Baja Lentur — LTB (SNI 1729:2020)',
      desc: 'Desain balok baja lentur: momen nominal, cek tekuk torsi lateral (LTB) dan klasifikasi penampang kompak sesuai SNI 1729:2020 (DFBK).'
    }
  },

  {
    id: 'steel-beam-analysis',
    name: 'Analisis Balok Baja',
    category: 'Baja',
    icon: 'modules/steel-beam-analysis/icon.svg',
    entry: 'modules/steel-beam-analysis/module.js',
    status: 'active',
    seo: {
      title: 'Analisis Balok Baja Sederhana — Reaksi, SFD, BMD & Lendutan',
      desc: 'Analisis statika balok baja di atas dua tumpuan (sendi–rol): reaksi, diagram gaya geser (SFD), momen lentur (BMD) dan lendutan. Beban merata/segitiga/trapesium (w1, w2, a1, a2) + hingga 4 beban terpusat, profil WF/UNP/CNP/RHS/SHS, lendutan via integrasi ganda M/EI, plus Mmaks, Vmaks, δmaks & rasio L/δ.'
    }
  },

  {
    id: 'bearing-capacity',
    name: 'Daya Dukung Tanah',
    category: 'Geoteknik',
    icon: 'modules/bearing-capacity/icon.svg',
    entry: 'modules/bearing-capacity/module.js',
    status: 'active',
    seo: {
      title: 'Daya Dukung Tanah Pondasi Dangkal (Terzaghi, Meyerhof, Vesic)',
      desc: 'Hitung daya dukung tanah pondasi dangkal dengan metode Terzaghi, Meyerhof, dan Vesic — faktor bentuk, kedalaman, dan kemiringan beban.'
    }
  },

  {
    id: 'settlement',
    name: 'Penurunan Fondasi',
    category: 'Geoteknik',
    icon: 'modules/settlement/icon.svg',
    entry: 'modules/settlement/module.js',
    status: 'active',
    seo: {
      title: 'Penurunan Fondasi — Segera & Konsolidasi',
      desc: 'Hitung penurunan fondasi: penurunan segera (elastis) dan konsolidasi primer tanah lempung, dihitung per lapisan tanah.'
    }
  },

  {
    id: 'pile-capacity',
    name: 'Daya Dukung Tiang',
    category: 'Geoteknik',
    icon: 'modules/pile-capacity/icon.svg',
    entry: 'modules/pile-capacity/module.js',
    status: 'active',
    seo: {
      title: 'Daya Dukung Tiang Tunggal (Aksial)',
      desc: 'Hitung daya dukung aksial tiang tunggal (tahanan ujung + selimut) pada profil tanah berlapis, untuk kondisi tekan maupun tarik.'
    }
  },

  {
    id: 'cpt-bearing',
    name: 'Daya Dukung CPT',
    category: 'Geoteknik',
    icon: 'modules/cpt-bearing/icon.svg',
    entry: 'modules/cpt-bearing/module.js',
    status: 'active',
    seo: {
      title: 'Daya Dukung Fondasi Dangkal dari CPT/Sondir',
      desc: 'Hitung daya dukung izin fondasi dangkal langsung dari data sondir (qc): metode Meyerhof untuk pasir (penurunan 25 mm) dan su dari qc + Skempton untuk lempung — tempel data z–qc dari Excel.'
    }
  },

  {
    id: 'cpt-pile',
    name: 'Daya Dukung Tiang (CPT)',
    category: 'Geoteknik',
    icon: 'modules/cpt-pile/icon.svg',
    entry: 'modules/cpt-pile/module.js',
    status: 'active',
    seo: {
      title: 'Daya Dukung Tiang dari CPT/Sondir (Schmertmann)',
      desc: 'Kapasitas aksial tiang tunggal dari data sondir: tahanan ujung Schmertmann (rata-rata 4D/8D) + selimut dari fs sondir atau rasio gesek, Q izin = Qp/3 + Qs/5 sesuai praktik sondir Indonesia.'
    }
  },

  {
    id: 'lateral-broms',
    name: 'Lateral Tiang — Broms',
    category: 'Geoteknik',
    icon: 'modules/lateral-broms/icon.svg',
    entry: 'modules/lateral-broms/module.js',
    status: 'active',
    seo: {
      title: 'Kapasitas Lateral Tiang — Metode Broms (Lempung & Pasir)',
      desc: 'Hitung kapasitas lateral ultimit tiang tunggal dengan metode Broms 1964: tanah lempung (9·cu·D) & pasir (3·Kp·γ\'·z·D), kepala bebas/jepit, klasifikasi tiang pendek (kegagalan tanah) vs panjang (leleh lentur), momen maksimum, dan diagram tekanan tanah interaktif.'
    }
  },

  {
    id: 'py-analysis',
    name: 'Analisis P-Y',
    category: 'Geoteknik',
    icon: 'modules/py-analysis/icon.svg',
    entry: 'modules/py-analysis/module.js',
    status: 'active',
    seo: {
      title: 'Analisis P-Y Tiang Dibebani Lateral — Beda Hingga (Matlock & API)',
      desc: 'Analisis tiang dibebani lateral metode kurva p-y (beam on nonlinear Winkler) dengan beda hingga: kurva Matlock lempung lunak & API pasir, kepala bebas/jepit, profil defleksi & momen sepanjang tiang, dan kurva beban–defleksi kepala (H–y0).'
    }
  },

  {
    id: 'retaining-stone',
    name: 'DPT Batu Kali',
    category: 'Geoteknik',
    icon: 'modules/retaining-stone/icon.svg',
    entry: 'modules/retaining-stone/module.js',
    status: 'active',
    seo: {
      title: 'Dinding Penahan Tanah Batu Kali (Gravitasi) — Stabilitas & Volume',
      desc: 'Desain DPT pasangan batu kali tipe gravitasi: badan trapesium siku-siku (sisi tegak atau miring ke tanah) + tapak persegi, tekanan aktif Rankine (lereng β & beban merata), cek guling, geser, daya dukung (e, qmax/qmin) dan volume pasangan — lengkap potongan interaktif.'
    }
  },

  {
    id: 'retaining-concrete',
    name: 'DPT Beton Kantilever',
    category: 'Geoteknik',
    icon: 'modules/retaining-concrete/icon.svg',
    entry: 'modules/retaining-concrete/module.js',
    status: 'active',
    seo: {
      title: 'Dinding Penahan Tanah Beton Kantilever — Stabilitas, Penulangan & BOQ (SNI 2847:2019)',
      desc: 'Desain DPT beton bertulang kantilever: stem trapesium siku-siku, tapak toe/heel bebas menjorok, stabilitas guling-geser-daya dukung, tumpuan terfaktor 1,2D+1,6H+1,6L → tulangan stem/toe/heel per SNI 2847:2019, plus BOQ beton, estimasi besi & bekisting.'
    }
  },

  {
    id: 'load-combo',
    name: 'Kombinasi Beban',
    category: 'Umum',
    icon: 'modules/load-combo/icon.svg',
    entry: 'modules/load-combo/module.js',
    status: 'active',
    seo: {
      title: 'Kombinasi Beban SNI 1727:2020 (LRFD/DFBK)',
      desc: 'Bangun kombinasi beban ultimit & layan sesuai SNI 1727:2020 (LRFD/DFBK) dan kirim beban terfaktor langsung ke tool desain baja.'
    }
  },

  {
    id: 'anchor-bolt-group',
    name: 'Anchor Bolt Group',
    category: 'Sambungan',
    icon: 'modules/anchor-bolt-group/icon.svg',
    entry: 'modules/anchor-bolt-group/module.js',
    status: 'active',
    seo: {
      title: 'Anchor Bolt Group — Tarik, Geser & Interaksi (ACI 318-19 / SNI 2847:2019)',
      desc: 'Cek grup baut angkur cor-di-tempat terhadap tarik & geser: baja + breakout beton grup + pryout + interaksi tarik-geser sesuai ACI 318-19 Ch. 17 (SNI 2847:2019 Ps. 17), dengan visual 3D kerucut breakout interaktif.'
    }
  },

  {
    id: 'base-plate',
    name: 'Base Plate & Anchor',
    category: 'Sambungan',
    icon: 'modules/base-plate/icon.svg',
    entry: 'modules/base-plate/module.js',
    accepts: { axial: 'Pu', moment: 'Mu' },  // terima Pu & Mu terfaktor dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Base Plate & Anchor Rod Kolom Baja — Tumpu, Tebal Pelat & Tarik Angkur (AISC Design Guide 1)',
      desc: 'Desain pelat landas (base plate) & angkur kolom baja satu sistem: tumpu beton (AISC 360-22 J8 / ACI 318-19), tebal pelat leleh lentur, rezim konsentrik / momen kecil / momen besar (e vs ecrit) dengan gaya tarik angkur, dan geser dasar gesekan — metode Drake & Elkin (AISC Design Guide 1, 2nd Ed.), lengkap elevasi blok tumpu & denah interaktif.'
    }
  },

  {
    id: 'wind-load',
    name: 'Beban Angin',
    category: 'Umum',
    icon: 'modules/wind-load/icon.svg',
    entry: 'modules/wind-load/module.js',
    status: 'active',
    seo: {
      title: 'Beban Angin Gedung — Prosedur Pengarah (SNI 1727:2020)',
      desc: 'Hitung tekanan angin desain dinding SPGAU/MWFRS gedung tertutup kaku: qz, Kz eksposur B/C/D, tekanan windward/leeward/samping ± internal, dan geser dasar sesuai SNI 1727:2020 (ASCE 7-16).'
    }
  },

  {
    id: 'bolt-connection',
    name: 'Sambungan Baut',
    category: 'Sambungan',
    icon: 'modules/bolt-connection/icon.svg',
    entry: 'modules/bolt-connection/module.js',
    accepts: { shear: 'Vu', axial: 'Tu' },   // terima geser/tarik terfaktor dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Sambungan Baut — Geser, Tarik & Tumpu (SNI 1729:2020)',
      desc: 'Cek sambungan baut tipe tumpu: kuat geser & tarik baut, kombinasi tarik-geser, dan tumpu/sobek lubang sesuai SNI 1729:2020 (AISC 360-16) Ps. J3 — mutu A325/A490/Gr.8.8/Gr.10.9.'
    }
  },

  {
    id: 'weld-connection',
    name: 'Sambungan Las',
    category: 'Sambungan',
    icon: 'modules/weld-connection/icon.svg',
    entry: 'modules/weld-connection/module.js',
    accepts: { shear: 'Ru' },                // terima beban terfaktor dari Kombinasi Beban
    status: 'active',
    seo: {
      title: 'Sambungan Las Sudut / Fillet (SNI 1729:2020)',
      desc: 'Hitung kuat las sudut (fillet): throat efektif, faktor arah beban, reduksi las panjang, dan cek logam dasar sesuai SNI 1729:2020 (AISC 360-16) Ps. J2 & J4.'
    }
  },

  {
    id: 'rational-method',
    name: 'Debit Banjir Rasional',
    category: 'Hidraulika & Hidrologi',
    icon: 'modules/rational-method/icon.svg',
    entry: 'modules/rational-method/module.js',
    status: 'active',
    seo: {
      title: 'Debit Banjir Rencana — Metode Rasional (Kirpich + Mononobe)',
      desc: 'Hitung debit puncak drainase kawasan: Q = 0,00278·C·i·A dengan waktu konsentrasi Kirpich dan intensitas hujan Mononobe dari hujan harian rencana R24.'
    }
  },

  {
    id: 'open-channel',
    name: 'Saluran Terbuka (Manning)',
    category: 'Hidraulika & Hidrologi',
    icon: 'modules/open-channel/icon.svg',
    entry: 'modules/open-channel/module.js',
    status: 'active',
    seo: {
      title: 'Desain Saluran Terbuka — Manning (Persegi/Trapesium/Lingkaran)',
      desc: 'Kapasitas & kedalaman normal saluran drainase/irigasi dengan persamaan Manning — penampang persegi, trapesium, segitiga, dan gorong-gorong lingkaran terisi sebagian, lengkap kedalaman kritis & angka Froude.'
    }
  },

  {
    id: 'pipe-flow',
    name: 'Aliran Pipa (Tertutup)',
    category: 'Hidraulika & Hidrologi',
    icon: 'modules/pipe-flow/icon.svg',
    entry: 'modules/pipe-flow/module.js',
    status: 'active',
    seo: {
      title: 'Kehilangan Energi Pipa — Darcy-Weisbach & Hazen-Williams',
      desc: 'Hitung kehilangan energi pipa bertekanan: faktor gesek Swamee-Jain (Colebrook), kehilangan minor ΣK, gradien hidraulik, dan pembanding Hazen-Williams untuk PVC/HDPE/baja/besi cor.'
    }
  },

  // --- Dev only: validasi kontrak mount/unmount ---
  {
    id: '_template',
    name: 'Template Demo',
    category: 'Dev',
    entry: 'modules/_template/module.js',
    status: 'beta'
  }
];
