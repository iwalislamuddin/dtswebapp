import { puAt } from '../../calc/py-analysis'
import { figRows, niceStep } from '../../report/figure'
import { fx, kv, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { PY_DEFAULTS, computePyUI, pyProfile, type PyOk, type PyUIInput } from './model'

// Laporan Analisis P-Y: tiang sebagai balok di atas pegas tak-linear (Winkler), beda-hingga 60 elemen dengan
// iterasi sekan dan beban bertahap 10 langkah — parameter, hasil kepala tiang, profil defleksi/momen/reaksi.

export { PY_DEFAULTS }

/** Satu panel profil (nilai horizontal, kedalaman ke bawah) pada kotak x0..x0+w, y0..y0+h. */
function panel(ops: FigOp[], x0: number, y0: number, w: number, h: number, z: number[], v: number[], title: string, unit: string, c: 'v' | 'm' | 'y') {
  const vmax = Math.max(...v.map(Math.abs), 1e-9)
  const vmin = Math.min(0, ...v), vhi = Math.max(0, ...v)
  const span = vhi - vmin || 1
  const X = (a: number) => x0 + ((a - vmin) / span) * w
  const Y = (zz: number) => y0 + (zz / z[z.length - 1]) * h
  ops.push({ t: 'rect', x: x0, y: y0, w, h, lw: 0.5, c: 'muted' })
  ops.push({ t: 'line', x1: X(0), y1: y0, x2: X(0), y2: y0 + h, lw: 0.6, c: 'muted', dash: [3, 2] })
  ops.push({ t: 'poly', pts: z.map((zz, k) => [X(v[k]), Y(zz)] as [number, number]), lw: 1.3, c })
  const k = v.findIndex((a) => Math.abs(a) === vmax)
  ops.push({ t: 'text', x: x0 + w / 2, y: y0 - 4, s: `${title} (${unit})`, size: 7, align: 'c' })
  ops.push({ t: 'text', x: Math.min(X(v[k]) + 3, x0 + w - 2), y: Y(z[k]) + (k === 0 ? 9 : -3), s: fx(v[k], 1), size: 6.5, align: X(v[k]) > x0 + w * 0.6 ? 'r' : 'l', c })
}

/** Gbr. 1 — profil defleksi, momen, reaksi tanah sepanjang tiang. */
function figProfiles(r: PyOk): Figure {
  const ops: FigOp[] = []
  const pr = pyProfile(r)
  const h = 190, y0 = 22, w = 140
  panel(ops, 30, y0, w, h, pr.z, pr.y, 'Defleksi y', 'mm', 'v')
  panel(ops, 30 + w + 40, y0, w, h, pr.z, pr.M, 'Momen M', 'kN·m', 'm')
  panel(ops, 30 + 2 * (w + 40), y0, w, h, pr.z, pr.p, 'Reaksi tanah p', 'kN/m', 'y')
  ops.push({ t: 'text', x: 26, y: y0 + 7, s: '0', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: 26, y: y0 + h, s: `${fx(r.L, 1)} m`, size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(y0 + h + 14),
    ops,
    alt: 'Profil defleksi, momen dan reaksi tanah sepanjang tiang',
    caption: `Gbr. 1 — Profil sepanjang tiang pada H = ${fx(r.H, 1)} kN (kedalaman ke bawah, 0 = muka tanah).`,
  }
}

/** Gbr. 2 — kurva beban kepala H terhadap defleksi kepala y0. */
function figCurve(r: PyOk): Figure {
  const ops: FigOp[] = []
  const x0 = 70, x1 = 400, y0 = 14, y1 = 150
  const ymax = Math.max(...r.curve.map((p) => Math.abs(p.y0)), 1e-9) * 1.05
  const hmax = r.H * 1.05
  const X = (y: number) => x0 + (Math.abs(y) / ymax) * (x1 - x0)
  const Y = (hh: number) => y1 - (hh / hmax) * (y1 - y0)
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y1, x2: x1, y2: y1, lw: 0.6, c: 'muted' })
  const sx = niceStep(ymax, 5), sy = niceStep(hmax, 4)
  for (let a = 0; a <= ymax; a += sx) ops.push({ t: 'text', x: X(a), y: y1 + 10, s: fx(a, sx < 1 ? 1 : 0), size: 6.5, align: 'c', c: 'muted' })
  for (let a = 0; a <= hmax; a += sy) ops.push({ t: 'text', x: x0 - 4, y: Y(a) + 2.5, s: fx(a, 0), size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y1 + 21, s: 'y₀ (mm)', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: x0 + 4, y: y0 + 7, s: 'H (kN)', size: 6.5, c: 'muted' })
  ops.push({ t: 'poly', pts: r.curve.map((p) => [X(p.y0), Y(p.H)] as [number, number]), lw: 1.4, c: 'v' })
  for (const p of r.curve) ops.push({ t: 'circle', cx: X(p.y0), cy: Y(p.H), r: 1.8, fill: true, c: 'v' })
  return { h: figRows(y1 + 26), ops, alt: 'Kurva beban lateral terhadap defleksi kepala tiang', caption: 'Gbr. 2 — Kurva H–y_{0} (10 langkah beban); kemiringan menurun menandakan tanah menuju leleh.' }
}

export function pyReport(r: PyOk): Report {
  const clay = r.soil === 'clay'
  const free = r.head === 'free'
  const P = r.P
  const params: CalcStep[] = [
    { lhs: 'I', expr: 'π D^{4}/64', subst: `π × ${fx(r.D, 3)}^{4}/64`, value: r.I.toExponential(4), unit: 'm⁴' },
    { lhs: 'EI', expr: 'E I', subst: `${fx(r.E, 0)} MPa × ${r.I.toExponential(3)}`, value: fx(r.EI, 0), unit: 'kN·m²' },
    { desc: free ? 'Kepala bebas: momen di kepala' : 'Kepala jepit: kemiringan kepala = 0', lhs: 'M_{0}', expr: 'M + H e', subst: `${fx(r.M, 1)} + ${fx(r.H, 1)} × ${fx(r.e, 2)}`, value: fx(r.M0, 1), unit: 'kN·m' },
  ]
  if (clay) {
    params.push(
      { desc: 'Matlock (1970), lempung lunak, beban statik', lhs: 'y_{50}', expr: '2.5 ε_{50} D', subst: `2.5 × ${fx(r.eps50, 4)} × ${fx(r.D, 3)}`, value: fx((r.y50 as number) * 1000, 2), unit: 'mm' },
      { desc: 'p_{u} = min[(3 + γ′z/c_{u} + 0,5 z/D); 9] c_{u} D;  p = 0,5 p_{u} (y/y_{50})^{1/3}, p ≤ p_{u}', lhs: 'p_{u} di 0,5D', value: fx(r.puTop, 1), unit: 'kN/m' },
    )
  } else {
    params.push(
      { desc: 'API RP2A / Reese, koefisien dari φ', lhs: 'C_{1}, C_{2}, C_{3}', subst: `φ = ${fx(r.phi, 1)}°`, value: `${fx(r.C1, 3)}, ${fx(r.C2, 3)}, ${fx(r.C3, 3)}` },
      { desc: 'p_{u} = min[(C_{1} z + C_{2} D); C_{3} D] γ′ z;  p = A p_{u} tanh(k z y/(A p_{u})), A = max(3 − 0,8 z/D; 0,9)', lhs: 'k', value: fx(r.kpy, 1), unit: 'MN/m³' },
      { lhs: 'p_{u} di 0,5D', value: fx(r.puTop, 1), unit: 'kN/m' },
    )
  }
  const result: CalcStep[] = [
    { lhs: 'y_{0}', desc: 'Defleksi kepala tiang', value: fx(r.y0, 2), unit: 'mm' },
    { lhs: 'θ_{0}', desc: 'Rotasi kepala', value: fx(r.slope0, 5), unit: 'rad' },
    { lhs: 'y_{maks}', desc: `Pada z = ${fx(r.ymaxZ, 2)} m`, value: fx(r.ymax, 2), unit: 'mm' },
    { lhs: 'M_{maks}', desc: `Pada z = ${fx(r.MmaxZ, 2)} m`, value: fx(r.Mmax, 1), unit: 'kN·m' },
  ]
  const pr = pyProfile(r)
  const idx: number[] = []
  for (let k = 0; k < pr.z.length; k += 6) idx.push(k)
  return {
    title: 'Analisis P-Y — Tiang Dibebani Lateral',
    summary: [
      kv('Defleksi kepala y_{0}', `${fx(r.y0, 2)} mm`),
      kv('M_{maks}', `${fx(r.Mmax, 1)} kN·m pada z = ${fx(r.MmaxZ, 2)} m`),
      kv('y_{maks}', `${fx(r.ymax, 2)} mm pada z = ${fx(r.ymaxZ, 2)} m`),
      kv('Konvergensi', r.conv ? 'tercapai' : 'belum penuh'),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Tanah', clay ? `lempung lunak (Matlock): c_{u} = ${fx(r.cu, 1)} kPa, ε_{50} = ${fx(r.eps50, 4)}` : `pasir (API): φ = ${fx(r.phi, 1)}°, k = ${fx(r.kpy, 1)} MN/m³`),
              kv('γ′', `${fx(r.gam, 1)} kN/m³`),
              kv('Tiang', `D = ${fx(r.D * 1000, 0)} mm, L = ${fx(r.L, 1)} m, E = ${fx(r.E, 0)} MPa`),
              kv('Kepala / beban', `${free ? 'bebas' : 'jepit'} / H = ${fx(r.H, 1)} kN, M = ${fx(r.M, 1)} kN·m, e = ${fx(r.e, 2)} m`),
            ],
          },
        ],
      },
      { title: 'Kekakuan tiang & kurva p–y', blocks: [{ k: 'calc', steps: params }] },
      {
        title: 'Hasil analisis',
        strong: true,
        blocks: [
          { k: 'p', text: 'EI y′′′′ + p(y, z) = 0 diselesaikan dengan beda-hingga 60 elemen; modulus sekan diperbarui sampai konvergen (under-relaksasi 0,5), beban dinaikkan bertahap 10 langkah.' },
          { k: 'calc', steps: result },
          {
            k: 'table',
            head: ['z (m)', 'y (mm)', 'M (kN·m)', 'p (kN/m)', 'p_{u} (kN/m)'],
            align: ['r', 'r', 'r', 'r', 'r'],
            rows: idx.map((k) => [fx(pr.z[k], 2), fx(pr.y[k], 2), fx(pr.M[k], 1), fx(pr.p[k], 1), fx(puAt(P, pr.z[k]), 1)]),
          },
          { k: 'figure', fig: figProfiles(r) },
          { k: 'figure', fig: figCurve(r) },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'Winkler tak-linear dengan kurva p–y Matlock (lempung lunak, statik) atau API RP2A (pasir); satu lapisan tanah homogen; EI tiang konstan (reduksi akibat retak diberikan manual lewat E).',
      'Belum termasuk: tanah berlapis, penampang retak otomatis, beban siklik, efek kelompok. Verifikasi dengan program p–y penuh dan uji lateral oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildPyReport(i: PyUIInput): Report | null {
  const r = computePyUI(i)
  return r ? pyReport(r) : null
}

export default {
  defaults: PY_DEFAULTS,
  build: (i: PyUIInput) => buildPyReport(i) ?? { title: 'Analisis P-Y', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
