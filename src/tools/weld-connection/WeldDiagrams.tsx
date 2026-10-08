import type { WeldConnectionResult } from '../../calc/weld-connection'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { sx, XAxis, type DiagramFrame } from '../../ui/diagram'
import { kdOf } from './model'

export type DiagramTab = 'kapasitas' | 'arah'

export const DIAGRAM_TABS: { id: DiagramTab; label: string }[] = [
  { id: 'kapasitas', label: 'Kapasitas' },
  { id: 'arah', label: 'Faktor arah' },
]

function bars(r: WeldConnectionResult): CapacityBar[] {
  const b: CapacityBar[] = [{ label: 'Las φRnw', cap: r.phiRnw, dem: r.Ru, color: 'var(--dg-y)', gov: r.weldGoverns }]
  if (r.baseOk)
    b.push(
      { label: 'Leleh geser dasar', cap: r.phiRyBase, dem: r.Ru, color: 'var(--dg-v)', gov: !r.weldGoverns && r.baseGov === 'leleh' },
      { label: 'Fraktur geser dasar', cap: r.phiRuBase, dem: r.Ru, color: 'var(--dg-m)', gov: !r.weldGoverns && r.baseGov === 'fraktur' },
    )
  return b
}

/** Kurva kd(θ) = 1 + 0,5·sin^1,5 θ, 0–90°, dengan titik θ input. */
function DirectionCurve({ r, w, h }: { r: WeldConnectionResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const f: DiagramFrame = { w, h, padL: 48, padR: 24, padT: 20, padB: 34, x0: 0, x1: 90 }
  const Y = (k: number) => f.padT + ((1.5 - k) / 0.5) * (h - f.padT - f.padB)
  const pts = Array.from({ length: 91 }, (_, t) => `${t ? 'L' : 'M'}${sx(f, t).toFixed(1)},${Y(kdOf(t)).toFixed(1)}`).join(' ')
  const kd = r.useDir ? r.kd : 1
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Faktor arah las sudut">
      {[1, 1.25, 1.5].map((k) => (
        <g key={k} className="dg-axis">
          <line x1={f.padL} y1={Y(k)} x2={w - f.padR} y2={Y(k)} style={{ stroke: 'var(--dg-grid)' }} />
          <text x={f.padL - 6} y={Y(k) + 4} textAnchor="end">
            {k.toFixed(2)}
          </text>
        </g>
      ))}
      <path d={pts} fill="none" stroke="var(--dg-m)" strokeWidth={2} opacity={r.useDir ? 1 : 0.4} />
      {!r.useDir && <line x1={f.padL} y1={Y(1)} x2={w - f.padR} y2={Y(1)} stroke="var(--dg-v)" strokeWidth={2} />}
      <g className="dg-ext">
        <circle cx={sx(f, r.theta)} cy={Y(kd)} r={4.5} fill="var(--bg)" stroke="var(--dg-load)" strokeWidth={2} />
        <text x={sx(f, r.theta) + (r.theta > 60 ? -8 : 8)} y={Y(kd) - 8} textAnchor={r.theta > 60 ? 'end' : 'start'}>
          kd = {fx(kd, 3)}
        </text>
      </g>
      <XAxis f={f} y={h - f.padB + 6} unit="°" name="θ" />
      <text x={f.padL} y={14} className="dg-note">
        {r.useDir ? 'kd = 1 + 0,5·sin¹·⁵θ (J2-5) · 0° sejajar, 90° tegak lurus sumbu las' : 'Faktor arah diabaikan: kd = 1 (konservatif)'}
      </text>
    </svg>
  )
}

export function WeldDiagram({ r, tab, w, h }: { r: WeldConnectionResult; tab: DiagramTab; w: number; h: number }) {
  if (tab === 'arah') return <DirectionCurve r={r} w={w} h={h} />
  return <CapacityBars bars={bars(r)} w={w} h={h} ariaLabel="Kapasitas las dan logam dasar" note="kN · garis = beban terfaktor Ru" />
}
