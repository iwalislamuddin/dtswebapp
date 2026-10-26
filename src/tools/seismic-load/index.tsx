import { MapPin, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { CT, findSystem, SITE_LABEL, spectrumSa, systemsFor, type CtType, type RiskCat, type SiteClass, type StructKind } from '../../calc/seismic-load'
import { Card, Field, NumField, Panel, ResetButton, RowTable, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import { XYChart } from '../_hydraulics/chart'
import { parseNum } from '../form'
import type { ToolUIProps } from '../registry'
import { spectrumPoints } from './figures'
import { loadGrid, loadPlaces, lookup, PLACE_KIND, searchPlaces, type Place } from './map'
import {
  computeSeismicUI,
  KIND_LABEL,
  RISK_LABEL,
  SEISMIC_DEFAULTS,
  systemKey,
  systemOf,
  usesTc,
  validate,
  type LevelRow,
  type SeismicOk,
  type SeismicUIInput,
} from './model'
import { hText, locText, seismicReport } from './report'
import './seismic.css'

const ID = 'seismic-load'

export default function SeismicLoad({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<SeismicUIInput>(ID, SEISMIC_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: r, stale } = useAutoCompute(input, computeSeismicUI)
  const loc = locText(input)
  const report = useMemo(() => (r ? seismicReport(r, loc) : null), [r, loc])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi parameter gempa dan data struktur untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        <Panel title="Spektrum respons desain">
          <Sized>{(w, h) => (r ? <div className={stale ? 'stale' : ''}><Spectrum r={r} w={w} h={h} /></div> : null)}</Sized>
        </Panel>
      }
      results={<Results r={r} stale={stale} />}
    />
  )
}

type SetInput = (p: Partial<SeismicUIInput>) => void

function Inputs({ input, setInput, errors, onReset }: { input: SeismicUIInput; setInput: SetInput; errors: Record<string, string>; onReset: () => void }) {
  const f = (key: keyof SeismicUIInput & string, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key] as string} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  const sid = systemOf(input)
  const systems = systemsFor(input.kind)
  const groups = [...new Set(systems.map((s) => s.group))]
  const sel = findSystem(sid)
  return (
    <>
      <Card n={1} title="Lokasi & peta gempa" actions={<ResetButton onReset={onReset} />}>
        <LocationPicker input={input} setInput={setInput} />
        {f('Ss', 'Sₛ — percepatan periode pendek', 'g', 'Parameter MCER batuan dasar periode 0,2 detik.')}
        {f('S1', 'S₁ — percepatan periode 1 detik', 'g', 'Parameter MCER batuan dasar periode 1 detik.')}
        {f('PGA', 'PGA — percepatan tanah puncak', 'g', 'MCEG batuan dasar (untuk PGA_M, likuifaksi & dinding penahan).')}
        {f('TL', 'T_L — periode transisi panjang', 's')}
      </Card>
      <Card n={2} title="Situs & kategori risiko">
        <SelectField
          label="Kelas situs"
          value={input.site}
          error={errors.site}
          hint="Dari v̄s, N̄ atau s̄u 30 m teratas (Tabel 5). Tanpa data tanah: pakai SD (kecuali SE/SF terindikasi)."
          options={(Object.keys(SITE_LABEL) as SiteClass[]).map((value) => ({ value, label: SITE_LABEL[value] }))}
          onChange={(site) => setInput({ site })}
        />
        <SelectField
          label="Kategori risiko"
          value={input.risk}
          options={(Object.keys(RISK_LABEL) as RiskCat[]).map((value) => ({ value, label: RISK_LABEL[value] }))}
          onChange={(risk) => setInput({ risk })}
        />
      </Card>
      <Card n={3} title="Sistem struktur">
        <SelectField
          label="Jenis struktur"
          value={input.kind}
          options={(Object.keys(KIND_LABEL) as StructKind[]).map((value) => ({ value, label: KIND_LABEL[value] }))}
          onChange={(kind) => setInput({ kind })}
        />
        <p className="muted card-note">{KIND_HINT[input.kind]}</p>
        <Field label="Sistem pemikul gaya seismik" error={errors.system}>
          <select className="ctl" value={sid} onChange={(e) => setInput({ [systemKey(input.kind)]: e.target.value })} aria-invalid={!!errors.system || undefined}>
            {!systems.some((s) => s.id === sid) && sid !== 'custom' && <option value={sid}>— pilih —</option>}
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {systems.filter((s) => s.group === g).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} (R {fx(s.R, s.R % 1 ? 2 : 0)})
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="custom">Kustom — isi R, Ω₀, Cd sendiri</option>
          </select>
        </Field>
        {sid === 'custom' ? (
          <>
            {f('R', 'R — koefisien modifikasi respons')}
            {f('Om', 'Ω₀ — faktor kuat lebih')}
            {f('Cd', 'Cd — faktor pembesaran defleksi')}
            <SelectField
              label="Tipe untuk periode pendekatan"
              value={input.ctType}
              options={(Object.keys(CT) as CtType[]).map((value) => ({ value, label: CT[value].label }))}
              onChange={(ctType) => setInput({ ctType })}
            />
          </>
        ) : (
          sel && (
            <p className="muted card-note">
              R = {fx(sel.R, 2)} · Ω₀ = {fx(sel.Om, 2)} · Cd = {fx(sel.Cd, 2)} · batas tinggi KDS B/C/D/E/F: {sel.h.map(hText).join(' / ')} (TB = tak dibatasi, TI = tidak diizinkan)
            </p>
          )
        )}
        <Field label="Faktor redundansi ρ" hint="KDS B–C: 1,0. KDS D–F: 1,3 kecuali syarat Ps. 7.3.4.2 terpenuhi.">
          <Segmented ariaLabel="Faktor redundansi" value={input.rho} options={[{ value: '1', label: '1,0' }, { value: '1.3', label: '1,3' }]} onChange={(rho) => setInput({ rho })} />
        </Field>
      </Card>
      <Card n={4} title="Periode fundamental">
        {input.kind !== 'nb-other' && (
          <Field label="Periode T">
            <Segmented
              ariaLabel="Periode"
              value={input.period}
              options={[
                { value: 'approx', label: 'Ta rumus' },
                { value: 'analysis', label: 'Tc analisis' },
              ]}
              onChange={(period) => setInput({ period })}
            />
          </Field>
        )}
        {usesTc(input) ? (
          f('Tc', input.kind === 'nb-other' ? 'T — periode fundamental' : 'Tc — periode hasil analisis', 's', input.kind === 'nb-other' ? 'Wajib dari analisis struktur (ASCE 7-16 Ps. 15.4.4). T < 0,06 s = struktur kaku.' : 'Dari analisis modal; dibatasi Cu·Ta, minimal Ta.')
        ) : (
          <p className="muted card-note">Ta = Ct·hnˣ dari tinggi total struktur hn (jumlah tinggi tingkat), Tabel 18.</p>
        )}
      </Card>
      <Card n={5} title={input.kind === 'building' ? 'Berat seismik per lantai' : 'Massa & elevasi'}>
        <p className="muted card-note">Urut dari lantai terbawah. Tinggi = jarak ke lantai/massa di bawahnya; berat = D + bagian beban hidup/lainnya sesuai Ps. 7.7.2.</p>
        <RowTable<LevelRow>
          columns={[
            { key: 'h', label: 'Tinggi tingkat', unit: 'm' },
            { key: 'w', label: 'Berat w', unit: 'kN' },
          ]}
          rows={input.levels}
          onChange={(levels) => setInput({ levels })}
          newRow={() => ({ ...(input.levels[input.levels.length - 1] ?? { h: '4', w: '1000' }) })}
          max={60}
          errors={errors}
          prefix="lv"
          addLabel="Tambah lantai"
          emptyText="Belum ada lantai/massa."
        />
        {errors.levels && <p className="msg bad">{errors.levels}</p>}
      </Card>
    </>
  )
}

const KIND_HINT: Record<StructKind, string> = {
  building: 'Gedung — sistem SNI 1726:2019 Tabel 12, Cs minimum 0,044·SDS·Ie ≥ 0,01.',
  'nb-similar': 'Nongedung dengan sistem mirip gedung (pipe rack, rak gudang, struktur pendukung peralatan) — ASCE 7-16 Tabel 15.4-1 atau sistem Tabel 12.',
  'nb-other': 'Tangki, bejana, silo, cerobong, menara, papan reklame — ASCE 7-16 Tabel 15.4-2, Cs minimum 0,044·SDS·Ie ≥ 0,03.',
}

/** Cari ibu kota provinsi/kabupaten/kecamatan atau isi koordinat, lalu ambil Ss, S1, PGA, TL dari peta. */
function LocationPicker({ input, setInput }: { input: SeismicUIInput; setInput: SetInput }) {
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad' | 'busy'; text: string } | null>(null)
  const hits = useMemo(() => (places ? searchPlaces(places, q) : []), [places, q])

  useEffect(() => {
    if (q.trim().length < 2 || places) return
    loadPlaces().then(setPlaces, () => setStatus({ tone: 'bad', text: 'Daftar lokasi gagal dimuat — periksa koneksi.' }))
  }, [q, places])

  const fetchAt = async (lon: number, lat: number, loc: string) => {
    setStatus({ tone: 'busy', text: 'Memuat peta gempa…' })
    try {
      const v = lookup(await loadGrid(), lon, lat)
      if (!v) {
        setStatus({ tone: 'bad', text: 'Koordinat di luar cakupan peta Indonesia (bujur 94–142°, lintang −12–8°).' })
        return
      }
      setInput({
        loc, lon: String(lon), lat: String(lat),
        Ss: String(v.Ss), S1: String(v.S1), PGA: String(v.PGA), ...(v.TL !== null ? { TL: String(v.TL) } : {}),
      })
      setStatus({
        tone: 'ok',
        text: `Dari peta: Ss ${fx(v.Ss, 3)} g · S1 ${fx(v.S1, 3)} g · PGA ${fx(v.PGA, 3)} g · ${v.TL !== null ? `TL ${v.TL} s` : 'TL tidak tersedia di titik ini — isi manual'}`,
      })
    } catch {
      setStatus({ tone: 'bad', text: 'Peta gempa gagal dimuat — periksa koneksi, atau isi parameter secara manual.' })
    }
  }

  const pick = (p: Place) => {
    setQ('')
    void fetchAt(p.lon, p.lat, `${p.name} — ${PLACE_KIND[p.kind].toLowerCase()}`)
  }
  const lon = parseNum(input.lon), lat = parseNum(input.lat)

  return (
    <div className="eq-loc">
      <div className="eq-search">
        <Search size={14} aria-hidden />
        <input
          className="ctl"
          placeholder="Cari kota / kabupaten / kecamatan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) pick(hits[0])
            if (e.key === 'Escape') setQ('')
          }}
          aria-label="Cari lokasi"
          spellCheck={false}
        />
      </div>
      {q.trim().length >= 2 && (
        <ul className="eq-hits" role="listbox" aria-label="Hasil pencarian lokasi">
          {!places && <li className="muted">Memuat daftar lokasi…</li>}
          {places && !hits.length && <li className="muted">Tidak ditemukan.</li>}
          {hits.map((p) => (
            <li key={`${p.name}${p.lon}${p.lat}`}>
              <button type="button" onClick={() => pick(p)}>
                <span>{p.name}</span>
                <span className="muted">{PLACE_KIND[p.kind]} · {fx(p.lat, 2)}, {fx(p.lon, 2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="eq-coord">
        <label>
          <span className="muted">Bujur</span>
          <input className="ctl num-in" inputMode="decimal" value={input.lon} onChange={(e) => setInput({ lon: e.target.value, loc: '' })} aria-label="Bujur (°)" spellCheck={false} />
        </label>
        <label>
          <span className="muted">Lintang</span>
          <input className="ctl num-in" inputMode="decimal" value={input.lat} onChange={(e) => setInput({ lat: e.target.value, loc: '' })} aria-label="Lintang (°)" spellCheck={false} />
        </label>
        <button
          type="button"
          className="btn small"
          disabled={lon === null || lat === null || status?.tone === 'busy'}
          onClick={() => lon !== null && lat !== null && void fetchAt(lon, lat, input.loc || `Koordinat ${lat}, ${lon}`)}
          title="Ambil Ss, S1, PGA, TL di koordinat ini"
        >
          <MapPin size={14} /> Ambil dari peta
        </button>
      </div>
      {input.loc && <p className="muted card-note">Lokasi: {input.loc}</p>}
      {status && <p className={`msg ${status.tone === 'bad' ? 'bad' : 'warn'} eq-status`}>{status.text}</p>}
      <p className="muted card-note">Lintang selatan negatif (mis. −6,18). Nilai peta = data Desain Spektra Indonesia (SNI 1726:2019), interpolasi grid 0,1°.</p>
    </div>
  )
}

function Spectrum({ r, w, h }: { r: SeismicOk; w: number; h: number }) {
  const p = useMemo(() => spectrumPoints(r), [r])
  return (
    <XYChart
      w={w}
      h={h}
      title="Spektrum respons desain"
      xLabel="T (s)"
      yLabel="Sa (g)"
      xDp={3}
      yDp={3}
      series={[
        { pts: p.sa, color: 'var(--dg-m)', label: 'Spektrum desain Sa' },
        { pts: p.mce, color: 'var(--dg-axis)', label: 'MCER = 1,5·Sa', dash: '5 3' },
      ]}
      marks={[{ x: r.T, y: spectrumSa(r.T, r.SDS, r.SD1, r.inp.TL), color: 'var(--dg-load)', label: `T ${fx(r.T, 3)} s` }]}
    />
  )
}

type Tab = 'F' | 'V'
const TABS: { id: Tab; label: string }[] = [
  { id: 'F', label: 'Gaya lantai & geser' },
  { id: 'V', label: 'Momen guling' },
]

/** Diagram terhadap elevasi: batang Fx per lantai + garis tangga Vx, atau momen guling Mx. */
function StoryChart({ r, tab, w, h }: { r: SeismicOk; tab: Tab; w: number; h: number }) {
  const [hi, setHi] = useState<number | null>(null)
  if (w < 240 || h < 120) return null
  const padL = 56, padR = 24, padT = 22, padB = 28
  const Y = (z: number) => h - padB - (z / r.hn) * (h - padT - padB)
  const vMax = tab === 'F' ? r.V : r.M0
  const X = (v: number) => padL + (v / (vMax || 1)) * (w - padL - padR)
  const unit = tab === 'F' ? 'kN' : 'kN·m'
  const step: string[] = []
  for (let i = r.levels.length - 1; i >= 0; i--) {
    const l = r.levels[i], below = i === 0 ? 0 : r.levels[i - 1].hx
    const v = tab === 'F' ? l.Vx : l.Mx
    step.push(`${X(v)},${Y(l.hx)}`, `${X(v)},${Y(below)}`)
  }
  const top = r.levels[r.levels.length - 1]
  const mPts = tab === 'V' ? [`${X(0)},${Y(top.hx)}`, ...r.levels.slice().reverse().map((l, k, a) => {
    const below = k === a.length - 1 ? 0 : a[k + 1].hx
    return `${X(l.Mx)},${Y(below)}`
  })] : []
  const sel = hi === null ? null : r.levels[hi]
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Distribusi gaya gempa per lantai" onMouseLeave={() => setHi(null)}>
      <line className="dg-zero" x1={padL} y1={padT} x2={padL} y2={h - padB} />
      <line className="dg-zero" x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} />
      {r.levels.map((l, k) => (
        <g key={l.i} onMouseEnter={() => setHi(k)}>
          <rect x={padL} y={Y(l.hx) - 8} width={w - padL - padR} height={16} fill="transparent" />
          <line x1={padL - 4} y1={Y(l.hx)} x2={w - padR} y2={Y(l.hx)} stroke="var(--dg-grid)" />
          <text x={padL - 8} y={Y(l.hx) + 4} textAnchor="end" className="dg-note">{fx(l.hx, 1)}</text>
          {tab === 'F' && <rect x={padL} y={Y(l.hx) - 4} width={Math.max(1, X(l.Fx) - padL)} height={8} fill="var(--dg-load)" opacity={0.85} />}
        </g>
      ))}
      {tab === 'F' ? (
        <polyline fill="none" stroke="var(--dg-v)" strokeWidth={2} points={[`${X(0)},${Y(top.hx)}`, ...step].join(' ')} />
      ) : (
        <polyline fill="none" stroke="var(--dg-m)" strokeWidth={2} points={mPts.join(' ')} />
      )}
      <text x={padL - 8} y={h - padB + 4} textAnchor="end" className="dg-note">0</text>
      <text x={w - padR} y={h - 6} textAnchor="end" className="dg-note">{unit}</text>
      <text x={8} y={14} className="dg-note">elevasi (m)</text>
      {tab === 'F' ? (
        <g>
          <rect x={padL + 70} y={6} width={12} height={8} fill="var(--dg-load)" />
          <text x={padL + 86} y={14} className="dg-note">Fx gaya lantai</text>
          <line x1={padL + 180} y1={10} x2={padL + 194} y2={10} stroke="var(--dg-v)" strokeWidth={2} />
          <text x={padL + 198} y={14} className="dg-note">Vx geser tingkat</text>
        </g>
      ) : (
        <text x={padL + 70} y={14} className="dg-note" style={{ fill: 'var(--dg-m)' }}>Momen guling Mx di dasar tingkat</text>
      )}
      {sel && (
        <text x={w - padR} y={padT + 10} textAnchor="end" className="val" pointerEvents="none">
          Lantai {sel.i} · h {fx(sel.hx, 1)} m · Fx {fx(sel.Fx, 1)} kN · Vx {fx(sel.Vx, 1)} kN · Mx {fx(sel.Mx, 0)} kN·m
        </text>
      )}
    </svg>
  )
}

function Results({ r, stale }: { r: SeismicOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('F')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>{(w, h) => (r ? <StoryChart r={r} tab={tab} w={w} h={h} /> : null)}</Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Geser dasar V', value: fx(r.V, 1), unit: 'kN', sub: `Cs ${fx(r.Cs, 4)} · W ${fx(r.W, 0)} kN` },
                { label: 'SDS / SD1', value: `${fx(r.SDS, 3)} / ${fx(r.SD1, 3)}`, unit: 'g', sub: `Fa ${fx(r.Fa, 3)} · Fv ${fx(r.Fv, 3)}` },
                { label: 'KDS', value: r.sdc, sub: `Ie ${fx(r.Ie, 2)} · R ${fx(r.sys.R, 2)}`, tone: r.hLimit === 0 ? 'bad' : undefined },
                { label: 'Periode T', value: fx(r.T, 3), unit: 's', sub: r.inp.kind === 'nb-other' ? (r.rigid ? 'kaku (< 0,06 s)' : 'dari analisis') : `Ta ${fx(r.Ta, 3)} · CuTa ${fx(r.CuTa, 3)}` },
              ]}
            />
            <p className="muted" style={{ marginTop: 8 }}>
              Kombinasi: ({fx(r.cD1, 3)})D + {fx(r.inp.rho, 1)}QE + L · ({fx(r.cD2, 3)})D + {fx(r.inp.rho, 1)}QE · kuat lebih Ω₀ = {fx(r.sys.Om, 2)} · δx = {fx(r.sys.Cd / r.Ie, 3)}·δxe ·
              Δa = {fx(r.driftCoef, 3)}·hsx{r.sys.mrf && 'DEF'.includes(r.sdc) ? '/ρ' : ''}. Kategori {KIND_LABEL[r.inp.kind].toLowerCase()}.
            </p>
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
