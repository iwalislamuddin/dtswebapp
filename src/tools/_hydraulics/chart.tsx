import { useState, type MouseEvent } from 'react'
import { fx } from '../../report/model'
import { niceStep } from '../../report/figure'

// Grafik XY bersama tool Hidraulika (kurva intensitas, kurva debit, energi spesifik, kurva sistem, Moody).
// Semua seri berbagi grid x yang sama (indeks titik sama) — bidik hover membaca nilai tiap seri di indeks itu.

export interface XYSeries {
  pts: [number, number][]
  color: string
  label: string
  dash?: string
}

export interface XYMark {
  x: number
  y: number
  color: string
  label: string
}

/** Pangkat dengan angka superskrip Unicode (tampil sama di SVG layar dan PDF). */
const sup = (n: number): string => String(n).replace(/[-0-9]/g, (c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]))

/** Notasi ilmiah Unicode, mis. 1.5×10⁻⁵. */
export function expo(v: number, dp = 1): string {
  if (!Number.isFinite(v) || v === 0) return fx(v, dp)
  const e = Math.floor(Math.log10(Math.abs(v)))
  return `${fx(v / 10 ** e, dp)}×10${sup(e)}`
}

/** Sumbu: ticks (linear "bagus" atau dekade log) + pemetaan nilai → piksel. */
export function axis(lo: number, hi: number, p0: number, p1: number, log: boolean) {
  if (log) {
    const a = Math.log10(lo), b = Math.log10(hi)
    const map = (v: number) => p0 + ((Math.log10(Math.max(v, lo)) - a) / (b - a || 1)) * (p1 - p0)
    const ticks: number[] = []
    for (let k = Math.ceil(a - 1e-9); k <= b + 1e-9; k++) ticks.push(Math.pow(10, k))
    return { map, ticks, label: (v: number) => (v >= 1e4 || v < 1e-2 ? `10${sup(Math.round(Math.log10(v)))}` : fx(v, v < 1 ? 2 : 0)) }
  }
  const map = (v: number) => p0 + ((v - lo) / (hi - lo || 1)) * (p1 - p0)
  const st = niceStep(hi - lo, 4)
  const ticks: number[] = []
  for (let i = Math.ceil(lo / st - 1e-9); i * st <= hi + 1e-9; i++) ticks.push(i * st + 0)
  const dp = st < 0.01 ? 3 : st < 0.1 ? 2 : st < 1 ? 1 : 0
  return { map, ticks, label: (v: number) => fx(v, dp) }
}

/** Batas sumbu dari data: linear mulai 0 (bila semua ≥ 0) + ruang 5%; log = dekade penuh. */
export function range(vals: number[], log: boolean, from0 = true): [number, number] {
  const v = vals.filter((a) => Number.isFinite(a) && (!log || a > 0))
  if (!v.length) return [log ? 1 : 0, log ? 10 : 1]
  const lo = Math.min(...v), hi = Math.max(...v)
  if (log) return [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi) + 1e-9))]
  const a = from0 ? Math.min(0, lo) : lo, b = hi
  const pad = 0.06 * (b - a || Math.abs(b) || 1)
  return [from0 && a === 0 ? 0 : a - pad, b + pad]
}

export function XYChart(p: {
  w: number
  h: number
  series: XYSeries[]
  marks?: XYMark[]
  xLabel: string
  yLabel: string
  title: string
  logX?: boolean
  logY?: boolean
  /** Desimal bacaan hover. */
  xDp?: number
  yDp?: number
  /** Bidik menurut sumbu tegak (kurva dengan y sebagai variabel bebas, mis. kedalaman). */
  hoverBy?: 'x' | 'y'
}) {
  const [hp, setHp] = useState<number | null>(null)
  const byY = p.hoverBy === 'y'
  const { w, h, series, marks = [] } = p
  if (w < 220 || h < 110) return null
  const padL = 54, padR = 22, padT = 26, padB = 30
  const xs = series.flatMap((s) => s.pts.map((q) => q[0])).concat(marks.map((m) => m.x))
  const ys = series.flatMap((s) => s.pts.map((q) => q[1])).concat(marks.map((m) => m.y))
  const [x0, x1] = range(xs, !!p.logX)
  const [y0, y1] = range(ys, !!p.logY)
  const ax = axis(p.logX ? x0 : Math.min(...xs.filter(Number.isFinite)), x1, padL, w - padR, !!p.logX)
  const ay = axis(y0, y1, h - padB, padT, !!p.logY)
  const k = (() => {
    if (hp === null || !series.length) return null
    let best = 0, d = Infinity
    series[0].pts.forEach((q, i) => {
      const dd = Math.abs((byY ? ay.map(q[1]) : ax.map(q[0])) - hp)
      if (dd < d) { d = dd; best = i }
    })
    return best
  })()
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    if (byY) {
      const y = e.clientY - b.top
      setHp(y >= padT && y <= h - padB ? y : null)
    } else {
      const x = e.clientX - b.left
      setHp(x >= padL && x <= w - padR ? x : null)
    }
  }
  const legX = series.map((_, i) => padL + series.slice(0, i).reduce((a, t) => a + t.label.length * 6.2 + 32, 0))
  const pts = (s: XYSeries) =>
    s.pts.filter((q) => Number.isFinite(q[1]) && (!p.logY || q[1] > 0)).map((q) => `${ax.map(q[0])},${ay.map(q[1])}`).join(' ')
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={p.title} onMouseMove={onMove} onMouseLeave={() => setHp(null)}>
      {ax.ticks.map((t) => (
        <g key={`x${t}`}>
          <line x1={ax.map(t)} y1={padT} x2={ax.map(t)} y2={h - padB} stroke="var(--dg-grid)" />
          <text x={ax.map(t)} y={h - padB + 13} textAnchor="middle" className="dg-note">{ax.label(t)}</text>
        </g>
      ))}
      {ay.ticks.map((t) => (
        <g key={`y${t}`}>
          <line x1={padL} y1={ay.map(t)} x2={w - padR} y2={ay.map(t)} stroke="var(--dg-grid)" />
          <text x={padL - 6} y={ay.map(t) + 4} textAnchor="end" className="dg-note">{ay.label(t)}</text>
        </g>
      ))}
      <line className="dg-zero" x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} />
      <line className="dg-zero" x1={padL} y1={padT} x2={padL} y2={h - padB} />
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} points={pts(s)} />
      ))}
      {marks.map((m) => {
        const x = ax.map(m.x), y = ay.map(m.y), right = x > w * 0.62
        return (
          <g key={m.label}>
            <line x1={x} y1={y} x2={x} y2={h - padB} stroke={m.color} strokeDasharray="3 3" opacity={0.7} />
            <circle cx={x} cy={y} r={4} fill={m.color} />
            <text x={x + (right ? -8 : 8)} y={y - 7} textAnchor={right ? 'end' : 'start'} style={{ fill: m.color }}>{m.label}</text>
          </g>
        )
      })}
      <text x={w - padR} y={h - 4} textAnchor="end" className="dg-note">{p.xLabel}</text>
      <text x={8} y={padT - 8} className="dg-note">{p.yLabel}</text>
      {series.length > 1 &&
        series.map((s, i) => (
          <g key={s.label} transform={`translate(${legX[i] + 70}, 0)`}>
            <line x1={0} y1={10} x2={14} y2={10} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
            <text x={18} y={14} className="dg-note">{s.label}</text>
          </g>
        ))}
      {k !== null && (
        <g pointerEvents="none">
          {byY ? (
            <line x1={padL} y1={ay.map(series[0].pts[k][1])} x2={w - padR} y2={ay.map(series[0].pts[k][1])} stroke="var(--dg-axis)" strokeDasharray="3 3" />
          ) : (
            <line x1={ax.map(series[0].pts[k][0])} y1={padT} x2={ax.map(series[0].pts[k][0])} y2={h - padB} stroke="var(--dg-axis)" strokeDasharray="3 3" />
          )}
          {series.map((s) =>
            s.pts[k] && Number.isFinite(s.pts[k][1]) ? <circle key={s.label} cx={ax.map(s.pts[k][0])} cy={ay.map(s.pts[k][1])} r={3} fill={s.color} /> : null,
          )}
          <text x={w - padR - 4} y={padT + 12} textAnchor="end" className="val">
            {byY
              ? `${fx(series[0].pts[k][1], p.yDp ?? 3)} → ${series.map((s) => fx(s.pts[k]?.[0], p.xDp ?? 3)).join(' / ')}`
              : `${fx(series[0].pts[k][0], p.xDp ?? 2)} → ${series.map((s) => fx(s.pts[k]?.[1], p.yDp ?? 3)).join(' / ')}`}
          </text>
        </g>
      )}
    </svg>
  )
}
