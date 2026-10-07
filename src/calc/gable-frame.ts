// Analisis portal gable (rangka atap pelana, satu bentang) — matrix stiffness 15 DOF, penampang baja.
// Port 1:1 dari modules/gable-frame/module.js (compute), diverifikasi golden test.
//
//   Simpul: N0/N1 kaki kolom, N2/N3 eave (0,H)/(Lb,H), N4 ridge (Lb/2, H + rise), rise = (Lb/2)·tan α.
//   Batang: kolom kiri/kanan, rafter kiri N2→N4, rafter kanan N3→N4. α = 0 → portal biasa (ridge di tengah).
//   Beban atap: berat sendiri (sepanjang batang) + q per proyeksi horizontal + terpusat vertikal di posisi
//   horizontal a; diuraikan ke komponen lokal aksial + lintang rafter. Lateral H1/H2 di eave.
// Alat bantu ANALISIS elastis — bukan cek kapasitas.

import { analyzeFrame, hermiteV, memberEndReaction, type FrameMember, type SpanPoint } from './shared/frame2d'
import { clamp, fin, fmtm, steelSection, type FrameDeflection, type MemberSection } from './portal-frame'

const MAX_PT = 4
const EPS = 1e-6

/** Input form; penampang pakai prefiks 'c' (kolom) / 'r' (rafter): {pre}ptype, {pre}psize, {pre}fy. */
export interface GableInput {
  H: number
  Lb: number
  /** Kemiringan atap (°), dipotong 0…75. */
  alpha: number
  support: 'sendi' | 'jepit'
  self: 'ya' | 'tidak'
  /** Beban atap per proyeksi horizontal (kN/m). */
  q: number
  HL1: number
  HL2: number
  np: number
  [field: string]: number | string
}

export interface GableMember extends FrameMember {
  sec: MemberSection
  kind: 'col' | 'raf'
  ptsY: SpanPoint[]
  ptsX: SpanPoint[]
  /** Intensitas vertikal per panjang batang (kN/m). */
  wv?: number
}

export interface GableResult {
  valid: boolean
  warn: string[]
  msg?: string
  col?: MemberSection
  raf?: MemberSection
  /** m, °, m, m */
  H?: number
  Lb?: number
  alpha?: number
  rise?: number
  apexY?: number
  fixed?: boolean
  nodes?: number[][]
  Lraf?: number
  qsup?: number
  selfOn?: boolean
  inpPt?: { P: number; a: number }[]
  HL1?: number
  HL2?: number
  D?: number[]
  elems?: GableMember[]
  Mmax?: number
  Vmax?: number
  Nmax?: number
  RA?: { Rx: number; Ry: number; M: number }
  RB?: { Rx: number; Ry: number; M: number }
  Wgrav?: number
  sumRy?: number
  sumRx?: number
  defl?: FrameDeflection & {
    ux4: number
    uy4: number
    rot4: number
    apexV: number
    apexRatio: number
    rafSag: number
    rafSagX: number
    rafWhich: 'kiri' | 'kanan'
    rafRatio: number
  }
}

export function computeGable(v: GableInput): GableResult {
  const r: GableResult = { valid: true, warn: [] }
  const col = steelSection(v, 'c')
  const raf = steelSection(v, 'r')
  if (!col) { r.valid = false; r.msg = 'Lengkapi penampang KOLOM.'; return r }
  if (!raf) { r.valid = false; r.msg = 'Lengkapi penampang RAFTER.'; return r }
  r.col = col
  r.raf = raf

  const Hm = fin(v.H), Lbm = fin(v.Lb)
  if (!(Hm > 0) || !(Lbm > 0)) { r.valid = false; r.msg = 'Isi tinggi kolom & bentang.'; return r }
  const alpha = clamp(fin(v.alpha), 0, 75)
  if (alpha !== fin(v.alpha)) r.warn.push('Kemiringan atap dipotong ke 0…75°.')
  const riseM = (Lbm / 2) * Math.tan((alpha * Math.PI) / 180)
  const apexM = Hm + riseM
  const H = Hm * 1000, Lb = Lbm * 1000, apex = apexM * 1000
  Object.assign(r, { H: Hm, Lb: Lbm, alpha, rise: riseM, apexY: apexM, fixed: v.support === 'jepit' })
  const nodes = [[0, 0], [Lb, 0], [0, H], [Lb, H], [Lb / 2, apex]]
  r.nodes = nodes

  const elems: GableMember[] = [
    { ni: 0, nj: 2, sec: col, kind: 'col', wx: 0, wy: 0, ptsY: [], ptsX: [] }, // kolom kiri
    { ni: 1, nj: 3, sec: col, kind: 'col', wx: 0, wy: 0, ptsY: [], ptsX: [] }, // kolom kanan
    { ni: 2, nj: 4, sec: raf, kind: 'raf', wx: 0, wy: 0, ptsY: [], ptsX: [] }, // rafter kiri
    { ni: 3, nj: 4, sec: raf, kind: 'raf', wx: 0, wy: 0, ptsY: [], ptsX: [] }, // rafter kanan
  ]
  for (const e of elems) {
    const dx = nodes[e.nj][0] - nodes[e.ni][0], dy = nodes[e.nj][1] - nodes[e.ni][1]
    const L = Math.hypot(dx, dy)
    Object.assign(e, { L, cx: dx / L, cy: dy / L })
  }
  const Lraf = elems[2].L as number
  r.Lraf = Lraf / 1000
  const cosA = Lraf > 0 ? Lb / 2 / Lraf : 1

  // Gravitasi per batang: vertikal (0, −wv) diuraikan ke lokal x = −wv·cy, y = −wv·cx.
  const selfOn = v.self === 'ya'
  const qsup = fin(v.q)
  Object.assign(r, { qsup, selfOn })
  for (const e of elems) {
    let wv = selfOn ? e.sec.wLine : 0
    if (e.kind === 'raf') wv += qsup * cosA // q horizontal → per panjang rafter
    e.wv = wv
    e.wx = -wv * (e.cy as number)
    e.wy = -wv * (e.cx as number)
  }

  // Terpusat vertikal di atap (posisi horizontal dari kolom kiri).
  const inpPt: { P: number; a: number }[] = []
  r.inpPt = inpPt
  const np = Math.max(0, Math.min(MAX_PT, Math.round(fin(v.np))))
  for (let i = 1; i <= np; i++) {
    const P = fin(v['p' + i + '_P']), a = fin(v['p' + i + '_a'])
    if (!(Math.abs(P) > 0)) continue
    const ca = clamp(a, 0, Lbm)
    if (ca !== a) r.warn.push('Beban terpusat #' + i + ': posisi dipotong ke 0…' + fmtm(Lbm) + ' m.')
    inpPt.push({ P, a: ca })
    let eRaf: GableMember, tloc: number
    if (ca <= Lbm / 2) { eRaf = elems[2]; tloc = Lbm / 2 > 0 ? ca / (Lbm / 2) : 0 }
    else { eRaf = elems[3]; tloc = Lbm / 2 > 0 ? (Lbm - ca) / (Lbm / 2) : 0 }
    const aLoc = tloc * (eRaf.L as number)
    const Pn = P * 1000
    eRaf.ptsY.push({ P: -Pn * (eRaf.cx as number), a: aLoc })
    eRaf.ptsX.push({ P: -Pn * (eRaf.cy as number), a: aLoc })
  }
  const H1 = fin(v.HL1), H2 = fin(v.HL2)
  Object.assign(r, { HL1: H1, HL2: H2 })

  const ND = 15
  const F = Array.from({ length: ND }, () => 0)
  F[6] += H1 * 1000
  F[9] += H2 * 1000
  const fixedDof: number[] = []
  for (const nd of [0, 1]) {
    fixedDof.push(nd * 3, nd * 3 + 1)
    if (r.fixed) fixedDof.push(nd * 3 + 2)
  }
  const sol = analyzeFrame(elems, ND, F, fixedDof, (e) => e.ptsY, (e) => e.ptsX)
  if (!sol) { r.valid = false; r.msg = 'Struktur tidak stabil (mekanisme). Periksa tumpuan/penampang.'; return r }
  const D = sol.D
  Object.assign(r, { D, elems, Mmax: sol.maxM / 1e6, Vmax: sol.maxV / 1e3, Nmax: sol.maxN / 1e3 })

  const RA = memberEndReaction(elems[0], true)
  const RB = memberEndReaction(elems[1], true)
  let Wgrav = 0
  Wgrav += qsup * Lbm
  for (const p of inpPt) Wgrav += p.P
  if (selfOn) {
    Wgrav += col.wLine * Hm * 2
    Wgrav += raf.wLine * (r.Lraf as number) * 2
  }
  Object.assign(r, { RA, RB, Wgrav, sumRy: RA.Ry + RB.Ry, sumRx: RA.Rx + RB.Rx })

  const ux2 = D[6], uy2 = D[7], rot2 = D[8], ux3 = D[9], uy3 = D[10], rot3 = D[11], ux4 = D[12], uy4 = D[13], rot4 = D[14]
  const drift = Math.abs(ux2) >= Math.abs(ux3) ? ux2 : ux3
  // Lendutan rafter terhadap tali busur, terburuk dari kedua rafter.
  const best = { sag: 0, x: 0, which: 'kiri' as 'kiri' | 'kanan' }
  for (const [e, which] of [[elems[2], 'kiri'], [elems[3], 'kanan']] as [GableMember, 'kiri' | 'kanan'][]) {
    const d = e.dloc as number[]
    for (let s = 0; s <= 40; s++) {
      const t = s / 40
      const rel = hermiteV(d, e.L as number, t) - (d[1] * (1 - t) + d[4] * t)
      if (Math.abs(rel) > Math.abs(best.sag)) {
        best.sag = rel
        best.x = which === 'kiri' ? t * (Lbm / 2) : Lbm - t * (Lbm / 2)
        best.which = which
      }
    }
  }
  r.defl = {
    ux2, uy2, rot2: rot2 * 1000, ux3, uy3, rot3: rot3 * 1000, ux4, uy4, rot4: rot4 * 1000,
    drift, driftRatio: Math.abs(drift) > EPS ? H / Math.abs(drift) : Infinity,
    apexV: uy4, apexRatio: Math.abs(uy4) > EPS ? Lb / Math.abs(uy4) : Infinity,
    rafSag: best.sag, rafSagX: best.x, rafWhich: best.which,
    rafRatio: Math.abs(best.sag) > EPS ? ((r.Lraf as number) * 1000) / Math.abs(best.sag) : Infinity,
  }
  return r
}
