import type { CBDesignItem, ContinuousBeamResult } from '../../calc/continuous-beam'
import { figRows } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { CB_DEFAULTS, coefLabels, computeCB, momentDiagram, type CBInput } from './model'

// Laporan Balok/Pelat Satu Arah Menerus (SNI 2847:2019 Ps. 6.5 metode koefisien; satu bentang statika eksak):
// beban, bentang bersih & syarat, momen & geser koefisien, desain lentur, geser balok — dengan rumus.

export { CB_DEFAULTS }

const UJUNG: Record<string, string> = { bebas: 'tidak terkekang (bebas)', spandrel: 'menyatu balok tepi', kolom: 'menyatu kolom' }
const TUMP1: Record<string, string> = { ss: 'sendi – sendi', js: 'jepit – sendi', jj: 'jepit – jepit' }

/** Gbr. 1 — elevasi balok, tumpuan, koefisien momen, dan diagram momen indikatif. */
function figBeam(r: ContinuousBeamResult): Figure {
  const ops: FigOp[] = []
  const total = r.spanLen!.reduce((a, b) => a + b, 0)
  const x0 = 46, x1 = 482, yB = 30
  const X = (x: number) => x0 + (x / total) * (x1 - x0)
  const co = coefLabels(r)
  ops.push({ t: 'line', x1: X(0), y1: yB, x2: X(total), y2: yB, lw: 2.5, c: 'ink' })
  let acc = 0
  const sx = [0, ...r.spanLen!.map((L) => (acc += L))]
  sx.forEach((x, k) => {
    ops.push({ t: 'poly', pts: [[X(x), yB + 2], [X(x) - 5, yB + 11], [X(x) + 5, yB + 11]], fill: true, c: 'support', op: 0.4 })
    ops.push({ t: 'text', x: X(x), y: yB - 6, s: co.sup[k], size: 6.5, align: 'c', c: 'm' })
  })
  r.spanLen!.forEach((L, k) => ops.push({ t: 'text', x: X(sx[k] + L / 2), y: yB + 22, s: `${co.span[k]} · ${fx(L, 2)} m`, size: 6.5, align: 'c', c: 'y' }))
  // diagram momen
  const pts = momentDiagram(r)
  const Mmax = Math.max(1e-9, ...pts.map((p) => Math.abs(p[1])))
  const y0 = yB + 70, k = 38 / Mmax
  const poly: [number, number][] = pts.map(([x, m]) => [X(x), y0 + m * k])
  ops.push({ t: 'poly', pts: [[X(0), y0], ...poly, [X(total), y0]], fill: true, c: 'm', op: 0.16 })
  ops.push({ t: 'poly', pts: poly, lw: 1.2, c: 'm' })
  ops.push({ t: 'line', x1: X(0), y1: y0, x2: X(total), y2: y0, lw: 0.6, c: 'muted' })
  r.supM!.forEach((m, k2) => {
    if (m) ops.push({ t: 'text', x: X(sx[k2]), y: y0 - m * k - 4, s: fx(-m, 1), size: 6.5, align: 'c', bold: true })
  })
  r.spanM!.forEach((m, k2) => {
    if (m) ops.push({ t: 'text', x: X(sx[k2] + r.spanLen![k2] / 2), y: y0 + m * k + 10, s: fx(m, 1), size: 6.5, align: 'c', bold: true })
  })
  ops.push({ t: 'text', x: X(0) - 4, y: y0 + 3, s: 'M_{u}', size: 7, align: 'r', c: 'm' })
  return {
    h: figRows(y0 + 50),
    ops,
    alt: 'Balok menerus, koefisien momen, dan diagram momen',
    caption: 'Gbr. 1 — Elevasi (koefisien momen tumpuan di atas, koefisien lapangan & bentang as–as di bawah) dan diagram momen terfaktor indikatif (kN·m, positif ke bawah).',
  }
}

function designRows(items: CBDesignItem[]): string[][] {
  return items.map((it) => [
    it.label,
    it.face,
    fx(it.Mu, 2),
    fx(it.As, 0),
    fx(it.AsReq, 0),
    it.txt ?? '-',
    fx(it.AsProv, 0),
    it.infeasible ? 'tak layak' : it.govMin ? 'minimum' : it.tc ? 'εt ≥ 0,005' : 'transisi',
  ])
}

export function cbReport(i: CBInput, r: ContinuousBeamResult): Report {
  const pelat = r.elem === 'pelat'
  const unitQ = pelat ? 'kN/m (lajur 1 m)' : 'kN/m'
  const des = r.des
  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Elemen', pelat ? 'pelat satu arah (lajur 1 m)' : `balok ${fx(r.b, 0)} × ${fx(r.h, 0)} mm`),
            ...(pelat ? [kv('Tebal pelat h', `${fx(r.h, 0)} mm`)] : []),
            kv('Jumlah bentang', `${r.n}${Number(i.n) > 12 ? ' (dibatasi 12)' : ''}`),
            kv('Bentang as–as ujung / dalam, lebar tumpuan', `${fx(r.L, 2)} / ${fx(r.Li, 2)} m, ${fx(r.bsup, 0)} mm`),
            ...(r.n === 1 ? [kv('Tumpuan', TUMP1[r.tumpuan1!])] : [kv('Ujung eksterior', UJUNG[r.ujung!]), kv('M^{−} tumpuan', r.m12 ? 'opsi 1/12 semua tumpuan' : 'Tabel 6.5.2')]),
          ],
        },
        { k: 'figure', fig: figBeam(r) },
      ],
    },
    {
      title: 'Beban terfaktor',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Berat sendiri, γ_{c} = 24 kN/m^{3}', lhs: 'q_{sw}', expr: pelat ? '24 h' : '24 b h', value: fx(r.qself, 3), unit: unitQ },
            { lhs: 'w_{D}', expr: 'q_{sw} + q_{D,tambahan}', value: fx(r.wD, 3), unit: unitQ },
            { lhs: 'w_{L}', value: fx(r.wL, 3), unit: unitQ },
            { lhs: 'w_{u}', expr: 'maks(1.4w_{D}; 1.2w_{D} + 1.6w_{L})', subst: `maks(${fx(r.wu14, 2)}; ${fx(r.wu12, 2)})`, value: fx(r.wu, 2), unit: unitQ },
          ],
        },
      ],
    },
  ]

  if (r.n === 1) {
    const ln = r.lnE!
    const c = r.tumpuan1!
    sections.push({
      title: 'Momen & geser (satu bentang, statika)',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'l_{n}', expr: 'L − b_{tumpuan}', subst: `${fx(r.L, 2)} − ${fx(r.bsup! / 1000, 3)}`, value: fx(ln, 3), unit: 'm' },
            { lhs: 'M_{u}^{+}', expr: c === 'jj' ? 'w_{u}l_{n}^{2}/24' : c === 'js' ? '9w_{u}l_{n}^{2}/128' : 'w_{u}l_{n}^{2}/8', subst: `${fx(r.wu, 2)} × ${fx(ln, 3)}^{2}`, value: fx(r.Mpos1, 2), unit: 'kN·m' },
            ...(r.MnegJ ? [{ lhs: 'M_{u}^{−}', expr: c === 'jj' ? 'w_{u}l_{n}^{2}/12' : 'w_{u}l_{n}^{2}/8', value: fx(r.MnegJ, 2), unit: 'kN·m' }] : []),
            { lhs: 'V_{u}', expr: c === 'js' ? '5w_{u}l_{n}/8 (sisi jepit)' : 'w_{u}l_{n}/2', value: fx(r.VJ, 2), unit: 'kN' },
          ],
        },
      ],
    })
  } else {
    const rowsM: string[][] = [
      ['M^{+} bentang ujung', `1/${r.cPosEnd}`, fx(r.lnE, 3), fx(r.MposEnd, 2)],
      ...(r.MposInt != null ? [['M^{+} bentang dalam', '1/16', fx(r.lnI, 3), fx(r.MposInt, 2)]] : []),
      ['M^{−} tumpuan luar', r.cNegExt ? `1/${r.cNegExt}` : '0', fx(r.lnE, 3), fx(r.MnegExt, 2)],
      ['M^{−} muka dalam tumpuan dalam pertama', `1/${r.cNegFI}`, fx(r.lnAvgFI, 3), fx(r.MnegFI, 2)],
      ...(r.MnegInt != null ? [['M^{−} tumpuan dalam lain', `1/${r.cNegInt}`, fx(r.lnI, 3), fx(r.MnegInt, 2)]] : []),
    ]
    const rowsV: string[][] = [
      ['V_{u} tumpuan luar', '1/2', fx(r.lnE, 3), fx(r.Vext, 2)],
      ['V_{u} muka tumpuan dalam pertama', '1.15/2', fx(r.lnE, 3), fx(r.VFI, 2)],
      ...(r.Vint != null ? [['V_{u} tumpuan dalam lain', '1/2', fx(r.lnI, 3), fx(r.Vint, 2)]] : []),
    ]
    const cond: Row[] = [check('w_{L} ≤ 3w_{D} (6.5.1c): w_{L} / 3w_{D}', r.wL! / (3 * r.wD!))]
    if (r.rasio != null) cond.push(check('Beda bentang bersebelahan ≤ 20% (6.5.1e): l_{n,maks}/l_{n,min} / 1,2', r.rasio / 1.2))
    sections.push(
      {
        title: 'Bentang bersih & syarat metode koefisien (6.5.1)',
        blocks: [
          {
            k: 'calc',
            steps: [
              { lhs: 'l_{n,ujung}', expr: 'L − b_{tumpuan}', subst: `${fx(r.L, 2)} − ${fx(r.bsup! / 1000, 3)}`, value: fx(r.lnE, 3), unit: 'm' },
              ...(r.n >= 3 ? [{ lhs: 'l_{n,dalam}', expr: 'L_{i} − b_{tumpuan}', subst: `${fx(r.Li, 2)} − ${fx(r.bsup! / 1000, 3)}`, value: fx(r.lnI, 3), unit: 'm' }] : []),
            ],
          },
          { k: 'rows', rows: cond },
          { k: 'p', text: 'Syarat lain 6.5.1: komponen prismatis, beban merata, minimal dua bentang — diasumsikan dipenuhi.' },
        ],
      },
      {
        title: 'Momen & geser terfaktor (Tabel 6.5.2 & 6.5.4)',
        strong: true,
        blocks: [
          { k: 'p', text: 'M = C_{m} w_{u} l_{n}^{2}; V = C_{v} w_{u} l_{n}. M^{−} di muka tumpuan dalam memakai rata-rata l_{n} bentang bersebelahan.' },
          { k: 'table', head: ['Lokasi', 'C_{m}', 'l_{n} (m)', 'M_{u} (kN·m)'], align: ['l', 'r', 'r', 'r'], rows: rowsM },
          { k: 'table', head: ['Lokasi', 'C_{v}', 'l_{n} (m)', 'V_{u} (kN)'], align: ['l', 'r', 'r', 'r'], rows: rowsV },
        ],
      },
    )
  }

  if (des && des.valid && des.items) {
    const ex = des.items[0]
    const Rn = ex ? (ex.Mu * 1e6) / (0.9 * des.bDes! * des.d! * des.d!) : 0
    const steps: CalcStep[] = [
      { desc: 'Satu lapis tulangan', lhs: 'd', expr: pelat ? 'h − selimut − d_{b}/2' : 'h − selimut − Ø_{s} − d_{b}/2', value: fx(des.d, 1), unit: 'mm' },
      pelat
        ? { desc: 'Susut-suhu (24.4.3.2) pada penampang bruto', lhs: 'A_{s,min}', value: fx(des.AsMin, 0), unit: 'mm^{2}/m' }
        : { lhs: 'A_{s,min}', expr: "maks(\\frac{0.25√(f'_{c})}{f_{y}}; \\frac{1.4}{f_{y}}) b d", value: fx(des.AsMin, 0), unit: 'mm^{2}', ref: '9.6.1.2' },
      ...(ex
        ? [
            { desc: `Contoh: ${ex.label}, M_{u} = ${fx(ex.Mu, 2)} kN·m`, lhs: 'R_{n}', expr: '\\frac{M_{u}}{φ b d^{2}}', value: fx(Rn, 3), unit: 'MPa' },
            { lhs: 'A_{s}', expr: "\\frac{0.85f'_{c}}{f_{y}}(1 − √(1 − \\frac{2R_{n}}{0.85f'_{c}})) b d", value: fx(ex.As, 0), unit: pelat ? 'mm^{2}/m' : 'mm^{2}' },
          ]
        : []),
      ...(pelat ? [{ desc: 'Spasi kelipatan 25 mm', lhs: 's_{maks}', expr: 'min(3h; 450)', value: fx(des.sMaxSlab, 0), unit: 'mm' }] : []),
    ]
    sections.push({
      title: 'Desain tulangan lentur',
      strong: true,
      blocks: [
        { k: 'calc', steps },
        {
          k: 'table',
          head: ['Lokasi', 'Sisi', 'M_{u} (kN·m)', 'A_{s} perlu', 'A_{s} desain', 'Tulangan', 'A_{s} pasang', 'Catatan'],
          align: ['l', 'l', 'r', 'r', 'r', 'l', 'r', 'l'],
          caption: `Luas dalam ${pelat ? 'mm^{2}/m' : 'mm^{2}'}.`,
          rows: designRows(des.items),
        },
      ],
    })
    const sh = des.shear
    if (sh)
      sections.push({
        title: 'Geser balok (22.5, 9.6.3, 9.7.6)',
        blocks: [
          {
            k: 'calc',
            steps: [
              { lhs: 'V_{c}', expr: "0.17√(f'_{c}) b_{w} d", value: fx(sh.Vc, 1), unit: 'kN' },
              { lhs: 'φV_{c}', subst: `0.75 × ${fx(sh.Vc, 1)}`, value: fx(sh.phiVc, 1), unit: 'kN' },
              { desc: `V_{u,maks} = ${fx(r.VuMax, 1)} kN`, lhs: 'V_{s,perlu}', expr: 'V_{u}/φ − V_{c} ≥ 0', value: fx(sh.VsReq, 1), unit: 'kN' },
              { lhs: '(A_{v}/s)_{min}', expr: "maks(0.062√(f'_{c}); 0.35) b_{w}/f_{yt}", value: fx(sh.avMin, 4), unit: 'mm^{2}/mm' },
              { lhs: 's_{maks}', value: fx(sh.sMax, 0), unit: 'mm' },
              ...(sh.sPakai != null ? [{ desc: `A_{v} = ${fx(sh.Av, 1)} mm^{2} (2 kaki)`, lhs: 's_{pakai}', expr: 'min(A_{v}/(A_{v}/s); s_{maks})', value: fx(sh.sPakai, 0), unit: 'mm' }] : []),
            ],
          },
          {
            k: 'p',
            text:
              sh.zone === 'none'
                ? 'V_{u} ≤ ½φV_{c} — sengkang tidak disyaratkan secara perhitungan (tetap pasang praktis).'
                : sh.zone === 'min'
                  ? 'V_{u} ≤ φV_{c} — cukup sengkang minimum.'
                  : 'V_{u} > φV_{c} — sengkang dihitung dari V_{s} perlu.',
          },
          ...(sh.overMax ? [{ k: 'rows' as const, rows: [check('V_{s,perlu} / V_{s,maks} (0,66√f\'c bw d)', sh.VsReq / sh.VsMax)] }] : []),
        ],
      })
  } else if (des?.err) sections.push({ title: 'Desain tulangan lentur', blocks: [{ k: 'p', text: des.err }] })

  return {
    title: `${pelat ? 'Pelat Satu Arah' : 'Balok'} Menerus — Metode Koefisien (SNI 2847:2019 Ps. 6.5)`,
    summary: [
      kv('w_{u}', `${fx(r.wu, 2)} ${unitQ}`),
      kv('M_{u}^{+} maks / M_{u}^{−} maks', `${fx(r.MposMax, 2)} / ${fx(r.MnegMax, 2)} kN·m`),
      kv('V_{u} maks', `${fx(r.VuMax, 2)} kN`),
      ...(des?.valid && des.items ? des.items.slice(0, 3).map((it) => kv(`Tulangan ${it.label}`, it.txt ?? '-')) : []),
    ],
    sections,
    warnings: [...r.warn, ...(des?.anyInfeasible ? ['Ada lokasi dengan M_{u} melebihi kapasitas penampang tulangan tunggal — perbesar h.'] : [])],
    scope: ['Metode koefisien (amplop, bukan satu kasus beban); syarat 6.5.1 harus dipenuhi. Desain tulangan tunggal, satu lapis. Verifikasi oleh insinyur penanggung jawab.'],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildCBReport(i: CBInput): Report | null {
  const r = computeCB(i)
  return r ? cbReport(i, r) : null
}

export default {
  defaults: CB_DEFAULTS,
  build: (i: CBInput) => buildCBReport(i) ?? { title: 'Balok/Pelat Menerus', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
