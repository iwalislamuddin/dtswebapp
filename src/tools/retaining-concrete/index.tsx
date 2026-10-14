import { useMemo, useState } from 'react'
import type { ConcreteWallResult } from '../../calc/retaining-concrete'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { basePressures, stabilityRatios } from '../_retaining/common'
import { RatioChart, WallCards, WallPreview } from '../_retaining/ui'
import { computeConcrete, rejectReason, structRatios, validate, WALL_BARS, WALL_DEFAULTS, type ConcreteWallUIInput } from './model'
import { concreteWallReport } from './report'

const ID = 'retaining-concrete'

const BAR_OPTIONS = WALL_BARS.map((d) => ({ value: String(d), label: `D${d}` }))

export default function RetainingConcrete({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<ConcreteWallUIInput>(ID, WALL_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeConcrete)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? concreteWallReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input geometri, urugan, tanah fondasi, dan material untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  const f = (key: keyof ConcreteWallUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={String(input[key])} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <ToolLayout
      inputs={
        <>
          <WallCards input={input} setInput={setInput} errors={errors} n={1} body="stem" actions={<ResetButton onReset={reset} />} />
          <Card n={4} title="Beton & tulangan">
            {f('gammaC', 'γ — berat isi beton', 'kN/m³')}
            {f('fc', "f'c — mutu beton", 'MPa')}
            {f('fy', 'fy — mutu baja', 'MPa')}
            {f('coverS', 'Selimut stem', 'mm', 'Kosong/0 = 50.')}
            {f('coverF', 'Selimut tapak', 'mm', 'Kosong/0 = 75.')}
            <SelectField label="Diameter tulangan utama" value={input.dbMain} options={BAR_OPTIONS} onChange={(dbMain) => setInput({ dbMain })} />
            <SelectField label="Diameter tulangan bagi" value={input.dbDist} options={BAR_OPTIONS} onChange={(dbDist) => setInput({ dbDist })} />
          </Card>
        </>
      }
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><WallPreview r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={r} stale={stale} reject={reject} />}
    />
  )
}

type Tab = 'rasio' | 'tumpu'

/** Tekanan tumpu terfaktor sepanjang dasar tapak, dari toe (kiri) ke heel (kanan). */
function BearingChart({ r, w, h }: { r: ConcreteWallResult; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const B = r.B!
  const padL = 44, padR = 16, padT = 26, padB = 32
  const N = 60
  const pts = Array.from({ length: N + 1 }, (_, k) => ({ x: (B * k) / N, q: r.quAt!((B * k) / N) }))
  const top = Math.max(1, ...pts.map((p) => p.q)) * 1.15
  const X = (x: number) => padL + (x / B) * (w - padL - padR)
  const Y = (q: number) => h - padB - (q / top) * (h - padT - padB)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.q)}`).join(' ')
  const marks: [number, string][] = [[r.toe!, 'muka stem (toe)'], [r.xb!, 'muka belakang stem']]
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Tekanan tumpu terfaktor">
      <path d={`${d} L${X(B)},${Y(0)} L${X(0)},${Y(0)} Z`} fill="color-mix(in srgb, var(--dg-y) 28%, transparent)" stroke="var(--dg-y)" strokeWidth={1.5} />
      {marks.map(([x, lab]) => (
        <g key={lab}>
          <line x1={X(x)} y1={padT} x2={X(x)} y2={h - padB} className="dg-sup" />
          <text x={X(x)} y={h - padB + 14} textAnchor="middle" className="dg-note">
            {lab}
          </text>
        </g>
      ))}
      <text x={X(0) + 4} y={Y(pts[0].q) - 5} className="dg-readout">
        {fx(pts[0].q, 1)}
      </text>
      <text x={X(B) - 4} y={Y(pts[N].q) - 5} textAnchor="end" className="dg-readout">
        {fx(pts[N].q, 1)}
      </text>
      <text x={padL} y={14} className="dg-note">
        Tekanan tumpu terfaktor (kPa) — 1,2D + 1,6H + 1,6L{r.triU ? ' · segitiga' : ''}
      </text>
    </svg>
  )
}

function Results({ r, stale, reject }: { r: ConcreteWallResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('rasio')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const bp = r ? basePressures(r) : null
  const items = r ? [...stabilityRatios(r), ...structRatios(r)] : []
  const rb = (s: { s?: number } | undefined, on: boolean) => (on && s?.s ? String(s.s) : '—')
  return (
    <Panel
      title="Pemeriksaan"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'rasio', label: 'Rasio D/C' }, { id: 'tumpu', label: 'Tumpu terfaktor' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (!r ? null : tab === 'rasio' ? <RatioChart items={items} w={w} h={h} /> : <BearingChart r={r} w={w} h={h} />)}</Sized>
        </div>
        {r && bp && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'FS guling / geser', value: `${fx(r.FSot, 2)} / ${fx(r.FSsl, 2)}`, sub: `min ${fx(r.FSotT, 1)} / ${fx(r.FSslT, 1)}`, tone: r.okOt && r.okSl ? 'ok' : 'bad' },
                { label: 'Toe / heel', value: `${Number.isFinite(bp.toe) ? fx(bp.toe, 0) : '∞'} / ${fx(bp.heel, 0)}`, unit: 'kPa', sub: `e ${fx(r.e, 2)} · B/6 ${fx(r.B! / 6, 2)} m`, tone: r.okE ? undefined : 'bad' },
                {
                  label: 'Tulangan stem / toe / heel',
                  value: `D${fx(r.dbM, 0)}-${r.stem!.s ?? '—'}`,
                  sub: `toe ${rb(r.toeD, r.toe! > 0.01)} · heel ${rb(r.heelD, r.B! - r.xb! > 0.01)}`,
                  tone: r.okStem && r.okToe && r.okHeel ? 'ok' : 'bad',
                },
                { label: 'Beton / besi', value: fx(r.volM, 2), unit: 'm³/m', sub: `${fx(r.steelM, 0)} kg/m · ${fx(r.ratio, 0)} kg/m³` },
              ]}
            />
            {r.warn.length > 0 && (
              <ul className="results-warn">
                {r.warn.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
