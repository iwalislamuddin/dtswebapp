import { spectrumSa } from '../../calc/seismic-load'
import { arrow, figRows } from '../../report/figure'
import { fx, type FigOp, type Figure } from '../../report/model'
import { chartFigure } from '../_hydraulics/figure'
import type { SeismicOk } from './model'

// Gambar Beban Gempa — satu sumber titik untuk layar (index.tsx) dan laporan (tab Detail & PDF).

/** Batas sumbu periode grafik spektrum (s). */
export const spectrumTmax = (r: SeismicOk) => Math.max(4, Math.ceil(r.T * 1.5))

/** Titik spektrum desain Sa(T) dan MCER (1,5·Sa) di grid T yang sama, termasuk sudut T0 & Ts. */
export function spectrumPoints(r: SeismicOk, n = 240) {
  const Tmax = spectrumTmax(r)
  const Ts = new Set<number>([0, r.T0, r.Ts, r.T])
  for (let k = 0; k <= n; k++) Ts.add((Tmax * k) / n)
  if (r.inp.TL < Tmax) Ts.add(r.inp.TL)
  const T = [...Ts].filter((t) => t >= 0 && t <= Tmax).sort((a, b) => a - b)
  const sa = T.map((t): [number, number] => [t, spectrumSa(t, r.SDS, r.SD1, r.inp.TL)])
  return { sa, mce: sa.map(([t, v]): [number, number] => [t, 1.5 * v]) }
}

export function figSpectrum(r: SeismicOk, n: number): Figure {
  const p = spectrumPoints(r, 160)
  return chartFigure({
    series: [
      { pts: p.sa, c: 'm', label: 'Spektrum desain S_{a}' },
      { pts: p.mce, c: 'muted', label: 'MCE_{R} = 1,5 S_{a}', dash: [3, 2] },
    ],
    marks: [{ x: r.T, y: spectrumSa(r.T, r.SDS, r.SD1, r.inp.TL), c: 'load', label: `T = ${fx(r.T, 3)} s` }],
    xLabel: 'Periode T (s)',
    yLabel: 'S_{a} (g)',
    caption: `Gbr. ${n} — Spektrum respons desain (S_{DS} = ${fx(r.SDS, 3)} g, S_{D1} = ${fx(r.SD1, 3)} g, T_{0} = ${fx(r.T0, 3)} s, T_{s} = ${fx(r.Ts, 3)} s, T_{L} = ${fx(r.inp.TL, 0)} s).`,
    alt: 'Grafik spektrum respons desain terhadap periode',
  })
}

/** Gaya lateral lantai Fx (panah) dan geser tingkat Vx (diagram tangga) terhadap elevasi. */
export function figStory(r: SeismicOk, n: number): Figure {
  const ops: FigOp[] = []
  const yTop = 26, yG = 196, hT = yG - yTop
  const Y = (z: number) => yG - (z / r.hn) * hT
  const bx = 190, bw = 46
  const Fmax = Math.max(...r.levels.map((l) => l.Fx), 1e-9)
  const fs = 110 / Fmax
  const vx0 = 300, vs = 160 / Math.max(r.V, 1e-9)
  // tanah
  ops.push({ t: 'line', x1: 40, y1: yG, x2: 490, y2: yG, lw: 1, c: 'muted' })
  for (let i = 0; i < 20; i++) ops.push({ t: 'line', x1: 40 + i * 23, y1: yG, x2: 34 + i * 23, y2: yG + 6, lw: 0.4, c: 'muted' })
  // struktur
  ops.push({ t: 'rect', x: bx, y: yTop, w: bw, h: hT, fill: true, c: 'support', op: 0.1 })
  ops.push({ t: 'line', x1: bx, y1: yG, x2: bx, y2: yTop, lw: 1.1, c: 'support' })
  ops.push({ t: 'line', x1: bx + bw, y1: yG, x2: bx + bw, y2: yTop, lw: 1.1, c: 'support' })
  const showAll = r.levels.length <= 12
  for (const l of r.levels) {
    const y = Y(l.hx)
    ops.push({ t: 'line', x1: bx, y1: y, x2: bx + bw, y2: y, lw: 1.1, c: 'support' })
    const len = Math.max(l.Fx * fs, 2)
    arrow(ops, bx - 4 - len, y, bx - 3, y, { lw: 1, c: 'load', head: 3.5 })
    if (showAll || l.i === r.levels.length) ops.push({ t: 'text', x: bx - 8 - len, y: y + 2.5, s: `F_{${l.i}} = ${fx(l.Fx, 1)}`, size: 6.5, align: 'r', c: 'load' })
  }
  // diagram geser tingkat
  ops.push({ t: 'line', x1: vx0, y1: yG, x2: vx0, y2: yTop, lw: 0.6, c: 'muted' })
  const pts: [number, number][] = [[vx0, Y(r.hn)]]
  for (let i = r.levels.length - 1; i >= 0; i--) {
    const l = r.levels[i], below = i === 0 ? 0 : r.levels[i - 1].hx
    pts.push([vx0 + l.Vx * vs, Y(l.hx)], [vx0 + l.Vx * vs, Y(below)])
  }
  pts.push([vx0, yG])
  ops.push({ t: 'poly', pts, close: true, fill: true, c: 'v', op: 0.15 })
  ops.push({ t: 'poly', pts: pts.slice(1, -1), lw: 1, c: 'v' })
  for (const l of r.levels) {
    if (!showAll && l.i !== 1) continue
    const below = l.i === 1 ? 0 : r.levels[l.i - 2].hx
    ops.push({ t: 'text', x: vx0 + l.Vx * vs + 4, y: (Y(l.hx) + Y(below)) / 2 + 2.5, s: `V_{${l.i}} = ${fx(l.Vx, 1)}`, size: 6.5, c: 'v' })
  }
  ops.push({ t: 'text', x: bx + bw / 2, y: yTop - 8, s: `h_{n} = ${fx(r.hn, 2)} m`, size: 7, align: 'c' })
  ops.push({ t: 'text', x: vx0, y: yTop - 8, s: 'Geser tingkat V_{x} (kN)', size: 7, c: 'v' })
  ops.push({ t: 'text', x: bx - 8, y: yTop - 8, s: 'Gaya lantai F_{x} (kN)', size: 7, align: 'r', c: 'load' })
  return {
    h: figRows(yG + 14),
    ops,
    alt: 'Distribusi gaya gempa lateral per lantai dan geser tingkat',
    caption: `Gbr. ${n} — Distribusi vertikal gaya gempa (k = ${fx(r.k, 3)}) dan geser tingkat; V = ${fx(r.V, 1)} kN.`,
  }
}
