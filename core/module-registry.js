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
