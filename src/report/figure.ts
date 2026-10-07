import type { FigColor, FigOp } from './model'

// Pembantu gambar laporan (port core/report.js: CivilReport.fig). Semua menambah primitif ke `ops`.

/** Lebar area gambar (pt) = lebar halaman 612 − 2 × margin 42. */
export const FIG_W = 528
/** Tinggi satu baris laporan (pt). */
export const LEAD = 11.5

/** Tinggi gambar dalam baris laporan dari koordinat y terbawah (pt). */
export const figRows = (bottom: number): number => Math.ceil(bottom / LEAD)

/** Langkah sumbu "bagus" (1/2/5 × 10^k) untuk ±n bagian. */
export function niceStep(range: number, n: number): number {
  const raw = Math.abs(range) / Math.max(1, n)
  if (raw <= 0 || !Number.isFinite(raw)) return 1
  const p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p
}

/** Dimensi horizontal: garis + tick 45° + label di tengah atas. */
export function dimH(ops: FigOp[], xa: number, xb: number, y: number, label: string) {
  ops.push({ t: 'line', x1: xa, y1: y, x2: xb, y2: y, lw: 0.6 })
  for (const x of [xa, xb]) {
    ops.push({ t: 'line', x1: x, y1: y - 4, x2: x, y2: y + 4, lw: 0.6 })
    ops.push({ t: 'line', x1: x - 2.5, y1: y + 2.5, x2: x + 2.5, y2: y - 2.5, lw: 0.6 })
  }
  ops.push({ t: 'text', x: (xa + xb) / 2, y: y - 3, s: label, size: 7, align: 'c' })
}

/** Dimensi vertikal: garis + tick 45° + label di kanan. */
export function dimV(ops: FigOp[], ya: number, yb: number, x: number, label: string) {
  ops.push({ t: 'line', x1: x, y1: ya, x2: x, y2: yb, lw: 0.6 })
  for (const y of [ya, yb]) {
    ops.push({ t: 'line', x1: x - 4, y1: y, x2: x + 4, y2: y, lw: 0.6 })
    ops.push({ t: 'line', x1: x - 2.5, y1: y + 2.5, x2: x + 2.5, y2: y - 2.5, lw: 0.6 })
  }
  if (label) ops.push({ t: 'text', x: x + 6, y: (ya + yb) / 2 + 2.5, s: label, size: 7 })
}

/** Panah dari (x1,y1) ke (x2,y2), kepala di ujung. `c` = warna semantik (FigColor). */
export function arrow(ops: FigOp[], x1: number, y1: number, x2: number, y2: number, opt: { lw?: number; g?: number; c?: FigColor; head?: number } = {}) {
  const lw = opt.lw ?? 0.9, g = opt.g ?? 0, c = opt.c
  ops.push({ t: 'line', x1, y1, x2, y2, lw, g, c })
  const ang = Math.atan2(y2 - y1, x2 - x1), L = opt.head ?? 4.5
  if (c) {
    // kepala terisi untuk gambar berwarna
    const p = (a: number): [number, number] => [x2 + L * Math.cos(a), y2 + L * Math.sin(a)]
    ops.push({ t: 'poly', pts: [[x2, y2], p(ang + 2.7), p(ang - 2.7)], fill: true, c })
    return
  }
  for (const a of [ang + 2.65, ang - 2.65])
    ops.push({ t: 'line', x1: x2, y1: y2, x2: x2 + L * Math.cos(a), y2: y2 + L * Math.sin(a), lw, g })
}

/** Penanda silang (titik kebutuhan) + label opsional. */
export function cross(ops: FigOp[], x: number, y: number, label?: string, g = 0) {
  ops.push({ t: 'line', x1: x - 3.5, y1: y - 3.5, x2: x + 3.5, y2: y + 3.5, lw: 1.2, g })
  ops.push({ t: 'line', x1: x - 3.5, y1: y + 3.5, x2: x + 3.5, y2: y - 3.5, lw: 1.2, g })
  if (label) ops.push({ t: 'text', x: x + 6, y: y - 3, s: label, size: 6, g })
}
