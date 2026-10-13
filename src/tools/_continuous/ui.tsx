import { useMemo, useState } from 'react'
import type { CBElement } from '../../calc/shared/coefficient-method'
import type { CMItem, CMResult } from '../../calc/continuous-beam'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { sx, XAxis, type DiagramFrame } from '../../ui/diagram'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab, FigureSvg } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { CB_BARS, CB_LIMITS, CB_STIRRUPS, CB_XI, computeCM, defaultsFor, extremeOf, rejectReason, validate, type CMUI } from './model'
import { rebarFigures } from './rebar'
import { cmReport } from './report'

interface Outcome {
  i: CMUI
  r: CMResult
}

export default function ContinuousTool({ id, elem, tab }: ToolUIProps & { id: string; elem: CBElement }) {
  const [input, setInput, reset] = useToolInput<CMUI>(id, defaultsFor(elem))
  const errors = useMemo(() => validate(input, elem), [input, elem])
  const compute = useMemo(() => (i: CMUI): Outcome | null => {
    const r = computeCM(i, elem)
    return r ? { i, r } : null
  }, [elem])
  const { result, stale } = useAutoCompute(input, compute)
  const reject = useMemo(() => rejectReason(input, elem), [input, elem])
  const report = useMemo(() => (result ? cmReport(result.i, result.r) : null), [result])
  useToolReport(id, stale ? null : report)
  const [ptab, setPtab] = useState<'elevasi' | 'tulangan'>('elevasi')
  const figs = useMemo(() => (result ? rebarFigures(result.r, 1) : []), [result])

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
      inputs={<Inputs elem={elem} input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel
          title="Preview"
          tools={
            <SubTabs
              ariaLabel="Preview"
              value={ptab}
              tabs={[{ id: 'elevasi', label: 'Bentang' }, { id: 'tulangan', label: 'Penulangan' }]}
              onChange={setPtab}
            />
          }
        >
          {ptab === 'tulangan' ? (
            figs.length ? (
              <div className={`rebar-figs${stale ? ' stale' : ''}`} style={{ overflow: 'auto', height: '100%' }}>
                {figs.map((fig) => (
                  <FigureSvg key={fig.alt} fig={{ ...fig, caption: undefined }} />
                ))}
              </div>
            ) : (
              <p className="msg">Penulangan tampil bila "Hitung penulangan" = Ya dan input valid.</p>
            )
          ) : (
            <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><Elevation r={result.r} w={w} h={h} /></div> : null)}</Sized>
          )}
        </Panel>
      }
      results={<Results r={result?.r ?? null} stale={stale} reject={reject} />}
    />
  )
}

function Inputs({
  elem,
  input,
  setInput,
  errors,
  onReset,
}: {
  elem: CBElement
  input: CMUI
  setInput: (p: Partial<CMUI>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const balok = elem === 'balok'
  const n = Number(input.n) || 0
  const solverRelevant = input.metode !== 'koef'
  let card = 0
  return (
    <>
      <Card n={++card} title="Bentang & penampang" actions={<ResetButton onReset={onReset} />}>
        <NumField label="Jumlah bentang" value={input.n} error={errors.n} hint="1–12." onChange={(n2) => setInput({ n: n2 })} />
        <NumField label={n >= 3 ? 'Bentang ujung L (as–as)' : 'Bentang L (as–as)'} unit="m" value={input.L} error={errors.L} onChange={(L) => setInput({ L })} />
        {n >= 3 && <NumField label="Bentang dalam Li (as–as)" unit="m" value={input.Li} error={errors.Li} onChange={(Li) => setInput({ Li })} />}
        <NumField label="Lebar tumpuan" unit="mm" value={input.bsup} error={errors.bsup} hint="Bentang bersih ln = L − lebar tumpuan." onChange={(bsup) => setInput({ bsup })} />
        {balok && <NumField label="Lebar balok bw" unit="mm" value={input.b} error={errors.b} onChange={(b) => setInput({ b })} />}
        <NumField label={balok ? 'Tinggi balok h (total)' : 'Tebal pelat h'} unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />
      </Card>
      {balok && (
        <Card n={++card} title="Pelat sayap (balok T/L)">
          <Field label="Penampang lentur">
            <Segmented
              ariaLabel="Penampang balok"
              value={input.sect}
              options={[
                { value: 'persegi', label: 'Persegi' },
                { value: 'T', label: 'T' },
                { value: 'L', label: 'L' },
              ]}
              onChange={(sect) => setInput({ sect })}
            />
          </Field>
          <NumField
            label="Lebar tributari"
            unit="m"
            value={input.bt}
            error={errors.bt}
            hint={input.sect === 'L' ? 'Dari sumbu balok ke tepi pelat yang dipikul.' : 'Lebar pelat yang dipikul (balok T interior: jarak antar balok).'}
            onChange={(bt) => setInput({ bt })}
          />
          <NumField label="Tebal pelat sayap hf" unit="mm" value={input.hf} error={errors.hf} hint="Beban pelat × lebar tributari ikut dihitung; sayap efektif Tabel 6.3.2.1." onChange={(hf) => setInput({ hf })} />
        </Card>
      )}
      <Card n={++card} title="Beban & tumpuan">
        <NumField
          label={balok ? 'Beban mati tambahan pelat' : 'Beban mati tambahan'}
          unit="kN/m²"
          value={input.qDs}
          error={errors.qDs}
          hint="Di luar berat sendiri."
          onChange={(qDs) => setInput({ qDs })}
        />
        <NumField label={balok ? 'Beban hidup pelat' : 'Beban hidup'} unit="kN/m²" value={input.qLs} error={errors.qLs} onChange={(qLs) => setInput({ qLs })} />
        {balok && (
          <>
            <NumField label="Beban mati garis tambahan" unit="kN/m" value={input.qDb} error={errors.qDb} hint="Mis. dinding di atas balok." onChange={(qDb) => setInput({ qDb })} />
            <NumField label="Beban hidup garis" unit="kN/m" value={input.qLb} error={errors.qLb} onChange={(qLb) => setInput({ qLb })} />
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
              label="Ujung eksterior (koefisien)"
              value={input.ujung}
              options={[
                { value: 'bebas', label: 'Bebas (tak terkekang)' },
                { value: 'spandrel', label: 'Menyatu balok tepi' },
                { value: 'kolom', label: 'Menyatu kolom' },
              ]}
              onChange={(ujung) => setInput({ ujung })}
            />
            <Field label="M− tumpuan (koefisien)">
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
      <Card n={++card} title="Analisis struktur">
        <SelectField
          label="Metode"
          value={input.metode}
          options={[
            { value: 'auto', label: 'Otomatis (koefisien bila syarat 6.5.1 terpenuhi)' },
            { value: 'koef', label: 'Metode koefisien (Ps. 6.5)' },
            { value: 'solver', label: 'Analisis elastis sebenarnya (solver)' },
          ]}
          onChange={(metode) => setInput({ metode })}
        />
        {solverRelevant && n >= 2 && (
          <Field label="Ujung eksterior (solver)">
            <Segmented
              ariaLabel="Kekangan ujung solver"
              value={input.ujungS}
              options={[
                { value: 'sendi', label: 'Sendi' },
                { value: 'jepit', label: 'Jepit' },
              ]}
              onChange={(ujungS) => setInput({ ujungS })}
            />
          </Field>
        )}
        <SelectField
          label="Pengaruh retak (kekakuan)"
          value={input.retak}
          options={[
            { value: 'ig', label: 'Penampang utuh (Ig)' },
            { value: 'rata', label: 'Ie rata-rata per bentang (24.2.3.7)' },
            { value: 'variabel', label: 'Ie bervariasi sepanjang bentang' },
          ]}
          onChange={(retak) => setInput({ retak })}
        />
      </Card>
      <Card n={++card} title="Desain tulangan">
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
      {input.design === 'ya' && (
        <Card n={++card} title="Lendutan layan">
          <Field label="Cek lendutan">
            <Segmented
              ariaLabel="Cek lendutan"
              value={input.defl}
              options={[
                { value: 'ya', label: 'Ya' },
                { value: 'tidak', label: 'Tidak' },
              ]}
              onChange={(defl) => setInput({ defl })}
            />
          </Field>
          {input.defl === 'ya' && (
            <>
              <SelectField label="Durasi beban tetap (ξ)" value={input.xi} options={CB_XI.map((o) => ({ value: o.value, label: o.label }))} onChange={(xi) => setInput({ xi })} />
              <NumField label="Beban hidup tetap" unit="%" value={input.sustL} error={errors.sustL} hint="Porsi beban hidup yang bekerja lama." onChange={(sustL) => setInput({ sustL })} />
              <SelectField label="Batas sesudah pemasangan non-struktural" value={input.lim} options={CB_LIMITS.map((o) => ({ value: o.value, label: o.label }))} onChange={(lim) => setInput({ lim })} />
            </>
          )}
        </Card>
      )}
    </>
  )
}

/** Elevasi: tumpuan, bentang, momen desain di muka tumpuan (atas) & lapangan (bawah). */
function Elevation({ r, w, h }: { r: CMResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const total = r.spanLen!.reduce((a, b) => a + b, 0)
  const f: DiagramFrame = { w, h, padL: 30, padR: 30, padT: 0, padB: 0, x0: 0, x1: total }
  const y = Math.round(h * 0.45)
  let acc = 0
  const xs = [0, ...r.spanLen!.map((L) => (acc += L))]
  const sec =
    r.elem === 'pelat'
      ? `Pelat h ${fx(r.h, 0)}`
      : r.kind === 'persegi'
        ? `Balok ${fx(r.b, 0)}×${fx(r.h, 0)}`
        : `Balok ${r.kind} bw ${fx(r.b, 0)} · h ${fx(r.h, 0)} · bf ${fx(r.bfSpan![0], 0)}/hf ${fx(r.hf, 0)}`
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Elevasi balok menerus">
      <text x={8} y={16} className="bp-label">
        {sec} · {r.n} bentang · wu {fx(r.wu, 2)} kN/m
      </text>
      <line className="bp-beam" x1={sx(f, 0)} y1={y} x2={sx(f, total)} y2={y} />
      {xs.map((x, k) => (
        <g key={k}>
          <path d={`M${sx(f, x)},${y + 3} l-8,12 h16 Z`} className="bp-support-tri" fill="color-mix(in srgb, var(--dg-support) 30%, transparent)" stroke="var(--dg-support)" />
          <text x={sx(f, x)} y={y - 12} textAnchor="middle" style={{ fill: 'var(--dg-m)', fontWeight: 600 }}>
            {r.supM![k] > 1e-6 ? fx(-r.supM![k], 1) : '0'}
          </text>
        </g>
      ))}
      {r.spanLen!.map((L, k) => (
        <g key={k}>
          <text x={sx(f, xs[k] + L / 2)} y={y + 32} textAnchor="middle" style={{ fill: 'var(--dg-y)', fontWeight: 600 }}>
            {fx(r.spanM![k], 1)}
          </text>
          <text x={sx(f, xs[k] + L / 2)} y={y + 48} textAnchor="middle" className="dg-note">
            {fx(L, 2)} m
          </text>
        </g>
      ))}
      <text x={8} y={h - 6} className="dg-note">
        Mu (kN·m) di muka tumpuan (atas) & lapangan (bawah) · {r.metode === 'koef' ? (r.n === 1 ? 'statika' : 'metode koefisien') : `solver, ${r.nPola} pola beban`}
      </text>
    </svg>
  )
}

type DTab = 'momen' | 'geser'

function Diagram({ r, tab, w, h }: { r: CMResult; tab: DTab; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const d = r.diagram!
  const hi = tab === 'momen' ? d.mHi : d.vHi
  const lo = tab === 'momen' ? d.mLo : d.vLo
  const total = r.spanLen!.reduce((a, b) => a + b, 0)
  const f: DiagramFrame = { w, h, padL: 36, padR: 36, padT: 46, padB: 40, x0: 0, x1: total }
  const maxAbs = Math.max(1e-12, ...hi.map(Math.abs), ...lo.map(Math.abs))
  const zeroY = f.padT + (f.h - f.padT - f.padB) / 2
  const k = (f.h - f.padT - f.padB) / 2 / maxAbs
  const sgn = tab === 'momen' ? 1 : -1 // momen: sagging (+) ke bawah
  const Y = (v: number) => zeroY + sgn * v * k
  const line = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${sx(f, d.x[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('')
  const color = tab === 'momen' ? 'var(--dg-m)' : 'var(--dg-v)'
  const same = hi.every((v, i) => Math.abs(v - lo[i]) < 1e-9)
  const area = same
    ? `${line(hi)}L${sx(f, d.x[d.x.length - 1])},${zeroY}L${sx(f, d.x[0])},${zeroY}Z`
    : `${line(hi)}${lo.map((_v, i) => `L${sx(f, d.x[lo.length - 1 - i]).toFixed(1)},${Y(lo[lo.length - 1 - i]).toFixed(1)}`).join('')}Z`
  const unit = tab === 'momen' ? 'kN·m' : 'kN'
  const eh = extremeOf(d.x, hi), el = extremeOf(d.x, lo)
  let acc = 0
  const supX = [0, ...r.spanLen!.map((L) => (acc += L))]
  const lab = (e: { x: number; v: number }) => (
    <g className="dg-ext">
      <circle cx={sx(f, e.x)} cy={Y(e.v)} r={3} fill={color} />
      <text x={sx(f, e.x)} y={Y(e.v) + (sgn * e.v > 0 ? 16 : -8)} textAnchor="middle">
        {e.v.toFixed(1)} {unit}
      </text>
    </g>
  )
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={`Diagram ${tab}`}>
      <line className="dg-zero" x1={sx(f, 0)} y1={zeroY} x2={sx(f, total)} y2={zeroY} />
      {supX.map((x, i) => (
        <line key={i} x1={sx(f, x)} y1={f.padT - 4} x2={sx(f, x)} y2={f.h - f.padB} stroke="var(--dg-support)" strokeOpacity={0.35} strokeDasharray="3 3" />
      ))}
      <path d={area} fill={color} fillOpacity={0.16} />
      <path d={line(hi)} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {!same && <path d={line(lo)} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />}
      {lab(eh)}
      {!same && Math.abs(el.v - eh.v) > 1e-6 && lab(el)}
      <XAxis f={f} y={h - f.padB + 6} unit="m" />
      <text x={f.padL} y={16} className="dg-note">
        {r.metode === 'solver'
          ? `Amplop ${r.nPola} pola beban (terfaktor), di sumbu tumpuan — desain di muka tumpuan`
          : tab === 'momen'
            ? 'Amplop koefisien (indikatif): M− di tumpuan, M+ di tengah bentang'
            : 'Geser koefisien (indikatif) di muka tumpuan'}
      </text>
    </svg>
  )
}

const maxBy = (items: CMItem[], kind: 'pos' | 'neg') => items.filter((i) => i.kind === kind).sort((a, b) => b.Mu - a.Mu)[0]

function Results({ r, stale, reject }: { r: CMResult | null; stale: boolean; reject: string | null }) {
  const [tab, setTab] = useState<DTab>('momen')
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const items = r?.des?.valid ? r.des.items ?? [] : []
  const pelat = r?.elem === 'pelat'
  const tile = (it: CMItem | undefined) =>
    it ? [{ label: it.label, value: it.txt, sub: `As ${fx(it.AsProv, 0)} ≥ ${fx(it.AsReq, 0)}${pelat ? ' mm²/m' : ' mm²'}` }] : []
  const df = r?.defl
  const gs = df?.valid ? df.spans![df.gov!] : null
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
                { label: 'Metode', value: r.metode === 'koef' ? (r.n === 1 ? 'Statika' : 'Koefisien') : 'Elastis', sub: r.alasan },
                { label: 'M+ / M− maks', value: `${fx(r.MposMax, 1)} / ${fx(r.MnegMax, 1)}`, unit: 'kN·m', sub: `wu ${fx(r.wu, 2)} kN/m` },
                { label: 'Vu maks', value: fx(r.VuMax, 1), unit: 'kN', sub: r.stir ? `sengkang Ø${r.stir.ds}-${r.stir.sGov}` : undefined },
                ...tile(maxBy(items, 'pos')),
                ...tile(maxBy(items, 'neg')),
                ...(gs
                  ? [
                      {
                        label: `Lendutan bentang ${gs.span}`,
                        value: `${fx(gs.dAfter, 1)} / ${fx(gs.limAfter, 1)}`,
                        unit: 'mm',
                        sub: `${df!.ok ? 'OK' : 'TIDAK OK'} · δL ${fx(gs.dL, 1)} ≤ ${fx(gs.limL, 1)} mm`,
                        tone: (df!.ok ? 'ok' : 'bad') as 'ok' | 'bad',
                      },
                    ]
                  : []),
              ]}
            />
            {df && !df.valid && df.err && <p className="msg bad">{df.err}</p>}
            {r.syarat && r.n >= 2 && (
              <ul className="results-warn">
                {r.syarat.map((s) => (
                  <li key={s.label}>
                    {s.ok ? '✓' : '✗'} {s.label}: {s.nilai}
                  </li>
                ))}
              </ul>
            )}
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
