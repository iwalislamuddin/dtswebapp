import { useState } from 'react'
import type { SteelBeamResult } from '../../calc/steel-beam-analysis'
import { fx } from '../../report/model'
import { Curve, sx, XAxis, xFromEvent, type DiagramFrame } from '../../ui/diagram'
import { Support } from './BeamPreview'

export type DiagramTab = 'reaksi' | 'geser' | 'momen' | 'lendutan'

export const DIAGRAM_TABS: { id: DiagramTab; label: string }[] = [
  { id: 'reaksi', label: 'Reaksi' },
  { id: 'geser', label: 'Geser' },
  { id: 'momen', label: 'Momen' },
  { id: 'lendutan', label: 'Lendutan' },
]

function Reactions({ r, f }: { r: SteelBeamResult; f: DiagramFrame }) {
  const y = Math.round(f.h * 0.4)
  const maxR = Math.max(1e-9, Math.abs(r.RA!), Math.abs(r.RB!))
  const arrow = (x: number, R: number, name: string) => {
    const len = 18 + 40 * (Math.abs(R) / maxR)
    const up = R >= 0 // reaksi positif = ke atas
    const y0 = up ? y + 28 + len : y + 28
    const y1 = up ? y + 28 : y + 28 + len
    return (
      <g className="dg-react">
        <line x1={x} y1={y0} x2={x} y2={y1 + (up ? 6 : -6)} />
        <path d={up ? `M${x},${y1} l-4,7 h8 Z` : `M${x},${y1} l-4,-7 h8 Z`} />
        <text x={x > f.w * 0.6 ? x - 8 : x + 8} y={y + 28 + len / 2 + 4} textAnchor={x > f.w * 0.6 ? 'end' : 'start'}>
          {name} = {fx(R, 2)} kN
        </text>
      </g>
    )
  }
  return (
    <g>
      <line className="bp-beam" x1={sx(f, 0)} y1={y} x2={sx(f, f.x1)} y2={y} />
      <Support x={sx(f, r.xA!)} y={y + 3} kind="pin" label="" />
      <Support x={sx(f, r.xB!)} y={y + 3} kind="roller" label="" />
      {arrow(sx(f, r.xA!), r.RA!, 'RA')}
      {arrow(sx(f, r.xB!), r.RB!, 'RB')}
      <text x={sx(f, f.x1)} y={y - 14} textAnchor="end" className="dg-note">
        ΣW = {fx(r.Wtot, 2)} kN
      </text>
    </g>
  )
}

export function BeamDiagram({ r, tab, w, h }: { r: SteelBeamResult; tab: DiagramTab; w: number; h: number }) {
  const [hx, setHx] = useState<number | null>(null)
  if (w < 80 || h < 80) return null
  const f: DiagramFrame = { w, h, padL: 36, padR: 36, padT: 30, padB: 40, x0: 0, x1: r.Ltot! }
  const plot = r.plot!
  const at = hx !== null ? r.at!(hx) : null

  let body
  if (tab === 'reaksi') body = <Reactions r={r} f={f} />
  else if (tab === 'geser')
    body = (
      <Curve f={f} pts={plot.Vpts.map((p) => [p[0] / 1000, p[1] / 1000])} color="var(--dg-v)" unit="kN" dp={2}
        extreme={{ x: r.xVmax!, v: r.Vmax! }} hover={at && { x: hx!, v: at.V }} />
    )
  else if (tab === 'momen')
    body = (
      <Curve f={f} pts={plot.xs.map((x, i) => [x / 1000, plot.M[i] / 1e6])} color="var(--dg-m)" unit="kN·m" dp={2} downPositive
        extreme={{ x: r.xMmax!, v: r.Mmax! }} hover={at && { x: hx!, v: at.M }} />
    )
  else
    body = (
      <Curve f={f} pts={plot.xs.map((x, i) => [x / 1000, plot.y[i]])} color="var(--dg-y)" unit="mm" dp={2} downPositive
        extreme={{ x: r.xYmax!, v: r.ymax! }} hover={at && { x: hx!, v: at.y }} />
    )

  return (
    <svg
      width={w}
      height={h}
      className="dg"
      role="img"
      aria-label={`Diagram ${tab}`}
      onMouseMove={tab === 'reaksi' ? undefined : (e) => setHx(xFromEvent(f, e))}
      onMouseLeave={() => setHx(null)}
    >
      {/* tumpuan sebagai acuan posisi */}
      {tab !== 'reaksi' &&
        [r.xA!, r.xB!].map((x) => <line key={x} className="dg-sup" x1={sx(f, x)} y1={f.padT - 8} x2={sx(f, x)} y2={h - f.padB} />)}
      {body}
      <XAxis f={f} y={h - f.padB + 6} unit="m" />
      {at && tab !== 'reaksi' && (
        <text x={f.padL} y={16} className="dg-readout">
          x = {fx(hx, 2)} m · V = {fx(at.V, 2)} kN · M = {fx(at.M, 2)} kN·m · δ = {fx(at.y, 2)} mm
        </text>
      )}
    </svg>
  )
}
