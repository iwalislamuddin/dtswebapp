// Analisis portal sederhana (2 kolom + 1 balok, satu bentang satu tingkat) — matrix stiffness 12 DOF.
// Port 1:1 dari modules/portal-frame/module.js (compute), diverifikasi golden test.
//
//   Simpul: N0 kaki kiri (0,0), N1 kaki kanan (Lb,0), N2 puncak kiri (0,H), N3 puncak kanan (Lb,H).
//   Batang: kolom kiri N0→N2, kolom kanan N1→N3, balok N2→N3. Tumpuan sendi atau jepit.
//   Beban: berat sendiri (opsional), q merata balok, ≤ 4 terpusat pada balok, lateral H1/H2 di puncak kolom.
//   Penampang baja (library) atau beton persegi (E = 4700√f'c, I bruto).
// Alat bantu ANALISIS elastis — bukan cek kapasitas.

import { analyzeFrame, hermiteV, memberEndReaction, type FrameMember, type FrameSection, type SpanPoint } from './shared/frame2d'
import { formatNumber } from './shared/format'
import { getProfile, typeInfo, type SteelProfile } from './shared/steel-profiles'

const MAX_PT = 4
const EPS = 1e-6
const GAMMA_C = 24 // kN/m³
const G = 9.81 // kg/m → kN/m

/** Tipe profil yang didukung portal/gable. */
export const FRAME_PROFILE_TYPES = ['WF', 'UNP', 'SHS', 'RHS', 'PIPE']

/** Input form; penampang pakai prefiks 'c' (kolom) / 'b' (balok): {pre}mat, {pre}ptype, {pre}psize, {pre}fy, {pre}b, {pre}h, {pre}fc. */
export interface PortalInput {
  /** Tinggi kolom & panjang balok (m). */
  H: number
  Lb: number
  support: 'sendi' | 'jepit'
  self: 'ya' | 'tidak'
  /** Beban merata tambahan balok (kN/m). */
  q: number
  /** Lateral di puncak kolom kiri/kanan (kN, + ke kanan). */
  HL1: number
  HL2: number
  np: number
  [field: string]: number | string
}

export interface MemberSection extends FrameSection {
  wLine: number
  mat: 'baja' | 'beton'
  label: string
  note: string
  prof?: SteelProfile
  Fy?: number
  b?: number
  h?: number
  fc?: number
}

export interface PortalMember extends FrameMember {
  sec: MemberSection
  pts: SpanPoint[]
}

export interface FrameDeflection {
  /** mm, mrad */
  ux2: number
  uy2: number
  rot2: number
  ux3: number
  uy3: number
  rot3: number
  drift: number
  driftRatio: number
}

export interface PortalResult {
  valid: boolean
  warn: string[]
  msg?: string
  col?: MemberSection
  beam?: MemberSection
  /** m */
  H?: number
  Lb?: number
  fixed?: boolean
  /** mm */
  nodes?: number[][]
  wcol?: number
  wbeam?: number
  qsup?: number
  inpPt?: { P: number; a: number }[]
  HL1?: number
  HL2?: number
  D?: number[]
  elems?: PortalMember[]
  /** kNm, kN, kN */
  Mmax?: number
  Vmax?: number
  Nmax?: number
  RA?: { Rx: number; Ry: number; M: number }
  RB?: { Rx: number; Ry: number; M: number }
  Wgrav?: number
  sumRy?: number
  sumRx?: number
  defl?: FrameDeflection & { sag: number; sagX: number; vMid: number; vAbs: number; vAbsX: number; sagRatio: number }
}

/** Nilai berhingga atau 0 (global isFinite seperti build lama). */
export const fin = (x: unknown): number => (isFinite(x as number) ? (x as number) : 0)
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x))
export const fmtm = (x: number): number => Math.round(x * 1000) / 1000

/** Penampang baja dari library (lentur sumbu kuat). */
export function steelSection(v: Record<string, unknown>, pre: string): MemberSection | null {
  const prof = getProfile(v[pre + 'ptype'] as string, v[pre + 'psize'] as string)
  if (!prof) return null
  const Fy = fin(v[pre + 'fy']) || 240
  return {
    A: prof.A * 100, I: prof.Ix * 1e4, S: (prof.Sx as number) * 1e3, E: 200000,
    wLine: (prof.w * G) / 1000, mat: 'baja', prof, Fy,
    label: typeInfo(v[pre + 'ptype'] as string)!.name + ' ' + prof.name,
    note: 'E=200000 MPa · Ix=' + formatNumber(prof.Ix, 0) + ' cm⁴ · Sx=' + formatNumber(prof.Sx, 1) + ' cm³ · lentur sumbu kuat',
  }
}

function sectionProps(v: PortalInput, pre: string): MemberSection | null {
  if (v[pre + 'mat'] === 'beton') {
    const b = fin(v[pre + 'b']), h = fin(v[pre + 'h']), fc = fin(v[pre + 'fc'])
    if (!(b > 0 && h > 0)) return null
    const A = b * h
    const E = 4700 * Math.sqrt(Math.max(1, fc))
    return {
      A, I: (b * h * h * h) / 12, S: (b * h * h) / 6, E, wLine: A * 1e-6 * GAMMA_C, mat: 'beton',
      label: 'Beton ' + fmtm(b) + '×' + fmtm(h) + ' mm', b, h, fc,
      note: "fc' " + fmtm(fc) + " MPa · E=4700√fc'=" + Math.round(E) + ' MPa · I bruto',
    }
  }
  return steelSection(v, pre)
}

export function computePortal(v: PortalInput): PortalResult {
  const r: PortalResult = { valid: true, warn: [] }
  const col = sectionProps(v, 'c')
  const beam = sectionProps(v, 'b')
  if (!col) { r.valid = false; r.msg = 'Lengkapi penampang KOLOM.'; return r }
  if (!beam) { r.valid = false; r.msg = 'Lengkapi penampang BALOK.'; return r }
  r.col = col
  r.beam = beam

  const Hm = fin(v.H), Lbm = fin(v.Lb)
  if (!(Hm > 0) || !(Lbm > 0)) { r.valid = false; r.msg = 'Isi tinggi kolom & panjang balok.'; return r }
  const H = Hm * 1000, Lb = Lbm * 1000
  Object.assign(r, { H: Hm, Lb: Lbm, fixed: v.support === 'jepit' })
  const nodes = [[0, 0], [Lb, 0], [0, H], [Lb, H]]
  r.nodes = nodes

  // Beban bentang: kolom berat sendiri aksial (−lokal x), balok gravitasi (−lokal y).
  const selfOn = v.self === 'ya'
  const wcx = selfOn ? -col.wLine : 0
  const qsup = fin(v.q)
  const wby = -((selfOn ? beam.wLine : 0) + qsup)
  Object.assign(r, { wcol: wcx, wbeam: wby, qsup })

  const pts: SpanPoint[] = []
  const inpPt: { P: number; a: number }[] = []
  r.inpPt = inpPt
  const np = Math.max(0, Math.min(MAX_PT, Math.round(fin(v.np))))
  for (let i = 1; i <= np; i++) {
    const P = fin(v['p' + i + '_P']), a = fin(v['p' + i + '_a'])
    if (!(Math.abs(P) > 0)) continue
    const ca = clamp(a, 0, Lbm)
    if (ca !== a) r.warn.push('Beban terpusat #' + i + ': posisi dipotong ke 0…' + fmtm(Lbm) + ' m.')
    inpPt.push({ P, a: ca })
    pts.push({ P: -P * 1000, a: ca * 1000 })
  }
  const H1 = fin(v.HL1), H2 = fin(v.HL2)
  Object.assign(r, { HL1: H1, HL2: H2 })

  const elems: PortalMember[] = [
    { ni: 0, nj: 2, sec: col, wx: wcx, wy: 0, pts: [] }, // kolom kiri
    { ni: 1, nj: 3, sec: col, wx: wcx, wy: 0, pts: [] }, // kolom kanan
    { ni: 2, nj: 3, sec: beam, wx: 0, wy: wby, pts }, // balok
  ]
  for (const e of elems) {
    const dx = nodes[e.nj][0] - nodes[e.ni][0], dy = nodes[e.nj][1] - nodes[e.ni][1]
    const L = Math.hypot(dx, dy)
    Object.assign(e, { L, cx: dx / L, cy: dy / L })
  }

  const ND = 12
  const F = Array.from({ length: ND }, () => 0)
  F[6] += H1 * 1000 // lateral di N2 & N3 (global x)
  F[9] += H2 * 1000
  const fixedDof: number[] = []
  for (const nd of [0, 1]) {
    fixedDof.push(nd * 3, nd * 3 + 1)
    if (r.fixed) fixedDof.push(nd * 3 + 2)
  }
  const sol = analyzeFrame(elems, ND, F, fixedDof, (e) => e.pts)
  if (!sol) { r.valid = false; r.msg = 'Struktur tidak stabil (mekanisme). Periksa tumpuan/penampang.'; return r }
  const D = sol.D
  Object.assign(r, { D, elems, Mmax: sol.maxM / 1e6, Vmax: sol.maxV / 1e3, Nmax: sol.maxN / 1e3 })

  const RA = memberEndReaction(elems[0], true) // kaki kolom kiri
  const RB = memberEndReaction(elems[1], true) // kaki kolom kanan
  let Wgrav = 0
  Wgrav += (Math.abs(wby) * Lb) / 1e3
  for (const p of inpPt) Wgrav += p.P
  if (selfOn) Wgrav += ((Math.abs(wcx) * H) / 1e3) * 2
  Object.assign(r, { RA, RB, Wgrav, sumRy: RA.Ry + RB.Ry, sumRx: RA.Rx + RB.Rx })

  // Deformasi: puncak kolom & lendutan balok (Hermite, terhadap tali busur).
  const ux2 = D[6], uy2 = D[7], rot2 = D[8], ux3 = D[9], uy3 = D[10], rot3 = D[11]
  const driftMax = Math.abs(ux2) >= Math.abs(ux3) ? ux2 : ux3
  const bm = elems[2], dl = bm.dloc as number[]
  let sagRel = 0, sagX = 0, vMid = 0, vAbsMax = 0, vAbsX = 0
  for (let s = 0; s <= 40; s++) {
    const t = s / 40
    const vloc = hermiteV(dl, bm.L as number, t) // vertikal absolut (+ atas)
    const rel = vloc - (dl[1] * (1 - t) + dl[4] * t)
    if (Math.abs(rel) > Math.abs(sagRel)) { sagRel = rel; sagX = t * Lbm }
    if (Math.abs(vloc) > Math.abs(vAbsMax)) { vAbsMax = vloc; vAbsX = t * Lbm }
    if (t === 0.5) vMid = vloc
  }
  r.defl = {
    ux2, uy2, rot2: rot2 * 1000, ux3, uy3, rot3: rot3 * 1000,
    drift: driftMax, driftRatio: Math.abs(driftMax) > EPS ? H / Math.abs(driftMax) : Infinity,
    sag: sagRel, sagX, vMid, vAbs: vAbsMax, vAbsX, sagRatio: Math.abs(sagRel) > EPS ? Lb / Math.abs(sagRel) : Infinity,
  }
  return r
}
