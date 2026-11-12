import type { Dictionary } from './lang'
import calc1 from './en/calc-1'
import calc2 from './en/calc-2'
import calc3 from './en/calc-3'
import tools1 from './en/tools-1'
import tools2 from './en/tools-2'
import tools3 from './en/tools-3'
import tools4 from './en/tools-4'
import tools5 from './en/tools-5'
import tools6 from './en/tools-6'
import tools7 from './en/tools-7'
import tools8 from './en/tools-8'

// Kamus laporan Bahasa Inggris (dimuat malas saat cetak PDF berbahasa Inggris). Kunci = teks Indonesia persis seperti
// disusun laporan/modul hitung; {0}, {1}, … = bagian yang berubah (angka, nama profil, teks lain yang ikut
// diterjemahkan). Saat menambah/mengubah teks laporan, tambahkan entri di berkas src/report/en/* yang sesuai;
// `npm test` (src/report/lang.test.ts) menandai teks laporan bawaan yang masih berbahasa Indonesia, dan
// `node scripts/i18n/extract.mjs src/tools src/calc` mendaftar semua teks sumber (termasuk cabang non-bawaan).

/** Kata di dalam subskrip rumus x_{…}; kata yang tidak ada dibiarkan. */
const subscripts: Record<string, string> = {
  maks: 'max', izin: 'all', perlu: 'req', pasang: 'prov', pakai: 'used', beton: 'c', total: 'tot',
  bawah: 'bot', atas: 'top', kiri: 'left', kanan: 'right', tengah: 'mid', tarik: 'tens', geser: 'shear',
  tapak: 'base', badan: 'stem', dasar: 'base', tepi: 'edge', dalam: 'int', luar: 'ext', tumpu: 'brg',
  tumpuan: 'sup', lapangan: 'mid', guling: 'ot', lokal: 'local', pendek: 'short', panjang: 'long',
  horizontal: 'hor', vertikal: 'vert', rata: 'avg', 'rata-rata': 'avg', pusat: 'centre', sudut: 'corner',
  kaku: 'rigid', sayap: 'flange', leleh: 'yield', fraktur: 'rupture', dinding: 'wall', zona: 'zone',
  desain: 'design', tambahan: 'add', pelat: 'plate', garis: 'line', ujung: 'end', global: 'global',
  tetap: 'sus', dek: 'deck', atap: 'roof', slab: 'slab', kaki: 'leg', jebol: 'cb', kombinasi: 'comb',
  konstruksi: 'const', injakan: 'tread', aktual: 'act', anak: 'step', 'anak tangga': 'step', bagi: 'dist',
  bruto: 'gross', ulir: 'thr', puncak: 'apex', jepit: 'fix', teori: 'theory', tiang: 'pile', bersih: 'clear',
  kolom: 'col', balok: 'beam', tanah: 'soil', 'daya dukung': 'brg', kontak: 'contact', bebas: 'free',
  lentur: 'flex', tekan: 'comp', torsi: 'tor', diag: 'diag', min: 'min', net: 'net', neto: 'net',
  rencana: 'design', layan: 'serv', ekiv: 'eq', ekuivalen: 'eq', efektif: 'eff',
  tekuk: 'buckl', baja: 's', las: 'w', baut: 'b', lubang: 'h', 'muka depan': 'front', depan: 'front',
  memanjang: 'long', muka: 'face', rt: 'avg', uta: 'main',
  's,vertikal muka depan': 's,v,front', 'vertikal depan': 'v,front', 's,tapak memanjang': 's,base,long', 's,horizontal': 's,h',
}

/** Kata/frasa umum yang muncul di banyak laporan. */
const common: Record<string, string> = {
  'OK': 'OK',
  'NG': 'NG',
  'Ya': 'Yes',
  'Tidak': 'No',
  'kiri': 'left',
  'kanan': 'right',
  '{0} (maks / min)': '{0} (max / min)',
  'kPa (maks / min)': 'kPa (max / min)',
  '{0} (lajur 1 m)': '{0} (1 m strip)',
  '{0} (Tabel 12)': '{0} (Table 12)',
  '{0} / {1} / {2} / diabaikan': '{0} / {1} / {2} / ignored',
  '{0} / {1} / {2} / diikutkan': '{0} / {1} / {2} / included',
  'mm (nyaman 600–650)': 'mm (comfortable 600–650)',
  '{0} mm (nyaman 600–650)': '{0} mm (comfortable 600–650)',
  '{0} / {1} bentang menerus': '{0} / {1} continuous spans',
  '{0} m / {1} bentang menerus': '{0} m / {1} continuous spans',
  'ulir D{0} mm': 'deformed D{0} mm',
  'Tanpa pelapis / galvanis': 'Uncoated / galvanised',
  'Pelapis epoksi, selimut < 3d_{b} atau spasi bersih < 6d_{b}': 'Epoxy-coated, cover < 3d_{b} or clear spacing < 6d_{b}',
  'Pelapis epoksi, kondisi lainnya': 'Epoxy-coated, other conditions',
  '{0} ≤ 2 — dua arah': '{0} ≤ 2 — two-way',
  'bulat, bor, beton': 'round, bored, concrete',
  'tabel': 'table',
}

export const EN: Dictionary = {
  phrases: { ...common, ...calc1, ...calc2, ...calc3, ...tools1, ...tools2, ...tools3, ...tools4, ...tools5, ...tools6, ...tools7, ...tools8 },
  subscripts,
}
