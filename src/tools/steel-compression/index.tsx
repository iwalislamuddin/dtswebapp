import { useMemo, useState } from 'react'
import { fcrFlexural, type SteelCompressionResult } from '../../calc/steel-compression'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { dcSub, GradeFields, ProfileFields, SectionSvg } from '../_steel/profile'
import { COMPRESSION_DEFAULTS, computeCompression, K_OPTIONS, validate, type CompressionInput } from './model'
import { compressionReport } from './report'

const ID = 'steel-compression'

export default function SteelCompression({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<CompressionInput>(ID, COMPRESSION_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: CompressionInput) => {
    const r = computeCompression(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const r = result?.r ?? null
  const report = useMemo(() => (result ? compressionReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input profil, panjang tekuk, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><CompressionPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: CompressionInput
  setInput: (p: Partial<CompressionInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  return (
    <>
      <Card n={1} title="Profil & mutu" actions={<ResetButton onReset={onReset} />}>
        <ProfileFields ptype={input.ptype} psize={input.psize} error={errors.psize} onChange={setInput} />
        <GradeFields value={input} errors={errors} withFu={false} onChange={setInput} />
      </Card>
      <Card n={2} title="Panjang & kekangan tekuk">
        <SelectField label="Faktor panjang efektif K" value={input.Kpreset} options={K_OPTIONS} onChange={(Kpreset) => setInput({ Kpreset })} />
        {input.Kpreset === '0' && <NumField label="K manual" value={input.Kval} error={errors.Kval} onChange={(Kval) => setInput({ Kval })} />}
        <NumField label="Lx — tak-terkekang sumbu kuat" unit="mm" value={input.Lx} error={errors.Lx} onChange={(Lx) => setInput({ Lx })} />
        <NumField
          label="Ly — tak-terkekang sumbu lemah"
          unit="mm"
          value={input.Ly}
          error={errors.Ly}
          hint="Bila pengaku lateral berbeda per sumbu, isi Lx & Ly berbeda."
          onChange={(Ly) => setInput({ Ly })}
        />
        {input.ptype === 'WF' && (
          <>
            <NumField label="Kz — faktor panjang torsi" value={input.Kz} error={errors.Kz} hint="0 = 1,0." onChange={(Kz) => setInput({ Kz })} />
            <NumField
              label="Lz — tak-terkekang torsi"
              unit="mm"
              value={input.Lz}
              error={errors.Lz}
              hint="Jarak antar pengaku puntir; 0 = maks(Lx, Ly). Tekuk torsi menentukan bila Lz > Ly."
              onChange={(Lz) => setInput({ Lz })}
            />
          </>
        )}
      </Card>
      <Card n={3} title="Beban">
        <NumField label="Pu — tekan terfaktor (DFBK)" unit="kN" value={input.Pu} error={errors.Pu} hint="0 = lewati D/C." onChange={(Pu) => setInput({ Pu })} />
        <NumField label="Pa — tekan layan (ASD)" unit="kN" value={input.Pa} error={errors.Pa} hint="0 = lewati D/C." onChange={(Pa) => setInput({ Pa })} />
      </Card>
    </>
  )
}

function CompressionPreview({ r, w, h }: { r: SteelCompressionResult; w: number; h: number }) {
  if (w < 140 || h < 110) return null
  const wide = w >= 440
  const secW = wide ? Math.min(w * 0.5, 320) : w
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview batang tekan">
      <text x={8} y={16} className="bp-label">
        {r.ti?.name} {r.name}
      </text>
      <SectionSvg
        p={r.p!}
        x={0}
        y={22}
        w={secW}
        h={h - 26}
        overlay={(T) => {
          const g = r.p!
          const bw = g.shape === 'pipe' ? g.D! : g.shape === 'L' ? g.a! : g.B!
          const bh = g.shape === 'pipe' ? g.D! : g.shape === 'L' ? g.a! : g.H!
          const [cx, cy] = T([bw / 2, bh / 2])
          const [l, tp] = T([0, 0])
          const [rr, bt] = T([bw, bh])
          return (
            <g className="dg-axes">
              <line x1={l - 14} y1={cy} x2={rr + 14} y2={cy} stroke="var(--dg-m)" strokeDasharray="6 3 1 3" />
              <line x1={cx} y1={tp - 10} x2={cx} y2={bt + 10} stroke="var(--dg-y)" strokeDasharray="6 3 1 3" />
              <text x={l - 16} y={cy - 4} textAnchor="end" style={{ fill: 'var(--dg-m)' }}>
                x
              </text>
              <text x={cx + 4} y={tp - 2} style={{ fill: 'var(--dg-y)' }}>
                y
              </text>
            </g>
          )
        }}
      />
      {wide && <Column r={r} x={secW} w={w - secW} h={h} />}
    </svg>
  )
}

/** Kolom tegak: tumpuan, bentuk tekuk sinus (sumbu menentukan), beban tekan, panjang tekuk. */
function Column({ r, x, w, h }: { r: SteelCompressionResult; x: number; w: number; h: number }) {
  const cx = x + w * 0.42, y0 = 40, y1 = h - 36
  const amp = Math.min(22, w * 0.12)
  const pts = Array.from({ length: 41 }, (_, k) => {
    const t = k / 40
    return `${k ? 'L' : 'M'}${(cx + amp * Math.sin(Math.PI * t)).toFixed(1)},${(y0 + (y1 - y0) * t).toFixed(1)}`
  }).join(' ')
  const L = r.govAxis!.startsWith('y') ? r.Ly! : r.Lx!
  const P = r.Pu! > 0 ? `Pu ${fx(r.Pu, 0)} kN` : r.Pa_dem! > 0 ? `Pa ${fx(r.Pa_dem, 0)} kN` : 'P'
  return (
    <g>
      <line x1={cx} y1={y0} x2={cx} y2={y1} className="bp-beam" style={{ opacity: 0.35 }} />
      <path d={pts} fill="none" stroke="var(--dg-m)" strokeWidth={2} strokeDasharray="5 3" />
      <g className="bp-arrow strong bp-point">
        <line x1={cx} y1={y0 - 34} x2={cx} y2={y0 - 9} />
        <path d={`M${cx},${y0 - 2} l-5,-10 h10 Z`} />
        <text x={cx + 8} y={y0 - 22} className="bp-pt-label">
          {P}
        </text>
      </g>
      <g className="bp-support">
        <path d={`M${cx},${y1} l-9,12 h18 Z`} />
      </g>
      <g className="bp-dim">
        <line x1={cx + amp + 26} y1={y0} x2={cx + amp + 26} y2={y1} />
        <line x1={cx + amp + 22} y1={y0} x2={cx + amp + 30} y2={y0} />
        <line x1={cx + amp + 22} y1={y1} x2={cx + amp + 30} y2={y1} />
        <text x={cx + amp + 32} y={(y0 + y1) / 2} >
          K {fx(r.K, 2)}
        </text>
        <text x={cx + amp + 32} y={(y0 + y1) / 2 + 14}>
          L {fx(L, 0)}
        </text>
      </g>
      <text x={cx} y={h - 6} textAnchor="middle" className="dg-note">
        tekuk sumbu {r.govAxis!.split(' ')[0]}
      </text>
    </g>
  )
}

type Tab = 'kurva' | 'kapasitas'

/** Kurva kolom φcFcr–KL/r (E3) dengan titik desain dan batas 4,71√(E/Fy) & 200. */
function ColumnCurve({ r, w, h }: { r: SteelCompressionResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const Fy = r.Fy!, padL = 48, padR = 16, padT = 22, padB = 30
  const torsGov = !!r.tors && r.govLS!.includes('torsi')
  const lamPt = torsGov ? r.tors!.lamEq : r.lam!
  const lamMax = Math.max(250, Math.ceil((lamPt * 1.1) / 50) * 50)
  const X = (l: number) => padL + (l / lamMax) * (w - padL - padR)
  const Y = (f: number) => h - padB - (f / Fy) * (h - padT - padB)
  const d = Array.from({ length: 120 }, (_, k) => {
    const l = 1 + ((lamMax - 1) * k) / 119
    return `${k ? 'L' : 'M'}${X(l).toFixed(1)},${Y(0.9 * fcrFlexural(l, Fy)).toFixed(1)}`
  }).join(' ')
  const fp = 0.9 * r.Fcr!
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Kurva kolom">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f} className="dg-axis">
          <line x1={padL} y1={Y(f * Fy)} x2={w - padR} y2={Y(f * Fy)} style={{ stroke: 'var(--dg-grid)' }} />
          <text x={padL - 6} y={Y(f * Fy) + 4} textAnchor="end">
            {fx(f * Fy, 0)}
          </text>
        </g>
      ))}
      {Array.from({ length: lamMax / 50 + 1 }, (_, k) => k * 50).map((l) => (
        <text key={l} x={X(l)} y={h - padB + 15} textAnchor="middle" className="dg-note">
          {l}
        </text>
      ))}
      <line x1={X(r.lamLimit!)} y1={padT} x2={X(r.lamLimit!)} y2={h - padB} className="dg-sup" />
      <line x1={X(200)} y1={padT} x2={X(200)} y2={h - padB} stroke="var(--danger)" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="var(--dg-m)" strokeWidth={2} />
      <g className="dg-ext">
        <circle cx={X(lamPt)} cy={Y(fp)} r={5} fill="var(--bg)" stroke="var(--dg-load)" strokeWidth={2.2} />
        <text x={X(lamPt) + (lamPt > lamMax * 0.6 ? -8 : 8)} y={Y(fp) - 9} textAnchor={lamPt > lamMax * 0.6 ? 'end' : 'start'}>
          φcFcr {fx(fp, 1)} MPa · KL/r {fx(lamPt, 0)}
        </text>
      </g>
      <text x={padL} y={14} className="dg-note">
        MPa · {torsGov ? 'tekuk torsi menentukan (KL/r ekuivalen)' : 'tekuk lentur E3'} · garis merah KL/r = 200
      </text>
      <text x={w - padR} y={h - 4} textAnchor="end" className="dg-note">
        KL/r
      </text>
    </svg>
  )
}

function Results({ r, stale }: { r: SteelCompressionResult | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('kurva')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && !(r.Pu! > 0) && !(r.Pa_dem! > 0) ? 'Isi Pu (DFBK) atau Pa (ASD) untuk menghitung D/C.' : null
  return (
    <Panel
      title="Kapasitas"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'kurva', label: 'Kurva kolom' }, { id: 'kapasitas', label: 'Keadaan batas' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : tab === 'kurva' ? (
                <ColumnCurve r={r} w={w} h={h} />
              ) : (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kekuatan tekan tiap keadaan batas"
                  note="kN · φcPn · garis = Pu"
                  bars={[
                    { label: 'Tekuk lentur (E3)', cap: 0.9 * r.PnFlex!, dem: r.Pu!, color: 'var(--dg-m)', gov: !r.govLS!.includes('torsi') },
                    ...(r.tors ? [{ label: 'Tekuk torsi (E4)', cap: 0.9 * r.tors.Pn, dem: r.Pu!, color: 'var(--dg-y)', gov: r.govLS!.includes('torsi') }] : []),
                    { label: 'Leleh penampang Fy·Ag', cap: (0.9 * r.Fy! * r.Ag!) / 1000, dem: r.Pu!, color: 'var(--dg-axis)', aux: true },
                  ]}
                />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: `φcPn DFBK (${r.govLS})`, value: fx(r.phiPn, 1), unit: 'kN', ...dcSub(r.dcL) },
                { label: 'Pn/Ω ASD', value: fx(r.Pa, 1), unit: 'kN', ...dcSub(r.dcA) },
                {
                  label: `KL/r (${r.govAxis!.split(' ')[0]})`,
                  value: fx(r.lam, 1),
                  sub: r.lam! <= 200 ? `≤ 200 · ${r.mode!.split(' ')[0].toLowerCase()}` : '> 200 (anjuran)',
                  tone: r.lam! <= 200 ? ('ok' as const) : ('bad' as const),
                },
                { label: 'Fcr', value: fx(r.Fcr, 1), unit: 'MPa', sub: `Fe ${fx(r.Fe, 1)} MPa` },
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
