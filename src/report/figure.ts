import type { FigColor, FigOp, Figure } from './model'

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

/** Gambar batang kapasitas rencana tiap keadaan batas + garis beban (laporan cek kapasitas). */
export function capacityFigure(
  rows: { label: string; cap: number; c: FigColor }[],
  dem: number,
  opt: { unit: string; demLabel: string; caption: string; alt: string },
): Figure {
  const ops: FigOp[] = []
  const bx0 = 200, bw = 250, rh = 20
  const maxV = Math.max(1e-9, dem, ...rows.map((b) => (Number.isFinite(b.cap) ? b.cap : 0))) * 1.08
  const xd = bx0 + (dem / maxV) * bw
  rows.forEach((b, i) => {
    const y = 12 + i * rh
    const len = Math.max(1.5, (Math.min(b.cap, maxV) / maxV) * bw)
    ops.push({ t: 'text', x: bx0 - 8, y: y + 9, s: b.label, size: 7, align: 'r', c: 'ink' })
    ops.push({ t: 'rect', x: bx0, y, w: len, h: 12, fill: true, c: b.c, op: 0.35 })
    ops.push({ t: 'rect', x: bx0, y, w: len, h: 12, lw: 0.6, c: b.c })
    // angka di kanan batang — atau di kanan garis beban bila beban melampaui kapasitas
    ops.push({ t: 'text', x: Math.max(bx0 + len, dem > b.cap ? xd : 0) + 4, y: y + 9, s: `${b.cap.toFixed(1)} ${opt.unit}`, size: 7, c: 'ink' })
  })
  const yb = 12 + rows.length * rh
  const minCap = Math.min(...rows.map((b) => b.cap))
  if (dem > 0) ops.push({ t: 'line', x1: xd, y1: 6, x2: xd, y2: yb, lw: 1.4, c: dem > minCap ? 'bad' : 'load' })
  ops.push({ t: 'line', x1: bx0, y1: 6, x2: bx0, y2: yb, lw: 0.6, c: 'muted' })
  if (dem > 0) {
    ops.push({ t: 'line', x1: bx0, y1: yb + 10, x2: bx0 + 14, y2: yb + 10, lw: 1.4, c: 'load' })
    ops.push({ t: 'text', x: bx0 + 18, y: yb + 12.5, s: opt.demLabel, size: 6.5, c: 'muted' })
  }
  return { h: figRows(yb + (dem > 0 ? 18 : 6)), ops, alt: opt.alt, caption: opt.caption }
}
