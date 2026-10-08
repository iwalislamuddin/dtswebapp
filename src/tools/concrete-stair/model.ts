import { computeStair, type StairInput, type StairResult, type StairSupport } from '../../calc/concrete-stair'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Desain Tangga Beton (pelat tangga + bordes sebagai rangka 2D): angka sebagai teks form.

export type { FieldErrors }

export const SUPPORTS: { value: StairSupport; label: string }[] = [
  { value: 'sendi', label: 'Sendi' },
  { value: 'rol', label: 'Rol' },
  { value: 'jepit', label: 'Jepit' },
]
export const STAIR_BARS = [10, 13, 16]

export interface StairUIInput {
  L1: string
  L2: string
  L3: string
  H: string
  R: string
  tw: string
  supA: StairSupport
  supB: StairSupport
  SDL: string
  LL: string
  fc: string
  fy: string
  cc: string
  db: string
}

/** Input bawaan = kasus golden "default sendi-rol dengan dua bordes". */
export const STAIR_DEFAULTS: StairUIInput = {
  L1: '1.2', L2: '2.52', L3: '1.2', H: '1.8', R: '175', tw: '150', supA: 'sendi', supB: 'rol', SDL: '1.5', LL: '3', fc: '25', fy: '420', cc: '20', db: '13',
}

export function validate(i: StairUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('L1', nonneg)
  need('L2', pos)
  need('L3', nonneg)
  need('H', pos)
  need('R', pos)
  need('tw', pos)
  need('SDL', nonneg)
  need('LL', nonneg)
  need('fc', pos)
  need('fy', pos)
  need('cc', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: StairUIInput): StairInput {
  return {
    L1: num(i.L1), L2: num(i.L2), L3: num(i.L3), H: num(i.H), R: num(i.R), tw: num(i.tw), supA: i.supA, supB: i.supB, SDL: num(i.SDL),
    LL: num(i.LL), fc: num(i.fc), fy: num(i.fy), cc: num(i.cc), db: Number(i.db),
  }
}

/** Hitung; null bila input tidak valid, struktur tidak stabil, atau tinggi efektif ≤ 0. */
export function computeStairUI(i: StairUIInput): StairResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeStair(toCalcInput(i))
  return r.valid && !r.unstable && r.asPos ? r : null
}

export function rejectReason(i: StairUIInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeStair(toCalcInput(i))
  if (r.unstable) return 'Struktur tidak stabil (mekanisme) — misalnya rol di kedua tumpuan. Pakai minimal satu sendi/jepit.'
  if (r.valid && !r.asPos) return r.warn[0] ?? 'Tinggi efektif ≤ 0.'
  return null
}

/** Diagram gaya dalam (M kN·m, V kN, N kN) terhadap jarak horizontal x (m) sepanjang tangga. */
export function forceDiagram(r: StairResult, key: 'Ms' | 'Vs' | 'Ns'): [number, number][] {
  const scale = key === 'Ms' ? 1e6 : 1e3
  const pts: [number, number][] = []
  for (const ed of r.U!.elems) {
    const e = ed.ref, x0 = r.nodes![e.ni][0] / 1000
    ed.xs.forEach((x, k) => pts.push([x0 + (x * e.cx) / 1000, ed[key][k] / scale]))
  }
  return pts
}
