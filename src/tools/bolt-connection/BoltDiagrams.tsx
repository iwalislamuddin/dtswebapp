import type { BoltConnectionResult } from '../../calc/bolt-connection'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'

// Diagram hasil: batang kapasitas rencana tiap keadaan batas, garis = beban terfaktor (kebutuhan).

export type DiagramTab = 'grup' | 'baut'

export const DIAGRAM_TABS: { id: DiagramTab; label: string }[] = [
  { id: 'grup', label: 'Grup' },
  { id: 'baut', label: 'Per baut' },
]

function groupBars(r: BoltConnectionResult): CapacityBar[] {
  const bars: CapacityBar[] = [{ label: 'Geser grup efektif', cap: r.phiRge, dem: r.Vu, color: 'var(--dg-v)', gov: r.gov === 'geser' && r.govDC > 0 }]
  if (r.Tu > 0) bars.push({ label: 'Tarik grup', cap: r.phiRnt * r.n, dem: r.Tu, color: 'var(--dg-y)', gov: r.gov === 'tarik' })
  if (r.Tu > 0 && r.phiRntMod != null)
    bars.push({ label: r.comboNeeded ? 'Kombinasi J3.7' : 'Kombinasi (info)', cap: r.phiRntMod * r.n, dem: r.Tu, color: 'var(--dg-y)', gov: r.gov === 'kombinasi', aux: !r.comboNeeded })
  bars.push({ label: 'Geser baut × n', cap: r.phiVboltTotal, dem: r.Vu, color: 'var(--dg-axis)', aux: true })
  if (r.phiBrgTotal != null) bars.push({ label: 'Tumpu total', cap: r.phiBrgTotal, dem: r.Vu, color: 'var(--dg-m)', aux: true })
  return bars
}

function boltBars(r: BoltConnectionResult): CapacityBar[] {
  const bars: CapacityBar[] = [{ label: `Geser baut (${r.m} bidang)`, cap: r.phiRnv, dem: r.rv, color: 'var(--dg-v)' }]
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
  return (
    <CapacityBars
      bars={tab === 'grup' ? groupBars(r) : boltBars(r)}
      w={w}
      h={h}
      ariaLabel={tab === 'grup' ? 'Kapasitas grup baut' : 'Kapasitas per baut'}
      note={`kN · garis = beban terfaktor${tab === 'baut' ? ` (rv ${fx(r.rv, 1)}${r.Tu > 0 ? `, rt ${fx(r.rt, 1)}` : ''})` : ''}`}
    />
  )
}
