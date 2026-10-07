import type { MouseEvent, ReactNode } from 'react'
import { niceStep } from '../report/figure'

// Diagram gaya dalam bersama (SVG, ukuran piksel nyata agar teks tajam & tetap): sumbu x = posisi sepanjang
// elemen, kurva berisi ke garis nol, label nilai ekstrem, garis bidik hover. Warna dari token --dg-*.

export interface DiagramFrame {
  w: number
  h: number
  /** Margin kiri/kanan/atas/bawah (px). */
  padL: number
  padR: number
  padT: number
  padB: number
  /** Rentang sumbu x (satuan data, mis. m). */
  x0: number
  x1: number
}

export const sx = (f: DiagramFrame, x: number) => f.padL + ((x - f.x0) / (f.x1 - f.x0 || 1)) * (f.w - f.padL - f.padR)

/** x data dari posisi mouse (dibatasi ke rentang). */
export function xFromEvent(f: DiagramFrame, e: MouseEvent<SVGElement>): number {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  // Rasio terhadap lebar terukur: tetap benar bila elemen diskalakan (zoom/transform).
  const px = ((e.clientX - rect.left) / (rect.width || 1)) * f.w
  const t = (px - f.padL) / (f.w - f.padL - f.padR)
  return f.x0 + Math.max(0, Math.min(1, t)) * (f.x1 - f.x0)
}

/** Garis skala x di bawah diagram (tick 1/2/5). */
export function XAxis({ f, y, unit }: { f: DiagramFrame; y: number; unit: string }) {
  const step = niceStep(f.x1 - f.x0, Math.max(2, Math.floor((f.w - f.padL - f.padR) / 70)))
  const ticks: number[] = []
  for (let v = Math.ceil(f.x0 / step) * step; v <= f.x1 + 1e-9; v += step) ticks.push(v)
  return (
    <g className="dg-axis">
      <line x1={sx(f, f.x0)} y1={y} x2={sx(f, f.x1)} y2={y} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(f, t)} y1={y} x2={sx(f, t)} y2={y + 4} />
          <text x={sx(f, t)} y={y + 15} textAnchor="middle">
            {+t.toFixed(3)}
          </text>
        </g>
      ))}
      <text x={f.w - f.padR} y={y + 28} textAnchor="end">
        x ({unit})
      </text>
    </g>
  )
}

export interface CurveProps {
  f: DiagramFrame
  /** Titik [x, nilai]; boleh dua titik di x sama (lompatan). */
  pts: [number, number][]
  /** Nilai positif digambar ke bawah (konvensi momen di sisi tarik / lendutan ke bawah). */
  downPositive?: boolean
  color: string
  unit: string
  dp: number
  /** Nilai & posisi ekstrem yang diberi label. */
  extreme?: { x: number; v: number }
  /** Posisi bidik hover (x data) & nilainya. */
  hover?: { x: number; v: number } | null
  children?: ReactNode
}

/** Kurva gaya dalam berisi ke nol, dengan label ekstrem dan titik hover. */
export function Curve({ f, pts, downPositive, color, unit, dp, extreme, hover, children }: CurveProps) {
  const maxAbs = Math.max(1e-12, ...pts.map((p) => Math.abs(p[1])))
  const zeroY = f.padT + (f.h - f.padT - f.padB) / 2
  const k = (f.h - f.padT - f.padB) / 2 / maxAbs
  const Y = (v: number) => zeroY + (downPositive ? 1 : -1) * v * k
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(f, p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('')
  const area = `${d}L${sx(f, pts[pts.length - 1][0]).toFixed(1)},${zeroY}L${sx(f, pts[0][0]).toFixed(1)},${zeroY}Z`
  const label = (v: number) => `${v.toFixed(dp)} ${unit}`
  return (
    <g>
      <line className="dg-zero" x1={sx(f, f.x0)} y1={zeroY} x2={sx(f, f.x1)} y2={zeroY} />
      <path d={area} fill={color} fillOpacity={0.16} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {extreme && Math.abs(extreme.v) > 1e-9 && (
        <g className="dg-ext">
          <circle cx={sx(f, extreme.x)} cy={Y(extreme.v)} r={3} fill={color} />
          <text
            x={sx(f, extreme.x)}
            y={Y(extreme.v) + ((downPositive ? 1 : -1) * extreme.v > 0 ? 16 : -8)}
            textAnchor="middle"
          >
            {label(extreme.v)}
          </text>
        </g>
      )}
      {hover && (
        <g className="dg-hover">
          <line x1={sx(f, hover.x)} y1={f.padT - 6} x2={sx(f, hover.x)} y2={f.h - f.padB + 6} />
          <circle cx={sx(f, hover.x)} cy={Y(hover.v)} r={3.5} stroke={color} />
        </g>
      )}
      {children}
    </g>
  )
}
