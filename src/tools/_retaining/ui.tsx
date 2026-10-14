import { fx } from '../../report/model'
import { Card, Field, NumField, Segmented } from '../../ui/kit'
import { basePressures, geomOf, wallPolys, type Pt, type WallCommonInput, type WallStab } from './common'

// Komponen UI bersama dinding penahan tanah: kartu input geometri & tanah, penampang SVG, grafik rasio D/C.

type SetInput = (p: Partial<WallCommonInput>) => void

interface CardProps {
  input: WallCommonInput
  setInput: SetInput
  errors: Record<string, string>
  /** Nomor kartu pertama. */
  n: number
  /** Istilah badan: "badan" (pasangan batu) atau "stem" (beton). */
  body: string
  /** Aksi di kartu pertama (tombol reset). */
  actions?: React.ReactNode
}

function numField(p: CardProps, key: keyof WallCommonInput, label: string, unit?: string, hint?: string) {
  return <NumField label={label} unit={unit} hint={hint} value={String(p.input[key])} error={p.errors[key]} onChange={(v) => p.setInput({ [key]: v })} />
}

/** Kartu geometri dan tanah (dua kartu: n dan n + 1) + tanah fondasi (n + 2) + kriteria (digabung ke n + 2). */
export function WallCards(p: CardProps) {
  const f = (key: keyof WallCommonInput, label: string, unit?: string, hint?: string) => numField(p, key, label, unit, hint)
  return (
    <>
      <Card n={p.n} title="Geometri" actions={p.actions}>
        <Field label="Bentuk" hint="Tegak: sisi belakang vertikal, muka depan miring. Miring: muka depan vertikal, sisi tanah miring.">
          <Segmented
            ariaLabel="Bentuk"
            value={p.input.opsi}
            options={[
              { value: 'tegak', label: 'Sisi tegak ke tanah' },
              { value: 'miring', label: 'Sisi miring ke tanah' },
            ]}
            onChange={(opsi) => p.setInput({ opsi })}
          />
        </Field>
        {f('H', `H — tinggi ${p.body} di atas tapak`, 'm')}
        {f('bTop', `Lebar puncak ${p.body}`, 'm')}
        {f('bBot', `Lebar dasar ${p.body}`, 'm', 'Harus ≥ lebar puncak.')}
        {f('tf', 't — tebal tapak', 'm')}
        {f('toe', 'Toe — proyeksi depan', 'm')}
        {f('heel', 'Heel — proyeksi belakang', 'm')}
        {f('D', 'D — tanah depan', 'm', 'Tinggi tanah di depan dinding dari dasar tapak (tahanan pasif).')}
      </Card>
      <Card n={p.n + 1} title="Urugan & beban">
        {f('gamma1', 'γ — berat isi urugan', 'kN/m³')}
        {f('phi1', 'φ — sudut geser urugan', '°', 'Urugan granular, c = 0.')}
        {f('beta', 'β — lereng urugan', '°', 'Harus < φ.')}
        {f('q', 'q — beban merata di atas urugan', 'kPa')}
      </Card>
      <Card n={p.n + 2} title="Tanah fondasi & kriteria">
        {f('gamma2', 'γ — berat isi tanah fondasi', 'kN/m³')}
        {f('phi2', 'φ — sudut geser', '°')}
        {f('c2', 'c — kohesi', 'kPa')}
        {f('qall', 'q izin — daya dukung izin', 'kPa', '0 = cek daya dukung dilewati.')}
        {f('kf', 'k — faktor gesekan dasar', undefined, 'μ = tan(k·φ), adhesi = k·c. Di luar 0–1 dipakai 0,67.')}
        <Field label="Tahanan pasif" hint="Hanya bila tanah depan permanen (tidak akan tergali/tererosi).">
          <Segmented
            ariaLabel="Tahanan pasif"
            value={p.input.passive}
            options={[
              { value: 'tidak', label: 'Abaikan' },
              { value: 'ya', label: 'Ikutkan' },
            ]}
            onChange={(passive) => p.setInput({ passive })}
          />
        </Field>
        {f('FSot', 'FS guling minimum', undefined, 'Kosong/0 = 2,0.')}
        {f('FSsl', 'FS geser minimum', undefined, 'Kosong/0 = 1,5.')}
        {f('Lwall', 'Panjang dinding (volume total)', 'm', '0 = hanya per meter.')}
      </Card>
    </>
  )
}

/** Penampang dinding: badan, tapak, urugan, tanah depan, tekanan dasar layan, gaya aktif. */
export function WallPreview({ r, w, h }: { r: WallStab; w: number; h: number }) {
  if (w < 200 || h < 160) return null
  const g = geomOf(r)
  const P = wallPolys(g)
  const hTot = P.yTopSoil + 0.25
  const padL = 60, padR = 120, padT = 48, padB = 62
  const sc = Math.min((w - padL - padR) / (g.B + 0.8), (h - padT - padB) / hTot)
  const x0 = padL + 0.4 * sc, yBase = padT + hTot * sc
  const X = (x: number) => x0 + x * sc
  const Y = (y: number) => yBase - y * sc
  const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)},${Y(y)}`).join(' ') + ' Z'
  const bp = basePressures(r)
  const finite = Number.isFinite(bp.max) && bp.max > 0
  const qh = 34
  const qs = (v: number) => (finite ? (v / bp.max) * qh : 0)
  const yb = Y(0)
  const yPa = Y(r.yPa!)
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Penampang dinding penahan tanah">
      <path d={path(P.front).replace(' Z', '')} fill="none" stroke="var(--dg-axis)" strokeWidth={1.5} />
      <path d={path(P.back)} fill="color-mix(in srgb, var(--dg-m) 16%, transparent)" stroke="var(--dg-m)" />
      <g className="bp-plate">
        <path d={path(P.foot)} />
        <path d={path(P.stem)} />
      </g>
      {r.q! > 0 && (
        <g stroke="var(--dg-load)" fill="var(--dg-load)">
          <line x1={X(P.xTopBack)} y1={Y(g.tf + g.H) - 14} x2={X(g.B)} y2={Y(g.tf + g.H) - 14} />
          {[0, 1, 2, 3, 4].map((k) => (
            <line key={k} x1={X(P.xTopBack + ((g.B - P.xTopBack) * k) / 4)} y1={Y(g.tf + g.H) - 14} x2={X(P.xTopBack + ((g.B - P.xTopBack) * k) / 4)} y2={Y(g.tf + g.H) - 6} />
          ))}
          <text x={X(P.xTopBack)} y={Y(g.tf + g.H) - 18} stroke="none">
            q {fx(r.q, 0)} kPa
          </text>
        </g>
      )}
      {finite && (
        <g>
          <path d={`M${X(0)},${yb} L${X(g.B)},${yb} L${X(g.B)},${yb + qs(bp.heel)} L${X(0)},${yb + qs(bp.toe)} Z`} fill="color-mix(in srgb, var(--dg-y) 30%, transparent)" stroke="var(--dg-y)" />
          <text x={X(0) - 4} y={yb + qs(bp.toe) + 4} textAnchor="end" style={{ fill: 'var(--dg-y)' }}>
            {fx(bp.toe, 1)}
          </text>
          <text x={X(g.B) + 4} y={yb + qs(bp.heel) + 4} style={{ fill: 'var(--dg-y)' }}>
            {fx(bp.heel, 1)} kPa
          </text>
        </g>
      )}
      <g stroke="var(--danger)" fill="var(--danger)">
        <line x1={X(g.B) + 40} y1={yPa} x2={X(g.B) + 8} y2={yPa} strokeWidth={2} />
        <path d={`M${X(g.B) + 4},${yPa} l8,-4 v8 z`} stroke="none" />
        <text x={X(g.B) + 44} y={yPa + 4} stroke="none">
          Pa,h {fx(r.Pah, 1)}
        </text>
      </g>
      <g className="bp-dim">
        <line x1={X(0)} y1={yb + qh + 14} x2={X(g.B)} y2={yb + qh + 14} />
        <text x={(X(0) + X(g.B)) / 2} y={yb + qh + 27} textAnchor="middle">
          B {fx(g.B, 2)} m
        </text>
        <line x1={X(0) - 36} y1={Y(g.tf + g.H)} x2={X(0) - 36} y2={yb} />
        <text x={X(0) - 40} y={(Y(g.tf + g.H) + yb) / 2 + 4} textAnchor="end">
          {fx(g.H + g.tf, 2)} m
        </text>
      </g>
      <text x={8} y={16} className="bp-label">
        Tekanan dasar (kPa) · Pa,h (kN/m)
      </text>
    </svg>
  )
}

/** Batang rasio D/C; garis 1,0 = batas. */
export function RatioChart({ items, w, h, note }: { items: { label: string; ratio: number }[]; w: number; h: number; note?: string }) {
  if (w < 200 || h < 100 || !items.length) return null
  const padL = Math.min(190, w * 0.4), padR = 40, padT = 16, padB = 26
  const rowH = Math.min(30, (h - padT - padB) / items.length)
  const maxV = Math.max(1.2, ...items.map((x) => (Number.isFinite(x.ratio) ? x.ratio : 0))) * 1.05
  const X = (v: number) => padL + (v / maxV) * (w - padL - padR)
  return (
    <svg width={w} height={h} className="dg" role="img" aria-label="Rasio kebutuhan terhadap kapasitas">
      {items.map((it, k) => {
        const y = padT + k * rowH
        const v = Number.isFinite(it.ratio) ? it.ratio : maxV
        const color = v > 1 ? 'var(--danger)' : v > 0.9 ? 'var(--warning)' : 'var(--dg-v)'
        return (
          <g key={it.label}>
            <text x={padL - 8} y={y + rowH / 2 + 4} textAnchor="end" className="dg-bar-label">
              {it.label}
            </text>
            <rect x={padL} y={y + rowH * 0.2} width={Math.max(2, X(v) - padL)} height={rowH * 0.6} rx={2} fill={`color-mix(in srgb, ${color} 45%, transparent)`} stroke={color} />
            <text x={X(v) + 6} y={y + rowH / 2 + 4} className="val">
              {Number.isFinite(it.ratio) ? fx(it.ratio, 2) : '∞'}
            </text>
          </g>
        )
      })}
      <line x1={X(1)} y1={padT - 4} x2={X(1)} y2={padT + items.length * rowH} stroke="var(--danger)" strokeDasharray="5 3" />
      <text x={padL} y={h - 8} className="dg-note">
        {note ?? 'Kebutuhan ÷ kapasitas — garis merah = 1,0 (batas)'}
      </text>
    </svg>
  )
}
