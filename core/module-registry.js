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

  // --- Roadmap (belum ada module.js, tampil abu-abu di nav) ---
  { id: 'beam-flexure',  name: 'Kapasitas Balok (φMn)', category: 'Beton Bertulang', status: 'coming-soon' },
  { id: 'steel-tension', name: 'Batang Tarik Baja',      category: 'Baja',            status: 'coming-soon' },
  { id: 'pile-capacity', name: 'Daya Dukung Tiang',      category: 'Geoteknik',       status: 'coming-soon' },
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
