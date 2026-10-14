import { arrow, dimH, dimV, figRows, FIG_W } from '../../report/figure'
import { fx, type FigColor, type FigOp, type Figure } from '../../report/model'
import { deflPoint, deformedShape, deformMag, fitFrame, forceCurves, frameBox, type ForceKey, type FrameView, type P2 } from './geom'

// Gambar laporan rangka bidang (berwarna): model & beban, diagram M/V/N, deformasi, reaksi — geometri sama dengan
// SVG di UI (geom.ts).

export type FrameFigMode = 'model' | ForceKey | 'D' | 'R'

const COLOR: Record<ForceKey | 'D', FigColor> = { M: 'm', V: 'v', N: 'y', D: 'accent' }

export interface FrameDim {
  text: string
  a: P2
  b: P2
  side: 'b' | 'l' | 'r'
}

export function frameFigure(v: FrameView, mode: FrameFigMode, caption: string, dims: FrameDim[] = []): Figure {
  const ops: FigOp[] = []
  const bx = frameBox(v)
  const bw = Math.max(1e-6, bx.x1 - bx.x0), bh = Math.max(1e-6, bx.y1 - bx.y0)
  const sc = Math.min(300 / bw, 130 / bh)
  const padT = mode === 'model' ? 46 : 34, padB = mode === 'model' ? 44 : mode === 'R' ? 50 : 26
  const H = bh * sc + padT + padB
  const { T } = fitFrame(v, { w: FIG_W, h: H, padL: 0, padR: 0, padT, padB })
  const N = v.nodes.map(T)
  const amp = 30 / sc

  for (const e of v.elems)
    ops.push({ t: 'line', x1: N[e.ni][0], y1: N[e.ni][1], x2: N[e.nj][0], y2: N[e.nj][1], lw: mode === 'model' ? 2.2 : 1.1, c: mode === 'model' ? 'ink' : 'muted' })
  for (const i of v.supports) {
    const [x, y] = N[i]
    if (v.fixed) {
      ops.push({ t: 'line', x1: x - 9, y1: y, x2: x + 9, y2: y, lw: 1.2, c: 'support' })
      for (let d = -9; d < 9; d += 4) ops.push({ t: 'line', x1: x + d, y1: y, x2: x + d + 3.5, y2: y + 4.5, lw: 0.6, c: 'support' })
    } else {
      ops.push({ t: 'poly', pts: [[x, y], [x - 6, y + 9], [x + 6, y + 9]], fill: true, c: 'support', op: 0.25 })
      ops.push({ t: 'poly', pts: [[x, y], [x - 6, y + 9], [x + 6, y + 9]], close: true, lw: 0.9, c: 'support' })
      ops.push({ t: 'line', x1: x - 9, y1: y + 9, x2: x + 9, y2: y + 9, lw: 0.9, c: 'support' })
    }
  }

  if (mode === 'model') {
    for (const [k, d] of v.loads.dist.entries()) {
      const a = T(d.a), b = T(d.b), hh = 16
      ops.push({ t: 'poly', pts: [a, [a[0], a[1] - 4 - hh], [b[0], b[1] - 4 - hh], b], fill: true, c: 'load', op: 0.12 })
      ops.push({ t: 'line', x1: a[0], y1: a[1] - 4 - hh, x2: b[0], y2: b[1] - 4 - hh, lw: 0.7, c: 'load' })
      const n = Math.max(3, Math.round(Math.abs(b[0] - a[0]) / 18))
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
        arrow(ops, x, y - 4 - hh, x, y - 2, { c: 'load', lw: 0.5, head: 3 })
      }
      if (k === 0) {
        const many = v.loads.dist.length > 1
        ops.push({ t: 'text', x: many ? b[0] : (a[0] + b[0]) / 2, y: many ? b[1] - hh - 9 : (a[1] + b[1]) / 2 + 11, s: d.label, size: 7, align: 'c', c: 'load', bold: true })
      }
    }
    for (const p of v.loads.points) {
      const [x, y] = T(p.at), up = p.P < 0
      if (up) arrow(ops, x, y + 30, x, y + 3, { c: 'load', lw: 1.4, head: 4.5 })
      else arrow(ops, x, y - 36, x, y - 3, { c: 'load', lw: 1.4, head: 4.5 })
      ops.push({ t: 'text', x, y: up ? y + 38 : y - 39, s: p.label, size: 6.5, align: 'c', c: 'load', bold: true })
    }
    const xs = v.nodes.map((n) => n[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2
    for (const l of v.loads.lateral) {
      const [x, y0] = T(l.at), out = l.at[0] <= cx ? -1 : 1, dir = l.H >= 0 ? 1 : -1, y = y0 - 7
      const far = x + out * 30, near = x + out * 3
      if (dir === -out) arrow(ops, far, y, near, y, { c: 'load', lw: 1.4, head: 4.5 })
      else arrow(ops, near, y, far, y, { c: 'load', lw: 1.4, head: 4.5 })
      ops.push({ t: 'text', x: far + out * 3, y: y + 2.5, s: l.label, size: 6.5, align: out < 0 ? 'r' : 'l', c: 'load', bold: true })
    }
    for (const d of dims) {
      const a = T(d.a), b = T(d.b)
      if (d.side === 'b') dimH(ops, a[0], b[0], Math.max(a[1], b[1]) + 24, d.text)
      else if (d.side === 'r') dimV(ops, Math.min(a[1], b[1]), Math.max(a[1], b[1]), Math.max(a[0], b[0]) + 22, d.text)
      else {
        const x = Math.min(a[0], b[0]) - 22
        dimV(ops, Math.min(a[1], b[1]), Math.max(a[1], b[1]), x, '')
        ops.push({ t: 'text', x: x - 6, y: (a[1] + b[1]) / 2 + 2.5, s: d.text, size: 7, align: 'r' })
      }
    }
  } else if (mode === 'M' || mode === 'V' || mode === 'N') {
    const c = COLOR[mode]
    for (const cv of forceCurves(v, mode, amp)) {
      const base = cv.base.map(T), curve = cv.curve.map(T)
      ops.push({ t: 'poly', pts: [...base, ...[...curve].reverse()], fill: true, c, op: 0.18 })
      ops.push({ t: 'poly', pts: curve, lw: 1.1, c })
      const val = cv.values[cv.ext]
      if (Math.abs(val) > 1e-6) {
        const q = curve[cv.ext], q0 = base[cv.ext]
        const dx = q[0] - q0[0], dy = q[1] - q0[1], len = Math.hypot(dx, dy) || 1
        ops.push({ t: 'circle', cx: q[0], cy: q[1], r: 1.8, fill: true, c })
        ops.push({
          t: 'text', x: q[0] + (dx / len) * 6, y: q[1] + (dy / len) * 6 + 2.5, s: fx(val, 2), size: 6.5, bold: true, c: 'ink',
          align: Math.abs(dx) < 1 ? 'c' : dx > 0 ? 'l' : 'r',
        })
      }
    }
  } else if (mode === 'D') {
    const mag = deformMag(v)
    for (const pts of deformedShape(v, mag)) ops.push({ t: 'poly', pts: pts.map(T), lw: 1.4, c: 'accent' })
    for (const l of v.deflLabels) {
      const [x, y] = T(deflPoint(v, l, mag))
      ops.push({ t: 'circle', cx: x, cy: y, r: 1.8, fill: true, c: 'accent' })
      ops.push({ t: 'text', x: x + (l.side === 'l' ? -4 : l.side === 'r' ? 4 : 0), y: y + (l.side === 'b' ? 9 : -4), s: l.text, size: 6.5, align: l.side === 'l' ? 'r' : l.side === 'r' ? 'l' : 'c', c: 'ink' })
    }
    ops.push({ t: 'text', x: FIG_W, y: H - 4, s: `skala deformasi ×${mag >= 10 ? Math.round(mag) : fx(mag, 1)}`, size: 6, align: 'r', c: 'muted' })
  } else {
    const maxR = Math.max(1e-9, ...v.reactions.flatMap((r) => [Math.abs(r.Rx), Math.abs(r.Ry)]))
    const len = (x: number) => 10 + 22 * (Math.abs(x) / maxR)
    v.supports.forEach((i, k) => {
      const r = v.reactions[k], [x, y] = N[i]
      const left = k === 0
      const yb = y + 12
      if (Math.abs(r.Ry) > 1e-6) {
        const l = len(r.Ry)
        if (r.Ry >= 0) arrow(ops, x, yb + l, x, yb, { c: 'v', lw: 1.3, head: 4 })
        else arrow(ops, x, yb, x, yb + l, { c: 'v', lw: 1.3, head: 4 })
      }
      if (Math.abs(r.Rx) > 1e-6) {
        const l = len(r.Rx)
        if (r.Rx >= 0) arrow(ops, x - l, y + 3, x - 2, y + 3, { c: 'v', lw: 1.3, head: 4 })
        else arrow(ops, x + l, y + 3, x + 2, y + 3, { c: 'v', lw: 1.3, head: 4 })
      }
      const tx = left ? x - 8 : x + 8, al = left ? 'r' : 'l'
      const lines = [`V = ${fx(r.Ry, 2)} kN`, `H = ${fx(r.Rx, 2)} kN`, ...(v.fixed ? [`M = ${fx(r.M, 2)} kN·m`] : [])]
      lines.forEach((s, j) => ops.push({ t: 'text', x: tx, y: yb + 10 + j * 9, s, size: 6.5, align: al, c: 'ink' }))
    })
  }

  return { h: figRows(H), ops, alt: caption, caption }
}
