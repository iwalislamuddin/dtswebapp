import { KGCM2 } from '../../calc/shared/cpt'
import { dimV, figRows, niceStep } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { CPT_PILE_DEFAULTS, computeCptPileUI, type CptPileOk, type CptPileUIInput } from './model'

// Laporan Daya Dukung Tiang dari CPT/Sondir: ujung Schmertmann (4D bawah, 8D atas), selimut dari fs / Rf·qc,
// Q izin = Qp/FSp + Qs/FSs — rumus → substitusi → hasil.

export { CPT_PILE_DEFAULTS }

const MAX_TABLE = 60

/** Gbr. 1 — profil qc dan tiang; jendela rata-rata ujung (8D atas, 4D bawah) diarsir. */
function figProfile(r: CptPileOk): Figure {
  const ops: FigOp[] = []
  const zEnd = Math.max(r.zMax, r.Lp + 4 * r.D)
  const qMax = Math.max(...r.pts.map((p) => p.qc)) * 1.08
  const x0 = 80, x1 = 300, y0 = 24
  const sc = Math.min(190 / zEnd, 30)
  const X = (q: number) => x0 + (q / qMax) * (x1 - x0)
  const Y = (z: number) => y0 + z * sc
  const zUp = Math.max(0, r.Lp - 8 * r.D)
  ops.push({ t: 'rect', x: x0, y: Y(zUp), w: x1 - x0, h: (r.Lp - zUp) * sc, fill: true, c: 'accent', op: 0.15 })
  ops.push({ t: 'rect', x: x0, y: Y(r.Lp), w: x1 - x0, h: 4 * r.D * sc, fill: true, c: 'm', op: 0.15 })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: Y(zEnd), lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x1, y2: y0, lw: 0.6, c: 'muted' })
  const st = niceStep(qMax, 4)
  for (let q = 0; q <= qMax; q += st) ops.push({ t: 'text', x: X(q), y: y0 - 4, s: fx(q / 1000, st < 1000 ? 1 : 0), size: 6.5, align: 'c', c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y0 - 13, s: 'q_{c} (MPa)', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'poly', pts: r.pts.map((p) => [X(p.qc), Y(p.z)] as [number, number]), lw: 1.4, c: 'v' })
  const pw = Math.max(6, Math.min(r.D * sc * 1.6, 20))
  const cx = x1 + 60
  ops.push({ t: 'rect', x: cx - pw / 2, y: y0 - 8, w: pw, h: r.Lp * sc + 8, fill: true, c: 'support', op: 0.3 })
  ops.push({ t: 'rect', x: cx - pw / 2, y: y0 - 8, w: pw, h: r.Lp * sc + 8, lw: 1, c: 'support' })
  dimV(ops, y0, Y(r.Lp), cx + 30, '')
  ops.push({ t: 'text', x: cx + 36, y: (y0 + Y(r.Lp)) / 2 + 2.5, s: `L = ${fx(r.Lp, 1)} m`, size: 7 })
  ops.push({ t: 'text', x: x0 + 4, y: Y(zUp) + 9, s: `q_{c2} = ${fx(r.qc2 / 1000, 2)} MPa (8D atas)`, size: 6.5, c: 'muted' })
  ops.push({ t: 'text', x: x0 + 4, y: Y(r.Lp) + 9, s: `q_{c1} = ${fx(r.qc1 / 1000, 2)} MPa (4D bawah)`, size: 6.5, c: 'm' })
  return {
    h: figRows(Y(zEnd) + 14),
    ops,
    alt: 'Profil qc sondir dan tiang dengan jendela rata-rata ujung',
    caption: 'Gbr. 1 — Profil q_{c} dan tiang; jendela Schmertmann: 8D di atas ujung (jingga) dan 4D di bawah ujung (ungu).',
  }
}

export function cptPileReport(r: CptPileOk, unitLabel: string): Report {
  const shown = r.pts.slice(0, MAX_TABLE)
  const fsText = r.fsrc === 'data' ? 'kolom f_{s} sondir' : `R_{f} = ${fx(r.Rf, 2)}% × q_{c}`
  const steps: CalcStep[] = [
    { lhs: 'A_{p}', expr: r.shape === 'circle' ? 'π D^{2}/4' : 'D^{2}', value: fx(r.Ap, 4), unit: 'm²' },
    { lhs: 'K', expr: r.shape === 'circle' ? 'π D' : '4 D', value: fx(r.K, 3), unit: 'm' },
    { desc: 'Rata-rata q_{c} 4D di bawah ujung', lhs: 'q_{c1}', subst: `z = ${fx(r.Lp, 2)} … ${fx(r.Lp + 4 * r.D, 2)} m`, value: fx(r.qc1, 0), unit: 'kPa' },
    { desc: 'Rata-rata q_{c} 8D di atas ujung', lhs: 'q_{c2}', subst: `z = ${fx(Math.max(0, r.Lp - 8 * r.D), 2)} … ${fx(r.Lp, 2)} m`, value: fx(r.qc2, 0), unit: 'kPa' },
    { lhs: 'q_{p}', expr: '\\frac{q_{c1} + q_{c2}}{2}', subst: `\\frac{${fx(r.qc1, 0)} + ${fx(r.qc2, 0)}}{2}`, value: fx(r.qp, 0), unit: 'kPa' },
    { lhs: 'Q_{p}', expr: 'A_{p} q_{p}', subst: `${fx(r.Ap, 4)} × ${fx(r.qp, 0)}`, value: fx(r.Qp, 1), unit: 'kN' },
  ]
  const shaft: CalcStep[] = [
    { desc: `Gesekan selimut dari ${fsText}${r.capped ? ', dibatasi 120 kPa' : ''}; integral 200 pias sepanjang L`, lhs: 'Q_{s}', expr: '∫ f_{s} K dz', subst: `f_{s,maks} = ${fx(r.fsMax, 1)} kPa`, value: fx(r.Qs, 1), unit: 'kN' },
  ]
  const result: CalcStep[] = [
    { lhs: 'Q_{u}', expr: 'Q_{p} + Q_{s}', subst: `${fx(r.Qp, 1)} + ${fx(r.Qs, 1)}`, value: fx(r.Qu, 1), unit: 'kN' },
    { desc: 'Praktik sondir: faktor keamanan terpisah ujung dan selimut', lhs: 'Q_{izin}', expr: '\\frac{Q_{p}}{FS_{p}} + \\frac{Q_{s}}{FS_{s}}', subst: `\\frac{${fx(r.Qp, 1)}}{${fx(r.FSp, 1)}} + \\frac{${fx(r.Qs, 1)}}{${fx(r.FSs, 1)}}`, value: fx(r.Qall, 1), unit: 'kN' },
    { desc: 'Pembanding FS global 2,5', lhs: 'Q_{izin,global}', expr: '\\frac{Q_{u}}{2.5}', value: fx(r.QallGlobal, 1), unit: 'kN' },
  ]
  return {
    title: 'Daya Dukung Tiang dari CPT / Sondir',
    summary: [
      kv('Q_{p} / Q_{s}', `${fx(r.Qp, 1)} / ${fx(r.Qs, 1)} kN`),
      kv('Q_{u}', `${fx(r.Qu, 1)} kN`),
      kv(`Q_{izin} (FS ${fx(r.FSp, 1)} / ${fx(r.FSs, 1)})`, `${fx(r.Qall, 1)} kN`),
      ...(r.Pw > 0 ? [kv('P kerja / Q_{izin}', fx(r.dc, 2))] : []),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Tiang', `${r.shape === 'circle' ? 'bulat' : 'persegi'}, D = ${fx(r.D, 3)} m, L = ${fx(r.Lp, 2)} m`),
              kv('Gesekan selimut', fsText),
              kv('FS ujung / selimut', `${fx(r.FSp, 1)} / ${fx(r.FSs, 1)}`),
              ...(r.Pw > 0 ? [kv('Beban kerja', `${fx(r.Pw, 1)} kN`)] : []),
              kv('Data sondir', `${r.nPts} titik, z maks ${fx(r.zMax, 2)} m (input ${unitLabel}, dikonversi ke kPa)`),
            ],
          },
          {
            k: 'table',
            head: ['z (m)', 'q_{c} (kPa)', 'q_{c} (kg/cm²)', 'f_{s} (kPa)'],
            align: ['r', 'r', 'r', 'r'],
            rows: shown.map((p) => [fx(p.z, 2), fx(p.qc, 0), fx(p.qc / KGCM2, 1), p.fs == null ? '–' : fx(p.fs, 1)]),
            caption: r.pts.length > MAX_TABLE ? `${MAX_TABLE} titik pertama dari ${r.pts.length}.` : undefined,
          },
        ],
      },
      { title: 'Tahanan ujung — Schmertmann', blocks: [{ k: 'calc', steps }, { k: 'figure', fig: figProfile(r) }] },
      { title: 'Tahanan selimut', blocks: [{ k: 'calc', steps: shaft }] },
      { title: 'Daya dukung izin', strong: true, blocks: [{ k: 'calc', steps: result }, ...(r.Pw > 0 ? [{ k: 'rows' as const, rows: [check('P kerja / Q_{izin}', r.dc)] }] : [])] },
    ],
    governing: r.Pw > 0 ? { label: 'P kerja / Q_{izin}', ratio: r.dc } : undefined,
    warnings: r.warn,
    scope: [
      'Ujung: rata-rata Schmertmann–Nottingham disederhanakan (4D bawah, 8D atas); selimut dari f_{s} sondir atau R_{f} q_{c}; Q izin = Q_{p}/FS_{p} + Q_{s}/FS_{s}.',
      'Kapasitas struktural penampang tiang (bahan) dan penurunan tiang tidak dicek. Verifikasi dengan uji beban oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildCptPileReport(i: CptPileUIInput): Report | null {
  const r = computeCptPileUI(i)
  return r ? cptPileReport(r, i.unit === 'mpa' ? 'MPa' : 'kg/cm²') : null
}

export default {
  defaults: CPT_PILE_DEFAULTS,
  build: (i: CptPileUIInput) => buildCptPileReport(i) ?? { title: 'Daya Dukung Tiang (CPT)', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
