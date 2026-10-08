import { useMemo, useState } from 'react'
import { sectionLabel, type ColumnPMResult } from '../../calc/column-pm'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { COL_BARS, COLUMN_DEFAULTS, computeColumn, rejectReason, SHAPES, uniaxialCurve, validate, type ColumnInput } from './model'
import { columnReport } from './report'

const ID = 'column-pm'

export default function ColumnPM({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<ColumnInput>(ID, COLUMN_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeColumn)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? columnReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input penampang, tulangan, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><SectionPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: ColumnInput
  setInput: (p: Partial<ColumnInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const s = input.shape
  return (
    <>
      <Card n={1} title="Penampang" actions={<ResetButton onReset={onReset} />}>
        <Field label="Bentuk">
          <Segmented ariaLabel="Bentuk penampang" value={s} options={SHAPES} onChange={(shape) => setInput({ shape })} />
        </Field>
        {s === 'circle' ? (
          <NumField label="Diameter D" unit="mm" value={input.D} error={errors.D} onChange={(D) => setInput({ D })} />
        ) : (
          <>
            <NumField label={s === 'rect' ? 'Lebar b' : 'Lebar B'} unit="mm" value={input.b} error={errors.b} onChange={(b) => setInput({ b })} />
            <NumField label={s === 'rect' ? 'Tinggi h' : 'Tinggi H'} unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />
          </>
        )}
        {s === 'L' && (
          <>
            <NumField label="Tebal kaki vertikal tx" unit="mm" value={input.tx} error={errors.tx} onChange={(tx) => setInput({ tx })} />
            <NumField label="Tebal kaki horizontal ty" unit="mm" value={input.ty} error={errors.ty} onChange={(ty) => setInput({ ty })} />
          </>
        )}
        {s === 'T' && (
          <>
            <NumField label="Lebar badan bw" unit="mm" value={input.bw} error={errors.bw} onChange={(bw) => setInput({ bw })} />
            <NumField label="Tebal sayap tf" unit="mm" value={input.tf} error={errors.tf} onChange={(tf) => setInput({ tf })} />
          </>
        )}
        <NumField label="d' — selimut ke pusat tulangan" unit="mm" value={input.dp} error={errors.dp} hint="cc + Ø sengkang + db/2 (≈ 60 mm untuk cc 40, Ø10, D19)." onChange={(dp) => setInput({ dp })} />
      </Card>
      <Card n={2} title="Material & tulangan">
        <NumField label="f'c" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        <SelectField label="Diameter batang" value={input.db} options={COL_BARS.map((d) => ({ value: String(d), label: `D${d}` }))} onChange={(db) => setInput({ db })} />
        {s === 'rect' && (
          <>
            <NumField label="Batang per muka lebar (nx)" value={input.nx} error={errors.nx} hint="Termasuk sudut." onChange={(nx) => setInput({ nx })} />
            <NumField label="Batang per muka tinggi (ny)" value={input.ny} error={errors.ny} hint="Termasuk sudut. Total = 2nx + 2(ny − 2)." onChange={(ny) => setInput({ ny })} />
          </>
        )}
        {s === 'circle' && <NumField label="Jumlah batang keliling" value={input.ncirc} error={errors.ncirc} onChange={(ncirc) => setInput({ ncirc })} />}
        {(s === 'L' || s === 'T') && (
          <NumField label="Spasi maksimum keliling" unit="mm" value={input.spac} error={errors.spac} hint="Batang sudut selalu ada; sisi disisipi agar spasi ≤ nilai ini." onChange={(spac) => setInput({ spac })} />
        )}
        <Field label="Pengikat">
          <Segmented
            ariaLabel="Pengikat"
            value={input.tie}
            options={[
              { value: 'tie', label: 'Sengkang ikat' },
              { value: 'spiral', label: 'Spiral' },
            ]}
            onChange={(tie) => setInput({ tie })}
          />
        </Field>
      </Card>
      <Card n={3} title="Beban terfaktor">
        <NumField label="Aksial Pu" unit="kN" value={input.Pu} error={errors.Pu} hint="Tekan positif." onChange={(Pu) => setInput({ Pu })} />
        <NumField label="Mux (thd sumbu-x)" unit="kN·m" value={input.Mux} error={errors.Mux} hint="Menekan sisi atas/bawah (arah tinggi h)." onChange={(Mux) => setInput({ Mux })} />
        <NumField label="Muy (thd sumbu-y)" unit="kN·m" value={input.Muy} error={errors.Muy} hint="0 = uniaksial. Sudah termasuk pembesaran momen bila langsing." onChange={(Muy) => setInput({ Muy })} />
      </Card>
    </>
  )
}

function SectionPreview({ r, w, h }: { r: ColumnPMResult; w: number; h: number }) {
  if (w < 140 || h < 110) return null
  const xs = r.poly!.map((p) => p.x), ys = r.poly!.map((p) => p.y)
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys)
  const sc = Math.min((w - 90) / bw, (h - 56) / bh)
  const cx = w / 2, cy = 26 + (h - 56) / 2
  const T = (x: number, y: number) => `${(cx + x * sc).toFixed(1)},${(cy - y * sc).toFixed(1)}`
  const tieOff = Math.max(10, r.dp - r.db / 2 - 5)
  const ring = r.ring?.(tieOff)
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Penampang kolom">
      <text x={8} y={16} className="bp-label">
        {sectionLabel(r)} · {r.nBars}D{r.db} · ρg {fx(r.rho! * 100, 2)}%
      </text>
      <g className="bp-plate">
        <path d={`M${r.poly!.map((p) => T(p.x, p.y)).join(' L')} Z`} />
      </g>
      {ring?.type === 'circle' && <circle cx={cx} cy={cy} r={ring.r * sc} fill="none" stroke="var(--dg-axis)" strokeDasharray={r.tie === 'spiral' ? '6 3' : undefined} />}
      {ring?.type === 'poly' && <path d={`M${ring.pts.map((p) => T(p.x, p.y)).join(' L')} Z`} fill="none" stroke="var(--dg-axis)" />}
      {!ring && <rect x={cx - (bw / 2 - tieOff) * sc} y={cy - (bh / 2 - tieOff) * sc} width={(bw - 2 * tieOff) * sc} height={(bh - 2 * tieOff) * sc} rx={4} fill="none" stroke="var(--dg-axis)" />}
      {r.bars!.map((b, k) => (
        <circle key={k} cx={cx + b.x * sc} cy={cy - b.y * sc} r={Math.max(2.5, (r.db * sc) / 2)} fill="var(--dg-ink)" />
      ))}
      <line x1={cx - (bw / 2) * sc - 16} y1={cy} x2={cx + (bw / 2) * sc + 16} y2={cy} stroke="var(--dg-m)" strokeDasharray="6 3 1 3" />
      <line x1={cx} y1={cy - (bh / 2) * sc - 10} x2={cx} y2={cy + (bh / 2) * sc + 10} stroke="var(--dg-y)" strokeDasharray="6 3 1 3" />
      <text x={cx + (bw / 2) * sc + 20} y={cy + 4} style={{ fill: 'var(--dg-m)', fontWeight: 600 }}>
        x
      </text>
      <text x={cx + 4} y={cy - (bh / 2) * sc - 12} style={{ fill: 'var(--dg-y)', fontWeight: 600 }}>
        y
      </text>
    </svg>
  )
}

type Tab = 'x' | 'y' | 'biax'

/** Diagram P–M uniaksial: desain (isi) & nominal (putus), titik beban. */
function PMChart({ r, axis, w, h }: { r: ColumnPMResult; axis: 'x' | 'y'; w: number; h: number }) {
  const des = useMemo(() => uniaxialCurve(r, axis), [r, axis])
  const nom = useMemo(() => uniaxialCurve(r, axis, true), [r, axis])
  if (w < 160 || h < 100) return null
  const Mu = axis === 'x' ? r.Mux : r.Muy
  const Mmax = Math.max(1, ...nom.map((p) => Math.abs(p[0])), Math.abs(Mu)) * 1.1
  const Pmax = Math.max(r.Po!, r.Pu) * 1.05, Pmin = Math.min(r.Pnt!, r.Pu) * 1.1
  const padL = 52, padR = 16, padT = 20, padB = 26
  const X = (m: number) => padL + ((m + Mmax) / (2 * Mmax)) * (w - padL - padR)
  const Y = (p: number) => padT + ((Pmax - p) / (Pmax - Pmin)) * (h - padT - padB)
  const path = (pts: [number, number][]) => `M${pts.map(([m, p]) => `${X(m).toFixed(1)},${Y(p).toFixed(1)}`).join(' L')} Z`
  const bad = r.dc != null && r.dc > 1
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={`Diagram P–M${axis}`}>
      <line x1={padL} y1={Y(0)} x2={w - padR} y2={Y(0)} className="dg-zero" />
      <line x1={X(0)} y1={padT} x2={X(0)} y2={h - padB} className="dg-zero" />
      <path d={path(nom)} fill="none" stroke="var(--dg-axis)" strokeDasharray="4 3" />
      <path d={path(des)} fill="color-mix(in srgb, var(--dg-m) 14%, transparent)" stroke="var(--dg-m)" strokeWidth={2} />
      {[r.phiPnMax!, 0, r.phiPnt!].map((p) => (
        <text key={p} x={padL - 6} y={Y(p) + 4} textAnchor="end" className="dg-note">
          {fx(p, 0)}
        </text>
      ))}
      <g className="dg-ext">
        <circle cx={X(Mu)} cy={Y(r.Pu)} r={5} fill="var(--bg)" stroke={bad ? 'var(--danger)' : 'var(--dg-load)'} strokeWidth={2.2} />
        <text x={X(Mu) + (Mu > Mmax * 0.4 ? -9 : 9)} y={Y(r.Pu) - 9} textAnchor={Mu > Mmax * 0.4 ? 'end' : 'start'}>
          Pu {fx(r.Pu, 0)} · Mu{axis} {fx(Mu, 0)}
        </text>
      </g>
      <text x={padL} y={14} className="dg-note">
        P (kN) · M{axis} ± {fx(Mmax / 1.1, 0)} kN·m · garis tebal = φPn–φMn, putus = nominal
      </text>
    </svg>
  )
}

/** Kontur kapasitas Mx–My pada P = Pu, titik beban. */
function Contour({ r, w, h }: { r: ColumnPMResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const c = r.contour ?? []
  if (c.length < 8)
    return (
      <p className="muted card-note" style={{ padding: 12 }}>
        Kontur biaksial tidak tersedia: Pu di luar rentang φPnt…φPn,maks.
      </p>
    )
  const Mmax = Math.max(1, ...c.map((p) => Math.max(Math.abs(p.Mx), Math.abs(p.My))), Math.abs(r.Mux), Math.abs(r.Muy)) * 1.1
  const R = Math.min(w, h - 30) / 2 - 12, cx = w / 2, cy = 22 + R
  const T = (mx: number, my: number) => [cx + (my / Mmax) * R, cy - (mx / Mmax) * R] as const
  const d = `M${c.map((p) => T(p.Mx, p.My).map((v) => v.toFixed(1)).join(',')).join(' L')} Z`
  const [lx, ly] = T(r.Mux, r.Muy)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Kontur momen biaksial">
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} className="dg-zero" />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} className="dg-zero" />
      <path d={d} fill="color-mix(in srgb, var(--dg-m) 14%, transparent)" stroke="var(--dg-m)" strokeWidth={2} />
      <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="var(--dg-load)" strokeDasharray="4 3" />
      {r.capM && <circle cx={T(r.capM.Mx, r.capM.My)[0]} cy={T(r.capM.Mx, r.capM.My)[1]} r={4} fill="none" stroke="var(--dg-ink)" />}
      <circle cx={lx} cy={ly} r={5} fill="var(--bg)" stroke={r.dc! > 1 ? 'var(--danger)' : 'var(--dg-load)'} strokeWidth={2.2} />
      <text x={8} y={14} className="dg-note">
        P = {fx(r.Pu, 0)} kN · ↑ φMnx · → φMny · ± {fx(Mmax / 1.1, 0)} kN·m
      </text>
    </svg>
  )
}

function Results({ r, stale, reject }: { r: ColumnPMResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('x')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  return (
    <Panel
      title="Diagram interaksi"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'x', label: 'P–Mx' }, { id: 'y', label: 'P–My' }, { id: 'biax', label: 'Mx–My' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (!r ? null : tab === 'biax' ? <Contour r={r} w={w} h={h} /> : <PMChart r={r} axis={tab} w={w} h={h} />)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                ...(r.dc != null ? [{ label: 'D/C kolom', value: fx(r.dc, 2), sub: r.dc <= 1 ? 'di dalam permukaan desain' : 'di luar permukaan', tone: r.dc <= 1 ? ('ok' as const) : ('bad' as const) }] : []),
                { label: 'φPn,maks / φPnt', value: `${fx(r.phiPnMax, 0)} / ${fx(r.phiPnt, 0)}`, unit: 'kN' },
                { label: 'φMn0 x / y (P = 0)', value: `${fx(r.M0x, 0)} / ${fx(r.M0y, 0)}`, unit: 'kN·m' },
                { label: 'Seimbang x', value: `${fx(r.PbalX, 0)} kN`, sub: `Mb ${fx(r.MbalX, 0)} kN·m` },
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
