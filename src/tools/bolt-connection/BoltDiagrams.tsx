import type { BoltConnectionResult } from '../../calc/bolt-connection'
import { fx } from '../../report/model'

// Diagram hasil: batang kapasitas rencana tiap keadaan batas, garis = beban terfaktor (kebutuhan).

export type DiagramTab = 'grup' | 'baut'

export const DIAGRAM_TABS: { id: DiagramTab; label: string }[] = [
  { id: 'grup', label: 'Grup' },
  { id: 'baut', label: 'Per baut' },
]

interface Bar {
  label: string
  cap: number
  dem: number
  color: string
  /** Keadaan batas menentukan. */
  gov?: boolean
  /** Pembanding/informasi (tidak menentukan). */
  aux?: boolean
}

function groupBars(r: BoltConnectionResult): Bar[] {
  const bars: Bar[] = [{ label: 'Geser grup efektif', cap: r.phiRge, dem: r.Vu, color: 'var(--dg-v)', gov: r.gov === 'geser' && r.govDC > 0 }]
  if (r.Tu > 0) bars.push({ label: 'Tarik grup', cap: r.phiRnt * r.n, dem: r.Tu, color: 'var(--dg-y)', gov: r.gov === 'tarik' })
  if (r.Tu > 0 && r.phiRntMod != null)
    bars.push({ label: r.comboNeeded ? 'Kombinasi J3.7' : 'Kombinasi (info)', cap: r.phiRntMod * r.n, dem: r.Tu, color: 'var(--dg-y)', gov: r.gov === 'kombinasi', aux: !r.comboNeeded })
  bars.push({ label: 'Geser baut × n', cap: r.phiVboltTotal, dem: r.Vu, color: 'var(--dg-axis)', aux: true })
  if (r.phiBrgTotal != null) bars.push({ label: 'Tumpu total', cap: r.phiBrgTotal, dem: r.Vu, color: 'var(--dg-m)', aux: true })
  return bars
}

function boltBars(r: BoltConnectionResult): Bar[] {
  const bars: Bar[] = [{ label: `Geser baut (${r.m} bidang)`, cap: r.phiRnv, dem: r.rv, color: 'var(--dg-v)' }]
  if (r.bearingOk) {
    bars.push({ label: 'Tumpu baut tepi', cap: 0.75 * r.rnBrgEdge, dem: r.rv, color: 'var(--dg-m)' })
    if (r.nr > 1) bars.push({ label: 'Tumpu baut dalam', cap: 0.75 * r.rnBrgInner, dem: r.rv, color: 'var(--dg-m)' })
  }
  if (r.Tu > 0) {
    bars.push({ label: 'Tarik baut', cap: r.phiRnt, dem: r.rt, color: 'var(--dg-y)' })
    if (r.phiRntMod != null) bars.push({ label: "Tarik termodifikasi F'nt", cap: r.phiRntMod, dem: r.rt, color: 'var(--dg-y)', aux: !r.comboNeeded })
  }
  return bars
}

export function BoltDiagram({ r, tab, w, h }: { r: BoltConnectionResult; tab: DiagramTab; w: number; h: number }) {
  if (w < 160 || h < 80) return null
  const bars = tab === 'grup' ? groupBars(r) : boltBars(r)
  const padL = Math.min(170, w * 0.36), padR = 64, padB = 26
  const avail = w - padL - padR
  const rowH = Math.min(40, (h - 14 - padB) / bars.length)
  // batang di tengah tinggi yang tersedia
  const padT = Math.max(14, (h - padB - bars.length * rowH) / 2)
  const barH = Math.max(8, Math.min(18, rowH * 0.5))
  const maxV = Math.max(1e-9, ...bars.flatMap((b) => [b.cap, b.dem])) * 1.05
  const X = (v: number) => padL + (Math.max(0, v) / maxV) * avail
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={tab === 'grup' ? 'Kapasitas grup baut' : 'Kapasitas per baut'}>
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
            <text x={Math.max(padL + len, b.dem > b.cap ? X(b.dem) : 0) + 6} y={yMid + 4} className="val">
              {fx(b.cap, 1)}
            </text>
            {b.dem > 0 && <line className={`dem${b.dem > b.cap ? ' over' : ''}`} x1={X(b.dem)} y1={y - 4} x2={X(b.dem)} y2={y + barH + 4} />}
          </g>
        )
      })}
      <text x={padL} y={h - 8} className="dg-note">
        kN · garis = beban terfaktor{tab === 'baut' ? ` (rv ${fx(r.rv, 1)}${r.Tu > 0 ? `, rt ${fx(r.rt, 1)}` : ''})` : ''}
      </text>
    </svg>
  )
}
