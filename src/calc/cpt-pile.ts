// Daya dukung aksial tiang tunggal langsung dari data sondir/CPT.
// Port 1:1 dari modules/cpt-pile/module.js (compute), diverifikasi golden test.
//
//   Ujung (Schmertmann): qp = (qc1 + qc2)/2, qc1 = rata-rata 4D di bawah ujung, qc2 = rata-rata 8D di atas ujung.
//   Selimut: fs sondir (atau Rf·qc), dibatasi 120 kPa, diintegrasikan 200 pias sepanjang L.
//   Q izin = Qp/FSp + Qs/FSs (praktik sondir, default 3 & 5); pembanding Qu/2,5.
// TIDAK termasuk: kapasitas struktural penampang tiang.

import { cptAt, cptAverage, type CptPoint } from './shared/cpt'
import { numFinite as num, type NumLike } from './shared/num'

/** Batas lunak gesekan selimut (kPa). */
const FS_LIMIT = 120

export interface CptPileInput {
  shape?: 'circle' | 'square'
  /** Diameter / sisi (m). */
  D: NumLike
  /** Panjang tertanam (m). */
  Lp: NumLike
  /** Sumber gesekan: kolom fs sondir atau rasio gesek Rf. */
  fsrc?: 'data' | 'rf'
  /** Rasio gesek (%), 0 = 1. */
  Rf: NumLike
  /** FS ujung, 0 = 3. */
  FSp: NumLike
  /** FS selimut, 0 = 5. */
  FSs: NumLike
  /** Beban kerja (kN), 0 = tanpa cek D/C. */
  Pw: NumLike
}

export interface CptPileResult {
  valid: boolean
  warn: string[]
  shape: 'circle' | 'square'
  D: number
  Lp: number
  fsrc: 'data' | 'rf'
  Rf: number
  FSp: number
  FSs: number
  Pw: number
  pts: CptPoint[]
  nPts: number
  zMax?: number
  hasFs?: boolean
  Ap?: number
  /** Keliling (m). */
  K?: number
  qc1?: number
  qc2?: number
  qp?: number
  Qp?: number
  Qs?: number
  fsMax?: number
  capped?: boolean
  Qu?: number
  Qall?: number
  QallGlobal?: number
  dc?: number
}

export function computeCptPile(v: CptPileInput, pts: CptPoint[]): CptPileResult {
  const shape = v.shape || 'circle'
  const D = num(v.D), Lp = num(v.Lp)
  let fsrc = v.fsrc || 'data'
  const Rf = num(v.Rf) || 1
  const FSp = num(v.FSp) || 3, FSs = num(v.FSs) || 5
  const Pw = num(v.Pw)
  const r: CptPileResult = { valid: false, warn: [], shape, D, Lp, fsrc, Rf, FSp, FSs, Pw, pts, nPts: pts.length }

  if (!pts.length) { r.warn.push('Tempel data CPT (z & qc per baris) terlebih dulu.'); return r }
  if (D <= 0 || Lp <= 0) { r.warn.push('Isi diameter/sisi D dan panjang tiang L (> 0).'); return r }

  const zMax = pts[pts.length - 1].z
  r.zMax = zMax
  const hasFs = pts.some((p) => p.fs != null)
  r.hasFs = hasFs
  if (fsrc === 'data' && !hasFs) {
    r.fsrc = fsrc = 'rf'
    r.warn.push('Kolom fs tidak ditemukan di data — selimut memakai estimasi Rf = ' + Rf + '% · qc.')
  }
  if (Lp > zMax)
    r.warn.push('Ujung tiang L = ' + Lp.toFixed(1) + ' m di bawah data terdalam (' + zMax.toFixed(1) +
      ' m) — qc diekstrapolasi konstan (hati-hati).')

  // Ujung.
  const Ap = shape === 'circle' ? (Math.PI * D * D) / 4 : D * D
  const K = shape === 'circle' ? Math.PI * D : 4 * D
  const qc1 = cptAverage(pts, Lp, Lp + 4 * D, 'qc', 50)
  const qc2 = cptAverage(pts, Math.max(0, Lp - 8 * D), Lp, 'qc', 50)
  const qp = (qc1 + qc2) / 2
  const Qp = qp * Ap
  Object.assign(r, { Ap, K, qc1, qc2, qp, Qp })

  // Selimut.
  const n = 200, dz = Lp / n
  let Qs = 0, fsMax = 0, capped = false
  for (let i = 0; i < n; i++) {
    const z = (i + 0.5) * dz
    let fs = fsrc === 'data' ? cptAt(pts, z, 'fs') : (Rf / 100) * cptAt(pts, z, 'qc')
    if (fs > FS_LIMIT) { fs = FS_LIMIT; capped = true }
    fsMax = Math.max(fsMax, fs)
    Qs += fs * K * dz
  }
  Object.assign(r, { Qs, fsMax, capped })

  // Izin.
  const Qu = Qp + Qs
  const Qall = Qp / FSp + Qs / FSs
  const dc = Pw > 0 && Qall > 0 ? Pw / Qall : 0
  Object.assign(r, { Qu, Qall, QallGlobal: Qu / 2.5, dc, valid: true })

  if (capped) r.warn.push('fs dibatasi ' + FS_LIMIT + ' kPa (batas lunak praktik) pada sebagian kedalaman.')
  if (qp > 20000)
    r.warn.push('qp = ' + (qp / 1000).toFixed(1) + ' MPa sangat tinggi — pastikan tiang benar-benar mencapai lapisan ini dan tinjau batas struktural penampang tiang.')
  if (Lp - 8 * D < 0) r.warn.push('Zona 8D di atas ujung terpotong permukaan (L < 8D) — qc2 dirata-rata dari 0.')
  r.warn.push('Kapasitas STRUKTURAL penampang tiang (bahan) tidak dicek di sini.')
  if (dc > 1) r.warn.push('D/C = ' + dc.toFixed(2) + ' > 1 — beban kerja melampaui Q izin.')
  return r
}
