import type { WeldConnectionResult } from '../../calc/weld-connection'
import { fx } from '../../report/model'

// Preview: kiri pelat terlas dengan garis las sepanjang Lw dan panah beban bersudut θ terhadap sumbu las;
// kanan potongan las sudut (kaki w, throat te).

const ARROW = 8

function LoadArrow({ x, y, theta, len, label }: { x: number; y: number; theta: number; len: number; label: string }) {
  const a = (theta * Math.PI) / 180
  const ex = x + len * Math.cos(a), ey = y + len * Math.sin(a)
  const back = (k: number) => [ex - k * Math.cos(a), ey - k * Math.sin(a)] as const
  const [bx, by] = back(ARROW * 1.4)
  const nx = -Math.sin(a) * (ARROW / 1.6), ny = Math.cos(a) * (ARROW / 1.6)
  const r = Math.min(26, len * 0.4)
  return (
    <g>
      <line className="bp-plane" x1={x} y1={y} x2={x + len} y2={y} style={{ stroke: 'var(--dg-axis)' }} />
      {theta > 2 && (
        <path className="bp-dim-arc" d={`M${x + r},${y} A${r},${r} 0 0 1 ${x + r * Math.cos(a)},${y + r * Math.sin(a)}`} fill="none" stroke="var(--dg-axis)" />
      )}
      <text x={x + r + 4} y={y + (theta > 20 ? 14 : -6)} className="dg-note">
        θ {fx(theta, 0)}°
      </text>
      <g className="bp-arrow strong bp-point">
        <line x1={x} y1={y} x2={bx} y2={by} />
        <path d={`M${ex},${ey} L${bx + nx},${by + ny} L${bx - nx},${by - ny} Z`} />
        <text x={ex + 8} y={ey - 6} className="bp-pt-label">
          {label}
        </text>
      </g>
    </g>
  )
}

function Plan({ r, w, h }: { r: WeldConnectionResult; w: number; h: number }) {
  const x0 = 24, x1 = w - 24
  const yW = Math.round(h * 0.62)
  const top = 34
  const cx = x0 + (x1 - x0) * 0.32, cy = top + (yW - top) * 0.3
  // panah tetap di atas garis las berapa pun sudutnya
  const sin = Math.sin((r.theta * Math.PI) / 180)
  const len = Math.min((x1 - x0) * 0.42, (yW - top) * 1.1, (yW - cy - 10) / Math.max(sin, 0.01))
  return (
    <g>
      <g className="bp-plate">
        <rect x={x0} y={top} width={x1 - x0} height={yW - top} />
        <rect x={x0 - 10} y={yW} width={x1 - x0 + 20} height={Math.min(30, h - yW - 34)} />
      </g>
      <rect x={x0} y={yW - 3} width={x1 - x0} height={6} className="bp-weld" />
      <LoadArrow x={cx} y={cy} theta={r.theta} len={len} label={`Ru ${fx(r.Ru, 0)} kN`} />
      <g className="bp-dim">
        <line x1={x0} y1={h - 14} x2={x1} y2={h - 14} />
        <line x1={x0} y1={h - 18} x2={x0} y2={h - 10} />
        <line x1={x1} y1={h - 18} x2={x1} y2={h - 10} />
        <text x={(x0 + x1) / 2} y={h - 18} textAnchor="middle">
          Lw {fx(r.Lw, 0)} mm
        </text>
      </g>
      <text x={x0} y={20} className="bp-label">
        Las sudut {fx(r.w, 0)} mm · {r.electrode === 'custom' ? `FEXX ${fx(r.Fexx, 0)}` : (r.electrode ?? 'e70').toUpperCase() + 'XX'}
      </text>
    </g>
  )
}

/** Potongan las sudut: pelat datar + pelat tegak, segitiga las, throat. */
function Section({ r, x, w, h }: { r: WeldConnectionResult; x: number; w: number; h: number }) {
  const s = Math.min((w - 70) / 1.6, h * 0.42)
  const px = x + 30 + Math.max(0, (w - 70 - 1.6 * s) / 2) + 18, py = h * 0.66
  const tp = Math.max(8, Math.min(16, s * 0.18))
  return (
    <g>
      <text x={x + w / 2} y={20} textAnchor="middle" className="bp-label">
        Potongan las
      </text>
      <g className="bp-plate">
        <rect x={px - 18} y={py} width={1.6 * s + 18} height={tp} />
        <rect x={px - 18} y={py - s * 1.25} width={18} height={s * 1.25} />
      </g>
      <path className="bp-weld" d={`M${px},${py} L${px},${py - s} L${px + s},${py} Z`} />
      <line className="bp-plane" x1={px} y1={py} x2={px + s / 2} y2={py - s / 2} />
      <text x={px + s / 2 + 6} y={py - s / 2 - 2} className="bp-plane-label">
        te {fx(r.te, 2)}
      </text>
      <g className="bp-dim">
        <text x={px + s / 2} y={py + tp + 16} textAnchor="middle">
          w {fx(r.w, 0)}
        </text>
      </g>
    </g>
  )
}

export function WeldPreview({ r, w, h }: { r: WeldConnectionResult; w: number; h: number }) {
  if (w < 140 || h < 110) return null
  const wide = w >= 520
  const planW = wide ? w * 0.64 : w
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview sambungan las">
      <Plan r={r} w={planW} h={h} />
      {wide && (
        <>
          <line x1={planW} y1={12} x2={planW} y2={h - 12} stroke="var(--dg-grid)" />
          <Section r={r} x={planW} w={w - planW} h={h} />
        </>
      )}
    </svg>
  )
}
