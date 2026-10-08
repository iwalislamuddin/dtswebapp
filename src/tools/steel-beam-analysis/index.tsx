import { useMemo, useState } from 'react'
import { BEAM_PROFILE_TYPES, type SteelBeamResult } from '../../calc/steel-beam-analysis'
import { listProfiles, typeInfo } from '../../calc/shared/steel-profiles'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, NumField, Panel, ResetButton, RowTable, Segmented, SelectField, StatTiles, SubTabs, ToolLayout, Field, Sized } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { BeamDiagram, DIAGRAM_TABS, type DiagramTab } from './BeamDiagrams'
import { BeamPreview } from './BeamPreview'
import { BEAM_DEFAULTS, computeBeam, defaultSize, MAX_DIST, MAX_POINT, validate, type BeamInput, type DistLoad, type PointLoad } from './model'
import { beamReport } from './report'

const ID = 'steel-beam-analysis'

export default function SteelBeamAnalysis({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BeamInput>(ID, BEAM_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result, stale } = useAutoCompute(input, computeBeam)
  const r = result?.r
  const ok = !!r?.valid
  const report = useMemo(() => (result && r?.valid ? beamReport(result.input, r) : null), [result, r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input (profil, bentang, minimal satu beban) untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  const status = stale
    ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.'
    : r && !r.valid
      ? r.noload
        ? 'Tambahkan minimal satu beban (merata atau terpusat), atau sertakan berat sendiri.'
        : 'Pilih profil dan isi bentang.'
      : null

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r && ok ? <div className={stale ? 'stale' : ''}><BeamPreview r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results result={r && ok ? r : null} stale={stale} status={status} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: BeamInput
  setInput: (p: Partial<BeamInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const sizes = listProfiles(input.ptype)
  const prof = sizes.find((p) => p.name === input.psize)
  return (
    <>
      <Card n={1} title="Profil & Bentang" actions={<ResetButton onReset={onReset} />}>
        <SelectField
          label="Tipe profil"
          value={input.ptype}
          options={BEAM_PROFILE_TYPES.map((t) => ({ value: t, label: typeInfo(t)?.name ?? t }))}
          onChange={(ptype) => setInput({ ptype, psize: defaultSize(ptype) })}
        />
        <SelectField
          label="Ukuran"
          value={input.psize}
          error={errors.psize}
          options={sizes.map((p) => ({ value: p.name, label: `${p.name} (${fx(p.w, 1)} kg/m)` }))}
          onChange={(psize) => setInput({ psize })}
        />
        {prof && (
          <p className="muted card-note">
            Ix {fx(prof.Ix, 0)} cm⁴ · Sx {fx(prof.Sx as number, 1)} cm³
          </p>
        )}
        <NumField label="Bentang L (A–B)" unit="m" value={input.L} error={errors.L} onChange={(L) => setInput({ L })} />
        <NumField label="Kantilever kiri" unit="m" value={input.cL} error={errors.cL} hint="Bagian menjorok di kiri tumpuan A; 0 = tanpa." onChange={(cL) => setInput({ cL })} />
        <NumField label="Kantilever kanan" unit="m" value={input.cR} error={errors.cR} hint="Bagian menjorok di kanan tumpuan B; 0 = tanpa." onChange={(cR) => setInput({ cR })} />
        <NumField label="Modulus E" unit="MPa" value={input.E} error={errors.E} onChange={(E) => setInput({ E })} />
        <Field label="Berat sendiri profil">
          <Segmented
            ariaLabel="Berat sendiri profil"
            value={input.self}
            options={[
              { value: 'ya', label: 'Disertakan' },
              { value: 'tidak', label: 'Diabaikan' },
            ]}
            onChange={(self) => setInput({ self })}
          />
        </Field>
      </Card>
      <Card n={2} title="Beban merata / trapesium">
        <p className="muted card-note">Intensitas w1 di a1 → w2 di a2; posisi dari ujung kiri balok. Segitiga: w1 atau w2 = 0.</p>
        <RowTable<DistLoad & Record<string, string>>
          prefix="dist"
          columns={[
            { key: 'w1', label: 'w1', unit: 'kN/m' },
            { key: 'w2', label: 'w2', unit: 'kN/m' },
            { key: 'a1', label: 'a1', unit: 'm' },
            { key: 'a2', label: 'a2', unit: 'm' },
          ]}
          rows={input.dist as (DistLoad & Record<string, string>)[]}
          onChange={(dist) => setInput({ dist })}
          newRow={() => ({ w1: '10', w2: '10', a1: '0', a2: input.L })}
          max={MAX_DIST}
          errors={errors}
          addLabel="Tambah beban merata"
          emptyText="Tanpa beban merata."
        />
      </Card>
      <Card n={3} title="Beban terpusat">
        <p className="muted card-note">P positif = ke bawah; a dari ujung kiri balok.</p>
        <RowTable<PointLoad & Record<string, string>>
          prefix="point"
          columns={[
            { key: 'P', label: 'P', unit: 'kN' },
            { key: 'a', label: 'a', unit: 'm' },
          ]}
          rows={input.point as (PointLoad & Record<string, string>)[]}
          onChange={(point) => setInput({ point })}
          newRow={() => ({ P: '10', a: String((parseFloat(input.cL) || 0) + (parseFloat(input.L) || 0) / 2) })}
          max={MAX_POINT}
          errors={errors}
          addLabel="Tambah beban terpusat"
          emptyText="Tanpa beban terpusat."
        />
      </Card>
    </>
  )
}

function Results({ result: r, stale, status }: { result: SteelBeamResult | null; stale: boolean; status: string | null }) {
  const [tab, setTab] = useState<DiagramTab>('momen')
  const ratio = r && Number.isFinite(r.ratio) ? r.ratio! : null
  return (
    <Panel title="Diagram" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={DIAGRAM_TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <BeamDiagram r={r} tab={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Nilai maksimum</h4>
            <StatTiles
              items={[
                { label: `Momen |M| @ ${fx(r.xMmax, 2)} m`, value: fx(Math.abs(r.Mmax!), 2), unit: 'kN·m', sub: r.Mmax! < 0 ? 'hogging' : undefined },
                { label: `Geser |V| @ ${fx(r.xVmax, 2)} m`, value: fx(Math.abs(r.Vmax!), 2), unit: 'kN' },
                {
                  label: `Lendutan δ @ ${fx(r.xYmax, 2)} m`,
                  value: fx(Math.abs(r.ymax!), 2),
                  unit: 'mm',
                  sub: ratio ? `L/δ = ${fx(ratio, 0)}${ratio >= 360 ? ' (≥ L/360)' : ratio >= 240 ? ' (≥ L/240)' : ' (< L/240)'}` : undefined,
                  tone: ratio ? (ratio >= 240 ? 'ok' : 'bad') : undefined,
                },
                ...(r.fb != null ? [{ label: 'Tegangan fb = |M|/Sx', value: fx(r.fb, 1), unit: 'MPa', sub: 'elastis, tanpa LTB' }] : []),
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
