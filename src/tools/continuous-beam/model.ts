import { CB_BARS, CB_STIRRUPS, computeContinuousBeam, type CBElement, type ContinuousBeamInput, type ContinuousBeamResult } from '../../calc/continuous-beam'
import { checker, intRange, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Balok/Pelat Menerus (metode koefisien Ps. 6.5): field mengikuti jenis elemen & jumlah bentang.

export type { FieldErrors }
export { CB_BARS, CB_STIRRUPS }

export interface CBInput {
  elem: CBElement
  n: string
  /** Bentang ujung & dalam as–as (m), lebar tumpuan (mm). */
  L: string
  Li: string
  bsup: string
  b: string
  h: string
  /** Pelat kN/m², balok kN/m (di luar berat sendiri). */
  qDs: string
  qLs: string
  qDb: string
  qLb: string
  ujung: 'bebas' | 'spandrel' | 'kolom'
  m12: 'std' | 'm12'
  tumpuan1: 'ss' | 'js' | 'jj'
  design: 'ya' | 'tidak'
  fc: string
  fy: string
  cc: string
  db: string
  fyt: string
  ds: string
}

/** Input bawaan = kasus golden "default pelat 4 bentang". */
export const CB_DEFAULTS: CBInput = {
  elem: 'pelat', n: '4', L: '4', Li: '4', bsup: '300', b: '300', h: '130', qDs: '1.5', qLs: '3', qDb: '15', qLb: '10',
  ujung: 'spandrel', m12: 'std', tumpuan1: 'ss', design: 'ya', fc: '25', fy: '420', cc: '20', db: '10', fyt: '420', ds: '10',
}

export function validate(i: CBInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  const balok = i.elem === 'balok'
  need('n', intRange(1, 12))
  need('L', pos)
  if ((Number(i.n) || 0) >= 3) need('Li', pos)
  need('bsup', nonneg)
  if (balok) need('b', pos)
  need('h', pos)
  need(balok ? 'qDb' : 'qDs', nonneg)
  need(balok ? 'qLb' : 'qLs', nonneg)
  if (i.design === 'ya') {
    need('fc', pos)
    need('fy', pos)
    need('cc', nonneg)
    if (balok) need('fyt', pos)
  }
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: CBInput): ContinuousBeamInput {
  return {
    elem: i.elem, n: num(i.n), L: num(i.L), Li: num(i.Li), bsup: num(i.bsup), b: num(i.b), h: num(i.h), qDs: num(i.qDs), qLs: num(i.qLs),
    qDb: num(i.qDb), qLb: num(i.qLb), ujung: i.ujung, m12: i.m12, tumpuan1: i.tumpuan1, design: i.design, fc: num(i.fc), fy: num(i.fy),
    cc: num(i.cc), db: Number(i.db), fyt: num(i.fyt), ds: Number(i.ds),
  }
}

/** Hitung; null bila input tidak valid atau geometri/beban tidak dapat dihitung. */
export function computeCB(i: CBInput): ContinuousBeamResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeContinuousBeam(toCalcInput(i))
  return r.valid ? r : null
}

export function rejectReason(i: CBInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeContinuousBeam(toCalcInput(i))
  if (r.valid) return r.des?.err ?? null
  return 'Bentang bersih ≤ 0 (bentang lebih kecil dari lebar tumpuan) atau beban mati nol.'
}

/** Koefisien momen tiap tumpuan & bentang sebagai teks ("1/10", "0"), metode koefisien. */
export function coefLabels(r: ContinuousBeamResult): { sup: string[]; span: string[] } {
  const n = r.n
  if (n === 1) {
    const c = r.tumpuan1
    return { sup: c === 'jj' ? ['1/12', '1/12'] : c === 'js' ? ['1/8', '0'] : ['0', '0'], span: [c === 'jj' ? '1/24' : c === 'js' ? '9/128' : '1/8'] }
  }
  const f = (c: number | undefined) => (c ? `1/${c}` : '0')
  const sup = Array.from({ length: n + 1 }, (_, k) => (k === 0 || k === n ? f(r.cNegExt) : k === 1 || k === n - 1 ? f(r.cNegFI) : f(r.cNegInt)))
  const span = Array.from({ length: n }, (_, k) => (k === 0 || k === n - 1 ? f(r.cPosEnd) : '1/16'))
  return { sup, span }
}

/**
 * Diagram momen indikatif sepanjang balok (x m, M kN·m, sagging +): tiap bentang parabola melalui −M tumpuan kiri &
 * kanan dengan nilai maksimum lapangan M+ di tengah. Nilai ekstrem = koefisien (amplop, bukan satu kasus beban).
 */
export function momentDiagram(r: ContinuousBeamResult, nPer = 24): [number, number][] {
  const pts: [number, number][] = []
  let x0 = 0
  r.spanLen!.forEach((L, i) => {
    const Ml = r.supM![i] ?? 0, Mr = r.supM![i + 1] ?? 0, Mp = r.spanM![i] ?? 0
    // M(t) = −Ml(1 − t) − Mr·t + q·t(1 − t) dengan q dipilih agar puncak parabola tepat Mp:
    // (b + q)² = 4q(Mp + Ml), b = Ml − Mr → akar terbesar.
    const b = Ml - Mr, K = Mp + Ml, B = 4 * K - 2 * b
    const q = (B + Math.sqrt(Math.max(0, B * B - 4 * b * b))) / 2
    for (let k = 0; k <= nPer; k++) {
      const t = k / nPer
      pts.push([x0 + t * L, -Ml * (1 - t) - Mr * t + q * t * (1 - t)])
    }
    // titik puncak tepat (agar nilai ekstrem = Mp)
    const tp = q > 0 ? (b + q) / (2 * q) : 0.5
    if (tp > 0 && tp < 1) {
      pts.push([x0 + tp * L, Mp])
      pts.sort((a, c) => a[0] - c[0])
    }
    x0 += L
  })
  return pts
}

/** Diagram geser indikatif: linear dari +V tumpuan kiri ke −V tumpuan kanan pada tiap bentang. */
export function shearDiagram(r: ContinuousBeamResult): [number, number][] {
  const pts: [number, number][] = []
  let x0 = 0
  r.spanLen!.forEach((L, i) => {
    pts.push([x0, 0], [x0, r.supV![i] ?? 0], [x0 + L, -(r.supV![i + 1] ?? 0)], [x0 + L, 0])
    x0 += L
  })
  return pts
}
