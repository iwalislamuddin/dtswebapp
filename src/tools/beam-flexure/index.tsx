import { useMemo, useState } from 'react'
import { computeBeamFlexure, type BeamFlexureResult } from '../../calc/beam-flexure'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { BEAM_BARS, BEAM_FLEX_DEFAULTS, computeBeamFlex, rejectReason, toCalcInput, validate, type BeamFlexInput } from './model'
import { barLayout, beamFlexReport } from './report'

const ID = 'beam-flexure'

interface Outcome {
  i: BeamFlexInput
  r: BeamFlexureResult
}

const BAR_OPTIONS = BEAM_BARS.map((d) => ({ value: String(d), label: `D${d}` }))

export default function BeamFlexure({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BeamFlexInput>(ID, BEAM_FLEX_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: BeamFlexInput): Outcome | null => {
    const r = computeBeamFlex(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (result ? beamFlexReport(result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input penampang dan tulangan untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><SectionPreview r={result.r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results o={result} stale={stale} reject={reject} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: BeamFlexInput
  setInput: (p: Partial<BeamFlexInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  return (
    <>
      <Card n={1} title="Material & penampang" actions={<ResetButton onReset={onReset} />}>
        <NumField label="f'c — mutu beton" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy — mutu baja" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        <NumField label="b — lebar" unit="mm" value={input.b} error={errors.b} onChange={(b) => setInput({ b })} />
        <NumField label="h — tinggi total" unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />
        <NumField label="Selimut bersih" unit="mm" value={input.cc} error={errors.cc} onChange={(cc) => setInput({ cc })} />
        <NumField label="Diameter sengkang" unit="mm" value={input.ds} error={errors.ds} onChange={(ds) => setInput({ ds })} />
      </Card>
      <Card n={2} title="Tulangan tarik">
        <NumField label="Jumlah batang (total)" value={input.n1} error={errors.n1} onChange={(n1) => setInput({ n1 })} />
        <SelectField label="Diameter" value={input.db1} options={BAR_OPTIONS} onChange={(db1) => setInput({ db1 })} />
        <Field label="Jumlah lapis" hint="Sisa batang ditaruh di lapis bawah.">
          <Segmented
            ariaLabel="Jumlah lapis"
            value={input.nLay}
            options={[
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
            ]}
            onChange={(nLay) => setInput({ nLay })}
          />
        </Field>
        {input.nLay !== '1' && (
          <NumField label="Spasi bersih antar lapis" unit="mm" value={input.sv} error={errors.sv} hint="≥ 25 mm (Ps. 25.2.2); 0 = 25." onChange={(sv) => setInput({ sv })} />
        )}
      </Card>
      <Card n={3} title="Tulangan tekan">
        <Field label="Tulangan rangkap">
          <Segmented
            ariaLabel="Tulangan rangkap"
            value={input.doubly}
            options={[
              { value: 'no', label: 'Tidak' },
              { value: 'yes', label: 'Ya' },
            ]}
            onChange={(doubly) => setInput({ doubly })}
          />
        </Field>
        {input.doubly === 'yes' && (
          <>
            <NumField label="Jumlah batang tekan" value={input.n2} error={errors.n2} onChange={(n2) => setInput({ n2 })} />
            <SelectField label="Diameter tekan" value={input.db2} options={BAR_OPTIONS} onChange={(db2) => setInput({ db2 })} />
          </>
        )}
      </Card>
    </>
  )
}

/** Penampang (batang per lapis, sengkang, blok tegangan a, sumbu netral c) + diagram regangan. */
function SectionPreview({ r, w, h: hh }: { r: BeamFlexureResult; w: number; h: number }) {
  if (w < 160 || hh < 110) return null
  const b = r.b!, h = r.h!
  const secW = Math.min(w * 0.55, 300)
  const sc = Math.min((secW - 90) / b, (hh - 50) / h)
  const W = b * sc, H = h * sc
  const x0 = 60 + (secW - 90 - W) / 2, y0 = 24 + (hh - 50 - H) / 2
  const L = barLayout(r)
  const off = (r.cc! + r.ds! / 2) * sc
  const yc = y0 + r.c! * sc, yt = y0 + r.dt! * sc
  const sx0 = secW + (w - secW) * 0.45
  const kE = Math.min((w - secW) * 0.35, 90) / Math.max(0.003, Math.abs(r.et!))
  return (
    <svg width={w} height={hh} className="bp" role="img" aria-label="Penampang balok dan regangan">
      <g className="bp-plate">
        <rect x={x0} y={y0} width={W} height={H} />
      </g>
      <rect x={x0 + off} y={y0 + off} width={W - 2 * off} height={H - 2 * off} fill="none" stroke="var(--dg-axis)" rx={3} />
      <rect x={x0} y={y0} width={W} height={r.a! * sc} fill="color-mix(in srgb, var(--dg-m) 25%, transparent)" />
      <line x1={x0 - 10} y1={yc} x2={x0 + W + 10} y2={yc} stroke="var(--dg-y)" strokeDasharray="6 3" />
      {[...L.tension, ...L.comp].map((p, k) => (
        <circle key={k} cx={x0 + p.x * sc} cy={y0 + p.y * sc} r={Math.max(2.5, (p.db * sc) / 2)} fill="var(--dg-ink)" />
      ))}
      <text x={x0 + W + 12} y={yc + 4} style={{ fill: 'var(--dg-y)' }}>
        c {fx(r.c, 1)}
      </text>
      <text x={x0 + W + 12} y={y0 + Math.max(10, (r.a! * sc) / 2 + 4)} style={{ fill: 'var(--dg-m)' }}>
        a {fx(r.a, 1)}
      </text>
      <g className="bp-dim">
        <line x1={x0} y1={y0 + H + 12} x2={x0 + W} y2={y0 + H + 12} />
        <text x={x0 + W / 2} y={y0 + H + 25} textAnchor="middle">
          b {fx(b, 0)}
        </text>
        <line x1={x0 - 14} y1={y0} x2={x0 - 14} y2={y0 + H} />
        <text x={x0 - 18} y={y0 + H / 2 + 4} textAnchor="end">
          h {fx(h, 0)}
        </text>
      </g>
      <text x={8} y={16} className="bp-label">
        {r.n1}D{fx(r.db1, 0)}
        {r.doubly && r.n2! > 0 ? ` + ${r.n2}D${fx(r.db2, 0)}` : ''} · d {fx(r.d, 0)} mm
      </text>
      {w >= 360 && (
        <g>
          <line x1={sx0} y1={y0} x2={sx0} y2={y0 + H} stroke="var(--dg-axis)" />
          <path d={`M${sx0},${y0} L${sx0 - 0.003 * kE},${y0} L${sx0},${yc} Z`} fill="color-mix(in srgb, var(--dg-m) 30%, transparent)" />
          <path d={`M${sx0},${yc} L${sx0 + r.et! * kE},${yt} L${sx0},${yt} Z`} fill="color-mix(in srgb, var(--dg-y) 30%, transparent)" />
          <line x1={sx0 - 0.003 * kE} y1={y0} x2={sx0 + r.et! * kE} y2={yt} stroke="var(--dg-ink)" />
          <text x={sx0 - 0.003 * kE} y={y0 - 6} textAnchor="middle" className="dg-note">
            εcu 0,003
          </text>
          <text x={sx0 + r.et! * kE} y={yt + 16} textAnchor="middle" style={{ fill: 'var(--dg-y)' }}>
            εt {fx(r.et, 4)}
          </text>
        </g>
      )}
    </svg>
  )
}

type Tab = 'jumlah' | 'phi'

/** φMn untuk jumlah batang 1…nMax (diameter & lapis sama) — bantuan memilih tulangan. */
function CountChart({ o, w, h }: { o: Outcome; w: number; h: number }) {
  const nMax = Math.max(8, Number(o.i.n1) + 3)
  const pts = useMemo(() => {
    const base = toCalcInput(o.i)
    return Array.from({ length: nMax }, (_, k) => {
      const r = computeBeamFlexure({ ...base, n1: k + 1 })
      return { n: k + 1, M: r.valid ? r.phiMnkNm! : 0, et: r.et ?? 0 }
    })
  }, [o.i, nMax])
  if (w < 160 || h < 100) return null
  const padL = 48, padR = 12, padT = 22, padB = 30
  const top = Math.max(...pts.map((p) => p.M)) * 1.1 || 1
  const bw = (w - padL - padR) / nMax
  const Y = (m: number) => h - padB - (m / top) * (h - padT - padB)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="φMn terhadap jumlah batang">
      {[0, 0.5, 1].map((k) => (
        <g key={k} className="dg-axis">
          <line x1={padL} y1={Y(k * top)} x2={w - padR} y2={Y(k * top)} style={{ stroke: 'var(--dg-grid)' }} />
          <text x={padL - 6} y={Y(k * top) + 4} textAnchor="end">
            {fx(k * top, 0)}
          </text>
        </g>
      ))}
      {pts.map((p, k) => {
        const sel = p.n === o.r.n1
        const color = p.et >= 0.005 ? 'var(--dg-v)' : p.et >= 0.004 ? 'var(--warning)' : 'var(--danger)'
        return (
          <g key={p.n}>
            <rect x={padL + k * bw + bw * 0.15} y={Y(p.M)} width={bw * 0.7} height={h - padB - Y(p.M)} fill={`color-mix(in srgb, ${color} ${sel ? 80 : 35}%, transparent)`} stroke={color} />
            <text x={padL + k * bw + bw / 2} y={h - padB + 14} textAnchor="middle" className="dg-note" style={sel ? { fontWeight: 700 } : undefined}>
              {p.n}
            </text>
            {sel && (
              <text x={padL + k * bw + bw / 2} y={Y(p.M) - 5} textAnchor="middle" className="dg-readout">
                {fx(p.M, 1)}
              </text>
            )}
          </g>
        )
      })}
      <text x={padL} y={14} className="dg-note">
        φMn (kN·m) per jumlah batang D{o.i.db1} · hijau εt ≥ 0,005 · kuning transisi · merah εt &lt; 0,004
      </text>
    </svg>
  )
}

/** Kurva φ–εt (21.2.2) dengan titik desain. */
function PhiCurve({ r, w, h }: { r: BeamFlexureResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const padL = 48, padR = 16, padT = 20, padB = 30
  const eMax = Math.max(0.008, r.et! * 1.15)
  const X = (e: number) => padL + (Math.max(0, e) / eMax) * (w - padL - padR)
  const Y = (p: number) => h - padB - ((p - 0.6) / 0.35) * (h - padT - padB)
  const ey = r.ey!
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Faktor reduksi terhadap regangan">
      {[ey, 0.004, 0.005].map((e, k) => (
        <g key={k}>
          <line x1={X(e)} y1={padT} x2={X(e)} y2={h - padB} className="dg-sup" />
          <text x={X(e)} y={h - padB + 14} textAnchor="middle" className="dg-note">
            {k === 0 ? 'εty' : fx(e, 3)}
          </text>
        </g>
      ))}
      {[0.65, 0.9].map((p) => (
        <text key={p} x={padL - 6} y={Y(p) + 4} textAnchor="end" className="dg-note">
          {fx(p, 2)}
        </text>
      ))}
      <path d={`M${X(0)},${Y(0.65)} L${X(ey)},${Y(0.65)} L${X(0.005)},${Y(0.9)} L${X(eMax)},${Y(0.9)}`} fill="none" stroke="var(--dg-m)" strokeWidth={2} />
      <g className="dg-ext">
        <circle cx={X(r.et!)} cy={Y(r.phi!)} r={5} fill="var(--bg)" stroke={r.et! >= 0.004 ? 'var(--dg-load)' : 'var(--danger)'} strokeWidth={2.2} />
        <text x={X(r.et!) + (r.et! > eMax * 0.6 ? -8 : 8)} y={Y(r.phi!) + (r.phi! > 0.85 ? 18 : -8)} textAnchor={r.et! > eMax * 0.6 ? 'end' : 'start'}>
          φ {fx(r.phi, 3)} · εt {fx(r.et, 4)}
        </text>
      </g>
      <text x={padL} y={14} className="dg-note">
        φ (sengkang ikat) terhadap εt
      </text>
    </svg>
  )
}

function Results({ o, stale, reject }: { o: Outcome | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('jumlah')
  const r = o?.r
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  return (
    <Panel
      title="Kapasitas"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'jumlah', label: 'φMn vs jumlah' }, { id: 'phi', label: 'φ–εt' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (!o || !r ? null : tab === 'jumlah' ? <CountChart o={o} w={w} h={h} /> : <PhiCurve r={r} w={w} h={h} />)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'φMn', value: fx(r.phiMnkNm, 1), unit: 'kN·m', sub: `Mn ${fx(r.MnkNm, 1)} · φ ${fx(r.phi, 3)}` },
                { label: 'Regangan εt', value: fx(r.et, 4), sub: r.cls, tone: r.et! >= 0.005 ? 'ok' : r.et! < 0.004 ? 'bad' : undefined },
                { label: 'As / As,min', value: `${fx(r.As, 0)} / ${fx(r.Asmin, 0)}`, unit: 'mm²', sub: r.belowMin ? '< As,min' : 'memenuhi', tone: r.belowMin ? 'bad' : 'ok' },
                { label: 'c / a / d', value: `${fx(r.c, 0)} / ${fx(r.a, 0)} / ${fx(r.d, 0)}`, unit: 'mm' },
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
