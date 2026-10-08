import type { BoltConnectionResult } from '../../calc/bolt-connection'
import { fx } from '../../report/model'
import { planGeometry } from './report'

// Preview: kiri denah pola baut pada pelat tumpu (beban ke kanan, baris searah beban) + dimensi;
// kanan potongan memanjang yang menunjukkan jumlah bidang geser (1 = lap, 2 = pelat penyambung dua sisi).

const ARROW = 7

function Dim({ x1, y1, x2, y2, text, side = 'top' }: { x1: number; y1: number; x2: number; y2: number; text: string; side?: 'top' | 'left' }) {
  const vert = x1 === x2
  if (Math.hypot(x2 - x1, y2 - y1) < 4) return null
  const t = 4
  return (
    <g className="bp-dim">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vert ? (
        <>
          <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} />
          <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} />
          <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} />
        </>
      )}
      {side === 'left' ? (
        <text x={x1 - 6} y={(y1 + y2) / 2 + 4} textAnchor="end">
          {text}
        </text>
      ) : (
        <text x={(x1 + x2) / 2} y={y1 - 5} textAnchor="middle">
          {text}
        </text>
      )}
    </g>
  )
}

function ArrowR({ x1, x2, y, label, sub }: { x1: number; x2: number; y: number; label: string; sub?: string }) {
  return (
    <g className="bp-arrow strong bp-point">
      <line x1={x1} y1={y} x2={x2 - ARROW} y2={y} />
      <path d={`M${x2},${y} l${-ARROW * 1.4},${-ARROW / 1.6} v${(ARROW * 2) / 1.6} Z`} />
      <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" className="bp-pt-label">
        {label}
      </text>
      {sub && (
        <text x={(x1 + x2) / 2} y={y + 18} textAnchor="middle" className="bp-pt-label">
          {sub}
        </text>
      )}
    </g>
  )
}

function Plan({ r, x, y, w, h }: { r: BoltConnectionResult; x: number; y: number; w: number; h: number }) {
  const g = planGeometry(r)
  const arrowW = 86
  const sc = Math.min((w - arrowW - 64) / g.W, (h - 64) / g.H)
  if (!(sc > 0)) return null
  const W = g.W * sc, H = g.H * sc
  const x0 = x + 56 + Math.max(0, (w - arrowW - 64 - W) / 2), y0 = y + 22 + Math.max(0, (h - 64 - H) / 2)
  const rb = Math.max(3, (r.dh * sc) / 2)
  const bolts: { cx: number; cy: number }[] = []
  for (let i = 0; i < r.nr; i++) for (let j = 0; j < r.nc; j++) bolts.push({ cx: x0 + (g.le + i * g.s) * sc, cy: y0 + (g.eg + j * g.sg) * sc })
  return (
    <g>
      <g className="bp-plate">
        <path d={`M${x0 + W},${y0} H${x0} V${y0 + H} H${x0 + W}`} />
        <line className="cut" x1={x0 + W} y1={y0} x2={x0 + W} y2={y0 + H} />
      </g>
      {bolts.map((b, k) => (
        <g key={k} className="bp-bolt">
          <circle cx={b.cx} cy={b.cy} r={rb} />
          <line x1={b.cx - rb - 3} y1={b.cy} x2={b.cx + rb + 3} y2={b.cy} />
          <line x1={b.cx} y1={b.cy - rb - 3} x2={b.cx} y2={b.cy + rb + 3} />
        </g>
      ))}
      <Dim x1={x0} y1={y0 + H + 16} x2={x0 + g.le * sc} y2={y0 + H + 16} text={`le ${fx(r.le, 0)}`} />
      {r.nr > 1 && <Dim x1={x0 + g.le * sc} y1={y0 + H + 16} x2={x0 + (g.le + g.s) * sc} y2={y0 + H + 16} text={`s ${fx(r.s, 0)}`} />}
      {r.nc > 1 && <Dim x1={x0 - 12} y1={y0 + g.eg * sc} x2={x0 - 12} y2={y0 + (g.eg + g.sg) * sc} text={`g ${fx(r.sg, 0)}`} side="left" />}
      <ArrowR x1={x0 + W + 10} x2={x0 + W + arrowW - 8} y={y0 + H / 2} label={`Vu ${fx(r.Vu, 0)} kN`} sub={r.Tu > 0 ? `Tu ${fx(r.Tu, 0)} kN ⊥` : undefined} />
      <text x={x0} y={y0 - 8} className="bp-label">
        {r.nr}×{r.nc} M{fx(r.d, 0)} · {r.grade === 'custom' ? 'Kustom' : r.gradeLabel.split(' ')[0]} ({r.thread})
      </text>
    </g>
  )
}

/** Potongan memanjang: pelat bertumpuk, baut menembus, bidang geser putus-putus. */
function Section({ r, x, y, w, h }: { r: BoltConnectionResult; x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2
  const tp = Math.max(9, Math.min(18, h * 0.07))
  const plates = r.m === 2 ? 3 : 2
  const stackH = plates * tp
  const y0 = y + (h - stackH) / 2
  const halfW = Math.min(w * 0.4, 90)
  const boltW = Math.max(6, Math.min(12, tp * 0.75))
  // pelat utama ke kanan (ditarik), penyambung ke kiri
  const rects: { x1: number; x2: number; top: number; main: boolean }[] = []
  for (let k = 0; k < plates; k++) {
    const main = k === 1
    rects.push({ x1: main ? cx - halfW * 0.55 : cx - halfW, x2: main ? cx + halfW : cx + halfW * 0.55, top: y0 + k * tp, main })
  }
  const planes = Array.from({ length: plates - 1 }, (_, k) => y0 + (k + 1) * tp)
  const bx = [cx - halfW * 0.25, cx + halfW * 0.25]
  return (
    <g>
      <text x={cx} y={y + 16} textAnchor="middle" className="bp-label">
        Potongan · {r.m === 2 ? 'geser ganda' : 'geser tunggal'}
      </text>
      <g className="bp-plate">
        {rects.map((p, k) => (
          <rect key={k} x={p.x1} y={p.top} width={p.x2 - p.x1} height={tp} />
        ))}
      </g>
      <g className="bp-bolt">
        {bx.map((b) => (
          <g key={b}>
            <rect x={b - boltW / 2} y={y0 - 5} width={boltW} height={stackH + 10} />
            <rect x={b - boltW * 0.9} y={y0 - 9} width={boltW * 1.8} height={5} />
            <rect x={b - boltW * 0.9} y={y0 + stackH + 4} width={boltW * 1.8} height={5} />
          </g>
        ))}
      </g>
      {planes.map((py) => (
        <line key={py} className="bp-plane" x1={cx - halfW - 8} y1={py} x2={cx + halfW + 8} y2={py} />
      ))}
      <text x={cx} y={y0 + stackH + 30} textAnchor="middle" className="bp-plane-label">
        m = {r.m} bidang geser
      </text>
      <g className="bp-arrow bp-point">
        <line x1={cx + halfW + 4} y1={y0 + 1.5 * tp} x2={cx + halfW + 26} y2={y0 + 1.5 * tp} />
        <path d={`M${cx + halfW + 32},${y0 + 1.5 * tp} l-8,-4 v8 Z`} />
      </g>
    </g>
  )
}

export function BoltPreview({ r, w, h }: { r: BoltConnectionResult; w: number; h: number }) {
  if (w < 120 || h < 100) return null
  const wide = w >= 520
  const planW = wide ? w * 0.66 : w
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview pola baut">
      <Plan r={r} x={0} y={0} w={planW} h={h} />
      {wide && (
        <>
          <line x1={planW} y1={12} x2={planW} y2={h - 12} stroke="var(--dg-grid)" />
          <Section r={r} x={planW} y={0} w={w - planW} h={h} />
        </>
      )}
    </svg>
  )
}
