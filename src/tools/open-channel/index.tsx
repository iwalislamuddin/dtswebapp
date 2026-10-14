import { useMemo, useState } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { MANNING_N } from '../../calc/open-channel'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { XYChart } from '../_hydraulics/chart'
import { fq } from '../_hydraulics/figure'
import {
  CHANNEL_DEFAULTS,
  computeChannelUI,
  energyAt,
  MAT_KEYS,
  MAT_LABEL,
  ratingCurve,
  rejectReason,
  sectionShape,
  SHAPE_LABEL,
  specificEnergy,
  usesB,
  usesM,
  validate,
  type ChannelMode,
  type ChannelOk,
  type ChannelShape,
  type ChannelUIInput,
} from './model'
import { channelReport } from './report'

const ID = 'open-channel'

export default function OpenChannel({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<ChannelUIInput>(ID, CHANNEL_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const reject = useMemo(() => rejectReason(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeChannelUI)
  const report = useMemo(() => (r ? channelReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data penampang dan aliran untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''} style={{ display: 'flex' }}><Preview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: ChannelUIInput
  setInput: (p: Partial<ChannelUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof ChannelUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  // Pindah ke Kustom: n kustom diisi dari material sebelumnya.
  const setMat = (mat: string) => setInput(mat === 'custom' && MANNING_N[input.mat] ? { mat, nman: String(MANNING_N[input.mat]) } : { mat })
  return (
    <>
      <Card n={1} title="Penampang" actions={<ResetButton onReset={onReset} />}>
        <SelectField<ChannelShape>
          label="Bentuk"
          value={input.shape}
          options={(Object.keys(SHAPE_LABEL) as ChannelShape[]).map((s) => ({ value: s, label: SHAPE_LABEL[s] }))}
          onChange={(shape) => setInput({ shape })}
        />
        {usesB(input.shape) && f('b', 'b — lebar dasar', 'm')}
        {usesM(input.shape) && f('m', 'm — kemiringan talud', 'H : 1V', 'Jarak horizontal per 1 satuan tinggi.')}
        {input.shape === 'circle' && f('D', 'D — diameter dalam', 'm')}
      </Card>
      <Card n={2} title="Kekasaran & kemiringan">
        <SelectField
          label="Material dinding (n Manning)"
          value={input.mat}
          options={[...MAT_KEYS.map((k) => ({ value: k, label: `${MAT_LABEL[k] ?? k} (${fx(MANNING_N[k], 3)})` })), { value: 'custom', label: 'Kustom' }]}
          onChange={setMat}
        />
        {input.mat === 'custom' && f('nman', 'n — koefisien Manning')}
        {f('S', 'S — kemiringan dasar', 'm/m', 'Mis. 0,001 = 1 ‰ (1 m per 1 km).')}
      </Card>
      <Card n={3} title="Kondisi aliran">
        <Field label="Mode" hint="y → Q: kapasitas pada kedalaman y · Q → y: kedalaman normal untuk debit Q.">
          <Segmented<ChannelMode>
            ariaLabel="Mode hitung"
            value={input.mode}
            options={[{ value: 'fromY', label: 'y → Q' }, { value: 'fromQ', label: 'Q → y normal' }]}
            onChange={(mode) => setInput({ mode })}
          />
        </Field>
        {input.mode === 'fromY'
          ? f('y', 'y — kedalaman air', 'm', input.shape === 'circle' ? 'Desain gravitasi lazim y/D ≤ 0,8.' : undefined)
          : f('Q', 'Q — debit rencana', 'm³/s', 'Mis. dari tool Debit Banjir Rasional.')}
      </Card>
    </>
  )
}

/** Penampang dengan muka air y, garis kedalaman kritis yc, dan dimensi. */
function Preview({ r, w, h }: { r: ChannelOk; w: number; h: number }) {
  if (w < 260 || h < 160) return null
  const sh = sectionShape(r)
  const padT = 50, padB = 40
  const sc = Math.min((w - 170) / (2 * sh.halfTop), (h - padT - padB) / sh.Hb)
  const cx = w / 2, yB = padT + sh.Hb * sc
  const P = (q: [number, number]) => `${cx + q[0] * sc},${yB - q[1] * sc}`
  const wy = yB - r.y * sc, half = r.T / 2
  const x0 = cx - sh.halfTop * sc, x1 = cx + sh.halfTop * sc
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Penampang saluran dengan muka air">
      <polygon points={sh.water.map(P).join(' ')} fill="color-mix(in srgb, var(--dg-v) 24%, transparent)" />
      <line x1={cx - half * sc} y1={wy} x2={cx + half * sc} y2={wy} stroke="var(--dg-v)" strokeWidth={1.6} />
      <polyline
        points={sh.wall.map(P).join(' ')}
        fill="none"
        stroke="var(--dg-support)"
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      {r.yc !== null && r.yc < sh.Hb && (
        <g>
          <line x1={x0 - 12} y1={yB - r.yc * sc} x2={x1 + 12} y2={yB - r.yc * sc} stroke="var(--dg-load)" strokeDasharray="5 3" />
          <text x={x1 + 16} y={yB - r.yc * sc + 4} style={{ fill: 'var(--dg-load)' }}>yc {fx(r.yc, 3)} m</text>
        </g>
      )}
      <text x={cx} y={wy - 8} textAnchor="middle" style={{ fill: 'var(--dg-v)' }}>T {fx(r.T, 3)} m</text>
      <g className="bp-dim">
        <line x1={x0 - 30} y1={wy} x2={x0 - 30} y2={yB} />
        <line x1={x0 - 36} y1={wy} x2={x0 - 24} y2={wy} />
        <line x1={x0 - 36} y1={yB} x2={x0 - 24} y2={yB} />
        <text x={x0 - 36} y={(wy + yB) / 2 + 4} textAnchor="end">y {fx(r.y, 3)}</text>
        {usesB(r.shape) && (
          <text x={cx} y={yB + 18} textAnchor="middle">b {fx(r.b, 2)} m</text>
        )}
        {r.shape === 'circle' && (
          <text x={cx} y={yB + 18} textAnchor="middle">D {fx(r.D, 3)} m · y/D {fx(r.y / r.D, 2)}</text>
        )}
        {usesM(r.shape) && (
          <text x={x1 - 4} y={yB - sh.Hb * sc - 6} textAnchor="end">1 : {fx(r.m, 2)}</text>
        )}
      </g>
      <text x={8} y={16} className="bp-label">
        {SHAPE_LABEL[r.shape]} · n {fx(r.n, 3)} · S {fx(r.S * 1000, 2)} ‰ · A {fx(r.A, 3)} m² · R {fx(r.R, 3)} m
      </text>
      <text x={8} y={h - 8} className="bp-label">
        V {fx(r.V, 2)} m/s · Q {fq(r.Q, 4)} m³/s · Fr {fx(r.Fr, 2)} ({r.regime})
      </text>
    </svg>
  )
}

type Tab = 'rating' | 'energy'

const TABS: { id: Tab; label: string }[] = [
  { id: 'rating', label: 'Kurva debit' },
  { id: 'energy', label: 'Energi spesifik' },
]

function Results({ r, stale, reject }: { r: ChannelOk | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('rating')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const fromQ = r?.mode === 'fromQ'
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : tab === 'rating' ? (
                <XYChart
                  w={w}
                  h={h}
                  title="Kurva debit Manning terhadap kedalaman"
                  series={[{ pts: ratingCurve(r), color: 'var(--dg-v)', label: 'Q(y)' }]}
                  marks={[{ x: r.Q, y: r.y, color: 'var(--dg-load)', label: `y ${fx(r.y, 3)} m · Q ${fq(r.Q, 3)}` }]}
                  xLabel="Q (m³/s)"
                  yLabel="y (m)"
                  hoverBy="y"
                  xDp={3}
                  yDp={3}
                />
              ) : (
                <XYChart
                  w={w}
                  h={h}
                  title="Energi spesifik terhadap kedalaman"
                  series={[
                    { pts: specificEnergy(r), color: 'var(--dg-m)', label: `E(y) untuk Q ${fq(r.Q, 3)} m³/s` },
                    { pts: specificEnergy(r).map((q) => [q[1], q[1]] as [number, number]), color: 'var(--dg-axis)', label: 'E = y', dash: '4 3' },
                  ]}
                  marks={[
                    { x: energyAt(r, r.y), y: r.y, color: 'var(--dg-v)', label: `normal ${fx(r.y, 3)} m` },
                    ...(r.yc !== null ? [{ x: energyAt(r, r.yc), y: r.yc, color: 'var(--dg-load)', label: `kritis ${fx(r.yc, 3)} m` }] : []),
                  ]}
                  xLabel="E (m)"
                  yLabel="y (m)"
                  hoverBy="y"
                  xDp={3}
                  yDp={3}
                />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                fromQ
                  ? { label: 'Kedalaman normal y', value: fx(r.y, 3), unit: 'm', sub: r.shape === 'circle' ? `y/D ${fx(r.y / r.D, 2)}` : `Q ${fq(r.Q, 4)} m³/s` }
                  : { label: 'Debit kapasitas Q', value: fq(r.Q, 4), unit: 'm³/s', sub: `${fx(r.Q * 1000, 0)} L/s` },
                { label: 'Kecepatan V', value: fx(r.V, 2), unit: 'm/s', sub: 'self-cleansing 0,6–3 m/s', tone: r.V < 0.6 || r.V > 3 ? 'bad' : 'ok' },
                { label: 'Froude Fr', value: fx(r.Fr, 2), sub: `${r.regime}${r.yc !== null ? ` · yc ${fx(r.yc, 3)} m` : ''}`, tone: r.Fr > 0.8 && r.Fr < 1.2 ? 'bad' : undefined },
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
