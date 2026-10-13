import { useMemo, useState } from 'react'
import type { FootingResult } from '../../calc/footing-design'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computeFootingUI, FOOTING_BARS, FOOTING_DEFAULTS, rejectReason, validate, type FootingUIInput } from './model'
import { footingRatios, footingReport } from './report'

const ID = 'footing-design'

const BAR_OPTIONS = FOOTING_BARS.map((d) => ({ value: String(d), label: `D${d}` }))

export default function FootingDesign({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<FootingUIInput>(ID, FOOTING_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeFootingUI)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? footingReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input beban, tapak, dan material untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><PlanPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: FootingUIInput
  setInput: (p: Partial<FootingUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof FootingUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Beban layan di dasar kolom" actions={<ResetButton onReset={onReset} />}>
        {f('P', 'P — aksial tekan', 'kN')}
        {f('Mx', 'Mx — momen sumbu x', 'kN·m', 'Menimbulkan eksentrisitas sepanjang B.')}
        {f('My', 'My — momen sumbu y', 'kN·m', 'Menimbulkan eksentrisitas sepanjang L.')}
        {f('Hx', 'Hx — geser arah x', 'kN')}
        {f('Hy', 'Hy — geser arah y', 'kN')}
        {f('LF', 'Faktor beban rata-rata', undefined, 'Pu = LF × P; kosong = 1,5.')}
      </Card>
      <Card n={2} title="Tapak & kolom">
        {f('L', 'L — panjang', 'm')}
        {f('B', 'B — lebar', 'm')}
        {f('tf', 't — tebal tapak', 'mm')}
        {f('Df', 'Df — kedalaman dasar', 'm')}
        {f('c1', 'c₁ — kolom sejajar L', 'mm')}
        {f('c2', 'c₂ — kolom sejajar B', 'mm')}
      </Card>
      <Card n={3} title="Tanah">
        {f('qa', 'qa — daya dukung izin', 'kPa')}
        {f('mu', 'μ — gesek dasar')}
        {f('gc', 'γ beton', 'kN/m³', 'Kosong/0 = 24.')}
        {f('gs', 'γ timbunan', 'kN/m³', 'Kosong/0 = 18.')}
      </Card>
      <Card n={4} title="Material & tulangan">
        {f('fc', "f'c — mutu beton", 'MPa')}
        {f('fy', 'fy — mutu baja', 'MPa')}
        {f('cc', 'Selimut bersih', 'mm')}
        <SelectField label="Diameter tulangan" value={input.db} options={BAR_OPTIONS} onChange={(db) => setInput({ db })} />
      </Card>
    </>
  )
}

/** Denah tapak: kolom, kern, resultan, tekanan sudut. */
function PlanPreview({ r, w, h }: { r: FootingResult; w: number; h: number }) {
  if (w < 180 || h < 140) return null
  const L = r.L!, B = r.B!
  const padX = 74, padY = 36
  const sc = Math.min((w - 2 * padX) / L, (h - 2 * padY) / B)
  const W = L * sc, H = B * sc
  const cx = w / 2, cy = h / 2
  const X = (m: number) => cx + m * sc
  const Y = (m: number) => cy - m * sc
  const q = r.qc!
  const col = (s: number) => (s > r.qa! ? 'var(--danger)' : 'var(--dg-ink)')
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Denah tapak dan tekanan tanah">
      <g className="bp-plate">
        <rect x={cx - W / 2} y={cy - H / 2} width={W} height={H} />
      </g>
      <rect x={X(-r.c1! / 2)} y={Y(r.c2! / 2)} width={r.c1! * sc} height={r.c2! * sc} fill="color-mix(in srgb, var(--dg-ink) 35%, transparent)" stroke="var(--dg-ink)" />
      <path d={`M${X(-L / 6)},${Y(0)} L${X(0)},${Y(B / 6)} L${X(L / 6)},${Y(0)} L${X(0)},${Y(-B / 6)} Z`} fill="none" stroke="var(--dg-axis)" strokeDasharray="4 3" />
      <circle cx={X(r.ex!)} cy={Y(r.ey!)} r={4} fill={r.uplift ? 'var(--danger)' : 'var(--dg-load)'} />
      <text x={X(r.ex!) + 7} y={Y(r.ey!) - 6} style={{ fill: r.uplift ? 'var(--danger)' : 'var(--dg-load)' }}>
        resultan
      </text>
      <text x={cx - W / 2 - 6} y={cy - H / 2 + 12} textAnchor="end" style={{ fill: col(q.mp) }}>{fx(q.mp, 1)}</text>
      <text x={cx - W / 2 - 6} y={cy + H / 2} textAnchor="end" style={{ fill: col(q.mm) }}>{fx(q.mm, 1)}</text>
      <text x={cx + W / 2 + 6} y={cy - H / 2 + 12} style={{ fill: col(q.pp) }}>{fx(q.pp, 1)}</text>
      <text x={cx + W / 2 + 6} y={cy + H / 2} style={{ fill: col(q.pm) }}>{fx(q.pm, 1)}</text>
      <g className="bp-dim">
        <line x1={cx - W / 2} y1={cy + H / 2 + 14} x2={cx + W / 2} y2={cy + H / 2 + 14} />
        <text x={cx} y={cy + H / 2 + 27} textAnchor="middle">
          L {fx(L, 2)} m
        </text>
        <line x1={cx - W / 2 - 40} y1={cy - H / 2} x2={cx - W / 2 - 40} y2={cy + H / 2} />
        <text x={cx - W / 2 - 44} y={cy + 4} textAnchor="end">
          B {fx(B, 2)} m
        </text>
      </g>
      <text x={8} y={16} className="bp-label">
        Tekanan sudut (kPa) · kern putus-putus
      </text>
    </svg>
  )
}

type Tab = 'rasio' | 'tekanan'

/** Batang rasio D/C; garis 1,0 = batas. */
function RatioChart({ r, w, h }: { r: FootingResult; w: number; h: number }) {
  const items = footingRatios(r)
  if (w < 200 || h < 100) return null
  const padL = Math.min(190, w * 0.4), padR = 40, padT = 16, padB = 26
  const rowH = Math.min(30, (h - padT - padB) / items.length)
  const maxV = Math.max(1.2, ...items.map((x) => x.ratio)) * 1.05
  const X = (v: number) => padL + (v / maxV) * (w - padL - padR)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Rasio kebutuhan terhadap kapasitas">
      {items.map((it, k) => {
        const y = padT + k * rowH
        const bad = it.ratio > 1
        const color = bad ? 'var(--danger)' : it.ratio > 0.9 ? 'var(--warning)' : 'var(--dg-v)'
        return (
          <g key={it.label}>
            <text x={padL - 8} y={y + rowH / 2 + 4} textAnchor="end" className="dg-bar-label">
              {it.label}
            </text>
            <rect x={padL} y={y + rowH * 0.2} width={Math.max(2, X(it.ratio) - padL)} height={rowH * 0.6} rx={2} fill={`color-mix(in srgb, ${color} 45%, transparent)`} stroke={color} />
            <text x={X(it.ratio) + 6} y={y + rowH / 2 + 4} className="val">
              {fx(it.ratio, 2)}
            </text>
          </g>
        )
      })}
      <line x1={X(1)} y1={padT - 4} x2={X(1)} y2={padT + items.length * rowH} stroke="var(--danger)" strokeDasharray="5 3" />
      <text x={padL} y={h - 8} className="dg-note">
        Kebutuhan ÷ kapasitas — garis merah = 1,0 (batas)
      </text>
    </svg>
  )
}

/** Tekanan tanah di empat sudut terhadap qa. */
function PressureChart({ r, w, h }: { r: FootingResult; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const q = r.qc!
  const items = [
    { l: '(+x, +y)', v: q.pp },
    { l: '(+x, −y)', v: q.pm },
    { l: '(−x, +y)', v: q.mp },
    { l: '(−x, −y)', v: q.mm },
  ]
  const padL = 48, padR = 16, padT = 22, padB = 30
  const top = Math.max(r.qa!, ...items.map((i) => i.v)) * 1.15
  const bw = (w - padL - padR) / items.length
  const Y = (v: number) => h - padB - (Math.max(0, v) / top) * (h - padT - padB)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Tekanan tanah di sudut">
      {items.map((it, k) => {
        const color = it.v > r.qa! ? 'var(--danger)' : it.v < 0 ? 'var(--warning)' : 'var(--dg-v)'
        return (
          <g key={it.l}>
            <rect x={padL + k * bw + bw * 0.15} y={Y(it.v)} width={bw * 0.7} height={Math.max(1, h - padB - Y(it.v))} fill={`color-mix(in srgb, ${color} 40%, transparent)`} stroke={color} />
            <text x={padL + k * bw + bw / 2} y={Y(it.v) - 5} textAnchor="middle" className="dg-readout">
              {fx(it.v, 1)}
            </text>
            <text x={padL + k * bw + bw / 2} y={h - padB + 14} textAnchor="middle" className="dg-note">
              {it.l}
            </text>
          </g>
        )
      })}
      <line x1={padL} y1={Y(r.qa!)} x2={w - padR} y2={Y(r.qa!)} stroke="var(--danger)" strokeDasharray="5 3" />
      <text x={w - padR} y={Y(r.qa!) - 4} textAnchor="end" className="dg-note">
        qa {fx(r.qa, 0)}
      </text>
      <text x={padL} y={14} className="dg-note">
        Tekanan tanah layan di sudut (kPa)
      </text>
    </svg>
  )
}

function Results({ r, stale, reject }: { r: FootingResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('rasio')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  return (
    <Panel
      title="Pemeriksaan"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'rasio', label: 'Rasio D/C' }, { id: 'tekanan', label: 'Tekanan tanah' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (!r ? null : tab === 'rasio' ? <RatioChart r={r} w={w} h={h} /> : <PressureChart r={r} w={w} h={h} />)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'qmax / qa', value: `${fx(r.qmax, 1)} / ${fx(r.qa, 0)}`, unit: 'kPa', sub: `SF ${fx(r.SFbear, 2)}`, tone: r.qmax! <= r.qa! ? 'ok' : 'bad' },
                { label: 'Tulangan L / B', value: `D${fx(r.db, 0)}-${r.flexL!.s} / ${r.flexB!.s}`, sub: `As ${fx(r.flexL!.AsProv, 0)} / ${fx(r.flexB!.AsProv, 0)} mm²/m` },
                { label: 'Pons Vu / φVc', value: `${fx(r.Vup, 0)} / ${fx(r.phiVcp, 0)}`, unit: 'kN', sub: `D/C ${fx(r.dcPunch, 2)}`, tone: r.dcPunch! <= 1 ? 'ok' : 'bad' },
                { label: 'Geser 1 arah D/C', value: `${fx(r.dc1L, 2)} / ${fx(r.dc1B, 2)}`, sub: 'L / B', tone: Math.max(r.dc1L!, r.dc1B!) <= 1 ? 'ok' : 'bad' },
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
