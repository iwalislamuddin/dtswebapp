import { useMemo, useState } from 'react'
import type { AnchorBoltGroupResult } from '../../calc/anchor-bolt-group'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { ANCHOR_DEFAULTS, aseEstimate, computeAnchor, parseNum, validate, type AnchorInput } from './model'
import { anchorReport, planExtent } from './report'

const ID = 'anchor-bolt-group'

export default function AnchorBoltGroup({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<AnchorInput>(ID, ANCHOR_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeAnchor)
  const report = useMemo(() => (r ? anchorReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input pola angkur, beton, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><AnchorPlan r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: AnchorInput
  setInput: (p: Partial<AnchorInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const nx = parseNum(input.nx) ?? 1, ny = parseNum(input.ny) ?? 1
  const hef = parseNum(input.hef)
  return (
    <>
      <Card n={1} title="Pola angkur" actions={<ResetButton onReset={onReset} />}>
        <NumField label="Jumlah arah X" value={input.nx} error={errors.nx} onChange={(nx) => setInput({ nx })} />
        <NumField label="Jumlah arah Y" value={input.ny} error={errors.ny} onChange={(ny) => setInput({ ny })} />
        {nx > 1 && <NumField label="Spasi arah X" unit="mm" value={input.sx} error={errors.sx} onChange={(sx) => setInput({ sx })} />}
        {ny > 1 && <NumField label="Spasi arah Y" unit="mm" value={input.sy} error={errors.sy} onChange={(sy) => setInput({ sy })} />}
      </Card>
      <Card n={2} title="Angkur">
        <NumField
          label="Diameter da"
          unit="mm"
          value={input.da}
          error={errors.da}
          hint="Mengubah diameter mengisi ulang Ase ≈ 0,58·da²."
          onChange={(da) => {
            const d = parseNum(da)
            setInput(d && d > 0 ? { da, Ase: String(aseEstimate(d)) } : { da })
          }}
        />
        <NumField label="Luas tarik efektif Ase" unit="mm²" value={input.Ase} error={errors.Ase} onChange={(Ase) => setInput({ Ase })} />
        <NumField label="Kedalaman tanam hef" unit="mm" value={input.hef} error={errors.hef} onChange={(hef) => setInput({ hef })} />
        <NumField label="Kuat tarik baut futa" unit="MPa" value={input.futa} error={errors.futa} onChange={(futa) => setInput({ futa })} />
        <Field label="Pelat di atas grout">
          <Segmented
            ariaLabel="Pelat di atas grout"
            value={input.grout}
            options={[
              { value: 'no', label: 'Tidak' },
              { value: 'yes', label: 'Ya (Vsa ×0,8)' },
            ]}
            onChange={(grout) => setInput({ grout })}
          />
        </Field>
      </Card>
      <Card n={3} title="Beton">
        <NumField label="Mutu beton f'c" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField
          label="Jarak tepi ca (semua sisi)"
          unit="mm"
          value={input.ca}
          error={errors.ca}
          hint="Dari angkur terluar ke tepi beton. 0 = tanpa tepi dekat (jebol geser tidak ditinjau)."
          onChange={(ca) => setInput({ ca })}
        />
        <NumField label="Tebal beton ha" unit="mm" value={input.ha} error={errors.ha} hint="0 = tak dibatasi." onChange={(ha) => setInput({ ha })} />
        {hef !== null && hef > 0 && <p className="muted card-note">1,5·hef = {fx(1.5 * hef, 0)} mm · spasi bebas tumpang-tindih ≥ 3·hef = {fx(3 * hef, 0)} mm</p>}
        <Field label="Kondisi beton">
          <Segmented
            ariaLabel="Kondisi beton"
            value={input.crack}
            options={[
              { value: 'cracked', label: 'Retak' },
              { value: 'uncracked', label: 'Tak retak' },
            ]}
            onChange={(crack) => setInput({ crack })}
          />
        </Field>
        <Field label="Kondisi φ breakout" hint="A = ada tulangan tambahan (φ 0,75); B = tanpa (φ 0,70).">
          <Segmented
            ariaLabel="Kondisi phi"
            value={input.cond}
            options={[
              { value: 'B', label: 'B (0,70)' },
              { value: 'A', label: 'A (0,75)' },
            ]}
            onChange={(cond) => setInput({ cond })}
          />
        </Field>
      </Card>
      <Card n={4} title="Beban terfaktor (di titik berat grup)">
        <NumField label="Tarik aksial Nu" unit="kN" value={input.Nu} error={errors.Nu} hint="Positif = tarik; tekan (negatif) dipikul tumpu, di luar cakupan." onChange={(Nu) => setInput({ Nu })} />
        <NumField label="Momen Mx (gradien arah X)" unit="kN·m" value={input.Mx} error={errors.Mx} onChange={(Mx) => setInput({ Mx })} />
        <NumField label="Momen My (gradien arah Y)" unit="kN·m" value={input.My} error={errors.My} onChange={(My) => setInput({ My })} />
        <NumField label="Geser Vu" unit="kN" value={input.Vu} error={errors.Vu} hint="Dibagi rata ke semua angkur, ke arah satu tepi." onChange={(Vu) => setInput({ Vu })} />
        <Field label="Arah geser">
          <Segmented
            ariaLabel="Arah geser"
            value={input.shearDir}
            options={[
              { value: 'x', label: 'Arah X' },
              { value: 'y', label: 'Arah Y' },
            ]}
            onChange={(shearDir) => setInput({ shearDir })}
          />
        </Field>
      </Card>
    </>
  )
}

/** Denah: blok beton (tepi ca), angkur diwarnai gaya tarik, angka T per baut, arah geser, sumbu X/Y. */
function AnchorPlan({ r, w, h }: { r: AnchorBoltGroupResult; w: number; h: number }) {
  if (w < 140 || h < 110) return null
  const g = planExtent(r)
  const sc = Math.min((w - 120) / g.W, (h - 56) / g.H)
  const W = g.W * sc, H = g.H * sc
  const x0 = (w - W) / 2, y0 = 26 + (h - 56 - H) / 2
  const cx = x0 + W / 2, cy = y0 + H / 2
  const Tmax = Math.max(1e-9, ...r.bolts.map((b) => Math.abs(b.T)))
  const rad = Math.max(7, (r.da * sc) / 2 + 2)
  // panah geser di luar grup agar tidak menimpa angka gaya baut
  const gx = cx + (g.Wx / 2) * sc + rad + 10, gy = cy - (g.Wy / 2) * sc - rad - 18
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Denah grup angkur">
      <text x={8} y={16} className="bp-label">
        {r.nx}×{r.ny} angkur Ø{fx(r.da, 0)} · hef {fx(r.hef, 0)} mm
      </text>
      <g className="bp-plate">
        <rect x={x0} y={y0} width={W} height={H} style={r.ca > 0 ? undefined : { strokeDasharray: '5 4' }} />
      </g>
      {/* kerucut jebol (1,5·hef) di sekitar grup */}
      <rect
        x={cx - (g.Wx / 2 + r.eff) * sc}
        y={cy - (g.Wy / 2 + r.eff) * sc}
        width={(g.Wx + 2 * r.eff) * sc}
        height={(g.Wy + 2 * r.eff) * sc}
        fill="none"
        stroke="var(--dg-m)"
        strokeDasharray="4 3"
      />
      {r.bolts.map((b, k) => {
        const bx = cx + b.x * sc, by = cy - b.y * sc
        const t = b.T > 0
        return (
          <g key={k}>
            <circle cx={bx} cy={by} r={rad} fill={t ? `color-mix(in srgb, var(--danger) ${20 + 60 * (b.T / Tmax)}%, transparent)` : 'color-mix(in srgb, var(--dg-axis) 30%, transparent)'} stroke="var(--dg-ink)" />
            <text x={bx} y={by - rad - 4} textAnchor="middle" className="bp-pt-label" style={{ fill: t ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
              {fx(b.T, 1)}
            </text>
          </g>
        )
      })}
      {r.Vu > 0 && (
        <g className="bp-arrow strong bp-point">
          {r.shearDir === 'x' ? (
            <>
              <line x1={gx} y1={cy} x2={gx + 34} y2={cy} />
              <path d={`M${gx + 44},${cy} l-11,-5 v10 Z`} />
            </>
          ) : (
            <>
              <line x1={cx} y1={gy} x2={cx} y2={gy - 30} />
              <path d={`M${cx},${gy - 40} l-5,11 h10 Z`} />
            </>
          )}
          <text x={r.shearDir === 'x' ? gx : cx + 8} y={r.shearDir === 'x' ? cy + 18 : gy - 26} className="bp-pt-label">
            Vu {fx(r.Vu, 0)} kN
          </text>
        </g>
      )}
      <g className="bp-dim">
        {r.ca > 0 && (
          <>
            <line x1={x0} y1={y0 + H + 14} x2={cx - (g.Wx / 2) * sc} y2={y0 + H + 14} />
            <text x={(x0 + cx - (g.Wx / 2) * sc) / 2} y={y0 + H + 10} textAnchor="middle">
              ca {fx(r.ca, 0)}
            </text>
          </>
        )}
        <text x={x0 + W + 8} y={cy + 4}>
          X →
        </text>
        <text x={cx} y={y0 - 6} textAnchor="middle">
          ↑ Y
        </text>
      </g>
      <text x={8} y={h - 6} className="dg-note">
        angka = tarik baut Ti (kN) · garis putus = proyeksi jebol beton ANc
      </text>
    </svg>
  )
}

type Tab = 'tarik' | 'geser' | 'interaksi'

/** Diagram interaksi 17.8 (N/φNn vs V/φVn) dengan batas 0,2 dan titik desain. */
function Interaction({ r, w, h }: { r: AnchorBoltGroupResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const padL = 46, padB = 30, padT = 20
  const S = Math.min(w - padL - 24, h - padT - padB)
  const top = Math.max(1.2, Math.min(2, Math.max(r.UV, r.UN) * 1.1))
  const X = (v: number) => padL + (v / top) * S, Y = (n: number) => padT + S - (n / top) * S
  const d = Array.from({ length: 41 }, (_, k) => {
    const v = k / 40
    return `${k ? 'L' : 'M'}${X(v).toFixed(1)},${Y(Math.pow(Math.max(0, 1 - Math.pow(v, 5 / 3)), 3 / 5)).toFixed(1)}`
  }).join(' ')
  const ticks = [0, 0.2, 0.5, 1].filter((k) => k <= top)
  const ok = r.dcGov <= 1
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Diagram interaksi tarik geser">
      {ticks.map((k) => (
        <g key={k} className="dg-axis">
          <line x1={X(0)} y1={Y(k)} x2={X(top)} y2={Y(k)} style={{ stroke: 'var(--dg-grid)' }} />
          <line x1={X(k)} y1={Y(0)} x2={X(k)} y2={Y(top)} style={{ stroke: 'var(--dg-grid)' }} />
          <text x={X(0) - 6} y={Y(k) + 4} textAnchor="end">
            {k}
          </text>
          <text x={X(k)} y={Y(0) + 15} textAnchor="middle">
            {k}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--dg-m)" strokeWidth={2} />
      <g className="dg-ext">
        <circle cx={X(Math.min(r.UV, top))} cy={Y(Math.min(r.UN, top))} r={5} fill="var(--bg)" stroke={ok ? 'var(--dg-load)' : 'var(--danger)'} strokeWidth={2.2} />
        <text x={X(Math.min(r.UV, top)) + 9} y={Y(Math.min(r.UN, top)) - 8}>
          ({fx(r.UV, 2)}; {fx(r.UN, 2)})
        </text>
      </g>
      <text x={X(top)} y={h - 4} textAnchor="end" className="dg-note">
        V/φVn
      </text>
      <text x={X(0) + 4} y={padT - 6} className="dg-note">
        N/φNn · {r.combined != null ? `interaksi 5/3 = ${fx(r.combined, 2)}` : r.interactMode}
      </text>
    </svg>
  )
}

function Results({ r, stale }: { r: AnchorBoltGroupResult | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('tarik')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel
      title="Kapasitas"
      className="results-panel"
      tools={
        <SubTabs
          ariaLabel="Diagram"
          value={tab}
          tabs={[
            { id: 'tarik', label: 'Tarik' },
            { id: 'geser', label: 'Geser' },
            { id: 'interaksi', label: 'Interaksi' },
          ]}
          onChange={setTab}
        />
      }
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : tab === 'interaksi' ? (
                <Interaction r={r} w={w} h={h} />
              ) : tab === 'tarik' ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kapasitas tarik"
                  note="kN · garis = beban (Tmaks per baut / ΣT grup)"
                  bars={[
                    { label: 'Baja per baut φNsa', cap: r.phiNsa, dem: Math.max(0, r.Tmax), color: 'var(--dg-v)', gov: r.dcSteel >= r.dcConc },
                    { label: 'Jebol beton grup φNcbg', cap: r.phiNcbg, dem: r.sumTt, color: 'var(--dg-m)', gov: r.dcConc > r.dcSteel },
                  ]}
                />
              ) : r.Vu > 0 ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kapasitas geser"
                  note="kN · garis = beban (Vu/n per baut / Vu grup)"
                  bars={[
                    { label: 'Baja per baut φVsa', cap: r.phiVsa, dem: r.Vbolt, color: 'var(--dg-v)', gov: r.govShear === 'baja' },
                    ...(r.breakoutApplic ? [{ label: 'Jebol beton φVcbg', cap: r.phiVcbg, dem: r.Vu, color: 'var(--dg-m)', gov: r.govShear === 'breakout' }] : []),
                    { label: 'Pryout φVcpg', cap: r.phiVcpg, dem: r.Vu, color: 'var(--dg-y)', gov: r.govShear === 'pryout' },
                  ]}
                />
              ) : (
                <p className="muted card-note" style={{ padding: 12 }}>
                  Tanpa geser (Vu = 0).
                </p>
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: `D/C menentukan (${r.gov})`, value: Number.isFinite(r.govDC) ? fx(r.govDC, 2) : '∞', sub: r.govDC <= 1 ? 'OK' : 'NG', tone: r.govDC <= 1 ? 'ok' : 'bad' },
                { label: 'D/C tarik (baja · jebol)', value: `${fx(r.dcSteel, 2)} · ${fx(r.dcConc, 2)}`, sub: `Tmaks ${fx(r.Tmax, 1)} kN · ΣT ${fx(r.sumTt, 1)} kN` },
                ...(r.Vu > 0 ? [{ label: `D/C geser (${r.govShear})`, value: fx(r.dcShear, 2), sub: `Vu/n ${fx(r.Vbolt, 1)} kN` }] : []),
                ...(r.combined != null ? [{ label: 'Interaksi 5/3', value: fx(r.combined, 2), sub: r.combined <= 1 ? 'OK' : 'NG', tone: r.combined <= 1 ? ('ok' as const) : ('bad' as const) }] : []),
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
