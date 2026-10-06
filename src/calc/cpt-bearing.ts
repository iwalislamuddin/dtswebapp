// Daya dukung izin fondasi dangkal langsung dari data sondir/CPT.
// Port 1:1 dari modules/cpt-bearing/module.js (compute), diverifikasi golden test.
//
//   qc̄ = rata-rata qc pada Df..Df+B.
//   Pasir — Meyerhof (1956), penurunan 25 mm: B ≤ 1,2 m → qa = qc̄/15·Kd; B > 1,2 m → qa = qc̄/25·((B+0,3)/B)²·Kd,
//           Kd = 1 + 0,33·Df/B ≤ 1,33.
//   Lempung — su = (qc̄ − σv0)/Nk; qult,net = 5·su·(1 + 0,2·Df/B)(1 + 0,2·B/L) (Skempton), qa = qult,net/FS.
// TIDAK termasuk: muka air tanah (σv0 total), penurunan konsolidasi lempung.

import { cptAt, cptAverage, type CptPoint } from './shared/cpt'
import { numFinite as num, type NumLike } from './shared/num'

export interface CptBearingInput {
  /** Lebar (m). */
  B: NumLike
  /** Panjang (m); dipakai maks(L, B). */
  L: NumLike
  /** Kedalaman dasar (m). */
  Df: NumLike
  /** Berat isi tanah di atas dasar (kN/m³). */
  gamma: NumLike
  soil?: 'sand' | 'clay'
  /** Faktor kerucut (lempung), 0 = 14. */
  Nk: NumLike
  /** Faktor keamanan (lempung), 0 = 3. */
  FS: NumLike
  /** Tekanan kerja neto (kPa), 0 = tanpa cek D/C. */
  qw: NumLike
}

export interface CptBearingResult {
  valid: boolean
  warn: string[]
  B: number
  L: number
  Df: number
  gamma: number
  soil: 'sand' | 'clay'
  Nk: number
  FS: number
  qw: number
  pts: CptPoint[]
  nPts: number
  zMax?: number
  /** qc rata-rata di zona pengaruh (kPa). */
  qcb?: number
  sigv0?: number
  method?: string
  Kd?: number
  su?: number
  dfb?: number
  /** qult neto (kPa), lempung; null untuk pasir. */
  qult?: number | null
  qaNet?: number
  qaGross?: number
  dc?: number
}

/** qc di kedalaman z (kPa), interpolasi linear. */
export const qcAt = (pts: readonly CptPoint[], z: number): number => cptAt(pts, z, 'qc')

export function computeCptBearing(v: CptBearingInput, pts: CptPoint[]): CptBearingResult {
  const B = num(v.B), Lr = Math.max(num(v.L), num(v.B)) // L ≥ B
  const Df = num(v.Df), gamma = num(v.gamma)
  const soil = v.soil || 'sand'
  const Nk = num(v.Nk) || 14
  const FS = num(v.FS) || 3
  const qw = num(v.qw)
  const r: CptBearingResult = { valid: false, warn: [], B, L: Lr, Df, gamma, soil, Nk, FS, qw, pts, nPts: pts.length }

  if (!pts.length) { r.warn.push('Tempel data CPT (z & qc per baris) terlebih dulu.'); return r }
  if (B <= 0 || Df < 0) { r.warn.push('Isi B > 0 dan Df ≥ 0.'); return r }

  const zMax = pts[pts.length - 1].z
  r.zMax = zMax
  if (Df + B > zMax)
    r.warn.push('Zona pengaruh Df+B = ' + (Df + B).toFixed(1) + ' m melampaui data terdalam (' + zMax.toFixed(1) +
      ' m) — qc di bawahnya diekstrapolasi konstan. Tambah data bila ada.')

  const qcb = cptAverage(pts, Df, Df + B, 'qc', 60)
  const sigv0 = gamma * Df // total; MAT tak dimodelkan
  r.qcb = qcb
  r.sigv0 = sigv0

  let qaNet: number
  if (soil === 'sand') {
    const Kd = Math.min(1 + (0.33 * Df) / B, 1.33)
    qaNet = B <= 1.2 ? (qcb / 15) * Kd : (qcb / 25) * Math.pow((B + 0.3) / B, 2) * Kd
    r.Kd = Kd
    r.qaNet = qaNet
    r.method = 'Meyerhof (1956) — penurunan 25 mm'
    r.qult = null
  } else {
    const su = Math.max(0, (qcb - sigv0) / Nk)
    const dfb = Math.min(Df / B, 2.5)
    const qultNet = 5 * su * (1 + 0.2 * dfb) * (1 + (0.2 * B) / Lr)
    r.su = su
    r.dfb = dfb
    r.qult = qultNet
    qaNet = qultNet / FS
    r.qaNet = qaNet
    r.method = 'su = (qc̄−σv0)/Nk + Skempton'
  }
  r.qaGross = qaNet + sigv0
  const dc = qw > 0 && qaNet > 0 ? qw / qaNet : 0
  r.dc = dc
  r.valid = true

  if (soil === 'sand' && qcb < 2000)
    r.warn.push('qc̄ = ' + (qcb / 1000).toFixed(1) + ' MPa rendah untuk pasir — cek apakah sebenarnya lempung/lanau (pilih mode Lempung).')
  if (soil === 'clay' && qcb > 5000)
    r.warn.push('qc̄ = ' + (qcb / 1000).toFixed(1) + ' MPa tinggi untuk lempung — cek apakah sebenarnya pasir (pilih mode Pasir).')
  if (soil === 'clay')
    r.warn.push('Penurunan KONSOLIDASI lempung tidak dihitung di sini — sering menentukan; cek dengan tool Penurunan Fondasi.')
  if (soil === 'sand')
    r.warn.push('q_izin pasir adalah nilai NETO berbasis penurunan 25 mm (bukan keruntuhan). Untuk penurunan izin berbeda, skala linear (mis. 40 mm → ×1,6).')
  r.warn.push('σv0 memakai γ total tanpa muka air tanah — bila MAT dangkal, gunakan γ efektif rata-rata secara manual.')
  if (dc > 1) r.warn.push('D/C = ' + dc.toFixed(2) + ' > 1 — beban kerja melampaui daya dukung izin.')
  return r
}
