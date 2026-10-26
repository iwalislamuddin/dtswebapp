import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { cuFromN, gammaFromN } from '../../calc/pile-capacity'
import { fx } from '../../report/model'
import { CapacityBars } from '../../ui/bars'
import { Card, Field, NumField, NumInput, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { parseNum } from '../form'
import { computePileUI, MAX_ROWS, newRow, PILE_DEFAULTS, validate, type PileOk, type PileUIInput, type SptRowUI } from './model'
import { pileReport } from './report'

const ID = 'pile-capacity'
/** Versi input tersimpan: 2 = tabel SPT (format lama per-lapis tidak dipulihkan). */
const INPUT_VERSION = 2

export default function PileCapacity({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<PileUIInput>(ID, PILE_DEFAULTS, INPUT_VERSION)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computePileUI)
  const report = useMemo(() => (r ? pileReport(r) : null), [r])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data tiang dan minimal satu baris data SPT untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Preview">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''} style={{ display: 'flex' }}><Preview r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={r} stale={stale} />}
    />
  )
}

type NumKey = 'D' | 'zc' | 'L' | 'Dw' | 'FS' | 'FSt' | 'zn' | 'P' | 'T' | 'Pu' | 'Tu' | 'fc' | 'fy' | 'db' | 'ds' | 'cover' | 'rhoMin'

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: PileUIInput
  setInput: (p: Partial<PileUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: NumKey, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  const concrete = input.material === 'concrete'
  return (
    <>
      <Card n={1} title="Tiang" actions={<ResetButton onReset={onReset} />}>
        <SelectField
          label="Penampang"
          value={input.shape}
          options={[{ value: 'circular', label: 'Bulat' }, { value: 'square', label: 'Persegi' }]}
          onChange={(shape) => setInput({ shape })}
        />
        {f('D', input.shape === 'square' ? 'D — sisi' : 'D — diameter', 'mm')}
        {f('zc', 'Pile cut-off', 'm', 'Kedalaman kepala tiang dari permukaan tanah. Selimut dihitung mulai kedalaman ini.')}
        {f('L', 'L — panjang tiang', 'm', 'Dari pile cut-off ke ujung tiang.')}
        <Field label="Jenis">
          <Segmented ariaLabel="Jenis tiang" value={input.ptype} options={[{ value: 'driven', label: 'Pancang' }, { value: 'bored', label: 'Bor' }]} onChange={(ptype) => setInput({ ptype })} />
        </Field>
        <Field label="Bahan">
          <Segmented ariaLabel="Bahan tiang" value={input.material} options={[{ value: 'concrete', label: 'Beton' }, { value: 'steel', label: 'Baja' }]} onChange={(material) => setInput({ material })} />
        </Field>
      </Card>
      <Card n={2} title="Muka air & faktor keamanan">
        {f('Dw', 'Dw — kedalaman muka air', 'm', 'Besar (mis. 99) = tanpa air.')}
        {f('FS', 'FS tekan', undefined, 'Kosong/0 = 2,5.')}
        {f('FSt', 'FS tarik', undefined, 'Kosong/0 = 3.')}
        <Field label="Berat sendiri tiang">
          <Segmented ariaLabel="Berat sendiri" value={input.inclW} options={[{ value: 'no', label: 'Diabaikan' }, { value: 'yes', label: 'Dikurangkan' }]} onChange={(inclW) => setInput({ inclW })} />
        </Field>
      </Card>
      <Card n={3} title="Data tanah (SPT)">
        <Field label="Metode" hint="Berlaku untuk semua lapis. Statik: lempung α·cu & 9cu, pasir β & Nq (φ dari N). SPT: Meyerhof dari N.">
          <Segmented ariaLabel="Metode" value={input.method} options={[{ value: 'static', label: 'Statik' }, { value: 'spt', label: 'SPT' }]} onChange={(method) => setInput({ method })} />
        </Field>
        <SptTable input={input} errors={errors} onChange={(rows) => setInput({ rows })} />
      </Card>
      <Card n={4} title="Gesekan negatif">
        <Field label="Perhitungkan">
          <Segmented ariaLabel="Gesekan negatif" value={input.nsf} options={[{ value: 'no', label: 'Tidak' }, { value: 'yes', label: 'Ya' }]} onChange={(nsf) => setInput({ nsf })} />
        </Field>
        {input.nsf === 'yes' && f('zn', 'zn — dasar zona', 'm', 'Kedalaman dasar lapisan yang turun (timbunan/lempung lunak terkonsolidasi), dari permukaan. Selimut dari cut-off sampai zn menjadi beban ke bawah Qn.')}
      </Card>
      <Card n={5} title={concrete ? 'Beban & penulangan' : 'Beban'}>
        {f('P', 'P — tekan layan', 'kN', 'Dibandingkan dengan Q izin.')}
        {f('T', 'T — tarik layan', 'kN', 'Dibandingkan dengan T izin.')}
        {concrete && (
          <>
            {f('Pu', 'Pu — tekan terfaktor', 'kN')}
            {f('Tu', 'Tu — tarik terfaktor', 'kN')}
            {f('fc', "f′c", 'MPa')}
            {f('fy', 'fy', 'MPa')}
            {f('db', 'Ø tulangan memanjang', 'mm')}
            {f('ds', 'Ø sengkang', 'mm')}
            {f('cover', 'Selimut beton', 'mm')}
            {f('rhoMin', 'ρ min', '%', 'SNI 2847:2019 ps. 18.13.5: 0,25% (KDS C), 0,5% (KDS D–F).')}
          </>
        )}
      </Card>
    </>
  )
}

/** Tabel data SPT: Z, N-SPT, jenis (L/P), γ dan cu (kosong = korelasi, ditampilkan sebagai placeholder). */
function SptTable({ input, errors, onChange }: { input: PileUIInput; errors: Record<string, string>; onChange: (rows: SptRowUI[]) => void }) {
  const rows = input.rows
  const set = (i: number, p: Partial<SptRowUI>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const spt = input.method === 'spt'
  const full = rows.length >= MAX_ROWS
  return (
    <div className="rt">
      {errors.rows && <p className="msg bad">{errors.rows}</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>
                Z<span className="rt-unit">m</span>
              </th>
              <th>
                N<span className="rt-unit">SPT</span>
              </th>
              <th>
                Jenis<span className="rt-unit">&nbsp;</span>
              </th>
              <th>
                γ<span className="rt-unit">kN/m³</span>
              </th>
              <th>
                cu<span className="rt-unit">kPa</span>
              </th>
              <th aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const e = (k: string) => errors[`rows.${i}.${k}`]
              const N = parseNum(r.N)
              const cuOff = spt || r.soil === 'P'
              return (
                <tr key={i}>
                  {(['z', 'N'] as const).map((k) => (
                    <td key={k} title={e(k)}>
                      <NumInput value={r[k]} onChange={(v) => set(i, { [k]: v })} invalid={!!e(k)} ariaLabel={`${k === 'z' ? 'Z' : 'N-SPT'} baris ${i + 1}`} />
                    </td>
                  ))}
                  <td style={{ width: 52 }}>
                    <select className="ctl" style={{ minWidth: 44 }} value={r.soil} onChange={(ev) => set(i, { soil: ev.target.value as SptRowUI['soil'] })} aria-label={`Jenis tanah baris ${i + 1}`}>
                      <option value="L">L</option>
                      <option value="P">P</option>
                    </select>
                  </td>
                  <td title={e('gamma')}>
                    <NumInput
                      value={r.gamma}
                      onChange={(v) => set(i, { gamma: v })}
                      invalid={!!e('gamma')}
                      ariaLabel={`Berat isi baris ${i + 1}`}
                      placeholder={N !== null ? fx(gammaFromN(r.soil, N), 1) : undefined}
                    />
                  </td>
                  <td title={e('cu')}>
                    <NumInput
                      value={cuOff ? '' : r.cu}
                      onChange={(v) => set(i, { cu: v })}
                      invalid={!!e('cu')}
                      ariaLabel={`cu baris ${i + 1}`}
                      disabled={cuOff}
                      placeholder={cuOff ? '–' : N !== null ? fx(cuFromN(N), 0) : undefined}
                    />
                  </td>
                  <td>
                    <button type="button" className="icon-btn" onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label={`Hapus baris ${i + 1}`} title="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.45 }}>
        Z = kedalaman atas lapis dari permukaan (baris pertama 0); lapis berlaku sampai Z baris berikutnya, baris terakhir menerus ke bawah.
        Jenis: <b>L</b> = Lempung, <b>P</b> = Pasir. γ dan cu kosong = korelasi N-SPT (angka miring): γ dari tabel Terzaghi–Peck/Bowles, cu = 6,25 N kPa.
        {spt ? ' cu tidak dipakai pada metode SPT.' : ' Pasir statik: φ = 27,1 + 0,3N − 0,00054N².'}
      </p>
      <button type="button" className="btn small" disabled={full} onClick={() => onChange([...rows, newRow(rows)])} title={full ? `Maksimum ${MAX_ROWS}` : undefined}>
        <Plus size={14} /> Tambah baris
      </button>
    </div>
  )
}

const soilFill = (soil: string) => (soil === 'clay' ? 'color-mix(in srgb, var(--dg-m) 26%, transparent)' : 'color-mix(in srgb, var(--dg-axis) 14%, transparent)')

/** Profil tanah, tiang (cut-off → ujung), MAT, zona gesekan negatif dan dimensi. */
function Preview({ r, w, h }: { r: PileOk; w: number; h: number }) {
  if (w < 220 || h < 160) return null
  const padT = 30, padB = 24, padL = 116, padR = 96
  const total = Math.max(r.zTip + 1, r.rows[r.rows.length - 1].z + 1)
  const sc = (h - padT - padB) / total
  const W = Math.max(40, Math.min(w - padL - padR, 220))
  const x0 = padL
  const cx = x0 + W / 2
  const pw = Math.max(8, Math.min(r.D * sc * 1.6, W * 0.25))
  const Y = (z: number) => padT + z * sc
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Profil tanah dan tiang">
      {r.layers.map((ly, k) => {
        const top = r.rows[k].z
        const bot = Math.min(top + ly.H, total)
        const hh = (bot - top) * sc
        return (
          <g key={k}>
            <rect x={x0} y={Y(top)} width={W} height={hh} fill={soilFill(ly.soil)} stroke="var(--dg-axis)" strokeWidth={0.5} />
            {hh >= 10 && (
              <text x={x0 - 6} y={Y(top) + hh / 2 + 4} textAnchor="end">
                {fx(top, 1)} m · {ly.soil === 'clay' ? 'L' : 'P'} · N {fx(Number(ly.N), 0)}
              </text>
            )}
          </g>
        )
      })}
      {r.nsf && (
        <g>
          <rect x={x0} y={Y(r.zc)} width={W} height={(r.zn - r.zc) * sc} fill="none" stroke="var(--dg-load)" strokeDasharray="3 3" />
          <text x={x0 + W - 4} y={Y(r.zn) - 4} textAnchor="end" style={{ fill: 'var(--dg-load)' }}>NSF</text>
        </g>
      )}
      {r.Dw < total && (
        <g>
          <line x1={x0} y1={Y(r.Dw)} x2={x0 + W} y2={Y(r.Dw)} stroke="var(--dg-load)" strokeDasharray="6 4" />
          <text x={x0 + 4} y={Y(r.Dw) - 3} style={{ fill: 'var(--dg-load)' }}>MAT {fx(r.Dw, 1)} m</text>
        </g>
      )}
      <g className="bp-plate">
        <rect x={cx - pw / 2} y={Y(r.zc)} width={pw} height={r.Leff * sc} />
      </g>
      <g className="bp-dim">
        {r.zc > 0 && (
          <>
            <line x1={x0 + W + 10} y1={Y(0)} x2={x0 + W + 10} y2={Y(r.zc)} />
            <text x={x0 + W + 14} y={Y(r.zc / 2) + 4}>cut-off {fx(r.zc, 1)} m</text>
          </>
        )}
        <line x1={x0 + W + 10} y1={Y(r.zc)} x2={x0 + W + 10} y2={Y(r.zTip)} />
        <text x={x0 + W + 14} y={Y((r.zc + r.zTip) / 2) + 4}>L {fx(r.Leff, 1)} m</text>
      </g>
      <text x={8} y={16} className="bp-label">
        Profil tanah & tiang · D {fx(r.Dmm, 0)} mm · ujung {fx(r.zTip, 1)} m
      </text>
    </svg>
  )
}

type Tab = 'kapasitas' | 'selimut' | 'tulangan'

/** fs tiap segmen selimut terhadap kedalaman; zona gesekan negatif berwarna beban. */
function ShaftChart({ r, w, h }: { r: PileOk; w: number; h: number }) {
  if (w < 200 || h < 100) return null
  const padL = 52, padR = 56, padT = 24, padB = 10
  const maxFs = Math.max(...r.segs.map((s) => s.fs), 1) * 1.05
  const sc = (h - padT - padB) / r.zTip
  const X = (v: number) => padL + (v / maxFs) * (w - padL - padR)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Gesekan selimut per lapis">
      <line className="dg-zero" x1={padL} y1={padT + r.zc * sc} x2={padL} y2={h - padB} />
      {r.segs.map((s) => {
        const c = s.neg ? 'var(--dg-load)' : 'var(--dg-v)'
        return (
          <g key={`${s.idx}-${s.top}`}>
            <rect x={padL} y={padT + s.top * sc + 1} width={Math.max(2, X(s.fs) - padL)} height={Math.max(2, s.dL * sc - 2)} fill={`color-mix(in srgb, ${c} 40%, transparent)`} stroke={c} />
            <text x={X(s.fs) + 6} y={padT + (s.top + s.dL / 2) * sc + 4} className="val">{fx(s.fs, 1)}{s.neg ? ' (−)' : ''}</text>
            {s.dL * sc >= 12 && (
              <text x={padL - 6} y={padT + s.top * sc + 10} textAnchor="end" className="dg-note">{fx(s.top, 1)} m</text>
            )}
          </g>
        )
      })}
      <text x={padL} y={14} className="dg-note">fs per lapis (kPa) — kedalaman ke bawah{r.nsf ? '; (−) = gesekan negatif' : ''}</text>
    </svg>
  )
}

/** Penampang tiang dan susunan tulangan. */
function Section({ r, w, h }: { r: PileOk; w: number; h: number }) {
  const b = r.rebar
  if (!b || w < 160 || h < 120) return null
  const size = Math.min(w - 40, h - 40)
  const s = size / r.Dmm
  const cx = w / 2, cy = h / 2 + 6
  const R = (r.Dmm / 2) * s
  const pts: [number, number][] = []
  if (r.shape === 'square') {
    const per = b.n / 4
    for (let k = 0; k < b.n; k++) {
      const side = Math.floor(k / per), t = (k % per) / per
      const a = b.rc * s
      const p: [number, number][] = [[-a + 2 * a * t, -a], [a, -a + 2 * a * t], [a - 2 * a * t, a], [-a, a - 2 * a * t]]
      pts.push([cx + p[side][0], cy + p[side][1]])
    }
  } else for (let k = 0; k < b.n; k++) pts.push([cx + b.rc * s * Math.cos((2 * Math.PI * k) / b.n), cy + b.rc * s * Math.sin((2 * Math.PI * k) / b.n)])
  const rs = b.rc * s
  /** Sumbu sengkang: setengah tulangan + setengah sengkang di luar pusat tulangan. */
  const hs = ((b.db + b.ds) / 2) * s
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Penampang tiang dan tulangan">
      {r.shape === 'square' ? (
        <rect x={cx - R} y={cy - R} width={2 * R} height={2 * R} fill="color-mix(in srgb, var(--dg-axis) 12%, transparent)" stroke="var(--dg-axis)" />
      ) : (
        <circle cx={cx} cy={cy} r={R} fill="color-mix(in srgb, var(--dg-axis) 12%, transparent)" stroke="var(--dg-axis)" />
      )}
      {r.shape === 'square' ? (
        <rect x={cx - rs - hs} y={cy - rs - hs} width={2 * (rs + hs)} height={2 * (rs + hs)} fill="none" stroke="var(--dg-v)" strokeDasharray="4 2" />
      ) : (
        <circle cx={cx} cy={cy} r={rs + hs} fill="none" stroke="var(--dg-v)" strokeDasharray="4 2" />
      )}
      {pts.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={Math.max(2.5, (b.db / 2) * s)} fill="var(--dg-m)" />
      ))}
      <text x={8} y={16} className="dg-note">
        {b.n} D{fx(b.db, 0)} · ρ {fx(b.rho * 100, 2)}% · sengkang s ≤ {fx(b.sMax, 0)} mm
      </text>
    </svg>
  )
}

function Results({ r, stale }: { r: PileOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('kapasitas')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  const tabs: { id: Tab; label: string }[] = [{ id: 'kapasitas', label: 'Kapasitas' }, { id: 'selimut', label: 'Selimut' }]
  if (r?.rebar) tabs.push({ id: 'tulangan', label: 'Tulangan' })
  const cur = tab === 'tulangan' && !r?.rebar ? 'kapasitas' : tab
  const b = r?.rebar
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={cur} tabs={tabs} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r ? null : cur === 'kapasitas' ? (
                <CapacityBars
                  w={w}
                  h={h}
                  ariaLabel="Kapasitas tiang"
                  note="Kapasitas (kN); garis = beban"
                  bars={[
                    { label: 'Selimut Qs', cap: r.Qs, dem: 0, color: 'var(--dg-v)' },
                    { label: 'Ujung Qp', cap: r.Qp, dem: 0, color: 'var(--dg-m)' },
                    ...(r.nsf ? [{ label: 'Gesekan negatif Qn', cap: r.Qn, dem: 0, color: 'var(--dg-load)', aux: true }] : []),
                    { label: 'Izin tekan', cap: r.Qallow, dem: r.P, color: 'var(--dg-v)', gov: true },
                    { label: 'Izin tarik', cap: r.Tallow, dem: r.T, color: 'var(--dg-y)', gov: true },
                    ...(b
                      ? [
                          { label: 'φPn tiang', cap: b.phiPn, dem: b.Pu, color: 'var(--dg-m)' },
                          { label: 'φTn tulangan', cap: b.phiTn, dem: b.Tu, color: 'var(--dg-m)' },
                        ]
                      : []),
                  ]}
                />
              ) : cur === 'selimut' ? (
                <ShaftChart r={r} w={w} h={h} />
              ) : (
                <Section r={r} w={w} h={h} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Qs / Qp', value: `${fx(r.Qs, 0)} / ${fx(r.Qp, 0)}`, unit: 'kN', sub: r.nsf ? `Qn ${fx(r.Qn, 0)} kN` : `Qu ${fx(r.Qu, 0)} kN` },
                { label: `Q izin tekan (FS ${fx(r.FS, 1)})`, value: fx(r.Qallow, 0), unit: 'kN', sub: `P = ${fx(r.P, 0)} kN`, tone: r.P <= r.Qallow ? 'ok' : 'bad' },
                { label: `T izin tarik (FS ${fx(r.FSt, 1)})`, value: fx(r.Tallow, 0), unit: 'kN', sub: `T = ${fx(r.T, 0)} kN`, tone: r.T <= r.Tallow ? 'ok' : 'bad' },
                ...(b
                  ? [{ label: 'Tulangan', value: `${b.n} D${fx(b.db, 0)}`, sub: `ρ ${fx(b.rho * 100, 2)}%`, tone: (b.okP && b.okT && b.okSpacing && !b.overMax ? 'ok' : 'bad') as 'ok' | 'bad' }]
                  : []),
              ]}
            />
            {r.warn.length > 0 && (
              <ul className="results-warn">
                {r.warn.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
