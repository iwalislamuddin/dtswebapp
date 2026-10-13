// Balok / pelat satu arah menerus — mesin gabungan (SNI 2847:2019):
//   • Metode koefisien Ps. 6.5 (dipakai ulang dari `continuous-beam.ts`, terkunci golden) bila syarat 6.5.1 terpenuhi;
//   • analisis elastis sebenarnya (solver `shared/beam-solver`, pola beban hidup, amplop) bila syarat tidak terpenuhi
//     atau dipilih manual;
//   • pengaruh retak: EI utuh, Ie rata-rata Branson per bentang (24.2.3.7), atau Ie(x) bervariasi per elemen;
//   • balok persegi / T / L dengan lebar tributari & lebar efektif sayap (Tabel 6.3.2.1);
//   • lendutan layan selalu dari analisis elastis (δD, δL, jangka panjang λΔ, batas Tabel 24.2.2).
// Desain lentur tulangan tunggal φ = 0,90, geser sengkang 2 kaki. Satuan: m, mm, kN, kN·m, MPa.

import { computeContinuousBeam, designShear, type CBElement, type CBShear, type ContinuousBeamInput, type ContinuousBeamResult } from './shared/coefficient-method'
import { envelope, solveBeam, type BeamModel, type BeamSolution } from './shared/beam-solver'
import { barArea, rhoMinBeam, rhoShrinkage } from './shared/concrete'
import { designTee, effectiveFlangeWidth, effectiveInertiaTee, teeSection, type TeeKind, type TeeSection } from './shared/tee'

export { CB_BARS, CB_STIRRUPS } from './shared/coefficient-method'

const GAMMA_C = 24 // kN/m³
const N_EL = 10 // elemen per bentang pada solver
const EPS_M = 1e-6 // kN·m — momen di bawah ini dianggap nol

export type CMMetode = 'auto' | 'koef' | 'solver'
export type CMRetak = 'ig' | 'rata' | 'variabel'

export interface CMInput {
  elem: CBElement
  n: number
  L: number
  Li: number
  bsup: number
  b: number
  h: number
  /** Balok: jenis penampang, lebar tributari (m) & tebal pelat sayap (mm). */
  sect: TeeKind
  bt: number
  hf: number
  /** Beban pelat (kN/m²; balok: dikali lebar tributari) & beban garis tambahan balok (kN/m). */
  qDs: number
  qLs: number
  qDb: number
  qLb: number
  ujung: 'bebas' | 'spandrel' | 'kolom'
  m12: 'std' | 'm12'
  tumpuan1: 'ss' | 'js' | 'jj'
  metode: CMMetode
  /** Kekangan rotasi ujung eksterior pada analisis solver (n ≥ 2). */
  ujungS: 'sendi' | 'jepit'
  retak: CMRetak
  design: 'ya' | 'tidak'
  fc: number
  fy: number
  cc: number
  db: number | string
  fyt: number
  ds: number | string
  defl: 'ya' | 'tidak'
  /** Faktor waktu ξ, fraksi beban hidup tetap (0–1), pembagi batas lendutan sesudah pemasangan non-struktural. */
  xi: number
  sustL: number
  limDiv: number
}

export interface CMSyarat {
  label: string
  ok: boolean
  nilai: string
}

export interface CMItem {
  label: string
  kind: 'pos' | 'neg'
  /** Indeks bentang (pos) atau tumpuan (neg). */
  idx: number
  Mu: number
  As: number
  AsReq: number
  et: number
  tc: boolean
  infeasible: boolean
  govMin: boolean
  /** Lebar sayap tekan yang dipakai (mm) & apakah blok tekan menembus sayap. */
  bEff: number
  tShaped: boolean
  s?: number
  n?: number
  /** Balok: batang per lapis yang muat di bw (spasi bersih ≥ maks(25, db)) & jumlah lapis yang diperlukan. */
  perLayer?: number
  layers?: number
  AsProv: number
  spacingCap?: boolean
  txt: string
}

export interface CMDesign {
  valid: boolean
  err?: string
  fc: number
  fy: number
  cc: number
  db: number
  Ab: number
  bDes?: number
  d?: number
  ds?: number
  AsMin?: number
  sMaxSlab?: number | null
  items?: CMItem[]
  anyInfeasible?: boolean
  anyNotTC?: boolean
  fyt?: number
  shear?: CBShear
  /** Pelat: tulangan bagi/susut tegak lurus bentang (spasi kelipatan 25 mm, ≤ min(5h, 450)). */
  dist?: { As: number; s: number; AsProv: number; txt: string }
}

export interface CMStirZone {
  /** Jarak dari sumbu tumpuan kiri bentang (m). */
  x0: number
  x1: number
  /** Spasi sengkang (mm, kelipatan 25). */
  s: number
}

export interface CMStir {
  ds: number
  fyt: number
  /** Zona sengkang tiap bentang & spasi terkecil. */
  spans: CMStirZone[][]
  sGov: number
}

export interface CMDeflSpan {
  span: number
  L: number
  dD: number
  dDL: number
  dL: number
  dLT: number
  dTot: number
  dAfter: number
  limL: number
  limAfter: number
  okL: boolean
  okAfter: boolean
  /** Ie rata-rata / terkecil yang dipakai (mm⁴) pada beban D+L. */
  IeMin: number
  IeMax: number
}

export interface CMDefl {
  valid: boolean
  err?: string
  Ec?: number
  xi?: number
  sustL?: number
  lambda?: number
  limDiv?: number
  spans?: CMDeflSpan[]
  gov?: number
  ok?: boolean
}

export interface CMDiagram {
  /** Posisi (m), momen (kN·m, sagging +) & geser (kN); amplop bawah/atas (sama bila satu kasus). */
  x: number[]
  mHi: number[]
  mLo: number[]
  vHi: number[]
  vLo: number[]
}

export interface CMResult {
  elem: CBElement
  n: number
  valid: boolean
  warn: string[]
  invalidReason?: string
  /** Beban (kN/m): berat sendiri balok/pelat, berat pelat sayap, mati total, hidup, faktor. */
  qself?: number
  qslab?: number
  wD?: number
  wL?: number
  wu14?: number
  wu12?: number
  wu?: number
  gov14?: boolean
  L?: number
  Li?: number
  bsup?: number
  lnE?: number
  lnI?: number
  spanLen?: number[]
  lnSpan?: number[]
  syarat?: CMSyarat[]
  syaratOk?: boolean
  metode?: 'koef' | 'solver'
  alasan?: string
  coef?: ContinuousBeamResult
  /** Momen tumpuan (hogging, besaran) & lapangan (sagging) desain (kN·m), geser tumpuan (kN). */
  supM?: number[]
  spanM?: number[]
  supV?: number[]
  MnegMax?: number
  MposMax?: number
  VuMax?: number
  nPola?: number
  diagram?: CMDiagram
  /** Penampang. */
  b?: number
  h?: number
  hf?: number
  kind?: TeeKind
  bfSpan?: number[]
  Ig?: number[]
  des?: CMDesign
  stir?: CMStir
  defl?: CMDefl
}

/** Diagram momen koefisien (parabola per bentang melalui −M tumpuan & +M lapangan) — indikatif. */
function coefDiagram(spanLen: number[], supM: number[], spanM: number[], supV: number[]): CMDiagram {
  const d: CMDiagram = { x: [], mHi: [], mLo: [], vHi: [], vLo: [] }
  let x0 = 0
  spanLen.forEach((L, i) => {
    const Ml = supM[i] ?? 0, Mr = supM[i + 1] ?? 0, Mp = spanM[i] ?? 0
    const b = Ml - Mr, K = Mp + Ml, B = 4 * K - 2 * b
    const q = (B + Math.sqrt(Math.max(0, B * B - 4 * b * b))) / 2
    const Vl = supV[i] ?? 0, Vr = supV[i + 1] ?? 0
    for (let k = 0; k <= 24; k++) {
      const t = k / 24
      const m = -Ml * (1 - t) - Mr * t + q * t * (1 - t)
      d.x.push(x0 + t * L)
      d.mHi.push(m)
      d.mLo.push(m)
      const v = Vl + (-Vr - Vl) * t
      d.vHi.push(v)
      d.vLo.push(v)
    }
    x0 += L
  })
  return d
}

interface Ctx {
  v: CMInput
  r: CMResult
  n: number
  pelat: boolean
  bw: number
  h: number
  fc: number
  fy: number
  Ec: number
  d: number
  db: number
  Ab: number
  ds: number
  secs: TeeSection[]
  spanLen: number[]
  lnSpan: number[]
  model: BeamModel
  wD: number
  wL: number
  wu: number
  wu12: number
  wu14: number
}

/** Beban per bentang untuk pola beban hidup: tiap entri = true bila bentang membawa beban hidup. */
function livePatterns(n: number): boolean[][] {
  const pats = new Map<string, boolean[]>()
  const add = (p: boolean[]) => pats.set(p.join(''), p)
  add(Array.from({ length: n }, () => true))
  add(Array.from({ length: n }, (_, i) => i % 2 === 0))
  add(Array.from({ length: n }, (_, i) => i % 2 === 1))
  // momen negatif maksimum di tumpuan k: bentang k−1 & k + selang-seling
  for (let k = 1; k < n; k++) add(Array.from({ length: n }, (_, j) => (j < k ? (k - 1 - j) % 2 === 0 : (j - k) % 2 === 0)))
  return [...pats.values()]
}

function ultimateEnvelope(c: Ctx, EI: number[]): { env: ReturnType<typeof envelope>; nPola: number } | null {
  const { n, wD, wL } = c
  const sols: BeamSolution[] = []
  const w1412 = (live: boolean) => (live ? 1.2 * wD + 1.6 * wL : 1.2 * wD)
  const pats = wL > 0 ? livePatterns(n) : [Array.from({ length: n }, () => true)]
  for (const p of pats) {
    const s = solveBeam(c.model, EI, p.map((live) => w1412(live)))
    if (!s) return null
    sols.push(s)
  }
  const s14 = solveBeam(c.model, EI, Array.from({ length: n }, () => 1.4 * wD))
  if (!s14) return null
  sols.push(s14)
  return { env: envelope(sols), nPola: sols.length }
}

/** Momen/geser desain dari amplop solver (tumpuan direduksi ke muka). */
function fromEnvelope(c: Ctx, env: ReturnType<typeof envelope>): { supM: number[]; spanM: number[]; supV: number[]; diagram: CMDiagram } {
  const { n } = c
  const S = env.x.length / (n * N_EL)
  const supM: number[] = [], supV: number[] = [], spanM: number[] = []
  const half = c.v.bsup / 2000 // m
  for (let k = 0; k <= n; k++) {
    const j = k * N_EL
    const idxs = [j - 1 >= 0 ? j * S - 1 : -1, j < n * N_EL ? j * S : -1].filter((i) => i >= 0)
    const Mc = Math.max(0, ...idxs.map((i) => -env.Mmin[i] / 1e6))
    const Vc = Math.max(0, ...idxs.map((i) => Math.max(Math.abs(env.Vmax[i]), Math.abs(env.Vmin[i])) / 1e3))
    const Vf = Math.max(0, Vc - (c.wu * half))
    const Mf = Mc > EPS_M ? Math.max(0, Mc - Vc * half + (c.wu * half * half) / 2) : 0
    supM.push(Mf)
    supV.push(Vf)
  }
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let p = i * N_EL * S; p < (i + 1) * N_EL * S; p++) m = Math.max(m, env.Mmax[p] / 1e6)
    spanM.push(m)
  }
  const diagram: CMDiagram = {
    x: env.x.map((x) => x / 1000),
    mHi: env.Mmax.map((m) => m / 1e6),
    mLo: env.Mmin.map((m) => m / 1e6),
    vHi: env.Vmax.map((x) => x / 1e3),
    vLo: env.Vmin.map((x) => x / 1e3),
  }
  return { supM, spanM, supV, diagram }
}

/** Zona sengkang tiap bentang dari Vu(x) amplop (kritis di muka tumpuan), spasi kelipatan 25 mm, ≥ praktis minimum. */
function stirrupZones(c: Ctx, sh: CBShear, fyt: number, diagram: CMDiagram): CMStir {
  const { fc, d, bw, n } = c
  const phi = 0.75
  const Vc = 0.17 * Math.sqrt(fc) * bw * d
  const half = c.v.bsup / 2000
  const vAt = (xg: number): number => {
    const xs = diagram.x
    let lo = 0, hi = xs.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (xs[mid] <= xg) lo = mid
      else hi = mid
    }
    const a = Math.max(Math.abs(diagram.vHi[lo]), Math.abs(diagram.vLo[lo]))
    const b = Math.max(Math.abs(diagram.vHi[hi]), Math.abs(diagram.vLo[hi]))
    const t = xs[hi] > xs[lo] ? Math.min(1, Math.max(0, (xg - xs[lo]) / (xs[hi] - xs[lo]))) : 0
    return a + (b - a) * t
  }
  const spans: CMStirZone[][] = []
  let sGov = Infinity
  let xg0 = 0
  for (let i = 0; i < n; i++) {
    const L = c.spanLen[i], N = 48
    const zones: CMStirZone[] = []
    for (let k = 0; k < N; k++) {
      const xm = ((k + 0.5) / N) * L
      const xl = Math.min(Math.max(xm, half), L - half)
      const VsReq = (vAt(xg0 + xl) * 1e3) / phi - Vc
      const avUse = Math.max(VsReq > 0 ? VsReq / (fyt * d) : 0, sh.avMin)
      const sMax = VsReq <= 0.33 * Math.sqrt(fc) * bw * d ? Math.min(d / 2, 600) : Math.min(d / 4, 300)
      const s = Math.max(50, Math.floor(Math.min(sh.Av / avUse, sMax) / 25) * 25)
      const last = zones[zones.length - 1]
      if (last && last.s === s) last.x1 = ((k + 1) / N) * L
      else zones.push({ x0: (k / N) * L, x1: ((k + 1) / N) * L, s })
      sGov = Math.min(sGov, s)
    }
    spans.push(zones)
    xg0 += L
  }
  return { ds: c.ds, fyt, spans, sGov }
}

interface DesignOut {
  des: CMDesign
  AsPos: number[]
  AsNeg: number[]
}

function designAll(c: Ctx, supM: number[], spanM: number[], VuMax: number): DesignOut {
  const { v, n, pelat, fc, fy, d, db, Ab, h, bw } = c
  const des: CMDesign = { valid: false, fc, fy, cc: v.cc, db, Ab }
  const out: DesignOut = { des, AsPos: Array.from({ length: n }, () => 0), AsNeg: Array.from({ length: n + 1 }, () => 0) }
  if (!(fc > 0) || !(fy > 0) || !(v.cc >= 0) || !(db > 0)) return out
  if (!(d > 0)) { des.err = 'Tinggi efektif ≤ 0 — periksa h, selimut, atau diameter.'; return out }
  const bDes = pelat ? 1000 : bw
  Object.assign(des, { bDes, d, ds: c.ds })
  const sMaxSlab = pelat ? Math.min(3 * h, 450) : null
  des.sMaxSlab = sMaxSlab
  const AsMinPos = pelat ? rhoShrinkage(fy) * bDes * h : rhoMinBeam(fc, fy) * bDes * d
  des.AsMin = AsMinPos
  const items: CMItem[] = []
  const add = (label: string, kind: 'pos' | 'neg', idx: number, Mu: number) => {
    if (!(Mu > EPS_M)) return
    const sec = c.secs[Math.min(idx, n - 1)]
    const bf = kind === 'pos' ? sec.bf : bDes
    const flange = kind === 'pos' ? sec.hf : 0
    const a = designTee(Mu, bDes, bf, flange, d, fc, fy)
    // As,min: sayap tarik (momen negatif) memakai min(bf, 2bw) (9.6.1.2)
    const bMin = pelat || kind === 'pos' ? bDes : Math.min(Math.max(sec.bf, bDes), 2 * bDes)
    const AsMin = pelat ? AsMinPos : rhoMinBeam(fc, fy) * bMin * d
    const AsReq = Math.max(a.As, AsMin)
    const it: CMItem = {
      label, kind, idx, Mu, As: a.As, AsReq, et: a.et, tc: a.tc, infeasible: a.infeasible, govMin: AsReq > a.As + 1e-6,
      bEff: bf, tShaped: a.tShaped, AsProv: 0, txt: '',
    }
    if (pelat) {
      const s = (1000 * Ab) / AsReq
      let sPakai = Math.floor(s / 25) * 25
      const sCap = Math.floor((sMaxSlab as number) / 25) * 25
      if (sPakai > sCap) sPakai = sCap
      it.s = Math.max(50, sPakai)
      it.AsProv = (1000 * Ab) / it.s
      it.spacingCap = s > (sMaxSlab as number)
      it.txt = `D${db}-${it.s}`
    } else {
      it.n = Math.max(2, Math.ceil(AsReq / Ab))
      it.AsProv = it.n * Ab
      it.txt = `${it.n} D${db}`
      const gap = Math.max(25, db)
      it.perLayer = Math.max(1, Math.floor((bw - 2 * (v.cc + c.ds) + gap) / (db + gap)))
      it.layers = Math.ceil(it.n / it.perLayer)
    }
    items.push(it)
    if (kind === 'pos') out.AsPos[idx] = it.AsProv
    else out.AsNeg[idx] = it.AsProv
  }
  spanM.forEach((m, i) => add(`M+ bentang ${i + 1}`, 'pos', i, m))
  supM.forEach((m, k) => add(`M− tumpuan ${k + 1}`, 'neg', k, m))
  des.items = items
  des.anyInfeasible = items.some((i) => i.infeasible)
  des.anyNotTC = items.some((i) => !i.tc && !i.infeasible)
  if (!pelat) {
    const fyt = v.fyt > 0 ? v.fyt : fy
    des.fyt = fyt
    const sh = designShear(VuMax, bw, d, fc, fyt, c.ds)
    sh.sPakai = sh.zone === 'none' ? null : Math.max(50, Math.floor(sh.sReq / 25) * 25) // kelipatan 25 mm
    des.shear = sh
  } else {
    const AsD = rhoShrinkage(fy) * 1000 * h
    const s = Math.max(50, Math.floor(Math.min((1000 * Ab) / AsD, 5 * h, 450) / 25) * 25)
    des.dist = { As: AsD, s, AsProv: (1000 * Ab) / s, txt: `D${db}-${s}` }
  }
  des.valid = true
  return out
}

/** EI awal: utuh (Ec·Ig tiap bentang). */
const eiGross = (c: Ctx): number[] => c.secs.flatMap((s) => Array.from({ length: N_EL }, () => c.Ec * s.Ig))

/**
 * Perbarui EI dari solusi layan `sol` (retak variabel: Ie tiap elemen dari momen maksimum elemen; rata-rata: Ie
 * Branson per bentang 24.2.3.7). AsPos[i] / AsNeg[k] = tulangan terpasang.
 */
function eiFromService(c: Ctx, sol: BeamSolution, AsPos: number[], AsNeg: number[], mode: CMRetak): { EI: number[]; Ie: number[] } {
  const { n, fc, d } = c
  const Ie: number[] = []
  for (let s = 0; s < n; s++) {
    const sec = c.secs[s]
    const els = sol.els.slice(s * N_EL, (s + 1) * N_EL)
    const peak = (el: (typeof els)[number]) => {
      let m = 0
      for (const x of el.Ms) if (Math.abs(x) > Math.abs(m)) m = x
      return m / 1e6
    }
    const asFor = (M: number, e: number) => (M >= 0 ? AsPos[s] : e < N_EL / 2 ? AsNeg[s] : AsNeg[s + 1])
    if (mode === 'variabel') {
      els.forEach((el, e) => {
        const M = peak(el)
        Ie.push(effectiveInertiaTee(sec, M, asFor(M, e), d, fc))
      })
    } else {
      // rata-rata Branson: tengah bentang (M+ maks), dua tumpuan (momen di ujung bentang)
      let mid = 0
      for (const el of els) for (const x of el.Ms) mid = Math.max(mid, x / 1e6)
      const Iem = effectiveInertiaTee(sec, mid, AsPos[s], d, fc)
      const M1 = els[0].Ms[0] / 1e6, M2 = els[N_EL - 1].Ms[els[N_EL - 1].Ms.length - 1] / 1e6
      const e1 = M1 < -EPS_M ? effectiveInertiaTee(sec, M1, AsNeg[s], d, fc) : null
      const e2 = M2 < -EPS_M ? effectiveInertiaTee(sec, M2, AsNeg[s + 1], d, fc) : null
      const cont = (e1 !== null ? 1 : 0) + (e2 !== null ? 1 : 0)
      const Iavg = cont === 2 ? 0.7 * Iem + 0.15 * ((e1 as number) + (e2 as number)) : cont === 1 ? 0.85 * Iem + 0.15 * ((e1 ?? e2) as number) : Iem
      for (let e = 0; e < N_EL; e++) Ie.push(Iavg)
    }
  }
  return { EI: Ie.map((i) => c.Ec * i), Ie }
}

/** Iterasi EI(x) pada beban layan `w` (N/mm tiap bentang) → solusi akhir & Ie akhir. */
function serviceSolve(c: Ctx, w: number[], AsPos: number[], AsNeg: number[], mode: CMRetak): { sol: BeamSolution; Ie: number[] } | null {
  let EI = eiGross(c)
  let Ie = c.secs.flatMap((s) => Array.from({ length: N_EL }, () => s.Ig))
  let sol = solveBeam(c.model, EI, w)
  if (!sol) return null
  if (mode === 'ig') return { sol, Ie }
  for (let it = 0; it < 8; it++) {
    const nx = eiFromService(c, sol, AsPos, AsNeg, mode)
    let change = 0
    const EInew = nx.EI.map((e, i) => {
      const mixed = 0.5 * e + 0.5 * EI[i]
      change = Math.max(change, Math.abs(mixed - EI[i]) / EI[i])
      return mixed
    })
    EI = EInew
    Ie = EI.map((e) => e / c.Ec)
    const s2 = solveBeam(c.model, EI, w)
    if (!s2) return null
    sol = s2
    if (change < 0.005) break
  }
  return { sol, Ie }
}

function deflection(c: Ctx, AsPos: number[], AsNeg: number[]): CMDefl {
  const { v, n } = c
  const out: CMDefl = { valid: false }
  const { xi, sustL, limDiv } = v
  if (!(xi >= 0) || !(sustL >= 0 && sustL <= 1) || !(limDiv > 0)) { out.err = 'Parameter lendutan tidak valid.'; return out }
  const wDv = Array.from({ length: n }, () => c.wD)
  const wDLv = Array.from({ length: n }, () => c.wD + c.wL)
  const sD = serviceSolve(c, wDv, AsPos, AsNeg, v.retak)
  const sDL = serviceSolve(c, wDLv, AsPos, AsNeg, v.retak)
  if (!sD || !sDL) { out.err = 'Struktur tidak stabil.'; return out }
  const lambda = xi // ρ′ = 0 (tulangan tunggal)
  const spans: CMDeflSpan[] = []
  let gov = 0, worst = -Infinity
  for (let s = 0; s < n; s++) {
    const x0 = c.spanLen.slice(0, s).reduce((a, b) => a + b, 0) * 1000
    const x1 = x0 + c.spanLen[s] * 1000
    let dD = -Infinity, dDL = -Infinity, dL = -Infinity, dLT = -Infinity, dTot = -Infinity, dAfter = -Infinity
    sDL.sol.dx.forEach((x, i) => {
      if (x < x0 - 1e-6 || x > x1 + 1e-6) return
      const yD = sD.sol.dy[i], yDL = sDL.sol.dy[i]
      const yL = yDL - yD
      const ySus = yD + sustL * yL
      dD = Math.max(dD, yD)
      dDL = Math.max(dDL, yDL)
      dL = Math.max(dL, yL)
      dLT = Math.max(dLT, lambda * ySus)
      dTot = Math.max(dTot, yDL + lambda * ySus)
      dAfter = Math.max(dAfter, lambda * ySus + yL)
    })
    const ies = sDL.Ie.slice(s * N_EL, (s + 1) * N_EL)
    const L = c.spanLen[s]
    const limL = (L * 1000) / 360, limAfter = (L * 1000) / limDiv
    const sp: CMDeflSpan = {
      span: s + 1, L, dD, dDL, dL, dLT, dTot, dAfter, limL, limAfter, okL: dL <= limL, okAfter: dAfter <= limAfter,
      IeMin: Math.min(...ies), IeMax: Math.max(...ies),
    }
    const ratio = Math.max(dL / limL, dAfter / limAfter)
    if (ratio > worst) { worst = ratio; gov = s }
    spans.push(sp)
  }
  Object.assign(out, { valid: true, Ec: c.Ec, xi, sustL, lambda, limDiv, spans, gov, ok: spans.every((s) => s.okL && s.okAfter) })
  return out
}

export function computeContinuousMember(v: CMInput): CMResult {
  const pelat = v.elem === 'pelat'
  const r: CMResult = { elem: v.elem, n: Math.min(12, Math.round(v.n)), valid: false, warn: [] }
  const n = r.n
  const bad = (reason: string) => { r.invalidReason = reason; return r }
  if (!(n >= 1) || !(v.L > 0) || !(v.bsup >= 0) || !(v.h > 0)) return bad('Jumlah bentang, bentang, lebar tumpuan, atau tinggi tidak valid.')
  if (!pelat && !(v.b > 0)) return bad('Lebar balok harus > 0.')

  // Beban per meter (pelat: lajur 1 m).
  let wD: number, wL: number
  let kind: TeeKind = pelat ? 'persegi' : v.sect
  if (pelat) {
    r.qself = (GAMMA_C * v.h) / 1000
    wD = r.qself + (v.qDs || 0)
    wL = v.qLs || 0
  } else {
    const bwM = v.b / 1000
    r.qself = (GAMMA_C * v.b * v.h) / 1e6
    const bt = v.bt > 0 ? v.bt : 0
    const hasSlab = bt > 0 && v.hf > 0
    r.qslab = hasSlab ? (GAMMA_C * v.hf) / 1000 * Math.max(0, bt - bwM) : 0
    wD = r.qself + r.qslab + (v.qDs || 0) * bt + (v.qDb || 0)
    wL = (v.qLs || 0) * bt + (v.qLb || 0)
    if (kind !== 'persegi' && !(hasSlab && v.hf < v.h && bt > (kind === 'T' ? bwM : bwM / 2))) {
      r.warn.push('Lebar tributari / tebal pelat sayap belum cukup untuk balok T/L — dihitung sebagai balok persegi.')
      kind = 'persegi'
    }
  }
  if (!(wD > 0)) return bad('Beban mati nol.')
  const wu14 = 1.4 * wD, wu12 = 1.2 * wD + 1.6 * wL, wu = Math.max(wu14, wu12)
  Object.assign(r, { wD, wL, wu14, wu12, wu, gov14: wu14 >= wu12, L: v.L, bsup: v.bsup, b: pelat ? undefined : v.b, h: v.h, hf: v.hf, kind })

  // Metode koefisien (hanya untuk momen/geser & syarat; desain dilakukan di sini).
  const legacyIn: ContinuousBeamInput = {
    elem: v.elem, n: v.n, L: v.L, Li: v.Li, bsup: v.bsup, b: v.b, h: v.h,
    qDs: v.qDs, qLs: v.qLs, qDb: pelat ? 0 : wD - (GAMMA_C * v.b * v.h) / 1e6, qLb: pelat ? 0 : wL, ujung: v.ujung, m12: v.m12, tumpuan1: v.tumpuan1,
    design: 'tidak', fc: v.fc, fy: v.fy, cc: v.cc, db: v.db, fyt: v.fyt, ds: v.ds,
  }
  const rc = computeContinuousBeam(legacyIn)
  if (!rc.valid) return bad('Bentang bersih ≤ 0 (bentang lebih kecil dari lebar tumpuan) atau beban mati nol.')
  r.coef = rc
  const lnE = rc.lnE as number, lnI = rc.lnI as number
  const Li = rc.Li as number
  const spanLen = Array.from({ length: n }, (_, i) => (n >= 3 && i > 0 && i < n - 1 ? Li : v.L))
  const lnSpan = Array.from({ length: n }, (_, i) => (n >= 3 && i > 0 && i < n - 1 ? lnI : lnE))
  Object.assign(r, { lnE, lnI, Li, spanLen, lnSpan })

  // Syarat Ps. 6.5.1.
  const syarat: CMSyarat[] = [{ label: 'Beban hidup ≤ 3 × beban mati (6.5.1c)', ok: wL <= 3 * wD + 1e-12, nilai: `${wL.toFixed(2)} vs ${(3 * wD).toFixed(2)} kN/m` }]
  if (n >= 3 && rc.rasio != null) syarat.push({ label: 'Bentang bersebelahan berbeda ≤ 20% (6.5.1e)', ok: rc.rasio <= 1.2, nilai: `${((rc.rasio - 1) * 100).toFixed(0)}%` })
  const syaratOk = syarat.every((s) => s.ok)
  r.syarat = syarat
  r.syaratOk = syaratOk
  const metode: 'koef' | 'solver' = v.metode === 'koef' ? 'koef' : v.metode === 'solver' ? 'solver' : syaratOk ? 'koef' : 'solver'
  r.metode = metode
  r.alasan =
    v.metode === 'auto'
      ? syaratOk
        ? n === 1 ? 'Satu bentang: statika eksak.' : 'Syarat 6.5.1 terpenuhi: metode koefisien.'
        : 'Syarat 6.5.1 tidak terpenuhi: analisis elastis sebenarnya (solver).'
      : v.metode === 'koef'
        ? 'Dipilih manual: metode koefisien.'
        : 'Dipilih manual: analisis elastis sebenarnya (solver).'
  if (metode === 'koef') {
    r.warn.push(...rc.warn)
    if (n >= 2 && !syaratOk && v.metode === 'koef') r.warn.push('Syarat 6.5.1 tidak terpenuhi tetapi metode koefisien dipaksa — hasil tidak sah menurut SNI.')
  }
  if (metode === 'solver' && n >= 2 && pelat && v.m12 === 'm12') r.warn.push('Opsi M− = 1/12 hanya berlaku pada metode koefisien; diabaikan pada solver.')

  // Penampang & parameter desain.
  const bw = pelat ? 1000 : v.b
  const fc = v.fc > 0 ? v.fc : 25
  const db = parseFloat(String(v.db)), ds = pelat ? 0 : parseFloat(String(v.ds))
  const Ab = barArea(db)
  const d = v.h - v.cc - ds - db / 2
  const bfSpan = lnSpan.map((ln) => (pelat ? 1000 : effectiveFlangeWidth(kind, v.b, v.hf, v.bt * 1000, ln)))
  const secs = bfSpan.map((bf) => teeSection(bw, v.h, bf, pelat ? v.h : v.hf))
  r.bfSpan = bfSpan
  r.Ig = secs.map((s) => s.Ig)
  const fixedEnds = n === 1 ? { l: v.tumpuan1 !== 'ss', r: v.tumpuan1 === 'jj' } : { l: v.ujungS === 'jepit', r: v.ujungS === 'jepit' }
  const model: BeamModel = { spans: spanLen.map((l) => l * 1000), nEl: N_EL, fixedL: fixedEnds.l, fixedR: fixedEnds.r }
  const c: Ctx = {
    v, r, n, pelat, bw, h: v.h, fc, fy: v.fy, Ec: 4700 * Math.sqrt(fc), d, db, Ab, ds, secs, spanLen, lnSpan, model, wD, wL, wu, wu12, wu14,
  }
  const designOn = v.design === 'ya'
  const mode: CMRetak = designOn ? v.retak : 'ig'

  let supM: number[], spanM: number[], supV: number[], diagram: CMDiagram
  let AsPos: number[] = Array.from({ length: n }, () => 0), AsNeg: number[] = Array.from({ length: n + 1 }, () => 0)
  let des: CMDesign | undefined

  if (metode === 'koef') {
    supM = (rc.supM as (number | null)[]).map((m) => m ?? 0)
    spanM = (rc.spanM as (number | null)[]).map((m) => m ?? 0)
    supV = (rc.supV as (number | null)[]).map((x) => x ?? 0)
    diagram = coefDiagram(spanLen, supM, spanM, supV)
    if (designOn) {
      const o = designAll(c, supM, spanM, rc.VuMax as number)
      des = o.des
      AsPos = o.AsPos
      AsNeg = o.AsNeg
    }
  } else {
    let EI = eiGross(c)
    let res = ultimateEnvelope(c, EI)
    if (!res) return bad('Struktur tidak stabil.')
    let m = fromEnvelope(c, res.env)
    if (designOn && mode !== 'ig') {
      for (let it = 0; it < 3; it++) {
        const o = designAll(c, m.supM, m.spanM, Math.max(...m.supV))
        if (!o.des.valid) break
        const sv = serviceSolve(c, Array.from({ length: n }, () => wD + wL), o.AsPos, o.AsNeg, mode)
        if (!sv) break
        EI = sv.Ie.map((i) => i * c.Ec)
        const nx = ultimateEnvelope(c, EI)
        if (!nx) return bad('Struktur tidak stabil.')
        res = nx
        m = fromEnvelope(c, res.env)
      }
    }
    supM = m.supM
    spanM = m.spanM
    supV = m.supV
    diagram = m.diagram
    r.nPola = res.nPola
    if (designOn) {
      const o = designAll(c, supM, spanM, Math.max(...supV))
      des = o.des
      AsPos = o.AsPos
      AsNeg = o.AsNeg
    }
  }
  Object.assign(r, { supM, spanM, supV, diagram, MnegMax: Math.max(...supM), MposMax: Math.max(...spanM), VuMax: Math.max(...supV) })
  if (des) r.des = des
  if (des?.valid && des.shear && des.fyt) {
    r.stir = stirrupZones(c, des.shear, des.fyt, diagram)
    if (des.shear.sReq < 50) r.warn.push('Spasi sengkang perlu < 50 mm — perbesar penampang atau diameter sengkang.')
  }
  if (des?.valid && des.items)
    for (const it of des.items)
      if ((it.layers ?? 1) > 1)
        r.warn.push(`${it.label}: ${it.txt} tidak muat satu lapis di bw (maks ${it.perLayer} batang/lapis, spasi bersih ≥ maks(25; db)) — d dihitung satu lapis; gunakan ${it.layers} lapis & periksa ulang d.`)

  if (v.defl === 'ya') {
    if (!des || !des.valid) r.defl = { valid: false, err: 'Cek lendutan membutuhkan desain tulangan yang valid (As terpasang).' }
    else r.defl = deflection(c, AsPos, AsNeg)
  }
  r.valid = true
  return r
}
