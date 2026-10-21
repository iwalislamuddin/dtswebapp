import type { CapFlexure, CapOneWay, PileCapResult, PilePosition } from '../../calc/pile-cap'
import { dimH, dimV, FIG_W, figRows } from '../../report/figure'
import { check, fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { CAP_DEFAULTS, computePileCapUI, type PileCapUIInput } from './model'

// Laporan Desain Pile Cap (SNI 2847:2019): reaksi tiang, lentur di muka kolom, geser satu arah, geser pons kolom
// dan pons tiang — dengan rumus dan substitusi.

export { CAP_DEFAULTS }

/** Gbr. 1 — denah poer: tiang (reaksi), kolom, keliling pons kolom. */
function figPlan(r: PileCapResult): Figure {
  const ops: FigOp[] = []
  const Lx = r.Lx!, Ly = r.Ly!
  const sc = Math.min(280 / Lx, 170 / Ly)
  const W = Lx * sc, H = Ly * sc
  const cx = 264, cy = 14 + H / 2
  const mx = (r.xlo! + r.xhi!) / 2, my = (r.ylo! + r.yhi!) / 2
  const X = (v: number) => cx + (v - mx) * sc
  const Y = (v: number) => cy - (v - my) * sc
  const outline = r.poly!.map((q) => [X(q.x), Y(q.y)] as [number, number])
  ops.push({ t: 'poly', pts: outline, close: true, fill: true, c: 'support', op: 0.1 })
  ops.push({ t: 'poly', pts: outline, close: true, lw: 1, c: 'support' })
  r.piles!.forEach((p, i) => {
    const bad = r.R![i] < 0
    ops.push({ t: 'circle', cx: X(p.x), cy: Y(p.y), r: (r.dp! / 2) * sc, fill: true, c: bad ? 'bad' : 'm', op: 0.25 })
    ops.push({ t: 'circle', cx: X(p.x), cy: Y(p.y), r: (r.dp! / 2) * sc, lw: 0.8, c: bad ? 'bad' : 'm' })
    ops.push({ t: 'text', x: X(p.x), y: Y(p.y) + 2.5, s: `${i + 1}`, size: 7, align: 'c', bold: true })
  })
  ops.push({ t: 'rect', x: X(-r.cx! / 2), y: Y(r.cy! / 2), w: r.cx! * sc, h: r.cy! * sc, fill: true, c: 'ink', op: 0.35 })
  ops.push({ t: 'line', x1: X(r.xc!) - 3, y1: Y(r.yc!), x2: X(r.xc!) + 3, y2: Y(r.yc!), lw: 0.8, c: 'load' })
  ops.push({ t: 'line', x1: X(r.xc!), y1: Y(r.yc!) - 3, x2: X(r.xc!), y2: Y(r.yc!) + 3, lw: 0.8, c: 'load' })
  const bx = r.punchCol!.bx, by = r.punchCol!.by
  ops.push({ t: 'rect', x: X(-bx / 2), y: Y(by / 2), w: bx * sc, h: by * sc, lw: 0.6, c: 'y', dash: [3, 2] })
  ops.push({ t: 'text', x: cx + W / 2 + 6, y: cy - H / 2 + 8, s: `${fx(Lx, 0)} × ${fx(Ly, 0)} mm`, size: 7, c: 'muted' })
  return {
    h: figRows(cy + H / 2 + 12),
    ops,
    alt: 'Denah pile cap dengan susunan tiang',
    caption: `Gbr. 1 — Denah poer ${r.shape === 'poligon' ? 'poligon (kotak batas ' : ''}${fx(Lx, 0)} × ${fx(Ly, 0)} mm${r.shape === 'poligon' ? ')' : ''}: ${r.n} tiang D${fx(r.dp, 0)} (bernomor), kolom ${fx(r.cx, 0)} × ${fx(r.cy, 0)} mm, titik berat kelompok tiang (+ merah), dan keliling kritis pons kolom (putus-putus).`,
  }
}

/** Rentang [min, max] potongan garis x = c (axis 'x', hasil rentang y) atau y = c (axis 'y', hasil rentang x) dengan poligon cembung. */
function spanAt(poly: PilePosition[], axis: 'x' | 'y', c: number): [number, number] | null {
  const hits: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const [a1, a2, b1, b2] = axis === 'x' ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x]
    if ((a1 - c) * (b1 - c) <= 0 && a1 !== b1) hits.push(a2 + ((c - a1) / (b1 - a1)) * (b2 - a2))
  }
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null
}

/** Posisi batang (mm) berspasi ≈ s, terpusat dan merata di [lo, hi]; minimal 2 batang. */
function barPositions(lo: number, hi: number, s: number): number[] {
  const L = hi - lo
  if (!(L > 0)) return []
  const n = s > 0 ? Math.max(2, Math.round(L / s) + 1) : 2
  return Array.from({ length: n }, (_, k) => lo + (k * L) / (n - 1))
}

/** Gbr. 2 — denah tulangan bawah dua arah, garis potongan A–A dan B–B. */
function figRebarPlan(r: PileCapResult): Figure {
  const ops: FigOp[] = []
  const Lx = r.Lx!, Ly = r.Ly!, cov = r.cov!, db = r.db!
  const sc = Math.min(250 / Lx, 170 / Ly)
  const W = Lx * sc, H = Ly * sc
  const cx = 200, cy = 24 + H / 2
  const mx = (r.xlo! + r.xhi!) / 2, my = (r.ylo! + r.yhi!) / 2
  const X = (v: number) => cx + (v - mx) * sc
  const Y = (v: number) => cy - (v - my) * sc
  const outline = r.poly!.map((q) => [X(q.x), Y(q.y)] as [number, number])
  ops.push({ t: 'poly', pts: outline, close: true, fill: true, c: 'support', op: 0.08 })
  ops.push({ t: 'poly', pts: outline, close: true, lw: 1, c: 'support' })
  r.piles!.forEach((p) => ops.push({ t: 'circle', cx: X(p.x), cy: Y(p.y), r: (r.dp! / 2) * sc, lw: 0.5, c: 'muted' }))
  const lw = Math.max(0.6, Math.min(1.8, db * sc))
  const fX = r.flexX!, fY = r.flexY!
  // tulangan arah X (garis mendatar) tersebar sepanjang Y; arah Y (garis tegak) tersebar sepanjang X
  const ysX = barPositions(r.ylo! + cov, r.yhi! - cov, fX.spacing)
  const xsY = barPositions(r.xlo! + cov, r.xhi! - cov, fY.spacing)
  const drawX = () => ysX.forEach((y) => {
    const s = spanAt(r.poly!, 'y', y)
    if (s && s[1] - s[0] > 2 * cov) ops.push({ t: 'line', x1: X(s[0] + cov), y1: Y(y), x2: X(s[1] - cov), y2: Y(y), lw, c: 'y' })
  })
  const drawY = () => xsY.forEach((x) => {
    const s = spanAt(r.poly!, 'x', x)
    if (s && s[1] - s[0] > 2 * cov) ops.push({ t: 'line', x1: X(x), y1: Y(s[0] + cov), x2: X(x), y2: Y(s[1] - cov), lw, c: 'm' })
  })
  // lapis dalam digambar dulu, lapis luar (paling bawah) di atasnya
  if (r.xOuter) { drawY(); drawX() } else { drawX(); drawY() }
  ops.push({ t: 'rect', x: X(-r.cx! / 2), y: Y(r.cy! / 2), w: r.cx! * sc, h: r.cy! * sc, fill: true, c: 'ink', op: 0.3 })
  ops.push({ t: 'rect', x: X(-r.cx! / 2), y: Y(r.cy! / 2), w: r.cx! * sc, h: r.cy! * sc, lw: 0.8, c: 'ink' })
  // garis potongan A–A (sepanjang X, melalui pusat kolom) dan B–B (sepanjang Y)
  const cut = (x1: number, y1: number, x2: number, y2: number) => ops.push({ t: 'line', x1, y1, x2, y2, lw: 0.6, c: 'accent', dash: [6, 2, 1.5, 2] })
  const tag = (x: number, y: number, s: string) => ops.push({ t: 'text', x, y, s, size: 7.5, bold: true, align: 'c', c: 'accent' })
  cut(cx - W / 2 - 10, Y(0), cx + W / 2 + 10, Y(0))
  tag(cx - W / 2 - 16, Y(0) + 2.5, 'A')
  tag(cx + W / 2 + 16, Y(0) + 2.5, 'A')
  cut(X(0), cy - H / 2 - 10, X(0), cy + H / 2 + 10)
  tag(X(0), cy - H / 2 - 13, 'B')
  tag(X(0), cy + H / 2 + 19, 'B')
  // label dengan garis penuntun
  const lx = cx + W / 2 + 34
  const yX = ysX[ysX.length - 1], xY = xsY[xsY.length - 1]
  const sxX = spanAt(r.poly!, 'y', yX), sxY = spanAt(r.poly!, 'x', xY)
  const tX = cy - H / 2 + 6, tY = tX + 24
  if (sxX) ops.push({ t: 'line', x1: lx - 3, y1: tX - 2.5, x2: X(sxX[1] - cov), y2: Y(yX), lw: 0.4, c: 'y' })
  ops.push({ t: 'text', x: lx, y: tX, s: `Arah X: ${fX.nBar} D${fx(db, 0)} @ ${fx(fX.spacing, 0)} mm`, size: 7, c: 'y', bold: true })
  ops.push({ t: 'text', x: lx, y: tX + 9, s: `lapis ${r.xOuter ? 'luar (terbawah)' : 'dalam'}, d = ${fx(r.dx, 0)} mm`, size: 6.5, c: 'muted' })
  if (sxY) ops.push({ t: 'line', x1: lx - 3, y1: tY - 2.5, x2: X(xY), y2: Y(sxY[1] - cov), lw: 0.4, c: 'm' })
  ops.push({ t: 'text', x: lx, y: tY, s: `Arah Y: ${fY.nBar} D${fx(db, 0)} @ ${fx(fY.spacing, 0)} mm`, size: 7, c: 'm', bold: true })
  ops.push({ t: 'text', x: lx, y: tY + 9, s: `lapis ${r.xOuter ? 'dalam' : 'luar (terbawah)'}, d = ${fx(r.dy, 0)} mm`, size: 6.5, c: 'muted' })
  dimH(ops, cx - W / 2, cx + W / 2, cy + H / 2 + 32, `${fx(Lx, 0)} mm`)
  return {
    h: figRows(cy + H / 2 + 38),
    ops,
    alt: 'Denah penulangan bawah pile cap dua arah',
    caption: `Gbr. 2 — Denah tulangan bawah dua arah D${fx(db, 0)}, selimut ${fx(cov, 0)} mm: arah X (merah) dan arah Y (biru) pada spasi hasil hitungan, dipasang merata selebar poer${r.shape === 'poligon' ? ' dan dipotong mengikuti tepi poligon' : ''}. Jumlah batang dihitung pada lebar penampang di muka kolom. A–A dan B–B: potongan pada Gbr. 3.`,
  }
}

/** Gbr. 3 — potongan A–A (sepanjang X) dan B–B (sepanjang Y): poer, kolom, kepala tiang, tulangan bawah berkait. */
function figRebarSections(r: PileCapResult): Figure {
  const ops: FigOp[] = []
  const h = r.h!, cov = r.cov!, db = r.db!
  const colH = Math.min(0.6 * h, 500), pileH = Math.max(0.5 * h, 300)
  const sA = spanAt(r.poly!, 'y', 0) ?? [r.xlo!, r.xhi!]
  const sB = spanAt(r.poly!, 'x', 0) ?? [r.ylo!, r.yhi!]
  const gap = 50, xA = 44
  const sc = Math.min((FIG_W - xA - 10 - gap) / (sA[1] - sA[0] + sB[1] - sB[0]), 150 / (colH + h + pileH))
  const yTop = 22 + colH * sc, yb = yTop + h * sc, yPile = yb + pileH * sc
  const lw = Math.max(1, Math.min(2.2, db * sc))
  const dotR = Math.max(1.2, Math.min(2.2, (db / 2) * sc))
  const zOut = cov + db / 2, zIn = cov + 1.5 * db
  const one = (x0: number, lo: number, hi: number, along: 'x' | 'y', title: string) => {
    const X = (v: number) => x0 + (v - lo) * sc
    const Z = (z: number) => yb - z * sc
    const c0 = along === 'x' ? r.cx! : r.cy!
    // tiang terpotong (pusat dalam D/2 dari bidang potong) diarsir; tiang di belakang bidang potong putus-putus
    r.piles!.forEach((p) => {
      const u = along === 'x' ? p.x : p.y, w = along === 'x' ? p.y : p.x
      const box = { x: X(u - r.dp! / 2), y: yb, w: r.dp! * sc, h: pileH * sc }
      if (Math.abs(w) <= r.dp! / 2) {
        ops.push({ t: 'rect', ...box, fill: true, c: 'muted', op: 0.18 })
        ops.push({ t: 'rect', ...box, lw: 0.7, c: 'muted' })
      } else ops.push({ t: 'rect', ...box, lw: 0.5, c: 'muted', dash: [3, 2] })
    })
    ops.push({ t: 'line', x1: X(lo) - 6, y1: yPile, x2: X(hi) + 6, y2: yPile, lw: 0.4, c: 'grid', dash: [2, 2] })
    ops.push({ t: 'rect', x: X(lo), y: yTop, w: (hi - lo) * sc, h: h * sc, fill: true, c: 'support', op: 0.12 })
    ops.push({ t: 'rect', x: X(lo), y: yTop, w: (hi - lo) * sc, h: h * sc, lw: 1, c: 'support' })
    ops.push({ t: 'rect', x: X(-c0 / 2), y: yTop - colH * sc, w: c0 * sc, h: colH * sc, fill: true, c: 'ink', op: 0.25 })
    ops.push({ t: 'rect', x: X(-c0 / 2), y: yTop - colH * sc, w: c0 * sc, h: colH * sc, lw: 0.8, c: 'ink' })
    // batang sejajar bidang potong: garis + kait 90° ke atas di kedua ujung (skematik)
    const parOuter = along === 'x' ? r.xOuter! : !r.xOuter
    const zPar = parOuter ? zOut : zIn, zPerp = parOuter ? zIn : zOut
    const cPar = along === 'x' ? 'y' : 'm', cPerp = along === 'x' ? 'm' : 'y'
    const zHook = h - cov
    ops.push({ t: 'poly', pts: [[X(lo + cov), Z(zHook)], [X(lo + cov), Z(zPar)], [X(hi - cov), Z(zPar)], [X(hi - cov), Z(zHook)]], lw, c: cPar })
    // batang tegak lurus bidang potong: titik pada spasi hasil hitungan
    const fPerp = along === 'x' ? r.flexY! : r.flexX!
    barPositions(lo + cov + db, hi - cov - db, fPerp.spacing).forEach((u) => ops.push({ t: 'circle', cx: X(u), cy: Z(zPerp), r: dotR, fill: true, c: cPerp }))
    dimH(ops, X(lo), X(hi), yPile + 14, fx(hi - lo, 0))
    ops.push({ t: 'text', x: (X(lo) + X(hi)) / 2, y: 10, s: title, size: 7.5, bold: true, align: 'c', c: 'accent' })
  }
  one(xA, sA[0], sA[1], 'x', 'Potongan A–A (arah X)')
  one(xA + (sA[1] - sA[0]) * sc + gap, sB[0], sB[1], 'y', 'Potongan B–B (arah Y)')
  dimV(ops, yTop, yb, xA - 10, '')
  ops.push({ t: 'text', x: xA - 14, y: (yTop + yb) / 2 + 2.5, s: `h ${fx(h, 0)}`, size: 7, align: 'r' })
  return {
    h: figRows(yPile + 22),
    ops,
    alt: 'Potongan pile cap dengan tulangan bawah dua arah',
    caption: 'Gbr. 3 — Potongan melalui pusat kolom (mm). Tulangan arah X merah, arah Y biru: batang sejajar bidang potong berupa garis, yang tegak lurus berupa titik. Kait 90° ke atas di ujung batang skematik (panjang penyaluran belum diperiksa). Tiang terpotong diarsir, tiang di belakang bidang potong putus-putus.',
  }
}

function flexBlocks(f: CapFlexure, axis: 'X' | 'Y', r: PileCapResult): Block[] {
  const steps: CalcStep[] = [
    { desc: `Penampang di muka kolom (x = ±${fx(f.face, 0)} mm), lebar b = ${fx(f.b, 0)} mm`, lhs: 'M_{u}', expr: 'Σ R_{i}(x_{i} − muka kolom)', subst: `sisi + ${fx(f.Mp / 1000, 1)}; sisi − ${fx(f.Mm / 1000, 1)}`, value: fx(f.Mu / 1000, 1), unit: 'kN·m' },
    { lhs: 'd', expr: (axis === 'X') === r.xOuter ? 'h − selimut − d_{b}/2' : 'h − selimut − 1.5 d_{b}', value: fx(f.d, 1), unit: 'mm' },
    { lhs: 'R_{n}', expr: '\\frac{M_{u}}{φ b d^{2}}', subst: `\\frac{${fx(f.Mu / 1000, 1)} × 10^{6}}{0.9 × ${fx(f.b, 0)} × ${fx(f.d, 1)}^{2}}`, value: fx(f.Rn, 3), unit: 'MPa' },
    { lhs: 'A_{s,perlu}', expr: `ρ b d`, subst: f.over ? 'penampang tidak cukup' : `${fx(f.rho, 5)} × ${fx(f.b, 0)} × ${fx(f.d, 1)}`, value: f.over ? '∞' : fx(f.AsReq, 0), unit: 'mm²' },
    { lhs: 'A_{s,min}', expr: 'ρ_{min} b h', subst: `${fx(f.rhoMin, 5)} × ${fx(f.b, 0)} × ${fx(r.h, 0)}`, value: fx(f.AsMin, 0), unit: 'mm²', ref: '24.4.3.2' },
    { desc: `Jumlah batang D${fx(r.db, 0)} (minimum 2)`, lhs: 'n', expr: '\\frac{A_{s}}{A_{b}}', value: String(f.nBar) },
    { lhs: 'A_{s,pasang}', expr: 'n · \\frac{π d_{b}^{2}}{4}', value: fx(f.AsProv, 0), unit: 'mm²' },
    { lhs: 'a', expr: "\\frac{A_{s} f_{y}}{0.85 f'_{c} b}", value: fx(f.a, 1), unit: 'mm' },
    { lhs: 'φM_{n}', expr: 'φ A_{s} f_{y}(d − \\frac{a}{2})', value: fx(f.phiMn, 1), unit: 'kN·m' },
  ]
  return [
    { k: 'calc', steps },
    {
      k: 'rows',
      rows: [
        ...(f.side ? [kv('Sisi penentu / lebar penampang b', `sisi ${f.side === '+' ? '+' : '−'} / ${fx(f.b, 0)} mm (potongan poligon di muka kolom)`)] : []),
        kv('Spasi antar batang / batas (3h; 450)', `${fx(f.spacing, 0)} mm / ${fx(f.sMax, 0)} mm`),
        check('M_{u} / φM_{n}', f.dc),
      ],
    },
  ]
}

function oneWayBlock(v: CapOneWay, label: string, poligon: boolean): Block[] {
  return [
    {
      k: 'calc',
      steps: [
        { desc: `Penampang kritis ${fx(v.crit, 0)} mm dari pusat (d dari muka kolom), lebar b = ${fx(v.b, 0)} mm${poligon ? ' (potongan poligon, sisi penentu)' : ''}`, lhs: 'V_{u}', expr: 'Σ fraksi R_{i} di luar penampang', value: fx(v.Vu, 1), unit: 'kN' },
        { lhs: 'φV_{c}', expr: "φ · 0.17 √(f'_{c}) b d", subst: `0.75 × 0.17 × √f'_{c} × ${fx(v.b, 0)} × ${fx(v.d, 1)} / 10^{3}`, value: fx(v.phiVc, 1), unit: 'kN', ref: '22.5.5.1' },
      ],
    },
    { k: 'rows', rows: [check(`V_{u} / φV_{c} — ${label}`, v.dc)] },
  ]
}

export function pileCapReport(r: PileCapResult): Report {
  const fc = fx(r.fc, 0)
  const R = r.R!
  const pc = r.punchCol!, pp = r.punchPile!
  const reactionSteps: CalcStep[] =
    r.mode === 'kapasitas'
      ? [{ desc: 'Mode desain kapasitas: tiap tiang dibebani kapasitas terfaktor', lhs: 'R_{i}', expr: 'Q', value: fx(r.Q, 1), unit: 'kN' }]
      : [
          { desc: 'Titik berat kelompok tiang terhadap pusat kolom', lhs: 'x̄ ; ȳ', expr: '\\frac{Σ x_{i}}{n} ; \\frac{Σ y_{i}}{n}', value: `${fx(r.xc, 1)} ; ${fx(r.yc, 1)}`, unit: 'mm' },
          { desc: 'Momen inersia kelompok terhadap titik berat', lhs: 'ΣX^{2} ; ΣY^{2} ; ΣXY', expr: 'Σ(x_{i} − x̄)^{2} ; Σ(y_{i} − ȳ)^{2} ; Σ(x_{i} − x̄)(y_{i} − ȳ)', value: `${fx(r.Sx2! / 1e6, 3)} ; ${fx(r.Sy2! / 1e6, 3)} ; ${fx(r.Sxy! / 1e6, 3)}`, unit: 'm²' },
          { desc: 'Pu di pusat kolom berjarak (x̄, ȳ) dari titik berat → momen tambahan', lhs: 'M_{uy,c} ; M_{ux,c}', expr: 'M_{uy} − P_{u} x̄ ; M_{ux} − P_{u} ȳ', value: `${fx(r.Muy! - (r.Pu! * r.xc!) / 1000, 1)} ; ${fx(r.Mux! - (r.Pu! * r.yc!) / 1000, 1)}`, unit: 'kN·m' },
          { desc: 'ΣXY ≠ 0 → sistem 2×2 penuh', lhs: 'R_{i}', expr: '\\frac{P_{u}}{n} + \\frac{M_{uy,c} x_{i}}{ΣX^{2}} + \\frac{M_{ux,c} y_{i}}{ΣY^{2}}', subst: `P_{u} = ${fx(r.Pu, 1)} kN; x_{i}, y_{i} dari titik berat`, value: `${fx(r.Rmax, 1)} (maks)`, unit: 'kN' },
        ]
  const sections: Section[] = [
    {
      title: 'Data & geometri poer',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Beban', r.mode === 'kapasitas' ? `Kapasitas terfaktor Q = ${fx(r.Q, 1)} kN per tiang` : `P_{u} ${fx(r.Pu, 1)} kN, M_{ux} ${fx(r.Mux, 1)}, M_{uy} ${fx(r.Muy, 1)} kN·m`),
            kv('Tiang', `${r.n} buah D${fx(r.dp, 0)} (koordinat pada tabel), overhang ${fx(r.ov, 0)} mm`),
            kv(r.shape === 'poligon' ? 'Poer poligon, kotak batas × h' : 'Poer L_{x} × L_{y} × h', `${fx(r.Lx, 0)} × ${fx(r.Ly, 0)} × ${fx(r.h, 0)} mm`),
            kv('Kolom c_{x} × c_{y}', `${fx(r.cx, 0)} × ${fx(r.cy, 0)} mm`),
            kv("f'_{c} / f_{y} / selimut / tulangan", `${fc} / ${fx(r.fy, 0)} MPa / ${fx(r.cov, 0)} mm / D${fx(r.db, 0)}`),
          ],
        },
        {
          k: 'calc',
          steps: [
            { desc: `Lapis luar ke arah ${r.xOuter ? 'X' : 'Y'} (kantilever terbesar)`, lhs: 'd_{x}', value: fx(r.dx, 1), unit: 'mm' },
            { lhs: 'd_{y}', value: fx(r.dy, 1), unit: 'mm' },
          ],
        },
        { k: 'figure', fig: figPlan(r) },
      ],
    },
    {
      title: 'Reaksi tiang',
      blocks: [
        { k: 'p', text: 'Poer dianggap kaku; gaya tiang didistribusikan dengan rumus kelompok tiang elastis (tiang identik).' },
        { k: 'calc', steps: reactionSteps },
        {
          k: 'table',
          head: ['Tiang', 'x (mm)', 'y (mm)', 'R (kN)'],
          align: ['c', 'r', 'r', 'r'],
          rows: r.piles!.map((p, i) => [String(i + 1), fx(p.x, 0), fx(p.y, 0), fx(R[i], 1)]),
        },
      ],
    },
    { title: 'Lentur arah X', blocks: flexBlocks(r.flexX!, 'X', r) },
    { title: 'Lentur arah Y', blocks: flexBlocks(r.flexY!, 'Y', r) },
    { title: 'Skema penulangan', blocks: [{ k: 'figure', fig: figRebarPlan(r) }, { k: 'figure', fig: figRebarSections(r) }] },
    { title: 'Geser satu arah', blocks: [...oneWayBlock(r.vx!, 'arah X', r.shape === 'poligon'), ...oneWayBlock(r.vy!, 'arah Y', r.shape === 'poligon')] },
    {
      title: 'Geser pons kolom',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'd', expr: 'rata-rata d_{x}, d_{y}', value: fx(pc.d, 1), unit: 'mm' },
            { lhs: 'b_{0}', expr: '2(c_{x} + d) + 2(c_{y} + d)', value: fx(pc.b0, 0), unit: 'mm', ref: '22.6.4' },
            { lhs: 'V_{u}', expr: 'Σ fraksi R_{i} di luar keliling kritis', value: fx(pc.Vu, 1), unit: 'kN' },
            { lhs: 'v_{c}', expr: "min(0.33 λ√f'_{c}; 0.17(1 + 2/β)λ√f'_{c}; 0.083(α_{s}d/b_{0} + 2)λ√f'_{c})", subst: `β = ${fx(pc.beta, 2)}, α_{s} = 40`, value: fx(pc.vc, 3), unit: 'MPa', ref: '22.6.5.2' },
            { lhs: 'φV_{c}', expr: 'φ v_{c} b_{0} d', subst: `0.75 × ${fx(pc.vc, 3)} × ${fx(pc.b0, 0)} × ${fx(pc.d, 1)} / 10^{3}`, value: fx(pc.phiVc, 1), unit: 'kN' },
          ],
        },
        { k: 'rows', rows: [check('V_{u} / φV_{c}', pc.dc)] },
      ],
    },
    {
      title: 'Geser pons tiang',
      blocks: [
        {
          k: 'p',
          text: 'Tiang bulat diganti persegi ekuivalen sisi 0,886·D; keliling kritis d/2 dari muka tiang dipangkas tepi poer; α_{s} = 40 / 30 / 20 menurut jumlah sisi yang hilang. Tiang terkritis ditampilkan.',
        },
        {
          k: 'calc',
          steps: [
            { desc: `Tiang nomor ${(pp.i ?? 0) + 1}, ${pp.sides} sisi kritis`, lhs: 'b_{0}', value: fx(pp.b0, 0), unit: 'mm' },
            { lhs: 'v_{c}', expr: "min(0.33 λ√f'_{c}; 0.083(α_{s}d/b_{0} + 2)λ√f'_{c})", subst: `α_{s} = ${pp.alphaS}`, value: fx(pp.vc, 3), unit: 'MPa', ref: '22.6.5.2' },
            { lhs: 'φV_{c}', expr: 'φ v_{c} b_{0} d', value: fx(pp.phiVc, 1), unit: 'kN' },
            { lhs: 'V_{u}', expr: 'R_{tiang}', value: fx(pp.Vu, 1), unit: 'kN' },
          ],
        },
        { k: 'rows', rows: [check('V_{u} / φV_{c}', pp.dc)] },
      ],
    },
  ]
  const gov = r.gov!
  return {
    title: `Desain Pile Cap ${r.n} Tiang (SNI 2847:2019)`,
    summary: [
      kv('Poer', `${fx(r.Lx, 0)} × ${fx(r.Ly, 0)} × ${fx(r.h, 0)} mm, ${r.n} tiang D${fx(r.dp, 0)}`),
      kv('Reaksi tiang maks / min', `${fx(r.Rmax, 1)} / ${fx(r.Rmin, 1)} kN`),
      kv('Tulangan X / Y', `${r.flexX!.nBar} D${fx(r.db, 0)} / ${r.flexY!.nBar} D${fx(r.db, 0)}`),
      kv('Rasio menentukan', `${gov.name} (${fx(gov.dc, 2)})`),
    ],
    sections,
    governing: { label: gov.name, ratio: gov.dc },
    warnings: r.warn,
    scope: [
      'Metode poer kaku dengan reaksi tiang elastis (tiang identik); lentur di muka kolom, geser satu arah di d dari muka kolom, pons kolom dan pons tiang.',
      'Poer poligon: lebar penampang lentur dan geser = potongan poligon pada penampang kritis tegak lurus sumbu X dan Y (bukan sejajar sisi miring).',
      'Belum termasuk: model strat-and-tie (poer tebal), penyaluran tulangan, kapasitas tiang, kuat tumpu kolom–poer. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildPileCapReport(i: PileCapUIInput): Report | null {
  const r = computePileCapUI(i)
  return r ? pileCapReport(r) : null
}

export default {
  defaults: CAP_DEFAULTS,
  build: (i: PileCapUIInput) => buildPileCapReport(i) ?? { title: 'Desain Pile Cap', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
