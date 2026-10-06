// Daya dukung aksial tekan tiang tunggal pada profil tanah berlapis.
// Port 1:1 dari modules/pile-capacity/module.js (compute), diverifikasi golden test.
//
//   Qu = Qp + Qs; Q_izin = Qu/FS (− berat sendiri, opsional).
//   Selimut per lapis: lempung α (API RP2A), pasir β (K·σ'v·tanδ), atau SPT Meyerhof (nf·N); fs ≤ 120 kPa.
//   Ujung: lempung 9·cu; pasir σ'v·Nq ≤ 0,5·pa·Nq·tanφ (Meyerhof); SPT 40N·L/D ≤ 400N (pasir) / 300N (lempung).
//   Pembanding empiris Decourt-Quaresma bila semua lapis tertanam punya N > 0.
// TIDAK termasuk: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan tiang, beban gempa.

import { effectiveStressAt, nqPrandtl, P_ATM } from './shared/geotech'
import { deg2rad, num, type NumLike } from './shared/num'

/** Batas lunak gesekan selimut (kPa) — diberi peringatan bila tercapai. */
const FS_CAP = 120
/** Berat isi beton tiang (kN/m³). */
const GAMMA_PILE = 24

export type PileShape = 'circular' | 'square'
export type SoilKind = 'clay' | 'sand'
export type LayerMethod = 'static' | 'spt'

export interface PileLayer {
  soil: SoilKind
  /** Tebal (m). */
  H: number
  /** Berat isi (kN/m³). */
  gamma: number
  /** Kuat geser tak terdrainase (kPa), lempung. */
  cu: NumLike
  /** Sudut geser dalam (°), pasir. */
  phi: NumLike
  N: NumLike
  method: LayerMethod
}

export interface PileInput {
  shape?: PileShape
  /** Diameter / sisi (m). */
  D: NumLike
  /** Panjang tertanam (m). */
  L: NumLike
  ptype?: 'driven' | 'bored'
  material?: 'concrete' | 'steel'
  /** Kedalaman muka air tanah (m). */
  Dw: NumLike
  FS: NumLike
  /** 'yes' = kurangi berat sendiri dari Q_izin. */
  inclW?: string
}

export interface ShaftSegment {
  /** Nomor lapis (mulai 1). */
  idx: number
  soil: SoilKind
  method: LayerMethod
  top: number
  bot: number
  dL: number
  sv: number
  fs: number
  Qs: number
  how: string
}

export type DecourtResult =
  | { active: false }
  | {
      active: true
      NsAvg: number
      fsDq: number
      QsDq: number
      C: number
      Np: number
      qpDq: number
      QpDq: number
      QuDq: number
      Qallow: number
    }

export type PileResult =
  | { valid: false; warn: string[] }
  | {
      valid: true
      warn: string[]
      shape: PileShape
      D: number
      L: number
      Leff: number
      FS: number
      Dw: number
      ptype: 'driven' | 'bored'
      material: 'concrete' | 'steel'
      inclW: boolean
      Wp: number
      perim: number
      Ap: number
      totalH: number
      cK: number
      cDelta: number
      nfSPT: number
      segs: ShaftSegment[]
      Qs: number
      tipLayer: PileLayer
      svTip: number
      qp: number
      qpHow: string
      Nq: number | null
      ql: number | null
      Qp: number
      Qu: number
      Qallow: number
      dq: DecourtResult
      layers: PileLayer[]
    }

export const DEFAULT_PILE_LAYERS: readonly PileLayer[] = [
  { soil: 'clay', H: 4, gamma: 17, cu: 40, phi: 0, N: 6, method: 'static' },
  { soil: 'sand', H: 6, gamma: 18, cu: 0, phi: 32, N: 18, method: 'static' },
  { soil: 'sand', H: 8, gamma: 19, cu: 0, phi: 36, N: 35, method: 'static' },
]

export function computePile(g: PileInput, layers: PileLayer[]): PileResult {
  const warn: string[] = []
  const shape = g.shape || 'circular'
  const D = num(g.D), L = num(g.L)
  let FS = num(g.FS), Dw = num(g.Dw)
  const ptype = g.ptype || 'driven', material = g.material || 'concrete'
  const inclW = String(g.inclW) === 'yes'

  if (!(D > 0)) { warn.push('Diameter/sisi tiang D harus > 0.'); return { valid: false, warn } }
  if (!(L > 0)) { warn.push('Panjang tertanam L harus > 0.'); return { valid: false, warn } }
  if (!(FS > 0)) { FS = 2.5; warn.push('FS tidak valid — dipakai 2,5.') }
  if (Dw < 0) Dw = 0
  if (!layers || !layers.length) { warn.push('Tambahkan minimal satu lapis tanah.'); return { valid: false, warn } }

  const perim = shape === 'square' ? 4 * D : Math.PI * D
  const Ap = shape === 'square' ? D * D : (Math.PI * D * D) / 4

  let totalH = 0
  for (const l of layers) totalH += l.H
  let Leff = L
  if (L > totalH + 1e-6) {
    Leff = totalH
    warn.push('Panjang tiang L=' + L.toFixed(1) + ' m melebihi total profil tanah ' + totalH.toFixed(1) + ' m — ujung dianggap di dasar profil (' + totalH.toFixed(1) + ' m). Tambahkan lapis di bawah ujung.')
  }

  const cK = ptype === 'bored' ? 1.0 : 1.4
  const cDelta = material === 'steel' ? 0.6 : 0.8
  const nfSPT = ptype === 'bored' ? 1.0 : 2.0

  // Selimut per lapis dalam zona tertanam.
  const segs: ShaftSegment[] = []
  let Qs = 0, zc = 0, capHit = false
  layers.forEach((Ly, i) => {
    const top = zc, bot = zc + Ly.H
    zc = bot
    if (top >= Leff - 1e-9) return
    const segTop = top, segBot = Math.min(bot, Leff)
    const dL = segBot - segTop
    if (dL <= 1e-9) return
    let sv = effectiveStressAt((segTop + segBot) / 2, layers, Dw)
    if (sv < 1) sv = 1
    let fs: number, how: string
    if (Ly.method === 'spt') {
      fs = nfSPT * num(Ly.N)
      how = 'SPT ' + nfSPT.toFixed(0) + 'N'
    } else if (Ly.soil === 'clay') {
      const cu = num(Ly.cu)
      const psi = cu / sv
      let alpha = psi <= 1 ? 0.5 * Math.pow(psi, -0.5) : 0.5 * Math.pow(psi, -0.25)
      if (alpha > 1) alpha = 1
      fs = alpha * cu
      how = 'alpha=' + alpha.toFixed(2)
    } else {
      const phi = num(Ly.phi)
      const K = cK * (1 - Math.sin(deg2rad(phi)))
      const delta = cDelta * phi
      fs = K * sv * Math.tan(deg2rad(delta))
      how = 'beta K=' + K.toFixed(2) + ',d=' + delta.toFixed(0)
    }
    if (fs > FS_CAP) { fs = FS_CAP; capHit = true }
    if (fs < 0) fs = 0
    const Qsi = perim * dL * fs
    Qs += Qsi
    segs.push({ idx: i + 1, soil: Ly.soil, method: Ly.method, top: segTop, bot: segBot, dL, sv, fs, Qs: Qsi, how })
  })
  if (capHit) warn.push('Sebagian fs dibatasi ke ' + FS_CAP + ' kPa (batas lunak konservatif) — periksa parameter kekuatan/pilih metode lain bila perlu.')

  // Ujung: lapis tempat ujung tiang.
  const tipDepth = Math.min(Leff, totalH)
  let tipLayer = layers[layers.length - 1]
  let zc2 = 0
  for (const l of layers) {
    zc2 += l.H
    if (tipDepth <= zc2 + 1e-9) { tipLayer = l; break }
  }

  const svTip = effectiveStressAt(Leff, layers, Dw)
  let qp: number, qpHow: string
  let Nq: number | null = null, ql: number | null = null
  if (tipLayer.method === 'spt') {
    const Ntip = num(tipLayer.N)
    const sandTip = tipLayer.soil === 'sand'
    qp = Math.min(40 * Ntip * (Leff / D), (sandTip ? 400 : 300) * Ntip)
    qpHow = 'SPT 40N*L/D<=' + (sandTip ? '400' : '300') + 'N'
  } else if (tipLayer.soil === 'clay') {
    qp = 9 * num(tipLayer.cu)
    qpHow = '9*cu'
  } else {
    const phiT = num(tipLayer.phi)
    Nq = nqPrandtl(deg2rad(phiT))
    ql = 0.5 * P_ATM * Nq * Math.tan(deg2rad(phiT))
    qp = Math.min(svTip * Nq, ql)
    qpHow = "sigma'v*Nq<=ql"
  }
  if (qp < 0) qp = 0
  const Qp = Ap * qp
  const Qu = Qp + Qs
  const Wp = Ap * Leff * GAMMA_PILE
  const Qallow = Qu / FS - (inclW ? Wp : 0)

  // Decourt-Quaresma (pembanding empiris).
  let dq: DecourtResult = { active: false }
  let allN = true, sumN = 0, sumL = 0
  for (const s of segs) {
    const Nl = num(layers[s.idx - 1].N)
    if (!(Nl > 0)) { allN = false; break }
    sumN += Nl * s.dL
    sumL += s.dL
  }
  const Ntip2 = num(tipLayer.N)
  if (allN && sumL > 0 && Ntip2 > 0) {
    const NsAvg = sumN / sumL
    const fsDq = 10 * (NsAvg / 3 + 1)
    const QsDq = perim * Leff * fsDq
    const C = tipLayer.soil === 'sand' ? 400 : 120
    const qpDq = C * Ntip2
    const QpDq = Ap * qpDq
    const QuDq = QpDq + QsDq
    dq = { active: true, NsAvg, fsDq, QsDq, C, Np: Ntip2, qpDq, QpDq, QuDq, Qallow: QuDq / FS - (inclW ? Wp : 0) }
  }

  if (Leff / D < 4) warn.push('L/D = ' + (Leff / D).toFixed(1) + ' < 4 — tiang pendek; qp lempung (Nc=9) & rumus tiang panjang mungkin tidak berlaku (cek daya dukung dangkal).')
  if (Dw >= totalH) warn.push('MAT (' + Dw.toFixed(1) + ' m) di bawah profil — dihitung tanpa pengaruh air (tegangan efektif = total).')
  warn.push('Berat sendiri tiang ' + (inclW ? 'DIKURANGKAN' : 'diabaikan') + ' dari Q_izin (Wp = ' + Wp.toFixed(0) + ' kN, γ beton 24 kN/m³).')
  if (dq.active) warn.push('Decourt-Quaresma ditampilkan sebagai pembanding empiris (faktor α,β=1,0). Selisih dengan metode statik/Meyerhof adalah wajar — gunakan penilaian teknik.')
  else warn.push('Decourt-Quaresma dilewati — isi N-SPT (>0) pada SEMUA lapis tertanam untuk pembanding empiris.')
  warn.push('Analisis TIANG TUNGGAL. TIDAK termasuk: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan tiang, beban gempa.')

  return {
    valid: true, warn, shape, D, L, Leff, FS, Dw, ptype, material, inclW, Wp, perim, Ap, totalH, cK, cDelta, nfSPT,
    segs, Qs, tipLayer, svTip, qp, qpHow, Nq, ql, Qp, Qu, Qallow, dq, layers,
  }
}
