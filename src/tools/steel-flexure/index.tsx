import { useMemo, useState } from 'react'
import type { SteelFlexureResult } from '../../calc/steel-flexure'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { dcSub, GradeFields, ProfileFields, SectionSvg } from '../_steel/profile'
import { CB_OPTIONS, computeFlexure, effAxis, FLEXURE_DEFAULTS, hasAxisChoice, hasLtb, mnCurve, validate, type FlexureInput } from './model'
import { flexureReport } from './report'

const ID = 'steel-flexure'

interface Outcome {
  i: FlexureInput
  r: SteelFlexureResult
}

export default function SteelFlexure({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<FlexureInput>(ID, FLEXURE_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: FlexureInput): Outcome | null => {
    const r = computeFlexure(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const report = useMemo(() => (result ? flexureReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input profil, panjang tak-terkekang, dan momen untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><FlexurePreview r={result.r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results o={result} stale={stale} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: FlexureInput
  setInput: (p: Partial<FlexureInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const ltb = hasLtb(input)
  return (
    <>
      <Card n={1} title="Profil & mutu" actions={<ResetButton onReset={onReset} />}>
        <ProfileFields ptype={input.ptype} psize={input.psize} error={errors.psize} onChange={setInput} />
        <GradeFields value={input} errors={errors} withFu={false} onChange={setInput} />
        {hasAxisChoice(input.ptype) && (
          <Field label="Sumbu lentur">
            <Segmented
              ariaLabel="Sumbu lentur"
              value={input.axis}
              options={[
                { value: 'x', label: 'Kuat (x-x)' },
                { value: 'y', label: 'Lemah (y-y)' },
              ]}
              onChange={(axis) => setInput({ axis })}
            />
          </Field>
        )}
      </Card>
      <Card n={2} title="Kekangan lateral">
        {ltb ? (
          <>
            <NumField
              label="Lb — tak-terkekang lateral"
              unit="mm"
              value={input.Lb}
              error={errors.Lb}
              hint="Jarak antar pengaku lateral sayap tekan. 0 = terkekang penuh."
              onChange={(Lb) => setInput({ Lb })}
            />
            <SelectField label="Faktor modifikasi Cb" value={input.Cbpreset} options={CB_OPTIONS} onChange={(Cbpreset) => setInput({ Cbpreset })} />
            {input.Cbpreset === '0' && <NumField label="Cb manual" value={input.Cbval} error={errors.Cbval} onChange={(Cbval) => setInput({ Cbval })} />}
          </>
        ) : (
          <p className="muted card-note">
            Tekuk torsi-lateral tidak ditinjau untuk {effAxis(input) === 'y' ? 'lentur sumbu lemah' : 'profil ini'} — Lb dan Cb tidak berpengaruh.
          </p>
        )}
      </Card>
      <Card n={3} title="Momen">
        <NumField label="Mu — momen terfaktor (DFBK)" unit="kN·m" value={input.Mu} error={errors.Mu} hint="0 = lewati D/C." onChange={(Mu) => setInput({ Mu })} />
        <NumField label="Ma — momen layan (ASD)" unit="kN·m" value={input.Ma} error={errors.Ma} hint="0 = lewati D/C." onChange={(Ma) => setInput({ Ma })} />
      </Card>
    </>
  )
}

function FlexurePreview({ r, w, h }: { r: SteelFlexureResult; w: number; h: number }) {
  if (w < 140 || h < 110) return null
  const wide = w >= 440
  const secW = wide ? Math.min(w * 0.45, 300) : w
  const p = r.p!
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview balok lentur">
      <text x={8} y={16} className="bp-label">
        {r.ti?.name} {r.name} · {r.f!.section}
      </text>
      <SectionSvg
        p={p}
        x={0}
        y={22}
        w={secW}
        h={h - 26}
        overlay={(T) => {
          const bw = p.shape === 'pipe' ? p.D! : p.shape === 'L' ? p.a! : p.B!
          const bh = p.shape === 'pipe' ? p.D! : p.shape === 'L' ? p.a! : p.H!
          const [l, tp] = T([0, 0]), [rr, bt] = T([bw, bh]), [cx, cy] = T([bw / 2, bh / 2])
          return r.axis === 'y' ? (
            <line x1={cx} y1={tp - 12} x2={cx} y2={bt + 12} stroke="var(--dg-m)" strokeWidth={1.4} strokeDasharray="6 3 1 3" />
          ) : (
            <line x1={l - 14} y1={cy} x2={rr + 14} y2={cy} stroke="var(--dg-m)" strokeWidth={1.4} strokeDasharray="6 3 1 3" />
          )
        }}
      />
      {wide && <Segment r={r} x={secW + 8} w={w - secW - 16} h={h} />}
    </svg>
  )
}

/** Segmen balok antar pengaku lateral (Lb) dengan momen di ujung. */
function Segment({ r, x, w, h }: { r: SteelFlexureResult; x: number; w: number; h: number }) {
  const f = r.f!
  const y = h * 0.46, x0 = x + 36, x1 = x + w - 36
  const M = r.Mu! > 0 ? `Mu ${fx(r.Mu, 1)}` : r.MaDem! > 0 ? `Ma ${fx(r.MaDem, 1)}` : 'M'
  const arc = (cx: number, dir: 1 | -1) => (
    <g className="bp-arrow bp-point">
      <path d={`M${cx},${y - 20} A20,20 0 0 ${dir > 0 ? 0 : 1} ${cx},${y + 20}`} style={{ fill: 'none' }} stroke="var(--dg-load)" strokeWidth={1.6} />
      <path d={`M${cx},${y + 20} l${dir * 8},-2 l${-dir * 5},-7 Z`} />
    </g>
  )
  return (
    <g>
      <line x1={x0} y1={y} x2={x1} y2={y} className="bp-beam" />
      {arc(x0 - 6, 1)}
      {arc(x1 + 6, -1)}
      <text x={x1} y={y - 28} textAnchor="end" className="bp-pt-label" style={{ fill: 'var(--dg-load)' }}>
        {M} kN·m
      </text>
      {f.ltb ? (
        <>
          {[x0, x1].map((bx) => (
            <g key={bx} className="bp-support">
              <line x1={bx - 7} y1={y - 7} x2={bx + 7} y2={y + 7} />
              <line x1={bx - 7} y1={y + 7} x2={bx + 7} y2={y - 7} />
            </g>
          ))}
          <g className="bp-dim">
            <line x1={x0} y1={y + 36} x2={x1} y2={y + 36} />
            <line x1={x0} y1={y + 32} x2={x0} y2={y + 40} />
            <line x1={x1} y1={y + 32} x2={x1} y2={y + 40} />
            <text x={(x0 + x1) / 2} y={y + 31} textAnchor="middle">
              Lb {fx(f.Lb, 0)} mm · Cb {fx(f.Cb, 2)}
            </text>
          </g>
          <text x={(x0 + x1) / 2} y={y + 58} textAnchor="middle" className="dg-note">
            × = pengaku lateral sayap tekan · Lp {fx((f.Lp ?? 0) / 1000, 2)} m · Lr {fx((f.Lr ?? 0) / 1000, 2)} m
          </text>
        </>
      ) : (
        <text x={(x0 + x1) / 2} y={y + 36} textAnchor="middle" className="dg-note">
          tekuk torsi-lateral tidak ditinjau ({f.section})
        </text>
      )}
    </g>
  )
}

type Tab = 'kurva' | 'batas'

function limitBars(r: SteelFlexureResult): CapacityBar[] {
  const f = r.f!
  const g = f.gov
  const b: CapacityBar[] = [{ label: 'Leleh Mp', cap: 0.9 * r.Mp!, dem: r.Mu!, color: 'var(--dg-v)', gov: /Leleh|plastis/.test(g) }]
  if (f.ltb && f.Mn_ltb !== undefined) b.push({ label: 'Tekuk torsi-lateral', cap: (0.9 * f.Mn_ltb) / 1e6, dem: r.Mu!, color: 'var(--dg-m)', gov: /LTB|torsi-lateral/.test(g) })
  const flb = f.Mn_flb ?? f.Mn_f
  if (flb !== undefined) b.push({ label: 'Tekuk lokal sayap', cap: (0.9 * flb) / 1e6, dem: r.Mu!, color: 'var(--dg-y)', gov: /sayap/.test(g) })
  if (f.Mn_w !== undefined) b.push({ label: 'Tekuk lokal badan', cap: (0.9 * f.Mn_w) / 1e6, dem: r.Mu!, color: 'var(--dg-y)', gov: /badan/.test(g) })
  if (f.section === 'F6' || f.section === 'F8' || f.indicative) b.push({ label: `Desain (${f.section})`, cap: r.phiMn!, dem: r.Mu!, color: 'var(--dg-m)', gov: true })
  return b
}

/** Kurva φbMn–Lb dengan Lp, Lr, dan titik desain. */
function MnLbCurve({ o, w, h }: { o: Outcome; w: number; h: number }) {
  const { r, i } = o
  const f = r.f!
  const LbMax = Math.max(1.3 * (f.Lr ?? 0), 1.2 * (f.Lb ?? 0), 1000)
  const pts = useMemo(() => mnCurve(i, LbMax, 100), [i, LbMax])
  if (w < 160 || h < 100) return null
  const padL = 48, padR = 16, padT = 22, padB = 30
  const top = 0.9 * r.Mp! * 1.08
  const X = (lb: number) => padL + (lb / LbMax) * (w - padL - padR)
  const Y = (m: number) => h - padB - (m / top) * (h - padT - padB)
  const d = pts.map(([lb, m], k) => `${k ? 'L' : 'M'}${X(lb).toFixed(1)},${Y(0.9 * m).toFixed(1)}`).join(' ')
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * 0.9 * r.Mp!)
  const step = LbMax <= 6000 ? 1000 : LbMax <= 15000 ? 2000 : 5000
  const xt = Array.from({ length: Math.floor(LbMax / step) + 1 }, (_, k) => k * step)
  const right = f.Lb! > LbMax * 0.6
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Kurva kekuatan lentur terhadap Lb">
      {ticks.map((m) => (
        <g key={m} className="dg-axis">
          <line x1={padL} y1={Y(m)} x2={w - padR} y2={Y(m)} style={{ stroke: 'var(--dg-grid)' }} />
          <text x={padL - 6} y={Y(m) + 4} textAnchor="end">
            {fx(m, 0)}
          </text>
        </g>
      ))}
      {xt.map((lb) => (
        <text key={lb} x={X(lb)} y={h - padB + 15} textAnchor="middle" className="dg-note">
          {lb / 1000}
        </text>
      ))}
      {[
        [f.Lp, 'Lp'],
        [f.Lr, 'Lr'],
      ].map(([L, lab]) =>
        (L as number) > 0 && (L as number) <= LbMax ? (
          <g key={lab as string}>
            <line x1={X(L as number)} y1={padT} x2={X(L as number)} y2={h - padB} className="dg-sup" />
            <text x={X(L as number) + 4} y={h - padB - 6} className="dg-note">
              {lab}
            </text>
          </g>
        ) : null,
      )}
      <path d={d} fill="none" stroke="var(--dg-m)" strokeWidth={2} />
      {r.Mu! > 0 && <line x1={padL} y1={Y(r.Mu!)} x2={w - padR} y2={Y(r.Mu!)} stroke="var(--dg-load)" strokeDasharray="5 3" />}
      <g className="dg-ext">
        <circle cx={X(f.Lb!)} cy={Y(r.phiMn!)} r={5} fill="var(--bg)" stroke="var(--dg-load)" strokeWidth={2.2} />
        <text x={X(f.Lb!) + (right ? -8 : 8)} y={Y(r.phiMn!) - 9} textAnchor={right ? 'end' : 'start'}>
          φMn {fx(r.phiMn, 1)} kN·m @ Lb {fx(f.Lb! / 1000, 2)} m
        </text>
      </g>
      <text x={padL} y={14} className="dg-note">
        φbMn (kN·m) · Cb {fx(f.Cb, 2)}{r.Mu! > 0 ? ' · garis putus = Mu' : ''}
      </text>
      <text x={w - padR} y={h - 4} textAnchor="end" className="dg-note">
        Lb (m)
      </text>
    </svg>
  )
}

function Results({ o, stale }: { o: Outcome | null; stale: boolean }) {
  const r = o?.r ?? null
  const ltb = !!r?.f?.ltb
  const [tabSel, setTab] = useState<Tab>('kurva')
  const tab: Tab = ltb ? tabSel : 'batas'
  const tabs = ltb ? [{ id: 'kurva' as const, label: 'Kurva Mn–Lb' }, { id: 'batas' as const, label: 'Keadaan batas' }] : [{ id: 'batas' as const, label: 'Keadaan batas' }]
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && !(r.Mu! > 0) && !(r.MaDem! > 0) ? 'Isi Mu (DFBK) atau Ma (ASD) untuk menghitung D/C.' : null
  return (
    <Panel title="Kapasitas" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={tabs} onChange={setTab} />}>
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !o || !r ? null : tab === 'kurva' ? (
                <MnLbCurve o={o} w={w} h={h} />
              ) : (
                <CapacityBars w={w} h={h} ariaLabel="Kekuatan lentur tiap keadaan batas" note="kN·m · φbMn · garis = Mu" bars={limitBars(r)} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: `φbMn DFBK (${r.f!.gov})`, value: fx(r.phiMn, 1), unit: 'kN·m', ...dcSub(r.dcL) },
                { label: 'Mn/Ω ASD', value: fx(r.Ma, 1), unit: 'kN·m', ...dcSub(r.dcA) },
                { label: 'Momen plastis Mp', value: fx(r.Mp, 1), unit: 'kN·m', sub: `${r.f!.section} · Mn/Mp ${fx(r.Mn! / r.Mp!, 2)}` },
                ...(r.f!.ltb ? [{ label: 'Lp / Lr', value: `${fx(r.f!.Lp! / 1000, 2)} / ${fx(r.f!.Lr! / 1000, 2)}`, unit: 'm', sub: r.f!.ltbMode }] : []),
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
