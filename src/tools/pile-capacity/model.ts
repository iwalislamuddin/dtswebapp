import { computePileSpt, type LayerMethod, type PileShape, type PileSptInput, type PileSptResult, type SptSoil } from '../../calc/pile-capacity'
import { anyNum, checker, nonneg, num, parseNum, pos, type FieldErrors } from '../form'

// Input UI Daya Dukung Tiang (SPT): angka sebagai teks form; data tanah sebagai tabel Z – N-SPT – jenis – γ – cu
// (γ/cu kosong = korelasi). toCalcInput() → computePileSpt().

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true). */
export type PileOk = Extract<PileSptResult, { valid: true }>

export const MAX_ROWS = 40

export interface SptRowUI {
  /** Kedalaman atas lapis (m), N-SPT, berat isi (kN/m³, kosong = korelasi), cu (kPa, kosong = korelasi). */
  z: string
  N: string
  soil: SptSoil
  gamma: string
  cu: string
}

export interface PileUIInput {
  shape: PileShape
  /** Diameter / sisi (mm); pile cut-off (m dari permukaan); panjang tiang dari cut-off (m). */
  D: string
  zc: string
  L: string
  ptype: 'driven' | 'bored'
  material: 'concrete' | 'steel'
  /** MAT (m), FS tekan & tarik (kosong/0 = 2,5 / 3). */
  Dw: string
  FS: string
  FSt: string
  inclW: 'yes' | 'no'
  method: LayerMethod
  rows: SptRowUI[]
  nsf: 'yes' | 'no'
  /** Dasar zona gesekan negatif (m dari permukaan). */
  zn: string
  /** Beban layan tekan / tarik (kN). */
  P: string
  T: string
  /** Beban terfaktor (kN), mutu (MPa), tulangan & sengkang & selimut (mm), ρ min (%). */
  Pu: string
  Tu: string
  fc: string
  fy: string
  db: string
  ds: string
  cover: string
  rhoMin: string
}

const row = (z: number, N: number, soil: SptSoil): SptRowUI => ({ z: String(z), N: String(N), soil, gamma: '', cu: '' })

export const PILE_DEFAULTS: PileUIInput = {
  shape: 'circular', D: '600', zc: '1.5', L: '15', ptype: 'bored', material: 'concrete',
  Dw: '2', FS: '2.5', FSt: '3', inclW: 'no', method: 'spt',
  rows: [row(0, 3, 'L'), row(2, 5, 'L'), row(4, 7, 'L'), row(6, 12, 'P'), row(8, 16, 'P'), row(10, 21, 'P'), row(12, 27, 'P'), row(14, 34, 'P'), row(16, 45, 'P'), row(18, 50, 'P')],
  nsf: 'no', zn: '6',
  P: '800', T: '150',
  Pu: '1100', Tu: '220', fc: '30', fy: '420', db: '16', ds: '10', cover: '75', rhoMin: '0.5',
}

/** Baris baru: 2 m di bawah baris terakhir. */
export const newRow = (rows: SptRowUI[]): SptRowUI => {
  const last = rows[rows.length - 1]
  const z = last ? (parseNum(last.z) ?? 0) + 2 : 0
  return { z: String(z), N: last?.N ?? '10', soil: last?.soil ?? 'P', gamma: '', cu: '' }
}

export function validate(i: PileUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('D', pos)
  need('zc', nonneg)
  need('L', pos)
  need('Dw', anyNum)
  if (i.FS.trim() !== '') need('FS', nonneg)
  if (i.FSt.trim() !== '') need('FSt', nonneg)
  if (i.nsf === 'yes') need('zn', nonneg)
  need('P', nonneg)
  need('T', nonneg)
  if (i.material === 'concrete') {
    need('Pu', nonneg)
    need('Tu', nonneg)
    need('fc', pos)
    need('fy', pos)
    need('db', pos)
    need('ds', pos)
    need('cover', pos)
    need('rhoMin', nonneg)
    const D = parseNum(i.D), cov = parseNum(i.cover), ds = parseNum(i.ds), db = parseNum(i.db)
    if (!e.D && !e.cover && D !== null && cov !== null && ds !== null && db !== null && D / 2 - cov - ds - db / 2 <= 0) e.cover = 'Selimut terlalu besar untuk D'
  }
  if (i.rows.length === 0) e.rows = 'Isi minimal satu baris data SPT'
  let prev = -Infinity
  i.rows.forEach((r, k) => {
    const set = (key: 'z' | 'N' | 'gamma' | 'cu', rule: typeof pos) => {
      const sub: FieldErrors = {}
      checker(r, sub)(key, rule)
      if (sub[key]) e[`rows.${k}.${key}`] = sub[key]
    }
    set('z', nonneg)
    set('N', nonneg)
    if (r.gamma.trim() !== '') set('gamma', pos)
    if (i.method === 'static' && r.soil === 'L' && r.cu.trim() !== '') set('cu', pos)
    const z = parseNum(r.z)
    if (!e[`rows.${k}.z`] && z !== null) {
      if (k === 0 && z !== 0) e[`rows.${k}.z`] = 'Baris pertama Z = 0'
      else if (k > 0 && z <= prev) e[`rows.${k}.z`] = 'Z harus naik'
      prev = z
    }
  })
  return e
}

/** Bentuk compute. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: PileUIInput): PileSptInput {
  const opt = (s: string) => (s.trim() === '' ? null : num(s))
  return {
    shape: i.shape, Dmm: num(i.D), zc: num(i.zc), L: num(i.L), ptype: i.ptype, material: i.material,
    Dw: num(i.Dw), FS: num(i.FS), FSt: num(i.FSt), inclW: i.inclW, method: i.method,
    rows: i.rows.map((r) => ({ z: num(r.z), N: num(r.N), soil: r.soil, gamma: opt(r.gamma), cu: i.method === 'static' ? opt(r.cu) : null })),
    nsf: i.nsf === 'yes', zn: num(i.zn),
    P: num(i.P), T: num(i.T),
    rebar: i.material === 'concrete'
      ? { Pu: num(i.Pu), Tu: num(i.Tu), fc: num(i.fc), fy: num(i.fy), db: num(i.db), ds: num(i.ds), cover: num(i.cover), rhoMin: num(i.rhoMin) }
      : null,
  }
}

/** Hitung; null bila input tidak valid. */
export function computePileUI(i: PileUIInput): PileOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computePileSpt(toCalcInput(i))
  return r.valid ? r : null
}
