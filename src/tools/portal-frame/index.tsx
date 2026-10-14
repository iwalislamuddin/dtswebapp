import { useMemo } from 'react'
import type { PortalResult } from '../../calc/portal-frame'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, RowTable, Segmented, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { FrameResults, MemberTable } from '../_frame/results'
import { FrameSvg } from '../_frame/FrameSvg'
import { SectionFields, type SectionInput } from '../_frame/section'
import { computePortalUI, MAX_POINT, MEMBER_NAMES, PORTAL_DEFAULTS, portalDims, portalView, validate, type PointLoad, type PortalUIInput } from './model'
import { portalReport } from './report'

const ID = 'portal-frame'

export default function PortalFrame({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<PortalUIInput>(ID, PORTAL_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result, stale } = useAutoCompute(input, computePortalUI)
  const r = result?.r
  const ok = !!r?.valid
  const view = useMemo(() => (r && r.valid ? portalView(r) : null), [r])
  const report = useMemo(() => (result && r?.valid ? portalReport(result.input, r) : null), [result, r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi geometri, penampang, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && !r.valid ? (r.msg ?? 'Struktur tidak dapat dihitung.') : null

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (view && ok ? <div className={stale ? 'stale' : ''}><FrameSvg v={view} mode="model" w={w} h={h} dims={portalDims(r!)} /></div> : null)}</Sized>
        </Panel>
      }
      results={
        <FrameResults view={view} stale={stale} status={status} warn={r?.warn ?? []}>
          {r && ok && <PortalTiles r={r} />}
        </FrameResults>
      }
    />
  )
}

function PortalTiles({ r }: { r: PortalResult }) {
  const df = r.defl!
  const dr = Number.isFinite(df.driftRatio) ? df.driftRatio : null
  const sr = Number.isFinite(df.sagRatio) ? df.sagRatio : null
  return (
    <>
      <StatTiles
        items={[
          { label: 'Momen |M| maks', value: fx(Math.abs(r.Mmax!), 2), unit: 'kN·m' },
          { label: 'Geser |V| maks', value: fx(Math.abs(r.Vmax!), 2), unit: 'kN' },
          { label: 'Aksial |N| maks', value: fx(Math.abs(r.Nmax!), 2), unit: 'kN', sub: r.Nmax! < 0 ? 'tekan' : 'tarik' },
          {
            label: 'Drift puncak Δ',
            value: fx(Math.abs(df.drift), 2),
            unit: 'mm',
            sub: dr ? `H/Δ = ${fx(dr, 0)}` : 'tanpa goyangan',
            tone: dr ? (dr >= 250 ? 'ok' : 'bad') : undefined,
          },
          {
            label: `Lendutan balok δ @ ${fx(df.sagX, 2)} m`,
            value: fx(Math.abs(df.sag), 2),
            unit: 'mm',
            sub: sr ? `L/δ = ${fx(sr, 0)}` : undefined,
            tone: sr ? (sr >= 240 ? 'ok' : 'bad') : undefined,
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
  input: PortalUIInput
  setInput: (p: Partial<PortalUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const sec = (key: 'col' | 'beam') => (p: Partial<SectionInput>) => setInput({ [key]: { ...input[key], ...p } })
  return (
    <>
      <Card n={1} title="Geometri & tumpuan" actions={<ResetButton onReset={onReset} />}>
        <NumField label="H — tinggi kolom" unit="m" value={input.H} error={errors.H} onChange={(H) => setInput({ H })} />
        <NumField label="L — panjang balok" unit="m" value={input.Lb} error={errors.Lb} onChange={(Lb) => setInput({ Lb })} />
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
      <Card n={2} title="Penampang kolom">
        <SectionFields value={input.col} pre="col" errors={errors} concrete onChange={sec('col')} />
      </Card>
      <Card n={3} title="Penampang balok">
        <SectionFields value={input.beam} pre="beam" errors={errors} concrete onChange={sec('beam')} />
      </Card>
      <Card n={4} title="Beban gravitasi balok">
        <NumField label="q — merata" unit="kN/m" value={input.q} error={errors.q} hint="Beban mati/hidup ke bawah pada balok, di luar berat sendiri." onChange={(q) => setInput({ q })} />
        <p className="muted card-note">Beban terpusat: P positif = ke bawah; a dari kolom kiri (0 … L).</p>
        <RowTable<PointLoad & Record<string, string>>
          prefix="point"
          columns={[
            { key: 'P', label: 'P', unit: 'kN' },
            { key: 'a', label: 'a', unit: 'm' },
          ]}
          rows={input.point as (PointLoad & Record<string, string>)[]}
          onChange={(point) => setInput({ point })}
          newRow={() => ({ P: '40', a: String((parseFloat(input.Lb.replace(',', '.')) || 0) / 2) })}
          max={MAX_POINT}
          errors={errors}
          addLabel="Tambah beban terpusat"
          emptyText="Tanpa beban terpusat."
        />
      </Card>
      <Card n={5} title="Beban lateral (puncak kolom)">
        <p className="muted card-note">Positif = ke kanan (mis. angin/gempa statik ekuivalen).</p>
        <NumField label="H₁ — puncak kolom kiri" unit="kN" value={input.HL1} error={errors.HL1} onChange={(HL1) => setInput({ HL1 })} />
        <NumField label="H₂ — puncak kolom kanan" unit="kN" value={input.HL2} error={errors.HL2} onChange={(HL2) => setInput({ HL2 })} />
      </Card>
    </>
  )
}
