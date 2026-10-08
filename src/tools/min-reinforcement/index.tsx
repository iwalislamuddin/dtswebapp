import { useMemo } from 'react'
import type { MinRebarResult } from '../../calc/min-reinforcement'
import { layoutRect } from '../../calc/min-reinforcement'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars, type CapacityBar } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computeMin, ELEMENTS, fieldsOf, MIN_DEFAULTS, MIN_REBAR_BARS, MIN_REBAR_STIRRUPS, rejectReason, validate, type MinInput } from './model'
import { minReport } from './report'

const ID = 'min-reinforcement'

interface Outcome {
  i: MinInput
  r: MinRebarResult
}

export default function MinReinforcement({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<MinInput>(ID, MIN_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: MinInput): Outcome | null => {
    const r = computeMin(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const reject = useMemo(() => rejectReason(input), [input])
  const report = useMemo(() => (result ? minReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input elemen untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><ElementPreview r={result.r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={result?.r ?? null} stale={stale} reject={reject} />}
    />
  )
}

const BAR_OPTS = MIN_REBAR_BARS.map((d) => ({ value: String(d), label: `D${d}` }))
const STIR_OPTS = MIN_REBAR_STIRRUPS.map((d) => ({ value: String(d), label: `Ø${d}` }))

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: MinInput
  setInput: (p: Partial<MinInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = fieldsOf(input)
  const col = input.elem === 'kolom-p' || input.elem === 'kolom-l'
  return (
    <>
      <Card n={1} title="Elemen & material" actions={<ResetButton onReset={onReset} />}>
        <SelectField label="Jenis elemen" value={input.elem} options={ELEMENTS} onChange={(elem) => setInput({ elem })} />
        <NumField label="f'c — mutu beton" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy — mutu tul. utama" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
        {f.fyt && <NumField label={`fyt — mutu ${f.dsp ? 'spiral' : 'sengkang'}`} unit="MPa" value={input.fyt} error={errors.fyt} onChange={(fyt) => setInput({ fyt })} />}
      </Card>
      <Card n={2} title="Dimensi">
        {f.b && <NumField label={input.elem === 'balok' ? 'bw — lebar badan' : 'b — lebar'} unit="mm" value={input.b} error={errors.b} onChange={(b) => setInput({ b })} />}
        {f.h && <NumField label={input.elem === 'pelat' || input.elem === 'pilecap' ? 'h — tebal' : 'h — tinggi'} unit="mm" value={input.h} error={errors.h} onChange={(h) => setInput({ h })} />}
        {f.D && <NumField label="D — diameter kolom" unit="mm" value={input.D} error={errors.D} onChange={(D) => setInput({ D })} />}
        {f.BL && (
          <>
            <NumField label="B — lebar pile cap" unit="mm" value={input.B} error={errors.B} onChange={(B) => setInput({ B })} />
            <NumField label="L — panjang pile cap" unit="mm" value={input.L} error={errors.L} onChange={(L) => setInput({ L })} />
          </>
        )}
        {f.arah && (
          <Field label="Sistem pelat">
            <Segmented
              ariaLabel="Sistem pelat"
              value={input.arah}
              options={[
                { value: 'satu', label: 'Satu arah' },
                { value: 'dua', label: 'Dua arah' },
              ]}
              onChange={(arah) => setInput({ arah })}
            />
          </Field>
        )}
      </Card>
      <Card n={3} title="Tulangan">
        {f.cc && <NumField label="Selimut bersih" unit="mm" value={input.cc} error={errors.cc} onChange={(cc) => setInput({ cc })} />}
        <SelectField label="Tulangan utama" value={input.db} options={BAR_OPTS} onChange={(db) => setInput({ db })} />
        {f.tieType && (
          <Field label="Tulangan transversal">
            <Segmented
              ariaLabel="Tulangan transversal"
              value={input.tieType}
              options={[
                { value: 'ikat', label: 'Sengkang ikat' },
                { value: 'spiral', label: 'Spiral' },
              ]}
              onChange={(tieType) => setInput({ tieType })}
            />
          </Field>
        )}
        {f.ds && <SelectField label={col ? 'Ø sengkang ikat' : 'Ø sengkang'} value={input.ds} options={STIR_OPTS} onChange={(ds) => setInput({ ds })} />}
        {f.dsp && <SelectField label="Ø batang spiral" value={input.dsp} options={STIR_OPTS} onChange={(dsp) => setInput({ dsp })} />}
      </Card>
    </>
  )
}

function Bar({ x, y, rr }: { x: number; y: number; rr: number }) {
  return <circle cx={x} cy={y} r={rr} fill="var(--dg-ink)" />
}

/** Gambar penampang/denah elemen dengan tulangan minimum hasil hitung. */
function ElementPreview({ r, w, h: hh }: { r: MinRebarResult; w: number; h: number }) {
  if (w < 140 || hh < 110) return null
  const label = (s: string) => (
    <text x={8} y={16} className="bp-label">
      {s}
    </text>
  )
  if (r.elem === 'balok' || r.elem === 'kolom-p') {
    const b = r.elem === 'balok' ? r.bw! : r.b!, h = r.h!
    const sc = Math.min((w - 80) / b, (hh - 50) / h)
    const W = b * sc, H = h * sc, x0 = (w - W) / 2, y0 = 26 + (hh - 50 - H) / 2
    const off = (r.cc! + r.ds! / 2) * sc
    const c = (r.cc! + r.ds! + r.db! / 2) * sc
    const rr = Math.max(2.5, (r.db! * sc) / 2)
    let pts: [number, number][] = []
    if (r.elem === 'balok') {
      const n = r.n!
      pts = Array.from({ length: n }, (_, k) => [x0 + c + (n > 1 ? ((W - 2 * c) * k) / (n - 1) : (W - 2 * c) / 2), y0 + H - c])
      pts.push([x0 + c, y0 + c], [x0 + W - c, y0 + c]) // tulangan pembentuk sengkang (atas)
    } else {
      const { nx, ny } = r.layout ?? layoutRect(r.n!, b, h)
      for (let k = 0; k < nx; k++) {
        const x = x0 + c + ((W - 2 * c) * k) / (nx - 1)
        pts.push([x, y0 + c], [x, y0 + H - c])
      }
      for (let k = 1; k < ny - 1; k++) {
        const y = y0 + c + ((H - 2 * c) * k) / (ny - 1)
        pts.push([x0 + c, y], [x0 + W - c, y])
      }
    }
    return (
      <svg width={w} height={hh} className="bp" role="img" aria-label="Penampang dan tulangan minimum">
        {label(r.elem === 'balok' ? `${r.n}D${r.db} · sengkang Ø${r.ds}-${r.sPakai}` : `${r.n}D${r.db} · sengkang Ø${r.ds}-${r.sTiePakai}`)}
        <g className="bp-plate">
          <rect x={x0} y={y0} width={W} height={H} />
        </g>
        <rect x={x0 + off} y={y0 + off} width={W - 2 * off} height={H - 2 * off} fill="none" stroke="var(--dg-axis)" rx={3} />
        {pts.map(([x, y], k) => (
          <Bar key={k} x={x} y={y} rr={r.elem === 'balok' && k >= r.n! ? rr * 0.7 : rr} />
        ))}
        <g className="bp-dim">
          <text x={x0 + W / 2} y={y0 + H + 18} textAnchor="middle">
            {fx(b, 0)} × {fx(h, 0)} mm
          </text>
        </g>
      </svg>
    )
  }
  if (r.elem === 'kolom-l') {
    const D = r.D!, sc = Math.min(w - 60, hh - 50) / D
    const cx = w / 2, cy = 26 + (hh - 50) / 2, R = (D / 2) * sc
    const ring = r.ringR! * sc
    const rr = Math.max(2.5, (r.db! * sc) / 2)
    const tieR = (D / 2 - r.cc! - (r.spiral ? r.dsp! : r.ds!) / 2) * sc
    return (
      <svg width={w} height={hh} className="bp" role="img" aria-label="Kolom lingkaran dan tulangan minimum">
        {label(`${r.n}D${r.db} · ${r.spiral ? `spiral Ø${r.dsp} pitch ${r.sPitchPakai}` : `sengkang Ø${r.ds}-${r.sTiePakai}`}`)}
        <g className="bp-plate">
          <circle cx={cx} cy={cy} r={R} />
        </g>
        <circle cx={cx} cy={cy} r={tieR} fill="none" stroke="var(--dg-axis)" strokeDasharray={r.spiral ? '6 3' : undefined} />
        {Array.from({ length: r.n! }, (_, k) => (
          <Bar key={k} x={cx + ring * Math.cos((2 * Math.PI * k) / r.n! - Math.PI / 2)} y={cy + ring * Math.sin((2 * Math.PI * k) / r.n! - Math.PI / 2)} rr={rr} />
        ))}
        <text x={cx} y={cy + R + 18} textAnchor="middle" className="dg-note">
          D {fx(D, 0)} mm
        </text>
      </svg>
    )
  }
  if (r.elem === 'pelat') {
    // potongan pelat selebar 1 m
    const h = r.h!, sc = Math.min((w - 40) / 1000, (hh - 70) / Math.max(h, 100))
    const W = 1000 * sc, H = h * sc, x0 = (w - W) / 2, y0 = 30 + (hh - 70 - H) / 2
    const s = r.sPakai!, nB = Math.floor(1000 / s) + 1
    const rr = Math.max(2.5, (r.db! * sc) / 2)
    return (
      <svg width={w} height={hh} className="bp" role="img" aria-label="Potongan pelat 1 m dan tulangan minimum">
        {label(`D${r.db}-${s} (${fx(r.AsProv, 0)} mm²/m)`)}
        <g className="bp-plate">
          <rect x={x0} y={y0} width={W} height={H} />
        </g>
        {Array.from({ length: nB }, (_, k) => (
          <Bar key={k} x={x0 + k * s * sc} y={y0 + H - Math.min(H / 2, 25 * sc + rr)} rr={rr} />
        ))}
        <g className="bp-dim">
          <line x1={x0} y1={y0 + H + 14} x2={x0 + s * sc} y2={y0 + H + 14} />
          <text x={x0 + (s * sc) / 2} y={y0 + H + 28} textAnchor="middle">
            s {s}
          </text>
          <text x={x0 + W} y={y0 + H + 28} textAnchor="end">
            lebar 1000 mm · h {fx(h, 0)}
          </text>
        </g>
      </svg>
    )
  }
  // pile cap: denah grid tulangan
  const B = r.B!, L = r.L!, sc = Math.min((w - 70) / B, (hh - 60) / L)
  const W = B * sc, H = L * sc, x0 = (w - W) / 2, y0 = 28 + (hh - 60 - H) / 2, cc = r.cc! * sc
  const nB = r.nDirB!, nL = r.nDirL!
  return (
    <svg width={w} height={hh} className="bp" role="img" aria-label="Denah pile cap dan tulangan minimum">
      {label(`D${r.db}-${r.sPakai} dua arah · ${nB} + ${nL} batang`)}
      <g className="bp-plate">
        <rect x={x0} y={y0} width={W} height={H} />
      </g>
      {Array.from({ length: nB }, (_, k) => {
        const y = y0 + cc + ((H - 2 * cc) * k) / Math.max(1, nB - 1)
        return <line key={`b${k}`} x1={x0 + cc} y1={y} x2={x0 + W - cc} y2={y} stroke="var(--dg-m)" />
      })}
      {Array.from({ length: nL }, (_, k) => {
        const x = x0 + cc + ((W - 2 * cc) * k) / Math.max(1, nL - 1)
        return <line key={`l${k}`} x1={x} y1={y0 + cc} x2={x} y2={y0 + H - cc} stroke="var(--dg-y)" />
      })}
      <text x={x0 + W / 2} y={y0 + H + 18} textAnchor="middle" className="dg-note">
        B {fx(B, 0)} × L {fx(L, 0)} · h {fx(r.h, 0)} mm
      </text>
    </svg>
  )
}

function bars(r: MinRebarResult): { bars: CapacityBar[]; note: string } {
  if (r.elem === 'balok')
    return {
      note: 'mm² · batang = terpasang, garis = minimum',
      bars: [
        { label: `As lentur (${r.n}D${r.db})`, cap: r.AsProv!, dem: r.AsMin!, color: 'var(--dg-v)' },
        { label: 'Av per 1 m (sengkang)', cap: (r.Av! / r.sPakai!) * 1000, dem: r.avPerS! * 1000, color: 'var(--dg-m)' },
      ],
    }
  if (r.elem === 'kolom-p' || r.elem === 'kolom-l')
    return {
      note: 'mm² · batang = terpasang, garis = Ast,min (1%)',
      bars: [
        { label: `Ast (${r.n}D${r.db})`, cap: r.AsProv!, dem: r.AstMin!, color: 'var(--dg-v)' },
        { label: 'Ast,maks (8%)', cap: r.AstMax!, dem: r.AsProv!, color: 'var(--dg-axis)', aux: true },
      ],
    }
  return {
    note: 'mm²/m · batang = terpasang, garis = minimum',
    bars: [{ label: `As (D${r.db}-${r.sPakai})`, cap: r.AsProv!, dem: r.AsMin!, color: 'var(--dg-v)' }],
  }
}

function Results({ r, stale, reject }: { r: MinRebarResult | null; stale: boolean; reject: string | null }) {
  const status = reject ?? (stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null)
  const tiles = !r
    ? []
    : r.elem === 'balok'
      ? [
          { label: 'Tulangan lentur min.', value: `${r.n}D${r.db}`, sub: `As ${fx(r.AsProv, 0)} ≥ ${fx(r.AsMin, 0)} mm²` },
          { label: 'Sengkang min.', value: `Ø${r.ds}-${r.sPakai}`, sub: `Av/s ≥ ${fx(r.avPerS, 3)} mm²/mm` },
          { label: 'ρmin', value: fx(r.rhoMin, 5), sub: r.govSqrt ? "0,25√f'c/fy menentukan" : '1,4/fy menentukan' },
        ]
      : r.elem === 'kolom-p' || r.elem === 'kolom-l'
        ? [
            { label: 'Tulangan longitudinal', value: `${r.n}D${r.db}`, sub: `ρg ${fx(r.rhoProv! * 100, 2)}% (1–8%)` },
            r.spiral
              ? { label: 'Spiral', value: `Ø${r.dsp}-${r.sPitchPakai}`, sub: `ρs ≥ ${fx(r.rhoS, 4)}` }
              : { label: 'Sengkang ikat', value: `Ø${r.ds}-${r.sTiePakai}`, sub: `min Ø${r.tieDia}`, tone: r.ds! >= r.tieDia! ? ('ok' as const) : ('bad' as const) },
            { label: 'Spasi bersih', value: fx(r.sClear, 0), unit: 'mm', sub: `≥ ${fx(r.sClearMin, 0)} mm`, tone: r.sClear! >= r.sClearMin! ? ('ok' as const) : ('bad' as const) },
          ]
        : [
            { label: r.elem === 'pilecap' ? 'Tulangan min. tiap arah' : 'Tulangan minimum', value: `D${r.db}-${r.sPakai}`, sub: `${fx(r.AsProv, 0)} ≥ ${fx(r.AsMin, 0)} mm²/m` },
            { label: 'ρmin (susut-suhu)', value: fx(r.rhoMin, 4), sub: `s maks ${fx(r.sMax, 0)} mm` },
          ]
  return (
    <Panel title="Tulangan terpasang vs minimum" className="results-panel">
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <CapacityBars w={w} h={h} ariaLabel="Tulangan terpasang dan minimum" {...bars(r)} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles items={tiles} />
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
