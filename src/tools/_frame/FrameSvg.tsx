import { useState, type MouseEvent } from 'react'
import { fx } from '../../report/model'
import {
  deflPoint,
  deformedShape,
  deformMag,
  fitFrame,
  FORCE_NAME,
  FORCE_UNIT,
  forceCurves,
  sampleAt,
  type ForceKey,
  type FrameView,
  type P2,
} from './geom'

// Gambar rangka bidang (SVG, ukuran piksel nyata): model + beban (Preview) dan diagram M/V/N, deformasi, reaksi
// (panel Diagram). Warna dari token --dg-*.

export type FrameMode = 'model' | ForceKey | 'D' | 'R'

const COLOR: Record<ForceKey | 'D', string> = { M: 'var(--dg-m)', V: 'var(--dg-v)', N: 'var(--dg-y)', D: 'var(--accent)' }
const path = (pts: P2[], close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + (close ? 'Z' : '')

function Arrow({ from, to, cls, head = 6 }: { from: P2; to: P2; cls: string; head?: number }) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0])
  const p = (d: number): P2 => [to[0] - head * Math.cos(a + d), to[1] - head * Math.sin(a + d)]
  return (
    <g className={cls}>
      <line x1={from[0]} y1={from[1]} x2={to[0] - 2 * Math.cos(a)} y2={to[1] - 2 * Math.sin(a)} />
      <path d={path([to, p(0.45), p(-0.45)], true)} />
    </g>
  )
}

/** Tumpuan: sendi = segitiga, jepit = garis tanah berarsir. */
function Support({ at, fixed }: { at: P2; fixed: boolean }) {
  const [x, y] = at, s = 9
  if (fixed)
    return (
      <g className="bp-support">
        <line x1={x - 13} y1={y} x2={x + 13} y2={y} />
        {[-12, -6, 0, 6].map((d) => (
          <line key={d} x1={x + d} y1={y + 1} x2={x + d + 6} y2={y + 7} style={{ strokeWidth: 1 }} />
        ))}
      </g>
    )
  return (
    <g className="bp-support">
      <path d={`M${x},${y} l${-s},${s * 1.4} h${2 * s} Z`} />
      <line x1={x - s - 3} y1={y + s * 1.4} x2={x + s + 3} y2={y + s * 1.4} />
    </g>
  )
}

export function FrameSvg({ v, mode, w, h, dims }: { v: FrameView; mode: FrameMode; w: number; h: number; dims?: { text: string; a: P2; b: P2; side: 'b' | 'l' | 'r' }[] }) {
  const [mouse, setMouse] = useState<P2 | null>(null)
  if (w < 80 || h < 80) return null
  const isModel = mode === 'model'
  // Diagram: ruang tepi mengikuti ordinat maksimum (kolom ke luar, balok hogging ke atas).
  const span = (k: 0 | 1) => Math.max(1e-6, ...v.nodes.map((n) => n[k])) - Math.min(...v.nodes.map((n) => n[k]))
  const sc0 = fitFrame(v, { w, h, padL: 60, padR: 60, padT: 30, padB: 30 }).sc
  const ampPx = Math.min(56, Math.max(20, 0.22 * Math.min(span(0), span(1)) * sc0))
  const fit = isModel
    ? fitFrame(v, { w, h, padL: 64, padR: 64, padT: 62, padB: 50 })
    : mode === 'R'
      ? fitFrame(v, { w, h, padL: 110, padR: 110, padT: 16, padB: 72 })
      : fitFrame(v, { w, h, padL: ampPx + 34, padR: ampPx + 34, padT: ampPx + 16, padB: ampPx + 16 })
  const { T, sc } = fit
  const N = v.nodes.map(T)
  const amp = ampPx / sc

  const members = v.elems.map((e, k) => (
    <line key={k} className={isModel ? 'bp-beam' : 'fr-member'} x1={N[e.ni][0]} y1={N[e.ni][1]} x2={N[e.nj][0]} y2={N[e.nj][1]} />
  ))
  const supports = v.supports.map((i) => <Support key={i} at={N[i]} fixed={v.fixed} />)

  let body = null
  let readout: string | null = null
  let hoverMark = null
  const onMove = (ev: MouseEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setMouse([((ev.clientX - r.left) / (r.width || 1)) * w, ((ev.clientY - r.top) / (r.height || 1)) * h])
  }

  if (isModel) body = <Loads v={v} T={T} />
  else if (mode === 'M' || mode === 'V' || mode === 'N') {
    const curves = forceCurves(v, mode, amp)
    const color = COLOR[mode]
    // bidik: titik sumbu terdekat dari kursor (≤ 28 px)
    if (mouse) {
      let best = { d: 28 * 28, k: -1, i: 0 }
      curves.forEach((c, k) =>
        c.base.forEach((p, i) => {
          const q = T(p), d = (q[0] - mouse[0]) ** 2 + (q[1] - mouse[1]) ** 2
          if (d < best.d) best = { d, k, i }
        }),
      )
      if (best.k >= 0) {
        const s = sampleAt(v.elems[best.k], best.i)
        const q0 = T(curves[best.k].base[best.i]), q1 = T(curves[best.k].curve[best.i])
        readout = `${v.names[best.k]} · x = ${fx(s.x, 2)} m · M = ${fx(s.M, 2)} kN·m · V = ${fx(s.V, 2)} kN · N = ${fx(s.N, 2)} kN`
        hoverMark = (
          <g className="dg-hover">
            <line x1={q0[0]} y1={q0[1]} x2={q1[0]} y2={q1[1]} />
            <circle cx={q1[0]} cy={q1[1]} r={3.5} stroke={color} />
          </g>
        )
      }
    }
    body = (
      <g>
        {curves.map((c, k) => {
          const base = c.base.map(T), curve = c.curve.map(T)
          const e = c.values[c.ext], q = curve[c.ext], q0 = base[c.ext]
          const dx = q[0] - q0[0], dy = q[1] - q0[1], len = Math.hypot(dx, dy) || 1
          return (
            <g key={k}>
              <path d={path([...base, ...[...curve].reverse()], true)} fill={color} fillOpacity={0.16} stroke="none" />
              <path d={path(curve)} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
              {Math.abs(e) > 1e-6 && (
                <g className="dg-ext">
                  <circle cx={q[0]} cy={q[1]} r={2.8} fill={color} />
                  <text x={q[0] + (dx / len) * 9} y={q[1] + (dy / len) * 9 + 4} textAnchor={Math.abs(dx) < 2 ? 'middle' : dx > 0 ? 'start' : 'end'}>
                    {fx(e, 2)}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        <text x={w - 8} y={h - 8} textAnchor="end" className="dg-note">
          {FORCE_NAME[mode]} ({FORCE_UNIT[mode]}){mode === 'M' ? ' — digambar di sisi serat tarik' : mode === 'N' ? ' — tarik (+), tekan (−)' : ''}
        </text>
      </g>
    )
  } else if (mode === 'D') {
    const mag = deformMag(v)
    body = (
      <g>
        {deformedShape(v, mag).map((pts, k) => (
          <path key={k} d={path(pts.map(T))} fill="none" stroke={COLOR.D} strokeWidth={2} />
        ))}
        {v.deflLabels.map((l, k) => {
          const q = T(deflPoint(v, l, mag))
          return (
            <g key={k} className="dg-ext">
              <circle cx={q[0]} cy={q[1]} r={2.8} fill={COLOR.D} />
              <text x={q[0] + (l.side === 'l' ? -7 : l.side === 'r' ? 7 : 0)} y={q[1] + (l.side === 'b' ? 15 : -7)} textAnchor={l.side === 'l' ? 'end' : l.side === 'r' ? 'start' : 'middle'}>
                {l.text}
              </text>
            </g>
          )
        })}
        <text x={w - 8} y={h - 8} textAnchor="end" className="dg-note">
          skala deformasi ×{mag >= 10 ? Math.round(mag) : fx(mag, 1)}
        </text>
      </g>
    )
  } else body = <Reactions v={v} N={N} />

  return (
    <svg
      width={w}
      height={h}
      className={isModel ? 'bp' : 'dg'}
      role="img"
      aria-label={isModel ? 'Model portal dan beban' : `Diagram ${mode}`}
      onMouseMove={mode === 'M' || mode === 'V' || mode === 'N' ? onMove : undefined}
      onMouseLeave={() => setMouse(null)}
    >
      {members}
      {supports}
      {isModel && N.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.4} className="fr-node" />)}
      {body}
      {isModel &&
        dims?.map((d, k) => {
          const a = T(d.a), bb = T(d.b)
          if (d.side === 'b') {
            const y = Math.max(a[1], bb[1]) + 34
            return (
              <g key={k} className="bp-dim">
                <line x1={a[0]} y1={y} x2={bb[0]} y2={y} />
                <line x1={a[0]} y1={y - 4} x2={a[0]} y2={y + 4} />
                <line x1={bb[0]} y1={y - 4} x2={bb[0]} y2={y + 4} />
                <text x={(a[0] + bb[0]) / 2} y={y - 4} textAnchor="middle">
                  {d.text}
                </text>
              </g>
            )
          }
          const x = d.side === 'l' ? Math.min(a[0], bb[0]) - 30 : Math.max(a[0], bb[0]) + 30
          return (
            <g key={k} className="bp-dim">
              <line x1={x} y1={a[1]} x2={x} y2={bb[1]} />
              <line x1={x - 4} y1={a[1]} x2={x + 4} y2={a[1]} />
              <line x1={x - 4} y1={bb[1]} x2={x + 4} y2={bb[1]} />
              <text x={x + (d.side === 'l' ? -5 : 5)} y={(a[1] + bb[1]) / 2 + 4} textAnchor={d.side === 'l' ? 'end' : 'start'}>
                {d.text}
              </text>
            </g>
          )
        })}
      {hoverMark}
      {readout && (
        <text x={8} y={16} className="dg-readout">
          {readout}
        </text>
      )}
    </svg>
  )
}

function Loads({ v, T }: { v: FrameView; T: (p: P2) => P2 }) {
  const H = 18
  const xs = v.nodes.map((n) => n[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2
  return (
    <g>
      {v.loads.dist.map((d, k) => {
        const a = T(d.a), b = T(d.b)
        const n = Math.max(3, Math.round(Math.abs(b[0] - a[0]) / 24))
        return (
          <g key={k} className="bp-dist">
            <path d={path([a, [a[0], a[1] - 6 - H], [b[0], b[1] - 6 - H], b], true)} style={{ stroke: 'none' }} />
            <line x1={a[0]} y1={a[1] - 6 - H} x2={b[0]} y2={b[1] - 6 - H} className="fr-load-line" />
            {Array.from({ length: n + 1 }, (_, i) => {
              const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
              return <Arrow key={i} from={[x, y - 6 - H]} to={[x, y - 3]} cls="bp-arrow" head={5} />
            })}
            {k === 0 && (
              // balok: di bawah batang (dalam rangka) agar tak bertumpuk dengan label beban terpusat; atap: di atas puncak
              <text x={v.loads.dist.length > 1 ? b[0] : (a[0] + b[0]) / 2} y={v.loads.dist.length > 1 ? b[1] - H - 14 : (a[1] + b[1]) / 2 + 18} textAnchor="middle">
                {d.label}
              </text>
            )}
          </g>
        )
      })}
      {v.loads.points.map((p, k) => {
        const q = T(p.at), up = p.P < 0
        const tip: P2 = [q[0], up ? q[1] + 4 : q[1] - 4]
        const tail: P2 = [q[0], up ? q[1] + 44 : q[1] - 46]
        return (
          <g key={k} className="bp-point">
            <Arrow from={tail} to={tip} cls="bp-arrow strong" />
            <text x={q[0]} y={up ? tail[1] + 12 : tail[1] - 4} textAnchor="middle" className="bp-pt-label">
              {p.label}
            </text>
          </g>
        )
      })}
      {v.loads.lateral.map((l, k) => {
        // panah di luar rangka, sedikit di atas simpul: menekan dari luar atau menarik ke luar
        const q = T(l.at), out = l.at[0] <= cx ? -1 : 1, dir = l.H >= 0 ? 1 : -1
        const y = q[1] - 10
        const inward = dir === -out
        const far = q[0] + out * 44, near = q[0] + out * 4
        return (
          <g key={k} className="bp-point">
            <Arrow from={[inward ? far : near, y]} to={[inward ? near : far, y]} cls="bp-arrow strong" />
            <text x={far + out * 4} y={y + 4} textAnchor={out < 0 ? 'end' : 'start'} className="bp-pt-label">
              {l.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function Reactions({ v, N }: { v: FrameView; N: P2[] }) {
  const maxR = Math.max(1e-9, ...v.reactions.flatMap((r) => [Math.abs(r.Rx), Math.abs(r.Ry)]))
  const len = (x: number) => 14 + 36 * (Math.abs(x) / maxR)
  return (
    <g className="dg-react">
      {v.supports.map((i, k) => {
        const r = v.reactions[k], [x, y] = N[i]
        const left = x < (N[v.supports[0]][0] + N[v.supports[v.supports.length - 1]][0]) / 2
        const ly = len(r.Ry), lx = len(r.Rx)
        const yb = y + 14
        return (
          <g key={i}>
            {Math.abs(r.Ry) > 1e-6 && (
              <Arrow from={r.Ry >= 0 ? [x, yb + ly] : [x, yb]} to={r.Ry >= 0 ? [x, yb] : [x, yb + ly]} cls="dg-react" />
            )}
            {Math.abs(r.Rx) > 1e-6 && (
              <Arrow from={r.Rx >= 0 ? [x - lx, y + 4] : [x + lx, y + 4]} to={r.Rx >= 0 ? [x - 3, y + 4] : [x + 3, y + 4]} cls="dg-react" />
            )}
            {v.fixed && Math.abs(r.M) > 1e-6 && (
              // busur di bawah tumpuan, kepala panah menunjukkan arah (M + berlawanan jarum jam)
              <g>
                <path d={`M${x - 14},${y + 2} A14,14 0 0,0 ${x + 14},${y + 2}`} style={{ fill: 'none', stroke: 'var(--dg-v)', strokeWidth: 1.6 }} />
                <path d={r.M >= 0 ? `M${x + 14},${y - 2} l-4,7 h8 Z` : `M${x - 14},${y - 2} l-4,7 h8 Z`} />
              </g>
            )}
            <text x={left ? x - 24 : x + 24} y={yb + 18} textAnchor={left ? 'end' : 'start'}>
              <tspan x={left ? x - 24 : x + 24}>V = {fx(r.Ry, 2)} kN</tspan>
              <tspan x={left ? x - 24 : x + 24} dy={14}>
                H = {fx(r.Rx, 2)} kN
              </tspan>
              {v.fixed && (
                <tspan x={left ? x - 24 : x + 24} dy={14}>
                  M = {fx(r.M, 2)} kN·m
                </tspan>
              )}
            </text>
          </g>
        )
      })}
    </g>
  )
}
