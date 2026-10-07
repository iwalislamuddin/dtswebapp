// Tangga beton bertulang sebagai rangka bidang (matrix stiffness) — SNI 2847:2019.
// Port 1:1 dari modules/concrete-stair/module.js (compute), diverifikasi golden test.
//
//   Rangka 4 simpul / 3 batang: bordes bawah L1, flight miring (L2, H), bordes atas L3 (batang panjang-nol dilewati).
//   Elemen aksial + lentur 6 DOF, penampang per 1 m (A = 1000·tw, I = 1000·tw³/12, E = 4700√f'c), beban bentang via FEF.
//   Beban flight: waist + anak tangga γc·(R/2)·cosθ + SDL·cosθ + LL·cosθ; bordes: waist + SDL (+LL).
//   Analisis 3×: ultimit (gaya desain), layan Ig, layan Ie Branson. Konvensi: aksial tarik (+), momen sagging (+).
// Field internal elemen (_kl, _T, _ff, _wx, _wy, wv_u, wv_s) dipertahankan seperti build lama (ikut di hasil).

import { effectiveInertia, stripDesign, type EffectiveInertia, type StripDesign } from './shared/concrete'
import { extAbs, fefLocal, kLocal, matMul, matT, matZ, solveLinear as solve, transform, type Mat } from './shared/frame2d'
import { numFinite as num, type NumLike } from './shared/num'

const GAMMA_C = 24
/** Pias diagram gaya dalam per batang. */
const NSEG = 24

export type StairSupport = 'sendi' | 'rol' | 'jepit'

export interface StairInput {
  /** Bordes bawah, flight (proyeksi horizontal), bordes atas, beda tinggi (m). */
  L1: NumLike
  L2: NumLike
  L3: NumLike
  H: NumLike
  /** Tinggi injakan & tebal waist (mm). */
  R: NumLike
  tw: NumLike
  fc: NumLike
  fy: NumLike
  /** Beban mati tambahan & hidup (kN/m²). */
  SDL: NumLike
  LL: NumLike
  cc: NumLike
  db: NumLike
  supA?: StairSupport
  supB?: StairSupport
}

export interface StairElement {
  ni: number
  nj: number
  /** mm */
  L: number
  cx: number
  cy: number
  kind: 'land' | 'flight'
  /** kN/m per 1 m lebar. */
  wD: number
  wL: number
  wv_u?: number
  wv_s?: number
  _kl?: Mat
  _T?: Mat
  _ff?: number[]
  _wx?: number
  _wy?: number
}

export interface ElementForces {
  ref: StairElement
  xs: number[]
  /** N, N, N·mm sepanjang batang. */
  Ns: number[]
  Vs: number[]
  Ms: number[]
  fLocal: number[]
  dloc: number[]
  Mmax: number
  Vmax: number
  Nmax: number
}

export interface FrameSolution {
  D: number[]
  elems: ElementForces[]
  maxM: number
  maxV: number
  maxN: number
}

export interface Reaction {
  Rx: number
  Ry: number
  M: number
}

export interface StairResult {
  warn: string[]
  valid: boolean
  L1?: number
  L2?: number
  L3?: number
  H?: number
  Ract?: number
  Tgo?: number
  Nrise?: number
  Ntread?: number
  theta?: number
  thetaDeg?: number
  cosT?: number
  tw?: number
  fc?: number
  fy?: number
  cc?: number
  db?: number
  SDL?: number
  LL?: number
  supA?: StairSupport
  supB?: StairSupport
  Ltot?: number
  /** Koordinat simpul (mm). */
  nodes?: number[][]
  idxA?: number
  idxB?: number
  Ec?: number
  Ag?: number
  Ig?: number
  elems?: StairElement[]
  flight?: StairElement
  wD_fl?: number
  wL_fl?: number
  wD_la?: number | null
  gWaist?: number
  gSteps?: number
  unstable?: boolean
  U?: FrameSolution
  Mmax?: number
  Vmax?: number
  Nmax?: number
  Mpos?: number
  Mneg?: number
  Sg?: FrameSolution
  MsPos?: number
  ie?: EffectiveInertia
  d?: number
  asPos?: StripDesign
  asNeg?: StripDesign
  dbDist?: number
  asDist?: StripDesign
  infeasible?: boolean
  phiVc?: number
  dcrVc?: number
  dUncr?: number
  Se?: FrameSolution
  dCr?: number
  xdef?: number
  limit360?: number
  limit250?: number
  defOk?: boolean
  RA?: Reaction
  RB?: Reaction
  Wu?: number
  sumRy?: number
  sumRx?: number
}

export function computeStair(v: StairInput): StairResult {
  const r: StairResult = { warn: [], valid: false }
  let L1 = num(v.L1), L3 = num(v.L3)
  const L2 = num(v.L2), H = num(v.H)
  const R = num(v.R), tw = num(v.tw), fc = num(v.fc), fy = num(v.fy)
  const SDL = num(v.SDL), LL = num(v.LL), cc = num(v.cc), db = num(v.db)
  const supA = v.supA || 'sendi', supB = v.supB || 'rol'
  if (!(L2 > 0) || !(H > 0) || !(tw > 0) || !(fc > 0) || !(fy > 0) || !(R > 0)) return r
  if (L1 < 0) L1 = 0
  if (L3 < 0) L3 = 0

  // Geometri anak tangga.
  const Nrise = Math.max(1, Math.round((H * 1000) / R))
  const Ract = (H * 1000) / Nrise
  const Ntread = Math.max(1, Nrise)
  const Tgo = (L2 * 1000) / Ntread
  const theta = Math.atan2(H, L2)
  const cosT = L2 / Math.hypot(L2, H)
  Object.assign(r, {
    L1, L2, L3, H, Ract, Tgo, Nrise, Ntread, theta, thetaDeg: (theta * 180) / Math.PI, cosT,
    tw, fc, fy, cc, db, SDL, LL, supA, supB, Ltot: L1 + L2 + L3,
  })

  // Simpul (mm).
  const pts: number[][] = [[0, 0]]
  if (L1 > 1e-6) pts.push([L1 * 1000, 0])
  pts.push([(L1 + L2) * 1000, H * 1000])
  if (L3 > 1e-6) pts.push([(L1 + L2 + L3) * 1000, H * 1000])
  const nN = pts.length, idxA = 0, idxB = nN - 1
  Object.assign(r, { nodes: pts, idxA, idxB })

  // Elemen.
  const Ec = 4700 * Math.sqrt(fc)
  const b = 1000, Ag = b * tw, Ig = (b * tw * tw * tw) / 12
  const wLine = GAMMA_C * (tw / 1000) // berat sendiri per panjang batang (kN/m)
  Object.assign(r, { Ec, Ag, Ig })
  const elems: StairElement[] = []
  for (let i = 0; i < nN - 1; i++) {
    const xi = pts[i], xj = pts[i + 1]
    const dx = xj[0] - xi[0], dy = xj[1] - xi[1], L = Math.hypot(dx, dy)
    const kind = Math.abs(dy) < 1e-6 ? 'land' : 'flight'
    let wD: number, wL: number
    if (kind === 'flight') {
      wD = wLine + ((GAMMA_C * (Ract / 1000)) / 2) * cosT + SDL * cosT // waist + anak tangga + SDL
      wL = LL * cosT
    } else {
      wD = wLine + SDL
      wL = LL
    }
    elems.push({ ni: i, nj: i + 1, L, cx: dx / L, cy: dy / L, kind, wD, wL })
  }
  const flight = elems.filter((e) => e.kind === 'flight')[0]
  const land = elems.filter((e) => e.kind === 'land')[0]
  Object.assign(r, {
    elems, flight, wD_fl: flight.wD, wL_fl: flight.wL, wD_la: land ? land.wD : null,
    gWaist: wLine, gSteps: ((GAMMA_C * (Ract / 1000)) / 2) * cosT,
  })

  // Solver rangka: mode 'u' (ultimit) | 's' (layan), Ival = momen inersia (mm⁴).
  const ND = nN * 3
  const supDofs = (idx: number, type: string): number[] => {
    const o = [idx * 3 + 1] // v selalu (rol)
    if (type === 'sendi' || type === 'jepit') o.push(idx * 3)
    if (type === 'jepit') o.push(idx * 3 + 2)
    return o
  }
  const dofMap = (e: StairElement) => [e.ni * 3, e.ni * 3 + 1, e.ni * 3 + 2, e.nj * 3, e.nj * 3 + 1, e.nj * 3 + 2]

  function solveFrame(mode: 'u' | 's', Ival: number): FrameSolution | null {
    const K = matZ(ND, ND), F = Array.from({ length: ND }, () => 0)
    for (const e of elems) {
      const wv = mode === 'u' ? Math.max(1.4 * e.wD, 1.2 * e.wD + 1.6 * e.wL) : e.wD + e.wL
      e[mode === 'u' ? 'wv_u' : 'wv_s'] = wv
      const wx = -wv * e.cy, wy = -wv * e.cx // vertikal (0, −wv) → lokal
      const kl = kLocal(Ec * Ag, Ec * Ival, e.L), T = transform(e.cx, e.cy)
      const kg = matMul(matMul(matT(T), kl), T)
      const ff = fefLocal(wx, wy, e.L)
      const ffg = matMul(matT(T), ff.map((x) => [x]))
      const map = dofMap(e)
      Object.assign(e, { _kl: kl, _T: T, _ff: ff, _wx: wx, _wy: wy })
      for (let a2 = 0; a2 < 6; a2++) {
        F[map[a2]] -= ffg[a2][0]
        for (let b2 = 0; b2 < 6; b2++) K[map[a2]][map[b2]] += kg[a2][b2]
      }
    }
    const isFixed = Array.from({ length: ND }, () => false)
    for (const d of supDofs(idxA, supA).concat(supDofs(idxB, supB))) isFixed[d] = true
    const free: number[] = []
    for (let q = 0; q < ND; q++) if (!isFixed[q]) free.push(q)
    const nf = free.length, Kr = matZ(nf, nf), Fr = Array.from({ length: nf }, () => 0)
    for (let q = 0; q < nf; q++) {
      Fr[q] = F[free[q]]
      for (let j = 0; j < nf; j++) Kr[q][j] = K[free[q]][free[j]]
    }
    const dr = solve(Kr, Fr)
    if (!dr) return null
    const D = Array.from({ length: ND }, () => 0)
    for (let q = 0; q < nf; q++) D[free[q]] = dr[q]

    const out: FrameSolution = { D, elems: [], maxM: 0, maxV: 0, maxN: 0 }
    for (const e of elems) {
      const dloc = matMul(e._T as Mat, dofMap(e).map((m) => [D[m]]))
      const fl = matMul(e._kl as Mat, dloc)
      const fLocal = fl.map((row, k) => row[0] + (e._ff as number[])[k])
      const xs: number[] = [], Ns: number[] = [], Vs: number[] = [], Ms: number[] = []
      for (let s = 0; s <= NSEG; s++) {
        const x = (e.L * s) / NSEG
        xs.push(x)
        const Wx = (e._wx as number) * x, Wy = (e._wy as number) * x
        const Nv = -(fLocal[0] + Wx), Vv = -(fLocal[1] + Wy)
        const Mv = -fLocal[2] + fLocal[1] * x + ((e._wy as number) * x * x) / 2
        Ns.push(Nv)
        Vs.push(Vv)
        Ms.push(Mv)
        if (Math.abs(Nv) > Math.abs(out.maxN)) out.maxN = Nv
        if (Math.abs(Vv) > Math.abs(out.maxV)) out.maxV = Vv
        if (Math.abs(Mv) > Math.abs(out.maxM)) out.maxM = Mv
      }
      out.elems.push({
        ref: e, xs, Ns, Vs, Ms, fLocal, dloc: dloc.map((x) => x[0]),
        Mmax: extAbs(Ms) / 1e6, Vmax: extAbs(Vs) / 1e3, Nmax: extAbs(Ns) / 1e3,
      })
    }
    return out
  }

  const unstable = (): StairResult => {
    r.warn.push('Struktur tidak stabil (mekanisme) — periksa tumpuan.')
    r.valid = true
    r.unstable = true
    return r
  }

  // Ultimit.
  const U = solveFrame('u', Ig)
  if (!U) return unstable()
  Object.assign(r, { U, Mmax: U.maxM / 1e6, Vmax: U.maxV / 1e3, Nmax: U.maxN / 1e3 })
  let Mpos = 0, Mneg = 0 // sagging + / hogging −
  for (const ed of U.elems) for (const Mv of ed.Ms) {
    const M = Mv / 1e6
    if (M > Mpos) Mpos = M
    if (M < Mneg) Mneg = M
  }
  r.Mpos = Mpos
  r.Mneg = Math.abs(Mneg)

  // Layan dengan Ig → Ma.
  // Build lama tidak memeriksa solusi layan: tumpuan rol-rol bisa lolos ambang pivot di ultimit tetapi gagal di
  // layan, lalu crash (TypeError). Diperlakukan sebagai mekanisme — perbaikan yang disengaja (lihat TODO).
  const Sg = solveFrame('s', Ig)
  if (!Sg) return unstable()
  let MsPos = 0
  for (const ed of Sg.elems) for (const Mv of ed.Ms) if (Mv / 1e6 > MsPos) MsPos = Mv / 1e6
  Object.assign(r, { Sg, MsPos, ie: effectiveInertia(MsPos, 0, tw - cc - db / 2, fc, tw) }) // As diperbarui di bawah

  // Penulangan.
  const d = tw - cc - db / 2
  r.d = d
  if (!(d > 0)) { r.warn.push('Tinggi efektif d ≤ 0 — pertebal waist / kurangi selimut.'); r.valid = true; return r }
  const asPos = stripDesign(Mpos, d, fc, fy, db, tw, 3, 0.005)
  const asNeg = stripDesign(r.Mneg, d, fc, fy, db, tw, 3, 0.005)
  const dbDist = 10
  const ie = effectiveInertia(MsPos, asPos.AsProv, d, fc, tw) // Ie retak final (As lapangan terpasang)
  const phiVc = (0.75 * 0.17 * Math.sqrt(fc) * 1000 * d) / 1000
  Object.assign(r, {
    asPos, asNeg, dbDist, asDist: stripDesign(0, d, fc, fy, dbDist, tw, 5, 0.005),
    infeasible: asPos.infeasible || asNeg.infeasible, ie, phiVc, dcrVc: Math.abs(r.Vmax as number) / phiVc,
  })

  // Lendutan vertikal maksimum (Hermite pada tiap batang).
  const maxVertDefl = (sol: FrameSolution) => {
    let dm = 0, xg = 0
    for (const ed of sol.elems) {
      const e = ed.ref, dl = ed.dloc
      for (let s = 0; s <= 20; s++) {
        const t = s / 20
        const ua = (1 - t) * dl[0] + t * dl[3]
        const vv = (1 - 3 * t * t + 2 * t * t * t) * dl[1] + e.L * (t - 2 * t * t + t * t * t) * dl[2] +
          (3 * t * t - 2 * t * t * t) * dl[4] + e.L * (-t * t + t * t * t) * dl[5]
        const gy = ua * e.cy + vv * e.cx // komponen vertikal global (mm)
        if (Math.abs(gy) > Math.abs(dm)) {
          dm = gy
          xg = (e.ni === 0 ? 0 : pts[e.ni][0]) / 1000 + (t * (e.cx * e.L)) / 1000
        }
      }
    }
    return { d: Math.abs(dm), x: xg }
  }
  r.dUncr = maxVertDefl(Sg).d
  const Se = solveFrame('s', ie.Ie)
  if (!Se) return unstable()
  const dc = maxVertDefl(Se)
  const Ltot = r.Ltot as number
  Object.assign(r, {
    Se, dCr: dc.d, xdef: dc.x, limit360: (Ltot * 1000) / 360, limit250: (Ltot * 1000) / 250, defOk: dc.d <= (Ltot * 1000) / 360,
  })

  // Reaksi & keseimbangan.
  const reaction = (sol: FrameSolution, elemIdx: number, endIsI: boolean): Reaction => {
    const ed = sol.elems[elemIdx]
    const fg = matMul(matT(ed.ref._T as Mat), ed.fLocal.map((x) => [x]))
    const o = endIsI ? 0 : 3
    return { Rx: fg[o][0] / 1e3, Ry: fg[o + 1][0] / 1e3, M: fg[o + 2][0] / 1e6 }
  }
  const RA = reaction(U, 0, true)
  const RB = reaction(U, U.elems.length - 1, false)
  let Wu = 0
  for (const e of elems) Wu += ((e.wv_u as number) * e.L) / 1000
  Object.assign(r, { RA, RB, Wu, sumRy: RA.Ry + RB.Ry, sumRx: RA.Rx + RB.Rx, valid: true })
  return r
}
