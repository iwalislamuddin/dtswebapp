import type { SteelBeamResult } from '../../calc/steel-beam-analysis'
import { fx } from '../../report/model'
import { sx, type DiagramFrame } from '../../ui/diagram'

// Preview: balok, tumpuan sendi (A) & rol (B), beban merata/trapesium & terpusat, dimensi — ikut input.

const ARROW = 6

function Arrow({ x, y1, y2, cls }: { x: number; y1: number; y2: number; cls: string }) {
  const dir = Math.sign(y2 - y1) || 1
  return (
    <g className={cls}>
      <line x1={x} y1={y1} x2={x} y2={y2 - dir * 2} />
      <path d={`M${x},${y2} l${-ARROW / 2},${-dir * ARROW} h${ARROW} Z`} />
    </g>
  )
}

/** Tumpuan: sendi = segitiga + arsir; rol = segitiga + lingkaran. */
export function Support({ x, y, kind, label }: { x: number; y: number; kind: 'pin' | 'roller'; label: string }) {
  const s = 9
  return (
    <g className="bp-support">
      <path d={`M${x},${y} l${-s},${s * 1.4} h${2 * s} Z`} />
      {kind === 'roller' ? (
        <>
          <circle cx={x - s / 2} cy={y + s * 1.4 + 3.5} r={3} />
          <circle cx={x + s / 2} cy={y + s * 1.4 + 3.5} r={3} />
          <line x1={x - s - 3} y1={y + s * 1.4 + 7} x2={x + s + 3} y2={y + s * 1.4 + 7} />
        </>
      ) : (
        <line x1={x - s - 3} y1={y + s * 1.4} x2={x + s + 3} y2={y + s * 1.4} />
      )}
      <text x={x} y={y + s * 1.4 + 22} textAnchor="middle" className="bp-label">
        {label}
      </text>
    </g>
  )
}

function Dim({ x1, x2, y, text }: { x1: number; x2: number; y: number; text: string }) {
  if (x2 - x1 < 2) return null
  return (
    <g className="bp-dim">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text x={(x1 + x2) / 2} y={y - 4} textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

export function BeamPreview({ r, w, h }: { r: SteelBeamResult; w: number; h: number }) {
  if (w < 50 || h < 50) return null
  const f: DiagramFrame = { w, h, padL: 36, padR: 36, padT: 0, padB: 0, x0: 0, x1: r.Ltot! }
  const X = (x: number) => sx(f, x)
  const yBeam = Math.round(h * 0.52)
  const bandTotal = Math.min(48, h * 0.24)
  const dists = r.inpDist!
  const user = dists.filter((d) => !d.self)
  const self = dists.find((d) => d.self)
  const wMax = Math.max(1e-9, ...user.flatMap((d) => [Math.abs(d.w1), Math.abs(d.w2)]))
  // Tiap beban merata di jalurnya sendiri (bertumpuk ke atas) agar yang tumpang-tindih tetap terbaca.
  const lanes = Math.max(1, user.length)
  const band = bandTotal / lanes + (lanes > 1 ? 4 : 0)
  const H = (wv: number) => 5 + (bandTotal / lanes - 5) * (Math.abs(wv) / wMax)
  return (
    <svg width={w} height={h} className="bp" role="img" aria-label="Preview balok dan beban">
      {/* berat sendiri: pita tipis di atas balok */}
      {self && (
        <g className="bp-self">
          <rect x={X(0)} y={yBeam - 9} width={X(r.Ltot!) - X(0)} height={5} />
          <text x={w - 8} y={16} textAnchor="end">
            + berat sendiri {fx(self.w1, 2)} kN/m
          </text>
        </g>
      )}
      {/* beban merata / trapesium */}
      {user.map((d, i) => {
        const base = yBeam - 12 - i * band
        const xa = X(d.a1), xb = X(d.a2), ya = base - H(d.w1), yb = base - H(d.w2)
        const n = Math.max(2, Math.round((xb - xa) / 22))
        return (
          <g key={i} className="bp-dist">
            <path d={`M${xa},${base} L${xa},${ya} L${xb},${yb} L${xb},${base} Z`} />
            {Array.from({ length: n + 1 }, (_, k) => {
              const x = xa + ((xb - xa) * k) / n
              return <Arrow key={k} x={x} y1={ya + ((yb - ya) * k) / n} y2={base} cls="bp-arrow" />
            })}
            <text x={xa} y={ya - 5} textAnchor={d.w1 === d.w2 ? 'start' : 'middle'}>
              {d.w1 === d.w2 ? `q = ${fx(d.w1, 2)} kN/m` : fx(d.w1, 2)}
            </text>
            {d.w1 !== d.w2 && (
              <text x={xb} y={yb - 5} textAnchor="middle">
                {fx(d.w2, 2)}
              </text>
            )}
          </g>
        )
      })}
      {/* beban terpusat (P negatif = ke atas, digambar dari bawah) */}
      {r.inpPt!.map((p, i) => {
        const up = p.P < 0
        const x = X(p.a)
        // di atas pita beban merata agar tidak bertumpuk
        const top = yBeam - 12 - (user.length ? lanes * band : 0) - 24
        const right = x < w * 0.7
        return (
          <g key={i} className="bp-point">
            {up ? <Arrow x={x} y1={yBeam + 46} y2={yBeam + 4} cls="bp-arrow strong" /> : <Arrow x={x} y1={top} y2={yBeam - 3} cls="bp-arrow strong" />}
            <text x={right ? x + 6 : x - 6} y={up ? yBeam + 44 : top + 10} textAnchor={right ? 'start' : 'end'} className="bp-pt-label">
              P{i + 1} = {fx(Math.abs(p.P), 1)} kN
            </text>
          </g>
        )
      })}
      {/* balok */}
      <line className="bp-beam" x1={X(0)} y1={yBeam} x2={X(r.Ltot!)} y2={yBeam} />
      <Support x={X(r.xA!)} y={yBeam + 3} kind="pin" label="A" />
      <Support x={X(r.xB!)} y={yBeam + 3} kind="roller" label="B" />
      {/* dimensi */}
      <Dim x1={X(0)} x2={X(r.xA!)} y={h - 14} text={`${fx(r.cL, 2)} m`} />
      <Dim x1={X(r.xA!)} x2={X(r.xB!)} y={h - 14} text={`L = ${fx(r.L, 2)} m`} />
      <Dim x1={X(r.xB!)} x2={X(r.Ltot!)} y={h - 14} text={`${fx(r.cR, 2)} m`} />
      <text x={8} y={16} className="bp-label">
        {r.prof!.name}
      </text>
    </svg>
  )
}
