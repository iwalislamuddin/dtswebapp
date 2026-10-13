import type { FlexureDirection, FootingResult } from '../../calc/footing-design'
import { flexuralRn, rhoShrinkage } from '../../calc/shared/concrete'
import { dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { FOOTING_DEFAULTS, computeFootingUI, type FootingUIInput } from './model'

// Laporan Desain Pondasi Tapak: stabilitas layan (tekanan sudut, kern, guling, geser, daya dukung) lalu struktur
// ultimit (lentur dua arah, geser satu arah, geser pons) — SNI 2847:2019, dengan rumus dan substitusi.

export { FOOTING_DEFAULTS }

/** Rasio D/C tiap pemeriksaan (≤ 1 = OK) — dipakai UI (diagram) dan laporan. */
export function footingRatios(r: FootingResult): { label: string; ratio: number }[] {
  const out = [{ label: 'Daya dukung qmax/qa', ratio: r.qmax! / r.qa! }]
  if (Number.isFinite(r.SFot)) out.push({ label: 'Guling 1,5/SF', ratio: 1.5 / r.SFot! })
  if (Number.isFinite(r.SFslide)) out.push({ label: 'Geser dasar 1,5/SF', ratio: 1.5 / r.SFslide! })
  out.push({ label: 'Kern (ex/L+ey/B)÷(1/6)', ratio: r.kern! * 6 })
  out.push({ label: 'Geser 1 arah (L)', ratio: r.dc1L! }, { label: 'Geser 1 arah (B)', ratio: r.dc1B! }, { label: 'Geser pons', ratio: r.dcPunch! })
  return out
}

/** Gbr. 1 — denah tapak: kolom, tekanan sudut layan, titik resultan terhadap kern. */
function figPlan(r: FootingResult): Figure {
  const ops: FigOp[] = []
  const L = r.L!, B = r.B!
  const sc = Math.min(260 / L, 150 / B)
  const W = L * sc, H = B * sc
  const cx = 264, cy = 20 + H / 2
  const X = (m: number) => cx + m * sc
  const Y = (m: number) => cy - m * sc
  ops.push({ t: 'rect', x: cx - W / 2, y: cy - H / 2, w: W, h: H, fill: true, c: 'support', op: 0.1 })
  ops.push({ t: 'rect', x: cx - W / 2, y: cy - H / 2, w: W, h: H, lw: 1, c: 'support' })
  ops.push({ t: 'rect', x: X(-r.c1! / 2), y: Y(r.c2! / 2), w: r.c1! * sc, h: r.c2! * sc, fill: true, c: 'ink', op: 0.35 })
  ops.push({ t: 'poly', pts: [[X(-L / 6), Y(0)], [X(0), Y(B / 6)], [X(L / 6), Y(0)], [X(0), Y(-B / 6)]], close: true, lw: 0.6, c: 'muted', dash: [3, 2] })
  ops.push({ t: 'circle', cx: X(r.ex!), cy: Y(r.ey!), r: 3, fill: true, c: r.uplift ? 'bad' : 'load' })
  ops.push({ t: 'text', x: X(r.ex!) + 5, y: Y(r.ey!) - 4, s: 'resultan', size: 6.5, c: r.uplift ? 'bad' : 'load' })
  const q = r.qc!
  const lab = (s: number, x: number, y: number, al: 'l' | 'r') => ops.push({ t: 'text', x, y, s: `${fx(s, 1)} kPa`, size: 7, align: al, c: s > r.qa! ? 'bad' : 'ink' })
  lab(q.mp, cx - W / 2 - 4, cy - H / 2 + 8, 'r')
  lab(q.mm, cx - W / 2 - 4, cy + H / 2 - 1, 'r')
  lab(q.pp, cx + W / 2 + 4, cy - H / 2 + 8, 'l')
  lab(q.pm, cx + W / 2 + 4, cy + H / 2 - 1, 'l')
  dimH(ops, cx - W / 2, cx + W / 2, cy + H / 2 + 14, `L = ${fx(L, 2)} m`)
  dimV(ops, cy - H / 2, cy + H / 2, cx - W / 2 - 62, '')
  ops.push({ t: 'text', x: cx - W / 2 - 66, y: cy + 3, s: `B = ${fx(B, 2)} m`, size: 7, align: 'r' })
  return {
    h: figRows(cy + H / 2 + 30),
    ops,
    alt: 'Denah tapak dengan tekanan tanah di empat sudut',
    caption: 'Gbr. 1 — Denah tapak: tekanan tanah layan di sudut, titik resultan (e_{x}, e_{y}), dan batas kern (belah ketupat putus-putus, e_{x}/L + e_{y}/B = 1/6).',
  }
}

/** Gbr. 2 — potongan memanjang (arah L): tapak, kolom, muka tanah, tulangan arah L dan B. */
function figSection(r: FootingResult): Figure {
  const ops: FigOp[] = []
  const L = r.L!, tf = r.tf!, Df = r.Df!
  const sc = Math.min(270 / L, 110 / Math.max(Df, tf + 0.3))
  const x0 = 150, W = L * sc
  const yTop = 18, ys = yTop + Math.max(0, Df - tf) * sc, yb = ys + tf * sc
  const colW = r.c1! * sc
  ops.push({ t: 'rect', x: x0, y: ys, w: W, h: tf * sc, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'rect', x: x0, y: ys, w: W, h: tf * sc, lw: 1, c: 'support' })
  ops.push({ t: 'rect', x: x0 + W / 2 - colW / 2, y: yTop - 8, w: colW, h: ys - yTop + 8, fill: true, c: 'ink', op: 0.3 })
  ops.push({ t: 'rect', x: x0 + W / 2 - colW / 2, y: yTop - 8, w: colW, h: ys - yTop + 8, lw: 0.8, c: 'ink' })
  ops.push({ t: 'line', x1: x0 - 24, y1: yTop, x2: x0 + W + 24, y2: yTop, lw: 0.6, c: 'muted', dash: [4, 3] })
  ops.push({ t: 'text', x: x0 + W + 26, y: yTop + 3, s: 'muka tanah', size: 6.5, c: 'muted' })
  const yBar = yb - Math.max(2, (r.cc! / 1000) * sc) - 1
  const barW = Math.max(1.6, (r.db! / 1000) * sc)
  ops.push({ t: 'line', x1: x0 + 6, y1: yBar, x2: x0 + W - 6, y2: yBar, lw: barW + 0.6, c: 'y' })
  ops.push({ t: 'line', x1: x0 + 6, y1: yBar - barW * 2.2, x2: x0 + W - 6, y2: yBar - barW * 2.2, lw: barW + 0.6, c: 'v', dash: [6, 2] })
  dimH(ops, x0, x0 + W, yb + 14, `L = ${fx(L, 2)} m`)
  dimV(ops, ys, yb, x0 - 14, '')
  ops.push({ t: 'text', x: x0 - 18, y: (ys + yb) / 2 + 3, s: `t = ${fx(tf * 1000, 0)} mm`, size: 7, align: 'r' })
  ops.push({ t: 'text', x: x0 + W + 8, y: yBar + 2, s: `D${fx(r.db, 0)}-${r.flexL!.s} (arah L)`, size: 7, c: 'y' })
  ops.push({ t: 'text', x: x0 + W + 8, y: yBar - barW * 2.2 + 2, s: `D${fx(r.db, 0)}-${r.flexB!.s} (arah B)`, size: 7, c: 'v' })
  return {
    h: figRows(yb + 22),
    ops,
    alt: 'Potongan tapak dengan tulangan dua arah',
    caption: `Gbr. 2 — Potongan arah L: tebal ${fx(tf * 1000, 0)} mm, kedalaman dasar ${fx(Df, 2)} m. Lapis bawah arah L, di atasnya arah B.`,
  }
}

/** Langkah hitung lentur satu arah (per meter lebar). */
function flexBlocks(f: FlexureDirection, label: 'L' | 'B', r: FootingResult, d: number, colDim: number): Block[] {
  const fc = fx(r.fc, 0), fy = fx(r.fy, 0)
  const h = r.tf! * 1000
  const Rn = flexuralRn(f.Mu * 1e6, 0.9, 1000, d)
  const rhoMin = rhoShrinkage(r.fy!)
  const steps: CalcStep[] = [
    { desc: `Kantilever dari muka kolom (kolom ${fx(colDim * 1000, 0)} mm)`, lhs: 'ℓ', expr: `\\frac{${label} − c}{2}`, subst: `\\frac{${fx(label === 'L' ? r.L : r.B, 2)} − ${fx(colDim, 2)}}{2}`, value: fx(f.arm, 3), unit: 'm' },
    { desc: 'Tekanan neto ultimit dengan eksentrisitas, diintegrasi di sepanjang kantilever', lhs: 'M_{u}', value: fx(f.Mu, 2), unit: 'kN·m/m' },
    { lhs: 'd', expr: label === 'L' ? 'h − selimut − d_{b}/2' : 'h − selimut − 1.5 d_{b}', subst: label === 'L' ? `${fx(h, 0)} − ${fx(r.cc, 0)} − ${fx(r.db! / 2, 1)}` : `${fx(h, 0)} − ${fx(r.cc, 0)} − ${fx(1.5 * r.db!, 1)}`, value: fx(d, 1), unit: 'mm' },
    { lhs: 'R_{n}', expr: '\\frac{M_{u}}{φ b d^{2}}', subst: `\\frac{${fx(f.Mu, 2)} × 10^{6}}{0.9 × 1000 × ${fx(d, 1)}^{2}}`, value: fx(Rn, 3), unit: 'MPa' },
    { lhs: 'A_{s}', expr: "ρ b d,  ρ = \\frac{0.85 f'_{c}}{f_{y}}(1 − √(1 − \\frac{2R_{n}}{0.85 f'_{c}}))", subst: `f'_{c} = ${fc},  f_{y} = ${fy}`, value: fx(f.AsFlex, 0), unit: 'mm²/m' },
    { lhs: 'A_{s,min}', expr: 'ρ_{min} b h', subst: `${fx(rhoMin, 5)} × 1000 × ${fx(h, 0)}`, value: fx(f.AsMin, 0), unit: 'mm²/m', ref: '24.4.3.2' },
    { lhs: 'A_{s,perlu}', expr: 'maks(A_{s}; A_{s,min})', value: fx(f.AsReq, 0), unit: 'mm²/m' },
    { desc: `Spasi maks = min(3h; 450) = ${fx(f.sMax, 0)} mm; kelipatan 25 mm`, lhs: 's', expr: '\\frac{1000 · π d_{b}^{2}/4}{A_{s,perlu}}', value: String(f.s), unit: 'mm' },
    { desc: `Terpasang D${fx(f.db, 0)}-${f.s}`, lhs: 'A_{s,pasang}', expr: '\\frac{1000 · π d_{b}^{2}/4}{s}', value: fx(f.AsProv, 0), unit: 'mm²/m' },
  ]
  return [
    { k: 'calc', steps },
    {
      k: 'rows',
      rows: [
        kv('ε_{t} (blok tegangan)', `${Number.isFinite(f.et) ? fx(f.et, 4) : '-'} — ${f.infeasible ? 'penampang tidak cukup' : f.tc ? 'terkendali tarik' : 'transisi (periksa φ)'}`),
        check('A_{s,perlu} / A_{s,pasang}', f.AsReq / f.AsProv),
      ],
    },
  ]
}

export function footingReport(r: FootingResult): Report {
  const fc = fx(r.fc, 0)
  const q = r.qc!
  const stability: Section = {
    title: 'Stabilitas tanah (beban layan)',
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'W_{f}', expr: 'γ_{c} L B t', subst: `${fx(r.gc, 1)} × ${fx(r.L, 2)} × ${fx(r.B, 2)} × ${fx(r.tf, 3)}`, value: fx(r.Wf, 1), unit: 'kN' },
          { lhs: 'W_{s}', expr: 'γ_{s} L B (D_{f} − t)', subst: `${fx(r.gs, 1)} × ${fx(r.L, 2)} × ${fx(r.B, 2)} × ${fx(Math.max(0, r.Df! - r.tf!), 3)}`, value: fx(r.Ws, 1), unit: 'kN' },
          { lhs: 'N', expr: 'P + W_{f} + W_{s}', subst: `${fx(r.P, 1)} + ${fx(r.Wf, 1)} + ${fx(r.Ws, 1)}`, value: fx(r.N, 1), unit: 'kN' },
          { lhs: 'M_{x,dasar}', expr: 'M_{x} + H_{y} t', subst: `${fx(r.Mx, 1)} + ${fx(r.Hy, 1)} × ${fx(r.tf, 3)}`, value: fx(r.MxB, 2), unit: 'kN·m' },
          { lhs: 'M_{y,dasar}', expr: 'M_{y} + H_{x} t', subst: `${fx(r.My, 1)} + ${fx(r.Hx, 1)} × ${fx(r.tf, 3)}`, value: fx(r.MyB, 2), unit: 'kN·m' },
          { lhs: 'e_{x}', expr: '\\frac{M_{y,dasar}}{N}', value: fx(r.ex, 4), unit: 'm' },
          { lhs: 'e_{y}', expr: '\\frac{M_{x,dasar}}{N}', value: fx(r.ey, 4), unit: 'm' },
          { desc: 'Kern: harus ≤ 1/6 = 0.1667', lhs: 'k', expr: '\\frac{|e_{x}|}{L} + \\frac{|e_{y}|}{B}', value: fx(r.kern, 4) },
          { lhs: 'q', expr: '\\frac{N}{LB}(1 ± \\frac{6e_{x}}{L} ± \\frac{6e_{y}}{B})', subst: `${fx(r.qavgS, 2)} × (1 ± …)`, value: `${fx(r.qmax, 1)} / ${fx(r.qmin, 1)}`, unit: 'kPa (maks / min)' },
        ],
      },
      {
        k: 'table',
        head: ['Sudut', 'Tekanan (kPa)'],
        align: ['l', 'r'],
        rows: [
          ['(+x, +y)', fx(q.pp, 1)],
          ['(+x, −y)', fx(q.pm, 1)],
          ['(−x, +y)', fx(q.mp, 1)],
          ['(−x, −y)', fx(q.mm, 1)],
        ],
      },
      { k: 'figure', fig: figPlan(r) },
      {
        k: 'calc',
        steps: [
          { lhs: 'SF_{daya dukung}', expr: '\\frac{q_{a}}{q_{maks}}', subst: `\\frac{${fx(r.qa, 1)}}{${fx(r.qmax, 1)}}`, value: fx(r.SFbear, 2) },
          { lhs: 'SF_{guling}', expr: '\\frac{N · (dim/2)}{M}', subst: `min(${fx(r.SFotY, 2)}; ${fx(r.SFotX, 2)})`, value: Number.isFinite(r.SFot) ? fx(r.SFot, 2) : '∞' },
          { lhs: 'SF_{geser}', expr: '\\frac{μ N}{H}', subst: `\\frac{${fx(r.mu, 2)} × ${fx(r.N, 1)}}{${fx(r.Hres, 2)}}`, value: Number.isFinite(r.SFslide) ? fx(r.SFslide, 2) : '∞' },
        ],
      },
      {
        k: 'rows',
        rows: [
          check('q_{maks} / q_{a}', r.qmax! / r.qa!),
          ...(Number.isFinite(r.SFot) ? [check('Guling: 1,5 / SF', 1.5 / r.SFot!)] : []),
          ...(Number.isFinite(r.SFslide) ? [check('Geser dasar: 1,5 / SF', 1.5 / r.SFslide!)] : []),
          check('Kern: k / (1/6)', r.kern! * 6),
        ],
      },
    ],
  }

  const ultimate: Section = {
    title: 'Beban ultimit & tinggi efektif',
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'P_{u}', expr: 'LF · P', subst: `${fx(r.LF, 2)} × ${fx(r.P, 1)}`, value: fx(r.Pu, 1), unit: 'kN' },
          { desc: 'Tekanan neto rata-rata (berat sendiri & timbunan tidak ikut)', lhs: 'q_{u}', expr: '\\frac{P_{u}}{LB}', subst: `\\frac{${fx(r.Pu, 1)}}{${fx(r.A, 2)}}`, value: fx(r.quavg, 2), unit: 'kPa' },
          { desc: 'Arah L — lapis bawah', lhs: 'd_{x}', expr: 'h − selimut − d_{b}/2', value: fx(r.dx, 1), unit: 'mm' },
          { desc: 'Arah B — di atas lapis L', lhs: 'd_{y}', expr: 'h − selimut − 1.5 d_{b}', value: fx(r.dy, 1), unit: 'mm' },
        ],
      },
    ],
  }

  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('P / M_{x} / M_{y}', `${fx(r.P, 1)} kN / ${fx(r.Mx, 1)} / ${fx(r.My, 1)} kN·m`),
            kv('H_{x} / H_{y}', `${fx(r.Hx, 1)} / ${fx(r.Hy, 1)} kN`),
            kv('Tapak L × B × t', `${fx(r.L, 2)} × ${fx(r.B, 2)} m × ${fx(r.tf! * 1000, 0)} mm, D_{f} = ${fx(r.Df, 2)} m`),
            kv('Kolom c_{1} × c_{2}', `${fx(r.c1! * 1000, 0)} × ${fx(r.c2! * 1000, 0)} mm`),
            kv("f'_{c} / f_{y} / q_{a}", `${fc} / ${fx(r.fy, 0)} MPa / ${fx(r.qa, 0)} kPa`),
            kv('μ / γ_{c} / γ_{s} / LF', `${fx(r.mu, 2)} / ${fx(r.gc, 1)} / ${fx(r.gs, 1)} / ${fx(r.LF, 2)}`),
          ],
        },
      ],
    },
    stability,
    ultimate,
    { title: 'Lentur arah L', blocks: flexBlocks(r.flexL!, 'L', r, r.dx!, r.c1!) },
    { title: 'Lentur arah B', blocks: flexBlocks(r.flexB!, 'B', r, r.dy!, r.c2!) },
    {
      title: 'Geser satu arah',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Penampang kritis d dari muka kolom, per meter lebar', lhs: 'φV_{c}', expr: "φ · 0.17 √(f'_{c}) · 1000 · d", subst: `0.75 × 0.17 × √${fc} × 1000 × d`, value: `${fx(r.phiVc1L, 1)} (L) / ${fx(r.phiVc1B, 1)} (B)`, unit: 'kN/m', ref: '22.5.5.1' },
            { lhs: 'V_{u}', value: `${fx(r.flexL!.Vu, 1)} (L) / ${fx(r.flexB!.Vu, 1)} (B)`, unit: 'kN/m' },
          ],
        },
        { k: 'rows', rows: [check('V_{u} / φV_{c} arah L', r.dc1L!), check('V_{u} / φV_{c} arah B', r.dc1B!)] },
      ],
    },
    {
      title: 'Geser pons',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'd', expr: 'rata-rata d_{x}, d_{y}', value: fx(r.davg, 1), unit: 'mm' },
            { lhs: 'b_{0}', expr: '2(c_{1} + d) + 2(c_{2} + d)', value: fx(r.b0, 0), unit: 'mm', ref: '22.6.4' },
            { lhs: 'V_{u}', expr: 'P_{u} − q_{u} A_{in}', subst: `${fx(r.Pu, 1)} − ${fx(r.quavg, 2)} × ${fx(r.Ain, 3)}`, value: fx(r.Vup, 1), unit: 'kN' },
            { desc: `Menentukan: ${r.vcGov} (β_{c} = ${fx(r.betaC, 2)})`, lhs: 'v_{c}', expr: "min(0.33 λ√f'_{c}; 0.17(1 + 2/β_{c})λ√f'_{c}; 0.083(α_{s}d/b_{0} + 2)λ√f'_{c})", value: fx(r.vcPunch, 3), unit: 'MPa', ref: '22.6.5.2' },
            { lhs: 'φV_{c}', expr: 'φ v_{c} b_{0} d', subst: `0.75 × ${fx(r.vcPunch, 3)} × ${fx(r.b0, 0)} × ${fx(r.davg, 1)} / 10^{3}`, value: fx(r.phiVcp, 1), unit: 'kN' },
          ],
        },
        { k: 'rows', rows: [check('V_{u} / φV_{c}', r.dcPunch!)] },
        { k: 'figure', fig: figSection(r) },
      ],
    },
  ]

  const ratios = footingRatios(r)
  const gov = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  return {
    title: 'Desain Pondasi Tapak (SNI 2847:2019)',
    summary: [
      kv('Tapak', `${fx(r.L, 2)} × ${fx(r.B, 2)} m, t = ${fx(r.tf! * 1000, 0)} mm`),
      kv('Tulangan arah L / arah B', `D${fx(r.db, 0)}-${r.flexL!.s} / D${fx(r.db, 0)}-${r.flexB!.s}`),
      kv('q_{maks} / q_{a}', `${fx(r.qmax, 1)} / ${fx(r.qa, 0)} kPa`),
      kv('Geser pons V_{u} / φV_{c}', `${fx(r.Vup, 1)} / ${fx(r.phiVcp, 1)} kN`),
    ],
    sections,
    governing: { label: gov.label, ratio: gov.ratio },
    warnings: r.warn,
    scope: [
      'Tapak kaku, tekanan tanah linear, beban ultimit = faktor rata-rata × beban layan; kohesi dan tahanan pasif diabaikan pada cek geser dasar.',
      'Belum termasuk: kuat tumpu beton kolom–tapak, panjang penyaluran tulangan, penurunan, beban gempa. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildFootingReport(i: FootingUIInput): Report | null {
  const r = computeFootingUI(i)
  return r ? footingReport(r) : null
}

export default {
  defaults: FOOTING_DEFAULTS,
  build: (i: FootingUIInput) => buildFootingReport(i) ?? { title: 'Desain Pondasi Tapak', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
