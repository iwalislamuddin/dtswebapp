import { useMemo, useState } from 'react'
import type { EdgeCondition, TwoWaySlabResult } from '../../calc/two-way-slab'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { COND_OPTIONS, computeSlab, rejectReason, SLAB_BARS, SLAB_DEFAULTS, validate, type SlabInput } from './model'
import { slabReport } from './report'

const ID = 'two-way-slab'

interface Outcome {
  i: SlabInput
  r: TwoWaySlabResult
}

export default function TwoWaySlab({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<SlabInput>(ID, SLAB_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: SlabInput): Outcome | null => {
    const r = computeSlab(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (result ? slabReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input bentang, tebal, beban, dan material untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><SlabPlan r={result.r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={result?.r ?? null} stale={stale} reject={reject} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: SlabInput
  setInput: (p: Partial<SlabInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  return (
    <>
      <Card n={1} title="Geometri & tumpuan" actions={<ResetButton onReset={onReset} />}>
        <NumField label="Lx — bentang pendek" unit="m" value={input.Lx} error={errors.Lx} onChange={(Lx) => setInput({ Lx })} />
        <NumField label="Ly — bentang panjang" unit="m" value={input.Ly} error={errors.Ly} hint="Bila Ly < Lx, keduanya ditukar otomatis." onChange={(Ly) => setInput({ Ly })} />
        <NumField label="Tebal pelat h" unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />
        <SelectField label="Tumpuan arah Lx" value={input.condX} options={COND_OPTIONS} onChange={(condX) => setInput({ condX })} />
        <SelectField label="Tumpuan arah Ly" value={input.condY} options={COND_OPTIONS} onChange={(condY) => setInput({ condY })} />
      </Card>
      <Card n={2} title="Beban">
        <NumField label="Beban mati tambahan" unit="kN/m²" value={input.qDL} error={errors.qDL} hint="Di luar berat sendiri (dihitung otomatis, 24 kN/m³)." onChange={(qDL) => setInput({ qDL })} />
        <NumField label="Beban hidup" unit="kN/m²" value={input.qLL} error={errors.qLL} onChange={(qLL) => setInput({ qLL })} />
      </Card>
      <Card n={3} title="Material & tulangan">
        <NumField label="f'c" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        <NumField label="Selimut bersih" unit="mm" value={input.cc} error={errors.cc} onChange={(cc) => setInput({ cc })} />
        <SelectField label="Ø tulangan" value={input.db} options={SLAB_BARS.map((d) => ({ value: String(d), label: `D${d}` }))} onChange={(db) => setInput({ db })} />
      </Card>
    </>
  )
}

/** Denah: tepi jepit (tebal) / sendi (putus), bentang, tulangan lapangan & tumpuan. */
function SlabPlan({ r, w, h }: { r: TwoWaySlabResult; w: number; h: number }) {
  if (w < 160 || h < 120) return null
  const sc = Math.min((w - 150) / r.Ly!, (h - 70) / r.Lx!)
  const W = r.Ly! * sc, H = r.Lx! * sc, x0 = (w - W) / 2, y0 = 30 + (h - 70 - H) / 2
  const edge = (x1: number, y1: number, x2: number, y2: number, c: EdgeCondition) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--dg-support)" strokeWidth={c === 'ss' ? 1.5 : 5} strokeDasharray={c === 'ss' ? '6 4' : undefined} />
  )
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Denah pelat dua arah">
      <text x={8} y={16} className="bp-label">
        h {fx(r.h, 0)} mm · Ly/Lx {fx(r.ratio, 2)} · wu {fx(r.wu, 2)} kN/m²
      </text>
      <g className="bp-plate">
        <rect x={x0} y={y0} width={W} height={H} style={{ stroke: 'none' }} />
      </g>
      {edge(x0, y0, x0 + W, y0, r.condX!)}
      {edge(x0, y0 + H, x0 + W, y0 + H, r.condX === 'fp' ? 'ss' : r.condX!)}
      {edge(x0, y0, x0, y0 + H, r.condY!)}
      {edge(x0 + W, y0, x0 + W, y0 + H, r.condY === 'fp' ? 'ss' : r.condY!)}
      <line x1={x0 + W / 2} y1={y0 + 12} x2={x0 + W / 2} y2={y0 + H - 12} stroke="var(--dg-m)" strokeWidth={2} />
      <line x1={x0 + 12} y1={y0 + H / 2} x2={x0 + W - 12} y2={y0 + H / 2} stroke="var(--dg-y)" strokeWidth={2} />
      <text x={x0 + W / 2 + 6} y={y0 + 24} style={{ fill: 'var(--dg-m)', fontWeight: 600 }}>
        x: D{r.db}-{r.asXpos!.s}
        {r.mX!.Mneg > 0 ? ` · tump. D${r.db}-${r.asXneg!.s}` : ''}
      </text>
      <text x={x0 + 18} y={y0 + H / 2 - 6} style={{ fill: 'var(--dg-y)', fontWeight: 600 }}>
        y: D{r.db}-{r.asYpos!.s}
        {r.mY!.Mneg > 0 ? ` · tump. D${r.db}-${r.asYneg!.s}` : ''}
      </text>
      <g className="bp-dim">
        <text x={x0 + W / 2} y={y0 + H + 18} textAnchor="middle">
          Ly {fx(r.Ly, 2)} m
        </text>
        <text x={x0 - 8} y={y0 + H / 2 + 4} textAnchor="end">
          Lx {fx(r.Lx, 2)} m
        </text>
      </g>
      <text x={8} y={h - 6} className="dg-note">
        garis tebal = jepit · putus-putus = sendi · tulangan jalur tengah (tepi: M/3)
      </text>
    </svg>
  )
}

type Tab = 'momen' | 'lendutan'

function chart(r: TwoWaySlabResult, tab: Tab): { bars: CapacityBar[]; note: string } {
  if (tab === 'momen')
    return {
      note: 'kN·m/m · momen terfaktor jalur tengah',
      bars: [
        { label: 'Mx lapangan', cap: r.mX!.Mpos, dem: 0, color: 'var(--dg-m)' },
        ...(r.mX!.Mneg > 0 ? [{ label: 'Mx tumpuan', cap: r.mX!.Mneg, dem: 0, color: 'var(--dg-m)', aux: true }] : []),
        { label: 'My lapangan', cap: r.mY!.Mpos, dem: 0, color: 'var(--dg-y)' },
        ...(r.mY!.Mneg > 0 ? [{ label: 'My tumpuan', cap: r.mY!.Mneg, dem: 0, color: 'var(--dg-y)', aux: true }] : []),
      ],
    }
  return {
    note: 'mm · batang = batas izin, garis = δ maks',
    bars: [
      { label: 'Lx/240', cap: r.limit240!, dem: r.dMax!, color: 'var(--dg-v)' },
      { label: 'Lx/360', cap: r.limit360!, dem: r.dMax!, color: 'var(--dg-v)', aux: true },
    ],
  }
}

function Results({ r, stale, reject }: { r: TwoWaySlabResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('momen')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'momen', label: 'Momen' }, { id: 'lendutan', label: 'Lendutan' }]} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <CapacityBars w={w} h={h} ariaLabel={tab} {...chart(r, tab)} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Tulangan arah x', value: `D${r.db}-${r.asXpos!.s}`, sub: r.mX!.Mneg > 0 ? `tumpuan D${r.db}-${r.asXneg!.s}` : 'lapangan' },
                { label: 'Tulangan arah y', value: `D${r.db}-${r.asYpos!.s}`, sub: r.mY!.Mneg > 0 ? `tumpuan D${r.db}-${r.asYneg!.s}` : 'lapangan' },
                { label: 'Porsi beban arah pendek', value: fx(r.shareX, 0), unit: '%', sub: `wux ${fx(r.wux, 2)} kN/m²` },
                {
                  label: 'Lendutan δ maks',
                  value: fx(r.dMax, 1),
                  unit: 'mm',
                  sub: `Lx/${fx((r.Lx! * 1000) / r.dMax!, 0)} · ${r.dMax! <= r.limit240! ? '≤ L/240' : '> L/240'}`,
                  tone: r.dMax! <= r.limit240! ? 'ok' : 'bad',
                },
              ]}
            />
            {r.warn.length > 0 && (
              <ul className="results-warn">
                {r.warn.map((w) => (
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
