import { dimH, dimV, figRows } from '../../report/figure'
import { fx, kv, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { chartFigure, fq } from '../_hydraulics/figure'
import {
  CHANNEL_DEFAULTS,
  computeChannelUI,
  MAT_LABEL,
  ratingCurve,
  sectionShape,
  SHAPE_LABEL,
  usesB,
  usesM,
  type ChannelOk,
  type ChannelUIInput,
} from './model'

// Laporan Saluran Terbuka — persamaan Manning (aliran seragam): geometri basah, kecepatan & debit, kedalaman normal
// (mode dari Q), kedalaman kritis, angka Froude.

export { CHANNEL_DEFAULTS }

/** Gbr. 1 — penampang dengan muka air y, garis kedalaman kritis yc, dan dimensi. */
function figSection(r: ChannelOk): Figure {
  const ops: FigOp[] = []
  const sh = sectionShape(r)
  const cx = 250, yB = 150, maxW = 260, maxH = 120
  const sc = Math.min(maxW / (2 * sh.halfTop), maxH / sh.Hb)
  const P = (q: [number, number]): [number, number] => [cx + q[0] * sc, yB - q[1] * sc]
  ops.push({ t: 'poly', pts: sh.water.map(P), close: true, fill: true, c: 'v', op: 0.22 })
  const wy = yB - r.y * sc, half = r.T / 2
  ops.push({ t: 'line', x1: cx - half * sc, y1: wy, x2: cx + half * sc, y2: wy, lw: 1, c: 'v' })
  ops.push({ t: 'poly', pts: sh.wall.map(P), close: r.shape === 'circle', lw: 1.4, c: 'support' })
  if (r.yc !== null && r.yc < sh.Hb) {
    const ycy = yB - r.yc * sc
    ops.push({ t: 'line', x1: cx - sh.halfTop * sc - 10, y1: ycy, x2: cx + sh.halfTop * sc + 10, y2: ycy, lw: 0.7, c: 'load', dash: [4, 2] })
    ops.push({ t: 'text', x: cx + sh.halfTop * sc + 14, y: ycy + 2.5, s: `y_{c} = ${fx(r.yc, 3)} m`, size: 7, c: 'load' })
  }
  dimV(ops, wy, yB, cx - sh.halfTop * sc - 26, '')
  ops.push({ t: 'text', x: cx - sh.halfTop * sc - 32, y: (wy + yB) / 2 + 2.5, s: `y = ${fx(r.y, 3)} m`, size: 7, align: 'r' })
  if (r.shape !== 'circle') dimH(ops, cx - half * sc, cx + half * sc, wy - 8, `T = ${fx(r.T, 3)} m`)
  else ops.push({ t: 'text', x: cx, y: wy - 3, s: `T = ${fx(r.T, 3)} m`, size: 7, align: 'c', c: 'v' })
  if (usesB(r.shape)) dimH(ops, cx - (r.b / 2) * sc, cx + (r.b / 2) * sc, yB + 14, `b = ${fx(r.b, 2)} m`)
  if (usesM(r.shape)) ops.push({ t: 'text', x: cx + sh.halfTop * sc - 4, y: yB - sh.Hb * sc - 5, s: `1 : ${fx(r.m, 2)} (V : H)`, size: 7, align: 'r', c: 'muted' })
  if (r.shape === 'circle') dimH(ops, cx - (r.D / 2) * sc, cx + (r.D / 2) * sc, yB + 14, `D = ${fx(r.D, 3)} m`)
  return {
    h: figRows(yB + 24),
    ops,
    alt: 'Penampang saluran dengan muka air dan kedalaman kritis',
    caption: `Gbr. 1 — Penampang ${SHAPE_LABEL[r.shape].toLowerCase()}, aliran seragam y = ${fx(r.y, 3)} m (${r.regime}).`,
  }
}

function geometrySteps(r: ChannelOk): CalcStep[] {
  const y = fx(r.y, 4), b = fx(r.b, 3), m = fx(r.m, 3), D = fx(r.D, 3)
  const A = fx(r.A, 4), P = fx(r.P, 4), T = fx(r.T, 4)
  if (r.shape === 'rect')
    return [
      { lhs: 'A', expr: 'b y', subst: `${b} × ${y}`, value: A, unit: 'm²' },
      { lhs: 'P', expr: 'b + 2y', subst: `${b} + 2 × ${y}`, value: P, unit: 'm' },
      { lhs: 'T', expr: 'b', value: T, unit: 'm' },
    ]
  if (r.shape === 'trap')
    return [
      { lhs: 'A', expr: '(b + m y) y', subst: `(${b} + ${m} × ${y}) × ${y}`, value: A, unit: 'm²' },
      { lhs: 'P', expr: 'b + 2y √(1 + m^{2})', subst: `${b} + 2 × ${y} × √(1 + ${m}^{2})`, value: P, unit: 'm' },
      { lhs: 'T', expr: 'b + 2m y', subst: `${b} + 2 × ${m} × ${y}`, value: T, unit: 'm' },
    ]
  if (r.shape === 'tri')
    return [
      { lhs: 'A', expr: 'm y^{2}', subst: `${m} × ${y}^{2}`, value: A, unit: 'm²' },
      { lhs: 'P', expr: '2y √(1 + m^{2})', subst: `2 × ${y} × √(1 + ${m}^{2})`, value: P, unit: 'm' },
      { lhs: 'T', expr: '2m y', subst: `2 × ${m} × ${y}`, value: T, unit: 'm' },
    ]
  const th = 2 * Math.acos(1 - (2 * r.y) / r.D), t = fx(th, 4)
  return [
    { desc: 'Sudut pusat muka air', lhs: 'θ', expr: '2 arccos(1 − \\frac{2y}{D})', subst: `2 arccos(1 − \\frac{2 × ${y}}{${D}})`, value: t, unit: 'rad' },
    { lhs: 'A', expr: '\\frac{D^{2}}{8} (θ − sin θ)', subst: `\\frac{${D}^{2}}{8} × (${t} − sin ${t})`, value: A, unit: 'm²' },
    { lhs: 'P', expr: '\\frac{D θ}{2}', subst: `\\frac{${D} × ${t}}{2}`, value: P, unit: 'm' },
    { lhs: 'T', expr: 'D sin(θ/2)', subst: `${D} × sin(${t}/2)`, value: T, unit: 'm' },
  ]
}

export function channelReport(r: ChannelOk): Report {
  const fromQ = r.mode === 'fromQ'
  const dims = [
    usesB(r.shape) ? `b = ${fx(r.b, 3)} m` : null,
    usesM(r.shape) ? `m = ${fx(r.m, 3)} (H : 1V)` : null,
    r.shape === 'circle' ? `D = ${fx(r.D, 3)} m` : null,
  ].filter(Boolean).join(', ')
  return {
    title: 'Saluran Terbuka — Persamaan Manning',
    summary: [
      kv(fromQ ? 'Kedalaman normal y_{n}' : 'Debit kapasitas Q', fromQ ? `${fx(r.y, 3)} m` : `${fq(r.Q, 4)} m³/s`),
      kv('Kecepatan V', `${fx(r.V, 3)} m/s`),
      kv('Angka Froude', `${fx(r.Fr, 3)} (${r.regime})`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Penampang', `${SHAPE_LABEL[r.shape]}${dims ? ', ' + dims : ''}`),
              kv('Koefisien Manning n', `${fx(r.n, 4)} (${MAT_LABEL[r.mat] ?? 'kustom'})`),
              kv('Kemiringan dasar S', `${fx(r.S, 5)} m/m`),
              kv(fromQ ? 'Debit rencana Q' : 'Kedalaman air y', fromQ ? `${fq(r.Q, 4)} m³/s` : `${fx(r.y, 3)} m`),
            ],
          },
        ],
      },
      {
        title: 'Geometri basah',
        blocks: [
          ...(fromQ
            ? [{ k: 'p' as const, text: `Kedalaman normal dicari numerik (biseksi) sehingga debit Manning pada y sama dengan Q = ${fq(r.Q, 4)} m³/s: y_{n} = ${fx(r.y, 4)} m.` }]
            : []),
          { k: 'calc', steps: [...geometrySteps(r), { desc: 'Jari-jari hidraulik', lhs: 'R', expr: '\\frac{A}{P}', subst: `\\frac{${fx(r.A, 4)}}{${fx(r.P, 4)}}`, value: fx(r.R, 4), unit: 'm' }] },
          { k: 'figure', fig: figSection(r) },
        ],
      },
      {
        title: 'Kecepatan & debit',
        strong: true,
        blocks: [
          {
            k: 'calc',
            steps: [
              {
                desc: 'Persamaan Manning (aliran seragam)',
                lhs: 'V',
                expr: '\\frac{1}{n} R^{2/3} S^{1/2}',
                subst: `\\frac{1}{${fx(r.n, 4)}} × ${fx(r.R, 4)}^{2/3} × ${fx(r.S, 5)}^{1/2}`,
                value: fx(r.V, 3),
                unit: 'm/s',
              },
              { lhs: 'Q', expr: 'V A', subst: `${fx(r.V, 3)} × ${fx(r.A, 4)}`, value: fq(r.Q, 4), unit: 'm³/s' },
            ],
          },
          {
            k: 'figure',
            fig: chartFigure({
              series: [{ pts: ratingCurve(r), c: 'v', label: 'Q(y)' }],
              marks: [{ x: r.Q, y: r.y, c: 'load', label: `y ${fx(r.y, 3)} m · Q ${fq(r.Q, 3)} m³/s` }],
              xLabel: 'Debit Q (m³/s)',
              yLabel: 'Kedalaman y (m)',
              alt: 'Kurva debit terhadap kedalaman (rating curve)',
              caption: `Gbr. 2 — Kurva debit Manning (n = ${fx(r.n, 4)}, S = ${fx(r.S, 5)}).`,
            }),
          },
        ],
      },
      {
        title: 'Kedalaman kritis & rezim aliran',
        blocks: [
          {
            k: 'calc',
            steps: [
              {
                desc: 'Kedalaman kritis: kondisi energi spesifik minimum',
                lhs: 'y_{c}',
                expr: '\\frac{Q^{2} T}{g A^{3}} = 1',
                value: r.yc === null ? 'tidak terkurung' : fx(r.yc, 3),
                unit: r.yc === null ? undefined : 'm',
              },
              {
                lhs: 'Fr',
                expr: '\\frac{V}{√(g A / T)}',
                subst: `\\frac{${fx(r.V, 3)}}{√(9.81 × ${fx(r.A, 4)} / ${fx(r.T, 4)})}`,
                value: fx(r.Fr, 3),
              },
            ],
          },
          { k: 'p', text: `Rezim: ${r.regime} (Fr < 0,95 subkritis; > 1,05 superkritis). ${r.yc !== null ? (r.y > r.yc ? 'y > y_{c}.' : 'y < y_{c}.') : ''}` },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'Aliran seragam tetap (Manning), kemiringan dasar kecil, n konstan sepanjang keliling basah. Lingkaran terisi sebagian = gorong-gorong gravitasi (y < D).',
      'Belum termasuk: tinggi jagaan, aliran berubah lambat (backwater), loncatan hidraulik, n komposit, kehilangan di inlet/outlet gorong-gorong. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildChannelReport(i: ChannelUIInput): Report | null {
  const r = computeChannelUI(i)
  return r ? channelReport(r) : null
}

export default {
  defaults: CHANNEL_DEFAULTS,
  build: (i: ChannelUIInput) => buildChannelReport(i) ?? { title: 'Saluran Terbuka (Manning)', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
