import { computePortal, type PortalInput, type PortalResult } from '../../calc/portal-frame'
import { fx } from '../../report/model'
import { parseNum, type FieldErrors } from '../form'
import type { FrameDim } from '../_frame/figure'
import type { FrameView } from '../_frame/geom'
import { sectionFields, validateSection, type SectionInput } from '../_frame/section'

// Input UI Analisis Portal (2 kolom + 1 balok): penampang per batang (baja/beton), daftar beban terpusat, angka
// sebagai teks form. toCalcInput() → bentuk datar compute lama (cmat, bpsize, p1_P, …).

export const MAX_POINT = 4

export interface PointLoad {
  /** kN (+ ke bawah) */
  P: string
  /** m dari kolom kiri */
  a: string
}

export interface PortalUIInput {
  /** m */
  H: string
  Lb: string
  support: 'sendi' | 'jepit'
  self: 'ya' | 'tidak'
  col: SectionInput
  beam: SectionInput
  /** kN/m, di luar berat sendiri */
  q: string
  point: PointLoad[]
  /** kN, + ke kanan */
  HL1: string
  HL2: string
}

/** Input bawaan = kasus golden "default baja jepit" (build lama: tanpa beban terpusat). */
export const PORTAL_DEFAULTS: PortalUIInput = {
  H: '4',
  Lb: '6',
  support: 'jepit',
  self: 'ya',
  col: { mat: 'baja', ptype: 'WF', psize: '250×250×9×14', grade: 'BJ 37', Fy: '240', b: '300', h: '400', fc: '25' },
  beam: { mat: 'baja', ptype: 'WF', psize: '400×200×8×13', grade: 'BJ 37', Fy: '240', b: '250', h: '500', fc: '25' },
  q: '20',
  point: [],
  HL1: '0',
  HL2: '0',
}

export function validate(i: PortalUIInput): FieldErrors {
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
  need('q', i.q, () => null)
  need('HL1', i.HL1, () => null)
  need('HL2', i.HL2, () => null)
  validateSection(e, 'col', i.col)
  validateSection(e, 'beam', i.beam)
  const L = parseNum(i.Lb)
  i.point.forEach((p, k) => {
    need(`point.${k}.P`, p.P, () => null)
    need(`point.${k}.a`, p.a, (n) => (n < 0 ? 'Tidak boleh negatif' : L !== null && L > 0 && n > L ? `Maks. L = ${L} m` : null))
  })
  return e
}

/** Bentuk datar compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: PortalUIInput): PortalInput {
  const n = (s: string) => parseNum(s) ?? 0
  const v: PortalInput = {
    H: n(i.H), Lb: n(i.Lb), support: i.support, self: i.self, q: n(i.q), HL1: n(i.HL1), HL2: n(i.HL2),
    np: Math.min(MAX_POINT, i.point.length),
    ...sectionFields(i.col, 'c'),
    ...sectionFields(i.beam, 'b'),
  }
  i.point.slice(0, MAX_POINT).forEach((p, k) => {
    v[`p${k + 1}_P`] = n(p.P)
    v[`p${k + 1}_a`] = n(p.a)
  })
  return v
}

export interface PortalOutcome {
  input: PortalUIInput
  r: PortalResult
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computePortalUI(i: PortalUIInput): PortalOutcome | null {
  if (Object.keys(validate(i)).length) return null
  return { input: i, r: computePortal(toCalcInput(i)) }
}

export const MEMBER_NAMES = ['Kolom kiri', 'Kolom kanan', 'Balok']

/** Data gambar rangka (SVG & laporan) dari hasil sah. */
export function portalView(r: PortalResult): FrameView {
  const H = r.H!, L = r.Lb!
  const df = r.defl!
  const wq = Math.abs(r.wbeam!)
  return {
    nodes: [[0, 0], [L, 0], [0, H], [L, H]],
    elems: r.elems!,
    names: MEMBER_NAMES,
    D: r.D!,
    fixed: !!r.fixed,
    supports: [0, 1],
    reactions: [r.RA!, r.RB!],
    loads: {
      dist: wq > 1e-9 ? [{ a: [0, H], b: [L, H], label: `w = ${fx(wq, 2)} kN/m` }] : [],
      points: r.inpPt!.map((p, k) => ({ at: [p.a, H], P: p.P, label: `P${k + 1} = ${fx(p.P, 1)} kN` })),
      lateral: [
        ...(Math.abs(r.HL1!) > 1e-9 ? [{ at: [0, H] as [number, number], H: r.HL1!, label: `H₁ = ${fx(Math.abs(r.HL1!), 1)} kN` }] : []),
        ...(Math.abs(r.HL2!) > 1e-9 ? [{ at: [L, H] as [number, number], H: r.HL2!, label: `H₂ = ${fx(Math.abs(r.HL2!), 1)} kN` }] : []),
      ],
    },
    deflLabels: [
      { node: 2, text: `Δ = ${fx(Math.abs(df.ux2), 2)} mm`, side: 'l' },
      { node: 3, text: `Δ = ${fx(Math.abs(df.ux3), 2)} mm`, side: 'r' },
      { elem: 2, t: L > 0 ? df.sagX / L : 0.5, text: `δ = ${fx(Math.abs(df.sag), 2)} mm`, side: 'b' },
    ],
  }
}

export function portalDims(r: PortalResult): FrameDim[] {
  return [
    { text: `L = ${fx(r.Lb, 2)} m`, a: [0, 0], b: [r.Lb!, 0], side: 'b' },
    { text: `H = ${fx(r.H, 2)} m`, a: [r.Lb!, 0], b: [r.Lb!, r.H!], side: 'r' },
  ]
}
