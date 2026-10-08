import { useMemo, useState } from 'react'
import { weldMin, type Electrode, type WeldConnectionResult } from '../../calc/weld-connection'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computeWeld, parseNum, validate, WELD_DEFAULTS, type WeldInput } from './model'
import { weldReport } from './report'
import { DIAGRAM_TABS, WeldDiagram, type DiagramTab } from './WeldDiagrams'
import { WeldPreview } from './WeldPreview'

const ID = 'weld-connection'

const ELECTRODES: { value: Electrode; label: string }[] = [
  { value: 'e60', label: 'E60XX (FEXX 413 MPa)' },
  { value: 'e70', label: 'E70XX (FEXX 482 MPa)' },
  { value: 'e80', label: 'E80XX (FEXX 551 MPa)' },
  { value: 'custom', label: 'Kustom (isi FEXX)' },
]

export default function WeldConnection({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<WeldInput>(ID, WELD_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeWeld)
  const report = useMemo(() => (r ? weldReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input las, logam dasar, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><WeldPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: WeldInput
  setInput: (p: Partial<WeldInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const t = parseNum(input.t)
  const w = parseNum(input.w)
  return (
    <>
      <Card n={1} title="Las sudut" actions={<ResetButton onReset={onReset} />}>
        <SelectField label="Elektroda" value={input.electrode} options={ELECTRODES} onChange={(electrode) => setInput({ electrode })} />
        {input.electrode === 'custom' && (
          <NumField label="FEXX kustom" unit="MPa" value={input.Fexx} error={errors.Fexx} onChange={(Fexx) => setInput({ Fexx })} />
        )}
        <NumField label="Ukuran kaki las w" unit="mm" value={input.w} error={errors.w} onChange={(w) => setInput({ w })} />
        <NumField
          label="Panjang efektif total Lw"
          unit="mm"
          value={input.Lw}
          error={errors.Lw}
          hint="Jumlah seluruh segmen las yang memikul beban."
          onChange={(Lw) => setInput({ Lw })}
        />
        {w !== null && w > 0 && (
          <p className="muted card-note">
            Throat te = 0,707w = {fx(0.707 * w, 2)} mm · Lw min 4w = {fx(4 * w, 0)} mm
          </p>
        )}
      </Card>
      <Card n={2} title="Arah beban">
        <NumField
          label="Sudut beban θ"
          unit="°"
          value={input.theta}
          error={errors.theta}
          hint="0° = sejajar sumbu las (longitudinal), 90° = tegak lurus (transversal)."
          onChange={(theta) => setInput({ theta })}
        />
        <Field label="Faktor arah kd" hint="kd = 1 + 0,5·sin¹·⁵θ (J2-5). Abaikan untuk grup las multi-arah (konservatif).">
          <Segmented
            ariaLabel="Faktor arah"
            value={input.useDir}
            options={[
              { value: 'yes', label: 'Pakai' },
              { value: 'no', label: 'Abaikan' },
            ]}
            onChange={(useDir) => setInput({ useDir })}
          />
        </Field>
        <Field label="Longitudinal end-loaded" hint="Las sejajar beban yang dibebani dari ujung (mis. sambungan lewatan panjang) — reduksi β bila Lw/w > 100.">
          <Segmented
            ariaLabel="Longitudinal end-loaded"
            value={input.endLoaded}
            options={[
              { value: 'no', label: 'Tidak' },
              { value: 'yes', label: 'Ya' },
            ]}
            onChange={(endLoaded) => setInput({ endLoaded })}
          />
        </Field>
      </Card>
      <Card n={3} title="Logam dasar (bagian tertipis)">
        <NumField label="Tebal t" unit="mm" value={input.t} error={errors.t} hint="0 = cek logam dasar dilewati." onChange={(t) => setInput({ t })} />
        <NumField label="Fy" unit="MPa" value={input.Fy} error={errors.Fy} hint="BJ 37: Fy 240, Fu 370 · BJ 41: 250/410 · BJ 50: 290/500." onChange={(Fy) => setInput({ Fy })} />
        <NumField label="Fu" unit="MPa" value={input.Fu} error={errors.Fu} onChange={(Fu) => setInput({ Fu })} />
        {t !== null && t > 0 && (
          <p className="muted card-note">
            Ukuran las: min {weldMin(t)} mm (Tabel J2.4) · maks {fx(t < 6 ? t : t - 2, 0)} mm (J2.2b)
          </p>
        )}
      </Card>
      <Card n={4} title="Beban terfaktor (DFBK)">
        <NumField label="Beban las Ru" unit="kN" value={input.Ru} error={errors.Ru} onChange={(Ru) => setInput({ Ru })} />
      </Card>
    </>
  )
}

function Results({ r, stale }: { r: WeldConnectionResult | null; stale: boolean }) {
  const [tab, setTab] = useState<DiagramTab>('kapasitas')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && r.Ru <= 0 ? 'Isi beban Ru untuk menghitung D/C.' : null
  const dcTile =
    r && r.Ru > 0
      ? [
          {
            label: `D/C (${r.weldGoverns ? 'las' : 'logam dasar'} menentukan)`,
            value: Number.isFinite(r.dc) ? fx(r.dc, 2) : '∞',
            sub: r.dc <= 1 ? 'OK' : 'NG',
            tone: r.dc <= 1 ? ('ok' as const) : ('bad' as const),
          },
        ]
      : []
  return (
    <Panel title="Kapasitas" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={DIAGRAM_TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <WeldDiagram r={r} tab={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                ...dcTile,
                { label: 'Kapasitas desain φRn', value: fx(r.phiRn, 1), unit: 'kN', sub: `las ${fx(r.phiRnw, 1)} kN` },
                { label: 'Faktor arah kd · reduksi β', value: `${fx(r.kd, 2)} · ${fx(r.beta, 2)}`, sub: `θ = ${fx(r.theta, 0)}°` },
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
