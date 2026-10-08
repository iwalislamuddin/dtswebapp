import type { StairResult } from '../../calc/concrete-stair'
import { dimH, figRows } from '../../report/figure'
import { check, fx, kv, sci, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { computeStairUI, forceDiagram, STAIR_DEFAULTS, SUPPORTS, type StairUIInput } from './model'

// Laporan Desain Tangga Beton (pelat tangga + bordes dianalisis sebagai rangka 2D, SNI 2847:2019): geometri anak
// tangga, beban per elemen, reaksi & gaya dalam, desain tulangan, geser, lendutan dengan Ie.

export { STAIR_DEFAULTS }

const supLabel = (s: string) => SUPPORTS.find((o) => o.value === s)?.label.toLowerCase() ?? s

/** Gbr. 1 — elevasi tangga: bordes, anak tangga, tumpuan, dimensi. */
function figElevation(r: StairResult): Figure {
  const ops: FigOp[] = []
  const Ltot = r.Ltot!, H = r.H!
  const sc = Math.min(400 / (Ltot * 1000), 110 / (H * 1000))
  const x0 = 64, yB = 20 + H * 1000 * sc
  const P = (x: number, y: number): [number, number] => [x0 + x * sc, yB - y * sc]
  const n = r.nodes!
  ops.push({ t: 'poly', pts: n.map((p) => P(p[0], p[1])), lw: 2.2, c: 'ink' })
  // anak tangga di atas flight
  const xa = r.L1! * 1000, run = r.Tgo!, rise = r.Ract!
  const steps: [number, number][] = [P(xa, 0)]
  for (let k = 0; k < r.Nrise!; k++) {
    steps.push(P(xa + k * run, (k + 1) * rise), P(xa + (k + 1) * run, (k + 1) * rise))
  }
  ops.push({ t: 'poly', pts: steps, lw: 0.6, c: 'muted' })
  for (const [idx, sup] of [[r.idxA!, r.supA!], [r.idxB!, r.supB!]] as const) {
    const [x, y] = P(n[idx][0], n[idx][1])
    if (sup === 'jepit') ops.push({ t: 'line', x1: x, y1: y - 8, x2: x, y2: y + 8, lw: 2.4, c: 'support' })
    else ops.push({ t: 'poly', pts: [[x, y + 1], [x - 6, y + 11], [x + 6, y + 11]], fill: true, c: 'support', op: sup === 'rol' ? 0.15 : 0.45 })
  }
  let acc = 0
  const yd = yB + 22
  for (const [L, lab] of [[r.L1!, 'L_{1}'], [r.L2!, 'L_{2}'], [r.L3!, 'L_{3}']] as const) {
    if (L > 1e-6) dimH(ops, x0 + acc * 1000 * sc, x0 + (acc + L) * 1000 * sc, yd, `${lab} = ${fx(L, 2)}`)
    acc += L
  }
  ops.push({ t: 'text', x: P(n[n.length - 1][0], H * 1000)[0] + 8, y: yB - (H * 1000 * sc) / 2, s: `H = ${fx(H, 2)} m`, size: 7 })
  return {
    h: figRows(yd + 8),
    ops,
    alt: 'Elevasi tangga dan bordes',
    caption: `Gbr. 1 — Elevasi: ${r.Nrise} injakan R = ${fx(r.Ract, 1)} mm, G = ${fx(r.Tgo, 1)} mm, kemiringan θ = ${fx(r.thetaDeg, 1)}°; tumpuan A ${supLabel(r.supA!)}, B ${supLabel(r.supB!)} (bentang dalam m).`,
  }
}

/** Gbr. 2 — momen terfaktor terhadap jarak horizontal. */
function figMoment(r: StairResult): Figure {
  const ops: FigOp[] = []
  const pts = forceDiagram(r, 'Ms')
  const Ltot = r.Ltot!
  const x0 = 64, x1 = 470, y0 = 60
  const Mmax = Math.max(1e-9, ...pts.map((p) => Math.abs(p[1])))
  const X = (x: number) => x0 + (x / Ltot) * (x1 - x0), k = 46 / Mmax
  const poly: [number, number][] = pts.map(([x, m]) => [X(x), y0 + m * k])
  ops.push({ t: 'poly', pts: [[X(pts[0][0]), y0], ...poly, [X(pts[pts.length - 1][0]), y0]], fill: true, c: 'm', op: 0.16 })
  ops.push({ t: 'poly', pts: poly, lw: 1.3, c: 'm' })
  ops.push({ t: 'line', x1: X(0), y1: y0, x2: X(Ltot), y2: y0, lw: 0.6, c: 'muted' })
  const ext = pts.reduce((a, p) => (p[1] > a[1] ? p : a), pts[0])
  ops.push({ t: 'text', x: X(ext[0]), y: y0 + ext[1] * k + 10, s: fx(ext[1], 2), size: 7, align: 'c', bold: true })
  if (r.Mneg! > 0.005) {
    const neg = pts.reduce((a, p) => (p[1] < a[1] ? p : a), pts[0])
    ops.push({ t: 'text', x: X(neg[0]), y: y0 + neg[1] * k - 4, s: fx(neg[1], 2), size: 7, align: 'c', bold: true })
  }
  ops.push({ t: 'text', x: X(0) - 4, y: y0 + 3, s: 'M_{u}', size: 7, align: 'r', c: 'm' })
  ops.push({ t: 'text', x: X(Ltot), y: y0 + 60, s: 'x horizontal (m)', size: 6.5, align: 'r', c: 'muted' })
  return { h: figRows(y0 + 62), ops, alt: 'Diagram momen tangga', caption: 'Gbr. 2 — Momen terfaktor (kN·m per meter lebar, sagging positif ke bawah) terhadap jarak horizontal.' }
}

export function stairReport(r: StairResult): Report {
  const fl = r.flight!
  const sections: Section[] = [
    {
      title: 'Geometri',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'R = tinggi injakan rencana', lhs: 'n_{injakan}', expr: 'round(H/R)', value: String(r.Nrise) },
            { lhs: 'R_{aktual}', expr: 'H / n', value: fx(r.Ract, 1), unit: 'mm' },
            { lhs: 'G', expr: 'L_{2} / n', value: fx(r.Tgo, 1), unit: 'mm' },
            { lhs: 'θ', expr: 'atan(H/L_{2})', value: fx(r.thetaDeg, 2), unit: '°' },
            { lhs: '2R + G', value: fx(2 * r.Ract! + r.Tgo!, 0), unit: 'mm (nyaman 600–650)' },
          ],
        },
        { k: 'figure', fig: figElevation(r) },
      ],
    },
    {
      title: 'Beban per meter lebar',
      blocks: [
        { k: 'p', text: 'Beban flight dinyatakan per panjang miring batang (dikalikan cos θ dari beban per luas horizontal); γ_{c} = 24 kN/m^{3}.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'q_{waist}', expr: '24 t_{w}', value: fx(r.gWaist, 3), unit: 'kN/m' },
            { lhs: 'q_{anak tangga}', expr: '24 \\frac{R}{2} cos θ', value: fx(r.gSteps, 3), unit: 'kN/m' },
            { desc: 'Flight', lhs: 'w_{D} / w_{L}', expr: 'q_{waist} + q_{anak} + q_{D}cos θ / q_{L}cos θ', value: `${fx(fl.wD, 3)} / ${fx(fl.wL, 3)}`, unit: 'kN/m' },
            ...(r.wD_la != null ? [{ desc: 'Bordes', lhs: 'w_{D} / w_{L}', expr: 'q_{waist} + q_{D} / q_{L}', value: `${fx(r.wD_la, 3)} / ${fx(r.LL, 3)}`, unit: 'kN/m' }] : []),
            { desc: 'Terfaktor tiap elemen', lhs: 'w_{u}', expr: 'maks(1.4w_{D}; 1.2w_{D} + 1.6w_{L})', value: r.elems!.map((e) => fx(e.wv_u, 2)).join(' / '), unit: 'kN/m' },
          ],
        },
      ],
    },
    {
      title: 'Analisis rangka 2D',
      blocks: [
        { k: 'p', text: `Pelat tangga & bordes dimodelkan sebagai batang rangka 2D (EA, EI penuh, E_{c} = 4700√(f'_{c}) = ${fx(r.Ec, 0)} MPa) selebar 1 m; tumpuan A ${supLabel(r.supA!)}, B ${supLabel(r.supB!)}.` },
        {
          k: 'table',
          head: ['Batang', 'Jenis', 'L (m)', 'w_{u} (kN/m)', '|M|_{maks} (kN·m)', '|V|_{maks} (kN)', '|N|_{maks} (kN)'],
          align: ['l', 'l', 'r', 'r', 'r', 'r', 'r'],
          rows: r.U!.elems.map((ed, k) => [String(k + 1), ed.ref.kind === 'flight' ? 'flight (miring)' : 'bordes', fx(ed.ref.L / 1000, 3), fx(ed.ref.wv_u, 2), fx(ed.Mmax, 2), fx(ed.Vmax, 2), fx(ed.Nmax, 2)]),
        },
        {
          k: 'rows',
          rows: [
            kv('Reaksi A: R_{x} / R_{y} / M', `${fx(r.RA!.Rx, 2)} / ${fx(r.RA!.Ry, 2)} kN / ${fx(r.RA!.M, 2)} kN·m`),
            kv('Reaksi B: R_{x} / R_{y} / M', `${fx(r.RB!.Rx, 2)} / ${fx(r.RB!.Ry, 2)} kN / ${fx(r.RB!.M, 2)} kN·m`),
            kv('Kontrol ΣR_{y} = W_{u}', `${fx(r.sumRy, 2)} = ${fx(r.Wu, 2)} kN`),
          ],
        },
        { k: 'figure', fig: figMoment(r) },
      ],
    },
    {
      title: 'Desain tulangan (per meter lebar)',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'd', expr: 't_{w} − selimut − d_{b}/2', value: fx(r.d, 1), unit: 'mm' },
            { desc: 'Tulangan utama bawah (lapangan)', lhs: 'M_{u}^{+}', value: fx(r.Mpos, 2), unit: 'kN·m/m' },
            { lhs: 'A_{s}^{+}', expr: 'maks(A_{s,perlu}; A_{s,min})', subst: `maks(${fx(r.asPos!.As, 0)}; ${fx(r.asPos!.AsMin, 0)})`, value: `${fx(r.asPos!.AsReq, 0)} → D${r.db}-${r.asPos!.s}`, unit: 'mm^{2}/m' },
            ...(r.Mneg! > 0.005 ? [{ desc: 'Tulangan atas (tumpuan/patahan)', lhs: 'M_{u}^{−}', value: fx(r.Mneg, 2), unit: 'kN·m/m' }, { lhs: 'A_{s}^{−}', value: `${fx(r.asNeg!.AsReq, 0)} → D${r.db}-${r.asNeg!.s}`, unit: 'mm^{2}/m' }] : []),
            { desc: 'Tulangan bagi (susut-suhu)', lhs: 'A_{s,bagi}', value: `${fx(r.asDist!.AsReq, 0)} → D${r.dbDist}-${r.asDist!.s}`, unit: 'mm^{2}/m' },
          ],
        },
      ],
    },
    {
      title: 'Geser',
      blocks: [
        { k: 'calc', steps: [{ lhs: 'φV_{c}', expr: "0.75 × 0.17√(f'_{c}) b d", value: fx(r.phiVc, 2), unit: 'kN/m' }] },
        { k: 'rows', rows: [check(`|V_{u}| = ${fx(Math.abs(r.Vmax!), 2)} kN / φV_{c}`, r.dcrVc!)] },
      ],
    },
    {
      title: 'Lendutan (24.2)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'M_{cr} / M_{a}', value: `${fx(r.ie!.Mcr, 2)} / ${fx(r.ie!.Ma, 2)}`, unit: 'kN·m/m' },
            { lhs: 'I_{e}', expr: r.ie!.cracked ? '(M_{cr}/M_{a})^{3}I_{g} + [1 − (M_{cr}/M_{a})^{3}]I_{cr}' : 'I_{g}', value: sci(r.ie!.Ie), unit: 'mm^{4}/m' },
            { desc: 'Analisis rangka ulang dengan I_{e}, beban layan', lhs: 'δ_{maks}', value: `${fx(r.dCr, 2)} mm di x = ${fx(r.xdef, 2)} m` },
          ],
        },
        { k: 'rows', rows: [check(`δ / (L/360 = ${fx(r.limit360, 1)} mm)`, r.dCr! / r.limit360!), check(`δ / (L/250 = ${fx(r.limit250, 1)} mm)`, r.dCr! / r.limit250!)] },
      ],
    },
  ]

  return {
    title: 'Desain Tangga Beton (SNI 2847:2019)',
    summary: [
      kv('Tulangan utama bawah / atas', `D${r.db}-${r.asPos!.s} / ${r.Mneg! > 0.005 ? `D${r.db}-${r.asNeg!.s}` : '-'}`),
      kv('Tulangan bagi', `D${r.dbDist}-${r.asDist!.s}`),
      kv('M_{u}^{+} / M_{u}^{−}', `${fx(r.Mpos, 2)} / ${fx(r.Mneg, 2)} kN·m/m`),
      check('Geser |V_{u}| / φV_{c}', r.dcrVc!),
      check('Lendutan / L/360', r.dCr! / r.limit360!),
    ],
    sections,
    warnings: r.warn,
    scope: ['Tangga pelat (waist) tanpa balok tangga, beban merata per meter lebar; bordes menyatu. Belum termasuk: tumpuan elastis, getaran, beban terpusat. Verifikasi oleh insinyur penanggung jawab.'],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildStairReport(i: StairUIInput): Report | null {
  const r = computeStairUI(i)
  return r ? stairReport(r) : null
}

export default {
  defaults: STAIR_DEFAULTS,
  build: (i: StairUIInput) => buildStairReport(i) ?? { title: 'Desain Tangga Beton', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
