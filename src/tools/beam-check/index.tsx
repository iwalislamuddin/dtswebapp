import { useMemo, useState } from 'react'
import type { BeamCheckResult, FlexCheck, ShearCheck } from '../../calc/beam-check'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import { barLayout } from '../beam-flexure/report'
import type { ToolUIProps } from '../registry'
import { BARS, BEAM_CHECK_DEFAULTS, computeCheck, rejectReason, STIRRUPS, validate, type BeamCheckForm } from './model'
import { beamCheckReport } from './report'

const ID = 'beam-check'
const BAR_OPTS = BARS.map((d) => ({ value: String(d), label: `D${d}` }))
const STIR_OPTS = STIRRUPS.map((d) => ({ value: String(d), label: `Ø${d}` }))
const LAYER_OPTS = ['1', '2', '3'].map((v) => ({ value: v, label: `${v} lapis` }))
const YESNO: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'no', label: 'Tidak' },
  { value: 'yes', label: 'Ya' },
]

export default function BeamCheck({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<BeamCheckForm>(ID, BEAM_CHECK_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeCheck)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (r ? beamCheckReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input penampang, tulangan, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><SectionsPreview r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={r} stale={stale} reject={reject} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: BeamCheckForm
  setInput: (p: Partial<BeamCheckForm>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (k: keyof BeamCheckForm) => ({ value: input[k], error: errors[k] })
  return (
    <>
      <Card n={1} title="Material" actions={<ResetButton onReset={onReset} />}>
        <NumField label="f'c — mutu beton" unit="MPa" {...f('fc')} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy — tul. longitudinal" unit="MPa" {...f('fy')} onChange={(fy) => setInput({ fy })} />
        <NumField label="fyt — sengkang" unit="MPa" {...f('fyt')} onChange={(fyt) => setInput({ fyt })} />
      </Card>
      <Card n={2} title="Penampang & sengkang">
        <NumField label="b — lebar" unit="mm" {...f('b')} onChange={(b) => setInput({ b })} />
        <NumField label="h — tinggi total" unit="mm" {...f('h')} onChange={(h) => setInput({ h })} />
        <NumField label="Selimut bersih ke sengkang" unit="mm" {...f('cc')} onChange={(cc) => setInput({ cc })} />
        <SelectField label="Diameter sengkang" value={input.ds} options={STIR_OPTS} onChange={(ds) => setInput({ ds })} />
        <Field label="Jumlah kaki">
          <Segmented
            ariaLabel="Jumlah kaki"
            value={input.nLegs}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
            onChange={(nLegs) => setInput({ nLegs })}
          />
        </Field>
        <NumField label="Spasi sengkang tumpuan" unit="mm" {...f('sSup')} onChange={(sSup) => setInput({ sSup })} />
      </Card>
      <Card n={3} title="Tulangan memanjang">
        <SelectField label="Diameter (lapangan & tumpuan)" value={input.db} options={BAR_OPTS} onChange={(db) => setInput({ db })} />
        <NumField label="Lapangan — tarik bawah" {...f('nPosT')} onChange={(nPosT) => setInput({ nPosT })} />
        <NumField label="Lapangan — tekan atas" {...f('nPosC')} onChange={(nPosC) => setInput({ nPosC })} />
        <SelectField label="Lapangan — lapis tarik" value={input.layPos} options={LAYER_OPTS} onChange={(layPos) => setInput({ layPos: layPos as BeamCheckForm['layPos'] })} />
        <NumField label="Tumpuan — tarik atas" {...f('nNegT')} onChange={(nNegT) => setInput({ nNegT })} />
        <NumField label="Tumpuan — tekan bawah" {...f('nNegC')} onChange={(nNegC) => setInput({ nNegC })} />
        <SelectField label="Tumpuan — lapis tarik" value={input.layNeg} options={LAYER_OPTS} onChange={(layNeg) => setInput({ layNeg: layNeg as BeamCheckForm['layNeg'] })} />
      </Card>
      <Card n={4} title="Beban terfaktor">
        <NumField label="Mu+ — momen lapangan" unit="kN·m" {...f('Mpos')} onChange={(Mpos) => setInput({ Mpos })} />
        <NumField label="Mu− — momen tumpuan" unit="kN·m" {...f('Mneg')} onChange={(Mneg) => setInput({ Mneg })} />
        <NumField label="Vu — geser tumpuan" unit="kN" {...f('Vu')} onChange={(Vu) => setInput({ Vu })} />
      </Card>
      <Card n={5} title="Opsi">
        <Field label="Sengkang lapangan berbeda">
          <Segmented ariaLabel="Sengkang lapangan" value={input.midStir} options={YESNO} onChange={(midStir) => setInput({ midStir })} />
        </Field>
        {input.midStir === 'yes' && (
          <>
            <NumField label="Spasi sengkang lapangan" unit="mm" {...f('sMid')} onChange={(sMid) => setInput({ sMid })} />
            <NumField label="Vu — geser lapangan" unit="kN" {...f('VuMid')} onChange={(VuMid) => setInput({ VuMid })} />
          </>
        )}
        <Field label="Perhitungkan torsi">
          <Segmented ariaLabel="Torsi" value={input.torsion} options={YESNO} onChange={(torsion) => setInput({ torsion })} />
        </Field>
        {input.torsion === 'yes' && (
          <>
            <NumField label="Tu — torsi" unit="kN·m" {...f('Tu')} onChange={(Tu) => setInput({ Tu })} />
            <NumField label="Tul. samping — jumlah" hint="Total kedua sisi (kiri = kanan)." {...f('nSide')} onChange={(nSide) => setInput({ nSide })} />
            <SelectField label="Tul. samping — diameter" value={input.dbSide} options={BAR_OPTS} onChange={(dbSide) => setInput({ dbSide })} />
          </>
        )}
      </Card>
    </>
  )
}

/** Satu penampang: beton, sengkang, tulangan tarik/tekan, dan label. */
function Section({ fc, x0, y0, sc, title, side }: { fc: FlexCheck; x0: number; y0: number; sc: number; title: string; side: 'bottom' | 'top' }) {
  const r = fc.flex
  const W = r.b! * sc, H = r.h! * sc
  const o = (r.cc! + r.ds! / 2) * sc
  const L = barLayout(r)
  // barLayout: tarik di bawah. Untuk tumpuan (tarik atas) dibalik vertikal.
  const yy = (y: number) => y0 + (side === 'bottom' ? y : r.h! - y) * sc
  return (
    <g>
      <text x={x0 + W / 2} y={y0 - 8} textAnchor="middle" className="bp-label">{title}</text>
      <g className="bp-plate"><rect x={x0} y={y0} width={W} height={H} /></g>
      <rect x={x0 + o} y={y0 + o} width={W - 2 * o} height={H - 2 * o} fill="none" stroke="var(--dg-m)" strokeWidth={1.5} rx={3} />
      {L.tension.map((p, k) => <circle key={`t${k}`} cx={x0 + p.x * sc} cy={yy(p.y)} r={Math.max(2.5, (p.db * sc) / 2)} fill="var(--dg-ink)" />)}
      {L.comp.map((p, k) => <circle key={`c${k}`} cx={x0 + p.x * sc} cy={yy(p.y)} r={Math.max(2.5, (p.db * sc) / 2)} fill="var(--dg-axis)" />)}
      <text x={x0 + W / 2} y={y0 + H + 16} textAnchor="middle" className="dg-note">
        {r.n1}D{fx(r.db1, 0)} · φMn {fx(r.phiMnkNm, 1)} kN·m
      </text>
    </g>
  )
}

function SectionsPreview({ r, w, h }: { r: BeamCheckResult; w: number; h: number }) {
  if (w < 200 || h < 120) return null
  const f = r.pos!.flex
  const sc = Math.min((w - 60) / (2 * f.b!), (h - 70) / f.h!)
  const W = f.b! * sc
  const gap = (w - 2 * W) / 3
  const y0 = 28 + (h - 70 - f.h! * sc) / 2
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Penampang lapangan dan tumpuan">
      <Section fc={r.pos!} x0={gap} y0={y0} sc={sc} title="Lapangan (M+)" side="bottom" />
      <Section fc={r.neg!} x0={2 * gap + W} y0={y0} sc={sc} title="Tumpuan (M−)" side="top" />
    </svg>
  )
}

type Tab = 'lentur' | 'geser'

function chart(r: BeamCheckResult, tab: Tab): { bars: CapacityBar[]; note: string } {
  const v = r.input!
  if (tab === 'lentur')
    return {
      note: 'kN·m · garis = Mu',
      bars: [
        { label: 'Lapangan φMn', cap: r.pos!.flex.phiMnkNm!, dem: v.Mpos, color: 'var(--dg-m)', gov: r.pos!.ratioM >= r.neg!.ratioM },
        { label: 'Tumpuan φMn', cap: r.neg!.flex.phiMnkNm!, dem: v.Mneg, color: 'var(--dg-m)', gov: r.neg!.ratioM > r.pos!.ratioM },
      ],
    }
  const bars: CapacityBar[] = [{ label: 'Tumpuan φVn', cap: r.sup!.r.phiVnkN!, dem: v.Vu, color: 'var(--dg-v)', gov: !r.mid || r.sup!.ratioV >= r.mid.ratioV }]
  if (r.mid) bars.push({ label: 'Lapangan φVn', cap: r.mid.r.phiVnkN!, dem: v.VuMid, color: 'var(--dg-v)', gov: r.mid.ratioV > r.sup!.ratioV })
  return { note: 'kN · garis = Vu', bars }
}

function Results({ r, stale, reject }: { r: BeamCheckResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('lentur')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const dc = (v: number, label: string, extra?: string) => ({ label, value: fx(v, 2), sub: `${v <= 1 ? 'OK' : 'NG'}${extra ? ' · ' + extra : ''}`, tone: v <= 1 ? ('ok' as const) : ('bad' as const) })
  const stir = (c: ShearCheck) => Math.max(c.ratioStir, c.ratioS, c.ratioSec, c.ratioAl)
  const minEt = r ? Math.max(r.pos!.ratioMin, r.neg!.ratioMin, r.pos!.ratioEt, r.neg!.ratioEt) : 0
  return (
    <Panel
      title="Kapasitas"
      className="results-panel"
      tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'lentur', label: 'Lentur' }, { id: 'geser', label: 'Geser' }]} onChange={setTab} />}
    >
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <CapacityBars w={w} h={h} ariaLabel={`Kapasitas ${tab}`} {...chart(r, tab)} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Rasio D/C</h4>
            <StatTiles
              items={[
                dc(r.pos!.ratioM, 'Lentur lapangan Mu+/φMn', `φMn ${fx(r.pos!.flex.phiMnkNm, 1)} kN·m`),
                dc(r.neg!.ratioM, 'Lentur tumpuan Mu−/φMn', `φMn ${fx(r.neg!.flex.phiMnkNm, 1)} kN·m`),
                dc(r.sup!.ratioV, 'Geser tumpuan Vu/φVn', `φVn ${fx(r.sup!.r.phiVnkN, 0)} kN`),
                ...(r.mid ? [dc(r.mid.ratioV, 'Geser lapangan Vu/φVn', `φVn ${fx(r.mid.r.phiVnkN, 0)} kN`)] : []),
                ...(r.input!.torsion
                  ? [r.sup!.ratioT > 0 ? dc(r.sup!.ratioT, 'Torsi Tu/φTn', `φTn ${fx(r.sup!.r.phiTnkNm, 1)} kN·m`) : { label: 'Torsi', value: '—', sub: `Tu < φTth ${fx(r.sup!.r.phiTthkNm, 1)} kN·m (diabaikan)` }]
                  : []),
                dc(stir(r.sup!), 'Sengkang tumpuan', `s maks ${fx(r.sup!.sMax, 0)} mm`),
                ...(r.mid ? [dc(stir(r.mid), 'Sengkang lapangan', `s maks ${fx(r.mid.sMax, 0)} mm`)] : []),
                dc(minEt, 'As min & daktilitas', 'εt ≥ 0,004'),
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
