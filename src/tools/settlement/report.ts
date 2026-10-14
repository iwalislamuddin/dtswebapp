import { degreeOfConsolidation, shapeName, steinbrennerIs } from '../../calc/settlement'
import { dimH, dimV, figRows, niceStep } from '../../report/figure'
import { fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { SETTLEMENT_DEFAULTS, computeSettlementUI, type SettlementOk, type SettlementUIInput } from './model'

// Laporan Penurunan Fondasi: segera (elastis, Steinbrenner), konsolidasi primer (e–log p, Δσ 2:1), dan laju
// konsolidasi (Terzaghi 1-D) — rumus → substitusi → hasil.

export { SETTLEMENT_DEFAULTS }

/** Kurva waktu–penurunan S(t) = Se + U·Sc (mm); null bila laju konsolidasi tidak dihitung. */
export function timeCurve(r: SettlementOk, n = 48): { t: number[]; S: number[]; tMax: number } | null {
  if (!r.rate.active || !r.consol.active) return null
  const { cv, Hdr } = r.rate
  const tMax = Math.max(r.rate.t90 * 1.4, r.rate.t ?? 0)
  const t: number[] = [], S: number[] = []
  for (let k = 0; k <= n; k++) {
    const tk = (tMax * k) / n
    t.push(tk)
    S.push(r.Se + degreeOfConsolidation((cv * tk) / (Hdr * Hdr)) * r.Sc)
  }
  return { t, S, tMax }
}

/** Gbr. 1 — potongan: fondasi, lapisan termampatkan Hs, lempung konsolidasi. */
function figSection(r: SettlementOk): Figure {
  const ops: FigOp[] = []
  const clay = r.consol.active ? r.consol : null
  const hs = Math.min(r.Hs, 5 * r.B)
  const depth = Math.max(r.Df + hs, clay ? clay.ztop + clay.Hc : 0) + 0.3
  const sc = Math.min(150 / depth, 200 / (3 * r.B))
  const x0 = 130, W = 260
  const cx = x0 + W / 2, Bs = r.B * sc
  const yg = 20, yb = yg + r.Df * sc, yEnd = yg + depth * sc
  ops.push({ t: 'line', x1: x0, y1: yg, x2: x0 + W, y2: yg, lw: 1, c: 'muted' })
  ops.push({ t: 'rect', x: x0, y: yg, w: W, h: yEnd - yg, fill: true, c: 'muted', op: 0.08 })
  if (clay) {
    const yc = yg + clay.ztop * sc
    ops.push({ t: 'rect', x: x0, y: yc, w: W, h: clay.Hc * sc, fill: true, c: 'accent', op: 0.25 })
    ops.push({ t: 'rect', x: x0, y: yc, w: W, h: clay.Hc * sc, lw: 0.6, c: 'accent' })
    ops.push({ t: 'text', x: x0 + W - 4, y: yc + (clay.Hc * sc) / 2 + 2.5, s: `lempung Hc = ${fx(clay.Hc, 2)} m`, size: 6.5, align: 'r', c: 'accent' })
  }
  const tF = Math.max(7, Math.min(Bs * 0.18, 16))
  ops.push({ t: 'rect', x: cx - Bs / 2, y: yb - tF, w: Bs, h: tF, fill: true, c: 'support', op: 0.25 })
  ops.push({ t: 'rect', x: cx - Bs / 2, y: yb - tF, w: Bs, h: tF, lw: 1.1, c: 'support' })
  dimH(ops, cx - Bs / 2, cx + Bs / 2, yb + 12, `B = ${fx(r.B, 2)} m`)
  if (r.Df > 0) {
    dimV(ops, yg, yb, x0 - 14, '')
    ops.push({ t: 'text', x: x0 - 20, y: (yg + yb) / 2 + 2.5, s: `Df = ${fx(r.Df, 2)} m`, size: 7, align: 'r' })
  }
  const yH = yb + hs * sc
  dimV(ops, yb, yH, x0 - 14, '')
  ops.push({ t: 'text', x: x0 - 20, y: (yb + yH) / 2 + 2.5, s: `Hs = ${fx(r.Hs, 1)} m`, size: 7, align: 'r' })
  ops.push({ t: 'line', x1: x0, y1: yH, x2: x0 + W, y2: yH, lw: 0.6, c: 'muted', dash: [4, 3] })
  return { h: figRows(yEnd + 10), ops, alt: 'Potongan fondasi, lapisan termampatkan dan lapisan lempung', caption: 'Gbr. 1 — Potongan: fondasi, lapisan termampatkan H_{s} di bawah dasar, dan lempung konsolidasi.' }
}

/** Gbr. 2 — kurva waktu–penurunan. */
function figTime(r: SettlementOk): Figure | null {
  const cur = timeCurve(r)
  if (!cur) return null
  const ops: FigOp[] = []
  const x0 = 70, x1 = 470, y0 = 22, y1 = 150
  const Smax = r.Stotal * 1.05, ty = (s: number) => y0 + (s / Smax) * (y1 - y0), tx = (t: number) => x0 + (t / cur.tMax) * (x1 - x0)
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x1, y2: y0, lw: 0.6, c: 'muted' })
  const st = niceStep(cur.tMax, 5)
  for (let t = 0; t <= cur.tMax + 1e-9; t += st) ops.push({ t: 'text', x: tx(t), y: y0 - 4, s: fx(t, st < 1 ? 1 : 0), size: 6.5, align: 'c', c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y0 - 12, s: 't (tahun)', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: x0 - 6, y: y1 + 2, s: `${fx(r.Stotal, 0)} mm`, size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'poly', pts: cur.t.map((t, k) => [tx(t), ty(cur.S[k])] as [number, number]), lw: 1.4, c: 'v' })
  ops.push({ t: 'line', x1: x0, y1: ty(r.Se), x2: x1, y2: ty(r.Se), lw: 0.5, c: 'muted', dash: [3, 2] })
  ops.push({ t: 'text', x: x1, y: ty(r.Se) - 3, s: `S_{e} = ${fx(r.Se, 1)} mm`, size: 6.5, align: 'r', c: 'muted' })
  if (r.rate.active && r.rate.t && r.rate.St !== undefined) {
    ops.push({ t: 'circle', cx: tx(r.rate.t), cy: ty(r.rate.St), r: 3, fill: true, c: 'load' })
    ops.push({ t: 'text', x: tx(r.rate.t) + 6, y: ty(r.rate.St) + 8, s: `t = ${fx(r.rate.t, 2)} th: ${fx(r.rate.St, 1)} mm`, size: 7, c: 'load' })
  }
  return { h: figRows(y1 + 14), ops, alt: 'Kurva waktu terhadap penurunan', caption: 'Gbr. 2 — Penurunan terhadap waktu: S(t) = S_{e} + U · S_{c}; sumbu penurunan ke bawah.' }
}

export function settlementReport(r: SettlementOk): Report {
  const immediate: Section = (() => {
    const mS = r.Lc / r.Bc
    const c = steinbrennerIs(mS, r.Hs / (r.Bc / 2), r.mu)
    const e = steinbrennerIs(mS, r.Hs / r.Bc, r.mu)
    const steps: CalcStep[] = [
      { desc: r.shape === 'circular' ? 'Lingkaran → persegi ekuivalen (luas sama)' : r.isStrip ? 'Fondasi menerus: L dianggap 40B' : 'Dimensi hitung', lhs: 'B_{c} × L_{c}', value: `${fx(r.Bc, 3)} × ${fx(r.Lc, 3)}`, unit: 'm' },
      { lhs: 'm', expr: '\\frac{L_{c}}{B_{c}}', value: fx(mS, 3) },
      { desc: 'Pusat fondasi: luasan sudut dengan B/2', lhs: 'n_{pusat}', expr: '\\frac{H_{s}}{B_{c}/2}', subst: `\\frac{${fx(r.Hs, 2)}}{${fx(r.Bc / 2, 3)}}`, value: fx(r.Hs / (r.Bc / 2), 3) },
      { desc: 'Steinbrenner: I_{s} = F_{1} + \\frac{1 − 2μ}{1 − μ} F_{2}', lhs: 'I_{s,pusat}', subst: `F_{1} = ${fx(c.F1, 4)},  F_{2} = ${fx(c.F2, 4)},  μ = ${fx(r.mu, 2)}`, value: fx(c.Is, 4) },
      { lhs: 'n_{sudut}', expr: '\\frac{H_{s}}{B_{c}}', value: fx(r.Hs / r.Bc, 3) },
      { lhs: 'I_{s,sudut}', subst: `F_{1} = ${fx(e.F1, 4)},  F_{2} = ${fx(e.F2, 4)}`, value: fx(e.Is, 4) },
      { lhs: 'S_{e,pusat}', expr: '4 q_{0} \\frac{B_{c}}{2} \\frac{1 − μ^{2}}{E_{s}} I_{s} I_{f}', subst: `4 × ${fx(r.q0, 1)} × ${fx(r.Bc / 2, 3)} × \\frac{1 − ${fx(r.mu, 2)}^{2}}{${fx(r.EsMPa * 1000, 0)}} × ${fx(r.IsCenter, 4)} × ${fx(r.If, 2)}`, value: fx(r.SeCenter, 2), unit: 'mm' },
      { lhs: 'S_{e,sudut}', expr: 'q_{0} B_{c} \\frac{1 − μ^{2}}{E_{s}} I_{s} I_{f}', value: fx(r.SeCorner, 2), unit: 'mm' },
      { desc: 'Rata-rata fondasi lentur ≈ 0,85 × pusat', lhs: 'S_{e,rata}', expr: '0.85 S_{e,pusat}', value: fx(r.SeAvg, 2), unit: 'mm' },
      { desc: 'Fondasi kaku ≈ 0,93 × rata-rata', lhs: 'S_{e,kaku}', expr: '0.93 S_{e,rata}', value: fx(r.SeRigid, 2), unit: 'mm' },
      { desc: `Dipakai: fondasi ${r.rigid ? 'kaku' : 'lentur (pusat)'}`, lhs: 'S_{e}', value: fx(r.Se, 2), unit: 'mm' },
    ]
    return { title: 'Penurunan segera (elastis)', blocks: [{ k: 'calc', steps }] }
  })()

  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Bentuk', shapeName(r.shape)),
            kv(r.shape === 'circular' ? 'Diameter B' : 'B', `${fx(r.B, 2)} m`),
            ...(r.shape === 'rect' ? [kv('L', `${fx(r.L, 2)} m`)] : []),
            kv('D_{f} / q_{0} (neto)', `${fx(r.Df, 2)} m / ${fx(r.q0, 1)} kPa`),
            kv('E_{s} / μ / I_{f}', `${fx(r.EsMPa, 1)} MPa / ${fx(r.mu, 2)} / ${fx(r.If, 2)}`),
            kv('H_{s} (lapisan termampatkan)', `${fx(r.Hs, 2)} m`),
            kv('Kekakuan fondasi', r.rigid ? 'kaku' : 'lentur'),
          ],
        },
        { k: 'figure', fig: figSection(r) },
      ],
    },
    immediate,
  ]

  const c = r.consol
  if (c.active) {
    const modeText = c.mode === 'NC' ? 'normally consolidated (OCR ≈ 1) — seluruhnya Cc' : c.mode === 'OC-recompression' ? "overconsolidated, σ'f ≤ σ'c — seluruhnya Cr" : "overconsolidated, σ'f melewati σ'c — Cr sampai σ'c, Cc sesudahnya"
    const HH = c.Hc / (1 + c.e0)
    const steps: CalcStep[] = [
      { desc: 'Kedalaman atas / tengah / bawah lempung di bawah dasar fondasi', lhs: 'z', value: `${fx(c.zt, 2)} / ${fx(c.zm, 2)} / ${fx(c.zb, 2)}`, unit: 'm' },
      { desc: 'Metode 2:1: Δσ = \\frac{q_{0} B L}{(B + z)(L + z)}', lhs: 'Δσ (atas / tengah / bawah)', value: `${fx(c.dTop, 2)} / ${fx(c.dMid, 2)} / ${fx(c.dBot, 2)}`, unit: 'kPa' },
      { desc: 'Rata-rata Simpson', lhs: 'Δσ_{rata}', expr: '\\frac{Δσ_{atas} + 4 Δσ_{tengah} + Δσ_{bawah}}{6}', value: fx(c.dAvg, 2), unit: 'kPa' },
      { lhs: "σ'_{f}", expr: "σ'_{0} + Δσ_{rata}", subst: `${fx(c.sig0, 1)} + ${fx(c.dAvg, 2)}`, value: fx(c.sigF, 2), unit: 'kPa' },
      { desc: modeText, lhs: 'OCR', expr: "\\frac{σ'_{c}}{σ'_{0}}", subst: `\\frac{${fx(c.sigc, 1)}}{${fx(c.sig0, 1)}}`, value: fx(c.OCR, 3) },
      { lhs: 'H_{c}/(1 + e_{0})', subst: `\\frac{${fx(c.Hc, 2)}}{1 + ${fx(c.e0, 3)}}`, value: fx(HH, 4), unit: 'm' },
      c.mode === 'NC'
        ? { lhs: 'S_{c}', expr: "C_{c} \\frac{H_{c}}{1 + e_{0}} log \\frac{σ'_{f}}{σ'_{0}}", subst: `${fx(c.Cc, 3)} × ${fx(HH, 4)} × log(${fx(c.sigF, 2)}/${fx(c.sig0, 1)}) × 1000`, value: fx(c.Sc, 2), unit: 'mm' }
        : c.mode === 'OC-recompression'
          ? { lhs: 'S_{c}', expr: "C_{r} \\frac{H_{c}}{1 + e_{0}} log \\frac{σ'_{f}}{σ'_{0}}", subst: `${fx(c.Cr, 3)} × ${fx(HH, 4)} × log(${fx(c.sigF, 2)}/${fx(c.sig0, 1)}) × 1000`, value: fx(c.Sc, 2), unit: 'mm' }
          : { lhs: 'S_{c}', expr: "C_{r} \\frac{H_{c}}{1 + e_{0}} log \\frac{σ'_{c}}{σ'_{0}} + C_{c} \\frac{H_{c}}{1 + e_{0}} log \\frac{σ'_{f}}{σ'_{c}}", subst: `(${fx(c.Cr, 3)} log(${fx(c.sigc, 1)}/${fx(c.sig0, 1)}) + ${fx(c.Cc, 3)} log(${fx(c.sigF, 2)}/${fx(c.sigc, 1)})) × ${fx(HH, 4)} × 1000`, value: fx(c.Sc, 2), unit: 'mm' },
    ]
    sections.push({ title: 'Konsolidasi primer lempung', blocks: [{ k: 'calc', steps }] })
  }

  const rt = r.rate
  if (rt.active) {
    const steps: CalcStep[] = [
      { desc: `Drainase ${rt.drain === 'single' ? 'tunggal' : 'ganda'}`, lhs: 'H_{dr}', value: fx(rt.Hdr, 2), unit: 'm' },
      { lhs: 't_{50}', expr: '\\frac{0.197 H_{dr}^{2}}{c_{v}}', subst: `\\frac{0.197 × ${fx(rt.Hdr, 2)}^{2}}{${fx(rt.cv, 3)}}`, value: fx(rt.t50, 3), unit: 'tahun' },
      { lhs: 't_{90}', expr: '\\frac{0.848 H_{dr}^{2}}{c_{v}}', value: fx(rt.t90, 3), unit: 'tahun' },
    ]
    if (rt.t !== undefined && rt.Tv !== undefined && rt.U !== undefined && rt.St !== undefined) {
      steps.push(
        { lhs: 'T_{v}', expr: '\\frac{c_{v} t}{H_{dr}^{2}}', subst: `\\frac{${fx(rt.cv, 3)} × ${fx(rt.t, 2)}}{${fx(rt.Hdr, 2)}^{2}}`, value: fx(rt.Tv, 4) },
        { desc: 'U ≤ 60%: √(4T_{v}/π); selebihnya T_{v} = 1,781 − 0,933 log(100 − U%)', lhs: 'U', value: fx(rt.U * 100, 1), unit: '%' },
        { lhs: 'S(t)', expr: 'S_{e} + U S_{c}', subst: `${fx(r.Se, 2)} + ${fx(rt.U, 4)} × ${fx(r.Sc, 2)}`, value: fx(rt.St, 2), unit: 'mm' },
      )
    }
    const blocks: Block[] = [{ k: 'calc', steps }]
    const f2 = figTime(r)
    if (f2) blocks.push({ k: 'figure', fig: f2 })
    sections.push({ title: 'Laju konsolidasi (Terzaghi 1-D)', blocks })
  }

  sections.push({
    title: 'Penurunan total',
    strong: true,
    blocks: [{ k: 'calc', steps: [{ lhs: 'S_{total}', expr: 'S_{e} + S_{c}', subst: `${fx(r.Se, 2)} + ${fx(r.Sc, 2)}`, value: fx(r.Stotal, 2), unit: 'mm' }] }],
  })

  return {
    title: 'Penurunan Fondasi',
    summary: [
      kv('S_{e} (segera)', `${fx(r.Se, 1)} mm`),
      kv('S_{c} (konsolidasi)', `${fx(r.Sc, 1)} mm`),
      kv('S_{total}', `${fx(r.Stotal, 1)} mm`),
      ...(rt.active && rt.St !== undefined ? [kv(`S pada t = ${fx(rt.t, 2)} tahun`, `${fx(rt.St, 1)} mm`)] : []),
    ],
    sections,
    warnings: r.warn,
    scope: [
      'Penurunan segera: teori elastis Steinbrenner; konsolidasi: e–log p dengan Δσ metode 2:1; laju: Terzaghi 1-D.',
      'Belum termasuk: pemampatan sekunder (creep), lempung berlapis banyak, Schmertmann/N-SPT, Boussinesq penuh. Batas penurunan izin ditetapkan perencana.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildSettlementReport(i: SettlementUIInput): Report | null {
  const r = computeSettlementUI(i)
  return r ? settlementReport(r) : null
}

export default {
  defaults: SETTLEMENT_DEFAULTS,
  build: (i: SettlementUIInput) => buildSettlementReport(i) ?? { title: 'Penurunan Fondasi', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
