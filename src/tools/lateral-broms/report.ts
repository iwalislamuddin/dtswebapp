import { dimV, figRows } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { BROMS_DEFAULTS, computeBromsUI, type BromsOk, type BromsUIInput } from './model'

// Laporan Kapasitas Lateral Tiang — Broms (1964), rigid-plastis: mode tiang pendek (kegagalan tanah) dan tiang
// panjang (leleh lentur), Hu = min, serta momen maksimum — rumus → substitusi → hasil.

export { BROMS_DEFAULTS }

/** Tekanan tanah batas tiap kedalaman z (m), kN/m. Lempung: nol 0–1,5D lalu 9cuD; pasir: 3Kpγ′zD. */
export function ultimatePressure(r: BromsOk, z: number): number {
  if (r.soil === 'clay') return z <= 1.5 * r.D ? 0 : r.k!
  return 3 * r.Kp! * r.gam! * z * r.D
}

/** Gbr. 1 — tiang, beban H di ketinggian e, dan diagram tekanan tanah batas; zmax ditandai. */
function figPile(r: BromsOk): Figure {
  const ops: FigOp[] = []
  const sc = Math.min(200 / (r.L + Math.max(r.e, 1)), 25)
  const yg = 30 + Math.max(r.e, 0.8) * sc
  const cx = 150, pw = Math.max(6, Math.min(r.D * sc, 18))
  ops.push({ t: 'line', x1: 40, y1: yg, x2: 260, y2: yg, lw: 1, c: 'muted' })
  ops.push({ t: 'rect', x: 40, y: yg, w: 220, h: r.L * sc, fill: true, c: 'muted', op: 0.08 })
  ops.push({ t: 'rect', x: cx - pw / 2, y: yg - Math.max(r.e, 0.8) * sc - 6, w: pw, h: (r.L + Math.max(r.e, 0.8)) * sc + 6, fill: true, c: 'support', op: 0.3 })
  ops.push({ t: 'rect', x: cx - pw / 2, y: yg - Math.max(r.e, 0.8) * sc - 6, w: pw, h: (r.L + Math.max(r.e, 0.8)) * sc + 6, lw: 1, c: 'support' })
  // beban lateral di ketinggian e
  const yH = yg - r.e * sc
  ops.push({ t: 'line', x1: cx - pw / 2 - 40, y1: yH, x2: cx - pw / 2, y2: yH, lw: 1.6, c: 'load' })
  ops.push({ t: 'poly', pts: [[cx - pw / 2, yH], [cx - pw / 2 - 7, yH - 3.5], [cx - pw / 2 - 7, yH + 3.5]], close: true, fill: true, c: 'load' })
  ops.push({ t: 'text', x: cx - pw / 2 - 42, y: yH - 4, s: `H_{u} = ${fx(r.Hu, 1)} kN`, size: 7, align: 'l', c: 'load' })
  if (r.e > 0) {
    dimV(ops, yH, yg, 52, '')
    ops.push({ t: 'text', x: 56, y: (yH + yg) / 2 + 2.5, s: `e = ${fx(r.e, 2)} m`, size: 7 })
  }
  // diagram tekanan batas (kanan)
  const pmax = Math.max(ultimatePressure(r, r.L), 1)
  const dx = 90 / pmax
  const x0 = cx + pw / 2 + 6
  const pts: [number, number][] = [[x0, yg]]
  const n = 40
  for (let k = 0; k <= n; k++) {
    const z = (r.L * k) / n
    pts.push([x0 + ultimatePressure(r, z) * dx, yg + z * sc])
  }
  pts.push([x0, yg + r.L * sc])
  ops.push({ t: 'poly', pts, close: true, fill: true, c: 'v', op: 0.25 })
  ops.push({ t: 'poly', pts, close: true, lw: 0.8, c: 'v' })
  ops.push({ t: 'line', x1: x0, y1: yg + r.zmax * sc, x2: x0 + 100, y2: yg + r.zmax * sc, lw: 0.8, c: 'm', dash: [4, 2] })
  ops.push({ t: 'text', x: x0 + 102, y: yg + r.zmax * sc + 2.5, s: `z(M_{maks}) = ${fx(r.zmax, 2)} m`, size: 7, c: 'm' })
  dimV(ops, yg, yg + r.L * sc, 250, '')
  ops.push({ t: 'text', x: 256, y: yg + (r.L * sc) / 2 + 2.5, s: `L = ${fx(r.L, 1)} m`, size: 7 })
  ops.push({ t: 'text', x: x0, y: yg + r.L * sc + 14, s: r.soil === 'clay' ? 'p_{u} = 9 c_{u} D (nol 0–1,5D)' : 'p_{u} = 3 K_{p} γ′ z D', size: 7, c: 'v' })
  return {
    h: figRows(yg + r.L * sc + 22),
    ops,
    alt: 'Tiang dengan beban lateral dan diagram tekanan tanah batas',
    caption: `Gbr. 1 — Tiang ${r.head === 'free' ? 'kepala bebas' : 'kepala jepit'}, beban lateral H pada e = ${fx(r.e, 2)} m; diagram tekanan tanah batas Broms.`,
  }
}

export function bromsReport(r: BromsOk): Report {
  const clay = r.soil === 'clay'
  const free = r.head === 'free'
  const D = r.D, L = r.L, e = r.e, My = r.My
  const steps: CalcStep[] = []
  if (clay) {
    steps.push({ desc: 'Reaksi tanah batas lempung', lhs: 'k', expr: '9 c_{u} D', subst: `9 × ${fx(r.cu, 1)} × ${fx(D, 3)}`, value: fx(r.k, 2), unit: 'kN/m' })
    if (free) {
      const A = 4 * e + 3 * D + 2 * L
      steps.push(
        { desc: 'Tiang pendek (rotasi kaku): f² + (4e + 3D + 2L) f − (L − 1,5D)² = 0', lhs: 'f', expr: '\\frac{−A + √(A^{2} + 4(L − 1.5D)^{2})}{2}', subst: `A = ${fx(A, 3)}`, value: fx(r.fShort, 3), unit: 'm' },
        { lhs: 'H_{pendek}', expr: 'k f', subst: `${fx(r.k, 2)} × ${fx(r.fShort, 3)}`, value: fx(r.Hshort, 1), unit: 'kN' },
        { desc: 'Tiang panjang (leleh): H²/(2k) + (e + 1,5D) H − M_{y} = 0', lhs: 'H_{panjang}', expr: 'k(−b + √(b^{2} + 2M_{y}/k)),  b = e + 1.5D', subst: `b = ${fx(e + 1.5 * D, 3)}`, value: fx(r.Hlong, 1), unit: 'kN' },
      )
    } else {
      steps.push(
        { desc: 'Tiang pendek, kepala jepit', lhs: 'H_{pendek}', expr: 'k (L − 1.5D)', subst: `${fx(r.k, 2)} × ${fx(L - 1.5 * D, 3)}`, value: fx(r.Hshort, 1), unit: 'kN' },
        { lhs: 'M_{jepit}', expr: 'H e + \\frac{k (L − 1.5D)(1.5D + L)}{2}', value: fx(r.MfixShort, 1), unit: 'kN·m' },
        { desc: 'Tiang panjang, dua sendi plastis', lhs: 'H_{panjang}', expr: 'k(−b + √(b^{2} + 4M_{y}/k)),  b = e + 1.5D', subst: `b = ${fx(e + 1.5 * D, 3)}`, value: fx(r.Hlong, 1), unit: 'kN' },
      )
    }
  } else {
    steps.push(
      { lhs: 'K_{p}', expr: 'tan^{2}(45° + φ/2)', subst: `φ = ${fx(r.phi, 1)}°`, value: fx(r.Kp, 3) },
      { desc: 'Tiang pendek', lhs: 'H_{pendek}', expr: free ? '\\frac{0.5 K_{p} γ′ D L^{3}}{e + L}' : '1.5 K_{p} γ′ D L^{2}', subst: free ? `\\frac{0.5 × ${fx(r.Kp, 3)} × ${fx(r.gam, 1)} × ${fx(D, 3)} × ${fx(L, 2)}^{3}}{${fx(e, 2)} + ${fx(L, 2)}}` : `1.5 × ${fx(r.Kp, 3)} × ${fx(r.gam, 1)} × ${fx(D, 3)} × ${fx(L, 2)}^{2}`, value: fx(r.Hshort, 1), unit: 'kN' },
      ...(free ? [] : [{ lhs: 'M_{jepit}', expr: 'H (e + \\frac{2L}{3})', value: fx(r.MfixShort, 1), unit: 'kN·m' } satisfies CalcStep]),
      { desc: `Tiang panjang: ${free ? '' : '2 '}M_{y} = e H + 0,5443 H^{3/2}/√(K_{p} γ′ D), dicari numerik`, lhs: 'H_{panjang}', value: fx(r.Hlong, 1), unit: 'kN' },
    )
  }
  const result: CalcStep[] = [
    { desc: r.mode, lhs: 'H_{u}', expr: 'min(H_{pendek}; H_{panjang})', subst: `min(${fx(r.Hshort, 1)}; ${fx(r.Hlong, 1)})`, value: fx(r.Hu, 1), unit: 'kN' },
    clay
      ? { lhs: 'f', expr: '\\frac{H_{u}}{k}', value: fx(r.f, 3), unit: 'm' }
      : { lhs: 'f', expr: '0.816 √(\\frac{H_{u}}{K_{p} γ′ D})', value: fx(r.f, 3), unit: 'm' },
    { lhs: 'z_{M,maks}', expr: clay ? '1.5D + f' : 'f', value: fx(r.zmax, 3), unit: 'm' },
    { lhs: 'M_{maks}', expr: r.short && !free ? 'M_{jepit}' : clay ? 'H_{u}(e + 1.5D + 0.5 f)' : 'H_{u}(e + 0.667 f)', value: fx(r.Mmax, 1), unit: 'kN·m' },
  ]
  return {
    title: 'Kapasitas Lateral Tiang — Broms (1964)',
    summary: [
      kv('H_{u} (kapasitas lateral)', `${fx(r.Hu, 1)} kN`),
      kv('Mode', r.mode),
      kv('M_{maks} / M_{y}', `${fx(r.Mmax, 1)} / ${fx(My, 0)} kN·m`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Tanah', clay ? `lempung, c_{u} = ${fx(r.cu, 1)} kPa` : `pasir, φ = ${fx(r.phi, 1)}°, γ′ = ${fx(r.gam, 1)} kN/m³`),
              kv('Kepala tiang', free ? 'bebas' : 'jepit (dikekang pile cap)'),
              kv('D / L / e', `${fx(D * 1000, 0)} mm / ${fx(L, 2)} m / ${fx(e, 2)} m`),
              kv('M_{y} tiang', `${fx(My, 1)} kN·m`),
            ],
          },
        ],
      },
      { title: 'Kapasitas tiang pendek dan panjang', blocks: [{ k: 'calc', steps }] },
      { title: 'Kapasitas lateral & momen maksimum', strong: true, blocks: [{ k: 'calc', steps: result }, { k: 'rows', rows: [check('M_{maks} / M_{y}', r.dcMom)] }, { k: 'figure', fig: figPile(r) }] },
    ],
    governing: { label: 'M_{maks} / M_{y}', ratio: r.dcMom },
    warnings: r.warn,
    scope: [
      'Broms (1964) rigid-plastis: lempung p_{u} = 9 c_{u} D (nol pada 0–1,5D), pasir p_{u} = 3 K_{p} γ′ z D; kepala bebas atau jepit; H_{u} adalah beban ultimit — beban kerja = H_{u}/FS.',
      'Belum termasuk: defleksi kerja (gunakan Analisis P-Y), tanah berlapis, efek kelompok. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildBromsReport(i: BromsUIInput): Report | null {
  const r = computeBromsUI(i)
  return r ? bromsReport(r) : null
}

export default {
  defaults: BROMS_DEFAULTS,
  build: (i: BromsUIInput) => buildBromsReport(i) ?? { title: 'Lateral Tiang — Broms', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
