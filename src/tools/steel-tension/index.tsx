import { useMemo, useState } from 'react'
import type { SteelTensionResult } from '../../calc/steel-tension'
import { getProfile, tGov } from '../../calc/shared/steel-profiles'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { dcSub, GradeFields, ProfileFields, SectionSvg } from '../_steel/profile'
import type { Pt } from '../_steel/section'
import { computeTension, parseNum, TENSION_DEFAULTS, U_OPTIONS, validate, type TensionInput } from './model'
import { tensionReport } from './report'

const ID = 'steel-tension'

export default function SteelTension({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<TensionInput>(ID, TENSION_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: TensionInput) => {
    const r = computeTension(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const r = result?.r ?? null
  const report = useMemo(() => (result ? tensionReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input profil, sambungan, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><TensionPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: TensionInput
  setInput: (p: Partial<TensionInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const bolt = input.conn === 'bolt'
  const prof = getProfile(input.ptype, input.psize)
  const tAuto = prof && !(parseNum(input.tHole) ?? 0) ? tGov(input.ptype, prof) : null
  return (
    <>
      <Card n={1} title="Profil & mutu" actions={<ResetButton onReset={onReset} />}>
        <ProfileFields ptype={input.ptype} psize={input.psize} error={errors.psize} onChange={setInput} />
        <GradeFields value={input} errors={errors} withFu onChange={setInput} />
      </Card>
      <Card n={2} title="Sambungan ujung">
        <Field label="Jenis sambungan">
          <Segmented
            ariaLabel="Jenis sambungan"
            value={input.conn}
            options={[
              { value: 'bolt', label: 'Baut' },
              { value: 'weld', label: 'Las' },
            ]}
            onChange={(conn) => setInput({ conn })}
          />
        </Field>
        {bolt && (
          <>
            <NumField label="Jumlah lubang (penampang kritis)" value={input.nHole} error={errors.nHole} onChange={(nHole) => setInput({ nHole })} />
            <NumField label="Diameter baut" unit="mm" value={input.db} error={errors.db} onChange={(db) => setInput({ db })} />
            <NumField label="Kelonggaran lubang" unit="mm" value={input.hole} error={errors.hole} hint="Lubang standar: +2 mm (d < 24), +3 mm (d ≥ 24)." onChange={(hole) => setInput({ hole })} />
            <NumField label="Tebal elemen berlubang" unit="mm" value={input.tHole} error={errors.tHole} hint="0 = otomatis dari library (tebal elemen tersambung)." onChange={(tHole) => setInput({ tHole })} />
            {tAuto !== null && <p className="muted card-note">Tebal otomatis: {fx(tAuto, 1)} mm</p>}
          </>
        )}
        <SelectField label="Shear lag U" value={input.Upreset} options={U_OPTIONS} onChange={(Upreset) => setInput({ Upreset })} />
        {input.Upreset === '0' && <NumField label="U manual" value={input.Uval} error={errors.Uval} onChange={(Uval) => setInput({ Uval })} />}
      </Card>
      <Card n={3} title="Batang & beban">
        <NumField label="Panjang batang L" unit="mm" value={input.L} error={errors.L} hint="Untuk cek kelangsingan L/r ≤ 300." onChange={(L) => setInput({ L })} />
        <NumField label="Pu — tarik terfaktor (DFBK)" unit="kN" value={input.Pu} error={errors.Pu} hint="0 = lewati D/C." onChange={(Pu) => setInput({ Pu })} />
        <NumField label="Pa — tarik layan (ASD)" unit="kN" value={input.Pa} error={errors.Pa} hint="0 = lewati D/C." onChange={(Pa) => setInput({ Pa })} />
      </Card>
    </>
  )
}

/** Posisi lubang skematis di elemen tersambung (mm, koordinat penampang). */
function holePositions(r: SteelTensionResult): Pt[] {
  const p = r.p!, n = r.conn === 'bolt' ? Math.min(r.nHole ?? 0, 8) : 0
  if (!n || p.shape === 'pipe') return []
  const spread = (k: number, m: number, len: number) => (len * (k + 1)) / (m + 1)
  const out: Pt[] = []
  if (p.shape === 'I') {
    const top = Math.ceil(n / 2), bot = n - top
    for (let k = 0; k < top; k++) out.push([spread(k, top, p.B!), p.tf! / 2])
    for (let k = 0; k < bot; k++) out.push([spread(k, bot, p.B!), p.H! - p.tf! / 2])
  } else if (p.shape === 'C') for (let k = 0; k < n; k++) out.push([(p.tw ?? p.t) / 2, spread(k, n, p.H!)])
  else if (p.shape === 'L') for (let k = 0; k < n; k++) out.push([p.t / 2, spread(k, n, p.a!)])
  else for (let k = 0; k < n; k++) out.push([p.t / 2, spread(k, n, p.H!)])
  return out
}

function TensionPreview({ r, w, h }: { r: SteelTensionResult; w: number; h: number }) {
  if (w < 140 || h < 110) return null
  const wide = w >= 480
  const secW = wide ? Math.min(w * 0.45, 320) : w
  const holes = holePositions(r)
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview batang tarik">
      <text x={8} y={16} className="bp-label">
        {r.ti?.name} {r.name}
      </text>
      <SectionSvg
        p={r.p!}
        x={0}
        y={22}
        w={secW}
        h={h - 26}
        overlay={(T, sc) =>
          holes.map((q, k) => {
            const [cx, cy] = T(q)
            return <circle key={k} cx={cx} cy={cy} r={Math.max(3, ((r.dh ?? 0) * sc) / 2)} className="bp-hole" />
          })
        }
      />
      {wide && <Member r={r} x={secW + 10} w={w - secW - 18} h={h} />}
    </svg>
  )
}

/** Tampak batang tarik: batang, panah tarik di kedua ujung, panjang L. */
function Member({ r, x, w, h }: { r: SteelTensionResult; x: number; w: number; h: number }) {
  const y = h * 0.48, x0 = x + 44, x1 = x + w - 44
  const P = r.Pu! > 0 ? `Pu ${fx(r.Pu, 0)} kN` : r.Pa_dem! > 0 ? `Pa ${fx(r.Pa_dem, 0)} kN` : 'P'
  const arrow = (from: number, to: number) => (
    <g className="bp-arrow strong bp-point">
      <line x1={from} y1={y} x2={to - Math.sign(to - from) * 8} y2={y} />
      <path d={`M${to},${y} l${-Math.sign(to - from) * 10},-5 v10 Z`} />
    </g>
  )
  return (
    <g>
      <rect x={x0} y={y - 9} width={x1 - x0} height={18} className="bp-member" />
      {arrow(x0 - 4, x0 - 40)}
      {arrow(x1 + 4, x1 + 40)}
      <text x={x1 + 4} y={y - 14} className="bp-pt-label" style={{ fill: 'var(--dg-load)' }}>
        {P}
      </text>
      <g className="bp-dim">
        <line x1={x0} y1={y + 34} x2={x1} y2={y + 34} />
        <line x1={x0} y1={y + 30} x2={x0} y2={y + 38} />
        <line x1={x1} y1={y + 30} x2={x1} y2={y + 38} />
        <text x={(x0 + x1) / 2} y={y + 30} textAnchor="middle">
          L {fx(r.L, 0)} mm{r.slender != null ? ` · L/r ${fx(r.slender, 0)}` : ''}
        </text>
      </g>
      <text x={(x0 + x1) / 2} y={y - 16} textAnchor="middle" className="dg-note">
        {r.conn === 'bolt' ? `${r.nHole} lubang Ø${fx(r.dh, 0)} · t ${fx(r.tHole, 1)} mm` : 'sambungan las'} · U {fx(r.U, 2)}
      </text>
    </g>
  )
}

type Tab = 'lrfd' | 'asd'

function Results({ r, stale }: { r: SteelTensionResult | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('lrfd')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && !(r.Pu! > 0) && !(r.Pa_dem! > 0) ? 'Isi Pu (DFBK) atau Pa (ASD) untuk menghitung D/C.' : null
  const lrfd = tab === 'lrfd'
  return (
    <Panel
      title="Kapasitas"
      className="results-panel"
      tools={<SubTabs ariaLabel="Metode" value={tab} tabs={[{ id: 'lrfd', label: 'DFBK' }, { id: 'asd', label: 'ASD' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              r ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kekuatan tarik tiap keadaan batas"
                  note={`kN · ${lrfd ? 'φPn' : 'Pn/Ω'} · garis = ${lrfd ? 'Pu' : 'Pa'}`}
                  bars={[
                    { label: 'Leleh bruto', cap: lrfd ? r.phiPnY! : r.PaY!, dem: lrfd ? r.Pu! : r.Pa_dem!, color: 'var(--dg-v)', gov: (lrfd ? r.govLRFD : r.govASD)!.startsWith('Leleh') },
                    { label: 'Fraktur neto efektif', cap: lrfd ? r.phiPnR! : r.PaR!, dem: lrfd ? r.Pu! : r.Pa_dem!, color: 'var(--dg-m)', gov: (lrfd ? r.govLRFD : r.govASD)!.startsWith('Fraktur') },
                  ]}
                />
              ) : null
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: `φPn DFBK (${r.govLRFD})`, value: fx(r.phiPn, 1), unit: 'kN', ...dcSub(r.dcL) },
                { label: `Pn/Ω ASD (${r.govASD})`, value: fx(r.Pa, 1), unit: 'kN', ...dcSub(r.dcA) },
                { label: 'Luas neto efektif Ae', value: fx(r.Ae, 0), unit: 'mm²', sub: `Ag ${fx(r.Ag, 0)} · An ${fx(r.An, 0)} · U ${fx(r.U, 2)}` },
                ...(r.slender != null
                  ? [{ label: 'Kelangsingan L/r', value: fx(r.slender, 0), sub: r.slender <= 300 ? '≤ 300 (anjuran)' : '> 300', tone: r.slender <= 300 ? ('ok' as const) : ('bad' as const) }]
                  : []),
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
