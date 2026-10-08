import { computeBoltConnection, type BoltConnectionInput, type BoltConnectionResult } from '../../calc/bolt-connection'
import { arrow, dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, type FigOp, type Figure, type Report } from '../../report/model'

// Laporan Sambungan Baut — dari hasil computeBoltConnection (isi sama dengan buildReport build lama).

/** Input bawaan form (build lama). */
export const BOLT_DEFAULTS: BoltConnectionInput = {
  grade: 'a325', thread: 'N', Fnt: 620, Fnv: 372, d: 20, planes: 1, nr: 2, nc: 2, s: 70, sg: 70, le: 40, t: 10, Fu: 370,
  Vu: 150, Tu: 0,
}

/** Gbr. 1 — denah pola baut + kapasitas per baut. */
function figBoltPlan(r: BoltConnectionResult): Figure {
  const ops: FigOp[] = []
  const sg = r.sg > 0 ? r.sg : 3 * r.d
  const le = r.le > 0 ? r.le : 1.5 * r.d
  const edgeV = Math.max(1.5 * r.d, 30)
  const Wmm = le + Math.max(0, r.nr - 1) * r.s + 3 * r.d // pelat: tepi kiri … putus kanan
  const Hmm = Math.max(0, r.nc - 1) * sg + 2 * edgeV
  const sc = Math.min(250 / Wmm, 100 / Hmm)
  const x0 = 120, y0 = 24, W = Wmm * sc, H = Hmm * sc
  // pelat (tepi kanan putus)
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0 + W, y2: y0, lw: 1 })
  ops.push({ t: 'line', x1: x0, y1: y0 + H, x2: x0 + W, y2: y0 + H, lw: 1 })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y0 + H, lw: 1 })
  ops.push({ t: 'line', x1: x0 + W, y1: y0, x2: x0 + W, y2: y0 + H, lw: 0.6, g: 0.5, dash: [4, 3] })
  // baut: i searah beban (le + i·s dari tepi kiri), j tegak lurus
  const rb = Math.max(2.2, (r.dh * sc) / 2)
  for (let i = 0; i < r.nr; i++)
    for (let j = 0; j < r.nc; j++) {
      const bx = x0 + (le + i * r.s) * sc, by = y0 + (edgeV + j * sg) * sc
      ops.push({ t: 'circle', cx: bx, cy: by, r: rb, lw: 0.9 })
      ops.push({ t: 'line', x1: bx - rb - 2, y1: by, x2: bx + rb + 2, y2: by, lw: 0.3, g: 0.5 })
      ops.push({ t: 'line', x1: bx, y1: by - rb - 2, x2: bx, y2: by + rb + 2, lw: 0.3, g: 0.5 })
    }
  // dimensi le & s (bawah), g (kanan)
  const yd = y0 + H + 14
  dimH(ops, x0, x0 + le * sc, yd, 'le=' + fx(le, 0))
  if (r.nr > 1) dimH(ops, x0 + le * sc, x0 + (le + r.s) * sc, yd, 's=' + fx(r.s, 0))
  if (r.nc > 1) {
    dimV(ops, y0 + edgeV * sc, y0 + (edgeV + sg) * sc, x0 + W + 12, '')
    ops.push({ t: 'text', x: x0 + W + 18, y: y0 + (edgeV + sg / 2) * sc + 2.5, s: 'g=' + fx(sg, 0), size: 6.5 })
  }
  // beban Vu menarik pelat ke kanan
  arrow(ops, x0 + W + 6, y0 + H / 2, x0 + W + 40, y0 + H / 2, { lw: 1.2 })
  ops.push({ t: 'text', x: x0 + W + 22, y: y0 + H / 2 - 6, s: 'Vu=' + fx(r.Vu, 0) + ' kN', size: 6.5 })
  ops.push({ t: 'text', x: x0 + 6, y: y0 + 10, s: `${r.n} M${r.d} (${r.gradeLabel.split(' ')[0]})`, size: 6.5, g: 0.35 })

  // kapasitas per baut
  const by2 = yd + 22, bx0 = 205, bw = 200
  const rows: [string, number, number][] = [[`Geser baut (${r.m} bdg)`, r.phiRnv, 0.2]]
  if (r.bearingOk) {
    rows.push(['Tumpu tepi', 0.75 * r.rnBrgEdge, 0.45])
    if (r.nr > 1) rows.push(['Tumpu dalam', 0.75 * r.rnBrgInner, 0.6])
  }
  const maxV = Math.max(r.rv, 0.01, ...rows.map((x) => x[1])) * 1.1
  rows.forEach(([label, val, g], i) => {
    const y = by2 + i * 17
    ops.push({ t: 'text', x: bx0 - 6, y: y + 8, s: label, size: 6.5, align: 'r' })
    ops.push({ t: 'rect', x: bx0, y, w: (val / maxV) * bw, h: 11, fill: true, g })
    ops.push({ t: 'text', x: bx0 + (val / maxV) * bw + 4, y: y + 8, s: fx(val, 1) + ' kN', size: 6.5 })
  })
  if (r.rv > 0) {
    const xv = bx0 + (r.rv / maxV) * bw
    ops.push({ t: 'line', x1: xv, y1: by2 - 6, x2: xv, y2: by2 + rows.length * 17 + 2, lw: 1, dash: [3, 2] })
    ops.push({ t: 'text', x: xv, y: by2 + rows.length * 17 + 11, s: 'rv=' + fx(r.rv, 1), size: 6, align: 'c' })
  }
  const yCap = by2 + rows.length * 17 + 26
  ops.push({
    t: 'text', x: 264, y: yCap, size: 7.5, align: 'c',
    s: `Gbr. 1  Pola baut ${r.nr}×${r.nc} M${r.d} — φRn grup = ${fx(r.phiRge, 1)} kN, D/C ${r.gov} = ${fx(r.govDC, 2)}`,
  })
  return { h: figRows(yCap + 10), ops, alt: 'Gbr. 1 Denah pola baut & kapasitas — lihat versi PDF' }
}

export function boltReport(r: BoltConnectionResult): Report {
  const tension = r.Tu > 0
  return {
    title: 'Sambungan Baut (SNI 1729:2020 Ps. J3)',
    sections: [
      {
        title: 'Konfigurasi',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Mutu / ulir', `${r.gradeLabel} / ${r.thread}`),
              kv('Fnt / Fnv', `${r.Fnt} / ${r.Fnv} MPa`),
              kv('Baut', `${r.nr} × ${r.nc} = ${r.n} M${r.d}, ${r.m} bidang geser`),
              kv('Ab / lubang dh', `${fx(r.Ab, 0)} mm² / ${r.dh} mm`),
              kv('Spasi s / gage g', `${fx(r.s, 0)} / ${fx(r.sg, 0)} mm`),
              kv('Jarak tepi le', `${fx(r.le, 0)} mm`),
              kv('Pelat t / Fu', `${fx(r.t, 0)} mm / ${fx(r.Fu, 0)} MPa`),
            ],
          },
        ],
      },
      {
        title: 'Beban terfaktor',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Vu (geser grup)', `${fx(r.Vu, 1)} kN`),
              kv('Tu (tarik grup)', `${fx(r.Tu, 1)} kN`),
              kv('Per baut rv / rt', `${fx(r.rv, 1)} / ${fx(r.rt, 1)} kN`),
            ],
          },
          { k: 'figure', fig: figBoltPlan(r) },
        ],
      },
      {
        title: 'Geser & tumpu (J3.6, J3.10)',
        strong: true,
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('φ·rn geser per baut', `${fx(r.phiRnv, 1)} kN`),
              ...(r.bearingOk
                ? [
                    kv('lc tepi / dalam', `${fx(r.lcEdge, 1)} / ${r.nr > 1 ? fx(r.lcInner, 1) : '-'} mm`),
                    kv('φ·rn tumpu tepi / dalam', `${fx(0.75 * r.rnBrgEdge, 1)} / ${r.nr > 1 ? fx(0.75 * r.rnBrgInner, 1) : '-'} kN`),
                  ]
                : []),
              kv('φ·Rn grup efektif', `${fx(r.phiRge, 1)} kN`),
              check('D/C geser grup', r.dcShear),
            ],
          },
        ],
      },
      ...(tension
        ? [
            {
              title: 'Tarik & kombinasi (J3.6, J3.7)',
              strong: true,
              blocks: [
                {
                  k: 'rows' as const,
                  rows: [
                    kv('φ·rn tarik per baut', `${fx(r.phiRnt, 1)} kN`),
                    check('D/C tarik', r.dcTension),
                    ...(r.FntMod != null
                      ? [
                          kv("F'nt termodifikasi", `${fx(r.FntMod, 1)} MPa`),
                          check('D/C kombinasi', r.dcComboInfo, r.comboNeeded ? undefined : 'tak wajib'),
                        ]
                      : []),
                  ],
                },
              ],
            },
          ]
        : []),
    ],
    governing: { label: `D/C menentukan (${r.gov})`, ratio: r.govDC },
    warnings: r.warn,
    scope: [
      'Bearing-type, lubang standar, beban konsentris. Belum termasuk: geser eksentris (ICR), slip-critical, blok geser, prying action.',
      'Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

export default { defaults: BOLT_DEFAULTS, build: (i: BoltConnectionInput) => boltReport(computeBoltConnection(i)) }
