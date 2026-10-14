import { useMemo, useState } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { niceStep } from '../../report/figure'
import { Card, Field, NumField, Panel, ResetButton, Segmented, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computePyUI, PY_DEFAULTS, pyProfile, validate, type PyOk, type PyUIInput } from './model'
import { pyReport } from './report'

const ID = 'py-analysis'

export default function PyAnalysis({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<PyUIInput>(ID, PY_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computePyUI)
  const report = useMemo(() => (r ? pyReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data tiang, beban, dan tanah untuk melihat detail perhitungan."
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
  input: PyUIInput
  setInput: (p: Partial<PyUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof PyUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Tiang" actions={<ResetButton onReset={onReset} />}>
        {f('D', 'D — diameter', 'mm')}
        {f('L', 'L — panjang tertanam', 'm')}
        {f('E', 'E — modulus elastis tiang', 'MPa', 'Reduksi akibat retak diberikan manual.')}
        <Field label="Kepala tiang">
          <Segmented ariaLabel="Kepala tiang" value={input.head} options={[{ value: 'free', label: 'Bebas' }, { value: 'fixed', label: 'Jepit' }]} onChange={(head) => setInput({ head })} />
        </Field>
      </Card>
      <Card n={2} title="Beban di kepala">
        {f('H', 'H — beban lateral', 'kN')}
        {input.head === 'free' && f('M', 'M — momen di kepala', 'kN·m')}
        {f('e', 'e — tinggi beban di atas tanah', 'm')}
      </Card>
      <Card n={3} title="Tanah">
        <Field label="Jenis tanah">
          <Segmented ariaLabel="Jenis tanah" value={input.soil} options={[{ value: 'clay', label: 'Lempung lunak' }, { value: 'sand', label: 'Pasir' }]} onChange={(soil) => setInput({ soil })} />
        </Field>
        {f('gam', "γ′ — berat isi efektif", 'kN/m³')}
        {input.soil === 'clay' ? (
          <>
            {f('cu', 'cu — kuat geser tak terdrainase', 'kPa')}
            {f('eps50', 'ε50 — regangan pada ½ tegangan maks', undefined, 'Lempung lunak ≈ 0,02; kaku ≈ 0,005–0,01.')}
          </>
        ) : (
          <>
            {f('phi', 'φ — sudut geser', '°')}
            {f('kpy', 'k — modulus subgrade awal', 'MN/m³', 'API: pasir lepas ≈ 5, sedang ≈ 16, padat ≈ 34.')}
          </>
        )}
      </Card>
    </>
  )
}

/** Tiang dan bentuk terdefleksi (diperbesar), beban H dan MAT tidak digambar. */
function Preview({ r, w, h }: { r: PyOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const pr = pyProfile(r)
  const padT = 36, padB = 20, padL = 110, padR = 60
  const sc = (h - padT - padB) / (r.L + Math.max(r.e, 0.6))
  const eShow = Math.max(r.e, 0.6)
  const yg = padT + eShow * sc
  const cx = padL + 50
  const ymax = Math.max(...pr.y.map(Math.abs), 1e-9)
  const amp = Math.min(60, (w - cx - padR) * 0.6) / ymax // mm → piksel (diperbesar)
  const pw = Math.max(6, Math.min((r.D * sc), 18))
  const shape = pr.z.map((z, k) => `${cx + pr.y[k] * amp},${yg + z * sc}`).join(' ')
  const yH = yg - r.e * sc
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Tiang dan bentuk terdefleksi">
      <rect x={padL - 70} y={yg} width={w - padL + 60} height={r.L * sc} fill="color-mix(in srgb, var(--dg-axis) 12%, transparent)" />
      <line x1={padL - 70} y1={yg} x2={w - 8} y2={yg} stroke="var(--dg-axis)" />
      <g className="bp-plate">
        <rect x={cx - pw / 2} y={yg - eShow * sc - 6} width={pw} height={(r.L + eShow) * sc + 6} opacity={0.5} />
      </g>
      <polyline fill="none" stroke="var(--dg-v)" strokeWidth={2.2} points={shape} />
      <line x1={cx - pw / 2 - 46} y1={yH} x2={cx - pw / 2 - 6} y2={yH} stroke="var(--dg-load)" strokeWidth={2.4} markerEnd="url(#py-arr)" />
      <defs>
        <marker id="py-arr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--dg-load)" />
        </marker>
      </defs>
      <text x={cx - pw / 2 - 4} y={yH - 8} textAnchor="end" style={{ fill: 'var(--dg-load)' }}>H {fx(r.H, 0)} kN</text>
      <text x={w - 10} y={yg + r.MmaxZ * sc + 4} textAnchor="end" style={{ fill: 'var(--dg-m)' }}>Mmaks z {fx(r.MmaxZ, 1)} m</text>
      <line x1={cx + 20} y1={yg + r.MmaxZ * sc} x2={w - 12} y2={yg + r.MmaxZ * sc} stroke="var(--dg-m)" strokeDasharray="4 3" opacity={0.6} />
      <g className="bp-dim">
        <text x={padL - 64} y={yg + (r.L * sc) / 2 + 4}>L {fx(r.L, 1)} m</text>
      </g>
      <text x={8} y={16} className="bp-label">Bentuk terdefleksi (diperbesar) · y₀ {fx(r.y0, 1)} mm</text>
    </svg>
  )
}

type Tab = 'y' | 'M' | 'p' | 'H'

const TABS: { id: Tab; label: string }[] = [
  { id: 'y', label: 'Defleksi' },
  { id: 'M', label: 'Momen' },
  { id: 'p', label: 'Reaksi' },
  { id: 'H', label: 'H–y₀' },
]

/** Profil nilai terhadap kedalaman (z ke bawah). */
function DepthChart({ z, v, w, h, label, color }: { z: number[]; v: number[]; w: number; h: number; label: string; color: string }) {
  if (w < 200 || h < 100) return null
  const padL = 50, padR = 56, padT = 24, padB = 10
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v)
  const span = hi - lo || 1
  const X = (a: number) => padL + ((a - lo) / span) * (w - padL - padR)
  const Y = (zz: number) => padT + (zz / z[z.length - 1]) * (h - padT - padB)
  const vmax = Math.max(...v.map(Math.abs))
  const k = v.findIndex((a) => Math.abs(a) === vmax)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={label}>
      <line className="dg-zero" x1={X(0)} y1={padT} x2={X(0)} y2={h - padB} />
      <polyline fill="none" stroke={color} strokeWidth={2} points={z.map((zz, i) => `${X(v[i])},${Y(zz)}`).join(' ')} />
      <circle cx={X(v[k])} cy={Y(z[k])} r={3.5} fill={color} />
      <text x={X(v[k]) + (X(v[k]) > w * 0.6 ? -8 : 8)} y={Y(z[k]) + (k === 0 ? 14 : 4)} textAnchor={X(v[k]) > w * 0.6 ? 'end' : 'start'} className="val">{fx(v[k], 1)}</text>
      <text x={padL - 6} y={padT + 8} textAnchor="end" className="dg-note">0 m</text>
      <text x={padL - 6} y={h - padB} textAnchor="end" className="dg-note">{fx(z[z.length - 1], 1)} m</text>
      <text x={padL} y={14} className="dg-note">{label}</text>
    </svg>
  )
}

/** Kurva beban kepala – defleksi kepala. */
function CurveChart({ r, w, h }: { r: PyOk; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const padL = 52, padR = 24, padT = 22, padB = 28
  const ymax = Math.max(...r.curve.map((p) => Math.abs(p.y0)), 1e-9) * 1.05
  const hmax = r.H * 1.05
  const X = (y: number) => padL + (Math.abs(y) / ymax) * (w - padL - padR)
  const Y = (hh: number) => h - padB - (hh / hmax) * (h - padT - padB)
  const sx = niceStep(ymax, 4), sy = niceStep(hmax, 3)
  const tx: number[] = [], ty: number[] = []
  for (let a = 0; a <= ymax; a += sx) tx.push(a)
  for (let a = 0; a <= hmax; a += sy) ty.push(a)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Kurva beban dan defleksi kepala">
      <line className="dg-zero" x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} />
      <line className="dg-zero" x1={padL} y1={padT} x2={padL} y2={h - padB} />
      {tx.map((a) => <text key={`x${a}`} x={X(a)} y={h - padB + 13} textAnchor="middle" className="dg-note">{fx(a, sx < 1 ? 1 : 0)}</text>)}
      {ty.map((a) => <text key={`y${a}`} x={padL - 6} y={Y(a) + 4} textAnchor="end" className="dg-note">{fx(a, 0)}</text>)}
      <polyline fill="none" stroke="var(--dg-v)" strokeWidth={2} points={r.curve.map((p) => `${X(p.y0)},${Y(p.H)}`).join(' ')} />
      {r.curve.map((p) => <circle key={p.H} cx={X(p.y0)} cy={Y(p.H)} r={2.5} fill="var(--dg-v)" />)}
      <text x={w - padR} y={h - 4} textAnchor="end" className="dg-note">y₀ (mm)</text>
      <text x={padL} y={14} className="dg-note">H (kN)</text>
    </svg>
  )
}

function Results({ r, stale }: { r: PyOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('y')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  const pr = useMemo(() => (r ? pyProfile(r) : null), [r])
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r || !pr ? null : tab === 'y' ? (
                <DepthChart z={pr.z} v={pr.y} w={w} h={h} label="Defleksi y (mm)" color="var(--dg-v)" />
              ) : tab === 'M' ? (
                <DepthChart z={pr.z} v={pr.M} w={w} h={h} label="Momen M (kN·m)" color="var(--dg-m)" />
              ) : tab === 'p' ? (
                <DepthChart z={pr.z} v={pr.p} w={w} h={h} label="Reaksi tanah p (kN/m)" color="var(--dg-y)" />
              ) : (
                <CurveChart r={r} w={w} h={h} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Defleksi kepala y₀', value: fx(r.y0, 1), unit: 'mm', sub: `θ₀ ${fx(r.slope0, 4)} rad` },
                { label: 'Mmaks', value: fx(r.Mmax, 0), unit: 'kN·m', sub: `z ${fx(r.MmaxZ, 2)} m` },
                { label: 'ymaks', value: fx(r.ymax, 1), unit: 'mm', sub: `z ${fx(r.ymaxZ, 2)} m` },
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
