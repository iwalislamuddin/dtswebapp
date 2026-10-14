import { figRows } from '../../report/figure'
import { fx, type FigColor, type FigOp, type Figure } from '../../report/model'
import { axis, range } from './chart'

// Grafik XY untuk laporan (tab Detail & PDF) — padanan XYChart di layar, dari primitif FigOp.

export interface FigSeries {
  pts: [number, number][]
  c: FigColor
  label: string
  dash?: number[]
}

export interface FigMark {
  x: number
  y: number
  c: FigColor
  label: string
}

export function chartFigure(o: {
  series: FigSeries[]
  marks?: FigMark[]
  xLabel: string
  yLabel: string
  logX?: boolean
  logY?: boolean
  caption: string
  alt: string
}): Figure {
  const ops: FigOp[] = []
  const L = 80, R = 470, T = 22, B = 172
  const marks = o.marks ?? []
  const xs = o.series.flatMap((s) => s.pts.map((q) => q[0])).concat(marks.map((m) => m.x))
  const ys = o.series.flatMap((s) => s.pts.map((q) => q[1])).concat(marks.map((m) => m.y))
  const [x0, x1] = range(xs, !!o.logX)
  const [y0, y1] = range(ys, !!o.logY)
  const ax = axis(o.logX ? x0 : Math.min(...xs.filter(Number.isFinite)), x1, L, R, !!o.logX)
  const ay = axis(y0, y1, B, T, !!o.logY)
  for (const t of ax.ticks) {
    ops.push({ t: 'line', x1: ax.map(t), y1: T, x2: ax.map(t), y2: B, lw: 0.3, c: 'grid' })
    ops.push({ t: 'text', x: ax.map(t), y: B + 10, s: ax.label(t), size: 6.5, align: 'c', c: 'muted' })
  }
  for (const t of ay.ticks) {
    ops.push({ t: 'line', x1: L, y1: ay.map(t), x2: R, y2: ay.map(t), lw: 0.3, c: 'grid' })
    ops.push({ t: 'text', x: L - 5, y: ay.map(t) + 2.5, s: ay.label(t), size: 6.5, align: 'r', c: 'muted' })
  }
  ops.push({ t: 'rect', x: L, y: T, w: R - L, h: B - T, lw: 0.6, c: 'muted' })
  for (const s of o.series) {
    const pts = s.pts.filter((q) => Number.isFinite(q[1]) && (!o.logY || q[1] > 0)).map((q): [number, number] => [ax.map(q[0]), ay.map(q[1])])
    ops.push({ t: 'poly', pts, lw: 1.1, c: s.c, dash: s.dash })
  }
  for (const m of marks) {
    const x = ax.map(m.x), y = ay.map(m.y), right = x > 340
    ops.push({ t: 'line', x1: x, y1: y, x2: x, y2: B, lw: 0.5, c: m.c, dash: [2, 2] })
    ops.push({ t: 'circle', cx: x, cy: y, r: 2.4, fill: true, c: m.c })
    ops.push({ t: 'text', x: x + (right ? -5 : 5), y: y - 5, s: m.label, size: 6.5, align: right ? 'r' : 'l', c: m.c })
  }
  ops.push({ t: 'text', x: R, y: B + 22, s: o.xLabel, size: 7, align: 'r', c: 'ink' })
  ops.push({ t: 'text', x: L, y: T - 8, s: o.yLabel, size: 7, c: 'ink' })
  if (o.series.length > 1) {
    let lx = L + 120
    for (const s of o.series) {
      ops.push({ t: 'line', x1: lx, y1: T - 10.5, x2: lx + 14, y2: T - 10.5, lw: 1.1, c: s.c, dash: s.dash })
      ops.push({ t: 'text', x: lx + 18, y: T - 8, s: s.label, size: 6.5, c: 'ink' })
      lx += s.label.length * 3.4 + 34
    }
  }
  return { h: figRows(B + 28), ops, alt: o.alt, caption: o.caption }
}

/** Teks angka laporan dengan desimal menyesuaikan besaran (debit kecil tetap terbaca). */
export const fq = (v: number, sig = 3): string => fx(v, Math.max(0, Math.min(6, sig - 1 - Math.floor(Math.log10(Math.abs(v) || 1)))))
