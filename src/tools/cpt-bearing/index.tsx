import { useMemo } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { niceStep } from '../../report/figure'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import { CPT_UNITS, CptTextField } from '../_cpt/data'
import type { ToolUIProps } from '../registry'
import { CPT_BEARING_DEFAULTS, computeCptBearingUI, validate, type CptBearingOk, type CptBearingUIInput } from './model'
import { cptBearingReport } from './report'

const ID = 'cpt-bearing'

export default function CptBearing({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<CptBearingUIInput>(ID, CPT_BEARING_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeCptBearingUI)
  const report = useMemo(() => (r ? cptBearingReport(r, input.unit === 'mpa' ? 'MPa' : 'kg/cm²') : null), [r, input.unit])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Tempel data sondir dan isi geometri fondasi untuk melihat detail perhitungan."
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
  input: CptBearingUIInput
  setInput: (p: Partial<CptBearingUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof CptBearingUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Data sondir (CPT)" actions={<ResetButton onReset={onReset} />}>
        <Field label="Satuan qc">
          <Segmented ariaLabel="Satuan qc" value={input.unit} options={CPT_UNITS} onChange={(unit) => setInput({ unit })} />
        </Field>
        <CptTextField value={input.data} unit={input.unit} error={errors.data} onChange={(data) => setInput({ data })} />
      </Card>
      <Card n={2} title="Fondasi">
        {f('B', 'B — lebar', 'm')}
        {f('L', 'L — panjang', 'm', 'Kosong atau < B dipakai B.')}
        {f('Df', 'Df — kedalaman dasar', 'm')}
        {f('gamma', 'γ — berat isi di atas dasar', 'kN/m³', 'Total (MAT tidak dimodelkan).')}
      </Card>
      <Card n={3} title="Jenis tanah & beban">
        <Field label="Tanah di zona pengaruh">
          <Segmented ariaLabel="Jenis tanah" value={input.soil} options={[{ value: 'sand', label: 'Pasir' }, { value: 'clay', label: 'Lempung' }]} onChange={(soil) => setInput({ soil })} />
        </Field>
        {input.soil === 'clay' && f('Nk', 'Nk — faktor kerucut', undefined, 'Kosong/0 = 14.')}
        {input.soil === 'clay' && f('FS', 'FS — faktor keamanan', undefined, 'Kosong/0 = 3.')}
        {f('qw', 'q — tekanan kerja neto (opsional)', 'kPa', '0 = lewati rasio D/C.')}
      </Card>
    </>
  )
}

/** Profil qc terhadap kedalaman, dasar fondasi dan zona pengaruh. */
function Preview({ r, w, h }: { r: CptBearingOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const zEnd = Math.max(r.zMax, r.Df + r.B)
  const qMax = Math.max(...r.pts.map((p) => p.qc), r.qcb) * 1.08
  const padL = 60, padR = 150, padT = 54, padB = 20
  const X = (q: number) => padL + (q / qMax) * (w - padL - padR)
  const Y = (z: number) => padT + (z / zEnd) * (h - padT - padB)
  const st = niceStep(qMax, 4)
  const ticks: number[] = []
  for (let q = 0; q <= qMax; q += st) ticks.push(q)
  const bw = Math.min(100, (r.B / zEnd) * (h - padT - padB) * 1.2 + 30)
  const cx = w - padR / 2 - 6
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Profil qc sondir">
      <rect x={padL} y={Y(r.Df)} width={w - padL - padR} height={Y(r.Df + r.B) - Y(r.Df)} fill="color-mix(in srgb, var(--dg-m) 20%, transparent)" />
      <line className="dg-zero" x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--dg-axis)" />
      {ticks.map((q) => (
        <text key={q} x={X(q)} y={padT - 8} textAnchor="middle" className="dg-note">{fx(q / 1000, st < 1000 ? 1 : 0)}</text>
      ))}
      <text x={w - padR} y={padT - 22} textAnchor="end" className="dg-note">qc (MPa)</text>
      <polyline fill="none" stroke="var(--dg-v)" strokeWidth={2} points={r.pts.map((p) => `${X(p.qc)},${Y(p.z)}`).join(' ')} />
      <line x1={X(r.qcb)} y1={Y(r.Df)} x2={X(r.qcb)} y2={Y(r.Df + r.B)} stroke="var(--dg-load)" strokeWidth={2} strokeDasharray="5 3" />
      <text x={X(r.qcb) + 6} y={Y(r.Df + r.B / 2) + 4} style={{ fill: 'var(--dg-load)' }}>qc̄ {fx(r.qcb / 1000, 2)} MPa</text>
      <line x1={padL} y1={Y(r.Df)} x2={cx + bw / 2} y2={Y(r.Df)} stroke="var(--dg-axis)" strokeDasharray="3 3" />
      <g className="bp-plate">
        <rect x={cx - bw / 2} y={Y(r.Df) - 10} width={bw} height={10} />
      </g>
      <g className="bp-dim">
        <text x={padL - 6} y={Y(r.Df) + 4} textAnchor="end">Df {fx(r.Df, 2)}</text>
        <text x={padL - 6} y={Y(r.Df + r.B) + 4} textAnchor="end">+B {fx(r.Df + r.B, 2)}</text>
      </g>
      <text x={8} y={16} className="bp-label">Profil qc · zona pengaruh Df … Df+B diarsir</text>
    </svg>
  )
}

function Results({ r, stale }: { r: CptBearingOk | null; stale: boolean }) {
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
                  ariaLabel="Daya dukung izin"
                  note={r.qw > 0 ? 'kPa — garis = tekanan kerja neto' : 'kPa'}
                  bars={[
                    { label: 'q izin neto', cap: r.qaNet, dem: r.qw, color: 'var(--dg-v)', gov: true },
                    { label: 'q izin bruto', cap: r.qaGross, dem: 0, color: 'var(--dg-m)', aux: true },
                    ...(r.soil === 'clay' && r.qult != null ? [{ label: 'q ult neto', cap: r.qult, dem: 0, color: 'var(--dg-y)', aux: true }] : []),
                  ]}
                />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan — {r.soil === 'sand' ? 'pasir (Meyerhof)' : 'lempung (Skempton)'}</h4>
            <StatTiles
              items={[
                { label: 'qc̄ zona pengaruh', value: fx(r.qcb / 1000, 2), unit: 'MPa', sub: `σv0 ${fx(r.sigv0, 1)} kPa` },
                { label: 'q izin neto', value: fx(r.qaNet, 0), unit: 'kPa', sub: `bruto ${fx(r.qaGross, 0)}` },
                r.qw > 0
                  ? { label: 'q kerja / q izin', value: fx(r.dc, 2), sub: r.dc <= 1 ? 'OK' : 'TIDAK AMAN', tone: r.dc <= 1 ? 'ok' : 'bad' }
                  : r.soil === 'sand'
                    ? { label: 'Kd', value: fx(r.Kd, 2) }
                    : { label: 'su', value: fx(r.su, 1), unit: 'kPa' },
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
