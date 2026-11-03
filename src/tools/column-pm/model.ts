import { checkLoad, computeColumnPM, type ColumnPMInput, type ColumnPMResult, type ColumnShape, type ColumnTie, type LoadCheck, type SurfacePoint } from '../../calc/column-pm'
import { checker, intRange, num, parseNum, pos, type FieldErrors } from '../form'

// Input UI Diagram P–M Kolom: angka sebagai teks form; field per bentuk penampang; beban terfaktor bisa banyak
// (semua diplot, D/C terbesar menentukan). toCalcInput() → compute lama dengan beban pertama.

export type { FieldErrors }

export const SHAPES: { value: ColumnShape; label: string }[] = [
  { value: 'rect', label: 'Persegi' },
  { value: 'circle', label: 'Lingkaran' },
  { value: 'L', label: 'L' },
  { value: 'T', label: 'T' },
]
export const COL_BARS = [13, 16, 19, 22, 25, 29, 32, 36]
export const MAX_LOADS = 30

/** Satu kombinasi beban terfaktor (tekan positif). */
export type LoadRow = { Pu: string; Mux: string; Muy: string }

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
  loads: LoadRow[]
}

/** Input bawaan = kasus golden "default persegi uniaksial" (400 × 400, 8D19, Pu 1200 kN, Mux 150 kN·m). */
export const COLUMN_DEFAULTS: ColumnInput = {
  shape: 'rect', b: '400', h: '400', D: '500', tx: '150', ty: '150', bw: '200', tf: '150', dp: '60', fc: '25', fy: '400', db: '19',
  nx: '3', ny: '3', ncirc: '8', spac: '200', tie: 'tie',
  loads: [{ Pu: '1200', Mux: '150', Muy: '0' }],
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
  if (i.loads.length < 1) e.loads = 'Minimal 1 beban'
  else if (i.loads.length > MAX_LOADS) e.loads = `Maksimum ${MAX_LOADS} beban`
  i.loads.forEach((l, k) => {
    for (const c of ['Pu', 'Mux', 'Muy'] as const) if (parseNum(l[c]) === null) e[`loads.${k}.${c}`] = 'Isi angka'
  })
  return e
}

/** Bentuk compute lama (beban pertama). Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: ColumnInput): ColumnPMInput {
  return {
    shape: i.shape, b: num(i.b), h: num(i.h), D: num(i.D), tx: num(i.tx), ty: num(i.ty), bw: num(i.bw), tf: num(i.tf), dp: num(i.dp),
    fc: num(i.fc), fy: num(i.fy), db: Number(i.db), nx: num(i.nx), ny: num(i.ny), ncirc: num(i.ncirc), spac: num(i.spac), tie: i.tie,
    Pu: num(i.loads[0].Pu), Mux: num(i.loads[0].Mux), Muy: num(i.loads[0].Muy),
  }
}

/** Hasil kolom + cek tiap beban; Pu, Mux, Muy, Mu, contour, capM, dc milik beban penentu `gov`. */
export type ColumnResult = ColumnPMResult & { loads: LoadCheck[]; gov: number }

const isLoadWarn = (w: string) => w.startsWith('Pu = ') || w.startsWith('Pu tarik') || w.startsWith('D/C = ')

/** Hitung; null bila input tidak valid atau geometri tidak konsisten. */
export function computeColumn(i: ColumnInput): ColumnResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeColumnPM(toCalcInput(i))
  if (!r.valid) return null
  const loads = i.loads.map((l) => checkLoad(r, num(l.Pu), num(l.Mux), num(l.Muy)))
  const gov = loads.reduce((g, l, k) => ((l.dc ?? -1) > (loads[g].dc ?? -1) ? k : g), 0)
  if (loads.length === 1) return { ...r, loads, gov }
  // Banyak beban: peringatan beban diberi nomor; data cek di r diganti milik beban penentu.
  const perLoad = loads.flatMap((l, k) => [
    ...(l.axialWarn ? [`Beban ${k + 1}: ${l.axialWarn}`] : []),
    ...(l.dc != null && l.dc > 1 ? [`Beban ${k + 1}: D/C = ${l.dc.toFixed(2)} > 1 — titik beban di LUAR permukaan desain.`] : []),
  ])
  const warn = r.warn.filter((w) => !isLoadWarn(w))
  warn.splice(Math.max(0, warn.length - 1), 0, ...perLoad)
  const g = loads[gov]
  return { ...r, Pu: g.Pu, Mux: g.Mux, Muy: g.Muy, Mu: g.Mu, contour: g.contour, capM: g.capM, dc: g.dc, warn, loads, gov }
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
