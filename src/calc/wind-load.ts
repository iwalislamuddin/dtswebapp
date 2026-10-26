// Beban angin gedung — SNI 1727:2020 (ASCE 7-16) Bab 26–27, prosedur pengarah, SPGAU dinding, gedung tertutup kaku.
// Port 1:1 dari modules/wind-load/module.js (compute), diverifikasi golden test.
//
//   qz = 0,613·Kz·Kzt·Kd·Ke·V² (Pa → kPa); Kz = 2,01·(z/zg)^(2/α), z ≥ 4,6 m (eksposur B/C/D).
//   Cp windward 0,8 (variasi z), leeward dari L/B (−0,5/−0,3/−0,2), samping −0,7; GCpi ±0,18 / ±0,55 / 0.
//   Geser dasar & momen guling: integrasi 40 strip; beban minimum 0,77 kPa × B·H (Ps. 27.1.5).
// TIDAK termasuk: atap (uplift), faktor hembusan fleksibel Gf, Kzt dihitung, parapet, komponen & kladding (Bab 30).
// Tipe struktur lain (gudang pelana, atap bebas, rangka terbuka) di bagian bawah berkas.

import { numFinite as num, type NumLike } from './shared/num'

export type Exposure = 'B' | 'C' | 'D'
export type Enclosure = 'enclosed' | 'partial' | 'open'

/** Konstanta eksposur (α, zg dalam m) — Tabel 26.11-1. */
export const EXPO: Record<Exposure, { alpha: number; zg: number }> = {
  B: { alpha: 7.0, zg: 365.76 },
  C: { alpha: 9.5, zg: 274.32 },
  D: { alpha: 11.5, zg: 213.36 },
}

export interface WindInput {
  /** Kecepatan angin dasar (m/s). */
  V: NumLike
  expo?: Exposure
  /** Kd, Kzt, Ke, G — 0 = default 0,85 / 1,0 / 1,0 / 0,85. */
  Kd: NumLike
  Kzt: NumLike
  Ke: NumLike
  G: NumLike
  enc?: Enclosure
  /** Lebar tegak lurus angin, panjang sejajar angin, tinggi atap rata-rata (m). */
  B: NumLike
  L: NumLike
  H: NumLike
}

export interface WindLevel {
  /** m, -, kPa */
  z: number
  Kz: number
  qz: number
  /** Tekanan windward ±GCpi (kPa). */
  pWW: number
  pWWm: number
}

export interface WindResult {
  valid: boolean
  warn: string[]
  V: number
  expo: string
  Kd: number
  Kzt: number
  Ke: number
  G: number
  enc: string
  GCpi: number
  B: number
  L: number
  H: number
  Kh?: number
  /** kPa */
  qh?: number
  LB?: number
  CpL?: number
  CpW?: number
  CpS?: number
  /** Tekanan desain dinding (kPa): …Plus = GCpi positif, …Minus = GCpi negatif. */
  pWWtopPlus?: number
  pWWtopMinus?: number
  pLee?: number
  pLeeMinus?: number
  pSide?: number
  pSideMinus?: number
  pNetTop?: number
  /** Geser dasar (kN) & momen guling (kNm). */
  F?: number
  M?: number
  Fmin?: number
  minGoverns?: boolean
  Fdesign?: number
  table?: WindLevel[]
}

/** Koefisien eksposur tekanan velositas Kz di ketinggian z (m). */
export function KzAt(z: number, ex: string): number {
  const e = EXPO[ex as Exposure] || EXPO.C
  const zz = Math.max(4.6, Math.min(z, e.zg))
  return 2.01 * Math.pow(zz / e.zg, 2 / e.alpha)
}

/** Cp dinding leeward dari L/B (Gbr. 27.3-1), interpolasi linear. */
export function cpLeeward(LB: number): number {
  if (LB <= 1) return -0.5
  if (LB <= 2) return -0.5 + (LB - 1) * 0.2
  if (LB <= 4) return -0.3 + (LB - 2) * 0.05
  return -0.2
}

export function computeWind(v: WindInput): WindResult {
  const V = num(v.V)
  const ex = v.expo || 'C'
  const Kd = num(v.Kd) || 0.85, Kzt = num(v.Kzt) || 1.0, Ke = num(v.Ke) || 1.0, G = num(v.G) || 0.85
  const enc = v.enc || 'enclosed'
  const B = num(v.B), Lp = num(v.L), H = num(v.H)
  const GCpi = enc === 'partial' ? 0.55 : enc === 'open' ? 0 : 0.18
  const r: WindResult = { valid: false, warn: [], V, expo: ex, Kd, Kzt, Ke, G, enc, GCpi, B, L: Lp, H }
  if (V <= 0 || B <= 0 || Lp <= 0 || H <= 0) { r.warn.push('Lengkapi V, B, L, dan H (> 0).'); return r }

  const q = (z: number) => (0.613 * KzAt(z, ex) * Kzt * Kd * Ke * V * V) / 1000 // kPa
  const Kh = KzAt(H, ex), qh = q(H)
  const LB = Lp / B
  const CpL = cpLeeward(LB), CpW = 0.8, CpS = -0.7
  Object.assign(r, {
    Kh, qh, LB, CpL, CpW, CpS,
    pWWtopPlus: qh * G * CpW - qh * GCpi, pWWtopMinus: qh * G * CpW + qh * GCpi,
    pLee: qh * G * CpL - qh * GCpi, pLeeMinus: qh * G * CpL + qh * GCpi,
    pSide: qh * G * CpS - qh * GCpi, pSideMinus: qh * G * CpS + qh * GCpi,
    pNetTop: qh * G * CpW + qh * G * Math.abs(CpL), // internal saling meniadakan
  })

  // Geser dasar & momen guling (40 strip).
  const nS = 40, dz = H / nS
  let F = 0, M = 0
  for (let i = 0; i < nS; i++) {
    const zMid = (i + 0.5) * dz
    const pNet = q(zMid) * G * CpW + qh * G * Math.abs(CpL)
    F += pNet * B * dz
    M += pNet * B * dz * zMid
  }
  const Fmin = 0.77 * B * H
  const table = [0.25, 0.5, 0.75, 1.0].map((f) => {
    const z = f * H, qz = q(z)
    return { z, Kz: KzAt(z, ex), qz, pWW: qz * G * CpW - qh * GCpi, pWWm: qz * G * CpW + qh * GCpi }
  })
  Object.assign(r, { F, M, Fmin, minGoverns: Fmin > F, Fdesign: Math.max(F, Fmin), table, valid: true })

  if (H > 160) r.warn.push('H = ' + H.toFixed(0) + ' m sangat tinggi — cek fleksibilitas (T > 1 dtk → perlu Gf, bukan G=0,85). Prosedur ini untuk gedung KAKU.')
  else if (H > 60) r.warn.push('H > 60 m — prosedur pengarah tetap berlaku, tetapi pastikan gedung kaku (n1 ≥ 1 Hz); bila fleksibel gunakan Gf.')
  if (H / Math.min(B, Lp) > 4) r.warn.push('H/lebar-terkecil = ' + (H / Math.min(B, Lp)).toFixed(1) + ' > 4 — gedung langsing, kemungkinan fleksibel; periksa frekuensi alami.')
  if (Fmin > F) r.warn.push('Beban minimum SPGAU 0,77 kN/m² (Ps. 27.1.5) MENENTUKAN: F,min = ' + Fmin.toFixed(1) + ' kN > hasil hitungan ' + F.toFixed(1) + ' kN.')
  if (V < 20 || V > 60) r.warn.push('V = ' + V + ' m/s di luar rentang lazim peta angin Indonesia (± 25–45 m/s) — pastikan satuan m/s (bukan km/jam).')
  if (Kzt !== 1) r.warn.push('Kzt = ' + Kzt + ' ≠ 1 — pastikan dihitung dari Ps. 26.8 (bukit/escarpment).')
  r.warn.push('Atap TIDAK dihitung (uplift atap datar/miring, zona tepi) — tinjau terpisah. Tekanan dinding samping & internal untuk desain elemen dinding (K&K perlu prosedur Bab 30).')
  return r
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Tipe struktur lain (bukan port build lama) — SNI 1727:2020 (ASCE 7-16), prosedur pengarah:
//   • Gudang tertutup atap pelana (Gbr. 27.3-1, dinding + atap, dua arah angin).
//   • Bangunan terbuka atap bebas monoslope / pelana (Ps. 27.3.2, Gbr. 27.3-4, 27.3-5, 27.3-7): p = qh·G·CN.
//   • Rangka terbuka bidang tunggal & menara rangka (Ps. 29.4, Gbr. 29.4-2 / 29.4-3): F = qz·G·Cf·Af.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Data angin bersama semua tipe (angka sudah diparse). */
export interface WindBase {
  V: number
  expo: Exposure
  Kd: number
  Kzt: number
  Ke: number
  G: number
}

/** Tekanan velositas qz (kPa) — Pers. 26.10-1. */
export const qzOf = (b: WindBase, z: number): number => (0.613 * KzAt(z, b.expo) * b.Kzt * b.Kd * b.Ke * b.V * b.V) / 1000

/** Interpolasi linear pada tabel (xs naik), dijepit di ujung. */
export function lerpTable(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
  }
  return ys[ys.length - 1]
}

/** Tabel dua arah: baris = h/L, kolom = θ. */
const lerp2 = (rowsX: readonly number[], colsX: readonly number[], t: readonly (readonly number[])[], r: number, c: number) =>
  lerpTable(rowsX, t.map((row) => lerpTable(colsX, row, c)), r)

const fmtX = (x: number) => (Math.round(x * 10) / 10).toString()

// ── Gbr. 27.3-1: atap, angin tegak lurus bubungan θ ≥ 10° ────────────────────────────────────────────────
const RF_HL = [0.25, 0.5, 1.0] as const
const RF_TH = [10, 15, 20, 25, 30, 35, 45] as const
/** Atap windward, nilai pertama (isap) — 0,0 = nilai bantu interpolasi (0,0* di gambar). */
const RF_WW1 = [
  [-0.7, -0.5, -0.3, -0.2, -0.2, 0.0, 0.0],
  [-0.9, -0.7, -0.4, -0.3, -0.2, -0.2, 0.0],
  [-1.3, -1.0, -0.7, -0.5, -0.3, -0.2, 0.0],
] as const
/** Atap windward, nilai kedua (tekan / isap kecil). */
const RF_WW2 = [
  [-0.18, 0.0, 0.2, 0.3, 0.3, 0.4, 0.4],
  [-0.18, -0.18, 0.0, 0.2, 0.2, 0.3, 0.4],
  [-0.18, -0.18, -0.18, 0.0, 0.2, 0.2, 0.3],
] as const
const RF_LW_TH = [10, 15, 20] as const
const RF_LW = [
  [-0.3, -0.5, -0.6],
  [-0.5, -0.5, -0.6],
  [-0.7, -0.6, -0.6],
] as const

/** Cp atap windward [nilai 1, nilai 2] dan leeward, angin ⊥ bubungan, θ ≥ 10° (Gbr. 27.3-1). */
export function cpGableRoof(hL: number, theta: number): { ww: [number, number]; lw: number } {
  return {
    ww: [lerp2(RF_HL, RF_TH, RF_WW1, hL, theta), lerp2(RF_HL, RF_TH, RF_WW2, hL, theta)],
    lw: lerp2(RF_HL, RF_LW_TH, RF_LW, hL, theta),
  }
}

/** Zona atap dari tepi windward (θ < 10° atau angin sejajar bubungan), Gbr. 27.3-1: [x0, x1, Cp] per zona, x ≤ L. */
export function cpRoofZones(h: number, L: number): { x0: number; x1: number; Cp: number }[] {
  const t = Math.min(1, Math.max(0, (h / L - 0.5) / 0.5)) // 0 di h/L ≤ 0,5 … 1 di h/L ≥ 1,0
  const v = (a: number, b: number) => a + (b - a) * t
  const cps = [v(-0.9, -1.3), v(-0.9, -0.7), v(-0.5, -0.7), v(-0.3, -0.7)]
  const xb = [0, h / 2, h, 2 * h, Infinity]
  const out: { x0: number; x1: number; Cp: number }[] = []
  for (let i = 0; i < 4; i++) {
    const x0 = xb[i], x1 = Math.min(xb[i + 1], L)
    if (x1 <= x0 + 1e-9) continue
    const prev = out[out.length - 1]
    // zona bersebelahan dengan Cp sama digabung (mis. 0–h/2 & h/2–h pada h/L ≤ 0,5)
    if (prev && Math.abs(prev.Cp - cps[i]) < 1e-12) prev.x1 = x1
    else out.push({ x0, x1, Cp: cps[i] })
  }
  return out
}

export interface WarehouseInput extends WindBase {
  enc: 'enclosed' | 'partial'
  /** Bentang (tegak lurus bubungan), panjang gedung (sejajar bubungan), tinggi tritisan (m), sudut atap (°), jarak portal (m). */
  S: number
  Lb: number
  he: number
  theta: number
  s: number
}

/** Satu permukaan: tekanan p = q·G·Cp − qh·GCpi; atap membawa rentang horizontal [x0, x1] dari tepi windward. */
export interface WhSurface {
  name: string
  kind: 'wall' | 'roof'
  /** q pemakai (kPa) dan label z-nya (h, e = tritisan, r = bubungan). */
  q: number
  qAt: 'h' | 'e' | 'r'
  /** Cp kasus atap 1 & 2 (dinding: sama). */
  Cp: [number, number]
  x0?: number
  x1?: number
  /** −1 lereng windward, +1 lereng leeward, 0 sejajar bubungan (tanpa komponen horizontal). */
  side?: -1 | 0 | 1
}

export interface WhDirection {
  key: 'normal' | 'parallel'
  label: string
  /** Lebar tegak lurus & panjang sejajar arah angin (m). */
  B: number
  L: number
  hL: number
  LB: number
  surfaces: WhSurface[]
  /** Gaya horizontal total (kN) kasus atap 1 & 2 (internal saling meniadakan). */
  F: [number, number]
  Fmin: number
  /** Gaya angkat atap total (kN, + = ke atas) kasus 1 & 2 dengan +GCpi. */
  U: [number, number]
  /** Luas dinding & proyeksi vertikal atap untuk beban minimum (m²). */
  Awall: number
  Aroof: number
}

export interface WarehouseResult {
  valid: boolean
  warn: string[]
  inp: WarehouseInput
  GCpi: number
  rise: number
  hr: number
  h: number
  Kh: number
  qh: number
  qe: number
  qr: number
  dirs: WhDirection[]
}

/** Tekanan desain (kPa) permukaan untuk kasus atap k dan tanda GCpi (+1 / −1). */
export const whP = (r: WarehouseResult, sf: WhSurface, k: 0 | 1, sgn: 1 | -1) => sf.q * r.inp.G * sf.Cp[k] - sgn * r.qh * r.GCpi

export function computeWarehouse(inp: WarehouseInput): WarehouseResult {
  const { S, Lb, he, theta, G } = inp
  const GCpi = inp.enc === 'partial' ? 0.55 : 0.18
  const tan = Math.tan((theta * Math.PI) / 180)
  const rise = (S / 2) * tan, hr = he + rise
  // h = tinggi atap rata-rata; θ ≤ 10° boleh tinggi tritisan (Ps. 26.2)
  const h = theta <= 10 ? he : he + rise / 2
  const qh = qzOf(inp, h), qe = qzOf(inp, he), qr = qzOf(inp, hr)
  const r: WarehouseResult = { valid: false, warn: [], inp, GCpi, rise, hr, h, Kh: KzAt(h, inp.expo), qh, qe, qr, dirs: [] }
  if (!(S > 0 && Lb > 0 && he > 0 && theta >= 0 && theta <= 45)) {
    r.warn.push('Lengkapi bentang, panjang, tinggi tritisan (> 0) dan sudut atap 0–45°.')
    return r
  }

  // Arah 1: angin tegak lurus bubungan (L = bentang S, B = panjang Lb).
  const n: WhSurface[] = [{ name: 'Dinding windward', kind: 'wall', q: qe, qAt: 'e', Cp: [0.8, 0.8] }]
  if (theta >= 10) {
    const c = cpGableRoof(h / S, theta)
    n.push({ name: 'Atap windward', kind: 'roof', q: qh, qAt: 'h', Cp: c.ww, x0: 0, x1: S / 2, side: -1 })
    n.push({ name: 'Atap leeward', kind: 'roof', q: qh, qAt: 'h', Cp: [c.lw, c.lw], x0: S / 2, x1: S, side: 1 })
  } else {
    for (const z of cpRoofZones(h, S)) {
      // pisah di bubungan agar komponen horizontal tiap lereng benar
      const parts = z.x0 < S / 2 && z.x1 > S / 2 ? [[z.x0, S / 2], [S / 2, z.x1]] : [[z.x0, z.x1]]
      for (const [a, b] of parts) {
        const side = a < S / 2 - 1e-9 ? -1 : 1
        n.push({ name: `Atap ${side < 0 ? 'windward' : 'leeward'} ${fmtX(a)}–${fmtX(b)} m`, kind: 'roof', q: qh, qAt: 'h', Cp: [z.Cp, -0.18], x0: a, x1: b, side })
      }
    }
  }
  const cpLn = cpLeeward(S / Lb)
  n.push({ name: 'Dinding leeward', kind: 'wall', q: qh, qAt: 'h', Cp: [cpLn, cpLn] })
  n.push({ name: 'Dinding samping', kind: 'wall', q: qh, qAt: 'h', Cp: [-0.7, -0.7] })

  // Arah 2: angin sejajar bubungan (L = Lb, B = S); dinding windward = ujung pelana.
  const p: WhSurface[] = [{ name: 'Dinding windward (ujung pelana)', kind: 'wall', q: qr, qAt: 'r', Cp: [0.8, 0.8] }]
  for (const z of cpRoofZones(h, Lb)) p.push({ name: `Atap ${fmtX(z.x0)}–${fmtX(z.x1)} m`, kind: 'roof', q: qh, qAt: 'h', Cp: [z.Cp, -0.18], x0: z.x0, x1: z.x1, side: 0 })
  const cpLp = cpLeeward(Lb / S)
  p.push({ name: 'Dinding leeward (ujung pelana)', kind: 'wall', q: qh, qAt: 'h', Cp: [cpLp, cpLp] })
  p.push({ name: 'Dinding samping', kind: 'wall', q: qh, qAt: 'h', Cp: [-0.7, -0.7] })

  const ext = (sf: WhSurface, k: 0 | 1) => sf.q * G * sf.Cp[k]
  const roofs = (list: WhSurface[]) => list.filter((sf) => sf.kind === 'roof')
  const both = (f: (k: 0 | 1) => number): [number, number] => [f(0), f(1)]
  // Lereng windward: tekan (+p) mendorong searah angin; lereng leeward: isap (−p) menarik searah angin.
  const Fn = both((k) => (ext(n[0], k) - ext(n[n.length - 2], k)) * he * Lb + roofs(n).reduce((a, sf) => a - sf.side! * ext(sf, k) * (sf.x1! - sf.x0!) * tan * Lb, 0))
  const Un = both((k) => -roofs(n).reduce((a, sf) => a + whP(r, sf, k, 1) * (sf.x1! - sf.x0!) * Lb, 0))
  const Agable = S * he + (S * rise) / 2
  const Fp = both((k) => (ext(p[0], k) - ext(p[p.length - 2], k)) * Agable)
  const Up = both((k) => -roofs(p).reduce((a, sf) => a + whP(r, sf, k, 1) * (sf.x1! - sf.x0!) * S, 0))
  r.dirs = [
    { key: 'normal', label: 'Angin tegak lurus bubungan', B: Lb, L: S, hL: h / S, LB: S / Lb, surfaces: n, F: Fn, U: Un, Awall: Lb * he, Aroof: Lb * rise, Fmin: 0.77 * Lb * he + 0.38 * Lb * rise },
    { key: 'parallel', label: 'Angin sejajar bubungan', B: S, L: Lb, hL: h / Lb, LB: Lb / S, surfaces: p, F: Fp, U: Up, Awall: Agable, Aroof: 0, Fmin: 0.77 * Agable },
  ]
  r.valid = true

  if (h > 18) r.warn.push(`h = ${h.toFixed(1)} m > 18 m — bukan gedung rendah; pastikan gedung kaku (G = 0,85).`)
  if (theta < 10) r.warn.push('θ < 10°: atap ditinjau per zona jarak dari tepi windward (Gbr. 27.3-1) dan h = tinggi tritisan. Nilai −1,3 boleh direduksi menurut luas (catatan Gbr. 27.3-1) — tidak direduksi di sini (konservatif).')
  for (const d of r.dirs) {
    const Fd = Math.max(d.F[0], d.F[1])
    if (d.Fmin > Fd) r.warn.push(`${d.label}: beban minimum Ps. 27.1.5 (0,77 kPa dinding + 0,38 kPa proyeksi atap) MENENTUKAN: ${d.Fmin.toFixed(1)} kN > ${Fd.toFixed(1)} kN.`)
  }
  if (inp.V < 20 || inp.V > 60) r.warn.push('V = ' + inp.V + ' m/s di luar rentang lazim peta angin Indonesia (± 25–45 m/s) — pastikan satuan m/s (bukan km/jam).')
  r.warn.push('Dinding windward memakai qz di puncak dinding (tritisan / bubungan) secara seragam — konservatif. Komponen & kladding (gording, penutup atap, zona tepi) perlu prosedur Bab 30.')
  return r
}

// ── Atap bebas bangunan terbuka (Ps. 27.3.2) ─────────────────────────────────────────────────────────────
export type FreeRoofShape = 'mono' | 'pitched'
export type FreeRoofFlow = 'clear' | 'obstructed'

/** Baris θ: [kasus A, kasus B] × [CNW bersih, CNL bersih, CNW terhalang, CNL terhalang]. */
type CnRow = readonly [readonly [number, number, number, number], readonly [number, number, number, number]]
const FR_TH = [0, 7.5, 15, 22.5, 30, 37.5, 45] as const
/** Gbr. 27.3-4 monoslope, γ = 0° (angin datang dari tepi tinggi — menerpa sisi bawah atap). */
const MONO_0: readonly CnRow[] = [
  [[1.2, 0.3, -0.5, -1.2], [-1.1, -0.1, -1.1, -0.6]],
  [[-0.6, -1.0, -1.0, -1.5], [-1.4, 0.0, -1.7, -0.8]],
  [[-0.9, -1.3, -1.1, -1.5], [-1.9, 0.0, -2.1, -0.6]],
  [[-1.5, -1.6, -1.5, -1.7], [-2.4, -0.3, -2.3, -0.9]],
  [[-1.8, -1.8, -1.5, -1.8], [-2.5, -0.5, -2.3, -1.1]],
  [[-1.8, -1.8, -1.5, -1.8], [-2.4, -0.6, -2.2, -1.9]],
  [[-1.6, -1.8, -1.3, -1.8], [-2.3, -0.7, -1.9, -2.1]],
]
/** Gbr. 27.3-4 monoslope, γ = 180° (angin datang dari tepi rendah — menerpa sisi atas atap). */
const MONO_180: readonly CnRow[] = [
  [[1.2, 0.3, -0.5, -1.2], [-1.1, -0.1, -1.1, -0.6]],
  [[0.9, 1.5, -0.2, -1.2], [1.6, 0.3, 0.8, -0.3]],
  [[1.3, 1.6, 0.4, -1.1], [1.8, 0.6, -0.2, -0.9]],
  [[1.7, 1.8, 0.5, -1.0], [2.2, 0.7, -0.6, -1.2]],
  [[2.1, 2.1, 0.6, -1.0], [2.6, 1.0, -0.8, -1.2]],
  [[2.1, 2.2, 0.7, -0.9], [2.7, 1.1, -0.9, -1.3]],
  [[2.2, 2.5, 0.8, -0.9], [2.6, 1.4, -0.9, -1.2]],
]
/** Gbr. 27.3-5 atap pelana bebas, γ = 0°, 180° (θ = 7,5°…45°; baris θ = 0° hanya pengisi — θ < 7,5° memakai monoslope). */
const PITCHED: readonly CnRow[] = [
  [[1.2, 0.3, -0.5, -1.2], [-1.1, -0.1, -1.1, -0.6]],
  [[1.1, -0.3, -1.6, -1.0], [0.2, -1.2, -0.9, -1.7]],
  [[1.1, -0.4, -1.2, -1.0], [0.1, -1.1, -0.6, -1.6]],
  [[1.1, 0.1, -1.2, -1.2], [-0.1, -0.8, -0.8, -1.7]],
  [[1.3, 0.3, -0.7, -0.7], [-0.1, -0.9, -0.2, -1.1]],
  [[1.3, 0.6, -0.6, -0.6], [-0.2, -0.6, -0.3, -0.9]],
  [[1.1, 0.9, -0.5, -0.5], [-0.3, -0.5, -0.3, -0.7]],
]
/** Gbr. 27.3-7 (γ = 90°): zona ≤ h, h–2h, > 2h → [A bersih, A terhalang, B bersih, B terhalang]. */
const FR_90 = [
  [-0.8, -1.2, 0.8, 0.5],
  [-0.6, -0.9, 0.5, 0.5],
  [-0.3, -0.6, 0.3, 0.3],
] as const

/** CNW/CNL kasus A & B pada θ (interpolasi linear 7,5°–45°; θ < 7,5° → nilai θ = 0°, catatan gambar). */
function cnFreeRoof(table: readonly CnRow[], theta: number, flow: FreeRoofFlow): { A: [number, number]; B: [number, number] } {
  const o = flow === 'clear' ? 0 : 2
  const th = theta < 7.5 ? 0 : theta
  const col = (c: 0 | 1, j: number) => lerpTable(FR_TH, table.map((row) => row[c][j]), th)
  return { A: [col(0, o), col(0, o + 1)], B: [col(1, o), col(1, o + 1)] }
}

export interface FreeRoofInput extends WindBase {
  shape: FreeRoofShape
  flow: FreeRoofFlow
  /** Sudut atap (°), tinggi atap rata-rata h, dimensi searah angin L (bentang), panjang B, jarak rangka s (m). */
  theta: number
  h: number
  L: number
  B: number
  s: number
}

export interface FreeRoofLoad {
  CNW: number
  CNL: number
  /** Tekanan neto paruh windward / leeward (kPa, + = menekan sisi atas). */
  pW: number
  pL: number
  /** Gaya vertikal total (kN, + = ke bawah) & horizontal searah angin (kN). */
  Fv: number
  Fh: number
}

/** Satu arah angin γ = 0°/180°: kasus beban A & B. */
export interface FreeRoofCase {
  key: 'g0' | 'g180'
  label: string
  A: FreeRoofLoad
  B: FreeRoofLoad
}

export interface FreeRoofZone {
  x0: number
  x1: number
  CNA: number
  CNB: number
  pA: number
  pB: number
}

export interface FreeRoofResult {
  valid: boolean
  warn: string[]
  inp: FreeRoofInput
  Kh: number
  qh: number
  hL: number
  /** Kenaikan atap total (monoslope: L·tanθ, pelana: L/2·tanθ). */
  rise: number
  /** Pelana θ < 7,5° memakai koefisien monoslope θ = 0°. */
  usesMonoZero: boolean
  cases: FreeRoofCase[]
  /** γ = 90°: zona dari tepi windward sepanjang B. */
  zones: FreeRoofZone[]
  /** Gaya vertikal (+ ke bawah) γ = 90° kasus A & B (kN). */
  Fv90: [number, number]
}

export function computeFreeRoof(inp: FreeRoofInput): FreeRoofResult {
  const { theta, h, L, B, G, shape, flow } = inp
  const qh = qzOf(inp, h)
  const tan = Math.tan((theta * Math.PI) / 180)
  const rise = shape === 'mono' ? L * tan : (L / 2) * tan
  const usesMonoZero = shape === 'pitched' && theta < 7.5
  const r: FreeRoofResult = { valid: false, warn: [], inp, Kh: KzAt(h, inp.expo), qh, hL: h / L, rise, usesMonoZero, cases: [], zones: [], Fv90: [0, 0] }
  if (!(h > 0 && L > 0 && B > 0 && theta >= 0 && theta <= 45)) {
    r.warn.push('Lengkapi h, L, B (> 0) dan sudut atap 0–45°.')
    return r
  }
  const half = (L / 2) * B
  // Gaya normal tiap paruh p·A_miring: komponen vertikal p·(L/2)·B, horizontal p·(L/2)·tanθ·B.
  // Monoslope: dir = −1 bila angin datang dari tepi tinggi (normal sisi atas condong ke hilir), +1 dari tepi rendah.
  // Pelana: paruh windward +p, paruh leeward −p.
  const mk = (cn: [number, number], dir: number): FreeRoofLoad => {
    const pW = qh * G * cn[0], pL = qh * G * cn[1]
    const Fh = shape === 'mono' ? dir * (pW + pL) * half * tan : (pW - pL) * half * tan
    return { CNW: cn[0], CNL: cn[1], pW, pL, Fv: (pW + pL) * half, Fh }
  }
  if (shape === 'mono') {
    const c0 = cnFreeRoof(MONO_0, theta, flow), c180 = cnFreeRoof(MONO_180, theta, flow)
    r.cases = [
      { key: 'g0', label: 'γ = 0° (angin dari tepi tinggi)', A: mk(c0.A, -1), B: mk(c0.B, -1) },
      { key: 'g180', label: 'γ = 180° (angin dari tepi rendah)', A: mk(c180.A, 1), B: mk(c180.B, 1) },
    ]
  } else {
    const c = cnFreeRoof(usesMonoZero ? MONO_0 : PITCHED, theta, flow)
    r.cases = [{ key: 'g0', label: 'γ = 0°/180° (tegak lurus bubungan)', A: mk(c.A, 1), B: mk(c.B, 1) }]
  }
  const o = flow === 'clear' ? 0 : 1
  const xb = [0, h, 2 * h, Infinity]
  for (let i = 0; i < 3; i++) {
    const x0 = xb[i], x1 = Math.min(xb[i + 1], B)
    if (x1 <= x0 + 1e-9) continue
    const CNA = FR_90[i][o], CNB = FR_90[i][2 + o]
    r.zones.push({ x0, x1, CNA, CNB, pA: qh * G * CNA, pB: qh * G * CNB })
  }
  r.Fv90 = [r.zones.reduce((a, z) => a + z.pA * (z.x1 - z.x0) * L, 0), r.zones.reduce((a, z) => a + z.pB * (z.x1 - z.x0) * L, 0)]
  r.valid = true

  if (r.hL < 0.25 || r.hL > 1.0) r.warn.push(`h/L = ${r.hL.toFixed(2)} di luar batas berlaku Gbr. 27.3-4 s.d. 27.3-7 (0,25 ≤ h/L ≤ 1,0) — koefisien hanya pendekatan.`)
  if (usesMonoZero) r.warn.push('Atap pelana θ < 7,5°: dipakai koefisien atap monoslope θ = 0° (catatan Gbr. 27.3-5).')
  if (shape === 'mono' && theta < 7.5) r.warn.push('θ < 7,5°: dipakai koefisien θ = 0° (catatan Gbr. 27.3-4).')
  if (inp.V < 20 || inp.V > 60) r.warn.push('V = ' + inp.V + ' m/s di luar rentang lazim peta angin Indonesia (± 25–45 m/s) — pastikan satuan m/s (bukan km/jam).')
  r.warn.push('CN = tekanan neto (sisi atas + bawah) pada paruh windward/leeward atap; semua kasus A/B dan arah angin wajib ditinjau. Penutup atap & gording: K&K Ps. 30.7; beban minimum Ps. 27.1.5 ditinjau terpisah.')
  return r
}

// ── Rangka terbuka (Ps. 29.4) ─────────────────────────────────────────────────────────────────────────────
export type FrameKind = 'plane' | 'tower'
export type MemberShape = 'flat' | 'round'
export type TowerShape = 'square' | 'triangle'

export interface OpenFrameInput extends WindBase {
  kind: FrameKind
  member: MemberShape
  tower: TowerShape
  /** Rasio padat ε, lebar bidang/muka b, elevasi bawah & atas (m), diameter batang bulat D (m). */
  eps: number
  b: number
  z1: number
  z2: number
  D: number
}

export interface OpenFrameResult {
  valid: boolean
  warn: string[]
  inp: OpenFrameInput
  /** Elevasi titik berat Af, Kz & qz di sana (kPa). */
  zc: number
  Kzc: number
  qzc: number
  /** D·√qz (m·√(N/m²)) batang bulat — batas 5,3 (Gbr. 29.4-2). */
  DsqrtQ?: number
  /** Cf tegak lurus muka; menara: Cf rumus, faktor batang bulat, faktor & Cf diagonal (bujur sangkar). */
  Cf: number
  CfBase?: number
  roundFactor?: number
  diagFactor?: number
  CfDiag?: number
  /** Baris tabel Cf bidang terbuka. */
  epsRow?: string
  /** Luas padat (m²). */
  Af: number
  /** Gaya (kN) & momen guling dasar (kN·m): 20 segmen (F, M), cara titik berat (Fc, Mc = Fc·z̄), dipakai = maks (Fn, Mn). */
  F: number
  M: number
  Fc: number
  Mc: number
  Fn: number
  Mn: number
  Fdiag?: number
  Mdiag?: number
  Fmin: number
  Fdesign: number
  minGoverns: boolean
  /** Beban garis w(z) = qz·G·Cf·ε·b (kN/m) di tengah tiap segmen. */
  seg: { z: number; qz: number; w: number }[]
}

/** Cf bidang terbuka (Gbr. 29.4-2) — kolom: datar / bulat D√qz ≤ 5,3 / bulat > 5,3. */
export function cfOpenPlane(eps: number, member: MemberShape, DsqrtQ: number): { Cf: number; row: string } {
  const row = eps < 0.1 ? 0 : eps < 0.3 ? 1 : 2
  const T = [[2.0, 1.2, 0.8], [1.8, 1.3, 0.9], [1.6, 1.5, 1.1]]
  const col = member === 'flat' ? 0 : DsqrtQ <= 5.3 ? 1 : 2
  return { Cf: T[row][col], row: ['ε < 0,1', '0,1 ≤ ε < 0,3', '0,3 ≤ ε ≤ 0,7'][row] }
}

export function computeOpenFrame(inp: OpenFrameInput): OpenFrameResult {
  const { eps, b, z1, z2, G, kind, member } = inp
  const zc = (z1 + z2) / 2
  const qzc = qzOf(inp, zc)
  const r: OpenFrameResult = { valid: false, warn: [], inp, zc, Kzc: KzAt(zc, inp.expo), qzc, Cf: 0, Af: 0, F: 0, M: 0, Fc: 0, Mc: 0, Fn: 0, Mn: 0, Fmin: 0, Fdesign: 0, minGoverns: false, seg: [] }
  if (!(b > 0 && z2 > z1 && z1 >= 0 && eps > 0 && eps <= 1)) {
    r.warn.push('Lengkapi lebar b > 0, elevasi atas > bawah ≥ 0, dan 0 < ε ≤ 1.')
    return r
  }
  if (member === 'round') r.DsqrtQ = inp.D * Math.sqrt(qzc * 1000)
  if (kind === 'plane') {
    if (eps > 0.7) {
      r.warn.push('ε > 0,7 — bukan rangka/papan terbuka (bukaan < 30%): pakai dinding pejal / papan reklame pejal Ps. 29.3.')
      return r
    }
    const c = cfOpenPlane(eps, member, r.DsqrtQ ?? 0)
    r.Cf = c.Cf
    r.epsRow = c.row
  } else {
    r.CfBase = inp.tower === 'square' ? 4.0 * eps * eps - 5.9 * eps + 4.0 : 3.4 * eps * eps - 4.7 * eps + 3.4
    r.roundFactor = member === 'round' ? Math.min(1.0, 0.51 * eps * eps + 0.57) : 1
    r.Cf = r.CfBase * r.roundFactor
    if (inp.tower === 'square') {
      r.diagFactor = Math.min(1.2, 1 + 0.75 * eps)
      r.CfDiag = r.Cf * r.diagFactor
    }
  }
  const nS = 20, dz = (z2 - z1) / nS
  r.Af = eps * b * (z2 - z1)
  for (let i = 0; i < nS; i++) {
    const z = z1 + (i + 0.5) * dz, qz = qzOf(inp, z), w = qz * G * r.Cf * eps * b
    r.seg.push({ z, qz, w })
    r.F += w * dz
    r.M += w * dz * z
  }
  // Pers. 29.4-1 memakai qz di titik berat Af; pembagian segmen menangkap distribusi tinggi — dipakai yang lebih besar.
  r.Fc = qzc * G * r.Cf * r.Af
  r.Mc = r.Fc * zc
  r.Fn = Math.max(r.F, r.Fc)
  r.Mn = Math.max(r.M, r.Mc)
  if (r.diagFactor) {
    r.Fdiag = r.Fn * r.diagFactor
    r.Mdiag = r.Mn * r.diagFactor
  }
  r.Fmin = 0.77 * r.Af
  const Fmax = r.Fdiag ?? r.Fn
  r.minGoverns = r.Fmin > Fmax
  r.Fdesign = Math.max(Fmax, r.Fmin)
  r.valid = true

  if (r.minGoverns) r.warn.push(`Beban minimum Ps. 29.7 (0,77 kN/m² × Af) MENENTUKAN: ${r.Fmin.toFixed(1)} kN > ${Fmax.toFixed(1)} kN.`)
  if (inp.V < 20 || inp.V > 60) r.warn.push('V = ' + inp.V + ' m/s di luar rentang lazim peta angin Indonesia (± 25–45 m/s) — pastikan satuan m/s (bukan km/jam).')
  r.warn.push(
    kind === 'plane'
      ? 'Bidang rangka tunggal: tanpa efek perisai antarbidang. Rangka berlapis (pipe rack, rangka ruang) perlu acuan tambahan (mis. ASCE Wind Loads for Petrochemical and Other Industrial Facilities).'
      : 'Af = luas padat SATU muka menara (proyeksi pada bidang muka); tangga, antena & aksesori dihitung terpisah (Ps. 29.4).',
  )
  return r
}
