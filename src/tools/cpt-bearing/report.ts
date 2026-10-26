import { KGCM2 } from '../../calc/shared/cpt'
import { dimV, figRows, niceStep } from '../../report/figure'
import { check, fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { CPT_BEARING_DEFAULTS, computeCptBearingUI, type CptBearingOk, type CptBearingUIInput } from './model'

// Laporan Daya Dukung CPT: qc rata-rata di zona pengaruh Df..Df+B, lalu Meyerhof (pasir, penurunan 25 mm) atau
// su dari qc + Skempton (lempung) — rumus → substitusi → hasil.

export { CPT_BEARING_DEFAULTS }

const MAX_TABLE = 60

/** Gbr. 1 — profil qc terhadap kedalaman, dasar fondasi, dan zona pengaruh Df..Df+B. */
function figProfile(r: CptBearingOk): Figure {
  const ops: FigOp[] = []
  const zEnd = Math.max(r.zMax, r.Df + r.B)
  const qMax = Math.max(...r.pts.map((p) => p.qc), r.qcb) * 1.08
  const x0 = 80, x1 = 300, y0 = 24
  const sc = Math.min(180 / zEnd, 30)
  const X = (q: number) => x0 + (q / qMax) * (x1 - x0)
  const Y = (z: number) => y0 + z * sc
  ops.push({ t: 'rect', x: x0, y: Y(r.Df), w: x1 - x0, h: r.B * sc, fill: true, c: 'accent', op: 0.18 })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: Y(zEnd), lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x1, y2: y0, lw: 0.6, c: 'muted' })
  const st = niceStep(qMax, 4)
  for (let q = 0; q <= qMax; q += st) ops.push({ t: 'text', x: X(q), y: y0 - 4, s: fx(q / 1000, st < 1000 ? 1 : 0), size: 6.5, align: 'c', c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y0 - 13, s: 'q_{c} (MPa)', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'poly', pts: r.pts.map((p) => [X(p.qc), Y(p.z)] as [number, number]), lw: 1.4, c: 'v' })
  ops.push({ t: 'line', x1: X(r.qcb), y1: Y(r.Df), x2: X(r.qcb), y2: Y(r.Df + r.B), lw: 1.4, c: 'load', dash: [4, 2] })
  ops.push({ t: 'text', x: X(r.qcb) + 5, y: Y(r.Df + r.B / 2) + 2.5, s: `q̄_{c} = ${fx(r.qcb / 1000, 2)} MPa`, size: 7, c: 'load' })
  const bw = Math.min(r.B * sc * 1.2, 90)
  const cx = x1 + 70
  ops.push({ t: 'line', x1: x0, y1: Y(r.Df), x2: cx + bw / 2 + 6, y2: Y(r.Df), lw: 0.8, c: 'support', dash: [3, 2] })
  ops.push({ t: 'rect', x: cx - bw / 2, y: Y(r.Df) - 8, w: bw, h: 8, fill: true, c: 'support', op: 0.3 })
  ops.push({ t: 'rect', x: cx - bw / 2, y: Y(r.Df) - 8, w: bw, h: 8, lw: 1, c: 'support' })
  dimV(ops, y0, Y(r.Df), x0 - 22, '')
  ops.push({ t: 'text', x: x0 - 28, y: (y0 + Y(r.Df)) / 2 + 2.5, s: `Df = ${fx(r.Df, 2)} m`, size: 7, align: 'r' })
  dimV(ops, Y(r.Df), Y(r.Df + r.B), x0 - 22, '')
  ops.push({ t: 'text', x: x0 - 28, y: Y(r.Df + r.B / 2) + 2.5, s: `B = ${fx(r.B, 2)} m`, size: 7, align: 'r' })
  return {
    h: figRows(Y(zEnd) + 14),
    ops,
    alt: 'Profil qc sondir, dasar fondasi dan zona pengaruh',
    caption: 'Gbr. 1 — Profil q_{c}; zona pengaruh D_{f} s.d. D_{f} + B diarsir, garis putus-putus = q̄_{c}.',
  }
}

export function cptBearingReport(r: CptBearingOk, unitLabel: string): Report {
  const shown = r.pts.slice(0, MAX_TABLE)
  const data: Block[] = [
    {
      k: 'rows',
      rows: [
        kv('B × L', `${fx(r.B, 2)} × ${fx(r.L, 2)} m`),
        kv('D_{f} / γ (di atas dasar)', `${fx(r.Df, 2)} m / ${fx(r.gamma, 1)} kN/m³`),
        kv('Jenis tanah', r.soil === 'sand' ? 'pasir' : 'lempung'),
        ...(r.soil === 'clay' ? [kv('N_{k} / FS', `${fx(r.Nk, 1)} / ${fx(r.FS, 1)}`)] : []),
        ...(r.qw > 0 ? [kv('Tekanan kerja neto', `${fx(r.qw, 1)} kPa`)] : []),
        kv('Data sondir', `${r.nPts} titik, z maks ${fx(r.zMax, 2)} m (input ${unitLabel}, dikonversi ke kPa)`),
      ],
    },
    {
      k: 'table',
      head: ['z (m)', 'q_{c} (kPa)', 'q_{c} (kg/cm²)'],
      align: ['r', 'r', 'r'],
      rows: shown.map((p) => [fx(p.z, 2), fx(p.qc, 0), fx(p.qc / KGCM2, 1)]),
      caption: r.pts.length > MAX_TABLE ? `${MAX_TABLE} titik pertama dari ${r.pts.length}.` : undefined,
    },
  ]

  const steps: CalcStep[] = [
    { desc: 'Rata-rata q_{c} pada zona pengaruh D_{f} s.d. D_{f} + B (interpolasi linear, 60 pias)', lhs: 'q̄_{c}', subst: `z = ${fx(r.Df, 2)} … ${fx(r.Df + r.B, 2)} m`, value: fx(r.qcb, 0), unit: 'kPa' },
    { lhs: 'σ_{v0}', expr: 'γ D_{f}', subst: `${fx(r.gamma, 1)} × ${fx(r.Df, 2)}`, value: fx(r.sigv0, 1), unit: 'kPa' },
  ]
  if (r.soil === 'sand') {
    const kd = r.Kd!
    steps.push(
      { desc: 'Faktor kedalaman, maksimum 1,33', lhs: 'K_{d}', expr: 'min(1 + 0.33 \\frac{D_{f}}{B}; 1.33)', subst: `min(1 + 0.33 × ${fx(r.Df, 2)}/${fx(r.B, 2)}; 1.33)`, value: fx(kd, 3) },
      r.B <= 1.2
        ? { desc: 'B ≤ 1,2 m', lhs: 'q_{a,net}', expr: '\\frac{q̄_{c}}{15} K_{d}', subst: `\\frac{${fx(r.qcb, 0)}}{15} × ${fx(kd, 3)}`, value: fx(r.qaNet, 1), unit: 'kPa' }
        : { desc: 'B > 1,2 m', lhs: 'q_{a,net}', expr: '\\frac{q̄_{c}}{25} (\\frac{B + 0.3}{B})^{2} K_{d}', subst: `\\frac{${fx(r.qcb, 0)}}{25} × (\\frac{${fx(r.B, 2)} + 0.3}{${fx(r.B, 2)}})^{2} × ${fx(kd, 3)}`, value: fx(r.qaNet, 1), unit: 'kPa' },
    )
  } else {
    steps.push(
      { lhs: 's_{u}', expr: '\\frac{q̄_{c} − σ_{v0}}{N_{k}}', subst: `\\frac{${fx(r.qcb, 0)} − ${fx(r.sigv0, 1)}}{${fx(r.Nk, 1)}}`, value: fx(r.su, 1), unit: 'kPa' },
      { lhs: 'q_{ult,net}', expr: '5 s_{u} (1 + 0.2 \\frac{D_{f}}{B})(1 + 0.2 \\frac{B}{L})', subst: `5 × ${fx(r.su, 1)} × (1 + 0.2 × ${fx(r.dfb, 2)}) × (1 + 0.2 × ${fx(r.B, 2)}/${fx(r.L, 2)})`, value: fx(r.qult, 1), unit: 'kPa' },
      { lhs: 'q_{a,net}', expr: '\\frac{q_{ult,net}}{FS}', subst: `\\frac{${fx(r.qult, 1)}}{${fx(r.FS, 1)}}`, value: fx(r.qaNet, 1), unit: 'kPa' },
    )
  }
  steps.push({ lhs: 'q_{a,bruto}', expr: 'q_{a,net} + σ_{v0}', subst: `${fx(r.qaNet, 1)} + ${fx(r.sigv0, 1)}`, value: fx(r.qaGross, 1), unit: 'kPa' })

  return {
    title: 'Daya Dukung Fondasi Dangkal dari CPT / Sondir',
    summary: [
      kv('q̄_{c} (zona pengaruh)', `${fx(r.qcb / 1000, 2)} MPa`),
      kv('q_{a,net}', `${fx(r.qaNet, 1)} kPa`),
      kv('q_{a,bruto}', `${fx(r.qaGross, 1)} kPa`),
      ...(r.qw > 0 ? [kv('q kerja / q_{a,net}', fx(r.dc, 2))] : []),
    ],
    sections: [
      { title: 'Data', blocks: data },
      { title: r.soil === 'sand' ? 'Pasir — Meyerhof (1956), penurunan 25 mm' : 'Lempung — s_{u} dari q_{c} + Skempton', blocks: [{ k: 'calc', steps }, { k: 'figure', fig: figProfile(r) }, ...(r.qw > 0 ? [{ k: 'rows' as const, rows: [check('q kerja / q_{a,net}', r.dc)] }] : [])] },
    ],
    governing: r.qw > 0 ? { label: 'q kerja / q_{a,net}', ratio: r.dc } : undefined,
    warnings: r.warn,
    scope: [
      'Pasir: q_{a} neto berbasis penurunan 25 mm (Meyerhof, SI Bowles); lempung: s_{u} = (q̄_{c} − σ_{v0})/N_{k} dan daya dukung Skempton.',
      'Belum termasuk: muka air tanah otomatis (σ_{v0} memakai γ total), penurunan konsolidasi lempung, CPTu (q_{t}), lapisan campuran.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildCptBearingReport(i: CptBearingUIInput): Report | null {
  const r = computeCptBearingUI(i)
  return r ? cptBearingReport(r, i.unit === 'mpa' ? 'MPa' : 'kg/cm²') : null
}

export default {
  defaults: CPT_BEARING_DEFAULTS,
  build: (i: CptBearingUIInput) => buildCptBearingReport(i) ?? { title: 'Daya Dukung Tanah (CPT)', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
