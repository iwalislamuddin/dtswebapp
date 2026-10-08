import { computeColumnPM, type ColumnPMInput, type ColumnPMResult, type ColumnShape, type ColumnTie, type SurfacePoint } from '../../calc/column-pm'
import { anyNum, checker, intRange, num, pos, type FieldErrors } from '../form'

// Input UI Diagram P–M Kolom: angka sebagai teks form; field per bentuk penampang. toCalcInput() → compute lama.

export type { FieldErrors }

export const SHAPES: { value: ColumnShape; label: string }[] = [
  { value: 'rect', label: 'Persegi' },
  { value: 'circle', label: 'Lingkaran' },
  { value: 'L', label: 'L' },
  { value: 'T', label: 'T' },
]
export const COL_BARS = [13, 16, 19, 22, 25, 29, 32, 36]

export interface ColumnInput {
  shape: ColumnShape
  b: string
  h: string
  D: string
  tx: string
  ty: string
  bw: string
  tf: string
  /** Selimut ke pusat tulangan (mm). */
  dp: string
  fc: string
  fy: string
  db: string
  nx: string
  ny: string
  ncirc: string
  spac: string
  tie: ColumnTie
  Pu: string
  Mux: string
  Muy: string
}

/** Input bawaan = kasus golden "default persegi uniaksial" (400 × 400, 8D19, Pu 1200 kN, Mux 150 kN·m). */
export const COLUMN_DEFAULTS: ColumnInput = {
  shape: 'rect', b: '400', h: '400', D: '500', tx: '150', ty: '150', bw: '200', tf: '150', dp: '60', fc: '25', fy: '400', db: '19',
  nx: '3', ny: '3', ncirc: '8', spac: '200', tie: 'tie', Pu: '1200', Mux: '150', Muy: '0',
}

export function validate(i: ColumnInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('fc', pos)
  need('fy', pos)
  need('dp', pos)
  if (i.shape === 'circle') {
    need('D', pos)
    need('ncirc', intRange(4, 40))
  } else {
    need('b', pos)
    need('h', pos)
    if (i.shape === 'rect') {
      need('nx', intRange(2, 15))
      need('ny', intRange(2, 15))
    } else {
      need('spac', (n) => (n >= 30 ? null : 'Minimal 30 mm'))
      if (i.shape === 'L') {
        need('tx', pos)
        need('ty', pos)
      } else {
        need('bw', pos)
        need('tf', pos)
      }
    }
  }
  need('Pu', anyNum)
  need('Mux', anyNum)
  need('Muy', anyNum)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: ColumnInput): ColumnPMInput {
  return {
    shape: i.shape, b: num(i.b), h: num(i.h), D: num(i.D), tx: num(i.tx), ty: num(i.ty), bw: num(i.bw), tf: num(i.tf), dp: num(i.dp),
    fc: num(i.fc), fy: num(i.fy), db: Number(i.db), nx: num(i.nx), ny: num(i.ny), ncirc: num(i.ncirc), spac: num(i.spac), tie: i.tie,
    Pu: num(i.Pu), Mux: num(i.Mux), Muy: num(i.Muy),
  }
}

/** Hitung; null bila input tidak valid atau geometri tidak konsisten. */
export function computeColumn(i: ColumnInput): ColumnPMResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeColumnPM(toCalcInput(i))
  return r.valid ? r : null
}

export function rejectReason(i: ColumnInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeColumnPM(toCalcInput(i))
  return r.valid ? null : r.warn[0] ?? 'Input tidak dapat dihitung.'
}

/** Indeks meridian permukaan untuk arah θ (derajat): 0° = lentur thd sumbu-y, 90° = thd sumbu-x. */
export const meridian = (r: ColumnPMResult, deg: number): SurfacePoint[] => r.surf![Math.round((deg / 360) * (r.surf!.length - 1)) % (r.surf!.length - 1)]

/**
 * Kurva interaksi uniaksial (momen bertanda, P): sisi positif dari θ, sisi negatif dari θ + 180°.
 * `axis` 'x' → (Mx, P); 'y' → (My, P). `nominal` memakai Mn, Pn tanpa φ (tanpa plafon).
 */
export function uniaxialCurve(r: ColumnPMResult, axis: 'x' | 'y', nominal = false): [number, number][] {
  const key = axis === 'x' ? 'Mx' : 'My'
  const pos = meridian(r, axis === 'x' ? 90 : 0), neg = meridian(r, axis === 'x' ? 270 : 180)
  const pick = (p: SurfacePoint): [number, number] =>
    nominal ? [(key === 'Mx' ? p.nMx : p.nMy) ?? 0, p.nP ?? 0] : [p[key], p.P]
  const inner = (row: SurfacePoint[]) => (nominal ? row.slice(1, -1) : row)
  return [...inner(pos).map(pick), ...inner(neg).map(pick).reverse()]
}
