import { computeTwoWaySlab, type EdgeCondition, type TwoWaySlabInput, type TwoWaySlabResult } from '../../calc/two-way-slab'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Pelat Dua Arah: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export const COND_OPTIONS: { value: EdgeCondition; label: string }[] = [
  { value: 'ff', label: 'Jepit – jepit' },
  { value: 'fp', label: 'Jepit – sendi' },
  { value: 'ss', label: 'Sendi – sendi' },
]
export const SLAB_BARS = [8, 10, 13, 16]

export interface SlabInput {
  /** m */
  Lx: string
  Ly: string
  /** mm */
  h: string
  condX: EdgeCondition
  condY: EdgeCondition
  /** kN/m² */
  qDL: string
  qLL: string
  fc: string
  fy: string
  cc: string
  db: string
}

/** Input bawaan = kasus golden "default jepit-jepit" (4 × 5 m, h 140). */
export const SLAB_DEFAULTS: SlabInput = {
  Lx: '4', Ly: '5', h: '140', condX: 'ff', condY: 'ff', qDL: '1.2', qLL: '2.5', fc: '25', fy: '420', cc: '20', db: '10',
}

export function validate(i: SlabInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('Lx', pos)
  need('Ly', pos)
  need('h', pos)
  need('qDL', nonneg)
  need('qLL', nonneg)
  need('fc', pos)
  need('fy', pos)
  need('cc', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: SlabInput): TwoWaySlabInput {
  return {
    Lx: num(i.Lx), Ly: num(i.Ly), h: num(i.h), condX: i.condX, condY: i.condY, qDL: num(i.qDL), qLL: num(i.qLL), fc: num(i.fc), fy: num(i.fy),
    cc: num(i.cc), db: Number(i.db),
  }
}

/** Hitung; null bila input tidak valid atau tinggi efektif ≤ 0 (desain tulangan tidak ada). */
export function computeSlab(i: SlabInput): TwoWaySlabResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeTwoWaySlab(toCalcInput(i))
  return r.valid && r.asXpos ? r : null
}

export function rejectReason(i: SlabInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeTwoWaySlab(toCalcInput(i))
  return r.valid && r.asXpos ? null : r.warn.find((w) => w.includes('Tinggi efektif')) ?? 'Input tidak dapat dihitung.'
}
