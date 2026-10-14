import { computePile, type LayerMethod, type PileInput, type PileLayer, type PileResult, type PileShape, type SoilKind } from '../../calc/pile-capacity'
import { anyNum, checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Daya Dukung Tiang Tunggal (aksial): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true). */
export type PileOk = Extract<PileResult, { valid: true }>

export const MAX_LAYERS = 8

export interface PileLayerUI {
  soil: SoilKind
  method: LayerMethod
  /** Tebal (m), berat isi (kN/m³), cu (kPa, lempung), φ (°, pasir), N-SPT. */
  H: string
  gamma: string
  cu: string
  phi: string
  N: string
}

export interface PileUIInput {
  shape: PileShape
  /** Diameter / sisi D (m), panjang tertanam L (m), kedalaman MAT (m), FS (kosong/0 = 2,5). */
  D: string
  L: string
  Dw: string
  FS: string
  ptype: 'driven' | 'bored'
  material: 'concrete' | 'steel'
  inclW: 'yes' | 'no'
  layers: PileLayerUI[]
}

/** Input bawaan = kasus golden default. */
export const PILE_DEFAULTS: PileUIInput = {
  shape: 'circular', D: '0.4', L: '12', Dw: '2', FS: '2.5', ptype: 'driven', material: 'concrete', inclW: 'no',
  layers: [
    { soil: 'clay', method: 'static', H: '4', gamma: '17', cu: '40', phi: '0', N: '6' },
    { soil: 'sand', method: 'static', H: '6', gamma: '18', cu: '0', phi: '32', N: '18' },
    { soil: 'sand', method: 'static', H: '8', gamma: '19', cu: '0', phi: '36', N: '35' },
  ],
}

/** Lapis baru (pasir). */
export const newLayer = (): PileLayerUI => ({ soil: 'sand', method: 'static', H: '5', gamma: '18', cu: '0', phi: '32', N: '20' })

export function validate(i: PileUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('D', pos)
  need('L', pos)
  need('Dw', anyNum)
  if (i.FS.trim() !== '') need('FS', nonneg)
  if (i.layers.length === 0) e.layers = 'Tambahkan minimal satu lapis tanah'
  i.layers.forEach((ly, k) => {
    const set = (key: keyof PileLayerUI & string, rule: typeof pos) => {
      const sub: FieldErrors = {}
      checker(ly, sub)(key, rule)
      if (sub[key]) e[`layers.${k}.${key}`] = sub[key]
    }
    set('H', pos)
    set('gamma', pos)
    if (ly.method === 'spt') set('N', pos)
    else if (ly.soil === 'clay') set('cu', nonneg)
    else set('phi', nonneg)
    if (ly.method !== 'spt' && ly.N.trim() !== '') set('N', nonneg)
  })
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: PileUIInput): { g: PileInput; layers: PileLayer[] } {
  const n = (s: string) => num(s)
  return {
    g: { shape: i.shape, D: n(i.D), L: n(i.L), ptype: i.ptype, material: i.material, Dw: n(i.Dw), FS: n(i.FS), inclW: i.inclW },
    layers: i.layers.map((ly) => ({ soil: ly.soil, method: ly.method, H: n(ly.H), gamma: n(ly.gamma), cu: n(ly.cu), phi: n(ly.phi), N: n(ly.N) })),
  }
}

/** Hitung; null bila input tidak valid. */
export function computePileUI(i: PileUIInput): PileOk | null {
  if (Object.keys(validate(i)).length) return null
  const { g, layers } = toCalcInput(i)
  const r = computePile(g, layers)
  return r.valid ? r : null
}
