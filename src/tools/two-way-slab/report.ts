import type { EdgeCondition, TwoWaySlabResult } from '../../calc/two-way-slab'
import type { StripDesign } from '../../calc/shared/concrete'
import { dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { COND_OPTIONS, computeSlab, SLAB_DEFAULTS, type SlabInput } from './model'

// Laporan Pelat Dua Arah (jalur silang Grashof–Marcus + SNI 2847:2019): beban, pembagian beban, momen jalur,
// desain tulangan jalur tengah & tepi, lendutan dengan Ie — dengan rumus dan substitusi.

export { SLAB_DEFAULTS }

const KTXT: Record<EdgeCondition, string> = { ss: '5/384', ff: '1/384', fp: '1/192' }
const MPOS: Record<EdgeCondition, string> = { ss: 'wL^{2}/8', ff: 'wL^{2}/24', fp: '9wL^{2}/128' }
const MNEG: Record<EdgeCondition, string> = { ss: '0', ff: 'wL^{2}/12', fp: 'wL^{2}/8' }
const condLabel = (c: EdgeCondition) => COND_OPTIONS.find((o) => o.value === c)!.label

/** Gbr. 1 — denah pelat: tumpuan (jepit = arsir tebal, sendi = garis tipis), bentang, tulangan lapangan. */
function figPlan(r: TwoWaySlabResult): Figure {
  const ops: FigOp[] = []
  const sc = Math.min(260 / r.Ly!, 150 / r.Lx!)
  const W = r.Ly! * sc, H = r.Lx! * sc, x0 = 130, y0 = 18
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, fill: true, c: 'support', op: 0.1 })
  const edge = (x1: number, y1: number, x2: number, y2: number, c: EdgeCondition) =>
    ops.push({ t: 'line', x1, y1, x2, y2, lw: c === 'ss' ? 1 : 3.2, c: 'support', dash: c === 'ss' ? [4, 3] : undefined })
  // bentang pendek Lx vertikal (atas-bawah ditumpu menurut condX), panjang Ly horizontal (kiri-kanan menurut condY)
  edge(x0, y0, x0 + W, y0, r.condX!)
  edge(x0, y0 + H, x0 + W, y0 + H, r.condX === 'fp' ? 'ss' : r.condX!)
  edge(x0, y0, x0, y0 + H, r.condY!)
  edge(x0 + W, y0, x0 + W, y0 + H, r.condY === 'fp' ? 'ss' : r.condY!)
  dimH(ops, x0, x0 + W, y0 + H + 14, `L_{y} = ${fx(r.Ly, 2)} m`)
  dimV(ops, y0, y0 + H, x0 - 14, '')
  ops.push({ t: 'text', x: x0 - 18, y: y0 + H / 2 + 3, s: `L_{x} = ${fx(r.Lx, 2)} m`, size: 7, align: 'r' })
  ops.push({ t: 'line', x1: x0 + W / 2, y1: y0 + 10, x2: x0 + W / 2, y2: y0 + H - 10, lw: 1, c: 'm' })
  ops.push({ t: 'line', x1: x0 + 14, y1: y0 + H / 2, x2: x0 + W - 14, y2: y0 + H / 2, lw: 1, c: 'y' })
  ops.push({ t: 'text', x: x0 + W / 2 + 4, y: y0 + 22, s: `arah x: D${r.db}-${r.asXpos!.s}`, size: 7, c: 'm' })
  ops.push({ t: 'text', x: x0 + 18, y: y0 + H / 2 - 4, s: `arah y: D${r.db}-${r.asYpos!.s}`, size: 7, c: 'y' })
  return {
    h: figRows(y0 + H + 22),
    ops,
    alt: 'Denah pelat dua arah dan tumpuan',
    caption: 'Gbr. 1 — Denah pelat (L_{x} = bentang pendek). Garis tebal = tepi jepit, garis putus = tepi sendi; tulangan lapangan jalur tengah.',
  }
}

const desRow = (loc: string, a: StripDesign) => [
  loc,
  fx(a.Mu, 2),
  fx(a.As, 0),
  fx(a.AsMin, 0),
  `D${a.db}-${a.s}`,
  fx(a.AsProv, 0),
  a.infeasible ? 'tak layak' : a.govMin ? 'minimum' : a.tc ? 'εt ≥ 0,005' : 'transisi',
]

export function slabReport(i: SlabInput, r: TwoWaySlabResult): Report {
  const swapped = Number(i.Ly) < Number(i.Lx)
  const ex: StripDesign = r.asXpos!
  const Rn = ex.Mu > 0.005 ? (ex.Mu * 1e6) / (0.9 * 1000 * ex.d * ex.d) : 0
  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Bentang L_{x} (pendek) × L_{y} (panjang)', `${fx(r.Lx, 2)} × ${fx(r.Ly, 2)} m${swapped ? ' (input ditukar agar L_{x} ≤ L_{y})' : ''}`),
            kv('Rasio L_{y}/L_{x}', `${fx(r.ratio, 2)} ${r.ratio! <= 2 ? '≤ 2 — dua arah' : '> 2 — satu arah'}`),
            kv('Tumpuan arah x / arah y', `${condLabel(r.condX!)} / ${condLabel(r.condY!)}`),
            kv('Tebal h / selimut / tulangan', `${fx(r.h, 0)} mm / ${fx(r.cc, 0)} mm / D${r.db}`),
            kv("f'_{c} / f_{y}", `${fx(r.fc, 0)} / ${fx(r.fy, 0)} MPa`),
            kv('Beban mati tambahan / hidup', `${fx(r.qDL, 2)} / ${fx(r.qLL, 2)} kN/m^{2}`),
          ],
        },
        { k: 'figure', fig: figPlan(r) },
      ],
    },
    {
      title: 'Beban',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Berat sendiri, γ_{c} = 24 kN/m^{3}', lhs: 'q_{sw}', expr: '24 h', subst: `24 × ${fx(r.h! / 1000, 3)}`, value: fx(r.qsw, 2), unit: 'kN/m^{2}' },
            { lhs: 'q_{D}', expr: 'q_{sw} + q_{DL}', value: fx(r.qD, 2), unit: 'kN/m^{2}' },
            { lhs: 'w_{u}', expr: 'maks(1.4q_{D}; 1.2q_{D} + 1.6q_{L})', subst: `maks(${fx(1.4 * r.qD!, 2)}; ${fx(1.2 * r.qD! + 1.6 * r.qL!, 2)})`, value: fx(r.wu, 2), unit: 'kN/m^{2}' },
            { desc: 'Beban layan (lendutan)', lhs: 'w_{s}', expr: 'q_{D} + q_{L}', value: fx(r.wSvc, 2), unit: 'kN/m^{2}' },
          ],
        },
      ],
    },
    {
      title: 'Pembagian beban jalur silang',
      blocks: [
        { k: 'p', text: 'Lendutan pusat jalur x dan y disamakan (Grashof–Marcus): w_{x}k_{x}L_{x}^{4} = w_{y}k_{y}L_{y}^{4}, kekakuan lentur kedua arah dianggap sama; puntir pelat diabaikan.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'k_{x} / k_{y}', value: `${KTXT[r.condX!]} / ${KTXT[r.condY!]}` },
            { lhs: 'w_{ux}', expr: 'w_{u}\\frac{k_{y}L_{y}^{4}}{k_{x}L_{x}^{4} + k_{y}L_{y}^{4}}', value: fx(r.wux, 3), unit: 'kN/m^{2}' },
            { lhs: 'w_{uy}', expr: 'w_{u} − w_{ux}', value: fx(r.wuy, 3), unit: 'kN/m^{2}' },
          ],
        },
        { k: 'rows', rows: [kv('Porsi beban arah pendek', `${fx(r.shareX, 1)}%`)] },
      ],
    },
    {
      title: 'Momen jalur (per meter lebar)',
      blocks: [
        {
          k: 'table',
          head: ['Arah', 'Tumpuan', 'w (kN/m^{2})', 'L (m)', 'M^{+} rumus', 'M^{+} (kN·m/m)', 'M^{−} rumus', 'M^{−} (kN·m/m)'],
          align: ['l', 'l', 'r', 'r', 'l', 'r', 'l', 'r'],
          rows: [
            ['x (pendek)', condLabel(r.condX!), fx(r.wux, 3), fx(r.Lx, 2), MPOS[r.condX!], fx(r.mX!.Mpos, 2), MNEG[r.condX!], fx(r.mX!.Mneg, 2)],
            ['y (panjang)', condLabel(r.condY!), fx(r.wuy, 3), fx(r.Ly, 2), MPOS[r.condY!], fx(r.mY!.Mpos, 2), MNEG[r.condY!], fx(r.mY!.Mneg, 2)],
          ],
        },
        { k: 'p', text: 'Jalur tepi (lebar seperempat bentang pendek di tiap sisi) memakai sepertiga momen jalur tengah (ACI 314R-16 Ps. 7.9.2).' },
      ],
    },
    {
      title: 'Desain tulangan',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Arah pendek di lapis luar', lhs: 'd_{x}', expr: 'h − selimut − d_{b}/2', value: fx(r.dx, 1), unit: 'mm' },
            { desc: 'Arah panjang di lapis dalam', lhs: 'd_{y}', expr: 'h − selimut − 1.5d_{b}', value: fx(r.dy, 1), unit: 'mm' },
            ...(Rn > 0
              ? ([
                  { desc: `Contoh: lapangan arah x, M_{u} = ${fx(ex.Mu, 2)} kN·m/m`, lhs: 'R_{n}', expr: '\\frac{M_{u}}{φ b d^{2}}', subst: `\\frac{${fx(ex.Mu, 2)}×10^{6}}{0.9 × 1000 × ${fx(ex.d, 1)}^{2}}`, value: fx(Rn, 3), unit: 'MPa' },
                  { lhs: 'ρ', expr: "\\frac{0.85f'_{c}}{f_{y}}(1 − √(1 − \\frac{2R_{n}}{0.85f'_{c}}))", value: fx(ex.rho, 5) },
                  { lhs: 'A_{s}', expr: 'ρ b d', value: fx(ex.As, 0), unit: 'mm^{2}/m' },
                ] as CalcStep[])
              : []),
            { desc: 'Minimum susut-suhu (24.4.3.2) terhadap penampang bruto', lhs: 'A_{s,min}', value: fx(ex.AsMin, 0), unit: 'mm^{2}/m' },
            { desc: 'Spasi kelipatan 25 mm, ≤ min(2h; 450) (8.7.2.2)', lhs: 's_{maks}', value: fx(ex.sMax, 0), unit: 'mm' },
          ],
        },
        {
          k: 'table',
          head: ['Lokasi', 'M_{u} (kN·m/m)', 'A_{s} perlu', 'A_{s,min}', 'Tulangan', 'A_{s} pasang', 'Catatan'],
          align: ['l', 'r', 'r', 'r', 'l', 'r', 'l'],
          caption: 'Luas dalam mm^{2}/m.',
          rows: [
            desRow('Jalur tengah x — lapangan', r.asXpos!),
            ...(r.mX!.Mneg > 0 ? [desRow('Jalur tengah x — tumpuan', r.asXneg!)] : []),
            desRow('Jalur tengah y — lapangan', r.asYpos!),
            ...(r.mY!.Mneg > 0 ? [desRow('Jalur tengah y — tumpuan', r.asYneg!)] : []),
            desRow('Jalur tepi x — lapangan', r.asXposC!),
            ...(r.mX!.Mneg > 0 ? [desRow('Jalur tepi x — tumpuan', r.asXnegC!)] : []),
            desRow('Jalur tepi y — lapangan', r.asYposC!),
            ...(r.mY!.Mneg > 0 ? [desRow('Jalur tepi y — tumpuan', r.asYnegC!)] : []),
          ],
        },
      ],
    },
    {
      title: 'Lendutan (24.2)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'E_{c}', expr: "4700√(f'_{c})", value: fx(r.Ec, 0), unit: 'MPa' },
            { desc: 'Momen retak per meter, f_{r} = 0,62√(f\'_{c})', lhs: 'M_{cr}', expr: 'f_{r} I_{g} / (h/2)', value: fx(r.ieX!.Mcr, 2), unit: 'kN·m/m' },
            { desc: `Arah x: M_{a} = ${fx(r.ieX!.Ma, 2)} kN·m/m${r.ieX!.cracked ? ' > M_{cr} → retak' : ' ≤ M_{cr} → utuh'}`, lhs: 'I_{e,x}', expr: '(M_{cr}/M_{a})^{3}I_{g} + [1 − (M_{cr}/M_{a})^{3}]I_{cr} ≤ I_{g}', value: sci(r.ieX!.Ie), unit: 'mm^{4}/m', ref: '24.2.3.5' },
            { desc: `Arah y: M_{a} = ${fx(r.ieY!.Ma, 2)} kN·m/m${r.ieY!.cracked ? ' → retak' : ' → utuh'}`, lhs: 'I_{e,y}', value: sci(r.ieY!.Ie), unit: 'mm^{4}/m' },
            { lhs: 'δ_{x}', expr: '\\frac{k_{x} w_{sx} L_{x}^{4}}{E_{c} I_{e,x}}', value: fx(r.dX, 2), unit: 'mm' },
            { lhs: 'δ_{y}', expr: '\\frac{k_{y} w_{sy} L_{y}^{4}}{E_{c} I_{e,y}}', value: fx(r.dY, 2), unit: 'mm' },
          ],
        },
        {
          k: 'rows',
          rows: [
            check(`δ_{maks} = ${fx(r.dMax, 2)} mm / (L_{x}/240 = ${fx(r.limit240, 1)} mm)`, r.dMax! / r.limit240!),
            check(`δ_{maks} / (L_{x}/360 = ${fx(r.limit360, 1)} mm)`, r.dMax! / r.limit360!),
          ],
        },
        { k: 'p', text: 'Lendutan seketika akibat beban layan total, tanpa rangkak/susut jangka panjang (λΔ) — batas L/360 untuk beban hidup dibandingkan konservatif dengan lendutan total.' },
      ],
    },
  ]

  return {
    title: 'Pelat Dua Arah — Metode Jalur Silang (SNI 2847:2019)',
    summary: [
      kv('Tulangan lapangan x / y (jalur tengah)', `D${r.db}-${r.asXpos!.s} / D${r.db}-${r.asYpos!.s}`),
      ...(r.mX!.Mneg > 0 || r.mY!.Mneg > 0 ? [kv('Tulangan tumpuan x / y', `${r.mX!.Mneg > 0 ? `D${r.db}-${r.asXneg!.s}` : '-'} / ${r.mY!.Mneg > 0 ? `D${r.db}-${r.asYneg!.s}` : '-'}`)] : []),
      kv('w_{u} / porsi arah pendek', `${fx(r.wu, 2)} kN/m^{2} / ${fx(r.shareX, 1)}%`),
      check(`Lendutan δ_{maks} = ${fx(r.dMax, 2)} mm terhadap L_{x}/240`, r.dMax! / r.limit240!),
    ],
    sections,
    warnings: [...r.warn, ...(r.anyInfeasible ? ['Ada lokasi dengan momen melebihi kapasitas penampang (R_{n} terlalu besar) — pertebal pelat.'] : [])],
    scope: ['Pelat persegi tertumpu di 4 sisi, beban merata, metode pendekatan jalur silang (puntir pelat diabaikan); L_{y}/L_{x} ≤ 2. Verifikasi oleh insinyur penanggung jawab.'],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildSlabReport(i: SlabInput): Report | null {
  const r = computeSlab(i)
  return r ? slabReport(i, r) : null
}

export default {
  defaults: SLAB_DEFAULTS,
  build: (i: SlabInput) => buildSlabReport(i) ?? { title: 'Pelat Dua Arah', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
