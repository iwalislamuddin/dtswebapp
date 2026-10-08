import { useMemo, useState } from 'react'
import type { ContinuousBeamResult } from '../../calc/continuous-beam'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { Curve, sx, XAxis, type DiagramFrame } from '../../ui/diagram'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { CB_BARS, CB_DEFAULTS, CB_STIRRUPS, coefLabels, computeCB, momentDiagram, rejectReason, shearDiagram, validate, type CBInput } from './model'
import { cbReport } from './report'

const ID = 'continuous-beam'

interface Outcome {
  i: CBInput
  r: ContinuousBeamResult
}

export default function ContinuousBeam({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<CBInput>(ID, CB_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: CBInput): Outcome | null => {
    const r = computeCB(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (result ? cbReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input bentang, penampang, dan beban untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><Elevation r={result.r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={result?.r ?? null} stale={stale} reject={reject} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: CBInput
  setInput: (p: Partial<CBInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const balok = input.elem === 'balok'
  const n = Number(input.n) || 0
  return (
    <>
      <Card n={1} title="Elemen & geometri" actions={<ResetButton onReset={onReset} />}>
        <Field label="Jenis elemen">
          <Segmented
            ariaLabel="Jenis elemen"
            value={input.elem}
            options={[
              { value: 'pelat', label: 'Pelat 1-arah' },
              { value: 'balok', label: 'Balok' },
            ]}
            onChange={(elem) => setInput({ elem })}
          />
        </Field>
        <NumField label="Jumlah bentang" value={input.n} error={errors.n} hint="1–12." onChange={(n) => setInput({ n })} />
        <NumField label={n >= 3 ? 'Bentang ujung L (as–as)' : 'Bentang L (as–as)'} unit="m" value={input.L} error={errors.L} onChange={(L) => setInput({ L })} />
        {n >= 3 && <NumField label="Bentang dalam Li (as–as)" unit="m" value={input.Li} error={errors.Li} onChange={(Li) => setInput({ Li })} />}
        <NumField label="Lebar tumpuan" unit="mm" value={input.bsup} error={errors.bsup} hint="Bentang bersih ln = L − lebar tumpuan." onChange={(bsup) => setInput({ bsup })} />
        {balok && <NumField label="Lebar balok b" unit="mm" value={input.b} error={errors.b} onChange={(b) => setInput({ b })} />}
        <NumField label={balok ? 'Tinggi balok h' : 'Tebal pelat h'} unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />
      </Card>
      <Card n={2} title="Beban & tumpuan">
        {balok ? (
          <>
            <NumField label="Beban mati tambahan" unit="kN/m" value={input.qDb} error={errors.qDb} hint="Di luar berat sendiri." onChange={(qDb) => setInput({ qDb })} />
            <NumField label="Beban hidup" unit="kN/m" value={input.qLb} error={errors.qLb} onChange={(qLb) => setInput({ qLb })} />
          </>
        ) : (
          <>
            <NumField label="Beban mati tambahan" unit="kN/m²" value={input.qDs} error={errors.qDs} hint="Di luar berat sendiri." onChange={(qDs) => setInput({ qDs })} />
            <NumField label="Beban hidup" unit="kN/m²" value={input.qLs} error={errors.qLs} onChange={(qLs) => setInput({ qLs })} />
          </>
        )}
        {n === 1 ? (
          <SelectField
            label="Tumpuan"
            value={input.tumpuan1}
            options={[
              { value: 'ss', label: 'Sendi – sendi' },
              { value: 'js', label: 'Jepit – sendi' },
              { value: 'jj', label: 'Jepit – jepit' },
            ]}
            onChange={(tumpuan1) => setInput({ tumpuan1 })}
          />
        ) : (
          <>
            <SelectField
              label="Ujung eksterior"
              value={input.ujung}
              options={[
                { value: 'bebas', label: 'Bebas (tak terkekang)' },
                { value: 'spandrel', label: 'Menyatu balok tepi' },
                { value: 'kolom', label: 'Menyatu kolom' },
              ]}
              onChange={(ujung) => setInput({ ujung })}
            />
            <Field label="M− tumpuan">
              <Segmented
                ariaLabel="Momen tumpuan"
                value={input.m12}
                options={[
                  { value: 'std', label: 'Tabel 6.5.2' },
                  { value: 'm12', label: '1/12 semua' },
                ]}
                onChange={(m12) => setInput({ m12 })}
              />
            </Field>
          </>
        )}
      </Card>
      <Card n={3} title="Desain tulangan">
        <Field label="Hitung penulangan">
          <Segmented
            ariaLabel="Hitung penulangan"
            value={input.design}
            options={[
              { value: 'ya', label: 'Ya' },
              { value: 'tidak', label: 'Tidak' },
            ]}
            onChange={(design) => setInput({ design })}
          />
        </Field>
        {input.design === 'ya' && (
          <>
            <NumField label="f'c" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
            <NumField label="fy — tul. lentur" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
            <NumField label="Selimut bersih" unit="mm" value={input.cc} error={errors.cc} onChange={(cc) => setInput({ cc })} />
            <SelectField label="Ø tulangan utama" value={input.db} options={CB_BARS.map((d) => ({ value: String(d), label: `D${d}` }))} onChange={(db) => setInput({ db })} />
            {balok && (
              <>
                <NumField label="fyt — sengkang" unit="MPa" value={input.fyt} error={errors.fyt} onChange={(fyt) => setInput({ fyt })} />
                <SelectField label="Ø sengkang" value={input.ds} options={CB_STIRRUPS.map((d) => ({ value: String(d), label: `Ø${d}` }))} onChange={(ds) => setInput({ ds })} />
              </>
            )}
          </>
        )}
      </Card>
    </>
  )
}

/** Elevasi: tumpuan, bentang, koefisien momen (tumpuan di atas, lapangan di bawah). */
function Elevation({ r, w, h }: { r: ContinuousBeamResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const total = r.spanLen!.reduce((a, b) => a + b, 0)
  const f: DiagramFrame = { w, h, padL: 30, padR: 30, padT: 0, padB: 0, x0: 0, x1: total }
  const y = Math.round(h * 0.45)
  const co = coefLabels(r)
  let acc = 0
  const sxs = [0, ...r.spanLen!.map((L) => (acc += L))]
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Elevasi balok menerus">
      <text x={8} y={16} className="bp-label">
        {r.elem === 'pelat' ? `Pelat h ${fx(r.h, 0)}` : `Balok ${fx(r.b, 0)}×${fx(r.h, 0)}`} · {r.n} bentang · wu {fx(r.wu, 2)} kN/m
      </text>
      <line className="bp-beam" x1={sx(f, 0)} y1={y} x2={sx(f, total)} y2={y} />
      {sxs.map((x, k) => (
        <g key={k}>
          <path d={`M${sx(f, x)},${y + 3} l-8,12 h16 Z`} className="bp-support-tri" fill="color-mix(in srgb, var(--dg-support) 30%, transparent)" stroke="var(--dg-support)" />
          <text x={sx(f, x)} y={y - 12} textAnchor="middle" style={{ fill: 'var(--dg-m)', fontWeight: 600 }}>
            {co.sup[k]}
          </text>
        </g>
      ))}
      {r.spanLen!.map((L, k) => (
        <g key={k}>
          <text x={sx(f, sxs[k] + L / 2)} y={y + 32} textAnchor="middle" style={{ fill: 'var(--dg-y)', fontWeight: 600 }}>
            {co.span[k]}
          </text>
          <text x={sx(f, sxs[k] + L / 2)} y={y + 48} textAnchor="middle" className="dg-note">
            {fx(L, 2)} m
          </text>
        </g>
      ))}
      <text x={8} y={h - 6} className="dg-note">
        koefisien M− (atas) & M+ (bawah) × wu·ln² · {r.n === 1 ? 'satu bentang: statika' : 'Tabel 6.5.2'}
      </text>
    </svg>
  )
}

type Tab = 'momen' | 'geser'

function Diagram({ r, tab, w, h }: { r: ContinuousBeamResult; tab: Tab; w: number; h: number }) {
  const pts = useMemo(() => (tab === 'momen' ? momentDiagram(r) : shearDiagram(r)), [r, tab])
  if (w < 160 || h < 100) return null
  const total = r.spanLen!.reduce((a, b) => a + b, 0)
  const f: DiagramFrame = { w, h, padL: 36, padR: 36, padT: 30, padB: 40, x0: 0, x1: total }
  const ext = pts.reduce((a, p) => (Math.abs(p[1]) > Math.abs(a[1]) ? p : a), pts[0])
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={`Diagram ${tab}`}>
      <Curve
        f={f}
        pts={pts}
        color={tab === 'momen' ? 'var(--dg-m)' : 'var(--dg-v)'}
        unit={tab === 'momen' ? 'kN·m' : 'kN'}
        dp={2}
        downPositive={tab === 'momen'}
        extreme={{ x: ext[0], v: ext[1] }}
        hover={null}
      />
      <XAxis f={f} y={h - f.padB + 6} unit="m" />
      <text x={f.padL} y={16} className="dg-note">
        {tab === 'momen' ? 'Amplop koefisien (indikatif): M− di tumpuan, M+ di tengah bentang' : 'Geser koefisien (indikatif) di muka tumpuan'}
      </text>
    </svg>
  )
}

function Results({ r, stale, reject }: { r: ContinuousBeamResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<Tab>('momen')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const items = r?.des?.valid ? r.des.items ?? [] : []
  return (
    <Panel title="Diagram" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={[{ id: 'momen', label: 'Momen' }, { id: 'geser', label: 'Geser' }]} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <Diagram r={r} tab={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'M+ / M− maks', value: `${fx(r.MposMax, 1)} / ${fx(r.MnegMax, 1)}`, unit: 'kN·m', sub: `wu ${fx(r.wu, 2)} kN/m` },
                { label: 'Vu maks', value: fx(r.VuMax, 1), unit: 'kN', sub: r.des?.shear?.sPakai ? `sengkang Ø${r.des.ds}-${r.des.shear.sPakai}` : undefined },
                ...items.slice(0, 2).map((it) => ({ label: it.label, value: it.txt ?? '-', sub: `As ${fx(it.AsProv, 0)} ≥ ${fx(it.AsReq, 0)}${r.elem === 'pelat' ? ' mm²/m' : ' mm²'}` })),
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
