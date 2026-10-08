import type { WeldConnectionResult } from '../../calc/weld-connection'
import { arrow, dimH, figRows } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { computeWeld, WELD_DEFAULTS, type WeldInput } from './model'

// Laporan Sambungan Las Sudut (SNI 1729:2020 Ps. J2 & J4, DFBK): data, batas ukuran & panjang, throat & luas
// efektif, faktor arah, reduksi end-loaded, kuat las, logam dasar (leleh/fraktur geser), kapasitas desain — dengan
// rumus dan substitusi.

export { WELD_DEFAULTS }

const ELECTRODE: Record<string, string> = { e60: 'E60XX', e70: 'E70XX', e80: 'E80XX', custom: 'Kustom' }

const electrodeName = (r: WeldConnectionResult) => ELECTRODE[r.electrode ?? 'e70'] ?? 'E70XX'

/* ---------------- gambar ---------------- */

/** Gbr. 1 — kiri: las sepanjang Lw dan arah beban θ; kanan: potongan las sudut (kaki w, throat te). */
function figWeld(r: WeldConnectionResult): Figure {
  const ops: FigOp[] = []
  // kiri: pelat terlas + garis las + panah beban bersudut θ
  const x0 = 40, x1 = 300, yW = 96
  ops.push({ t: 'rect', x: x0, y: 30, w: x1 - x0, h: yW - 30, fill: true, c: 'support', op: 0.1 })
  ops.push({ t: 'rect', x: x0, y: 30, w: x1 - x0, h: yW - 30, lw: 1, c: 'support' })
  ops.push({ t: 'rect', x: x0 - 16, y: yW, w: x1 - x0 + 32, h: 34, fill: true, c: 'support', op: 0.05 })
  ops.push({ t: 'line', x1: x0 - 16, y1: yW + 34, x2: x1 + 16, y2: yW + 34, lw: 0.8, c: 'support' })
  ops.push({ t: 'rect', x: x0, y: yW - 2.5, w: x1 - x0, h: 5, fill: true, c: 'accent', op: 0.8 })
  dimH(ops, x0, x1, yW + 50, `L_{w} = ${fx(r.Lw, 0)} mm`)
  const th = (r.theta * Math.PI) / 180
  // panah tetap di atas garis las berapa pun sudutnya
  const cx = (x0 + x1) / 2, cy = 30 + (yW - 30) * 0.3
  const L = Math.min(62, (yW - 14 - cy) / Math.max(Math.sin(th) * 0.55, 0.01))
  // θ = 0 sejajar sumbu las (ke kanan), 90° tegak lurus (ke bawah, menekan garis las)
  const ex = cx + L * Math.cos(th), ey = cy + L * Math.sin(th) * 0.55
  arrow(ops, cx, cy, ex, ey, { c: 'load', lw: 1.8, head: 6 })
  ops.push({ t: 'line', x1: cx, y1: cy, x2: cx + L, y2: cy, lw: 0.5, c: 'muted', dash: [3, 2] })
  ops.push({ t: 'text', x: ex + 6, y: ey - 4, s: `R_{u} = ${fx(r.Ru, 1)} kN`, size: 7.5, c: 'load', bold: true })
  ops.push({ t: 'text', x: cx + 14, y: cy + 11, s: `θ = ${fx(r.theta, 0)}°`, size: 7, c: 'ink' })
  ops.push({ t: 'text', x: x0 + 4, y: yW - 6, s: 'las sudut', size: 6.5, c: 'accent' })
  ops.push({ t: 'text', x: x0, y: 22, s: 'arah beban terhadap sumbu las', size: 6.5, c: 'muted' })

  // kanan: potongan las sudut
  const px = 380, py = 130, k = Math.min(9, 70 / Math.max(r.w, 1)), wpx = r.w * k
  ops.push({ t: 'rect', x: px - 50, y: py, w: 150, h: 16, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'rect', x: px - 50, y: py, w: 150, h: 16, lw: 0.9, c: 'support' })
  ops.push({ t: 'rect', x: px - 50, y: py - 80, w: 50, h: 80, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'rect', x: px - 50, y: py - 80, w: 50, h: 80, lw: 0.9, c: 'support' })
  ops.push({ t: 'poly', pts: [[px, py], [px, py - wpx], [px + wpx, py]], fill: true, c: 'accent', op: 0.55 })
  ops.push({ t: 'poly', pts: [[px, py], [px, py - wpx], [px + wpx, py]], close: true, lw: 0.9, c: 'ink' })
  ops.push({ t: 'line', x1: px, y1: py, x2: px + wpx / 2, y2: py - wpx / 2, lw: 1, c: 'y' })
  ops.push({ t: 'text', x: px + wpx / 2 + 4, y: py - wpx / 2 - 2, s: `t_{e} = ${fx(r.te, 2)}`, size: 7, c: 'y' })
  ops.push({ t: 'text', x: px + wpx / 2, y: py + 27, s: `w = ${fx(r.w, 0)}`, size: 7, align: 'c', c: 'ink' })
  ops.push({ t: 'text', x: px - 4, y: py - wpx / 2 + 3, s: 'w', size: 7, align: 'r', c: 'ink' })
  ops.push({ t: 'text', x: px + 25, y: py - 86, s: 'potongan las', size: 6.5, align: 'c', c: 'muted' })
  return {
    h: figRows(yW + 58),
    ops,
    alt: 'Las sudut, arah beban, dan potongan throat',
    caption: `Gbr. 1 — Las sudut ${electrodeName(r)} w = ${fx(r.w, 0)} mm sepanjang L_{w} = ${fx(r.Lw, 0)} mm; beban bersudut θ terhadap sumbu las (kiri), throat efektif t_{e} = 0,707w (kanan). Ukuran dalam mm.`,
  }
}

/** Gbr. 2 — kapasitas rencana las & logam dasar terhadap beban Ru. */
function figCapacity(r: WeldConnectionResult): Figure {
  const ops: FigOp[] = []
  const rows: { label: string; cap: number; c: 'y' | 'v' | 'm' }[] = [{ label: 'Las φR_{nw}', cap: r.phiRnw, c: 'y' }]
  if (r.baseOk) rows.push({ label: 'Leleh geser logam dasar', cap: r.phiRyBase, c: 'v' }, { label: 'Fraktur geser logam dasar', cap: r.phiRuBase, c: 'm' })
  const bx0 = 190, bw = 260, rh = 20
  const maxV = Math.max(1e-9, r.Ru, ...rows.map((b) => b.cap)) * 1.08
  const xd = bx0 + (r.Ru / maxV) * bw
  rows.forEach((b, i) => {
    const y = 12 + i * rh
    const len = Math.max(1.5, (b.cap / maxV) * bw)
    ops.push({ t: 'text', x: bx0 - 8, y: y + 9, s: b.label, size: 7, align: 'r', c: 'ink' })
    ops.push({ t: 'rect', x: bx0, y, w: len, h: 12, fill: true, c: b.c, op: 0.35 })
    ops.push({ t: 'rect', x: bx0, y, w: len, h: 12, lw: 0.6, c: b.c })
    ops.push({ t: 'text', x: Math.max(bx0 + len, r.Ru > b.cap ? xd : 0) + 4, y: y + 9, s: `${fx(b.cap, 1)} kN`, size: 7, c: 'ink' })
  })
  const yb = 12 + rows.length * rh
  if (r.Ru > 0) ops.push({ t: 'line', x1: xd, y1: 6, x2: xd, y2: yb, lw: 1.4, c: r.dc > 1 ? 'bad' : 'load' })
  ops.push({ t: 'line', x1: bx0, y1: 6, x2: bx0, y2: yb, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: bx0, y1: yb + 10, x2: bx0 + 14, y2: yb + 10, lw: 1.4, c: 'load' })
  ops.push({ t: 'text', x: bx0 + 18, y: yb + 12.5, s: `beban terfaktor R_{u} = ${fx(r.Ru, 1)} kN`, size: 6.5, c: 'muted' })
  return {
    h: figRows(yb + 18),
    ops,
    alt: 'Kapasitas las dan logam dasar dibanding beban',
    caption: 'Gbr. 2 — Kapasitas rencana (batang) dan beban terfaktor R_{u} (garis).',
  }
}

/* ---------------- laporan ---------------- */

function limitRows(r: WeldConnectionResult): string[][] {
  const rows: string[][] = []
  const st = (ok: boolean) => (ok ? 'OK' : 'Tidak memenuhi')
  if (r.baseOk) {
    rows.push(['Ukuran las w ≥ w_{min} (Tabel J2.4)', fx(r.w, 0), fx(r.wMin, 0), st(r.w >= r.wMin)])
    rows.push([`Ukuran las w ≤ w_{maks} (J2.2b, ${r.t < 6 ? 't < 6 → t' : 't ≥ 6 → t − 2'})`, fx(r.w, 0), fx(r.wMax, 0), st(r.w <= r.wMax)])
  }
  rows.push(['Panjang las L_{w} ≥ 4w (J2.2b)', fx(r.Lw, 0), fx(4 * r.w, 0), st(r.Lw >= 4 * r.w)])
  return rows
}

export function weldReport(r: WeldConnectionResult): Report {
  const fexx = fx(r.Fexx, 0)
  const betaApplies = r.endLoaded && r.ratioLw > 100
  const sections: Section[] = [
    {
      title: 'Data las & logam dasar',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Elektroda / kuat tarik logam las F_{EXX}', `${electrodeName(r)} / ${fexx} MPa`),
            kv('Ukuran kaki las w', `${fx(r.w, 0)} mm`),
            kv('Panjang efektif total L_{w}', `${fx(r.Lw, 0)} mm`),
            kv('Sudut beban terhadap sumbu las θ', `${fx(r.theta, 0)}°`),
            kv('Faktor arah', r.useDir ? 'diperhitungkan' : 'diabaikan (k_{d} = 1, konservatif)'),
            kv('Las longitudinal dibebani ujung (end-loaded)', r.endLoaded ? 'ya' : 'tidak'),
            kv('Logam dasar tertipis t / F_{y} / F_{u}', r.baseOk ? `${fx(r.t, 0)} mm / ${fx(r.Fy, 0)} / ${fx(r.Fu, 0)} MPa` : 'tidak lengkap'),
            kv('Beban terfaktor R_{u}', `${fx(r.Ru, 1)} kN`),
          ],
        },
        {
          k: 'calc',
          steps: [
            { desc: 'Throat efektif las sudut (kaki sama)', lhs: 't_{e}', expr: '0.707 · w', subst: `0.707 × ${fx(r.w, 0)}`, value: fx(r.te, 2), unit: 'mm' },
            { desc: 'Luas efektif las', lhs: 'A_{we}', expr: 't_{e} · L_{w}', subst: `${fx(r.te, 2)} × ${fx(r.Lw, 0)}`, value: fx(r.Awe, 1), unit: 'mm^{2}' },
          ],
        },
      ],
    },
    {
      title: 'Geometri & batas ukuran las',
      blocks: [
        { k: 'figure', fig: figWeld(r) },
        { k: 'table', head: ['Syarat', 'Nilai (mm)', 'Batas (mm)', 'Status'], align: ['l', 'r', 'r', 'l'], rows: limitRows(r) },
      ],
    },
    {
      title: 'Faktor arah & reduksi panjang',
      blocks: [
        r.useDir
          ? {
              k: 'calc',
              steps: [
                {
                  desc: 'Faktor arah beban las sudut',
                  lhs: 'k_{d}',
                  expr: '1 + 0.5 sin^{1.5}θ',
                  subst: `1 + 0.5 × sin^{1.5}(${fx(r.theta, 0)}°)`,
                  value: fx(r.kd, 3),
                  ref: 'J2-5',
                },
              ],
            }
          : { k: 'p', text: 'Faktor arah diabaikan: k_{d} = 1,0 (konservatif; berlaku untuk arah beban apa pun).' },
        betaApplies
          ? {
              k: 'calc',
              steps: [
                { lhs: '\\frac{L_{w}}{w}', subst: `\\frac{${fx(r.Lw, 0)}}{${fx(r.w, 0)}}`, value: fx(r.ratioLw, 0) },
                r.ratioLw > 300
                  ? { desc: 'L_{w}/w > 300 — nilai batas mesin hitung', lhs: 'β', value: fx(r.beta, 2) }
                  : { desc: 'Las end-loaded dengan L_{w}/w > 100', lhs: 'β', expr: '1.2 − 0.002 \\frac{L_{w}}{w}', subst: `1.2 − 0.002 × ${fx(r.ratioLw, 0)}`, value: fx(r.beta, 3), ref: 'J2-1' },
              ] as CalcStep[],
            }
          : {
              k: 'p',
              text: r.endLoaded
                ? `L_{w}/w = ${fx(r.ratioLw, 0)} ≤ 100 — panjang las efektif penuh, β = 1,0.`
                : 'Las tidak dibebani ujung secara longitudinal — reduksi panjang tidak berlaku, β = 1,0.',
            },
      ],
    },
    {
      title: 'Kuat las (J2.4)',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            {
              desc: 'Kuat nominal las sudut',
              lhs: 'R_{nw}',
              expr: '0.60 F_{EXX} · k_{d} · β · A_{we}',
              subst: `0.60 × ${fexx} × ${fx(r.kd, 3)} × ${fx(r.beta, 3)} × ${fx(r.Awe, 1)} / 10^{3}`,
              value: fx(r.Rnw, 2),
              unit: 'kN',
              ref: 'J2-4',
            },
            { lhs: 'φR_{nw}', expr: 'φ · R_{nw}', subst: `0.75 × ${fx(r.Rnw, 2)}`, value: fx(r.phiRnw, 2), unit: 'kN' },
          ],
        },
      ],
    },
  ]

  sections.push({
    title: 'Logam dasar (J4.2)',
    blocks: r.baseOk
      ? [
          { k: 'p', text: 'Geser pada logam dasar sepanjang las, luas geser A_{gv} = A_{nv} = t · L_{w} (bagian tertipis, tanpa lubang).' },
          {
            k: 'calc',
            steps: [
              { lhs: 'A_{gv}', expr: 't · L_{w}', subst: `${fx(r.t, 0)} × ${fx(r.Lw, 0)}`, value: fx(r.Agv, 0), unit: 'mm^{2}' },
              { desc: 'Leleh geser (φ = 1,00)', lhs: 'φR_{n,leleh}', expr: '1.00 · 0.60 F_{y} A_{gv}', subst: `1.00 × 0.60 × ${fx(r.Fy, 0)} × ${fx(r.Agv, 0)} / 10^{3}`, value: fx(r.phiRyBase, 2), unit: 'kN', ref: 'J4-3' },
              { desc: 'Fraktur geser (φ = 0,75)', lhs: 'φR_{n,fraktur}', expr: '0.75 · 0.60 F_{u} A_{nv}', subst: `0.75 × 0.60 × ${fx(r.Fu, 0)} × ${fx(r.Agv, 0)} / 10^{3}`, value: fx(r.phiRuBase, 2), unit: 'kN', ref: 'J4-4' },
            ],
          },
          { k: 'rows', rows: [kv('Logam dasar menentukan', `${r.baseGov} geser, ${fx(r.phiBase, 2)} kN`)] },
        ]
      : [{ k: 'p', text: 'Data logam dasar (t, F_{y}, F_{u}) tidak lengkap — cek logam dasar dilewati; kapasitas = kuat las saja.' }],
  })

  sections.push({
    title: 'Kapasitas desain',
    strong: true,
    blocks: [
      {
        k: 'calc',
        steps: [
          r.baseOk
            ? { lhs: 'φR_{n}', expr: 'min(φR_{nw}; φR_{n,dasar})', subst: `min(${fx(r.phiRnw, 2)}; ${fx(r.phiBase, 2)})`, value: fx(r.phiRn, 2), unit: 'kN' }
            : { lhs: 'φR_{n}', expr: 'φR_{nw}', value: fx(r.phiRn, 2), unit: 'kN' },
          ...(r.Ru > 0 ? [{ lhs: 'D/C', expr: '\\frac{R_{u}}{φR_{n}}', subst: `\\frac{${fx(r.Ru, 2)}}{${fx(r.phiRn, 2)}}`, value: fx(r.dc, 3) }] : []),
        ],
      },
      ...(r.Ru > 0 ? [{ k: 'rows' as const, rows: [check('D/C sambungan las', r.dc)] }] : []),
      { k: 'p', text: r.weldGoverns ? 'Kuat las menentukan.' : 'Logam dasar menentukan — perbesar tebal t atau mutu bagian tersambung.' },
      { k: 'figure', fig: figCapacity(r) },
    ],
  })

  const summary: Row[] = [
    kv('Kuat rencana las φR_{nw}', `${fx(r.phiRnw, 1)} kN`),
    ...(r.baseOk ? [kv(`Logam dasar (${r.baseGov} geser)`, `${fx(r.phiBase, 1)} kN`)] : []),
    kv('Kapasitas desain φR_{n}', `${fx(r.phiRn, 1)} kN (${r.weldGoverns ? 'las' : 'logam dasar'})`),
    ...(r.Ru > 0 ? [check('D/C sambungan las', r.dc)] : []),
  ]

  return {
    title: 'Sambungan Las Sudut (SNI 1729:2020 Ps. J2 & J4)',
    summary,
    sections,
    ...(r.Ru > 0 ? { governing: { label: `D/C (${r.weldGoverns ? 'las' : 'logam dasar'} menentukan)`, ratio: r.dc } } : {}),
    warnings: r.warn,
    scope: [
      'DFBK. Las sudut (fillet) kaki sama, satu arah beban seragam sepanjang las; logam dasar ditinjau pada bagian tertipis.',
      'Belum termasuk: las tumpul (groove), grup las eksentris (pusat rotasi sesaat), kombinasi multi-arah J2.4(c), fatik. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildWeldReport(i: WeldInput): Report | null {
  const r = computeWeld(i)
  return r ? weldReport(r) : null
}

export default {
  defaults: WELD_DEFAULTS,
  build: (i: WeldInput) => buildWeldReport(i) ?? { title: 'Sambungan Las', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
