import { useMemo, useState } from 'react'
import type { ShearTorsionResult } from '../../calc/beam-shear-torsion'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { BARS, computeShear, LAMBDA_OPTIONS, rejectReason, SHEAR_DEFAULTS, STIRRUPS, validate, type ShearInput } from './model'
import { longBars, shearReport } from './report'

const ID = 'beam-shear-torsion'
const BAR_OPTS = BARS.map((d) => ({ value: String(d), label: `D${d}` }))
const STIR_OPTS = STIRRUPS.map((d) => ({ value: String(d), label: `Ø${d}` }))

export default function BeamShearTorsion({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<ShearInput>(ID, SHEAR_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeShear)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? shearReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input penampang, tulangan, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><SectionPreview r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={r} stale={stale} reject={reject} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: ShearInput
  setInput: (p: Partial<ShearInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  return (
    <>
      <Card n={1} title="Material" actions={<ResetButton onReset={onReset} />}>
        <NumField label="f'c — mutu beton" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy — tul. longitudinal" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        <NumField label="fyt — sengkang" unit="MPa" value={input.fyt} error={errors.fyt} onChange={(fyt) => setInput({ fyt })} />
        <SelectField label="λ — jenis beton" value={input.lam} options={LAMBDA_OPTIONS} onChange={(lam) => setInput({ lam })} />
      </Card>
      <Card n={2} title="Penampang & sengkang">
        <NumField label="b — lebar (bw)" unit="mm" value={input.b} error={errors.b} onChange={(b) => setInput({ b })} />
        <NumField label="h — tinggi total" unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />
        <NumField label="Selimut bersih ke sengkang" unit="mm" value={input.cc} error={errors.cc} onChange={(cc) => setInput({ cc })} />
        <SelectField label="Diameter sengkang" value={input.ds} options={STIR_OPTS} onChange={(ds) => setInput({ ds })} />
        <Field label="Jumlah kaki">
          <Segmented
            ariaLabel="Jumlah kaki"
            value={input.nLegs}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
            onChange={(nLegs) => setInput({ nLegs })}
          />
        </Field>
        <NumField label="Spasi sengkang s" unit="mm" value={input.s} error={errors.s} onChange={(s) => setInput({ s })} />
      </Card>
      <Card n={3} title="Tulangan longitudinal">
        <NumField label="Atas — jumlah" value={input.nTop} error={errors.nTop} onChange={(nTop) => setInput({ nTop })} />
        <SelectField label="Atas — diameter" value={input.dbTop} options={BAR_OPTS} onChange={(dbTop) => setInput({ dbTop })} />
        <NumField label="Bawah — jumlah" value={input.nBot} error={errors.nBot} onChange={(nBot) => setInput({ nBot })} />
        <SelectField label="Bawah — diameter" value={input.dbBot} options={BAR_OPTS} onChange={(dbBot) => setInput({ dbBot })} />
        <NumField label="Samping — jumlah" value={input.nSide} error={errors.nSide} hint="Total kedua sisi (kiri = kanan)." onChange={(nSide) => setInput({ nSide })} />
        <SelectField label="Samping — diameter" value={input.dbSide} options={BAR_OPTS} onChange={(dbSide) => setInput({ dbSide })} />
      </Card>
      <Card n={4} title="Beban terfaktor">
        <NumField label="Vu — geser" unit="kN" value={input.Vu} error={errors.Vu} onChange={(Vu) => setInput({ Vu })} />
        <NumField label="Tu — torsi" unit="kN·m" value={input.Tu} error={errors.Tu} onChange={(Tu) => setInput({ Tu })} />
      </Card>
    </>
  )
}

function SectionPreview({ r, w, h: hh }: { r: ShearTorsionResult; w: number; h: number }) {
  if (w < 140 || hh < 110) return null
  const b = r.b!, h = r.h!
  const sc = Math.min((w - 200) / b, (hh - 50) / h)
  const W = b * sc, H = h * sc
  const x0 = (w - W) / 2 - 40, y0 = 24 + (hh - 50 - H) / 2
  const o = (r.cc! + r.ds! / 2) * sc
  return (
    <svg width={w} height={hh} className="bp" role="img" aria-label="Penampang geser dan torsi">
      <text x={8} y={16} className="bp-label">
        Ø{r.ds}-{r.s} ({r.nLegs} kaki) · d {fx(r.d, 0)} mm
      </text>
      <g className="bp-plate">
        <rect x={x0} y={y0} width={W} height={H} />
      </g>
      <rect x={x0 + o} y={y0 + o} width={W - 2 * o} height={H - 2 * o} fill="color-mix(in srgb, var(--dg-y) 10%, transparent)" stroke="var(--dg-m)" strokeWidth={2} rx={3} />
      {r.nLegs! > 2 &&
        Array.from({ length: r.nLegs! - 2 }, (_, k) => {
          const x = x0 + o + ((W - 2 * o) * (k + 1)) / (r.nLegs! - 1)
          return <line key={k} x1={x} y1={y0 + o} x2={x} y2={y0 + H - o} stroke="var(--dg-m)" strokeWidth={1.5} />
        })}
      {longBars(r).map((p, k) => (
        <circle key={k} cx={x0 + p.x * sc} cy={y0 + p.y * sc} r={Math.max(2.5, (p.db * sc) / 2)} fill="var(--dg-ink)" />
      ))}
      <g className="bp-dim">
        <text x={x0 + W / 2} y={y0 + H + 18} textAnchor="middle">
          {fx(b, 0)} × {fx(h, 0)} mm
        </text>
      </g>
      <g>
        <text x={x0 + W + 18} y={y0 + 18} style={{ fill: 'var(--dg-y)' }}>
          Aoh {fx(r.x1, 0)} × {fx(r.y1, 0)}
        </text>
        <text x={x0 + W + 18} y={y0 + 34} className="dg-note">
          ph {fx(r.ph, 0)} mm
        </text>
        <text x={x0 + W + 18} y={y0 + 58} className="bp-pt-label" style={{ fill: 'var(--dg-load)' }}>
          Vu {fx(r.VukN, 0)} kN
        </text>
        <text x={x0 + W + 18} y={y0 + 74} className="bp-pt-label" style={{ fill: 'var(--dg-load)' }}>
          Tu {fx(r.TukNm, 1)} kN·m
        </text>
      </g>
    </svg>
  )
}

type Tab = 'geser' | 'torsi' | 'tulangan'

function chart(r: ShearTorsionResult, tab: Tab): { bars: CapacityBar[]; note: string } {
  if (tab === 'geser')
    return {
      note: 'kN · garis = Vu',
      bars: [
        { label: 'φVc (beton)', cap: (0.75 * r.Vc!) / 1e3, dem: r.VukN!, color: 'var(--dg-v)', aux: true },
        { label: 'φVn', cap: r.phiVnkN!, dem: r.VukN!, color: 'var(--dg-m)', gov: true },
        { label: 'φ(Vc + Vs,maks)', cap: 0.75 * (r.VckN! + r.VsMaxkN!), dem: r.VukN!, color: 'var(--dg-axis)', aux: true },
      ],
    }
  if (tab === 'torsi')
    return {
      note: 'kN·m · garis = Tu',
      bars: [
        { label: 'φTth (ambang)', cap: r.phiTthkNm!, dem: r.TukNm!, color: 'var(--dg-axis)', aux: true },
        { label: 'φTn', cap: r.phiTnkNm!, dem: r.TukNm!, color: 'var(--dg-m)', gov: !r.torsionNeglig },
      ],
    }
  return {
    note: 'batang = terpasang, garis = perlu',
    bars: [
      { label: '(Av+2At)/s ×1000 (mm²/m)', cap: r.provTrans! * 1000, dem: r.demandTransGov! * 1000, color: 'var(--dg-m)' },
      { label: 'Al torsi (mm²)', cap: r.AlProv!, dem: r.AlGov!, color: 'var(--dg-y)' },
    ],
  }
}

function Results({ r, stale, reject }: { r: ShearTorsionResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('geser')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const dc = (v: number, label: string, extra?: string) => ({ label, value: fx(v, 2), sub: `${v <= 1 ? 'OK' : 'NG'}${extra ? ' · ' + extra : ''}`, tone: v <= 1 ? ('ok' as const) : ('bad' as const) })
  return (
    <Panel
      title="Kapasitas"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'geser', label: 'Geser' }, { id: 'torsi', label: 'Torsi' }, { id: 'tulangan', label: 'Tulangan' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <CapacityBars w={w} h={h} ariaLabel={`Kapasitas ${tab}`} {...chart(r, tab)} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Rasio D/C</h4>
            <StatTiles
              items={[
                dc(r.ratioV!, 'Geser Vu/φVn', `φVn ${fx(r.phiVnkN, 0)} kN`),
                r.torsionNeglig ? { label: 'Torsi', value: '—', sub: `Tu < φTth ${fx(r.phiTthkNm, 1)} kN·m (diabaikan)` } : dc(r.ratioT!, 'Torsi Tu/φTn', `φTn ${fx(r.phiTnkNm, 1)} kN·m`),
                dc(r.ratioSec!, 'Dimensi penampang'),
                dc(Math.max(r.ratioTrans!, r.ratioAl!), 'Sengkang & Al', `s maks ${fx(r.smax, 0)} mm`),
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
