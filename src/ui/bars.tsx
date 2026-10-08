import { fx } from '../report/model'

// Grafik batang kapasitas rencana tiap keadaan batas; garis vertikal = beban terfaktor (kebutuhan). SVG ukuran
// piksel nyata, warna dari token --dg-*. Dipakai tool cek kapasitas (sambungan, dsb.).

export interface CapacityBar {
  label: string
  cap: number
  dem: number
  /** Warna CSS, mis. 'var(--dg-v)'. */
  color: string
  /** Keadaan batas menentukan (ditebalkan). */
  gov?: boolean
  /** Pembanding/informasi (diredupkan). */
  aux?: boolean
}

export function CapacityBars({ bars, w, h, note, ariaLabel }: { bars: CapacityBar[]; w: number; h: number; note: string; ariaLabel: string }) {
  if (w < 160 || h < 80 || !bars.length) return null
  const padL = Math.min(170, w * 0.36), padR = 64, padB = 26
  const avail = w - padL - padR
  const rowH = Math.min(40, (h - 14 - padB) / bars.length)
  // batang di tengah tinggi yang tersedia
  const padT = Math.max(14, (h - padB - bars.length * rowH) / 2)
  const barH = Math.max(8, Math.min(18, rowH * 0.5))
  const maxV = Math.max(1e-9, ...bars.flatMap((b) => [b.cap, b.dem])) * 1.05
  const X = (v: number) => padL + (Math.max(0, v) / maxV) * avail
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={ariaLabel}>
      <line className="dg-zero" x1={padL} y1={padT - 4} x2={padL} y2={padT + bars.length * rowH} />
      {bars.map((b, i) => {
        const yMid = padT + i * rowH + rowH / 2
        const y = yMid - barH / 2
        const len = Math.max(2, X(b.cap) - padL)
        return (
          <g key={b.label} className={`dg-bar${b.gov ? ' gov' : ''}`} opacity={b.aux ? 0.55 : 1}>
            <text x={padL - 8} y={yMid + 4} textAnchor="end" className="dg-bar-label">
              {b.label}
            </text>
            <rect x={padL} y={y} width={len} height={barH} rx={2} fill={`color-mix(in srgb, ${b.color} ${b.gov ? 70 : 35}%, transparent)`} stroke={b.color} />
            {/* angka di kanan batang — atau di kanan garis beban bila beban melampaui kapasitas */}
            <text x={Math.max(padL + len, b.dem > b.cap ? X(b.dem) : 0) + 6} y={yMid + 4} className="val">
              {fx(b.cap, 1)}
            </text>
            {b.dem > 0 && <line className={`dem${b.dem > b.cap ? ' over' : ''}`} x1={X(b.dem)} y1={y - 4} x2={X(b.dem)} y2={y + barH + 4} />}
          </g>
        )
      })}
      <text x={padL} y={h - 8} className="dg-note">
        {note}
      </text>
    </svg>
  )
}
