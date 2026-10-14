import { computeGable, type GableInput, type GableResult } from '../../calc/gable-frame'
import { fx } from '../../report/model'
import { parseNum, type FieldErrors } from '../form'
import type { FrameDim } from '../_frame/figure'
import type { FrameView } from '../_frame/geom'
import { sectionFields, validateSection, type SectionInput } from '../_frame/section'

// Input UI Analisis Portal Gable (2 kolom + 2 rafter, satu bentang): profil baja kolom & rafter, kemiringan atap,
// beban atap per proyeksi horizontal, daftar beban terpusat, lateral di eave. toCalcInput() → bentuk datar lama.

export const MAX_POINT = 4

export interface PointLoad {
  /** kN (+ ke bawah) */
  P: string
  /** m horizontal dari kolom kiri */
  a: string
}

export interface GableUIInput {
  /** m, m, ° */
  H: string
  Lb: string
  alpha: string
  support: 'sendi' | 'jepit'
  self: 'ya' | 'tidak'
  col: SectionInput
  raf: SectionInput
  /** kN/m per proyeksi horizontal */
  q: string
  point: PointLoad[]
  HL1: string
  HL2: string
}

const steel = (psize: string): SectionInput => ({ mat: 'baja', ptype: 'WF', psize, grade: 'BJ 37', Fy: '240', b: '300', h: '400', fc: '25' })

/** Input bawaan = kasus golden "default jepit alfa 20" (build lama: tanpa beban terpusat). */
export const GABLE_DEFAULTS: GableUIInput = {
  H: '4',
  Lb: '8',
  alpha: '20',
  support: 'jepit',
  self: 'ya',
  col: steel('300×150×6.5×9'),
  raf: steel('250×125×6×9'),
  q: '12',
  point: [],
  HL1: '0',
  HL2: '0',
}

export function validate(i: GableUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: string, s: string, rule: (n: number) => string | null) => {
    const n = parseNum(s)
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  need('H', i.H, pos)
  need('Lb', i.Lb, pos)
  need('alpha', i.alpha, (n) => (n < 0 || n > 75 ? '0 … 75°' : null))
  need('q', i.q, () => null)
  need('HL1', i.HL1, () => null)
  need('HL2', i.HL2, () => null)
  validateSection(e, 'col', { ...i.col, mat: 'baja' })
  validateSection(e, 'raf', { ...i.raf, mat: 'baja' })
  const L = parseNum(i.Lb)
  i.point.forEach((p, k) => {
    need(`point.${k}.P`, p.P, () => null)
    need(`point.${k}.a`, p.a, (n) => (n < 0 ? 'Tidak boleh negatif' : L !== null && L > 0 && n > L ? `Maks. L = ${L} m` : null))
  })
  return e
}

/** Bentuk datar compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: GableUIInput): GableInput {
  const n = (s: string) => parseNum(s) ?? 0
  const v: GableInput = {
    H: n(i.H), Lb: n(i.Lb), alpha: n(i.alpha), support: i.support, self: i.self, q: n(i.q), HL1: n(i.HL1), HL2: n(i.HL2),
    np: Math.min(MAX_POINT, i.point.length),
    ...sectionFields({ ...i.col, mat: 'baja' }, 'c'),
    ...sectionFields({ ...i.raf, mat: 'baja' }, 'r'),
  }
  i.point.slice(0, MAX_POINT).forEach((p, k) => {
    v[`p${k + 1}_P`] = n(p.P)
    v[`p${k + 1}_a`] = n(p.a)
  })
  return v
}

export interface GableOutcome {
  input: GableUIInput
  r: GableResult
}

export function computeGableUI(i: GableUIInput): GableOutcome | null {
  if (Object.keys(validate(i)).length) return null
  return { input: i, r: computeGable(toCalcInput(i)) }
}

export const MEMBER_NAMES = ['Kolom kiri', 'Kolom kanan', 'Rafter kiri', 'Rafter kanan']

/** Titik di atap pada posisi horizontal a (m). */
const roofAt = (r: GableResult, a: number): [number, number] => {
  const half = r.Lb! / 2
  return [a, r.H! + (half > 0 ? (a <= half ? a / half : (r.Lb! - a) / half) : 0) * r.rise!]
}

export function gableView(r: GableResult): FrameView {
  const H = r.H!, L = r.Lb!, top = r.apexY!
  const df = r.defl!
  const hasQ = Math.abs(r.qsup!) > 1e-9
  return {
    nodes: [[0, 0], [L, 0], [0, H], [L, H], [L / 2, top]],
    elems: r.elems!,
    names: MEMBER_NAMES,
    D: r.D!,
    fixed: !!r.fixed,
    supports: [0, 1],
    reactions: [r.RA!, r.RB!],
    loads: {
      dist: hasQ
        ? [
            { a: [0, H], b: [L / 2, top], label: `q = ${fx(r.qsup, 2)} kN/m` },
            { a: [L / 2, top], b: [L, H], label: '' },
          ]
        : [],
      points: r.inpPt!.map((p, k) => ({ at: roofAt(r, p.a), P: p.P, label: `P${k + 1} = ${fx(p.P, 1)} kN` })),
      lateral: [
        ...(Math.abs(r.HL1!) > 1e-9 ? [{ at: [0, H] as [number, number], H: r.HL1!, label: `H₁ = ${fx(Math.abs(r.HL1!), 1)} kN` }] : []),
        ...(Math.abs(r.HL2!) > 1e-9 ? [{ at: [L, H] as [number, number], H: r.HL2!, label: `H₂ = ${fx(Math.abs(r.HL2!), 1)} kN` }] : []),
      ],
    },
    deflLabels: [
      { node: 2, text: `Δ = ${fx(Math.abs(df.ux2), 2)} mm`, side: 'l' },
      { node: 3, text: `Δ = ${fx(Math.abs(df.ux3), 2)} mm`, side: 'r' },
      { node: 4, text: `Δy = ${fx(df.apexV, 2)} mm`, side: 'b' },
    ],
  }
}

export function gableDims(r: GableResult): FrameDim[] {
  return [
    { text: `L = ${fx(r.Lb, 2)} m`, a: [0, 0], b: [r.Lb!, 0], side: 'b' },
    { text: `H = ${fx(r.H, 2)} m`, a: [r.Lb!, 0], b: [r.Lb!, r.H!], side: 'r' },
    ...(r.rise! > 1e-6 ? [{ text: `f = ${fx(r.rise, 2)} m`, a: [r.Lb!, r.H!] as [number, number], b: [r.Lb!, r.apexY!] as [number, number], side: 'r' as const }] : []),
  ]
}
