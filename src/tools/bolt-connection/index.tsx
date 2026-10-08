import { useMemo, useState } from 'react'
import { BOLT_GRADES, edgeMin, holeDia, type BoltConnectionResult, type BoltGrade } from '../../calc/bolt-connection'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { BoltDiagram, DIAGRAM_TABS, type DiagramTab } from './BoltDiagrams'
import { BoltPreview } from './BoltPreview'
import { BOLT_DEFAULTS, computeBolt, parseNum, validate, type BoltInput } from './model'
import { boltReport } from './report'

const ID = 'bolt-connection'

const GRADE_OPTIONS: { value: BoltGrade; label: string }[] = [
  { value: 'a325', label: 'A325 / Gr.8.8 (Grup A)' },
  { value: 'a490', label: 'A490 / Gr.10.9 (Grup B)' },
  { value: 'a307', label: 'A307 (baut biasa)' },
  { value: 'custom', label: 'Kustom (isi Fnt/Fnv)' },
]

export default function BoltConnection({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BoltInput>(ID, BOLT_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeBolt)
  const report = useMemo(() => (r ? boltReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input baut, pola, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><BoltPreview r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: BoltInput
  setInput: (p: Partial<BoltInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const G = BOLT_GRADES[input.grade]
  const d = parseNum(input.d)
  const custom = input.grade === 'custom'
  const nr = parseNum(input.nr) ?? 1, nc = parseNum(input.nc) ?? 1
  return (
    <>
      <Card n={1} title="Baut" actions={<ResetButton onReset={onReset} />}>
        <SelectField
          label="Mutu baut"
          value={input.grade}
          options={GRADE_OPTIONS}
          // A307 tidak punya opsi ulir X (selalu N).
          onChange={(grade) => setInput(grade === 'a307' ? { grade, thread: 'N' } : { grade })}
        />
        {G.threadOpt && (
          <Field label="Posisi ulir" hint="N = ulir termasuk bidang geser (lebih konservatif); X = ulir di luar bidang geser.">
            <Segmented
              ariaLabel="Posisi ulir"
              value={input.thread}
              options={[
                { value: 'N', label: 'N' },
                { value: 'X', label: 'X' },
              ]}
              onChange={(thread) => setInput({ thread })}
            />
          </Field>
        )}
        {custom ? (
          <>
            <NumField label="Fnt kustom" unit="MPa" value={input.Fnt} error={errors.Fnt} onChange={(Fnt) => setInput({ Fnt })} />
            <NumField label="Fnv kustom" unit="MPa" value={input.Fnv} error={errors.Fnv} onChange={(Fnv) => setInput({ Fnv })} />
          </>
        ) : (
          <p className="muted card-note">
            Fnt {G.Fnt} MPa · Fnv {input.thread === 'X' && G.threadOpt ? G.FnvX : G.FnvN} MPa (Tabel J3.2)
          </p>
        )}
        <NumField label="Diameter baut d" unit="mm" value={input.d} error={errors.d} onChange={(d) => setInput({ d })} />
        {d !== null && d > 0 && (
          <p className="muted card-note">
            Lubang standar {holeDia(d)} mm · le min {edgeMin(d)} mm · s min {Math.ceil(2.67 * d)} mm (3d = {fx(3 * d, 0)})
          </p>
        )}
        <Field label="Bidang geser" hint="1 = geser tunggal (lap); 2 = geser ganda (pelat penyambung dua sisi).">
          <Segmented
            ariaLabel="Jumlah bidang geser"
            value={input.planes}
            options={[
              { value: '1', label: 'Tunggal' },
              { value: '2', label: 'Ganda' },
            ]}
            onChange={(planes) => setInput({ planes })}
          />
        </Field>
      </Card>
      <Card n={2} title="Pola baut">
        <p className="muted card-note">Baris searah beban, kolom tegak lurus beban.</p>
        <NumField label="Baris (searah beban)" value={input.nr} error={errors.nr} onChange={(nr) => setInput({ nr })} />
        <NumField label="Kolom (tegak lurus)" value={input.nc} error={errors.nc} onChange={(nc) => setInput({ nc })} />
        {nr > 1 && <NumField label="Spasi s (searah beban)" unit="mm" value={input.s} error={errors.s} onChange={(s) => setInput({ s })} />}
        {nc > 1 && <NumField label="Gage g (tegak lurus)" unit="mm" value={input.sg} error={errors.sg} onChange={(sg) => setInput({ sg })} />}
        <NumField
          label="Jarak tepi le (searah beban)"
          unit="mm"
          value={input.le}
          error={errors.le}
          hint="Dari pusat baut tepi ke tepi pelat searah beban. 0 = cek tumpu dilewati."
          onChange={(le) => setInput({ le })}
        />
      </Card>
      <Card n={3} title="Pelat tumpu">
        <NumField label="Tebal pelat t" unit="mm" value={input.t} error={errors.t} hint="Pelat/elemen tertipis yang menumpu baut. 0 = cek tumpu dilewati." onChange={(t) => setInput({ t })} />
        <NumField label="Kuat tarik Fu" unit="MPa" value={input.Fu} error={errors.Fu} hint="BJ 37 ≈ 370 MPa, BJ 41 ≈ 410, BJ 50 ≈ 500." onChange={(Fu) => setInput({ Fu })} />
      </Card>
      <Card n={4} title="Beban terfaktor (DFBK)">
        <NumField label="Geser grup Vu" unit="kN" value={input.Vu} error={errors.Vu} onChange={(Vu) => setInput({ Vu })} />
        <NumField label="Tarik grup Tu" unit="kN" value={input.Tu} error={errors.Tu} hint="0 = geser murni." onChange={(Tu) => setInput({ Tu })} />
      </Card>
    </>
  )
}

/** Kartu D/C; `info` = hanya informasi (tidak menentukan, tanpa warna OK/NG). */
const dcTile = (label: string, dc: number, info?: string) => ({
  label,
  value: Number.isFinite(dc) ? fx(dc, 2) : '∞',
  sub: info ?? (dc <= 1 ? 'OK' : 'NG'),
  tone: info ? undefined : dc <= 1 ? ('ok' as const) : ('bad' as const),
})

function Results({ r, stale }: { r: BoltConnectionResult | null; stale: boolean }) {
  const [tab, setTab] = useState<DiagramTab>('grup')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : r && r.Vu <= 0 && r.Tu <= 0 ? 'Isi beban Vu dan/atau Tu.' : null
  return (
    <Panel title="Kapasitas" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={DIAGRAM_TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className={`msg ${stale ? 'bad' : 'warn'}`}>{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <BoltDiagram r={r} tab={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                dcTile(`D/C menentukan (${r.gov})`, r.govDC),
                { label: 'φRn geser grup efektif', value: fx(r.phiRge, 1), unit: 'kN', sub: `${r.n} baut M${fx(r.d, 0)}` },
                // geser murni: D/C geser = D/C menentukan, tak perlu kartu kedua
                ...(r.Vu > 0 && r.Tu > 0 ? [dcTile('D/C geser grup', r.dcShear)] : []),
                ...(r.Tu > 0 ? [dcTile('D/C tarik', r.dcTension)] : []),
                ...(r.Vu > 0 && r.Tu > 0 ? [dcTile('D/C kombinasi J3.7', r.dcComboInfo, r.comboNeeded ? undefined : 'info, tak wajib')] : []),
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
