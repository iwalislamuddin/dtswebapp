import { useMemo, useState } from 'react'
import type { StairResult } from '../../calc/concrete-stair'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Curve, XAxis, type DiagramFrame } from '../../ui/diagram'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computeStairUI, forceDiagram, rejectReason, STAIR_BARS, STAIR_DEFAULTS, SUPPORTS, validate, type StairUIInput } from './model'
import { stairReport } from './report'

const ID = 'concrete-stair'

export default function ConcreteStair({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<StairUIInput>(ID, STAIR_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeStairUI)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? stairReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input geometri, beban, dan material untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><Elevation r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: StairUIInput
  setInput: (p: Partial<StairUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  return (
    <>
      <Card n={1} title="Geometri" actions={<ResetButton onReset={onReset} />}>
        <NumField label="L₁ — bordes bawah" unit="m" value={input.L1} error={errors.L1} hint="0 = tanpa bordes bawah." onChange={(L1) => setInput({ L1 })} />
        <NumField label="L₂ — flight (proyeksi horizontal)" unit="m" value={input.L2} error={errors.L2} onChange={(L2) => setInput({ L2 })} />
        <NumField label="L₃ — bordes atas" unit="m" value={input.L3} error={errors.L3} hint="0 = tanpa bordes atas." onChange={(L3) => setInput({ L3 })} />
        <NumField label="H — beda tinggi flight" unit="m" value={input.H} error={errors.H} onChange={(H) => setInput({ H })} />
        <NumField label="R — tinggi injakan" unit="mm" value={input.R} error={errors.R} hint="Untuk jumlah injakan & berat anak tangga; going dihitung dari L₂." onChange={(R) => setInput({ R })} />
        <NumField label="tw — tebal pelat (waist)" unit="mm" value={input.tw} error={errors.tw} onChange={(tw) => setInput({ tw })} />
        <SelectField label="Tumpuan A (bawah)" value={input.supA} options={SUPPORTS} onChange={(supA) => setInput({ supA })} />
        <SelectField label="Tumpuan B (atas)" value={input.supB} options={SUPPORTS} onChange={(supB) => setInput({ supB })} />
      </Card>
      <Card n={2} title="Beban">
        <NumField label="qD — mati tambahan (finishing)" unit="kN/m²" value={input.SDL} error={errors.SDL} hint="Berat pelat & anak tangga dihitung otomatis (24 kN/m³)." onChange={(SDL) => setInput({ SDL })} />
        <NumField label="qL — beban hidup" unit="kN/m²" value={input.LL} error={errors.LL} hint="SNI 1727: hunian 1,92 · umum 4,79 kN/m²." onChange={(LL) => setInput({ LL })} />
      </Card>
      <Card n={3} title="Material & tulangan">
        <NumField label="f'c" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        <NumField label="Selimut bersih" unit="mm" value={input.cc} error={errors.cc} onChange={(cc) => setInput({ cc })} />
        <SelectField label="Ø tulangan utama" value={input.db} options={STAIR_BARS.map((d) => ({ value: String(d), label: `D${d}` }))} onChange={(db) => setInput({ db })} />
      </Card>
    </>
  )
}

/** Elevasi tangga: bordes, anak tangga, tumpuan, dimensi. */
function Elevation({ r, w, h }: { r: StairResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const Ltot = r.Ltot! * 1000, H = r.H! * 1000
  const sc = Math.min((w - 110) / Ltot, (h - 76) / H)
  const x0 = 50, yB = 30 + H * sc + (h - 76 - H * sc) / 2
  const P = (x: number, y: number) => [x0 + x * sc, yB - y * sc] as const
  const n = r.nodes!
  const line = n.map((p) => P(p[0], p[1]).join(',')).join(' ')
  const xa = r.L1! * 1000
  const steps: string[] = [P(xa, 0).join(',')]
  for (let k = 0; k < r.Nrise!; k++) steps.push(P(xa + k * r.Tgo!, (k + 1) * r.Ract!).join(','), P(xa + (k + 1) * r.Tgo!, (k + 1) * r.Ract!).join(','))
  const sup = (idx: number, kind: string) => {
    const [x, y] = P(n[idx][0], n[idx][1])
    if (kind === 'jepit') return <line key={idx} x1={x} y1={y - 10} x2={x} y2={y + 10} stroke="var(--dg-support)" strokeWidth={4} />
    return (
      <g key={idx} className="bp-support">
        <path d={`M${x},${y + 2} l-8,12 h16 Z`} />
        {kind === 'rol' && <line x1={x - 11} y1={y + 18} x2={x + 11} y2={y + 18} />}
      </g>
    )
  }
  let acc = 0
  const dims = [r.L1!, r.L2!, r.L3!].map((L, k) => {
    const a = acc
    acc += L
    return L > 1e-6 ? (
      <g key={k} className="bp-dim">
        <line x1={x0 + a * 1000 * sc} y1={yB + 30} x2={x0 + (a + L) * 1000 * sc} y2={yB + 30} />
        <text x={x0 + (a + L / 2) * 1000 * sc} y={yB + 26} textAnchor="middle">
          {fx(L, 2)} m
        </text>
      </g>
    ) : null
  })
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Elevasi tangga">
      <text x={8} y={16} className="bp-label">
        {r.Nrise} injakan · R {fx(r.Ract, 0)} / G {fx(r.Tgo, 0)} mm · θ {fx(r.thetaDeg, 1)}° · tw {fx(r.tw, 0)} mm
      </text>
      <polyline points={steps.join(' ')} fill="none" stroke="var(--dg-axis)" />
      <polyline points={line} fill="none" stroke="var(--dg-ink)" strokeWidth={Math.max(3, r.tw! * sc)} strokeLinejoin="round" opacity={0.85} />
      {sup(r.idxA!, r.supA!)}
      {sup(r.idxB!, r.supB!)}
      {dims}
      <text x={P(Ltot, H)[0] + 8} y={yB - (H * sc) / 2} className="dg-note">
        H {fx(r.H, 2)} m
      </text>
    </svg>
  )
}

type Tab = 'momen' | 'geser' | 'aksial'

function Diagram({ r, tab, w, h }: { r: StairResult; tab: Tab; w: number; h: number }) {
  const key = tab === 'momen' ? 'Ms' : tab === 'geser' ? 'Vs' : 'Ns'
  const pts = useMemo(() => forceDiagram(r, key), [r, key])
  if (w < 160 || h < 100) return null
  const f: DiagramFrame = { w, h, padL: 36, padR: 36, padT: 30, padB: 40, x0: 0, x1: r.Ltot! }
  const ext = pts.reduce((a, p) => (Math.abs(p[1]) > Math.abs(a[1]) ? p : a), pts[0])
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={`Diagram ${tab}`}>
      <Curve f={f} pts={pts} color={tab === 'momen' ? 'var(--dg-m)' : tab === 'geser' ? 'var(--dg-v)' : 'var(--dg-y)'} unit={tab === 'momen' ? 'kN·m' : 'kN'} dp={2} downPositive={tab === 'momen'} extreme={{ x: ext[0], v: ext[1] }} hover={null} />
      <XAxis f={f} y={h - f.padB + 6} unit="m" />
      <text x={f.padL} y={16} className="dg-note">
        per meter lebar, terhadap jarak horizontal · beban terfaktor
      </text>
    </svg>
  )
}

function Results({ r, stale, reject }: { r: StairResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('momen')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  return (
    <Panel
      title="Gaya dalam"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'momen', label: 'Momen' }, { id: 'geser', label: 'Geser' }, { id: 'aksial', label: 'Aksial' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <Diagram r={r} tab={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Tulangan utama bawah', value: `D${r.db}-${r.asPos!.s}`, sub: `Mu+ ${fx(r.Mpos, 2)} kN·m/m` },
                { label: 'Tulangan atas / bagi', value: `${r.Mneg! > 0.005 ? `D${r.db}-${r.asNeg!.s}` : '—'} / D${r.dbDist}-${r.asDist!.s}`, sub: `Mu− ${fx(r.Mneg, 2)} kN·m/m` },
                { label: 'Geser Vu/φVc', value: fx(r.dcrVc, 2), sub: `φVc ${fx(r.phiVc, 1)} kN/m`, tone: r.dcrVc! <= 1 ? 'ok' : 'bad' },
                { label: 'Lendutan', value: fx(r.dCr, 1), unit: 'mm', sub: `≤ L/360 = ${fx(r.limit360, 1)}`, tone: r.defOk ? 'ok' : 'bad' },
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
