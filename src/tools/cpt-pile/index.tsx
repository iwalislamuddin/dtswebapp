import { useMemo, useState } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { niceStep } from '../../report/figure'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import { CPT_UNITS, CptTextField } from '../_cpt/data'
import type { ToolUIProps } from '../registry'
import { computeCptPileUI, CPT_PILE_DEFAULTS, dataHasFs, shaftProfile, validate, type CptPileOk, type CptPileUIInput } from './model'
import { cptPileReport } from './report'

const ID = 'cpt-pile'

export default function CptPile({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<CptPileUIInput>(ID, CPT_PILE_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeCptPileUI)
  const report = useMemo(() => (r ? cptPileReport(r, input.unit === 'mpa' ? 'MPa' : 'kg/cm²') : null), [r, input.unit])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Tempel data sondir dan isi dimensi tiang untuk melihat detail perhitungan."
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
  input: CptPileUIInput
  setInput: (p: Partial<CptPileUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof CptPileUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  const hasFs = dataHasFs(input)
  return (
    <>
      <Card n={1} title="Data sondir (CPT)" actions={<ResetButton onReset={onReset} />}>
        <Field label="Satuan qc, fs">
          <Segmented ariaLabel="Satuan qc" value={input.unit} options={CPT_UNITS} onChange={(unit) => setInput({ unit })} />
        </Field>
        <CptTextField value={input.data} unit={input.unit} error={errors.data} onChange={(data) => setInput({ data })} withFs />
      </Card>
      <Card n={2} title="Tiang">
        <Field label="Penampang">
          <Segmented ariaLabel="Penampang tiang" value={input.shape} options={[{ value: 'circle', label: 'Bulat' }, { value: 'square', label: 'Persegi' }]} onChange={(shape) => setInput({ shape })} />
        </Field>
        {f('D', input.shape === 'square' ? 'D — sisi' : 'D — diameter', 'm')}
        {f('Lp', 'L — panjang tertanam', 'm')}
      </Card>
      <Card n={3} title="Selimut & faktor keamanan">
        {hasFs && (
          <Field label="Gesekan selimut dari">
            <Segmented ariaLabel="Sumber gesekan" value={input.fsrc} options={[{ value: 'data', label: 'Kolom fs' }, { value: 'rf', label: 'Rasio gesek Rf' }]} onChange={(fsrc) => setInput({ fsrc })} />
          </Field>
        )}
        {(input.fsrc === 'rf' || !hasFs) && f('Rf', 'Rf — rasio gesek', '%', hasFs ? 'fs = Rf × qc. Kosong/0 = 1.' : 'Data tanpa kolom fs: fs = Rf × qc. Kosong/0 = 1.')}
        {f('FSp', 'FS ujung', undefined, 'Kosong/0 = 3.')}
        {f('FSs', 'FS selimut', undefined, 'Kosong/0 = 5.')}
        {f('Pw', 'P — beban kerja (opsional)', 'kN', '0 = lewati rasio D/C.')}
      </Card>
    </>
  )
}

/** Profil qc (dan fs) terhadap kedalaman, tiang, dan jendela rata-rata ujung. */
function Preview({ r, w, h }: { r: CptPileOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const zEnd = Math.max(r.zMax, r.Lp + 4 * r.D)
  const qMax = Math.max(...r.pts.map((p) => p.qc)) * 1.08
  const padL = 56, padR = 150, padT = 54, padB = 20
  const X = (q: number) => padL + (q / qMax) * (w - padL - padR)
  const Y = (z: number) => padT + (z / zEnd) * (h - padT - padB)
  const st = niceStep(qMax, 4)
  const ticks: number[] = []
  for (let q = 0; q <= qMax; q += st) ticks.push(q)
  const zUp = Math.max(0, r.Lp - 8 * r.D)
  const pw = Math.max(8, Math.min(r.D * ((h - padT - padB) / zEnd) * 1.6, 24))
  const cx = w - padR / 2 - 6
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Profil qc sondir dan tiang">
      <rect x={padL} y={Y(zUp)} width={w - padL - padR} height={Y(r.Lp) - Y(zUp)} fill="color-mix(in srgb, var(--dg-m) 18%, transparent)" />
      <rect x={padL} y={Y(r.Lp)} width={w - padL - padR} height={Y(r.Lp + 4 * r.D) - Y(r.Lp)} fill="color-mix(in srgb, var(--dg-y) 22%, transparent)" />
      <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--dg-axis)" />
      {ticks.map((q) => (
        <text key={q} x={X(q)} y={padT - 8} textAnchor="middle" className="dg-note">{fx(q / 1000, st < 1000 ? 1 : 0)}</text>
      ))}
      <text x={w - padR} y={padT - 22} textAnchor="end" className="dg-note">qc (MPa)</text>
      <polyline fill="none" stroke="var(--dg-v)" strokeWidth={2} points={r.pts.map((p) => `${X(p.qc)},${Y(p.z)}`).join(' ')} />
      <g className="bp-plate">
        <rect x={cx - pw / 2} y={padT - 8} width={pw} height={Y(r.Lp) - padT + 8} />
      </g>
      <g className="bp-dim">
        <line x1={cx + pw / 2 + 14} y1={padT} x2={cx + pw / 2 + 14} y2={Y(r.Lp)} />
        <text x={cx + pw / 2 + 18} y={(padT + Y(r.Lp)) / 2 + 4}>L {fx(r.Lp, 1)} m</text>
        <text x={padL + 4} y={Y(zUp) + 12}>8D atas · qc2 {fx(r.qc2 / 1000, 2)} MPa</text>
        <text x={padL + 4} y={Y(r.Lp) + 12}>4D bawah · qc1 {fx(r.qc1 / 1000, 2)} MPa</text>
      </g>
      <text x={8} y={16} className="bp-label">Profil qc & tiang · jendela rata-rata ujung diarsir</text>
    </svg>
  )
}

type Tab = 'kapasitas' | 'selimut'

/** fs selimut terpakai terhadap kedalaman. */
function ShaftChart({ r, w, h }: { r: CptPileOk; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const prof = shaftProfile(r)
  const padL = 52, padR = 30, padT = 24, padB = 10
  const maxFs = Math.max(...prof.map((p) => p.fs), 1) * 1.05
  const X = (v: number) => padL + (v / maxFs) * (w - padL - padR)
  const Y = (z: number) => padT + (z / r.Lp) * (h - padT - padB)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Gesekan selimut terhadap kedalaman">
      <line className="dg-zero" x1={padL} y1={padT} x2={padL} y2={h - padB} />
      <polyline fill="color-mix(in srgb, var(--dg-v) 30%, transparent)" stroke="var(--dg-v)" strokeWidth={1.8} points={`${padL},${Y(0)} ${prof.map((p) => `${X(p.fs)},${Y(p.z)}`).join(' ')} ${padL},${Y(r.Lp)}`} />
      <text x={padL - 6} y={padT + 8} textAnchor="end" className="dg-note">0 m</text>
      <text x={padL - 6} y={h - padB} textAnchor="end" className="dg-note">{fx(r.Lp, 1)} m</text>
      <text x={w - padR} y={14} textAnchor="end" className="dg-note">fs maks {fx(r.fsMax, 1)} kPa</text>
      <text x={padL} y={14} className="dg-note">fs terpakai (kPa)</text>
    </svg>
  )
}

function Results({ r, stale }: { r: CptPileOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('kapasitas')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel
      title="Hasil"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'kapasitas', label: 'Kapasitas' }, { id: 'selimut', label: 'Selimut' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : tab === 'kapasitas' ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kapasitas tiang dari sondir"
                  note={r.Pw > 0 ? 'kN — garis = beban kerja' : 'kN'}
                  bars={[
                    { label: 'Ujung Qp', cap: r.Qp, dem: 0, color: 'var(--dg-m)' },
                    { label: 'Selimut Qs', cap: r.Qs, dem: 0, color: 'var(--dg-v)' },
                    { label: 'Batas Qu', cap: r.Qu, dem: 0, color: 'var(--dg-y)' },
                    { label: 'Izin Qp/FSp+Qs/FSs', cap: r.Qall, dem: r.Pw, color: 'var(--dg-v)', gov: true },
                    { label: 'Izin Qu/2,5', cap: r.QallGlobal, dem: 0, color: 'var(--dg-axis)', aux: true },
                  ]}
                />
              ) : (
                <ShaftChart r={r} w={w} h={h} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Qp / Qs', value: `${fx(r.Qp, 0)} / ${fx(r.Qs, 0)}`, unit: 'kN', sub: `qp ${fx(r.qp / 1000, 2)} MPa` },
                { label: 'Qu', value: fx(r.Qu, 0), unit: 'kN' },
                { label: `Q izin (${fx(r.FSp, 0)} / ${fx(r.FSs, 0)})`, value: fx(r.Qall, 0), unit: 'kN', sub: r.Pw > 0 ? `P/Q ${fx(r.dc, 2)}` : `global ${fx(r.QallGlobal, 0)}`, tone: r.Pw > 0 ? (r.dc <= 1 ? 'ok' : 'bad') : undefined },
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
