import { useMemo, useState } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { RUNOFF_C } from '../../calc/rational-method'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { XYChart } from '../_hydraulics/chart'
import { computeRationalUI, idfCurve, LAND_KEYS, qByLand, RATIONAL_DEFAULTS, validate, type RationalOk, type RationalUIInput, type TcMode } from './model'
import { rationalReport } from './report'

const ID = 'rational-method'

export default function RationalMethod({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<RationalUIInput>(ID, RATIONAL_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeRationalUI)
  const report = useMemo(() => (r ? rationalReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data daerah tangkapan dan hujan untuk melihat detail perhitungan."
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
  input: RationalUIInput
  setInput: (p: Partial<RationalUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof RationalUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  // Pindah ke Kustom: C kustom diisi dari tutupan sebelumnya agar tidak mulai dari nilai lama yang tak terlihat.
  const setLand = (land: string) =>
    setInput(land === 'custom' && RUNOFF_C[input.land] ? { land, C: String(RUNOFF_C[input.land].C) } : { land })
  return (
    <>
      <Card n={1} title="Daerah tangkapan" actions={<ResetButton onReset={onReset} />}>
        {f('A', 'A — luas daerah tangkapan', 'ha', 'Metode rasional lazim untuk A ≤ 80 ha (batas atas ±300 ha).')}
        <SelectField
          label="Tutupan lahan (koefisien limpasan C)"
          value={input.land}
          options={[...LAND_KEYS.map((k) => ({ value: k, label: RUNOFF_C[k].label })), { value: 'custom', label: 'Kustom' }]}
          onChange={setLand}
        />
        {input.land === 'custom' && f('C', 'C — koefisien limpasan', undefined, 'Untuk tutupan campuran pakai C rata-rata tertimbang luas: ΣCᵢAᵢ / ΣAᵢ.')}
      </Card>
      <Card n={2} title="Hujan rencana">
        {f('R24', 'R₂₄ — hujan harian rencana', 'mm', 'Sesuai periode ulang desain, mis. 5–10 tahun untuk drainase kota.')}
      </Card>
      <Card n={3} title="Waktu konsentrasi">
        <Field label="Metode tc">
          <Segmented<TcMode>
            ariaLabel="Metode waktu konsentrasi"
            value={input.tcMode}
            options={[{ value: 'kirpich', label: 'Kirpich' }, { value: 'manual', label: 'Manual' }]}
            onChange={(tcMode) => setInput({ tcMode })}
          />
        </Field>
        {input.tcMode === 'kirpich' ? (
          <>
            {f('Lf', 'L — panjang lintasan aliran terjauh', 'm', 'Dari titik terjauh daerah tangkapan ke titik tinjau (outlet).')}
            {f('dH', 'ΔH — beda tinggi sepanjang L', 'm')}
          </>
        ) : (
          f('tcMan', 'tc — waktu konsentrasi', 'menit', 'Mis. waktu limpasan permukaan + waktu aliran di saluran.')
        )}
      </Card>
    </>
  )
}

/** Skema daerah tangkapan: batas DAS, lintasan aliran L (+ΔH), outlet dengan debit Q. */
function Preview({ r, w, h }: { r: RationalOk; w: number; h: number }) {
  if (w < 260 || h < 160) return null
  const cx = w / 2, cy = h / 2 + 8
  const rx = Math.min(w * 0.36, 240), ry = Math.min(h * 0.32, 120)
  // batas DAS tak beraturan (bentuk tetap, diskalakan)
  const shape = [1, 0.86, 0.95, 0.78, 0.9, 1.05, 0.92, 0.84, 1, 0.96, 0.88, 0.97]
  const pts = shape.map((s, k) => {
    const a = (2 * Math.PI * k) / shape.length
    return `${cx + rx * s * Math.cos(a)},${cy + ry * s * Math.sin(a)}`
  })
  const out = { x: cx + rx * 0.98, y: cy + ry * 0.18 }
  const far = { x: cx - rx * 0.82, y: cy - ry * 0.5 }
  const path = `M${far.x},${far.y} C${cx - rx * 0.3},${cy - ry * 0.75} ${cx + rx * 0.1},${cy + ry * 0.55} ${out.x},${out.y}`
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Skema daerah tangkapan dan lintasan aliran">
      <defs>
        <marker id="rm-arr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--dg-v)" />
        </marker>
      </defs>
      <polygon points={pts.join(' ')} fill="color-mix(in srgb, var(--dg-support) 14%, transparent)" stroke="var(--dg-support)" strokeWidth={1.4} strokeDasharray="6 3" />
      <path d={path} fill="none" stroke="var(--dg-v)" strokeWidth={2} />
      <circle cx={far.x} cy={far.y} r={4} fill="var(--dg-v)" />
      <line x1={out.x} y1={out.y} x2={out.x + Math.min(54, w - out.x - 16)} y2={out.y} stroke="var(--dg-v)" strokeWidth={2.4} markerEnd="url(#rm-arr)" />
      <text x={far.x - 6} y={far.y - 10} style={{ fill: 'var(--dg-v)' }}>
        {r.tcMode === 'kirpich' ? `+${fx(r.dH, 1)} m` : 'titik terjauh'}
      </text>
      <text x={cx} y={cy - ry - 10} textAnchor="middle" className="bp-label">
        {r.tcMode === 'kirpich' ? `lintasan aliran L ${fx(r.Lf, 0)} m · S ${fx(r.S! * 100, 2)}%` : `tc manual ${fx(r.tcMin, 1)} menit`}
      </text>
      <text x={out.x - 4} y={out.y + 22} textAnchor="end" style={{ fill: 'var(--dg-v)' }}>
        outlet Q {fx(r.Q, 3)} m³/s
      </text>
      <g className="bp-dim">
        <text x={cx - rx * 0.2} y={cy + ry * 0.7} textAnchor="middle">A {fx(r.A, 2)} ha · C {fx(r.C, 2)}</text>
      </g>
      <text x={8} y={16} className="bp-label">
        R₂₄ {fx(r.R24, 0)} mm · tc {fx(r.tcMin, 1)} menit · i {fx(r.i, 1)} mm/jam
      </text>
    </svg>
  )
}

/** Batang horizontal debit tiap tutupan lahan (yang dipakai ditandai). */
function LandBars({ r, w, h }: { r: RationalOk; w: number; h: number }) {
  if (w < 240 || h < 110) return null
  const rows = qByLand(r)
  const padL = 150, padR = 70, padT = 12
  const rh = Math.min(24, (h - padT - 8) / rows.length)
  const qmax = Math.max(...rows.map((x) => x.Q), 1e-9)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Debit puncak per tutupan lahan">
      {rows.map((x, k) => {
        const y = padT + k * rh, len = Math.max(2, (x.Q / qmax) * (w - padL - padR))
        const c = x.used ? 'var(--dg-v)' : 'var(--dg-axis)'
        return (
          <g key={x.key}>
            <text x={padL - 8} y={y + rh * 0.62} textAnchor="end" className={x.used ? 'val' : 'dg-note'}>
              {x.label} ({fx(x.C, 2)})
            </text>
            <rect x={padL} y={y + rh * 0.18} width={len} height={rh * 0.62} fill={c} opacity={x.used ? 0.85 : 0.35} />
            <text x={padL + len + 6} y={y + rh * 0.62} className={x.used ? 'val' : 'dg-note'}>{fx(x.Q, 3)}</text>
          </g>
        )
      })}
      <text x={w - 8} y={h - 4} textAnchor="end" className="dg-note">Q (m³/s) pada i {fx(r.i, 1)} mm/jam</text>
    </svg>
  )
}

type Tab = 'idf' | 'land'

const TABS: { id: Tab; label: string }[] = [
  { id: 'idf', label: 'Intensitas' },
  { id: 'land', label: 'Per tutupan lahan' },
]

function Results({ r, stale }: { r: RationalOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('idf')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : tab === 'idf' ? (
                <XYChart
                  w={w}
                  h={h}
                  title="Kurva intensitas–durasi Mononobe"
                  series={[{ pts: idfCurve(r), color: 'var(--dg-v)', label: 'Mononobe' }]}
                  marks={[{ x: r.tcMin, y: r.i, color: 'var(--dg-load)', label: `tc ${fx(r.tcMin, 1)} mnt · i ${fx(r.i, 1)}` }]}
                  xLabel="durasi t (menit)"
                  yLabel="i (mm/jam)"
                  xDp={0}
                  yDp={1}
                />
              ) : (
                <LandBars r={r} w={w} h={h} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Debit puncak Q', value: fx(r.Q, 3), unit: 'm³/s', sub: `${fx(r.Q * 1000, 0)} L/s` },
                { label: 'Intensitas i', value: fx(r.i, 1), unit: 'mm/jam' },
                { label: 'Waktu konsentrasi tc', value: fx(r.tcMin, 1), unit: 'menit', sub: r.tcMode === 'kirpich' ? 'Kirpich' : 'manual' },
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
