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
}
