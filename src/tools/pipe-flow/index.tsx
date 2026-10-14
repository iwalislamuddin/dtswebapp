import { useMemo, useState } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { PIPE_MATERIALS } from '../../calc/pipe-flow'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { expo, XYChart } from '../_hydraulics/chart'
import { fq } from '../_hydraulics/figure'
import { computePipeUI, MAT_KEYS, moodyCurve, PIPE_DEFAULTS, systemCurve, validate, type PipeOk, type PipeUIInput } from './model'
import { gradeLines, pipeReport } from './report'

const ID = 'pipe-flow'

export default function PipeFlow({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<PipeUIInput>(ID, PIPE_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computePipeUI)
  const report = useMemo(() => (r ? pipeReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data pipa dan aliran untuk melihat detail perhitungan."
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
      results={<Results r={r} stale={stale} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: PipeUIInput
  setInput: (p: Partial<PipeUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof PipeUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  // Pindah ke Kustom: ε & C diisi dari material sebelumnya.
  const setMat = (mat: string) => {
    const p = PIPE_MATERIALS[input.mat]
    setInput(mat === 'custom' && p ? { mat, eps: String(p.eps), C: String(p.C) } : { mat })
  }
  return (
    <>
      <Card n={1} title="Pipa" actions={<ResetButton onReset={onReset} />}>
        {f('D', 'D — diameter dalam', 'mm', 'Diameter dalam aktual (bukan diameter nominal).')}
        {f('Lp', 'L — panjang pipa', 'm')}
        <SelectField
          label="Material"
          value={input.mat}
          options={[
            ...MAT_KEYS.map((k) => ({ value: k, label: `${PIPE_MATERIALS[k].label} (ε ${PIPE_MATERIALS[k].eps} mm, C ${PIPE_MATERIALS[k].C})` })),
            { value: 'custom', label: 'Kustom' },
          ]}
          onChange={setMat}
        />
        {input.mat === 'custom' && (
          <>
            {f('eps', 'ε — kekasaran absolut', 'mm')}
            {f('C', 'C — koefisien Hazen–Williams')}
          </>
        )}
      </Card>
      <Card n={2} title="Aliran">
        {f('Q', 'Q — debit', 'L/s')}
        {f('sumK', 'ΣK — koefisien kehilangan minor', undefined, 'Mis. inlet 0,5 + outlet 1,0 + belokan 90° 0,3–0,9 + katup gerbang terbuka 0,2.')}
        {f('nu', 'ν — viskositas kinematik', '×10⁻⁶ m²/s', 'Air 20 °C: 1,004 · 25 °C: 0,893 · 30 °C: 0,801.')}
      </Card>
    </>
  )
}

/** Profil memanjang pipa dengan garis energi (EGL) & hidraulik (HGL). */
function Preview({ r, w, h }: { r: PipeOk; w: number; h: number }) {
  if (w < 260 || h < 160) return null
  const gl = gradeLines(r)
  const x0 = 96, x1 = w - 96, yP = h - 54, yTop = 46
  const sc = (yP - 24 - yTop) / (gl.top || 1)
  const Y = (v: number) => yP - 24 - v * sc
  const X = (t: number) => x0 + t * (x1 - x0)
  const line = (pts: [number, number][]) => pts.map(([t, v]) => `${X(t)},${Y(v)}`).join(' ')
  const yMid = (Y(gl.top - r.hm) + Y(r.hv)) / 2
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Profil pipa dengan garis energi dan garis hidraulik">
      <g className="bp-plate">
        <rect x={x0} y={yP - 7} width={x1 - x0} height={14} />
      </g>
      <line x1={x0 + 30} y1={yP} x2={x1 - 30} y2={yP} stroke="var(--dg-v)" strokeWidth={1.4} strokeDasharray="10 6" />
      <polyline points={line(gl.egl)} fill="none" stroke="var(--dg-m)" strokeWidth={2} />
      <polyline points={line(gl.hgl)} fill="none" stroke="var(--dg-v)" strokeWidth={2} strokeDasharray="6 3" />
      <line x1={x0 - 8} y1={Y(gl.top)} x2={x1 + 8} y2={Y(gl.top)} stroke="var(--dg-axis)" strokeDasharray="2 3" />
      <text x={x1 + 6} y={Y(r.hv) - 4} style={{ fill: 'var(--dg-m)' }}>EGL</text>
      <text x={x1 + 6} y={Y(0) + 12} style={{ fill: 'var(--dg-v)' }}>HGL</text>
      <g className="bp-dim">
        <text x={x0 - 8} y={(Y(gl.top) + Y(gl.top - r.hm)) / 2 + 4} textAnchor="end">hm {fx(r.hm, 3)} m</text>
        <text x={X(0.55)} y={yMid - 8} textAnchor="middle">hf {fx(r.hf, 3)} m · {fx(r.gradient, 1)} m/km</text>
        <text x={(x0 + x1) / 2} y={yP + 24} textAnchor="middle">
          L {fx(r.Lp, 0)} m · Ø {fx(r.D * 1000, 0)} mm · {r.matLabel}
        </text>
      </g>
      <text x={8} y={16} className="bp-label">
        Q {fq(r.Q * 1000, 3)} L/s · V {fx(r.V, 2)} m/s · Re {fx(r.Re, 0)} ({r.regime}) · f {fx(r.f, 4)}
      </text>
      <text x={8} y={32} className="bp-label">Kehilangan total h {fx(r.hTot, 3)} m · EGL − HGL = V²/2g {fx(r.hv, 3)} m (minor digambar terpusat di hulu)</text>
    </svg>
  )
}

type Tab = 'system' | 'moody'

const TABS: { id: Tab; label: string }[] = [
  { id: 'system', label: 'Kurva sistem' },
  { id: 'moody', label: 'Moody' },
]

function Results({ r, stale }: { r: PipeOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('system')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  const sys = useMemo(() => (r ? systemCurve(r) : null), [r])
  const moody = useMemo(() => (r ? moodyCurve(r) : null), [r])
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r || !sys || !moody ? null : tab === 'system' ? (
                <XYChart
                  w={w}
                  h={h}
                  title="Kehilangan energi terhadap debit"
                  series={[
                    { pts: sys.Q.map((q, k) => [q, sys.hTot[k]]), color: 'var(--dg-m)', label: 'hf + hm' },
                    { pts: sys.Q.map((q, k) => [q, sys.hf[k]]), color: 'var(--dg-v)', label: 'hf Darcy' },
                    { pts: sys.Q.map((q, k) => [q, sys.hw[k]]), color: 'var(--dg-y)', label: 'hf Hazen–Williams', dash: '5 3' },
                  ]}
                  marks={[{ x: r.Q * 1000, y: r.hTot, color: 'var(--dg-load)', label: `Q ${fq(r.Q * 1000, 3)} L/s · h ${fx(r.hTot, 2)} m` }]}
                  xLabel="Q (L/s)"
                  yLabel="h (m)"
                  xDp={2}
                  yDp={3}
                />
              ) : (
                <XYChart
                  w={w}
                  h={h}
                  title="Faktor gesek terhadap bilangan Reynolds"
                  series={[
                    { pts: moody.Re.map((re, k) => [re, moody.f[k]]), color: 'var(--dg-v)', label: `ε/D ${expo(r.eps / r.D)}` },
                    { pts: moody.Re.map((re, k) => [re, moody.smooth[k]]), color: 'var(--dg-axis)', label: 'pipa licin', dash: '4 3' },
                  ]}
                  marks={[{ x: r.Re, y: r.f, color: 'var(--dg-load)', label: `Re ${expo(r.Re, 2)} · f ${fx(r.f, 4)}` }]}
                  xLabel="Re"
                  yLabel="f"
                  logX
                  logY
                  xDp={0}
                  yDp={4}
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
                { label: 'Kehilangan total h', value: fx(r.hTot, 3), unit: 'm', sub: `hf ${fx(r.hf, 3)} + hm ${fx(r.hm, 3)}` },
                { label: 'Kecepatan V', value: fx(r.V, 2), unit: 'm/s', sub: 'lazim 0,6–2,5 m/s', tone: r.V < 0.3 || r.V > 3 ? 'bad' : 'ok' },
                { label: 'Gradien hidraulik', value: fx(r.gradient, 2), unit: 'm/km', sub: `HW ${r.diffHW >= 0 ? '+' : ''}${fx(r.diffHW, 1)}% terhadap Darcy` },
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
