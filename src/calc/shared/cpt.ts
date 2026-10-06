// Data sondir/CPT bersama — dipakai Daya Dukung dari CPT (fondasi dangkal) dan Daya Dukung Tiang (CPT).

/** 1 kg/cm² dalam kPa. */
export const KGCM2 = 98.0665

export type CptUnit = 'kgcm2' | 'mpa'

export interface CptPoint {
  /** Kedalaman (m). */
  z: number
  /** Tahanan konus (kPa). */
  qc: number
  /** Gesekan selimut (kPa), null bila kolom tidak ada. */
  fs: number | null
}

/**
 * Baca teks sondir "z qc [fs]" per baris (pemisah spasi/tab/koma/titik koma), dari Excel/CSV.
 * Baris kosong, komentar (# atau /), dan baris tak valid dilewati; qc < 0 ditolak, fs < 0 diabaikan.
 * qc & fs dikonversi ke kPa: kg/cm² × 98,0665, atau MPa → qc × 1000 (fs MPa dianggap sudah kPa, seperti
 * build lama). Diurutkan menurut z; z kembar → baris pertama dipakai.
 */
export function parseCpt(text: string, unit: CptUnit | string): CptPoint[] {
  const pts: CptPoint[] = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const s = line.trim()
    if (!s || /^[#/]/.test(s)) continue
    const p = s.split(/[\s,;]+/).map(parseFloat)
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0) {
      const qc = unit === 'mpa' ? p[1] * 1000 : p[1] * KGCM2
      let fs: number | null = null
      if (p.length >= 3 && Number.isFinite(p[2]) && p[2] >= 0) fs = unit === 'mpa' ? p[2] : p[2] * KGCM2
      pts.push({ z: p[0], qc, fs })
    }
  }
  pts.sort((a, b) => a.z - b.z)
  const out: CptPoint[] = []
  for (const p of pts) if (!out.length || p.z > out[out.length - 1].z + 1e-9) out.push(p)
  return out
}

/** Nilai `key` di kedalaman z: interpolasi linear, konstan di luar rentang data; null/kosong = 0. */
export function cptAt(pts: readonly CptPoint[], z: number, key: 'qc' | 'fs'): number {
  if (!pts.length) return 0
  if (z <= pts[0].z) return pts[0][key] || 0
  const last = pts[pts.length - 1]
  if (z >= last.z) return last[key] || 0
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i].z) {
      const a = pts[i - 1], b = pts[i]
      const va = a[key] || 0, vb = b[key] || 0
      return va + ((vb - va) * (z - a.z)) / (b.z - a.z)
    }
  }
  return last[key] || 0
}

/** Rata-rata `key` pada z1..z2 dengan aturan titik tengah, n pias. z2 ≤ z1 → nilai di z1. */
export function cptAverage(pts: readonly CptPoint[], z1: number, z2: number, key: 'qc' | 'fs', n: number): number {
  if (z2 <= z1) return cptAt(pts, z1, key)
  let sum = 0
  for (let i = 0; i < n; i++) sum += cptAt(pts, z1 + ((i + 0.5) * (z2 - z1)) / n, key)
  return sum / n
}
