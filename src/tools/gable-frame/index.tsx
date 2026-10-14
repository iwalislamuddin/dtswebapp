import { useMemo } from 'react'
import type { GableResult } from '../../calc/gable-frame'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, RowTable, Segmented, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { FrameResults, MemberTable } from '../_frame/results'
import { FrameSvg } from '../_frame/FrameSvg'
import { SectionFields, type SectionInput } from '../_frame/section'
import { parseNum } from '../form'
import { computeGableUI, GABLE_DEFAULTS, gableDims, gableView, MAX_POINT, MEMBER_NAMES, validate, type GableUIInput, type PointLoad } from './model'
import { gableReport } from './report'

const ID = 'gable-frame'

export default function GableFrame({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<GableUIInput>(ID, GABLE_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result, stale } = useAutoCompute(input, computeGableUI)
  const r = result?.r
  const ok = !!r?.valid
  const view = useMemo(() => (r && r.valid ? gableView(r) : null), [r])
  const report = useMemo(() => (result && r?.valid ? gableReport(result.input, r) : null), [result, r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi geometri, profil, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && !r.valid ? (r.msg ?? 'Struktur tidak dapat dihitung.') : null

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (view && ok ? <div className={stale ? 'stale' : ''}><FrameSvg v={view} mode="model" w={w} h={h} dims={gableDims(r!)} /></div> : null)}</Sized>
        </Panel>
      }
      results={
        <FrameResults view={view} stale={stale} status={status} warn={r?.warn ?? []}>
          {r && ok && <GableTiles r={r} />}
        </FrameResults>
      }
    />
  )
}

function GableTiles({ r }: { r: GableResult }) {
  const df = r.defl!
  const dr = Number.isFinite(df.driftRatio) ? df.driftRatio : null
  const ar = Number.isFinite(df.apexRatio) ? df.apexRatio : null
  const rr = Number.isFinite(df.rafRatio) ? df.rafRatio : null
  return (
    <>
      <StatTiles
        items={[
          { label: 'Momen |M| maks', value: fx(Math.abs(r.Mmax!), 2), unit: 'kN·m' },
          { label: 'Geser |V| maks', value: fx(Math.abs(r.Vmax!), 2), unit: 'kN' },
          { label: 'Aksial |N| maks', value: fx(Math.abs(r.Nmax!), 2), unit: 'kN', sub: r.Nmax! < 0 ? 'tekan' : 'tarik' },
          {
            label: 'Drift eave Δ',
            value: fx(Math.abs(df.drift), 2),
            unit: 'mm',
            sub: dr ? `H/Δ = ${fx(dr, 0)}` : 'tanpa goyangan',
            tone: dr ? (dr >= 250 ? 'ok' : 'bad') : undefined,
          },
          {
            label: 'Turun puncak Δy',
            value: fx(Math.abs(df.apexV), 2),
            unit: 'mm',
            sub: ar ? `L/Δy = ${fx(ar, 0)}` : undefined,
            tone: ar ? (ar >= 240 ? 'ok' : 'bad') : undefined,
          },
          {
            label: `Lendutan rafter ${df.rafWhich} δ`,
            value: fx(Math.abs(df.rafSag), 2),
            unit: 'mm',
            sub: rr ? `L_r/δ = ${fx(rr, 0)}` : undefined,
            tone: rr ? (rr >= 240 ? 'ok' : 'bad') : undefined,
          },
        ]}
      />
      <MemberTable elems={r.elems!} names={MEMBER_NAMES} />
    </>
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: GableUIInput
  setInput: (p: Partial<GableUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const sec = (key: 'col' | 'raf') => (p: Partial<SectionInput>) => setInput({ [key]: { ...input[key], ...p } })
  const L = parseNum(input.Lb), a = parseNum(input.alpha)
  const rise = L !== null && a !== null && a >= 0 && a <= 75 ? (L / 2) * Math.tan((a * Math.PI) / 180) : null
  return (
    <>
      <Card n={1} title="Geometri & tumpuan" actions={<ResetButton onReset={onReset} />}>
        <NumField label="H — tinggi kolom (ke eave)" unit="m" value={input.H} error={errors.H} onChange={(H) => setInput({ H })} />
        <NumField label="L — bentang" unit="m" value={input.Lb} error={errors.Lb} onChange={(Lb) => setInput({ Lb })} />
        <NumField
          label="α — kemiringan atap"
          unit="°"
          value={input.alpha}
          error={errors.alpha}
          hint={rise !== null ? `Tinggi puncak = H + (L/2)·tan α → naik ${fx(rise, 2)} m. α = 0 → portal biasa.` : 'Tinggi puncak = H + (L/2)·tan α.'}
          onChange={(alpha) => setInput({ alpha })}
        />
        <Field label="Tumpuan kaki kolom">
          <Segmented
            ariaLabel="Tumpuan"
            value={input.support}
            options={[
              { value: 'jepit', label: 'Jepit–jepit' },
              { value: 'sendi', label: 'Sendi–sendi' },
            ]}
            onChange={(support) => setInput({ support })}
          />
        </Field>
        <Field label="Berat sendiri batang">
          <Segmented
            ariaLabel="Berat sendiri"
            value={input.self}
            options={[
              { value: 'ya', label: 'Disertakan' },
              { value: 'tidak', label: 'Diabaikan' },
            ]}
            onChange={(self) => setInput({ self })}
          />
        </Field>
      </Card>
      <Card n={2} title="Profil kolom">
        <SectionFields value={input.col} pre="col" errors={errors} concrete={false} onChange={sec('col')} />
      </Card>
      <Card n={3} title="Profil rafter">
        <SectionFields value={input.raf} pre="raf" errors={errors} concrete={false} onChange={sec('raf')} />
      </Card>
      <Card n={4} title="Beban gravitasi atap">
        <NumField
          label="q — merata atap"
          unit="kN/m"
          value={input.q}
          error={errors.q}
          hint="Per meter proyeksi horizontal (bukan sepanjang rafter), di luar berat sendiri."
          onChange={(q) => setInput({ q })}
        />
        <p className="muted card-note">Beban terpusat vertikal: P positif = ke bawah; a = jarak horizontal dari kolom kiri (0 … L).</p>
        <RowTable<PointLoad & Record<string, string>>
          prefix="point"
          columns={[
            { key: 'P', label: 'P', unit: 'kN' },
            { key: 'a', label: 'a', unit: 'm' },
          ]}
          rows={input.point as (PointLoad & Record<string, string>)[]}
          onChange={(point) => setInput({ point })}
          newRow={() => ({ P: '20', a: String((L ?? 0) / 2) })}
          max={MAX_POINT}
          errors={errors}
          addLabel="Tambah beban terpusat"
          emptyText="Tanpa beban terpusat."
        />
      </Card>
      <Card n={5} title="Beban lateral (eave)">
        <p className="muted card-note">Positif = ke kanan, bekerja di puncak kolom.</p>
        <NumField label="H₁ — eave kiri" unit="kN" value={input.HL1} error={errors.HL1} onChange={(HL1) => setInput({ HL1 })} />
        <NumField label="H₂ — eave kanan" unit="kN" value={input.HL2} error={errors.HL2} onChange={(HL2) => setInput({ HL2 })} />
      </Card>
    </>
  )
}
