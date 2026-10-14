import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computePileUI, MAX_LAYERS, newLayer, PILE_DEFAULTS, validate, type PileLayerUI, type PileOk, type PileUIInput } from './model'
import { methodName, pileReport, soilName } from './report'

const ID = 'pile-capacity'

export default function PileCapacity({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<PileUIInput>(ID, PILE_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computePileUI)
  const report = useMemo(() => (r ? pileReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data tiang dan minimal satu lapis tanah untuk melihat detail perhitungan."
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
  input: PileUIInput
  setInput: (p: Partial<PileUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: 'D' | 'L' | 'Dw' | 'FS', label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  const setLayer = (k: number, p: Partial<PileLayerUI>) => setInput({ layers: input.layers.map((ly, i) => (i === k ? { ...ly, ...p } : ly)) })
  return (
    <>
      <Card n={1} title="Tiang" actions={<ResetButton onReset={onReset} />}>
        <SelectField
          label="Penampang"
          value={input.shape}
          options={[{ value: 'circular', label: 'Bulat' }, { value: 'square', label: 'Persegi' }]}
          onChange={(shape) => setInput({ shape })}
        />
        {f('D', input.shape === 'square' ? 'D — sisi' : 'D — diameter', 'm')}
        {f('L', 'L — panjang tertanam', 'm', 'Dari permukaan tanah ke ujung tiang.')}
        <Field label="Jenis">
          <Segmented ariaLabel="Jenis tiang" value={input.ptype} options={[{ value: 'driven', label: 'Pancang' }, { value: 'bored', label: 'Bor' }]} onChange={(ptype) => setInput({ ptype })} />
        </Field>
        <Field label="Bahan">
          <Segmented ariaLabel="Bahan tiang" value={input.material} options={[{ value: 'concrete', label: 'Beton' }, { value: 'steel', label: 'Baja' }]} onChange={(material) => setInput({ material })} />
        </Field>
      </Card>
      <Card n={2} title="Muka air & faktor keamanan">
        {f('Dw', 'Dw — kedalaman muka air', 'm', 'Besar (mis. 99) = tanpa air.')}
        {f('FS', 'FS — faktor keamanan', undefined, 'Kosong/0 = 2,5.')}
        <Field label="Berat sendiri tiang">
          <Segmented ariaLabel="Berat sendiri" value={input.inclW} options={[{ value: 'no', label: 'Diabaikan' }, { value: 'yes', label: 'Dikurangkan' }]} onChange={(inclW) => setInput({ inclW })} />
        </Field>
      </Card>
      <Card n={3} title="Lapisan tanah (dari permukaan)">
        {errors.layers && <p className="msg bad">{errors.layers}</p>}
        {input.layers.map((ly, k) => {
          const e = (key: keyof PileLayerUI) => errors[`layers.${k}.${key}`]
          const lf = (key: 'H' | 'gamma' | 'cu' | 'phi' | 'N', label: string, unit?: string, hint?: string) => (
            <NumField label={label} unit={unit} hint={hint} value={ly[key]} error={e(key)} onChange={(v) => setLayer(k, { [key]: v })} />
          )
          return (
            <div key={k} className="layer-block" style={{ borderTop: k ? '1px solid var(--border, #ddd)' : undefined, paddingTop: k ? 10 : 0, marginTop: k ? 10 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong>Lapis {k + 1}</strong>
                <button type="button" className="icon-btn" aria-label={`Hapus lapis ${k + 1}`} title="Hapus" onClick={() => setInput({ layers: input.layers.filter((_, i) => i !== k) })}>
                  <Trash2 size={14} />
                </button>
              </div>
              <SelectField
                label="Tanah"
                value={ly.soil}
                options={[{ value: 'clay', label: 'Lempung' }, { value: 'sand', label: 'Pasir' }]}
                onChange={(soil) => setLayer(k, { soil, ...(soil === 'clay' && Number(ly.cu) === 0 ? { cu: '40' } : {}), ...(soil === 'sand' && Number(ly.phi) === 0 ? { phi: '32' } : {}) })}
              />
              <SelectField
                label="Metode selimut & ujung"
                value={ly.method}
                options={[{ value: 'static', label: ly.soil === 'clay' ? 'Statik (α, 9cu)' : 'Statik (β, Nq)' }, { value: 'spt', label: 'SPT (Meyerhof)' }]}
                onChange={(method) => setLayer(k, { method })}
              />
              {lf('H', 'H — tebal', 'm')}
              {lf('gamma', 'γ — berat isi', 'kN/m³')}
              {ly.method === 'static' && (ly.soil === 'clay' ? lf('cu', 'cu — kuat geser', 'kPa') : lf('phi', 'φ — sudut geser', '°'))}
              {lf('N', 'N-SPT', undefined, ly.method === 'spt' ? 'Dipakai untuk fs & qp.' : 'Opsional — untuk pembanding Decourt–Quaresma.')}
            </div>
          )
        })}
        <button type="button" className="btn small" disabled={input.layers.length >= MAX_LAYERS} onClick={() => setInput({ layers: [...input.layers, newLayer()] })} style={{ marginTop: 10 }}>
          <Plus size={14} /> Tambah lapis
        </button>
      </Card>
    </>
  )
}

/** Profil tanah, tiang, MAT dan dimensi. */
function Preview({ r, w, h }: { r: PileOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const padT = 36, padB = 24, padL = 180, padR = 110
  const sc = Math.min((h - padT - padB) / r.totalH, 40)
  const W = Math.min(w - padL - padR, 220)
  const x0 = padL
  const cx = x0 + W / 2
  const pw = Math.max(8, Math.min(r.D * sc * 1.6, W * 0.25))
  let z = 0
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Profil tanah dan tiang">
      {r.layers.map((ly, k) => {
        const y = padT + z * sc
        z += ly.H
        return (
          <g key={k}>
            <rect x={x0} y={y} width={W} height={ly.H * sc} fill={ly.soil === 'clay' ? 'color-mix(in srgb, var(--dg-m) 26%, transparent)' : 'color-mix(in srgb, var(--dg-axis) 14%, transparent)'} stroke="var(--dg-axis)" strokeWidth={0.5} />
            <text x={x0 - 6} y={y + (ly.H * sc) / 2 + 4} textAnchor="end">
              {k + 1}. {soilName(ly.soil)} · {methodName(ly.method)} · {fx(ly.H, 1)} m
            </text>
          </g>
        )
      })}
      {r.Dw < r.totalH && (
        <g>
          <line x1={x0} y1={padT + r.Dw * sc} x2={x0 + W} y2={padT + r.Dw * sc} stroke="var(--dg-load)" strokeDasharray="6 4" />
          <text x={x0 + W + 6} y={padT + r.Dw * sc + 4} style={{ fill: 'var(--dg-load)' }}>MAT {fx(r.Dw, 1)} m</text>
        </g>
      )}
      <g className="bp-plate">
        <rect x={cx - pw / 2} y={padT - 12} width={pw} height={r.Leff * sc + 12} />
      </g>
      <g className="bp-dim">
        <line x1={x0 + W + 70} y1={padT} x2={x0 + W + 70} y2={padT + r.Leff * sc} />
        <text x={x0 + W + 74} y={padT + (r.Leff * sc) / 2 + 4}>L {fx(r.Leff, 1)} m</text>
      </g>
      <text x={8} y={16} className="bp-label">
        Profil tanah & tiang · D {fx(r.D, 2)} m
      </text>
    </svg>
  )
}

type Tab = 'kapasitas' | 'selimut'

/** fs tiap segmen selimut terhadap kedalaman. */
function ShaftChart({ r, w, h }: { r: PileOk; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const padL = 52, padR = 56, padT = 24, padB = 10
  const maxFs = Math.max(...r.segs.map((s) => s.fs), 1) * 1.05
  const sc = (h - padT - padB) / r.Leff
  const X = (v: number) => padL + (v / maxFs) * (w - padL - padR)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Gesekan selimut per lapis">
      <line className="dg-zero" x1={padL} y1={padT} x2={padL} y2={h - padB} />
      {r.segs.map((s) => (
        <g key={`${s.idx}-${s.top}`}>
          <rect x={padL} y={padT + s.top * sc + 1} width={Math.max(2, X(s.fs) - padL)} height={Math.max(2, s.dL * sc - 2)} fill="color-mix(in srgb, var(--dg-v) 40%, transparent)" stroke="var(--dg-v)" />
          <text x={X(s.fs) + 6} y={padT + (s.top + s.dL / 2) * sc + 4} className="val">{fx(s.fs, 1)}</text>
          <text x={padL - 6} y={padT + s.top * sc + 10} textAnchor="end" className="dg-note">{fx(s.top, 1)} m</text>
        </g>
      ))}
      <text x={padL} y={14} className="dg-note">fs per lapis (kPa) — kedalaman ke bawah</text>
    </svg>
  )
}

function Results({ r, stale }: { r: PileOk | null; stale: boolean }) {
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
                  ariaLabel="Kapasitas tiang"
                  note="Kapasitas (kN)"
                  bars={[
                    { label: 'Selimut Qs', cap: r.Qs, dem: 0, color: 'var(--dg-v)' },
                    { label: 'Ujung Qp', cap: r.Qp, dem: 0, color: 'var(--dg-m)' },
                    { label: 'Batas Qu', cap: r.Qu, dem: 0, color: 'var(--dg-y)', gov: true },
                    { label: `Izin Qu/FS`, cap: r.Qallow, dem: 0, color: 'var(--dg-v)', gov: true },
                    ...(r.dq.active ? [{ label: 'Qu Decourt–Quaresma', cap: r.dq.QuDq, dem: 0, color: 'var(--dg-axis)', aux: true }] : []),
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
                { label: 'Qs / Qp', value: `${fx(r.Qs, 0)} / ${fx(r.Qp, 0)}`, unit: 'kN', sub: `qp ${fx(r.qp, 0)} kPa` },
                { label: 'Qu', value: fx(r.Qu, 0), unit: 'kN' },
                { label: `Q izin (FS ${fx(r.FS, 1)})`, value: fx(r.Qallow, 0), unit: 'kN', sub: r.inclW ? 'dikurangi Wp' : undefined },
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
