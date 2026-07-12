/* ============================================================
   Civil Tools — core/module-registry.js
   SATU-SATUNYA file yang diedit saat menambah tool baru.
   Tambah 1 entry di sini + buat folder di /modules/{id}/.
   status: 'active' | 'beta' | 'coming-soon'
   ============================================================ */
window.MODULE_REGISTRY = [
  {
    id: 'development-length',
    name: 'Penyaluran Tul. Tarik',
    category: 'Beton Bertulang',
    icon: 'modules/development-length/icon.svg',
    entry: 'modules/development-length/module.js',
    status: 'active'
  },

  {
    id: 'beam-flexure',
    name: 'Kapasitas Balok (φMn)',
    category: 'Beton Bertulang',
    icon: 'modules/beam-flexure/icon.svg',
    entry: 'modules/beam-flexure/module.js',
    status: 'active'
  },

  {
    id: 'steel-tension',
    name: 'Batang Tarik Baja',
    category: 'Baja',
    icon: 'modules/steel-tension/icon.svg',
    entry: 'modules/steel-tension/module.js',
    status: 'active'
  },

  {
    id: 'steel-compression',
    name: 'Batang Tekan Baja',
    category: 'Baja',
    icon: 'modules/steel-compression/icon.svg',
    entry: 'modules/steel-compression/module.js',
    status: 'active'
  },

  {
    id: 'steel-flexure',
    name: 'Balok Baja (Lentur)',
    category: 'Baja',
    icon: 'modules/steel-flexure/icon.svg',
    entry: 'modules/steel-flexure/module.js',
    status: 'active'
  },

  {
    id: 'bearing-capacity',
    name: 'Daya Dukung Tanah',
    category: 'Geoteknik',
    icon: 'modules/bearing-capacity/icon.svg',
    entry: 'modules/bearing-capacity/module.js',
    status: 'active'
  },

  {
    id: 'settlement',
    name: 'Penurunan Fondasi',
    category: 'Geoteknik',
    icon: 'modules/settlement/icon.svg',
    entry: 'modules/settlement/module.js',
    status: 'active'
  },

  {
    id: 'pile-capacity',
    name: 'Daya Dukung Tiang',
    category: 'Geoteknik',
    icon: 'modules/pile-capacity/icon.svg',
    entry: 'modules/pile-capacity/module.js',
    status: 'active'
  },

  // --- Roadmap (belum ada module.js, tampil abu-abu di nav) ---
  { id: 'load-combo',    name: 'Kombinasi Beban',        category: 'Umum',            status: 'coming-soon' },
  { id: 'anchor-bolt-group', name: 'Anchor Bolt Group',  category: 'Sambungan',       status: 'coming-soon' },

  // --- Dev only: validasi kontrak mount/unmount ---
  {
    id: '_template',
    name: 'Template Demo',
    category: 'Dev',
    entry: 'modules/_template/module.js',
    status: 'beta'
  }
];
