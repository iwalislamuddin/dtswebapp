import type { FreeRoofResult, OpenFrameResult, WarehouseResult, WhSurface } from '../../calc/wind-load'
import { arrow, dimH, dimV, figRows } from '../../report/figure'
import { fx, type FigOp, type Figure } from '../../report/model'

// Gambar tipe struktur lain (gudang, atap bebas, rangka terbuka) — satu sumber untuk Preview (FigureSvg) dan laporan.
// Koordinat pt, lebar 528, y ke bawah. Panah tekanan: + menuju permukaan, − menjauhi permukaan.

/** Teks tekanan bertanda, mis. "+0.522" / "−0.400". */
export const sg = (n: number, dp = 3) => (n < 0 ? `−${fx(-n, dp)}` : `+${fx(n, dp)}`)

/** Koefisien dengan tanda minus tipografis, tanpa '+', mis. "−1.10" / "0.40". */
export const mn = (n: number, dp = 2) => (n < 0 ? `−${fx(-n, dp)}` : fx(n, dp))

function ground(ops: FigOp[], xa: number, xb: number, y: number) {
  ops.push({ t: 'line', x1: xa, y1: y, x2: xb, y2: y, lw: 1, c: 'muted' })
  const n = Math.max(2, Math.round((xb - xa) / 24))
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n
    ops.push({ t: 'line', x1: x, y1: y, x2: x - 6, y2: y + 6, lw: 0.4, c: 'muted' })
  }
}

/** Panah tekanan di titik (x, y) dengan normal luar satuan (nx, ny): + menuju permukaan, − menjauh. */
function pArrow(ops: FigOp[], x: number, y: number, nx: number, ny: number, p: number, len: number, c: 'load' | 'm' | 'v') {
  if (Math.abs(p) < 1e-9 || len < 1) return
  const a = 2, b = 2 + len
  if (p > 0) arrow(ops, x + nx * b, y + ny * b, x + nx * a, y + ny * a, { lw: 0.8, c, head: 3.5 })
  else arrow(ops, x + nx * a, y + ny * a, x + nx * b, y + ny * b, { lw: 0.8, c, head: 3.5 })
}

function windArrow(ops: FigOp[], x: number, y: number, label: string) {
  arrow(ops, x, y, x + 44, y, { lw: 1.6, c: 'ink' })
  ops.push({ t: 'text', x, y: y - 7, s: label, size: 7 })
}

/** Gudang: potongan (angin ⊥ bubungan, d = 0) atau tampak memanjang (∥ bubungan, d = 1), tekanan eksternal q·G·Cp kasus k. */
export function figWarehouse(r: WarehouseResult, d: 0 | 1, k: 0 | 1): Figure {
  const ops: FigOp[] = []
  const { S, Lb, he, theta } = r.inp
  const dir = r.dirs[d]
  const ext = (sf: WhSurface) => sf.q * r.inp.G * sf.Cp[k]
  const pMax = Math.max(0.01, ...dir.surfaces.map((sf) => Math.abs(ext(sf))))
  const ps = 34 / pMax
  const span = d === 0 ? S : Lb
  const sc = Math.min(230 / span, 105 / r.hr)
  const x0 = 170, x1 = x0 + span * sc, yG = 168
  const yE = yG - he * sc, yR = yG - r.hr * sc
  ground(ops, 70, Math.max(x1 + 80, 470), yG)
  const lab = (x: number, y: number, s: string, align: 'l' | 'c' | 'r', c: 'load' | 'm' | 'v') => ops.push({ t: 'text', x, y, s, size: 6.5, align, c })
  const wallArrows = (x: number, yTop: number, p: number, nx: number, c: 'load' | 'm') => {
    for (const f of [0.25, 0.5, 0.75]) pArrow(ops, x, yG - (yG - yTop) * f, nx, 0, p, Math.abs(p) * ps, c)
  }
  const wW = dir.surfaces[0], wL = dir.surfaces[dir.surfaces.length - 2]
  if (d === 0) {
    // potongan portal: dinding + dua lereng atap
    const xm = (x0 + x1) / 2
    ops.push({ t: 'poly', pts: [[x0, yG], [x0, yE], [xm, yR], [x1, yE], [x1, yG]], fill: true, c: 'support', op: 0.1 })
    ops.push({ t: 'poly', pts: [[x0, yG], [x0, yE], [xm, yR], [x1, yE], [x1, yG]], lw: 1.2, c: 'support' })
    wallArrows(x0, yE, ext(wW), -1, 'load')
    lab(x0 - 6, yE + 10, sg(ext(wW)), 'r', 'load')
    wallArrows(x1, yE, ext(wL), 1, 'm')
    lab(x1 + 6, yE + 10, sg(ext(wL)), 'l', 'm')
    const t = Math.tan((theta * Math.PI) / 180)
    const sn = Math.sin((theta * Math.PI) / 180), cs = Math.cos((theta * Math.PI) / 180)
    for (const sf of dir.surfaces) {
      if (sf.kind !== 'roof') continue
      const p = ext(sf), side = sf.side ?? -1
      const nx = side < 0 ? -sn : sn, ny = -cs
      const at = (xm_: number) => [x0 + xm_ * sc, yE - (xm_ <= S / 2 ? xm_ : S - xm_) * t * sc] as const
      const a = sf.x0!, b = sf.x1!, w = b - a
      const pts = w * sc > 40 ? [a + w / 4, a + w / 2, a + (3 * w) / 4] : [a + w / 2]
      for (const xx of pts) {
        const [px, py] = at(xx)
        pArrow(ops, px, py, nx, ny, p, Math.abs(p) * ps, side < 0 ? 'load' : 'm')
      }
      const [lx, ly] = at(a + w / 2)
      lab(lx + nx * (Math.abs(p) * ps + 9), ly + ny * (Math.abs(p) * ps + 9) + 2, sg(p), 'c', side < 0 ? 'load' : 'm')
    }
    dimH(ops, x0, x1, yG + 16, `S = ${fx(S, 1)} m`)
    dimV(ops, yE, yG, x1 + 62, `h_{e} = ${fx(he, 1)} m`)
    if (r.rise > 0.01) dimV(ops, yR, yE, x1 + 62, `${fx(r.rise, 2)} m (θ = ${fx(theta, 1)}°)`)
  } else {
    // tampak memanjang: ujung pelana windward (kiri) & leeward (kanan), atap per zona
    ops.push({ t: 'rect', x: x0, y: yR, w: x1 - x0, h: yG - yR, fill: true, c: 'support', op: 0.1 })
    ops.push({ t: 'rect', x: x0, y: yR, w: x1 - x0, h: yG - yR, lw: 1.2, c: 'support' })
    if (yE - yR > 2) ops.push({ t: 'line', x1: x0, y1: yE, x2: x1, y2: yE, lw: 0.6, c: 'support', dash: [3, 2] })
    wallArrows(x0, yR, ext(wW), -1, 'load')
    lab(x0 - 6, yR + 10, sg(ext(wW)), 'r', 'load')
    wallArrows(x1, yR, ext(wL), 1, 'm')
    lab(x1 + 6, yR + 10, sg(ext(wL)), 'l', 'm')
    for (const sf of dir.surfaces) {
      if (sf.kind !== 'roof') continue
      const p = ext(sf), a = sf.x0!, b = sf.x1!, w = b - a
      const n = Math.max(1, Math.min(4, Math.round((w * sc) / 22)))
      for (let i = 0; i < n; i++) pArrow(ops, x0 + (a + (w * (i + 0.5)) / n) * sc, yR, 0, -1, p, Math.abs(p) * ps, 'm')
      if (sf.x0! > 0) ops.push({ t: 'line', x1: x0 + a * sc, y1: yR - 3, x2: x0 + a * sc, y2: yR - 40, lw: 0.4, c: 'muted', dash: [2, 2] })
      lab(x0 + (a + w / 2) * sc, yR - Math.abs(p) * ps - 7, sg(p), 'c', 'm')
    }
    dimH(ops, x0, x1, yG + 16, `L_{b} = ${fx(Lb, 1)} m`)
    dimV(ops, yR, yG, x1 + 62, `h_{r} = ${fx(r.hr, 2)} m`)
  }
  windArrow(ops, 76, yG - (yG - (d === 0 ? yE : yR)) * 0.55, `V = ${fx(r.inp.V, 0)} m/s`)
  return {
    h: figRows(yG + 30),
    ops,
    alt: `Gudang atap pelana — ${dir.label.toLowerCase()}, tekanan eksternal kasus ${k + 1}`,
    caption: `${dir.label} — tekanan eksternal q G C_{p} kasus atap ${k + 1} (kPa; + menekan permukaan). Tekanan internal ±q_{h}(GC_{pi}) = ±${fx(r.qh * r.GCpi, 3)} kPa ditambahkan pada tiap permukaan.`,
  }
}

/** Atap bebas γ = 0°/180°: potongan dengan tekanan neto paruh windward/leeward (kasus A/B). */
export function figFreeRoof(r: FreeRoofResult, ci: number, lc: 'A' | 'B'): Figure {
  const ops: FigOp[] = []
  const { L, h, theta, shape, flow } = r.inp
  const c = r.cases[ci], ld = c[lc]
  const top = h + r.rise / 2
  const sc = Math.min(240 / L, 110 / top)
  const x0 = 150, x1 = x0 + L * sc, xm = (x0 + x1) / 2, yG = 160
  const Y = (z: number) => yG - z * sc
  ground(ops, 70, x1 + 90, yG)
  // monoslope γ = 0°: tepi tinggi di kiri (menghadap angin); γ = 180°: tepi rendah di kiri
  const hiLeft = shape === 'mono' && c.key === 'g0'
  const zL = shape === 'mono' ? (hiLeft ? h + r.rise / 2 : h - r.rise / 2) : h - r.rise / 2
  const zR = shape === 'mono' ? (hiLeft ? h - r.rise / 2 : h + r.rise / 2) : h - r.rise / 2
  const zM = shape === 'mono' ? h : h + r.rise / 2
  const pts: [number, number][] = [[x0, Y(zL)], [xm, Y(zM)], [x1, Y(zR)]]
  // kolom
  for (const [x, y] of [pts[0], pts[2]]) ops.push({ t: 'line', x1: x, y1: yG, x2: x, y2: y, lw: 1.1, c: 'support' })
  if (shape === 'pitched') ops.push({ t: 'line', x1: xm, y1: yG, x2: xm, y2: Y(zM), lw: 0.6, c: 'support', dash: [3, 2] })
  ops.push({ t: 'poly', pts, lw: 1.8, c: 'support' })
  if (flow === 'obstructed') {
    ops.push({ t: 'rect', x: x0 + 0.12 * (x1 - x0), y: yG - 0.45 * (Y(0) - Y(Math.min(zL, zR))), w: 0.76 * (x1 - x0), h: 0.45 * (Y(0) - Y(Math.min(zL, zR))), fill: true, c: 'muted', op: 0.18 })
    ops.push({ t: 'text', x: xm, y: yG - 4, s: 'barang/penghalang > 50%', size: 6, align: 'c', c: 'muted' })
  }
  const ps = 34 / Math.max(0.01, Math.abs(ld.pW), Math.abs(ld.pL))
  const half = (a: [number, number], b: [number, number], p: number, col: 'load' | 'm', label: string) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    // normal sisi atas (ke atas)
    let nx = -dy / len, ny = dx / len
    if (ny > 0) { nx = -nx; ny = -ny }
    for (const f of [0.2, 0.5, 0.8]) pArrow(ops, a[0] + dx * f, a[1] + dy * f, nx, ny, p, Math.abs(p) * ps, col)
    const off = Math.abs(p) * ps + 10
    ops.push({ t: 'text', x: a[0] + dx * 0.5 + nx * off, y: a[1] + dy * 0.5 + ny * off, s: `${label} ${sg(p)}`, size: 6.5, align: 'c', c: col })
  }
  half(pts[0], pts[1], ld.pW, 'load', `C_{NW} ${mn(ld.CNW)} →`)
  half(pts[1], pts[2], ld.pL, 'm', `C_{NL} ${mn(ld.CNL)} →`)
  dimH(ops, x0, x1, yG + 16, `L = ${fx(L, 1)} m`)
  dimV(ops, Y(h), yG, x1 + 56, `h = ${fx(h, 2)} m`)
  windArrow(ops, 76, Y(h * 0.55), `V = ${fx(r.inp.V, 0)} m/s`)
  return {
    h: figRows(yG + 30),
    ops,
    alt: `Atap bebas ${shape === 'mono' ? 'monoslope' : 'pelana'} — ${c.label}, kasus ${lc}`,
    caption: `${c.label}, kasus ${lc}, aliran ${flow === 'clear' ? 'bersih' : 'terhalang'}, θ = ${fx(theta, 1)}° — tekanan neto p = q_{h} G C_{N} (kPa; + menekan sisi atas atap).`,
  }
}

/** Atap bebas γ = 90° (angin sejajar bubungan): tampak memanjang dengan zona dari tepi windward. */
export function figFreeRoof90(r: FreeRoofResult, lc: 'A' | 'B'): Figure {
  const ops: FigOp[] = []
  const { B, h } = r.inp
  const sc = Math.min(300 / B, 90 / h)
  const x0 = 130, x1 = x0 + B * sc, yG = 150, yR = yG - h * sc
  ground(ops, 70, x1 + 60, yG)
  ops.push({ t: 'line', x1: x0, y1: yR, x2: x1, y2: yR, lw: 1.8, c: 'support' })
  for (const x of [x0, x1]) ops.push({ t: 'line', x1: x, y1: yG, x2: x, y2: yR, lw: 1.1, c: 'support' })
  const ps = 34 / Math.max(0.01, ...r.zones.map((z) => Math.abs(lc === 'A' ? z.pA : z.pB)))
  for (const z of r.zones) {
    const p = lc === 'A' ? z.pA : z.pB, w = z.x1 - z.x0
    const n = Math.max(1, Math.min(5, Math.round((w * sc) / 22)))
    for (let i = 0; i < n; i++) pArrow(ops, x0 + (z.x0 + (w * (i + 0.5)) / n) * sc, yR, 0, -1, p, Math.abs(p) * ps, 'm')
    if (z.x0 > 0) ops.push({ t: 'line', x1: x0 + z.x0 * sc, y1: yR + 3, x2: x0 + z.x0 * sc, y2: yG, lw: 0.4, c: 'muted', dash: [2, 2] })
    ops.push({ t: 'text', x: x0 + (z.x0 + w / 2) * sc, y: yR - Math.abs(p) * ps - 8, s: `${mn(lc === 'A' ? z.CNA : z.CNB)} → ${sg(p)}`, size: 6.5, align: 'c', c: 'm' })
    ops.push({ t: 'text', x: x0 + (z.x0 + w / 2) * sc, y: yR + 10, s: `${fx(z.x0, 1)}–${fx(z.x1, 1)} m`, size: 6, align: 'c', c: 'muted' })
  }
  dimH(ops, x0, x1, yG + 16, `B = ${fx(B, 1)} m (sejajar bubungan)`)
  dimV(ops, yR, yG, x1 + 30, `h = ${fx(h, 2)} m`)
  windArrow(ops, 70, yG - (yG - yR) * 0.55, `V = ${fx(r.inp.V, 0)} m/s`)
  return {
    h: figRows(yG + 30),
    ops,
    alt: `Atap bebas — angin sejajar bubungan γ = 90°, kasus ${lc}`,
    caption: `γ = 90° (sejajar bubungan), kasus ${lc} — C_{N} → p = q_{h} G C_{N} (kPa) per zona jarak dari tepi windward (≤ h, h–2h, > 2h).`,
  }
}

/** Rangka terbuka: tampak dengan beban garis w(z) = q_z G C_f ε b dan resultan F. */
export function figOpenFrame(r: OpenFrameResult): Figure {
  const ops: FigOp[] = []
  const { b, z1, z2, kind, eps } = r.inp
  const yG = 168, sc = 140 / z2
  const fw = Math.max(18, Math.min(120, b * sc))
  const x0 = 250, x1 = x0 + fw
  const Y = (z: number) => yG - z * sc
  ground(ops, 70, 470, yG)
  // rangka + bresing silang per panel
  ops.push({ t: 'rect', x: x0, y: Y(z2), w: fw, h: (z2 - z1) * sc, lw: 1.1, c: 'support' })
  const nP = Math.max(1, Math.round(((z2 - z1) * sc) / Math.max(fw, 14)))
  for (let i = 0; i < nP; i++) {
    const ya = Y(z1 + ((z2 - z1) * i) / nP), yb = Y(z1 + ((z2 - z1) * (i + 1)) / nP)
    ops.push({ t: 'line', x1: x0, y1: ya, x2: x1, y2: yb, lw: 0.5, c: 'support' })
    ops.push({ t: 'line', x1: x1, y1: ya, x2: x0, y2: yb, lw: 0.5, c: 'support' })
    ops.push({ t: 'line', x1: x0, y1: yb, x2: x1, y2: yb, lw: 0.5, c: 'support' })
  }
  if (z1 > 0) for (const x of [x0, x1]) ops.push({ t: 'line', x1: x, y1: yG, x2: x, y2: Y(z1), lw: 0.8, c: 'support', dash: [3, 2] })
  // profil w(z)
  const wMax = Math.max(0.001, ...r.seg.map((s) => s.w))
  const ws = 90 / wMax
  const xw = (w: number) => x0 - 4 - w * ws
  const first = r.seg[0], last = r.seg[r.seg.length - 1]
  const pts: [number, number][] = [[x0, Y(z1)], [xw(first.w), Y(z1)], ...r.seg.map((s): [number, number] => [xw(s.w), Y(s.z)]), [xw(last.w), Y(z2)], [x0, Y(z2)]]
  ops.push({ t: 'poly', pts, close: true, fill: true, c: 'load', op: 0.18 })
  ops.push({ t: 'poly', pts: pts.slice(1, -1), lw: 0.9, c: 'load' })
  for (const f of [0.15, 0.5, 0.85]) {
    const z = z1 + (z2 - z1) * f, s = r.seg[Math.min(r.seg.length - 1, Math.floor(f * r.seg.length))]
    arrow(ops, x0 - 4 - s.w * ws, Y(z), x0 - 3, Y(z), { lw: 0.8, c: 'load', head: 3.5 })
  }
  const wTop = r.seg[r.seg.length - 1].w
  ops.push({ t: 'text', x: x0 - 8, y: Y(z2) - 6, s: `w = q_{z} G C_{f} ε b = ${fx(wTop, 3)} kN/m (puncak)`, size: 6.5, align: 'r', c: 'load' })
  // resultan
  const zF = r.M / r.F
  arrow(ops, x1 + 50, Y(zF), x1 + 6, Y(zF), { lw: 1.4, c: 'v' })
  ops.push({ t: 'text', x: x1 + 54, y: Y(zF) + 2.5, s: `F = ${fx(r.Fn, 1)} kN @ z ≈ ${fx(zF, 1)} m`, size: 7, c: 'v' })
  dimV(ops, Y(z2), Y(z1), x1 + 175, `${fx(z1, 1)}–${fx(z2, 1)} m`)
  ops.push({ t: 'text', x: (x0 + x1) / 2, y: yG + 12, s: `b = ${fx(b, 2)} m, ε = ${fx(eps, 2)}`, size: 7, align: 'c' })
  windArrow(ops, 76, Y((z1 + z2) / 2) - 30, `V = ${fx(r.inp.V, 0)} m/s`)
  return {
    h: figRows(yG + 24),
    ops,
    alt: kind === 'plane' ? 'Rangka bidang terbuka dengan beban angin' : 'Menara rangka dengan beban angin',
    caption: `${kind === 'plane' ? 'Rangka bidang terbuka' : 'Menara rangka (angin tegak lurus muka)'} — beban garis w(z) dari 20 segmen, C_{f} = ${fx(r.Cf, 3)}.`,
  }
}
