// Penurunan fondasi dangkal: segera (elastis, Steinbrenner) + konsolidasi primer (e–log p) + laju (Terzaghi 1-D).
// Port 1:1 dari modules/settlement/module.js (compute), diverifikasi golden test.
//
//   Se pusat = 4·q0·(B/2)·(1−μ²)/Es·Is·If; sudut = q0·B·(1−μ²)/Es·Is·If; rata-rata lentur ≈ 0,85·pusat, kaku ≈ 0,93·rata-rata.
//   Sc = C·H/(1+e0)·log(σ'f/σ'0), NC/OC dari σ'c; Δσ metode 2:1, rata-rata Simpson sepanjang lempung.
//   Laju: Tv = cv·t/Hdr²; U ≤ 60% → √(4Tv/π), selebihnya Tv = 1,781 − 0,933·log(100 − U%).
// TIDAK termasuk: pemampatan sekunder (creep), lempung berlapis banyak, Schmertmann/N-SPT, Boussinesq penuh.

import { num, type NumLike } from './shared/num'

export type SettlementShape = 'strip' | 'square' | 'circular' | 'rect'

export const SETTLEMENT_SHAPES: readonly [SettlementShape, string][] = [
  ['strip', 'Menerus (strip)'],
  ['square', 'Bujur sangkar'],
  ['circular', 'Lingkaran'],
  ['rect', 'Persegi panjang'],
]

export interface SettlementInput {
  shape?: SettlementShape
  /** Lebar / sisi / diameter (m). */
  B: NumLike
  /** Panjang (m), persegi panjang. */
  L: NumLike
  /** Kedalaman dasar fondasi (m). */
  Df: NumLike
  /** Tekanan neto di dasar (kPa). */
  q0: NumLike
  /** Modulus elastisitas tanah (MPa). */
  Es: NumLike
  /** Angka Poisson. */
  mu: NumLike
  /** Tebal lapisan termampatkan di bawah dasar (m). */
  Hs: NumLike
  /** Faktor kedalaman Fox. */
  If: NumLike
  rigid?: 'flex' | 'rigid'
  /** Kedalaman puncak lempung dari permukaan (m). */
  ztop: NumLike
  /** Tebal lempung (m). */
  Hc: NumLike
  e0: NumLike
  Cc: NumLike
  Cr: NumLike
  /** σ'0 di tengah lempung (kPa). */
  sig0: NumLike
  /** σ'c prakonsolidasi (kPa). */
  sigc: NumLike
  /** Koefisien konsolidasi (m²/tahun). */
  cv: NumLike
  /** Waktu ditinjau (tahun). */
  t: NumLike
  drain?: 'single' | 'double'
}

export interface SteinbrennerFactor {
  Is: number
  F1: number
  F2: number
}

export type ConsolidationMode = 'NC' | 'OC-recompression' | 'OC-melewati-σc'

export type Consolidation =
  | { active: false }
  | {
      active: true
      zt: number
      zm: number
      zb: number
      dTop: number
      dMid: number
      dBot: number
      dAvg: number
      sig0: number
      sigc: number
      sigF: number
      OCR: number
      nc: boolean
      mode: ConsolidationMode
      /** mm */
      Sc: number
      Cc: number
      Cr: number
      e0: number
      Hc: number
      ztop: number
    }

export type ConsolidationRate =
  | { active: false }
  | {
      active: true
      cv: number
      Hdr: number
      drain: string
      t50: number
      t90: number
      t?: number
      Tv?: number
      U?: number
      /** Penurunan pada waktu t (mm). */
      St?: number
    }

export type SettlementResult =
  | { valid: false; warn: string[] }
  | {
      valid: true
      warn: string[]
      shape: SettlementShape
      B: number
      L: number
      Df: number
      q0: number
      isStrip: boolean
      Bc: number
      Lc: number
      EsMPa: number
      mu: number
      Hs: number
      If: number
      rigid: boolean
      IsCenter: number
      IsCorner: number
      /** Semua penurunan dalam mm. */
      SeCenter: number
      SeCorner: number
      SeAvg: number
      SeRigid: number
      Se: number
      consol: Consolidation
      Sc: number
      Stotal: number
      rate: ConsolidationRate
    }

export const shapeName = (k: string): string => SETTLEMENT_SHAPES.find((s) => s[0] === k)?.[1] ?? k

/** Faktor pengaruh Steinbrenner untuk sudut luasan m = L/B, n = H/B, lapisan setebal H. */
export function steinbrennerIs(m: number, n: number, mu: number): SteinbrennerFactor {
  if (n <= 0) n = 1e-6
  if (m < 1e-6) m = 1e-6
  const m2 = m * m, n2 = n * n
  const r_m1 = Math.sqrt(m2 + 1)
  const r_mn = Math.sqrt(m2 + n2)
  const r_mn1 = Math.sqrt(m2 + n2 + 1)
  const r_1n = Math.sqrt(1 + n2)
  const A0 = m * Math.log(((1 + r_m1) * r_mn) / (m * (1 + r_mn1)))
  const A1 = Math.log(((m + r_m1) * r_1n) / (m + r_mn1))
  const F1 = (A0 + A1) / Math.PI
  const A2 = m / (n * r_mn1)
  const F2 = (n / (2 * Math.PI)) * Math.atan(A2)
  return { Is: F1 + ((1 - 2 * mu) / (1 - mu)) * F2, F1, F2 }
}

/** Tambahan tegangan metode 2:1 di kedalaman z di bawah dasar (kPa). */
export function stress2to1(q: number, Bc: number, Lc: number, z: number, isStrip: boolean): number {
  if (z < 0) z = 0
  if (isStrip) return (q * Bc) / (Bc + z)
  return (q * Bc * Lc) / ((Bc + z) * (Lc + z))
}

/** Derajat konsolidasi rata-rata U (0..1) dari faktor waktu Tv (Terzaghi 1-D). */
export function degreeOfConsolidation(Tv: number): number {
  if (Tv <= 0) return 0
  if (Tv < 0.2827) return Math.min(Math.sqrt((4 * Tv) / Math.PI), 0.6)
  const rem = Math.pow(10, (1.781 - Tv) / 0.933) // 100 − U%
  return Math.min(1 - rem / 100, 0.99999)
}

export function computeSettlement(v: SettlementInput): SettlementResult {
  const warn: string[] = []
  const shape = v.shape || 'square'
  let B = num(v.B), L = num(v.L)
  const Df = num(v.Df), q0 = num(v.q0), EsMPa = num(v.Es)
  let mu = num(v.mu), Hs = num(v.Hs), If = num(v.If)
  const rigid = String(v.rigid) === 'rigid'
  const ztop = num(v.ztop), Hc = num(v.Hc), e0 = num(v.e0), Cc = num(v.Cc)
  let Cr = num(v.Cr), sigc = num(v.sigc)
  const sig0 = num(v.sig0), cv = num(v.cv), tYr = num(v.t)
  const drain = String(v.drain || 'double')

  if (!(B > 0)) { warn.push('Lebar fondasi B harus > 0.'); return { valid: false, warn } }
  if (!(Df >= 0)) { warn.push('Kedalaman Df tidak boleh negatif.'); return { valid: false, warn } }
  if (!(q0 > 0)) { warn.push('Tekanan neto q0 harus > 0.'); return { valid: false, warn } }
  if (!(EsMPa > 0)) { warn.push('Modulus elastisitas Es harus > 0.'); return { valid: false, warn } }
  if (!(mu > 0 && mu < 0.5)) mu = mu >= 0.5 ? 0.49 : 0.3
  if (!(Hs > 0)) Hs = 30
  if (!(If > 0)) If = 1

  const isStrip = shape === 'strip'
  let Bc: number, Lc: number
  if (isStrip) { Bc = B; Lc = B * 40; L = 0 }
  else if (shape === 'square') { Bc = B; Lc = B; L = B }
  else if (shape === 'circular') { Bc = 0.8862 * B; Lc = 0.8862 * B; L = B } // luas ekuivalen persegi
  else {
    if (!(L > 0)) { warn.push('Panjang L harus > 0 untuk fondasi persegi panjang.'); return { valid: false, warn } }
    if (L < B) { [B, L] = [L, B]; warn.push('L < B ditukar agar B = sisi pendek.') }
    Bc = B
    Lc = L
  }

  // Penurunan segera (elastis).
  const Es = EsMPa * 1000 // MPa → kPa
  const isC = steinbrennerIs(Lc / Bc, Hs / (Bc / 2), mu)
  let SeCenter = ((4 * q0 * (Bc / 2) * (1 - mu * mu)) / Es) * isC.Is * If // m
  const isE = steinbrennerIs(Lc / Bc, Hs / Bc, mu)
  let SeCorner = ((q0 * Bc * (1 - mu * mu)) / Es) * isE.Is * If // m
  let SeAvg = 0.85 * SeCenter
  let SeRigid = 0.93 * SeAvg
  SeCenter *= 1000; SeCorner *= 1000; SeAvg *= 1000; SeRigid *= 1000 // mm
  const Se = rigid ? SeRigid : SeCenter

  // Penurunan konsolidasi.
  let consol: Consolidation = { active: false }
  if (Hc > 0 && Cc > 0 && e0 > 0) {
    if (!(sig0 > 0)) warn.push("σ'0 (tegangan efektif di tengah lempung) harus > 0 untuk konsolidasi.")
    else {
      if (Cr < 0) Cr = 0
      if (!(sigc > 0) || sigc < sig0) sigc = sig0 // σ'c ≥ σ'0
      const zt = Math.max(0.001, ztop - Df) // puncak lempung di bawah dasar
      const zm = zt + Hc / 2, zb = zt + Hc
      const dTop = stress2to1(q0, Bc, Lc, zt, isStrip)
      const dMid = stress2to1(q0, Bc, Lc, zm, isStrip)
      const dBot = stress2to1(q0, Bc, Lc, zb, isStrip)
      const dAvg = (dTop + 4 * dMid + dBot) / 6
      const sigF = sig0 + dAvg
      const OCR = sigc / sig0
      const nc = OCR <= 1.0001
      const HH = Hc / (1 + e0)
      let Sc: number, mode: ConsolidationMode
      if (nc) { Sc = Cc * HH * Math.log10(sigF / sig0); mode = 'NC' }
      else if (sigF <= sigc) { Sc = Cr * HH * Math.log10(sigF / sig0); mode = 'OC-recompression' }
      else {
        Sc = Cr * HH * Math.log10(sigc / sig0) + Cc * HH * Math.log10(sigF / sigc)
        mode = 'OC-melewati-σc'
      }
      Sc *= 1000 // mm
      consol = { active: true, zt, zm, zb, dTop, dMid, dBot, dAvg, sig0, sigc, sigF, OCR, nc, mode, Sc, Cc, Cr, e0, Hc, ztop }
    }
  } else if (Hc > 0 || Cc > 0) {
    warn.push('Konsolidasi tidak dihitung — lengkapi tebal lempung Hc, Cc dan e0 (juga σ0).')
  }

  const Sc = consol.active ? consol.Sc : 0
  const Stotal = Se + Sc

  // Laju konsolidasi.
  let rate: ConsolidationRate = { active: false }
  if (cv > 0 && consol.active) {
    const Hdr = drain === 'single' ? Hc : Hc / 2
    rate = { active: true, cv, Hdr, drain, t50: (0.197 * Hdr * Hdr) / cv, t90: (0.848 * Hdr * Hdr) / cv }
    if (tYr > 0) {
      const Tv = (cv * tYr) / (Hdr * Hdr)
      const U = degreeOfConsolidation(Tv)
      Object.assign(rate, { t: tYr, Tv, U, St: Se + U * Sc })
    }
  }

  if (consol.active && ztop < Df) warn.push('Puncak lempung (' + ztop.toFixed(2) + ' m) di atas dasar fondasi (Df=' + Df.toFixed(2) + ' m) — Δσ dihitung dari dasar fondasi (z diklamp ke ~0). Periksa stratigrafi.')
  if (consol.active) {
    if (consol.nc) warn.push('Lempung NORMALLY CONSOLIDATED (σc ≈ σ0, OCR ≈ 1) — seluruh regangan pakai Cc; penurunan konsolidasi cenderung besar.')
    else if (consol.mode === 'OC-recompression') warn.push('OVERCONSOLIDATED, σf ≤ σc — seluruh regangan pada kurva pemampatan-kembali (Cr); penurunan kecil.')
    else warn.push('OVERCONSOLIDATED, σf melewati σc (OCR=' + consol.OCR.toFixed(2) + ') — regangan dua tahap: Cr sampai σc lalu Cc setelahnya.')
    warn.push('Δσ metode 2:1 (rata-rata Simpson di sepanjang lempung) — pendekatan; untuk lempung tebal/berlapis pakai Boussinesq atau bagi sub-lapisan.')
  }
  if (rate.active && !rate.t) warn.push('Isi waktu t (tahun) untuk menghitung derajat konsolidasi U pada saat t.')
  if (Df > B * 4) warn.push('Df/B = ' + (Df / B).toFixed(1) + ' > 4 — fondasi cenderung dalam; metode penurunan dangkal mungkin tidak berlaku.')
  if (Hs < 2 * B) warn.push('Lapisan termampatkan H = ' + Hs.toFixed(1) + ' m < 2B — pastikan H benar (kedalaman ke lapisan keras/batuan di bawah dasar fondasi).')
  warn.push('Penurunan segera memakai teori elastis (cocok untuk lempung jenuh tak-terdrainase & pasir sebagai estimasi). PEMAMPATAN SEKUNDER (creep) tidak dihitung.')

  return {
    valid: true, warn, shape, B, L, Df, q0, isStrip, Bc, Lc, EsMPa, mu, Hs, If, rigid,
    IsCenter: isC.Is, IsCorner: isE.Is, SeCenter, SeCorner, SeAvg, SeRigid, Se, consol, Sc, Stotal, rate,
  }
}
