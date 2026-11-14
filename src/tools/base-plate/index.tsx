import { useMemo, useState } from 'react'
import { ANCHOR_GRADES, ANCHOR_SIZES, type BaseCheck, type BasePlateResult } from '../../calc/base-plate'
import { STEEL_GRADES } from '../../calc/shared/steel'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { FIG_W, LEAD } from '../../report/figure'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab, FigureSvg } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { CUSTOM, GradeFields, gradeValues, ProfileFields } from '../_steel/profile'
import { BASE_PLATE_DEFAULTS, COLUMN_TYPES, computeBasePlateUI, ryFor, validate, type BasePlateUIInput } from './model'
import { basePlateReport, figElev, figPlan, REGIME_LABEL } from './report'

const ID = 'base-plate'
const VERSION = 2 // v1 = build lama (port 1:1), bentuk input berbeda

export default function BasePlate({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BasePlateUIInput>(ID, BASE_PLATE_DEFAULTS, VERSION)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeBasePlateUI)
  const report = useMemo(() => (r ? basePlateReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input kolom, pelat, angkur, beton, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={<Preview r={r} stale={stale} />}
      results={<Results r={r} stale={stale} />}
    />
  )
}

type Set = (p: Partial<BasePlateUIInput>) => void

function Inputs({ input, setInput, errors, onReset }: { input: BasePlateUIInput; setInput: Set; errors: Record<string, string>; onReset: () => void }) {
  const fixed = input.fixity === 'fixed'
  const cap = input.loadMode === 'capacity'
  return (
    <>
      <Card n={1} title="Perletakan & kolom" actions={<ResetButton onReset={onReset} />}>
        <Field label="Tipe perletakan" hint="Sendi: P & V saja (tanpa momen). Jepit: P, M & V.">
          <Segmented
            ariaLabel="Tipe perletakan"
            value={input.fixity}
            options={[
              { value: 'pinned', label: 'Sendi' },
              { value: 'fixed', label: 'Jepit' },
            ]}
            onChange={(fixity) => setInput({ fixity })}
          />
        </Field>
        <ProfileFields
          ptype={input.ptype}
          psize={input.psize}
          types={COLUMN_TYPES}
          error={errors.psize}
          onChange={(p) => setInput(p as Partial<BasePlateUIInput>)}
        />
        <GradeFields
          value={input}
          errors={errors}
          withFu={false}
          onChange={(p) => {
            const next = { ...input, ...p }
            setInput({ ...p, Ry: ryFor(gradeValues(next).Fy) })
          }}
        />
        <p className="muted card-note">Sumbu kuat kolom sejajar panjang pelat N; momen bekerja terhadap sumbu kuat.</p>
      </Card>

      <Card n={2} title="Pelat landas (end plate)">
        <NumField label="N — panjang (sejajar d kolom)" unit="mm" value={input.N} presets={[300, 400, 500, 600, 700]} error={errors.N} onChange={(N) => setInput({ N })} />
        <NumField label="B — lebar" unit="mm" value={input.B} presets={[300, 400, 500, 600]} error={errors.B} onChange={(B) => setInput({ B })} />
        <NumField label="tp — tebal" unit="mm" value={input.tp} presets={[12, 16, 20, 25, 30, 40]} error={errors.tp} onChange={(tp) => setInput({ tp })} />
        <SelectField
          label="Mutu pelat"
          value={input.plateGrade}
          options={[...STEEL_GRADES.map((g) => ({ value: g.key, label: `${g.key} (Fy ${g.Fy})` })), { value: CUSTOM, label: 'Kustom' }]}
          onChange={(plateGrade) => setInput({ plateGrade })}
        />
        {input.plateGrade === CUSTOM && <NumField label="Fy pelat" unit="MPa" value={input.plateFy} error={errors.plateFy} onChange={(plateFy) => setInput({ plateFy })} />}
        <NumField label="Las sudut kolom–pelat w" unit="mm" value={input.weld} presets={[0, 6, 8, 10, 12]} error={errors.weld} hint="0 = las tidak ditinjau." onChange={(weld) => setInput({ weld })} />
        <NumField label="FEXX elektroda" unit="MPa" value={input.FEXX} presets={[490]} error={errors.FEXX} hint="E70xx = 490 MPa." onChange={(FEXX) => setInput({ FEXX })} />
      </Card>

      <Card n={3} title="Angkur">
        <SelectField label="Mutu angkur" value={input.anchorGrade} error={errors.anchorGrade} options={ANCHOR_GRADES.map((g) => ({ value: g.key, label: `${g.label} (Fu ${g.Fu})` }))} onChange={(anchorGrade) => setInput({ anchorGrade })} />
        <SelectField label="Diameter da" value={input.da} error={errors.da} options={ANCHOR_SIZES.map((s) => ({ value: String(s.d), label: `M${s.d} (Ase ${s.Ase} mm²)` }))} onChange={(da) => setInput({ da })} />
        <NumField label="Jumlah per baris (2 baris)" value={input.nRow} presets={[1, 2, 3, 4]} error={errors.nRow} hint="Baris angkur di kedua ujung N; total = 2 × jumlah." onChange={(nRow) => setInput({ nRow })} />
        <NumField label="aN — tepi pelat (arah N) → sumbu angkur" unit="mm" value={input.aN} presets={[40, 50, 60, 75]} error={errors.aN} onChange={(aN) => setInput({ aN })} />
        <NumField label="aB — tepi pelat (arah B) → angkur terluar" unit="mm" value={input.aB} presets={[40, 50, 60, 75]} error={errors.aB} onChange={(aB) => setInput({ aB })} />
        <NumField label="hef — kedalaman tanam" unit="mm" value={input.hef} presets={[150, 200, 300, 400, 500]} error={errors.hef} onChange={(hef) => setInput({ hef })} />
        <Field label="Ujung angkur">
          <Segmented
            ariaLabel="Ujung angkur"
            value={input.head}
            options={[
              { value: 'headed', label: 'Berkepala (mur)' },
              { value: 'hooked', label: 'Kait (J/L)' },
            ]}
            onChange={(head) => setInput({ head })}
          />
        </Field>
        {input.head === 'hooked' && <NumField label="eh — panjang kait" unit="mm" value={input.eh} error={errors.eh} hint="Dibatasi 3da ≤ eh ≤ 4,5da." onChange={(eh) => setInput({ eh })} />}
      </Card>

      <Card n={4} title="Beton tumpuan (base)">
        <Field label="Tipe tumpuan">
          <Segmented
            ariaLabel="Tipe tumpuan"
            value={input.support}
            options={[
              { value: 'pedestal', label: 'Pedestal' },
              { value: 'slab', label: 'Slab' },
              { value: 'manual', label: 'Tepi manual' },
            ]}
            onChange={(support) => setInput({ support })}
          />
        </Field>
        {input.support === 'pedestal' && (
          <>
            <NumField label="Lp — panjang pedestal (arah N)" unit="mm" value={input.Lp} error={errors.Lp} onChange={(Lp) => setInput({ Lp })} />
            <NumField label="Bp — lebar pedestal (arah B)" unit="mm" value={input.Bp} error={errors.Bp} onChange={(Bp) => setInput({ Bp })} />
          </>
        )}
        {input.support === 'manual' && (
          <>
            <NumField label="ca,N — sumbu angkur → tepi beton arah N" unit="mm" value={input.caN} error={errors.caN} onChange={(caN) => setInput({ caN })} />
            <NumField label="ca,B — angkur terluar → tepi beton arah B" unit="mm" value={input.caB} error={errors.caB} onChange={(caB) => setInput({ caB })} />
          </>
        )}
        <NumField
          label={input.support === 'pedestal' ? 'ha — tinggi pedestal' : 'ha — tebal beton'}
          unit="mm"
          value={input.ha}
          error={errors.ha}
          hint={input.support === 'slab' ? 'Slab: tanpa tepi dekat; A2 dari frustum 1V:2H.' : undefined}
          onChange={(ha) => setInput({ ha })}
        />
        <NumField label="f'c — mutu beton" unit="MPa" value={input.fc} presets={[20, 25, 30, 35, 40]} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="Tebal grout" unit="mm" value={input.grout} presets={[0, 25, 40, 50]} error={errors.grout} hint="0 = pelat langsung di atas beton." onChange={(grout) => setInput({ grout })} />
        <Field label="Kondisi beton">
          <Segmented
            ariaLabel="Kondisi beton"
            value={input.cracked}
            options={[
              { value: 'yes', label: 'Retak' },
              { value: 'no', label: 'Tak retak' },
            ]}
            onChange={(cracked) => setInput({ cracked })}
          />
        </Field>
        <Field label="Tulangan suplemen" hint="A = ada tulangan suplemen (φ 0,75); B = tanpa (φ 0,70).">
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

      <Card n={5} title="Beban">
        <Field label="Sumber gaya">
          <Segmented
            ariaLabel="Sumber gaya"
            value={input.loadMode}
            options={[
              { value: 'actual', label: 'Beban aktual' },
              { value: 'capacity', label: 'Desain kapasitas' },
            ]}
            onChange={(loadMode) => setInput({ loadMode })}
          />
        </Field>
        {!cap && (
          <>
            <NumField label="Pu — aksial terfaktor" unit="kN" value={input.Pu} error={errors.Pu} hint="Positif = tekan, negatif = tarik (uplift)." onChange={(Pu) => setInput({ Pu })} />
            {fixed && <NumField label="Mu — momen terfaktor (sumbu kuat)" unit="kN·m" value={input.Mu} error={errors.Mu} onChange={(Mu) => setInput({ Mu })} />}
            <NumField label="Vu — geser terfaktor (sejajar N)" unit="kN" value={input.Vu} error={errors.Vu} onChange={(Vu) => setInput({ Vu })} />
          </>
        )}
        {cap && fixed && (
          <>
            <p className="muted card-note">Mu = 1,1·Ry·Fy·Zx kolom dan Vu = 2·Mu/H (SNI 7860:2020 Ps. D2.6).</p>
            <NumField label="Ry — rasio tegangan leleh ekspektasi" value={input.Ry} error={errors.Ry} hint="SNI 7860 Tabel A3.1 (terisi otomatis dari mutu kolom)." onChange={(Ry) => setInput({ Ry })} />
            <NumField label="H — tinggi bersih kolom" unit="mm" value={input.H} error={errors.H} onChange={(H) => setInput({ H })} />
            <NumField label="Pu — aksial bersamaan" unit="kN" value={input.Pu} error={errors.Pu} hint="Positif = tekan, negatif = tarik." onChange={(Pu) => setInput({ Pu })} />
          </>
        )}
        {cap && !fixed && (
          <>
            <p className="muted card-note">Pu = φc·Pn kolom (SNI 1729 Ps. E3, tekuk sumbu lemah, Lc = K·H).</p>
            <NumField label="K — faktor panjang efektif" value={input.K} presets={[0.65, 0.8, 1, 1.2, 2]} error={errors.K} onChange={(K) => setInput({ K })} />
            <NumField label="H — tinggi kolom" unit="mm" value={input.H} error={errors.H} onChange={(H) => setInput({ H })} />
            <NumField label="Vu — geser terfaktor" unit="kN" value={input.Vu} error={errors.Vu} onChange={(Vu) => setInput({ Vu })} />
          </>
        )}
        <Field label="Penyaluran geser" hint="Gesekan: μ·Pu (0,55 grout / 0,7 beton). Angkur: baja, jebol beton & cungkil.">
          <Segmented
            ariaLabel="Penyaluran geser"
            value={input.shearMode}
            options={[
              { value: 'friction', label: 'Gesekan' },
              { value: 'anchors', label: 'Angkur' },
            ]}
            onChange={(shearMode) => setInput({ shearMode })}
          />
        </Field>
      </Card>
    </>
  )
}

type View = 'plan' | 'elev'

function Preview({ r, stale }: { r: BasePlateResult | null; stale: boolean }) {
  const [view, setView] = useState<View>('plan')
  return (
    <Panel
      title="Preview"
      tools={
        <SubTabs
          ariaLabel="Gambar"
          value={view}
          tabs={[
            { id: 'plan', label: 'Denah' },
            { id: 'elev', label: 'Elevasi' },
          ]}
          onChange={setView}
        />
      }
    >
      <Sized>
        {(w, h) => {
          if (!r) return null
          const fig = view === 'plan' ? figPlan(r) : figElev(r)
          const fw = Math.min(w, (h * FIG_W) / (fig.h * LEAD))
          return (
            <div className={stale ? 'stale' : ''} style={{ width: fw, margin: '0 auto' }}>
              <FigureSvg fig={{ ...fig, caption: undefined }} />
            </div>
          )
        }}
      </Sized>
    </Panel>
  )
}

/** Batang D/C tiap pemeriksaan; garis putus = 1,0. */
function DcBars({ checks, w, h }: { checks: BaseCheck[]; w: number; h: number }) {
  if (w < 180 || h < 80 || !checks.length) return null
  const padL = Math.min(230, w * 0.5), padR = 48, padT = 10, padB = 22
  const rowH = Math.min(30, (h - padT - padB) / checks.length)
  const barH = Math.max(7, Math.min(16, rowH * 0.55))
  const top = Math.max(1.2, ...checks.map((c) => (Number.isFinite(c.dc) ? c.dc : 1.2))) * 1.05
  const X = (v: number) => padL + (Math.min(Number.isFinite(v) ? v : top, top) / top) * (w - padL - padR)
  const gov = checks.reduce((a, c) => (c.dc > a.dc ? c : a), checks[0])
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Rasio D/C tiap pemeriksaan">
      {checks.map((c, i) => {
        const y = padT + i * rowH + (rowH - barH) / 2
        const bad = c.dc > 1
        const col = bad ? 'var(--danger)' : 'var(--dg-v)'
        return (
          <g key={c.key} className={`dg-bar${c === gov ? ' gov' : ''}`}>
            <text x={padL - 8} y={y + barH / 2 + 4} textAnchor="end" className="dg-bar-label">
              {c.label}
            </text>
            <rect x={padL} y={y} width={Math.max(2, X(c.dc) - padL)} height={barH} rx={2} fill={`color-mix(in srgb, ${col} ${c === gov ? 70 : 35}%, transparent)`} stroke={col} />
            <text x={X(c.dc) + 6} y={y + barH / 2 + 4} className="val">
              {Number.isFinite(c.dc) ? fx(c.dc, 2) : '∞'}
            </text>
          </g>
        )
      })}
      <line x1={X(1)} y1={padT - 4} x2={X(1)} y2={h - padB + 4} stroke="var(--danger)" strokeDasharray="4 3" />
      <text x={padL} y={h - 6} className="dg-note">
        D/C = kebutuhan / kapasitas rencana · garis putus = 1,0
      </text>
    </svg>
  )
}

function Results({ r, stale }: { r: BasePlateResult | null; stale: boolean }) {
  return (
    <Panel title="Pemeriksaan" className="results-panel">
      <div className="results">
        {stale && <p className="msg bad">Input belum lengkap/valid — hasil di bawah dari input sah terakhir.</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <DcBars checks={r.checks} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                {
                  label: `D/C menentukan${r.gov ? ` (${r.gov.label})` : ''}`,
                  value: r.gov ? fx(r.gov.dc, 2) : '-',
                  sub: r.gov ? (r.gov.dc <= 1 ? 'OK' : 'NG') : undefined,
                  tone: r.gov ? (r.gov.dc <= 1 ? ('ok' as const) : ('bad' as const)) : undefined,
                },
                { label: 'Tebal pelat perlu', value: fx(r.tpReq, 1), unit: 'mm', sub: `terpasang ${fx(r.inp.tp, 0)} mm` },
                { label: 'Rezim', value: r.regime === 'uplift' ? 'Uplift' : r.regime === 'large' ? 'Momen besar' : r.regime === 'small' ? 'Momen kecil' : 'Konsentrik', sub: REGIME_LABEL[r.regime].replace(/_\{([^}]*)\}/g, '$1') },
                { label: r.Trow > 0 ? 'Tarik per angkur' : 'Tegangan tumpu fp', value: r.Trow > 0 ? fx(r.Tanchor, 1) : fx(r.fp, 2), unit: r.Trow > 0 ? 'kN' : 'MPa', sub: r.Trow > 0 ? `${r.nTens} angkur tarik` : `φfp(maks) ${fx(r.fpMax, 2)} MPa` },
              ]}
            />
            <p className="muted card-note">
              Beban rencana: Pu {fx(r.Pu, 1)} kN · Mu {fx(r.Mu, 1)} kN·m · Vu {fx(r.Vu, 1)} kN
              {r.inp.loadMode === 'capacity' ? ' (desain kapasitas)' : ''}
            </p>
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
