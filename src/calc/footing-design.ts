// Desain pondasi tapak tunggal (spread footing) — SNI 2847:2019 + SNI 8460, beban P + Hx,Hy + Mx,My (biaksial).
// Port 1:1 dari modules/footing-design/module.js (compute), diverifikasi golden test.
// Akan menjadi dasar tool `shallow-foundation` (lihat docs/TOOL-REVISIONS.md).
//
//   Stabilitas (layan): N = P + Wf + Ws; tekanan sudut q = N/A·(1 ± 6ex/L ± 6ey/B), kern ex/L + ey/B ≤ 1/6;
//   SF daya dukung = qa/qmax, SF guling = N·(dim/2)/M, SF geser = μ·N/H.
//   Struktur (ultimit, tekanan neto Pu/A): lentur kantilever di muka kolom (2 arah), geser satu arah di d,
//   geser pons di d/2 (min 3 persamaan ACI 22.6.5).
// Asumsi: tapak kaku, tekanan tanah linear, faktor beban rata-rata LF; tanpa pasif/kohesi pada cek geser.

import { oneWayVc, punchingVc, stripDesign } from './shared/concrete'
import { numFinite as num, type NumLike } from './shared/num'

export interface FootingInput {
  /** Aksial (kN), momen (kNm), geser (kN) — beban layan. */
  P: NumLike
  Mx: NumLike
  My: NumLike
  Hx: NumLike
  Hy: NumLike
  /** Faktor beban ultimit rata-rata (Pu = LF·P), 0 = 1,5. */
  LF: NumLike
  /** Dimensi tapak (m), tebal (mm), kedalaman dasar (m). */
  L: NumLike
  B: NumLike
  tf: NumLike
  Df: NumLike
  /** Dimensi kolom (mm). */
  c1: NumLike
  c2: NumLike
  fc: NumLike
  fy: NumLike
  /** Daya dukung izin (kPa). */
  qa: NumLike
  /** Koefisien gesek dasar. */
  mu: NumLike
  /** Berat isi beton & timbunan (kN/m³), 0 = 24 / 18. */
  gc: NumLike
  gs: NumLike
  /** Selimut bersih & diameter tulangan (mm). */
  cc: NumLike
  db: NumLike
}

export interface FlexureDirection {
  /** Panjang kantilever (m). */
  arm: number
  /** kNm/m & kN/m. */
  Mu: number
  Vu: number
  et: number
  tc: boolean
  infeasible: boolean
  AsFlex: number
  AsMin: number
  AsReq: number
  govMin: boolean
  spacingCap: boolean
  /** Spasi terpasang (mm, kelipatan 25). */
  s: number
  sMax: number
  AsProv: number
  db: number
}

/** Hasil: field geometri/stabilitas ada bila valid; field desain struktur ada bila desOk. */
export interface FootingResult {
  warn: string[]
  valid: boolean
  L?: number
  B?: number
  tf?: number
  Df?: number
  c1?: number
  c2?: number
  P?: number
  Hx?: number
  Hy?: number
  Mx?: number
  My?: number
  LF?: number
  fc?: number
  fy?: number
  qa?: number
  mu?: number
  db?: number
  cc?: number
  gc?: number
  gs?: number
  A?: number
  Wf?: number
  Ws?: number
  N?: number
  MxB?: number
  MyB?: number
  ex?: number
  ey?: number
  qavgS?: number
  kern?: number
  uplift?: boolean
  /** Tekanan sudut layan (kPa): p/m = tanda ex, tanda ey. */
  qc?: { pp: number; pm: number; mp: number; mm: number }
  qmax?: number
  qmin?: number
  SFbear?: number
  SFotX?: number
  SFotY?: number
  SFot?: number
  Hres?: number
  SFslide?: number
  Pu?: number
  quavg?: number
  dx?: number
  dy?: number
  flexL?: FlexureDirection
  flexB?: FlexureDirection
  phiVc1L?: number
  phiVc1B?: number
  dc1L?: number
  dc1B?: number
  b0?: number
  Ain?: number
  davg?: number
  Vup?: number
  vcPunch?: number
  vcGov?: string
  Vcp?: number
  phiVcp?: number
  dcPunch?: number
  betaC?: number
  desOk?: boolean
}

/** Lentur & geser kantilever satu arah (span, colDim, e dalam m; quavg kPa; dEff mm). Sisi menentukan. */
function cantilever(span: number, colDim: number, e: number, quavg: number, dEff: number) {
  const arm = span / 2 - colDim / 2
  const integ = (sideSign: number, fromD: boolean) => {
    const sFace = sideSign * (colDim / 2 + (fromD ? dEff / 1000 : 0))
    const sEnd = (sideSign * span) / 2
    if (Math.abs(sFace) >= span / 2 - 1e-9) return { M: 0, V: 0 }
    const lo = Math.min(sFace, sEnd), hi = Math.max(sFace, sEnd), n = 60, ds = (hi - lo) / n
    let M = 0, V = 0
    for (let i = 0; i < n; i++) {
      const s = lo + (i + 0.5) * ds
      let q = quavg * (1 + (12 * e * s) / (span * span))
      if (q < 0) q = 0
      M += q * (Math.abs(s) - colDim / 2) * ds
      V += q * ds
    }
    return { M, V }
  }
  const pos = integ(1, false), neg = integ(-1, false)
  const govSign = pos.M >= neg.M ? 1 : -1
  return { arm, Mu: Math.max(pos.M, neg.M), Vu: integ(govSign, true).V }
}

function designDir(cant: { arm: number; Mu: number; Vu: number }, dEff: number, fc: number, fy: number, db: number, h: number): FlexureDirection {
  const st = stripDesign(cant.Mu, dEff, fc, fy, db, h, 3)
  return {
    arm: cant.arm, Mu: cant.Mu, Vu: cant.Vu, et: st.et, tc: st.tc, infeasible: st.infeasible, AsFlex: st.As,
    AsMin: st.AsMin, AsReq: st.AsReq, govMin: st.govMin, spacingCap: st.spacingCap, s: st.s, sMax: st.sMax,
    AsProv: st.AsProv, db,
  }
}

export function computeFooting(v: FootingInput): FootingResult {
  const r: FootingResult = { warn: [], valid: false }
  const L = num(v.L), B = num(v.B), tf = num(v.tf) / 1000, Df = num(v.Df)
  const c1 = num(v.c1) / 1000, c2 = num(v.c2) / 1000
  const P = num(v.P), Hx = num(v.Hx), Hy = num(v.Hy), Mx = num(v.Mx), My = num(v.My)
  const LF = num(v.LF) > 0 ? num(v.LF) : 1.5
  const fc = num(v.fc), fy = num(v.fy)
  const gc = num(v.gc) > 0 ? num(v.gc) : 24, gs = num(v.gs) > 0 ? num(v.gs) : 18
  const qa = num(v.qa), mu = num(v.mu)
  const cc = num(v.cc), db = num(v.db)
  if (!(L > 0) || !(B > 0) || !(tf > 0) || !(P > 0) || !(fc > 0) || !(fy > 0) || !(qa > 0)) return r
  if (c1 >= L || c2 >= B) r.warn.push('Kolom lebih besar dari tapak — periksa dimensi.')
  Object.assign(r, { L, B, tf, Df, c1, c2, P, Hx, Hy, Mx, My, LF, fc, fy, qa, mu, db, cc, gc, gs })

  // Stabilitas (layan).
  const A = L * B
  const Wf = gc * A * tf
  const Ws = gs * A * Math.max(0, Df - tf)
  const N = P + Wf + Ws
  const MxB = Mx + Hy * tf, MyB = My + Hx * tf
  const ex = MyB / N, ey = MxB / N // ex sepanjang L, ey sepanjang B
  const qavgS = N / A
  const kern = Math.abs(ex) / L + Math.abs(ey) / B
  const uplift = kern > 1 / 6 + 1e-9
  const qc = {
    pp: qavgS * (1 + (6 * ex) / L + (6 * ey) / B),
    pm: qavgS * (1 + (6 * ex) / L - (6 * ey) / B),
    mp: qavgS * (1 - (6 * ex) / L + (6 * ey) / B),
    mm: qavgS * (1 - (6 * ex) / L - (6 * ey) / B),
  }
  const qmax = Math.max(qc.pp, qc.pm, qc.mp, qc.mm)
  const qmin = Math.min(qc.pp, qc.pm, qc.mp, qc.mm)
  const SFotX = MxB > 1e-9 ? (N * (B / 2)) / MxB : Infinity
  const SFotY = MyB > 1e-9 ? (N * (L / 2)) / MyB : Infinity
  const SFot = Math.min(SFotX, SFotY)
  const Hres = Math.hypot(Hx, Hy)
  const SFslide = Hres > 1e-9 ? (mu * N) / Hres : Infinity
  Object.assign(r, { A, Wf, Ws, N, MxB, MyB, ex, ey, qavgS, kern, uplift, qc, qmax, qmin, SFbear: qa / qmax, SFotX, SFotY, SFot, Hres, SFslide })

  if (uplift) r.warn.push('Terjadi angkat (uplift): ex/L + ey/B = ' + kern.toFixed(3) +
    ' > 1/6 — sebagian tapak tidak menekan tanah; rumus tekanan linear tak berlaku, perbesar tapak atau kurangi eksentrisitas.')
  if (qmax > qa) r.warn.push('qmax = ' + qmax.toFixed(1) + ' kPa > qa = ' + qa.toFixed(1) + ' kPa — daya dukung terlampaui.')
  if (SFot < 1.5 && Number.isFinite(SFot)) r.warn.push('SF guling = ' + SFot.toFixed(2) + ' < 1,5.')
  if (SFslide < 1.5 && Number.isFinite(SFslide)) r.warn.push('SF geser = ' + SFslide.toFixed(2) + ' < 1,5.')

  // Struktur (ultimit).
  const Pu = LF * P, quavg = Pu / A
  const h = tf * 1000
  const dx = h - cc - db / 2 // arah L (lapis bawah)
  const dy = h - cc - 1.5 * db // arah B (di atas lapis L)
  Object.assign(r, { Pu, quavg, dx, dy })

  if (dx > 0 && dy > 0) {
    const flexL = designDir(cantilever(L, c1, ex, quavg, dx), dx, fc, fy, db, h)
    const flexB = designDir(cantilever(B, c2, ey, quavg, dy), dy, fc, fy, db, h)
    const phi = 0.75
    const phiVc1L = (phi * oneWayVc(fc, 1000, dx)) / 1000 // kN/m
    const phiVc1B = (phi * oneWayVc(fc, 1000, dy)) / 1000
    // Pons di d/2 dari muka kolom.
    const davg = (dx + dy) / 2
    const b0 = 2 * (c1 * 1000 + davg) + 2 * (c2 * 1000 + davg) // mm
    const Ain = ((c1 * 1000 + davg) * (c2 * 1000 + davg)) / 1e6 // m²
    const Vup = Pu - quavg * Ain
    const betaC = Math.max(c1, c2) / Math.max(1e-9, Math.min(c1, c2))
    const pv = punchingVc(fc, betaC, 40, davg, b0)
    const Vcp = (pv.vc * b0 * davg) / 1000
    const phiVcp = phi * Vcp
    Object.assign(r, {
      flexL, flexB, phiVc1L, phiVc1B, dc1L: flexL.Vu / phiVc1L, dc1B: flexB.Vu / phiVc1B,
      b0, Ain, davg, Vup, vcPunch: pv.vc,
      vcGov: pv.gov === 'basic' ? "dasar 0,33√f'c" : pv.gov === 'beta' ? '(1+2/βc)' : '(αs·d/b0+2)',
      Vcp, phiVcp, dcPunch: Vup / phiVcp, betaC, desOk: true,
    })
  } else {
    r.warn.push('Tinggi efektif ≤ 0 — pertebal tapak atau kurangi selimut/diameter.')
  }
  r.valid = true
  return r
}
