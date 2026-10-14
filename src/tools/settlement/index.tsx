import { useMemo, useState } from 'react'
import { SETTLEMENT_SHAPES } from '../../calc/settlement'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { niceStep } from '../../report/figure'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computeSettlementUI, SETTLEMENT_DEFAULTS, validate, type SettlementOk, type SettlementUIInput } from './model'
import { settlementReport, timeCurve } from './report'

const ID = 'settlement'

const SHAPE_OPTIONS = SETTLEMENT_SHAPES.map(([value, label]) => ({ value, label }))

export default function Settlement({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<SettlementUIInput>(ID, SETTLEMENT_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeSettlementUI)
  const report = useMemo(() => (r ? settlementReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi geometri fondasi, tekanan neto, dan parameter tanah untuk melihat detail perhitungan."
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
  input: SettlementUIInput
  setInput: (p: Partial<SettlementUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof SettlementUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Fondasi & beban" actions={<ResetButton onReset={onReset} />}>
        <SelectField label="Bentuk" value={input.shape} options={SHAPE_OPTIONS} onChange={(shape) => setInput({ shape })} />
        {f('B', 'B — lebar / sisi / diameter', 'm', 'Persegi panjang: B = sisi pendek.')}
        {input.shape === 'rect' && f('L', 'L — panjang', 'm')}
        {f('Df', 'Df — kedalaman dasar', 'm')}
        {f('q0', 'q₀ — tekanan neto di dasar', 'kPa', 'Tekanan kerja dikurangi overburden.')}
        <Field label="Kekakuan fondasi">
          <Segmented
            ariaLabel="Kekakuan fondasi"
            value={input.rigid}
            options={[{ value: 'flex', label: 'Lentur' }, { value: 'rigid', label: 'Kaku' }]}
            onChange={(rigid) => setInput({ rigid })}
          />
        </Field>
      </Card>
      <Card n={2} title="Penurunan segera (elastis)">
        {f('Es', 'Es — modulus tanah', 'MPa')}
        {f('mu', 'μ — angka Poisson', undefined, 'Kosong = 0,3; ≥ 0,5 dipakai 0,49.')}
        {f('Hs', 'Hs — tebal lapisan termampatkan', 'm', 'Di bawah dasar fondasi. Kosong = 30.')}
        {f('If', 'If — faktor kedalaman Fox', undefined, 'Kosong = 1.')}
      </Card>
      <Card n={3} title="Konsolidasi lempung">
        <p className="muted card-note">Kosongkan tebal Hc untuk tanpa konsolidasi.</p>
        {f('ztop', 'Kedalaman puncak lempung', 'm', 'Dari permukaan tanah.')}
        {f('Hc', 'Hc — tebal lempung', 'm')}
        {f('e0', 'e₀ — angka pori awal')}
        {f('Cc', 'Cc — indeks kompresi')}
        {f('Cr', 'Cr — indeks pemampatan kembali')}
        {f('sig0', "σ′₀ — tegangan efektif tengah lempung", 'kPa')}
        {f('sigc', "σ′c — tegangan prakonsolidasi", 'kPa', "Kosong atau < σ′₀ dipakai σ′₀ (NC).")}
      </Card>
      <Card n={4} title="Laju konsolidasi">
        {f('cv', 'cv — koefisien konsolidasi', 'm²/tahun', 'Kosong = laju tidak dihitung.')}
        {f('t', 't — waktu ditinjau', 'tahun')}
        <Field label="Drainase">
          <Segmented
            ariaLabel="Drainase"
            value={input.drain}
            options={[{ value: 'double', label: 'Ganda' }, { value: 'single', label: 'Tunggal' }]}
            onChange={(drain) => setInput({ drain })}
          />
        </Field>
      </Card>
    </>
  )
}

/** Potongan: fondasi, lapisan termampatkan Hs, lempung dan dimensi. */
function Preview({ r, w, h }: { r: SettlementOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const clay = r.consol.active ? r.consol : null
  const hs = Math.min(r.Hs, 5 * r.B)
  const depth = Math.max(r.Df + hs, clay ? clay.ztop + clay.Hc : 0) + 0.3
  const padL = 110, padR = 40, padT = 40, padB = 40
  const sc = Math.min((w - padL - padR) / (3 * r.B), (h - padT - padB) / depth)
  const cx = padL + (w - padL - padR) / 2, Bs = r.B * sc
  const xL = padL - 30, xR = w - padR + 10
  const yg = padT, yb = yg + r.Df * sc, yH = yb + hs * sc, yEnd = yg + depth * sc
  const tF = Math.max(7, Math.min(Bs * 0.18, 24))
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Potongan fondasi dan lapisan tanah">
      <rect x={xL} y={yg} width={xR - xL} height={yEnd - yg} fill="color-mix(in srgb, var(--dg-axis) 14%, transparent)" />
      <line x1={xL} y1={yg} x2={xR} y2={yg} stroke="var(--dg-axis)" />
      {clay && (
        <g>
          <rect x={xL} y={yg + clay.ztop * sc} width={xR - xL} height={clay.Hc * sc} fill="color-mix(in srgb, var(--dg-m) 28%, transparent)" stroke="var(--dg-m)" />
          <text x={xR - 6} y={yg + (clay.ztop + clay.Hc / 2) * sc + 4} textAnchor="end" style={{ fill: 'var(--dg-m)' }}>
            lempung Hc {fx(clay.Hc, 2)} m
          </text>
        </g>
      )}
      <line x1={xL} y1={yH} x2={xR} y2={yH} stroke="var(--dg-axis)" strokeDasharray="5 4" />
      <rect x={cx - Bs * 0.1} y={yb - tF - 14} width={Bs * 0.2} height={14} fill="color-mix(in srgb, var(--dg-ink) 30%, transparent)" stroke="var(--dg-ink)" />
      <g className="bp-plate">
        <rect x={cx - Bs / 2} y={yb - tF} width={Bs} height={tF} />
      </g>
      <path d={`M${cx},${yb + 4} L${cx},${yb + Math.min(40, (yH - yb) / 2)}`} stroke="var(--dg-v)" strokeWidth={2} markerEnd="url(#set-arr)" fill="none" />
      <defs>
        <marker id="set-arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--dg-v)" />
        </marker>
      </defs>
      <g className="bp-dim">
        <line x1={cx - Bs / 2} y1={yb - tF - 22} x2={cx + Bs / 2} y2={yb - tF - 22} />
        <text x={cx} y={yb - tF - 27} textAnchor="middle">B {fx(r.B, 2)} m · q₀ {fx(r.q0, 0)} kPa</text>
        <line x1={xL + 22} y1={yg} x2={xL + 22} y2={yb} />
        <text x={xL + 18} y={(yg + yb) / 2 + 4} textAnchor="end">Df {fx(r.Df, 2)} m</text>
        <line x1={xL + 22} y1={yb} x2={xL + 22} y2={yH} />
        <text x={xL + 18} y={(yb + yH) / 2 + 4} textAnchor="end">Hs {fx(r.Hs, 1)} m</text>
      </g>
      <text x={8} y={16} className="bp-label">
        Potongan · lapisan termampatkan Hs putus-putus
      </text>
    </svg>
  )
}

type Tab = 'total' | 'waktu'

/** Batang S_e, S_c, S_total (mm). */
function TotalChart({ r, w, h }: { r: SettlementOk; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const items = [
    { l: 'Segera Se', v: r.Se, c: 'var(--dg-v)' },
    { l: 'Konsolidasi Sc', v: r.Sc, c: 'var(--dg-m)' },
    { l: 'Total', v: r.Stotal, c: 'var(--dg-y)' },
  ]
  const padL = 110, padR = 60, padT = 22, padB = 28
  const maxV = Math.max(1e-9, r.Stotal) * 1.05
  const X = (v: number) => padL + (v / maxV) * (w - padL - padR)
  const rowH = Math.min(36, (h - padT - padB) / items.length)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Penurunan segera, konsolidasi dan total">
      {items.map((it, k) => {
        const y = padT + k * rowH + rowH * 0.2
        return (
          <g key={it.l}>
            <text x={padL - 8} y={y + rowH * 0.3 + 4} textAnchor="end" className="dg-bar-label">{it.l}</text>
            <rect x={padL} y={y} width={Math.max(2, X(it.v) - padL)} height={rowH * 0.6} rx={2} fill={`color-mix(in srgb, ${it.c} 40%, transparent)`} stroke={it.c} />
            <text x={X(it.v) + 6} y={y + rowH * 0.3 + 4} className="val">{fx(it.v, 1)}</text>
          </g>
        )
      })}
      <text x={padL} y={h - 8} className="dg-note">Penurunan (mm)</text>
    </svg>
  )
}

/** Kurva waktu–penurunan (sumbu penurunan ke bawah). */
function TimeChart({ r, w, h }: { r: SettlementOk; w: number; h: number }) {
  const cur = timeCurve(r)
  if (w < 200 || h < 100) return null
  if (!cur) return <p className="muted" style={{ padding: 12 }}>Isi cv dan data lempung untuk melihat kurva waktu–penurunan.</p>
  const padL = 56, padR = 20, padT = 28, padB = 16
  const Smax = r.Stotal * 1.05
  const X = (t: number) => padL + (t / cur.tMax) * (w - padL - padR)
  const Y = (s: number) => padT + (s / Smax) * (h - padT - padB)
  const st = niceStep(cur.tMax, 5)
  const ticks: number[] = []
  for (let t = 0; t <= cur.tMax + 1e-9; t += st) ticks.push(t)
  const rt = r.rate.active ? r.rate : null
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Kurva waktu terhadap penurunan">
      <line className="dg-zero" x1={padL} y1={padT} x2={w - padR} y2={padT} />
      {ticks.map((t) => (
        <text key={t} x={X(t)} y={padT - 6} textAnchor="middle" className="dg-note">{fx(t, st < 1 ? 1 : 0)}</text>
      ))}
      <text x={w - padR} y={12} textAnchor="end" className="dg-note">t (tahun)</text>
      <line x1={padL} y1={Y(r.Se)} x2={w - padR} y2={Y(r.Se)} stroke="var(--dg-axis)" strokeDasharray="4 3" />
      <text x={padL - 6} y={Y(r.Se) + 4} textAnchor="end" className="dg-note">Se {fx(r.Se, 1)}</text>
      <text x={padL - 6} y={Y(r.Stotal) + 4} textAnchor="end" className="dg-note">{fx(r.Stotal, 1)} mm</text>
      <polyline fill="none" stroke="var(--dg-v)" strokeWidth={2} points={cur.t.map((t, k) => `${X(t)},${Y(cur.S[k])}`).join(' ')} />
      {rt && rt.t !== undefined && rt.St !== undefined && (
        <g>
          <circle cx={X(rt.t)} cy={Y(rt.St)} r={4} fill="var(--dg-load)" />
          <text x={X(rt.t) + 7} y={Y(rt.St) + 14} style={{ fill: 'var(--dg-load)' }}>
            t {fx(rt.t, 2)} th · {fx(rt.St, 1)} mm
          </text>
        </g>
      )}
    </svg>
  )
}

function Results({ r, stale }: { r: SettlementOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('total')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel
      title="Hasil"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'total', label: 'Penurunan' }, { id: 'waktu', label: 'Waktu' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (!r ? null : tab === 'total' ? <TotalChart r={r} w={w} h={h} /> : <TimeChart r={r} w={w} h={h} />)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Segera Se', value: fx(r.Se, 1), unit: 'mm', sub: r.rigid ? 'fondasi kaku' : 'pusat, lentur' },
                { label: 'Konsolidasi Sc', value: fx(r.Sc, 1), unit: 'mm', sub: r.consol.active ? r.consol.mode : 'tanpa lempung' },
                { label: 'Total', value: fx(r.Stotal, 1), unit: 'mm' },
                ...(r.rate.active && r.rate.St !== undefined
                  ? [{ label: `S pada t = ${fx(r.rate.t, 2)} th`, value: fx(r.rate.St, 1), unit: 'mm', sub: `U ${fx((r.rate.U ?? 0) * 100, 0)}%` }]
                  : []),
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
