import type { CapFlexure, CapOneWay, PileCapResult } from '../../calc/pile-cap'
import { figRows } from '../../report/figure'
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
