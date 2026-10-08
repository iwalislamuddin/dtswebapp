import { useMemo } from 'react'
import type { DevLengthResult } from '../../calc/development-length'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { barsOf, computeDev, DEV_DEFAULTS, ldPerDiameter, PSIE_OPTIONS, validate, type DevInput } from './model'
import { devReport } from './report'

const ID = 'development-length'

interface Outcome {
  i: DevInput
  r: DevLengthResult
}

export default function DevelopmentLength({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<DevInput>(ID, DEV_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const compute = useMemo(() => (i: DevInput): Outcome | null => {
    const r = computeDev(i)
    return r ? { i, r } : null
  }, [])
  const { result, stale } = useAutoCompute(input, compute)
  const report = useMemo(() => (result ? devReport(result.i, result.r) : null), [result])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi input material, tulangan, dan kekangan untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (result ? <div className={stale ? 'stale' : ''}><BarPreview r={result.r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results o={result} stale={stale} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: DevInput
  setInput: (p: Partial<DevInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const bars = barsOf(input.barType)
  return (
    <>
      <Card n={1} title="Material" actions={<ResetButton onReset={onReset} />}>
        <NumField label="f'c — mutu beton" unit="MPa" value={input.fc} error={errors.fc} onChange={(fc) => setInput({ fc })} />
        <NumField label="fy — mutu baja" unit="MPa" value={input.fy} error={errors.fy} onChange={(fy) => setInput({ fy })} />
      </Card>
      <Card n={2} title="Tulangan">
        <Field label="Jenis tulangan">
          <Segmented
            ariaLabel="Jenis tulangan"
            value={input.barType}
            options={[
              { value: 'ulir', label: 'Ulir (D)' },
              { value: 'polos', label: 'Polos (Ø)' },
            ]}
            // diameter tetap bila ada di daftar jenis baru, selain itu ambil yang terdekat
            onChange={(barType) => {
              const list = barsOf(barType)
              const cur = Number(input.db)
              const db = list.includes(cur) ? cur : list.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a))
              setInput({ barType, db: String(db) })
            }}
          />
        </Field>
        <SelectField
          label="Diameter batang"
          value={input.db}
          error={errors.db}
          options={bars.map((d) => ({ value: String(d), label: `${input.barType === 'polos' ? 'Ø' : 'D'}${d}` }))}
          onChange={(db) => setInput({ db })}
        />
      </Card>
      <Card n={3} title="Faktor modifikasi">
        <Field label="ψt — posisi pengecoran" hint="Atas = ada > 300 mm beton segar di bawah tulangan.">
          <Segmented
            ariaLabel="psi t"
            value={input.psit}
            options={[
              { value: '1', label: 'Bawah 1,0' },
              { value: '1.3', label: 'Atas 1,3' },
            ]}
            onChange={(psit) => setInput({ psit })}
          />
        </Field>
        <SelectField label="ψe — pelapis" value={input.psie} options={PSIE_OPTIONS} onChange={(psie) => setInput({ psie })} />
        <Field label="λ — jenis beton">
          <Segmented
            ariaLabel="lambda"
            value={input.lambda}
            options={[
              { value: '1', label: 'Normal 1,0' },
              { value: '0.75', label: 'Ringan 0,75' },
            ]}
            onChange={(lambda) => setInput({ lambda })}
          />
        </Field>
      </Card>
      <Card n={4} title="Kekangan">
        <NumField label="cb — min(selimut ke pusat, ½ spasi)" unit="mm" value={input.cb} error={errors.cb} onChange={(cb) => setInput({ cb })} />
        <Field label="Indeks tulangan transversal Ktr">
          <Segmented
            ariaLabel="Ktr"
            value={input.ktrMode}
            options={[
              { value: 'zero', label: 'Ktr = 0' },
              { value: 'calc', label: 'Hitung' },
            ]}
            onChange={(ktrMode) => setInput({ ktrMode })}
          />
        </Field>
        {input.ktrMode === 'calc' && (
          <>
            <NumField label="Atr — luas tul. transversal" unit="mm²" value={input.Atr} error={errors.Atr} hint="Dalam spasi s, memotong bidang belah." onChange={(Atr) => setInput({ Atr })} />
            <NumField label="s — spasi tul. transversal" unit="mm" value={input.s} error={errors.s} onChange={(s) => setInput({ s })} />
            <NumField label="n — batang di bidang belah" value={input.n} error={errors.n} onChange={(n) => setInput({ n })} />
          </>
        )}
      </Card>
    </>
  )
}

/** Batang tertanam di beton sepanjang ld; ulir bergerigi, polos mulus; selimut cb. */
function BarPreview({ r, w, h }: { r: DevLengthResult; w: number; h: number }) {
  if (w < 160 || h < 100) return null
  const x0 = 40, x1 = w - 30, yTop = h * 0.2, yBot = h * 0.72
  const yb = yBot - Math.min(36, (yBot - yTop) * 0.35)
  const t = Math.max(6, Math.min(14, r.db * 0.5))
  const ribs = r.polos ? [] : Array.from({ length: Math.floor((x1 - x0 + 20) / 9) }, (_, k) => x0 - 20 + k * 9)
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview panjang penyaluran">
      <g className="bp-plate">
        <rect x={x0} y={yTop} width={x1 - x0 + 20} height={yBot - yTop} />
      </g>
      <rect x={x0 - 26} y={yb - t / 2} width={x1 - x0 + 26} height={t} fill="color-mix(in srgb, var(--dg-m) 55%, transparent)" stroke="var(--dg-m)" />
      {ribs.map((x) => (
        <line key={x} x1={x} y1={yb - t / 2} x2={x + 4} y2={yb + t / 2} stroke="var(--dg-ink)" strokeWidth={0.6} />
      ))}
      <line x1={x0 + 50} y1={yb + t / 2} x2={x0 + 50} y2={yBot} stroke="var(--dg-y)" />
      <text x={x0 + 55} y={(yb + yBot) / 2 + 6} style={{ fill: 'var(--dg-y)' }}>
        cb {fx(r.cb, 0)}
      </text>
      <text x={x0 - 28} y={yb - t / 2 - 6} className="bp-label">
        {r.polos ? 'Ø' : 'D'}
        {fx(r.db, 0)}
      </text>
      <g className="bp-dim">
        <line x1={x0} y1={yBot + 22} x2={x1} y2={yBot + 22} />
        <line x1={x0} y1={yBot + 18} x2={x0} y2={yBot + 26} />
        <line x1={x1} y1={yBot + 18} x2={x1} y2={yBot + 26} />
        <text x={(x0 + x1) / 2} y={yBot + 17} textAnchor="middle">
          ld = {fx(r.ldRound, 0)} mm
        </text>
      </g>
      <text x={x0 + 4} y={yTop - 8} className="dg-note">
        penampang kritis · {r.polos ? 'polos: 2 × ld ulir (pendekatan)' : 'ulir'}
      </text>
    </svg>
  )
}

function Results({ o, stale }: { o: Outcome | null; stale: boolean }) {
  const r = o?.r
  const table = useMemo(() => (o ? ldPerDiameter(o.i) : []), [o])
  return (
    <Panel title="Panjang penyaluran per diameter" className="results-panel">
      <div className="results">
        {stale && <p className="msg bad">Input belum lengkap/valid — hasil di bawah dari input sah terakhir.</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              r ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="ld per diameter"
                  note="mm · faktor & kekangan sama, ψs mengikuti diameter"
                  bars={table.map((t) => ({ label: `${r.polos ? 'Ø' : 'D'}${t.db}`, cap: t.ld, dem: 0, color: 'var(--dg-m)', gov: t.db === r.db, aux: t.db !== r.db }))}
                />
              ) : null
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: `ld ${r.polos ? 'Ø' : 'D'}${fx(r.db, 0)}`, value: fx(r.ldRound, 0), unit: 'mm', sub: r.ldMin ? 'batas bawah 300 mm' : `ld/db = ${fx(r.ldbratio, 1)}` },
                { label: '(cb + Ktr)/db', value: fx(r.ratio, 2), sub: `Ktr = ${fx(r.Ktr, 1)} mm · ≤ 2,5` },
                { label: 'Faktor ψt·ψe · ψs · ψg', value: `${fx(r.psite, 2)}·${fx(r.psis, 1)}·${fx(r.psig, 2)}`, sub: `λ = ${fx(r.lambda, 2)} · √f'c = ${fx(r.sqrtfc, 2)}` },
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
