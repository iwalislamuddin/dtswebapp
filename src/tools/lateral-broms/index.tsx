import { useMemo } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { BROMS_DEFAULTS, computeBromsUI, validate, type BromsOk, type BromsUIInput } from './model'
import { bromsReport, ultimatePressure } from './report'

const ID = 'lateral-broms'

export default function LateralBroms({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BromsUIInput>(ID, BROMS_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeBromsUI)
  const report = useMemo(() => (r ? bromsReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data tiang dan tanah untuk melihat detail perhitungan."
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
  input: BromsUIInput
  setInput: (p: Partial<BromsUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof BromsUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Tiang" actions={<ResetButton onReset={onReset} />}>
        {f('D', 'D — diameter', 'mm')}
        {f('L', 'L — panjang tertanam', 'm')}
        {f('e', 'e — tinggi beban di atas tanah', 'm', '0 = beban di muka tanah.')}
        {f('My', 'My — momen leleh tiang', 'kN·m')}
        <Field label="Kepala tiang">
          <Segmented ariaLabel="Kepala tiang" value={input.head} options={[{ value: 'free', label: 'Bebas' }, { value: 'fixed', label: 'Jepit' }]} onChange={(head) => setInput({ head })} />
        </Field>
      </Card>
      <Card n={2} title="Tanah">
        <Field label="Jenis tanah">
          <Segmented ariaLabel="Jenis tanah" value={input.soil} options={[{ value: 'clay', label: 'Lempung' }, { value: 'sand', label: 'Pasir' }]} onChange={(soil) => setInput({ soil })} />
        </Field>
        {input.soil === 'clay' ? (
          f('cu', 'cu — kuat geser tak terdrainase', 'kPa')
        ) : (
          <>
            {f('phi', 'φ — sudut geser', '°')}
            {f('gam', "γ′ — berat isi efektif", 'kN/m³', 'γ − 9,81 di bawah muka air.')}
          </>
        )}
      </Card>
    </>
  )
}

/** Tiang, beban H dan diagram tekanan tanah batas; kedalaman Mmaks ditandai. */
function Preview({ r, w, h }: { r: BromsOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const padT = 40, padB = 28, padL = 120
  const eShow = Math.max(r.e, 0.8)
  const sc = Math.min((h - padT - padB) / (r.L + eShow), 40)
  const yg = padT + eShow * sc
  const cx = padL + 40, pw = Math.max(8, Math.min(r.D * sc, 22))
  const xRight = cx + pw / 2 + 4
  const dx = Math.min(w - xRight - 90, 140) / Math.max(ultimatePressure(r, r.L), 1)
  const poly: string[] = [`${xRight},${yg}`]
  for (let k = 0; k <= 40; k++) {
    const z = (r.L * k) / 40
    poly.push(`${xRight + ultimatePressure(r, z) * dx},${yg + z * sc}`)
  }
  poly.push(`${xRight},${yg + r.L * sc}`)
  const yH = yg - r.e * sc
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Tiang, beban lateral dan tekanan tanah batas">
      <rect x={padL - 70} y={yg} width={w - padL + 60} height={r.L * sc} fill="color-mix(in srgb, var(--dg-axis) 12%, transparent)" />
      <line x1={padL - 70} y1={yg} x2={w - 10} y2={yg} stroke="var(--dg-axis)" />
      <polygon points={poly.join(' ')} fill="color-mix(in srgb, var(--dg-v) 28%, transparent)" stroke="var(--dg-v)" />
      <line x1={xRight} y1={yg + r.zmax * sc} x2={w - 12} y2={yg + r.zmax * sc} stroke="var(--dg-m)" strokeDasharray="5 3" />
      <text x={w - 14} y={yg + r.zmax * sc - 5} textAnchor="end" style={{ fill: 'var(--dg-m)' }}>z(Mmaks) {fx(r.zmax, 2)} m</text>
      <g className="bp-plate">
        <rect x={cx - pw / 2} y={yg - eShow * sc - 6} width={pw} height={(r.L + eShow) * sc + 6} />
      </g>
      <line x1={cx - pw / 2 - 46} y1={yH} x2={cx - pw / 2 - 6} y2={yH} stroke="var(--dg-load)" strokeWidth={2.4} markerEnd="url(#brm-arr)" />
      <defs>
        <marker id="brm-arr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--dg-load)" />
        </marker>
      </defs>
      <text x={cx - pw / 2 - 4} y={yH - 8} textAnchor="end" style={{ fill: 'var(--dg-load)' }}>Hu {fx(r.Hu, 1)} kN</text>
      <g className="bp-dim">
        <line x1={cx + pw / 2 + 0} y1={yg + r.L * sc + 10} x2={cx + pw / 2 + 0} y2={yg + r.L * sc + 10} />
        {r.e > 0 && <text x={padL - 64} y={(yH + yg) / 2 + 4}>e {fx(r.e, 2)} m</text>}
        <text x={padL - 64} y={yg + (r.L * sc) / 2 + 4}>L {fx(r.L, 1)} m</text>
      </g>
      <text x={8} y={16} className="bp-label">
        {r.head === 'free' ? 'Kepala bebas' : 'Kepala jepit'} · tekanan tanah batas {r.soil === 'clay' ? '9cuD (nol 0–1,5D)' : '3Kpγ′zD'}
      </text>
    </svg>
  )
}

function Results({ r, stale }: { r: BromsOk | null; stale: boolean }) {
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel title="Hasil" className="results-panel">
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kapasitas lateral tiang pendek dan panjang"
                  note="Kapasitas lateral ultimit (kN) — batang tebal menentukan"
                  bars={[
                    { label: 'Tiang pendek (tanah)', cap: r.Hshort, dem: 0, color: 'var(--dg-v)', gov: r.short, aux: !r.short },
                    { label: 'Tiang panjang (leleh)', cap: r.Hlong, dem: 0, color: 'var(--dg-m)', gov: !r.short, aux: r.short },
                  ]}
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
                { label: 'Hu — kapasitas lateral', value: fx(r.Hu, 1), unit: 'kN', sub: r.short ? 'tiang pendek' : 'tiang panjang' },
                { label: 'Mmaks / My', value: `${fx(r.Mmax, 0)} / ${fx(r.My, 0)}`, unit: 'kN·m', sub: `rasio ${fx(r.dcMom, 2)}`, tone: r.dcMom <= 1.0001 ? 'ok' : 'bad' },
                { label: 'z (Mmaks)', value: fx(r.zmax, 2), unit: 'm' },
              ]}
            />
            <p className="muted" style={{ marginTop: 8 }}>{r.mode}. Hu adalah beban ultimit; bagi dengan faktor keamanan untuk beban kerja.</p>
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
