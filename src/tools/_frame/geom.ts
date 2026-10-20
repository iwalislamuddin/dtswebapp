import { hermiteV, type FrameMember } from '../../calc/shared/frame2d'

// Geometri gambar rangka bidang bersama (Analisis Portal & Portal Gable) — satu sumber untuk SVG di UI dan gambar
// laporan. Semua koordinat model dalam meter (y ke atas); pemanggil memetakan ke px/pt dengan skala seragam.
// Diagram digambar tegak lurus batang: momen di sisi serat tarik, geser & aksial ke arah normal lokal (+y lokal).

export type P2 = [number, number]
export type ForceKey = 'M' | 'V' | 'N'

export interface FrameLoads {
  /** Beban merata gravitasi pada batang a→b (panah vertikal ke batang). */
  dist: { a: P2; b: P2; label: string }[]
  /** Beban terpusat vertikal (kN, + ke bawah). */
  points: { at: P2; P: number; label: string }[]
  /** Beban lateral di simpul (kN, + ke kanan). */
  lateral: { at: P2; H: number; label: string }[]
}

export interface DeflLabel {
  node?: number
  elem?: number
  t?: number
  text: string
  side: 'l' | 'r' | 'b'
}

/** Posisi terdeformasi label (m). */
export const deflPoint = (v: FrameView, l: DeflLabel, mag: number): P2 =>
  l.node !== undefined ? deformedNode(v, l.node, mag) : deformedAt(v, v.elems[l.elem as number], l.t as number, mag)

export interface FrameView {
  /** Simpul (m). */
  nodes: P2[]
  /** Batang yang sudah dianalisis (xs, Ms, Vs, Ns, dloc terisi). */
  elems: FrameMember[]
  names: string[]
  /** Perpindahan global (mm, rad). */
  D: number[]
  fixed: boolean
  /** Simpul tumpuan (kaki kolom). */
  supports: number[]
  /** Reaksi per simpul tumpuan (kN, kN·m). */
  reactions: { Rx: number; Ry: number; M: number }[]
  loads: FrameLoads
  /** Titik deformasi yang diberi label: simpul, atau batang `elem` di t ∈ [0, 1]. */
  deflLabels: DeflLabel[]
}

const KEY = { M: 'Ms', V: 'Vs', N: 'Ns' } as const
const CONV = { M: 1e6, V: 1e3, N: 1e3 }
export const FORCE_UNIT = { M: 'kN·m', V: 'kN', N: 'kN' }
export const FORCE_NAME = { M: 'Momen', V: 'Geser', N: 'Aksial' }

/** Nilai gaya dalam batang (kN / kN·m) di titik sampel. */
export const forceValues = (e: FrameMember, k: ForceKey): number[] => (e[KEY[k]] as number[]).map((v) => v / CONV[k])

export function frameBox(v: FrameView): { x0: number; x1: number; y0: number; y1: number } {
  const xs = v.nodes.map((n) => n[0]), ys = v.nodes.map((n) => n[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

function axes(v: FrameView, e: FrameMember) {
  const A = v.nodes[e.ni], B = v.nodes[e.nj]
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy)
  return { A, dx, dy, ux: dx / L, uy: dy / L, nx: -dy / L, ny: dx / L }
}

export interface MemberCurve {
  /** Titik sumbu batang & titik kurva (m). */
  base: P2[]
  curve: P2[]
  values: number[]
  /** Indeks nilai ekstrem (|maks|). */
  ext: number
}

/** Kurva gaya dalam tiap batang; ordinat terbesar global = `amp` (m). */
export function forceCurves(v: FrameView, k: ForceKey, amp: number): MemberCurve[] {
  const gmax = Math.max(1e-9, ...v.elems.flatMap((e) => forceValues(e, k).map(Math.abs)))
  const sg = k === 'M' ? -1 : 1 // momen sagging (+) di sisi −y lokal = serat tarik
  return v.elems.map((e) => {
    const { A, dx, dy, nx, ny } = axes(v, e)
    const vals = forceValues(e, k)
    const base: P2[] = [], curve: P2[] = []
    let ext = 0
    ;(e.xs as number[]).forEach((x, i) => {
      const t = x / (e.L as number)
      const b: P2 = [A[0] + dx * t, A[1] + dy * t]
      const off = (sg * vals[i] * amp) / gmax
      base.push(b)
      curve.push([b[0] + off * nx, b[1] + off * ny])
      if (Math.abs(vals[i]) > Math.abs(vals[ext])) ext = i
    })
    return { base, curve, values: vals, ext }
  })
}

/** Faktor perbesaran deformasi: perpindahan translasi terbesar (termasuk di dalam batang, mis. lendutan tengah
 *  balok yang tak bersimpul) → `frac` × dimensi rangka terkecil. */
export function deformMag(v: FrameView, frac = 0.06, n = 24): number {
  const b = frameBox(v)
  let dmax = 0
  v.D.forEach((d, i) => {
    if (i % 3 !== 2) dmax = Math.max(dmax, Math.abs(d))
  })
  for (const e of v.elems) {
    const d = e.dloc as number[]
    for (let s = 0; s <= n; s++) {
      const t = s / n
      dmax = Math.max(dmax, Math.hypot(d[0] * (1 - t) + d[3] * t, hermiteV(d, e.L as number, t)))
    }
  }
  const dim = Math.min(b.x1 - b.x0 || Infinity, b.y1 - b.y0 || Infinity) * 1000 // mm
  return dmax > 1e-9 ? (frac * dim) / dmax : 0
}

/** Bentuk terdeformasi tiap batang (m), Hermite kubik untuk lintang + aksial linier. */
export function deformedShape(v: FrameView, mag: number, n = 24): P2[][] {
  return v.elems.map((e) => {
    const { A, dx, dy, ux, uy, nx, ny } = axes(v, e)
    const d = e.dloc as number[]
    const pts: P2[] = []
    for (let s = 0; s <= n; s++) {
      const t = s / n
      const u = d[0] * (1 - t) + d[3] * t
      const w = hermiteV(d, e.L as number, t)
      pts.push([A[0] + dx * t + (mag * (u * ux + w * nx)) / 1000, A[1] + dy * t + (mag * (u * uy + w * ny)) / 1000])
    }
    return pts
  })
}

/** Posisi terdeformasi titik di batang e pada t ∈ [0, 1] (m). */
export function deformedAt(v: FrameView, e: FrameMember, t: number, mag: number): P2 {
  const { A, dx, dy, ux, uy, nx, ny } = axes(v, e)
  const d = e.dloc as number[]
  const u = d[0] * (1 - t) + d[3] * t
  const w = hermiteV(d, e.L as number, t)
  return [A[0] + dx * t + (mag * (u * ux + w * nx)) / 1000, A[1] + dy * t + (mag * (u * uy + w * ny)) / 1000]
}

/** Posisi terdeformasi simpul (m). */
export const deformedNode = (v: FrameView, i: number, mag: number): P2 => [
  v.nodes[i][0] + (mag * v.D[i * 3]) / 1000,
  v.nodes[i][1] + (mag * v.D[i * 3 + 1]) / 1000,
]

/** Satu titik sampel (untuk bidik hover): posisi sepanjang batang (m) & gaya dalamnya. */
export function sampleAt(e: FrameMember, i: number) {
  return {
    x: (e.xs as number[])[i] / 1000,
    M: (e.Ms as number[])[i] / 1e6,
    V: (e.Vs as number[])[i] / 1e3,
    N: (e.Ns as number[])[i] / 1e3,
  }
}

/** Pemetaan seragam model (m) → kanvas (y ke bawah) yang memuat rangka di kotak dengan margin. */
export function fitFrame(
  v: FrameView,
  box: { w: number; h: number; padL: number; padR: number; padT: number; padB: number; x?: number; y?: number },
) {
  const b = frameBox(v)
  const bw = Math.max(1e-6, b.x1 - b.x0), bh = Math.max(1e-6, b.y1 - b.y0)
  const aw = box.w - box.padL - box.padR, ah = box.h - box.padT - box.padB
  const sc = Math.max(1e-6, Math.min(aw / bw, ah / bh))
  const ox = (box.x ?? 0) + box.padL + (aw - bw * sc) / 2
  const oy = (box.y ?? 0) + box.padT + (ah - bh * sc) / 2 + bh * sc
  const T = (p: P2): P2 => [ox + (p[0] - b.x0) * sc, oy - (p[1] - b.y0) * sc]
  return { T, sc, b }
}
