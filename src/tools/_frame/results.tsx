import { useState, type ReactNode } from 'react'
import { Panel, Sized, SubTabs } from '../../ui/kit'
import { FrameSvg, type FrameMode } from './FrameSvg'
import type { FrameView } from './geom'
import type { FrameMember } from '../../calc/shared/frame2d'
import { fx } from '../../report/model'

// Panel Diagram rangka bidang: sub-tab Momen/Geser/Aksial/Deformasi/Reaksi + ringkasan tool (children).

const TABS: { id: Exclude<FrameMode, 'model'>; label: string }[] = [
  { id: 'M', label: 'Momen' },
  { id: 'V', label: 'Geser' },
  { id: 'N', label: 'Aksial' },
  { id: 'D', label: 'Deformasi' },
  { id: 'R', label: 'Reaksi' },
]

export function FrameResults({
  view,
  stale,
  status,
  warn,
  children,
}: {
  view: FrameView | null
  stale: boolean
  status: string | null
  warn: string[]
  children: ReactNode
}) {
  const [tab, setTab] = useState<Exclude<FrameMode, 'model'>>('M')
  return (
    <Panel title="Diagram" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (view ? <FrameSvg v={view} mode={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {view && (
          <div className={`fr-summary${stale ? ' stale' : ''}`}>
            <h4 className="results-h">Nilai maksimum</h4>
            {children}
            {warn.length > 0 && (
              <ul className="results-warn">
                {warn.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

/** Tabel gaya dalam maksimum per batang + tegangan elastis informatif. */
export function MemberTable({ elems, names }: { elems: FrameMember[]; names: string[] }) {
  return (
    <table className="fr-table">
      <thead>
        <tr>
          <th>Batang</th>
          <th>|M| kN·m</th>
          <th>|V| kN</th>
          <th>N kN</th>
          <th>σ = M/S + N/A</th>
        </tr>
      </thead>
      <tbody>
        {elems.map((e, k) => (
          <tr key={k}>
            <td>{names[k]}</td>
            <td>{fx(Math.abs(e.Mmax!), 2)}</td>
            <td>{fx(Math.abs(e.Vmax!), 2)}</td>
            <td>{fx(e.Nmax, 2)}</td>
            <td>{e.fb != null ? `${fx(e.fb, 1)} + ${fx(e.fa, 1)} MPa` : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
