import { useMemo, useState, type MouseEvent } from 'react'
import { useAutoCompute, useToolInput, useToolReport } from '../../app/tool-state'
import { fx } from '../../report/model'
import { niceStep } from '../../report/figure'
import { KzAt } from '../../calc/wind-load'
import { Card, Field, NumField, Panel, ResetButton, Segmented, SelectField, Sized, StatTiles, SubTabs, ToolLayout } from '../../ui/kit'
import { DetailTab } from '../../ui/ReportView'
import type { ToolUIProps } from '../registry'
import { computeWindAny, qzAt, TYPE_LABEL, validate, WIND_DEFAULTS, windProfile, type StructType, type WindOk, type WindUIInput } from './model'
import { windReportAny } from './report'
import { TypePreview, TypeResults } from './types-ui'

const ID = 'wind-load'

export default function WindLoad({ tab }: ToolUIProps) {
  const [input, setInput, reset] = useToolInput<WindUIInput>(ID, WIND_DEFAULTS)
  const errors = useMemo(() => validate(input), [input])
  const { result: a, stale } = useAutoCompute(input, computeWindAny)
  const report = useMemo(() => (a ? windReportAny(a) : null), [a])
  useToolReport(ID, stale ? null : report)

  if (tab === 'detail')
    return (
      <DetailTab
        report={report}
        empty="Lengkapi data angin dan dimensi struktur untuk melihat detail perhitungan."
        note={stale ? 'Input sedang tidak valid — detail di bawah dari input sah terakhir.' : undefined}
      />
    )

  return (
    <ToolLayout
      inputs={<Inputs input={input} setInput={setInput} errors={errors} onReset={reset} />}
      preview={
        a && a.type !== 'building' ? (
          <TypePreview key={a.type} a={a} stale={stale} />
        ) : (
          <Panel title="Preview">
            <Sized>{(w, h) => (a ? <div className={stale ? 'stale' : ''} style={{ display: 'flex' }}><Preview r={a.r} w={w} h={h} /></div> : null)}</Sized>
          </Panel>
        )
      }
      results={a && a.type !== 'building' ? <TypeResults a={a} stale={stale} /> : <Results r={a?.r ?? null} stale={stale} />}
    />
  )
}

function Inputs({
  input,
  setInput,
  errors,
  onReset,
}: {
  input: WindUIInput
  setInput: (p: Partial<WindUIInput>) => void
  errors: Record<string, string>
  onReset: () => void
}) {
  const f = (key: keyof WindUIInput, label: string, unit?: string, hint?: string) => (
    <NumField label={label} unit={unit} hint={hint} value={input[key]} error={errors[key]} onChange={(v) => setInput({ [key]: v })} />
  )
  const t = input.type ?? 'building'
  return (
    <>
      <Card n={1} title="Tipe struktur" actions={<ResetButton onReset={onReset} />}>
        <SelectField
          label="Tipe bangunan/struktur"
          value={t}
          options={(Object.keys(TYPE_LABEL) as StructType[]).map((value) => ({ value, label: TYPE_LABEL[value] }))}
          onChange={(type) => setInput({ type })}
        />
        <p className="muted card-note">{TYPE_HINT[t]}</p>
      </Card>
      <Card n={2} title="Angin dasar">
        {f('V', 'V — kecepatan angin dasar', 'm/s', 'Peta angin SNI 1727 / kajian hazard lokal sesuai kategori risiko.')}
        <Field label="Kategori eksposur" hint="B perkotaan/berpohon · C terbuka, rintangan tersebar · D datar tanpa rintangan, tepi laut.">
          <Segmented ariaLabel="Kategori eksposur" value={input.expo} options={[{ value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'D', label: 'D' }]} onChange={(expo) => setInput({ expo })} />
        </Field>
        {f('Kd', 'Kd — faktor arah angin', undefined, KD_HINT[t])}
        {f('Kzt', 'Kzt — faktor topografi', undefined, '1,0 tanpa bukit/tebing (Ps. 26.8).')}
        {f('Ke', 'Ke — faktor elevasi tanah', undefined, '1,0 di permukaan laut; boleh < 1 di dataran tinggi (Tabel 26.9-1).')}
        {f('G', 'G — faktor efek hembusan', undefined, '0,85 untuk gedung kaku (n₁ ≥ 1 Hz).')}
      </Card>
      {t === 'building' && <Card n={3} title="Gedung">
        <SelectField
          label="Klasifikasi ketertutupan"
          value={input.enc}
          options={[
            { value: 'enclosed', label: 'Tertutup (GCpi ±0,18)' },
            { value: 'partial', label: 'Tertutup sebagian (GCpi ±0,55)' },
            { value: 'open', label: 'Terbuka (GCpi 0)' },
          ]}
          onChange={(enc) => setInput({ enc })}
        />
        {f('B', 'B — lebar tegak lurus arah angin', 'm')}
        {f('L', 'L — panjang sejajar arah angin', 'm')}
        {f('H', 'H — tinggi atap rata-rata', 'm')}
      </Card>}
      {t === 'warehouse' && (
        <Card n={3} title="Gudang atap pelana">
          <SelectField
            label="Klasifikasi ketertutupan"
            value={input.whEnc}
            options={[
              { value: 'enclosed', label: 'Tertutup (GCpi ±0,18)' },
              { value: 'partial', label: 'Tertutup sebagian (GCpi ±0,55)' },
            ]}
            onChange={(whEnc) => setInput({ whEnc })}
          />
          {f('whS', 'S — bentang (tegak lurus bubungan)', 'm')}
          {f('whLb', 'Lb — panjang gedung (sejajar bubungan)', 'm')}
          {f('whHe', 'he — tinggi tritisan (eave)', 'm')}
          {f('whTheta', 'θ — sudut atap', '°', '0–45°. θ < 10°: atap per zona dari tepi windward.')}
          {f('whS2', 's — jarak portal', 'm', 'Untuk beban garis portal w = p·s.')}
        </Card>
      )}
      {t === 'freeroof' && (
        <Card n={3} title="Atap bebas (bangunan terbuka)">
          <Field label="Bentuk atap">
            <Segmented ariaLabel="Bentuk atap" value={input.frShape} options={[{ value: 'pitched', label: 'Pelana' }, { value: 'mono', label: 'Monoslope' }]} onChange={(frShape) => setInput({ frShape })} />
          </Field>
          <Field label="Aliran angin di bawah atap" hint="Bersih: blokade ≤ 50% (shelter, carport). Terhalang: barang/penghalang > 50% (gudang terbuka penuh barang).">
            <Segmented ariaLabel="Aliran angin" value={input.frFlow} options={[{ value: 'clear', label: 'Bersih' }, { value: 'obstructed', label: 'Terhalang' }]} onChange={(frFlow) => setInput({ frFlow })} />
          </Field>
          {f('frTheta', 'θ — sudut atap', '°', '0–45°. θ < 7,5° memakai koefisien θ = 0° (monoslope).')}
          {f('frH', 'h — tinggi atap rata-rata', 'm')}
          {f('frL', 'L — dimensi searah angin (bentang)', 'm', 'Berlaku 0,25 ≤ h/L ≤ 1,0.')}
          {f('frB', 'B — panjang (sejajar bubungan)', 'm')}
          {f('frS', 's — jarak rangka', 'm', 'Untuk beban garis rangka w = p·s.')}
        </Card>
      )}
      {t === 'frame' && (
        <Card n={3} title="Rangka terbuka">
          <Field label="Jenis">
            <Segmented ariaLabel="Jenis rangka" value={input.ofKind} options={[{ value: 'tower', label: 'Menara' }, { value: 'plane', label: 'Bidang' }]} onChange={(ofKind) => setInput({ ofKind })} />
          </Field>
          {input.ofKind === 'tower' && (
            <Field label="Penampang menara">
              <Segmented ariaLabel="Penampang menara" value={input.ofTower} options={[{ value: 'square', label: 'Bujur sangkar' }, { value: 'triangle', label: 'Segitiga' }]} onChange={(ofTower) => setInput({ ofTower })} />
            </Field>
          )}
          <Field label="Bentuk batang">
            <Segmented ariaLabel="Bentuk batang" value={input.ofMember} options={[{ value: 'flat', label: 'Bersisi datar' }, { value: 'round', label: 'Bulat (pipa)' }]} onChange={(ofMember) => setInput({ ofMember })} />
          </Field>
          {input.ofMember === 'round' && f('ofD', 'D — diameter batang', 'm', 'Untuk kriteria D√qz (Gbr. 29.4-2).')}
          {f('ofEps', 'ε — rasio padat', undefined, input.ofKind === 'tower' ? 'Luas padat / luas bruto SATU muka menara.' : 'Luas padat / luas bruto; ≤ 0,7 (bukaan ≥ 30%).')}
          {f('ofB', input.ofKind === 'tower' ? 'b — lebar muka menara' : 'b — lebar bidang', 'm')}
          {f('ofZ1', 'z₁ — elevasi bawah', 'm')}
          {f('ofZ2', 'z₂ — elevasi atas', 'm')}
        </Card>
      )}
    </>
  )
}

const TYPE_HINT: Record<StructType, string> = {
  building: 'Gedung tertutup kaku bertingkat — SPGAU dinding, Gbr. 27.3-1.',
  warehouse: 'Gedung rendah bentang lebar atap pelana — dinding & atap dua arah angin, Gbr. 27.3-1.',
  freeroof: 'Shelter, carport, gudang terbuka tanpa dinding — atap bebas monoslope/pelana, Ps. 27.3.2.',
  frame: 'Rangka bidang/papan terbuka dan menara rangka (lattice) — struktur lain, Ps. 29.4.',
}

const KD_HINT: Record<StructType, string> = {
  building: 'SPGAU gedung: 0,85 (Tabel 26.6-1).',
  warehouse: 'SPGAU gedung: 0,85 (Tabel 26.6-1).',
  freeroof: 'Bangunan terbuka (SPGAU): 0,85 (Tabel 26.6-1).',
  frame: 'Rangka terbuka & menara bujur sangkar/segitiga: 0,85; menara penampang lain 0,95 (Tabel 26.6-1).',
}

/** Elevasi gedung + profil tekanan windward (qz·G·Cp) dan isap leeward; bidik hover menampilkan qz di elevasi z. */
function Preview({ r, w, h }: { r: WindOk; w: number; h: number }) {
  const [hy, setHy] = useState<number | null>(null)
  if (w < 260 || h < 160) return null
  const padT = 50, padB = 34
  const availH = h - padT - padB
  const bldW = Math.max(60, Math.min(150, w * 0.2))
  const cx = w * 0.52, gx0 = cx - bldW / 2, gx1 = cx + bldW / 2
  const profW = Math.max(60, Math.min(gx0 - 40, w * 0.28))
  const yOf = (z: number) => padT + availH - (z / r.H) * availH
  const pTop = r.qh * r.G * r.CpW
  const pL = Math.abs(r.qh * r.G * r.CpL)
  const sc = profW / Math.max(pTop, pL, 0.01)
  const pts: string[] = [`${gx0},${yOf(0)}`]
  for (let k = 0; k <= 32; k++) {
    const z = (r.H * k) / 32
    pts.push(`${gx0 - qzAt(r, z) * r.G * r.CpW * sc},${yOf(z)}`)
  }
  pts.push(`${gx0},${yOf(r.H)}`)
  const zH = hy === null ? null : Math.min(r.H, Math.max(0, ((padT + availH - hy) / availH) * r.H))
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    setHy(y >= padT && y <= padT + availH ? y : null)
  }
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Elevasi gedung dan profil tekanan angin" onMouseMove={onMove} onMouseLeave={() => setHy(null)}>
      <defs>
        <marker id="wl-arr-l" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--dg-load)" />
        </marker>
        <marker id="wl-arr-m" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--dg-m)" />
        </marker>
        <marker id="wl-arr-v" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--dg-v)" />
        </marker>
      </defs>
      <line x1={12} y1={yOf(0)} x2={w - 12} y2={yOf(0)} stroke="var(--dg-axis)" />
      <g className="bp-plate">
        <rect x={gx0} y={yOf(r.H)} width={bldW} height={availH} />
      </g>
      <polygon points={pts.join(' ')} fill="color-mix(in srgb, var(--dg-load) 20%, transparent)" stroke="var(--dg-load)" strokeWidth={1.6} />
      {[0.2, 0.5, 0.8].map((fr) => {
        const z = fr * r.H
        return <line key={fr} x1={gx0 - qzAt(r, z) * r.G * r.CpW * sc} y1={yOf(z)} x2={gx0 - 3} y2={yOf(z)} stroke="var(--dg-load)" strokeWidth={1.4} markerEnd="url(#wl-arr-l)" />
      })}
      {[0.2, 0.5, 0.8].map((fr) => (
        <line key={fr} x1={gx1 + 3} y1={yOf(fr * r.H)} x2={gx1 + 3 + pL * sc} y2={yOf(fr * r.H)} stroke="var(--dg-m)" strokeWidth={1.4} markerEnd="url(#wl-arr-m)" />
      ))}
      <line x1={gx1 + 3 + pL * sc} y1={yOf(0)} x2={gx1 + 3 + pL * sc} y2={yOf(r.H)} stroke="var(--dg-m)" strokeDasharray="4 3" />
      <text x={gx0 - 6} y={yOf(r.H) - 8} textAnchor="end" style={{ fill: 'var(--dg-load)' }}>windward {fx(pTop, 3)} kPa</text>
      <text x={gx1 + 6} y={yOf(r.H) - 8} style={{ fill: 'var(--dg-m)' }}>leeward −{fx(pL, 3)} kPa</text>
      <line x1={cx - 34} y1={yOf(0) + 18} x2={cx + 30} y2={yOf(0) + 18} stroke="var(--dg-v)" strokeWidth={2} markerEnd="url(#wl-arr-v)" />
      <text x={cx + 38} y={yOf(0) + 22} style={{ fill: 'var(--dg-v)' }}>F {fx(r.Fdesign, 1)} kN{r.minGoverns ? ' (min)' : ''}</text>
      <g className="bp-dim">
        <text x={cx} y={yOf(r.H / 2) + 4} textAnchor="middle">H {fx(r.H, 1)} m</text>
      </g>
      <text x={8} y={16} className="bp-label">
        Elevasi B = {fx(r.B, 1)} m · V {fx(r.V, 0)} m/s · eksposur {r.expo} · qh {fx(r.qh, 3)} kPa
      </text>
      {zH !== null && hy !== null && (
        <g pointerEvents="none">
          <line x1={12} y1={hy} x2={w - 12} y2={hy} stroke="var(--dg-axis)" strokeDasharray="3 3" />
          <text x={w - 10} y={hy - 6} textAnchor="end" className="dg-note">
            z {fx(zH, 1)} m · Kz {fx(KzAt(zH, r.expo), 3)} · qz {fx(qzAt(r, zH), 3)} kPa · qzGCp {fx(qzAt(r, zH) * r.G * r.CpW, 3)} kPa
          </text>
        </g>
      )}
    </svg>
  )
}

type Tab = 'p' | 'V'

const TABS: { id: Tab; label: string }[] = [
  { id: 'p', label: 'Tekanan dinding' },
  { id: 'V', label: 'Geser kumulatif' },
]

interface Series {
  v: number[]
  color: string
  label: string
  dash?: string
}

/** Profil nilai terhadap elevasi z (ke atas, 0…H); sumbu nilai horizontal dengan garis nol. */
function HeightChart({ z, series, w, h, unit, title }: { z: number[]; series: Series[]; w: number; h: number; unit: string; title: string }) {
  const [hy, setHy] = useState<number | null>(null)
  if (w < 220 || h < 110) return null
  const padL = 46, padR = 24, padT = 26, padB = 30
  const all = series.flatMap((s) => s.v)
  const lo0 = Math.min(0, ...all), hi0 = Math.max(0, ...all)
  const pad = 0.05 * (hi0 - lo0 || 1)
  const lo = lo0 < 0 ? lo0 - pad : 0, hi = hi0 > 0 ? hi0 + pad : 0
  const span = hi - lo || 1
  const H = z[z.length - 1]
  const X = (a: number) => padL + ((a - lo) / span) * (w - padL - padR)
  const Y = (zz: number) => h - padB - (zz / H) * (h - padT - padB)
  const st = niceStep(span, 4)
  const ticks: number[] = []
  for (let i = Math.ceil(lo / st - 1e-9); i * st <= hi + 1e-9; i++) ticks.push(i * st + 0)
  const dp = st < 0.1 ? 2 : st < 1 ? 1 : 0
  // legenda sebaris: posisi kumulatif dari perkiraan lebar teks (≈ 6,4 px per karakter)
  const legX = series.map((_, i) => padL + series.slice(0, i).reduce((a, t) => a + t.label.length * 6.4 + 34, 0))
  const k = hy === null ? null : Math.round(((h - padB - hy) / (h - padT - padB)) * (z.length - 1))
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    setHy(y >= padT && y <= h - padB ? y : null)
  }
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label={title} onMouseMove={onMove} onMouseLeave={() => setHy(null)}>
      <line className="dg-zero" x1={X(0)} y1={padT} x2={X(0)} y2={h - padB} />
      <line className="dg-zero" x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} />
      {ticks.map((a) => (
        <text key={a} x={X(a)} y={h - padB + 13} textAnchor="middle" className="dg-note">{fx(a, dp)}</text>
      ))}
      <text x={padL - 6} y={Y(H) + 4} textAnchor="end" className="dg-note">{fx(H, 1)} m</text>
      <text x={padL - 6} y={Y(0)} textAnchor="end" className="dg-note">0</text>
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} points={z.map((zz, i) => `${X(s.v[i])},${Y(zz)}`).join(' ')} />
      ))}
      <text x={w - padR} y={h - 4} textAnchor="end" className="dg-note">{unit}</text>
      {series.map((s, i) => (
        <g key={s.label}>
          <line x1={legX[i]} y1={10} x2={legX[i] + 14} y2={10} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
          <text x={legX[i] + 18} y={14} className="dg-note">{s.label}</text>
        </g>
      ))}
      {k !== null && k >= 0 && k < z.length && (
        <g pointerEvents="none">
          <line x1={padL} y1={Y(z[k])} x2={w - padR} y2={Y(z[k])} stroke="var(--dg-axis)" strokeDasharray="3 3" />
          {series.map((s) => <circle key={s.label} cx={X(s.v[k])} cy={Y(z[k])} r={3} fill={s.color} />)}
          <text x={w - padR} y={Y(z[k]) - 6} textAnchor="end" className="val">
            z {fx(z[k], 1)} m · {series.map((s) => fx(s.v[k], unit === 'kN' ? 1 : 3)).join(' / ')}
          </text>
        </g>
      )}
    </svg>
  )
}

function Results({ r, stale }: { r: WindOk | null; stale: boolean }) {
  const [tab, setTab] = useState<Tab>('p')
  const status = stale ? 'Input belum lengkap/valid — hasil di bawah dari input sah terakhir.' : null
  const pr = useMemo(() => (r ? windProfile(r) : null), [r])
  return (
    <Panel title="Hasil" className="results-panel" tools={<SubTabs ariaLabel="Diagram" value={tab} tabs={TABS} onChange={setTab} />}>
      <div className="results">
        {status && <p className="msg bad">{status}</p>}
        <div className={`results-chart${stale ? ' stale' : ''}`}>
          <Sized>
            {(w, h) =>
              !r || !pr ? null : tab === 'p' ? (
                <HeightChart
                  z={pr.z}
                  w={w}
                  h={h}
                  unit="kPa"
                  title="Tekanan desain dinding terhadap elevasi"
                  series={[
                    { v: pr.pM, color: 'var(--dg-load)', label: 'Windward −GCpi' },
                    { v: pr.pP, color: 'var(--dg-load)', label: '+GCpi', dash: '5 3' },
                    { v: pr.z.map(() => r.pLee), color: 'var(--dg-m)', label: 'Leeward +GCpi' },
                    { v: pr.z.map(() => r.pSide), color: 'var(--dg-y)', label: 'Samping +GCpi' },
                  ]}
                />
              ) : (
                <HeightChart z={pr.z} w={w} h={h} unit="kN" title="Geser kumulatif dari atap" series={[{ v: pr.Vz, color: 'var(--dg-v)', label: 'Geser angin di atas elevasi z (kN)' }]} />
              )
            }
          </Sized>
        </div>
        {r && (
          <div className={stale ? 'stale' : ''}>
            <h4 className="results-h">Ringkasan</h4>
            <StatTiles
              items={[
                { label: 'Geser dasar F', value: fx(r.Fdesign, 1), unit: 'kN', sub: r.minGoverns ? `minimum 0,77 kPa menentukan (hitungan ${fx(r.F, 1)})` : `minimum ${fx(r.Fmin, 1)} kN`, tone: r.minGoverns ? 'bad' : undefined },
                { label: 'Momen guling dasar', value: fx(r.M, 0), unit: 'kN·m' },
                { label: 'qh (z = H)', value: fx(r.qh, 3), unit: 'kPa', sub: `Kh ${fx(r.Kh, 3)}` },
              ]}
            />
            <p className="muted" style={{ marginTop: 8 }}>
              Tekanan dinding (+GCpi / −GCpi, GCpi ±{fx(r.GCpi, 2)}): windward puncak {fx(r.pWWtopPlus, 3)} / {fx(r.pWWtopMinus, 3)} · leeward (L/B {fx(r.LB, 2)}){' '}
              {fx(r.pLee, 3)} / {fx(r.pLeeMinus, 3)} · samping {fx(r.pSide, 3)} / {fx(r.pSideMinus, 3)} kPa. Satu arah angin (tegak lurus B) — jalankan juga arah
              lain dengan menukar B ↔ L.
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
