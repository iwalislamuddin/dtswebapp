// Kasus acuan golden per tool: args = argumen compute() modul lama, persis seperti dikirim UI lama.
// Cakup: nilai default form, kasus hitung tangan di docs/HANDOFF.md, tiap cabang rumus, dan input tak valid.

const bearingBase = {
  shape: 'square', B: 2, L: 3, Df: 1.5, c: 10, phi: 30, gamma: 18, gsat: 20, Dw: 99,
  method: 'terzaghi', tfail: 'general', FS: 3, qapp: 0,
}
const bearing = (name, over) => ({ name, args: [{ ...bearingBase, ...over }] })

const pileLayers = [
  { soil: 'clay', H: 4, gamma: 17, cu: 40, phi: 0, N: 6, method: 'static' },
  { soil: 'sand', H: 6, gamma: 18, cu: 0, phi: 32, N: 18, method: 'static' },
  { soil: 'sand', H: 8, gamma: 19, cu: 0, phi: 36, N: 35, method: 'static' },
]
const pileBase = { shape: 'circular', D: 0.4, L: 12, ptype: 'driven', material: 'concrete', Dw: 2, FS: 2.5, inclW: 'no' }
const withLayer = (i, over) => pileLayers.map((l, k) => (k === i ? { ...l, ...over } : l))
const pile = (name, over = {}, layers = pileLayers) => ({ name, args: [{ ...pileBase, ...over }, layers] })

const settleBase = {
  shape: 'square', B: 2, L: 3, Df: 1.5, q0: 150, Es: 10, mu: 0.3, Hs: 8, If: 1, rigid: 'flex',
  ztop: 3, Hc: 4, e0: 0.9, Cc: 0.25, Cr: 0.05, sig0: 60, sigc: 80, cv: 1.5, drain: 'double', t: 3,
}
const settle = (name, over) => ({ name, args: [{ ...settleBase, ...over }] })

const CPT_SAMPLE = '# z(m)  qc\n0.0  5\n0.5  8\n1.0  10\n1.5  12\n2.0  15\n2.5  20\n3.0  28\n' +
  '3.5  35\n4.0  45\n4.5  55\n5.0  70\n6.0  90\n7.0  110\n8.0  130\n10.0  150\n12.0  180'
const CPT_PILE_SAMPLE = '# z(m)  qc(kg/cm2)  fs(kg/cm2)\n0.0  5  0.1\n1.0  10  0.2\n2.0  15  0.3\n3.0  25  0.5\n' +
  '4.0  35  0.6\n5.0  50  0.8\n6.0  60  0.9\n7.0  75  1.0\n8.0  90  1.1\n9.0  110  1.2\n' +
  '10.0  130  1.3\n11.0  150  1.4\n12.0  175  1.5\n13.0  200  1.6\n14.0  220  1.7\n16.0  250  1.8'
const CPT_MESSY = '// data uji\n3.0, 40; 0.2\n\n1.0	20	0.1\n1.0 99 9\nx 5\n2.0 -3\n0.5 10 -1\n# komentar\n4 60'
const CPT_CLAY = '0 3\n1 4\n2 5\n3 6\n4 7\n6 9\n8 12'

const cptBase = { unit: 'kgcm2', B: 1.5, L: 1.5, Df: 1, gamma: 17, soil: 'sand', Nk: 14, FS: 3, qw: 0 }
const cpt = (name, over, text = CPT_SAMPLE) => {
  const v = { ...cptBase, ...over }
  return { name, args: [v, { $parse: [text, v.unit] }] }
}
const cptPileBase = { unit: 'kgcm2', shape: 'circle', D: 0.4, Lp: 12, fsrc: 'data', Rf: 1, FSp: 3, FSs: 5, Pw: 0 }
const cptPile = (name, over, text = CPT_PILE_SAMPLE) => {
  const v = { ...cptPileBase, ...over }
  return { name, args: [v, { $parse: [text, v.unit] }] }
}

export const CASES = {
  'bearing-capacity': [
    bearing('default (HANDOFF: Terzaghi qu 1373)', {}),
    bearing('metode utama Meyerhof', { method: 'meyerhof' }),
    bearing('metode utama Vesic', { method: 'vesic' }),
    bearing('strip', { shape: 'strip' }),
    bearing('lingkaran', { shape: 'circular' }),
    bearing('persegi panjang', { shape: 'rect', L: 3 }),
    bearing('persegi panjang L<B ditukar', { shape: 'rect', B: 3, L: 2 }),
    bearing('persegi panjang L kosong', { shape: 'rect', L: 0 }),
    bearing('phi 0 undrained', { phi: 0, c: 50 }),
    bearing('phi 5 (Meyerhof tanpa sq/dq)', { phi: 5 }),
    bearing('keruntuhan lokal', { tfail: 'local' }),
    bearing('MAT di zona baji', { Dw: 2.5 }),
    bearing('MAT antara permukaan & dasar (HANDOFF Dw 0,5)', { Dw: 0.5 }),
    bearing('MAT di permukaan', { Dw: 0 }),
    bearing('gsat <= gamma dengan MAT', { Dw: 1, gsat: 17 }),
    bearing('phi 47 tinggi', { phi: 47 }),
    bearing('phi 55 di luar tabel', { phi: 55 }),
    bearing('Df/B > 4', { Df: 10, B: 2 }),
    bearing('q kerja melebihi izin', { qapp: 600 }),
    bearing('q kerja aman, Vesic', { qapp: 300, method: 'vesic' }),
    bearing('FS 0 -> 3', { FS: 0 }),
    bearing('gsat kosong', { gsat: 0, Dw: 1 }),
    bearing('nilai string dari form', { B: '2.5', Df: '1', c: '0', phi: '34' }),
    bearing('B 0 tidak valid', { B: 0 }),
    bearing('gamma 0 tidak valid', { gamma: 0 }),
    bearing('Df negatif tidak valid', { Df: -1 }),
  ],
  'pile-capacity': [
    pile('default (HANDOFF: Qu 527,4, Q_izin 211)'),
    pile('SPT di lapis 3 (HANDOFF 882 kN)', {}, withLayer(2, { method: 'spt' })),
    pile('L 8, ujung di lapis 2 (HANDOFF 116 kN)', { L: 8 }),
    pile('persegi', { shape: 'square' }),
    pile('bor baja', { ptype: 'bored', material: 'steel' }),
    pile('kurangi berat sendiri', { inclW: 'yes' }),
    pile('L melebihi profil', { L: 25 }),
    pile('MAT di permukaan', { Dw: 0 }),
    pile('MAT negatif -> 0', { Dw: -2 }),
    pile('MAT di bawah profil', { Dw: 30 }),
    pile('ujung di lempung', { L: 3 }),
    pile('ujung di lempung SPT', { L: 3 }, withLayer(0, { method: 'spt' })),
    pile('fs dibatasi 120 kPa', { L: 18 }, withLayer(2, { method: 'spt', N: 80 })),
    pile('Decourt dilewati (N kosong)', {}, withLayer(1, { N: 0 })),
    pile('lempung psi > 1', { L: 3 }, withLayer(0, { cu: 150 })),
    pile('tiang pendek L/D < 4', { L: 1.2 }),
    pile('satu lapis pasir', { L: 10 }, [{ soil: 'sand', H: 15, gamma: 18, cu: 0, phi: 30, N: 20, method: 'static' }]),
    pile('FS 0 -> 2,5', { FS: 0 }),
    pile('D 0 tidak valid', { D: 0 }),
    pile('L 0 tidak valid', { L: 0 }),
    pile('tanpa lapis', {}, []),
  ],
  settlement: [
    settle('default (HANDOFF: S total 48,96, St 47,85)', {}),
    settle('NC: sigc = sig0 (HANDOFF Sc 74,62)', { sigc: 60 }),
    settle('OC tanpa melewati sigc', { sigc: 200 }),
    settle('sigc < sig0 -> = sig0', { sigc: 40 }),
    settle('OCR 1,005: batas NC/OC', { sigc: 60.3 }),
    settle('strip (HANDOFF Se 41,3)', { shape: 'strip' }),
    settle('lingkaran (HANDOFF S 37,7)', { shape: 'circular' }),
    settle('persegi panjang', { shape: 'rect', L: 3 }),
    settle('persegi panjang L<B', { shape: 'rect', B: 3, L: 2 }),
    settle('persegi panjang L kosong', { shape: 'rect', L: 0 }),
    settle('kaku (HANDOFF 43,3)', { rigid: 'rigid' }),
    settle('cv 0: laju dilewati', { cv: 0 }),
    settle('t 0: U tidak dihitung', { t: 0 }),
    settle('drainase tunggal', { drain: 'single' }),
    settle('U > 60%', { t: 0.5, drain: 'single' }),
    settle('U sangat kecil', { t: 0.01 }),
    settle('U mendekati 100%', { t: 200 }),
    settle('tanpa lempung', { Hc: 0, Cc: 0 }),
    settle('lempung tak lengkap (e0 0)', { e0: 0 }),
    settle('sig0 0', { sig0: 0 }),
    settle('Cr negatif', { Cr: -0.1, sigc: 200 }),
    settle('puncak lempung di atas dasar', { ztop: 1 }),
    settle('mu 0,5 -> 0,49', { mu: 0.5 }),
    settle('mu 0 -> 0,3', { mu: 0 }),
    settle('Hs 0 -> 30, If 0 -> 1', { Hs: 0, If: 0 }),
    settle('Hs < 2B, Df/B > 4', { Hs: 3, Df: 9 }),
    settle('If 0,8', { If: 0.8 }),
    settle('B 0 tidak valid', { B: 0 }),
    settle('Df negatif tidak valid', { Df: -1 }),
    settle('q0 0 tidak valid', { q0: 0 }),
    settle('Es 0 tidak valid', { Es: 0 }),
  ],
  'cpt-bearing': [
    cpt('default pasir', {}),
    cpt('pasir B > 1,2', { B: 2, L: 3 }),
    cpt('pasir B tepat 1,2', { B: 1.2, L: 1.2 }),
    cpt('pasir Kd dibatasi 1,33', { B: 1, Df: 3 }),
    cpt('qc dalam MPa', { unit: 'mpa' }, '0 0.5\n1 1\n2 2\n3 4\n5 8'),
    cpt('lempung', { soil: 'clay' }, CPT_CLAY),
    cpt('lempung Df/B dibatasi 2,5', { soil: 'clay', Df: 4, B: 1 }, CPT_CLAY),
    cpt('lempung su negatif -> 0', { soil: 'clay', gamma: 200 }, CPT_CLAY),
    cpt('lempung Nk 0 -> 14, FS 0 -> 3', { soil: 'clay', Nk: 0, FS: 0 }, CPT_CLAY),
    cpt('lempung qc tinggi', { soil: 'clay' }),
    cpt('pasir qc rendah', {}, CPT_CLAY),
    cpt('L < B dipakai B', { L: 1 }),
    cpt('melampaui data terdalam', { Df: 11 }),
    cpt('beban kerja aman', { qw: 50 }),
    cpt('beban kerja melampaui', { qw: 500 }),
    cpt('data berantakan', {}, CPT_MESSY),
    cpt('tanpa data', {}, ''),
    cpt('B 0 tidak valid', { B: 0 }),
    cpt('Df negatif tidak valid', { Df: -1 }),
  ],
  'cpt-pile': [
    { name: 'parse sampel kg/cm2', fn: 'parseCPT', args: [CPT_PILE_SAMPLE, 'kgcm2'] },
    { name: 'parse MPa', fn: 'parseCPT', args: ['0 1 0.01\n2 3 0.05', 'mpa'] },
    { name: 'parse berantakan', fn: 'parseCPT', args: [CPT_MESSY, 'kgcm2'] },
    { name: 'parse kosong', fn: 'parseCPT', args: ['', 'kgcm2'] },
    cptPile('default', {}),
    cptPile('persegi', { shape: 'square' }),
    cptPile('selimut dari Rf', { fsrc: 'rf', Rf: 2 }),
    cptPile('fs tidak ada -> Rf', {}, CPT_SAMPLE),
    cptPile('Rf 0 -> 1', { fsrc: 'rf', Rf: 0 }),
    cptPile('fs dibatasi 120', { fsrc: 'rf', Rf: 8 }),
    cptPile('qp sangat tinggi', { unit: 'mpa' }, '0 5 0.05\n10 30 0.1\n20 40 0.2'),
    cptPile('tiang pendek L < 8D', { Lp: 2, D: 0.6 }),
    cptPile('ujung di bawah data', { Lp: 20 }),
    cptPile('FS 0 -> 3/5', { FSp: 0, FSs: 0 }),
    cptPile('beban kerja aman', { Pw: 200 }),
    cptPile('beban kerja melampaui', { Pw: 2000 }),
    cptPile('data berantakan', { Lp: 3 }, CPT_MESSY),
    cptPile('tanpa data', {}, ''),
    cptPile('D 0 tidak valid', { D: 0 }),
    cptPile('L 0 tidak valid', { Lp: 0 }),
  ],
}
