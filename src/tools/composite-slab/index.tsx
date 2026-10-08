import { useMemo, useState } from 'react'
import type { CompositeSlabResult, DeckProfile } from '../../calc/composite-slab'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { Card, NumField, Panel, ResetButton, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { COMP_DEFAULTS, computeComp, DECK, deckFields, validate, type CompInput } from './model'
import { compReport } from './report'

const ID = 'composite-slab'
const opts = (ds: number[], p = 'D') => ds.map((d) => ({ value: String(d), label: `${p}${d}` }))

export default function CompositeSlab({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<CompInput>(ID, COMP_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeComp)
  const report = useMemo(() => (r ? compReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input pelat, dek, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><DeckSection r={r} w={w} h={h} /></div> : null)}</Sized>
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
  input: CompInput
  setInput: (p: Partial<CompInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const deck = DECK[input.profile]
  return (
    <>
      <Card n={1} title="Pelat & bentang" actions={<ResetButton onReset={onReset} />}>
        <NumField label="L — bentang bersih" unit="m" value={input.L} error={errors.L} onChange={(L) => setInput({ L })} />
        <NumField label="D — tebal total slab" unit="mm" value={input.D} error={errors.D} onChange={(D) => setInput({ D })} />
        <SelectField
          label="Jumlah bentang"
          value={input.spans}
          options={[
            { value: '1', label: '1 (sederhana)' },
            { value: '2', label: '2 menerus' },
            { value: '3', label: '≥ 3 menerus' },
          ]}
          onChange={(spans) => setInput({ spans })}
        />
        <SelectField
          label="Topangan sementara"
          value={input.prop}
          options={[
            { value: 'none', label: 'Tanpa topangan' },
            { value: 'mid', label: 'Topangan di tengah bentang' },
          ]}
          onChange={(prop) => setInput({ prop })}
        />
        <SelectField
          label="Aksi struktur"
          value={input.composite}
          options={[
            { value: 'comp', label: 'Komposit (dek = tulangan +)' },
            { value: 'noncomp', label: 'Non-komposit (dek bekisting)' },
          ]}
          onChange={(composite) => setInput({ composite })}
        />
      </Card>
      <Card n={2} title="Dek baja">
        <SelectField
          label="Profil dek"
          value={input.profile}
          options={[
            { value: 'heavy', label: DECK.heavy.name },
            { value: 'light', label: DECK.light.name },
          ]}
          onChange={(profile: DeckProfile) => {
            const bmt = DECK[profile].bmts[0]
            setInput({ profile, bmt, ...deckFields(profile, bmt) })
          }}
        />
        <SelectField label="Tebal baja dasar (BMT)" value={input.bmt} options={deck.bmts.map((b) => ({ value: b, label: `${b} mm` }))} onChange={(bmt) => setInput({ bmt, ...deckFields(input.profile, bmt) })} />
        <p className="muted card-note">Properti di bawah terisi dari tabel katalog (indikatif) — bisa ditimpa dengan nilai resmi pabrikan.</p>
        <NumField label="hr — tinggi rusuk" unit="mm" value={input.hr} error={errors.hr} onChange={(hr) => setInput({ hr })} />
        <NumField label="Ase — luas baja dek" unit="mm²/m" value={input.Ase} error={errors.Ase} onChange={(Ase) => setInput({ Ase })} />
        <NumField label="yc — titik berat dek dari bawah" unit="mm" value={input.ye} error={errors.ye} onChange={(ye) => setInput({ ye })} />
        <NumField label="Ix dek" unit="mm⁴/m" value={input.Ideck} error={errors.Ideck} onChange={(Ideck) => setInput({ Ideck })} />
        <NumField label="φMn dek (konstruksi)" unit="kN·m/m" value={input.Mcap} error={errors.Mcap} hint="0,9·fy·Zx; 0 = lewati cek momen konstruksi." onChange={(Mcap) => setInput({ Mcap })} />
        <NumField label="fyd — leleh baja dek" unit="MPa" value={input.fyd} error={errors.fyd} onChange={(fyd) => setInput({ fyd })} />
        <NumField label="Σ lebar bawah rusuk" unit="mm/m" value={input.bc} error={errors.bc} hint="Lebar tekan pada momen negatif." onChange={(bc) => setInput({ bc })} />
      </Card>
      <Card n={3} title="Beban">
        <NumField label="SDL — mati tambahan" unit="kN/m²" value={input.SDL} error={errors.SDL} hint="Di luar berat slab + dek (dihitung otomatis)." onChange={(SDL) => setInput({ SDL })} />
        <NumField label="LL — beban hidup" unit="kN/m²" value={input.LL} error={errors.LL} onChange={(LL) => setInput({ LL })} />
        <NumField label="Beban hidup konstruksi" unit="kN/m²" value={input.cLL} error={errors.cLL} hint="Pekerja + peralatan saat cor (SDI ≈ 1,0)." onChange={(cLL) => setInput({ cLL })} />
      </Card>
      <Card n={4} title="Beton, tulangan & konektor">
        <NumField label="f'c" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy — tulangan" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        <NumField label="Selimut atas" unit="mm" value={input.cover} error={errors.cover} onChange={(cover) => setInput({ cover })} />
        <SelectField label="Ø tul. negatif (atas)" value={input.db} options={opts([8, 10, 13, 16])} onChange={(db) => setInput({ db })} />
        {input.composite === 'noncomp' && <SelectField label="Ø tul. bawah" value={input.dbBot} options={opts([8, 10, 13, 16])} onChange={(dbBot) => setInput({ dbBot })} />}
        <SelectField label="Ø tul. susut" value={input.dbSt} options={opts([6, 8, 10])} onChange={(dbSt) => setInput({ dbSt })} />
        <SelectField
          label="Tipe konektor"
          value={input.conType}
          options={[
            { value: 'stud', label: 'Stud berkepala' },
            { value: 'rebar', label: 'Tulangan ulir dilas' },
          ]}
          onChange={(conType) => setInput({ conType })}
        />
        <SelectField label="Ø konektor" value={input.ds} options={opts([13, 16, 19, 22], 'Ø')} onChange={(ds) => setInput({ ds })} />
        <NumField label="Fu konektor" unit="MPa" value={input.fuS} error={errors.fuS} onChange={(fuS) => setInput({ fuS })} />
      </Card>
    </>
  )
}

/** Potongan pelat: beton di atas rusuk, rusuk beton, garis dek, tulangan atas. */
function DeckSection({ r, w, h }: { r: CompositeSlabResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const pitch = r.pitch!, hr = r.hr!, D = r.D!
  const n = Math.max(2, Math.floor((w - 100) / (pitch * 0.5)) / 2)
  const Wmm = Math.min(n, 3.5) * pitch
  const sc = Math.min((w - 110) / Wmm, (h - 60) / D)
  const x0 = 60, yTop = 30 + (h - 60 - D * sc) / 2, yBot = yTop + D * sc, yc = yBot - hr * sc
  const wt = 0.6 * pitch * sc, wb = 0.45 * pitch * sc
  const ribs: number[] = []
  for (let k = 0; (k + 0.5) * pitch * sc + wt / 2 <= Wmm * sc; k++) ribs.push(x0 + (k + 0.5) * pitch * sc)
  const deck = [`M${x0},${yc}`, ...ribs.map((cx) => `L${cx - wt / 2},${yc} L${cx - wb / 2},${yBot} L${cx + wb / 2},${yBot} L${cx + wt / 2},${yc}`), `L${x0 + Wmm * sc},${yc}`].join(' ')
  const yr = yTop + (r.cover! + r.db! / 2) * sc
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Potongan pelat komposit">
      <text x={8} y={16} className="bp-label">
        {r.deckName} · D {fx(D, 0)} mm · {r.comp ? 'komposit' : 'non-komposit'}
      </text>
      <g className="bp-plate">
        <rect x={x0} y={yTop} width={Wmm * sc} height={yc - yTop} style={{ stroke: 'none' }} />
        {ribs.map((cx) => (
          <path key={cx} d={`M${cx - wt / 2},${yc} L${cx + wt / 2},${yc} L${cx + wb / 2},${yBot} L${cx - wb / 2},${yBot} Z`} style={{ stroke: 'none' }} />
        ))}
      </g>
      <line x1={x0} y1={yTop} x2={x0 + Wmm * sc} y2={yTop} stroke="var(--dg-support)" />
      <path d={deck} fill="none" stroke="var(--dg-m)" strokeWidth={2.4} />
      {Array.from({ length: Math.floor((Wmm * sc - 20) / 30) }, (_, k) => (
        <circle key={k} cx={x0 + 15 + k * 30} cy={yr} r={2.5} fill="var(--dg-ink)" />
      ))}
      <g className="bp-dim">
        <line x1={x0 + Wmm * sc + 12} y1={yTop} x2={x0 + Wmm * sc + 12} y2={yBot} />
        <text x={x0 + Wmm * sc + 16} y={(yTop + yBot) / 2 + 4}>
          D {fx(D, 0)}
        </text>
        <text x={x0 - 6} y={(yc + yBot) / 2 + 4} textAnchor="end" style={{ fill: 'var(--dg-m)' }}>
          hr {fx(hr, 0)}
        </text>
        <text x={x0 - 6} y={(yTop + yc) / 2 + 4} textAnchor="end">
          tc {fx(r.tc, 0)}
        </text>
      </g>
      <text x={8} y={h - 6} className="dg-note">
        L {fx(r.L, 2)} m · {r.coefLbl} · {r.prop === 'mid' ? 'topangan tengah' : 'tanpa topangan'}
      </text>
    </svg>
  )
}

type Tab = 'kekuatan' | 'lendutan'

function chart(r: CompositeSlabResult, tab: Tab): { bars: CapacityBar[]; note: string } {
  if (tab === 'kekuatan')
    return {
      note: 'kN·m/m · batang = kapasitas, garis = momen perlu',
      bars: [
        ...(r.McCap! > 0 ? [{ label: 'Dek saat konstruksi', cap: r.McCap!, dem: r.McU!, color: 'var(--dg-y)' }] : []),
        { label: 'Komposit M+', cap: r.phiMnPos!, dem: r.Mpos!, color: 'var(--dg-m)', gov: true },
      ],
    }
  return {
    note: 'mm · batang = batas izin, garis = lendutan',
    bars: [
      { label: 'Konstruksi (≤ L/180, 20)', cap: r.dcLim!, dem: r.dc!, color: 'var(--dg-y)' },
      { label: 'Total (L/250)', cap: r.lim250!, dem: r.dTot!, color: 'var(--dg-v)' },
      { label: 'Beban hidup (L/360)', cap: r.lim360!, dem: r.dLL!, color: 'var(--dg-v)' },
    ],
  }
}

function Results({ r, stale }: { r: CompositeSlabResult | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('kekuatan')
  const dc = (v: number, label: string, sub?: string) => ({ label, value: fx(v, 2), sub: `${v <= 1 ? 'OK' : 'NG'}${sub ? ' · ' + sub : ''}`, tone: v <= 1 ? ('ok' as const) : ('bad' as const) })
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'kekuatan', label: 'Kekuatan' }, { id: 'lendutan', label: 'Lendutan' }]} onChange={setTab} />}>
      <div className="results">
        {stale && <p className="msg bad">Input belum lengkap/valid — hasil di bawah dari input sah terakhir.</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <CapacityBars w={w} h={h} ariaLabel={tab} {...chart(r, tab)} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                ...(r.McCap! > 0 ? [dc(r.McU! / r.McCap!, 'Konstruksi Mcu/φMn dek')] : []),
                dc(r.Mpos! / r.phiMnPos!, 'Komposit Mu+/φMn+', `φMn ${fx(r.phiMnPos, 1)}`),
                dc(Math.max(r.dTot! / r.lim250!, r.dLL! / r.lim360!, r.dc! / r.dcLim!), 'Lendutan', `total ${fx(r.dTot, 1)} mm`),
                { label: 'Tulangan atas / susut', value: `${r.asNeg ? `D${r.db}-${r.asNeg.s}` : '—'} / D${r.dbSt}-${r.sSt}`, sub: `konektor ${r.Nstud}/m` },
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
