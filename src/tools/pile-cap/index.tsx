import { useMemo, useState } from 'react'
import type { PileCapResult } from '../../calc/pile-cap'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { CAP_BARS, CAP_COUNTS, CAP_DEFAULTS, computePileCapUI, rejectReason, validate, type PileCapUIInput } from './model'
import { pileCapReport } from './report'

const ID = 'pile-cap'

const BAR_OPTIONS = CAP_BARS.map((d) => ({ value: String(d), label: `D${d}` }))
const COUNT_OPTIONS = CAP_COUNTS.map((n) => ({ value: n, label: `${n} tiang` }))

export default function PileCap({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<PileCapUIInput>(ID, CAP_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computePileCapUI)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? pileCapReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input beban, susunan tiang, dan poer untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><PlanPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: PileCapUIInput
  setInput: (p: Partial<PileCapUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof PileCapUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={String(input[key])} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  return (
    <>
      <Card n={1} title="Beban" actions={<ResetButton onReset={onReset} />}>
        <Field label="Dasar desain" hint="Kapasitas: tiap tiang dibebani kapasitas terfaktor Q (poer sama kuat dengan tiangnya).">
          <Segmented
            ariaLabel="Dasar desain"
            value={input.mode}
            options={[
              { value: 'pu', label: 'Beban kolom' },
              { value: 'kapasitas', label: 'Kapasitas tiang' },
            ]}
            onChange={(mode) => setInput({ mode })}
          />
        </Field>
        {input.mode === 'pu' ? (
          <>
            {f('Pu', 'Pu — aksial terfaktor', 'kN')}
            {f('Mux', 'Mux — momen sumbu x', 'kN·m', 'Ditahan kopel tiang sepanjang Y.')}
            {f('Muy', 'Muy — momen sumbu y', 'kN·m', 'Ditahan kopel tiang sepanjang X.')}
          </>
        ) : (
          f('Q', 'Q — kapasitas terfaktor per tiang', 'kN')
        )}
      </Card>
      <Card n={2} title="Susunan tiang">
        <SelectField label="Jumlah tiang" value={input.n} options={COUNT_OPTIONS} onChange={(n) => setInput({ n })} />
        {f('dp', 'dp — diameter tiang', 'mm')}
        {f('s', 's — spasi pusat ke pusat', 'mm', 'Lazimnya ≥ 2,5–3 dp.')}
        {f('ov', 'Overhang pusat tiang → tepi', 'mm')}
      </Card>
      <Card n={3} title="Kolom & poer">
        {f('cx', 'cx — kolom arah X', 'mm')}
        {f('cy', 'cy — kolom arah Y', 'mm')}
        {f('h', 'h — tebal poer', 'mm')}
        {f('cov', 'Selimut ke pusat tulangan bawah', 'mm')}
      </Card>
      <Card n={4} title="Material & tulangan">
        {f('fc', "f'c — mutu beton", 'MPa')}
        {f('fy', 'fy — mutu baja', 'MPa')}
        <SelectField label="Diameter tulangan lentur" value={input.db} options={BAR_OPTIONS} onChange={(db) => setInput({ db })} />
      </Card>
    </>
  )
}

/** Denah poer: tiang (diwarnai menurut reaksi), kolom, keliling kritis pons kolom. */
function PlanPreview({ r, w, h }: { r: PileCapResult; w: number; h: number }) {
  if (w < 180 || h < 140) return null
  const Lx = r.Lx!, Ly = r.Ly!
  const padX = 50, padY = 36
  const sc = Math.min((w - 2 * padX) / Lx, (h - 2 * padY) / Ly)
  const W = Lx * sc, H = Ly * sc
  const cx = w / 2, cy = h / 2
  const X = (m: number) => cx + m * sc
  const Y = (m: number) => cy - m * sc
  const pc = r.punchCol!
  const rMax = Math.max(1e-9, r.Rmax!)
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Denah pile cap">
      <g className="bp-plate">
        <rect x={cx - W / 2} y={cy - H / 2} width={W} height={H} />
      </g>
      <rect x={X(-pc.bx / 2)} y={Y(pc.by / 2)} width={pc.bx * sc} height={pc.by * sc} fill="none" stroke="var(--dg-y)" strokeDasharray="4 3" />
      {r.piles!.map((p, i) => {
        const bad = r.R![i] < 0
        const color = bad ? 'var(--danger)' : 'var(--dg-m)'
        return (
          <g key={i}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={(r.dp! / 2) * sc} fill={`color-mix(in srgb, ${color} ${20 + 35 * Math.max(0, r.R![i]) / rMax}%, transparent)`} stroke={color} />
            <text x={X(p.x)} y={Y(p.y) + 4} textAnchor="middle" style={{ fill: 'var(--dg-ink)', fontWeight: 600 }}>
              {fx(r.R![i], 0)}
            </text>
          </g>
        )
      })}
      <rect x={X(-r.cx! / 2)} y={Y(r.cy! / 2)} width={r.cx! * sc} height={r.cy! * sc} fill="color-mix(in srgb, var(--dg-ink) 35%, transparent)" stroke="var(--dg-ink)" />
      <g className="bp-dim">
        <line x1={cx - W / 2} y1={cy + H / 2 + 14} x2={cx + W / 2} y2={cy + H / 2 + 14} />
        <text x={cx} y={cy + H / 2 + 27} textAnchor="middle">
          Lx {fx(Lx, 0)} mm
        </text>
        <line x1={cx - W / 2 - 14} y1={cy - H / 2} x2={cx - W / 2 - 14} y2={cy + H / 2} />
        <text x={cx - W / 2 - 18} y={cy + 4} textAnchor="end">
          Ly {fx(Ly, 0)}
        </text>
      </g>
      <text x={8} y={16} className="bp-label">
        Reaksi tiang (kN) · keliling pons kolom putus-putus
      </text>
    </svg>
  )
}

type Tab = 'rasio' | 'reaksi'

function RatioChart({ r, w, h }: { r: PileCapResult; w: number; h: number }) {
  const items = r.checks!
  if (w < 200 || h < 100) return null
  const padL = Math.min(150, w * 0.35), padR = 40, padT = 16, padB = 26
  const rowH = Math.min(32, (h - padT - padB) / items.length)
  const maxV = Math.max(1.2, ...items.map((x) => (Number.isFinite(x.dc) ? x.dc : 0))) * 1.05
  const X = (v: number) => padL + (v / maxV) * (w - padL - padR)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Rasio kebutuhan terhadap kapasitas">
      {items.map((it, k) => {
        const y = padT + k * rowH
        const v = Number.isFinite(it.dc) ? it.dc : maxV
        const color = v > 1 ? 'var(--danger)' : v > 0.9 ? 'var(--warning)' : 'var(--dg-v)'
        return (
          <g key={it.name}>
            <text x={padL - 8} y={y + rowH / 2 + 4} textAnchor="end" className="dg-bar-label">
              {it.name}
            </text>
            <rect x={padL} y={y + rowH * 0.2} width={Math.max(2, X(v) - padL)} height={rowH * 0.6} rx={2} fill={`color-mix(in srgb, ${color} 45%, transparent)`} stroke={color} />
            <text x={X(v) + 6} y={y + rowH / 2 + 4} className="val">
              {Number.isFinite(it.dc) ? fx(it.dc, 2) : '∞'}
            </text>
          </g>
        )
      })}
      <line x1={X(1)} y1={padT - 4} x2={X(1)} y2={padT + items.length * rowH} stroke="var(--danger)" strokeDasharray="5 3" />
      <text x={padL} y={h - 8} className="dg-note">
        Kebutuhan ÷ kapasitas — garis merah = 1,0 (batas)
      </text>
    </svg>
  )
}

function ReactionChart({ r, w, h }: { r: PileCapResult; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const R = r.R!
  const padL = 48, padR = 16, padT = 22, padB = 30
  const lo = Math.min(0, ...R) * 1.15, hi = Math.max(1, ...R) * 1.15
  const bw = (w - padL - padR) / R.length
  const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Reaksi tiang">
      {R.map((v, k) => {
        const color = v < 0 ? 'var(--danger)' : 'var(--dg-v)'
        const y0 = Y(0), y1 = Y(v)
        return (
          <g key={k}>
            <rect x={padL + k * bw + bw * 0.15} y={Math.min(y0, y1)} width={bw * 0.7} height={Math.max(1, Math.abs(y1 - y0))} fill={`color-mix(in srgb, ${color} 40%, transparent)`} stroke={color} />
            <text x={padL + k * bw + bw / 2} y={(v < 0 ? y1 + 14 : y1 - 5)} textAnchor="middle" className="dg-readout">
              {fx(v, 1)}
            </text>
            <text x={padL + k * bw + bw / 2} y={h - padB + 14} textAnchor="middle" className="dg-note">
              tiang {k + 1}
            </text>
          </g>
        )
      })}
      <line x1={padL} y1={Y(0)} x2={w - padR} y2={Y(0)} stroke="var(--dg-axis)" />
      <text x={padL} y={14} className="dg-note">
        Reaksi tiang (kN) — negatif = tarik (cabut)
      </text>
    </svg>
  )
}

function Results({ r, stale, reject }: { r: PileCapResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('rasio')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  return (
    <Panel
      title="Pemeriksaan"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'rasio', label: 'Rasio D/C' }, { id: 'reaksi', label: 'Reaksi tiang' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (!r ? null : tab === 'rasio' ? <RatioChart r={r} w={w} h={h} /> : <ReactionChart r={r} w={w} h={h} />)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Poer', value: `${fx(r.Lx, 0)} × ${fx(r.Ly, 0)}`, unit: 'mm', sub: `h ${fx(r.h, 0)} · ${r.n} tiang D${fx(r.dp, 0)}` },
                { label: 'Reaksi maks / min', value: `${fx(r.Rmax, 0)} / ${fx(r.Rmin, 0)}`, unit: 'kN', tone: r.Rmin! >= 0 ? undefined : 'bad' },
                { label: 'Tulangan X / Y', value: `${r.flexX!.nBar} / ${r.flexY!.nBar}`, unit: `D${fx(r.db, 0)}`, sub: `φMn ${fx(r.flexX!.phiMn, 0)} / ${fx(r.flexY!.phiMn, 0)} kN·m` },
                { label: 'Menentukan', value: fx(r.gov!.dc, 2), sub: r.gov!.name, tone: r.ok ? 'ok' : 'bad' },
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
