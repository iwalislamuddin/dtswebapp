import type { ShaftSegment } from '../../calc/pile-capacity'
import { GAMMA_W } from '../../calc/shared/geotech'
import { dimV, figRows } from '../../report/figure'
import { fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { PILE_DEFAULTS, computePileUI, type PileOk, type PileUIInput } from './model'

// Laporan Daya Dukung Tiang Tunggal (aksial tekan): selimut per lapis (α / β / SPT), ujung, Qu, Q izin dan pembanding
// Decourt–Quaresma — rumus → substitusi → hasil.

export { PILE_DEFAULTS }

export const soilName = (s: string): string => (s === 'clay' ? 'Lempung' : 'Pasir')
export const methodName = (m: string): string => (m === 'spt' ? 'SPT' : 'Statik')

/** Gbr. 1 — profil tanah, tiang, MAT (kiri) dan batang fs per segmen (kanan). */
function figProfile(r: PileOk): Figure {
  const ops: FigOp[] = []
  const total = r.totalH
  const sc = Math.min(210 / total, 14)
  const x0 = 90, W = 110, yg = 20
  let z = 0
  r.layers.forEach((ly, k) => {
    const y = yg + z * sc
    ops.push({ t: 'rect', x: x0, y, w: W, h: ly.H * sc, fill: true, c: ly.soil === 'clay' ? 'accent' : 'muted', op: ly.soil === 'clay' ? 0.25 : 0.14 })
    ops.push({ t: 'rect', x: x0, y, w: W, h: ly.H * sc, lw: 0.5, c: 'muted' })
    ops.push({ t: 'text', x: x0 - 5, y: y + (ly.H * sc) / 2 + 2.5, s: `${k + 1}. ${soilName(ly.soil)} ${fx(ly.H, 1)} m`, size: 6.5, align: 'r' })
    z += ly.H
  })
  const pw = Math.max(6, Math.min(r.D * sc * 1.6, 22))
  const cx = x0 + W / 2
  ops.push({ t: 'rect', x: cx - pw / 2, y: yg - 10, w: pw, h: r.Leff * sc + 10, fill: true, c: 'support', op: 0.3 })
  ops.push({ t: 'rect', x: cx - pw / 2, y: yg - 10, w: pw, h: r.Leff * sc + 10, lw: 1, c: 'support' })
  if (r.Dw < total) {
    const yw = yg + r.Dw * sc
    ops.push({ t: 'line', x1: x0, y1: yw, x2: x0 + W, y2: yw, lw: 0.8, c: 'load', dash: [5, 3] })
    ops.push({ t: 'text', x: x0 + W + 4, y: yw + 2.5, s: `MAT ${fx(r.Dw, 1)} m`, size: 6.5, c: 'load' })
  }
  dimV(ops, yg, yg + r.Leff * sc, x0 + W + 40, '')
  ops.push({ t: 'text', x: x0 + W + 46, y: yg + (r.Leff * sc) / 2 + 2.5, s: `L = ${fx(r.Leff, 1)} m`, size: 7 })
  // batang fs
  const bx = 340, bw = 130
  const maxFs = Math.max(...r.segs.map((s) => s.fs), 1) * 1.1
  ops.push({ t: 'text', x: bx + bw / 2, y: 10, s: 'f_{s} per lapis (kPa)', size: 6.5, align: 'c', c: 'muted' })
  ops.push({ t: 'line', x1: bx, y1: yg, x2: bx, y2: yg + r.Leff * sc, lw: 0.5, c: 'muted' })
  for (const s of r.segs) {
    const y = yg + s.top * sc
    const h = Math.max(1.5, s.dL * sc - 1)
    ops.push({ t: 'rect', x: bx, y, w: (s.fs / maxFs) * bw, h, fill: true, c: 'v', op: 0.4 })
    ops.push({ t: 'rect', x: bx, y, w: (s.fs / maxFs) * bw, h, lw: 0.6, c: 'v' })
    ops.push({ t: 'text', x: bx + (s.fs / maxFs) * bw + 4, y: y + h / 2 + 2.5, s: fx(s.fs, 1), size: 6.5 })
  }
  const yTip = yg + r.Leff * sc
  ops.push({ t: 'text', x: bx, y: yTip + 14, s: `q_{p} = ${fx(r.qp, 0)} kPa di ujung`, size: 7, c: 'm' })
  return {
    h: figRows(yTip + 22),
    ops,
    alt: 'Profil tanah, tiang dan gesekan selimut per lapis',
    caption: `Gbr. 1 — Profil tanah dan tiang ${r.shape === 'square' ? 'persegi' : 'bulat'} D = ${fx(r.D, 2)} m; f_{s} tiap lapis tertanam dan q_{p} di ujung.`,
  }
}

function segRow(s: ShaftSegment): string[] {
  return [String(s.idx), `${fx(s.top, 1)}–${fx(s.bot, 1)}`, `${soilName(s.soil)} / ${methodName(s.method)}`, fx(s.sv, 1), fx(s.fs, 1), s.how, fx(s.Qs, 1)]
}

export function pileReport(r: PileOk): Report {
  const Ls = r.layers
  const data: Section = {
    title: 'Data',
    blocks: [
      {
        k: 'rows',
        rows: [
          kv('Tiang', `${r.shape === 'square' ? 'persegi' : 'bulat'}, ${r.ptype === 'driven' ? 'pancang' : 'bor'}, ${r.material === 'steel' ? 'baja' : 'beton'}`),
          kv(r.shape === 'square' ? 'Sisi D' : 'Diameter D', `${fx(r.D, 3)} m`),
          kv('L tertanam', `${fx(r.Leff, 2)} m`),
          kv('Keliling / luas ujung', `${fx(r.perim, 3)} m / ${fx(r.Ap, 4)} m²`),
          kv('D_{w} (muka air)', `${fx(r.Dw, 2)} m`),
          kv('FS', fx(r.FS, 2)),
        ],
      },
      {
        k: 'table',
        head: ['Lapis', 'Tanah', 'Metode', 'H (m)', 'γ (kN/m³)', 'c_{u} (kPa)', 'φ (°)', 'N'],
        align: ['c', 'l', 'l', 'r', 'r', 'r', 'r', 'r'],
        rows: Ls.map((ly, k) => [String(k + 1), soilName(ly.soil), methodName(ly.method), fx(ly.H, 2), fx(ly.gamma, 1), ly.soil === 'clay' ? fx(Number(ly.cu), 1) : '–', ly.soil === 'sand' ? fx(Number(ly.phi), 1) : '–', Number(ly.N) > 0 ? fx(Number(ly.N), 0) : '–']),
      },
    ],
  }

  const shaft: Section = {
    title: 'Tahanan selimut',
    blocks: [
      {
        k: 'p',
        text: `Lempung (API): f_{s} = α c_{u}, ψ = c_{u}/σ′_{v}, α = 0,5 ψ^{−0,5} (ψ ≤ 1) atau 0,5 ψ^{−0,25} (ψ > 1), α ≤ 1. Pasir: f_{s} = K σ′_{v} tanδ, K = ${fx(r.cK, 1)}(1 − sinφ), δ = ${fx(r.cDelta, 1)} φ. SPT: f_{s} = ${fx(r.nfSPT, 0)} N. f_{s} dibatasi 120 kPa. σ′_{v} di tengah segmen, γ′ = γ − ${fx(GAMMA_W, 2)} di bawah MAT.`,
      },
      {
        k: 'table',
        head: ['Lapis', 'Zona (m)', 'Tanah / metode', 'σ′_{v} (kPa)', 'f_{s} (kPa)', 'Faktor', 'Q_{s} (kN)'],
        align: ['c', 'c', 'l', 'r', 'r', 'l', 'r'],
        rows: r.segs.map(segRow),
      },
      { k: 'calc', steps: [{ lhs: 'Q_{s}', expr: 'Σ (keliling × ΔL × f_{s})', subst: `Σ ${fx(r.perim, 3)} × ΔL × f_{s}`, value: fx(r.Qs, 1), unit: 'kN' }] },
      { k: 'figure', fig: figProfile(r) },
    ],
  }

  const tipSteps: CalcStep[] = []
  const t = r.tipLayer
  if (t.method === 'spt') {
    const sand = t.soil === 'sand'
    const N = Number(t.N)
    tipSteps.push({ desc: `Ujung di lapis ${soilName(t.soil).toLowerCase()} (SPT)`, lhs: 'q_{p}', expr: `min(40 N L/D; ${sand ? 400 : 300} N)`, subst: `min(40 × ${fx(N, 0)} × ${fx(r.Leff / r.D, 2)}; ${sand ? 400 : 300} × ${fx(N, 0)})`, value: fx(r.qp, 1), unit: 'kPa' })
  } else if (t.soil === 'clay') {
    tipSteps.push({ desc: 'Ujung di lempung', lhs: 'q_{p}', expr: '9 c_{u}', subst: `9 × ${fx(Number(t.cu), 1)}`, value: fx(r.qp, 1), unit: 'kPa' })
  } else {
    tipSteps.push(
      { desc: 'Ujung di pasir (Meyerhof)', lhs: "σ'_{v,ujung}", value: fx(r.svTip, 1), unit: 'kPa' },
      { lhs: 'N_{q}', expr: 'e^{π tanφ} tan^{2}(45° + φ/2)', subst: `φ = ${fx(Number(t.phi), 1)}°`, value: fx(r.Nq, 2) },
      { lhs: 'q_{l}', expr: '0.5 p_{a} N_{q} tanφ', subst: `0.5 × 100 × ${fx(r.Nq, 2)} × tan(${fx(Number(t.phi), 1)}°)`, value: fx(r.ql, 1), unit: 'kPa' },
      { lhs: 'q_{p}', expr: "min(σ′_{v} N_{q}; q_{l})", subst: `min(${fx(r.svTip! , 1)} × ${fx(r.Nq, 2)}; ${fx(r.ql, 1)})`, value: fx(r.qp, 1), unit: 'kPa' },
    )
  }
  tipSteps.push({ lhs: 'Q_{p}', expr: 'A_{p} q_{p}', subst: `${fx(r.Ap, 4)} × ${fx(r.qp, 1)}`, value: fx(r.Qp, 1), unit: 'kN' })
  const tip: Section = { title: 'Tahanan ujung', blocks: [{ k: 'calc', steps: tipSteps }] }

  const result: Section = {
    title: 'Daya dukung',
    strong: true,
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'Q_{u}', expr: 'Q_{p} + Q_{s}', subst: `${fx(r.Qp, 1)} + ${fx(r.Qs, 1)}`, value: fx(r.Qu, 1), unit: 'kN' },
          { desc: `Berat sendiri tiang ${r.inclW ? 'dikurangkan' : 'diabaikan'}`, lhs: 'W_{p}', expr: 'A_{p} L γ_{beton}', subst: `${fx(r.Ap, 4)} × ${fx(r.Leff, 2)} × 24`, value: fx(r.Wp, 1), unit: 'kN' },
          { lhs: 'Q_{izin}', expr: r.inclW ? '\\frac{Q_{u}}{FS} − W_{p}' : '\\frac{Q_{u}}{FS}', subst: `\\frac{${fx(r.Qu, 1)}}{${fx(r.FS, 2)}}${r.inclW ? ` − ${fx(r.Wp, 1)}` : ''}`, value: fx(r.Qallow, 1), unit: 'kN' },
        ],
      },
    ],
  }

  const sections = [data, shaft, tip, result]
  if (r.dq.active) {
    const d = r.dq
    const blocks: Block[] = [
      {
        k: 'calc',
        steps: [
          { lhs: 'N̄_{s}', desc: 'Rata-rata N sepanjang selimut (berbobot tebal)', value: fx(d.NsAvg, 2) },
          { lhs: 'f_{s}', expr: '10 (\\frac{N̄_{s}}{3} + 1)', value: fx(d.fsDq, 1), unit: 'kPa' },
          { lhs: 'Q_{s}', expr: 'keliling × L × f_{s}', value: fx(d.QsDq, 1), unit: 'kN' },
          { lhs: 'q_{p}', expr: `${d.C} N_{p}`, subst: `${d.C} × ${fx(d.Np, 0)}`, value: fx(d.qpDq, 1), unit: 'kPa' },
          { lhs: 'Q_{p}', expr: 'A_{p} q_{p}', value: fx(d.QpDq, 1), unit: 'kN' },
          { lhs: 'Q_{u,DQ}', expr: 'Q_{p} + Q_{s}', value: fx(d.QuDq, 1), unit: 'kN' },
          { lhs: 'Q_{izin,DQ}', expr: '\\frac{Q_{u,DQ}}{FS}', value: fx(d.Qallow, 1), unit: 'kN' },
        ],
      },
    ]
    sections.push({ title: 'Pembanding empiris — Decourt–Quaresma', blocks })
  }

  return {
    title: 'Daya Dukung Tiang Tunggal — Aksial Tekan',
    summary: [
      kv('Q_{s} / Q_{p}', `${fx(r.Qs, 1)} / ${fx(r.Qp, 1)} kN`),
      kv('Q_{u}', `${fx(r.Qu, 1)} kN`),
      kv(`Q_{izin} (FS ${fx(r.FS, 1)})`, `${fx(r.Qallow, 1)} kN`),
      ...(r.dq.active ? [kv('Q_{u} Decourt–Quaresma', `${fx(r.dq.QuDq, 1)} kN`)] : []),
    ],
    sections,
    warnings: r.warn,
    scope: [
      'Selimut: lempung α (API RP2A), pasir β (Meyerhof/Das), atau SPT Meyerhof; ujung: lempung 9 c_{u}, pasir Meyerhof, atau SPT.',
      'Belum termasuk: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan tiang, beban gempa. Verifikasi dengan uji beban/PDA oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildPileReport(i: PileUIInput): Report | null {
  const r = computePileUI(i)
  return r ? pileReport(r) : null
}

export default {
  defaults: PILE_DEFAULTS,
  build: (i: PileUIInput) => buildPileReport(i) ?? { title: 'Daya Dukung Tiang Tunggal', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
