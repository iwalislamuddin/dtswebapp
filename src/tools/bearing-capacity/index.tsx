import { useMemo, useState } from 'react'
import { BEARING_METHODS, FOOTING_SHAPES, methodName } from '../../calc/bearing-capacity'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { BEARING_DEFAULTS, computeBearingUI, validate, type BearingOk, type BearingUIInput } from './model'
import { bearingReport } from './report'

const ID = 'bearing-capacity'

const SHAPE_OPTIONS = FOOTING_SHAPES.map(([value, label]) => ({ value, label }))
const METHOD_OPTIONS = BEARING_METHODS.map(([value, label]) => ({ value, label }))
const METHOD_COLOR = { terzaghi: 'var(--dg-v)', meyerhof: 'var(--dg-m)', vesic: 'var(--dg-y)' } as const

export default function BearingCapacity({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BearingUIInput>(ID, BEARING_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeBearingUI)
  const report = useMemo(() => (r ? bearingReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi geometri fondasi dan parameter tanah untuk melihat detail perhitungan."
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
  input: BearingUIInput
  setInput: (p: Partial<BearingUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof BearingUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Geometri fondasi" actions={<ResetButton onReset={onReset} />}>
        <SelectField label="Bentuk" value={input.shape} options={SHAPE_OPTIONS} onChange={(shape) => setInput({ shape })} />
        {f('B', 'B — lebar / sisi / diameter', 'm', 'Lingkaran: B = diameter. Persegi panjang: B = sisi pendek.')}
        {input.shape === 'rect' && f('L', 'L — panjang', 'm')}
        {f('Df', 'Df — kedalaman dasar', 'm', 'Dari permukaan tanah ke dasar fondasi.')}
      </Card>
      <Card n={2} title="Tanah & muka air">
        {f('c', 'c — kohesi', 'kPa', 'Lempung: c > 0. Pasir bersih: c = 0.')}
        {f('phi', 'φ — sudut geser dalam', '°', 'φ = 0 (lempung undrained) → Nq = 1, Nγ = 0.')}
        {f('gamma', 'γ — berat isi lembab', 'kN/m³')}
        {f('gsat', 'γsat — berat isi jenuh', 'kN/m³', 'Kosong/0 = γ + 1. γ′ = γsat − 9,81.')}
        {f('Dw', 'Dw — kedalaman muka air', 'm', 'Dari permukaan. Besar (mis. 99) = tanpa air.')}
      </Card>
      <Card n={3} title="Analisis">
        <SelectField label="Metode utama (rincian & laporan)" value={input.method} options={METHOD_OPTIONS} onChange={(method) => setInput({ method })} />
        {input.method === 'terzaghi' && (
          <Field label="Keruntuhan (Terzaghi)">
            <Segmented
              ariaLabel="Keruntuhan Terzaghi"
              value={input.tfail}
              options={[{ value: 'general', label: 'Umum' }, { value: 'local', label: 'Lokal' }]}
              onChange={(tfail) => setInput({ tfail })}
            />
          </Field>
        )}
        {f('FS', 'FS — faktor keamanan', undefined, 'Kosong/0 = 3.')}
        {f('qapp', 'q — tekanan kerja (opsional)', 'kPa', '0 = lewati rasio D/C.')}
      </Card>
    </>
  )
}

/** Potongan fondasi: muka tanah, MAT, baji keruntuhan, dimensi B & Df. */
function Preview({ r, w, h }: { r: BearingOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const padL = 96, padR = 110, padT = 44, padB = 52
  const waterIn = r.Dw > 0 && r.Dw < 50
  const depth = Math.max(r.Df + 1.6 * r.B, waterIn ? r.Dw + 0.4 * r.B : 0, 1)
  const sc = Math.min((w - padL - padR) / (2.4 * r.B), (h - padT - padB) / depth)
  const cx = padL + (w - padL - padR) / 2
  const Bs = r.B * sc
  const yg = padT, yb = yg + r.Df * sc, yEnd = yg + depth * sc
  const tF = Math.max(8, Math.min(Bs * 0.18, 26))
  const wedge = Math.min((r.B / 2) * Math.tan(((r.phiDeg || 0) * Math.PI) / 180) * sc, yEnd - yb)
  const xL = padL - 40, xR = w - padR + 40
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Potongan fondasi dangkal">
      <rect x={xL} y={yg} width={xR - xL} height={yEnd - yg} fill="color-mix(in srgb, var(--dg-axis) 14%, transparent)" />
      <line x1={xL} y1={yg} x2={xR} y2={yg} stroke="var(--dg-axis)" />
      <text x={xR - 4} y={yg - 6} textAnchor="end" className="dg-note">muka tanah</text>
      {waterIn && (
        <g>
          <line x1={xL} y1={yg + r.Dw * sc} x2={xR} y2={yg + r.Dw * sc} stroke="var(--dg-load)" strokeDasharray="6 4" />
          <text x={xL + 6} y={yg + r.Dw * sc - 5} style={{ fill: 'var(--dg-load)' }}>MAT Dw {fx(r.Dw, 2)} m</text>
        </g>
      )}
      {wedge > 4 && r.phiDeg > 0 && (
        <path d={`M${cx - Bs / 2},${yb} L${cx},${yb + wedge} L${cx + Bs / 2},${yb} Z`} fill="none" stroke="var(--dg-axis)" strokeDasharray="4 3" />
      )}
      <rect x={cx - Bs * 0.1} y={Math.min(yg - 14, yb - tF - 14)} width={Bs * 0.2} height={yb - tF - Math.min(yg - 14, yb - tF - 14)} fill="color-mix(in srgb, var(--dg-ink) 30%, transparent)" stroke="var(--dg-ink)" />
      <g className="bp-plate">
        <rect x={cx - Bs / 2} y={yb - tF} width={Bs} height={tF} />
      </g>
      <g className="bp-dim">
        <line x1={cx - Bs / 2} y1={yb + 14} x2={cx + Bs / 2} y2={yb + 14} />
        <text x={cx} y={yb + 28} textAnchor="middle">
          {r.shape === 'circular' ? '⌀ ' : 'B '}
          {fx(r.B, 2)} m{r.shape === 'rect' ? ` (L ${fx(r.L, 2)} m)` : r.shape === 'strip' ? ' (menerus)' : ''}
        </text>
        {r.Df > 0 && (
          <>
            <line x1={cx + Bs / 2 + 26} y1={yg} x2={cx + Bs / 2 + 26} y2={yb} />
            <text x={cx + Bs / 2 + 32} y={(yg + yb) / 2 + 4}>Df {fx(r.Df, 2)} m</text>
          </>
        )}
      </g>
      <text x={xL + 6} y={yEnd - 8} className="dg-note">
        γ {fx(r.gamma, 1)} kN/m³ · c {fx(r.c, 1)} kPa · φ {fx(r.phiDeg, 1)}°
      </text>
      <text x={8} y={16} className="bp-label">
        Potongan fondasi · baji keruntuhan putus-putus
      </text>
    </svg>
  )
}

type Tab = 'izin' | 'suku'

/** Komposisi q_u (suku kohesi, overburden, berat tanah) tiap metode. */
function TermChart({ r, w, h }: { r: BearingOk; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const rows = BEARING_METHODS.map(([k, name]) => ({ name, m: r.methods[k], primary: k === r.primary }))
  const padL = 84, padR = 56, padT = 26, padB = 30
  const maxV = Math.max(...rows.map((x) => x.m.qu)) * 1.05
  const X = (v: number) => padL + (v / maxV) * (w - padL - padR)
  const rowH = Math.min(40, (h - padT - padB) / rows.length)
  const cols = ['var(--dg-v)', 'var(--dg-m)', 'var(--dg-y)']
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Komposisi daya dukung batas">
      {rows.map((row, k) => {
        const y = padT + k * rowH + rowH * 0.2
        const bh = rowH * 0.6
        let x = 0
        return (
          <g key={row.name}>
            <text x={padL - 8} y={y + bh / 2 + 4} textAnchor="end" className="dg-bar-label" style={row.primary ? { fontWeight: 600 } : undefined}>
              {row.name.split(' ')[0]}
            </text>
            {[row.m.t1, row.m.t2, row.m.t3].map((t, j) => {
              const x0 = X(x)
              x += t
              return <rect key={j} x={x0} y={y} width={Math.max(0, X(x) - x0)} height={bh} fill={`color-mix(in srgb, ${cols[j]} 45%, transparent)`} stroke={cols[j]} />
            })}
            <text x={X(row.m.qu) + 6} y={y + bh / 2 + 4} className="val">{fx(row.m.qu, 0)}</text>
          </g>
        )
      })}
      <g className="dg-note">
        {['c·Nc', 'q·Nq', '½γB·Nγ'].map((l, j) => (
          <g key={l}>
            <rect x={padL + j * 92} y={h - 22} width={10} height={10} fill={`color-mix(in srgb, ${cols[j]} 45%, transparent)`} stroke={cols[j]} />
            <text x={padL + j * 92 + 14} y={h - 13}>{l}</text>
          </g>
        ))}
      </g>
      <text x={padL} y={14} className="dg-note">q_u per suku (kPa)</text>
    </svg>
  )
}

function Results({ r, stale }: { r: BearingOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('izin')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel
      title="Hasil"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'izin', label: 'q izin' }, { id: 'suku', label: 'Suku q_u' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : tab === 'izin' ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="q izin tiga metode"
                  note={r.qApp > 0 ? 'q izin (kPa) — garis = tekanan kerja' : 'q izin = q_u / FS (kPa)'}
                  bars={BEARING_METHODS.map(([k, name]) => ({
                    label: name.split(' ')[0],
                    cap: r.methods[k].qall,
                    dem: r.qApp,
                    color: METHOD_COLOR[k],
                    gov: k === r.primary,
                    aux: k !== r.primary,
                  }))}
                />
              ) : (
                <TermChart r={r} w={w} h={h} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan — {methodName(r.primary)}</h4>
            <StatTiles
              items={[
                { label: 'q_u', value: fx(r.pm.qu, 0), unit: 'kPa', sub: `neto ${fx(r.pm.qnet, 0)}` },
                { label: 'q izin = q_u / FS', value: fx(r.pm.qall, 0), unit: 'kPa', sub: `FS ${fx(r.FS, 1)}` },
                r.dc !== null
                  ? { label: 'q kerja / q izin', value: fx(r.dc, 2), sub: r.dc <= 1 ? 'OK' : 'TIDAK AMAN', tone: r.dc <= 1 ? 'ok' : 'bad' }
                  : { label: 'Nc / Nq / Nγ', value: `${fx(r.pm.Nc, 1)} / ${fx(r.pm.Nq, 1)} / ${fx(r.pm.Ng, 1)}` },
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
