import type { BeamFlexureResult } from '../../calc/beam-flexure'
import { ES } from '../../calc/shared/concrete'
import { dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { BEAM_FLEX_DEFAULTS, computeBeamFlex, type BeamFlexInput } from './model'

// Laporan Kapasitas Lentur Balok (SNI 2847:2019): tinggi efektif, β1, kesetimbangan gaya (sumbu netral), regangan
// & faktor φ, Mn & φMn, tulangan minimum, daktilitas, spasi — dengan rumus dan substitusi.

export { BEAM_FLEX_DEFAULTS }

/** Posisi tulangan (mm dari serat atas): lapis tarik & tekan — sama untuk UI dan laporan. */
export function barLayout(r: BeamFlexureResult) {
  const b = r.b!, h = r.h!, cc = r.cc!, ds = r.ds!, db1 = r.db1!
  const yBot0 = cc + ds + db1 / 2, pitch = db1 + r.sv!
  const xs = (n: number, db: number) => {
    const x0 = cc + ds + db / 2, x1 = b - x0
    return n <= 1 ? [b / 2] : Array.from({ length: n }, (_, k) => x0 + ((x1 - x0) * k) / (n - 1))
  }
  const tension = r.layers!.flatMap((nl, li) => xs(nl, db1).map((x) => ({ x, y: h - (yBot0 + li * pitch), db: db1 })))
  const comp = r.doubly && r.n2! > 0 ? xs(r.n2!, r.db2!).map((x) => ({ x, y: cc + ds + r.db2! / 2, db: r.db2! })) : []
  return { tension, comp }
}

/** Gbr. 1 — penampang, blok tegangan a, sumbu netral c, diagram regangan. */
function figSection(r: BeamFlexureResult): Figure {
  const ops: FigOp[] = []
  const b = r.b!, h = r.h!
  const sc = Math.min(150 / b, 170 / h)
  const x0 = 110, y0 = 16, W = b * sc, H = h * sc
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, lw: 1, c: 'support' })
  const off = (r.cc! + r.ds! / 2) * sc
  ops.push({ t: 'rect', x: x0 + off, y: y0 + off, w: W - 2 * off, h: H - 2 * off, lw: 0.6, c: 'muted' })
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: r.a! * sc, fill: true, c: 'm', op: 0.25 })
  ops.push({ t: 'line', x1: x0 - 8, y1: y0 + r.c! * sc, x2: x0 + W + 8, y2: y0 + r.c! * sc, lw: 0.8, c: 'y', dash: [5, 3] })
  const L = barLayout(r)
  for (const p of [...L.tension, ...L.comp]) ops.push({ t: 'circle', cx: x0 + p.x * sc, cy: y0 + p.y * sc, r: Math.max(1.8, (p.db * sc) / 2), fill: true, c: 'ink' })
  dimH(ops, x0, x0 + W, y0 + H + 12, `b = ${fx(b, 0)}`)
  dimV(ops, y0, y0 + H, x0 - 22, '')
  ops.push({ t: 'text', x: x0 - 26, y: y0 + H / 2, s: `h = ${fx(h, 0)}`, size: 7, align: 'r' })
  ops.push({ t: 'text', x: x0 + W + 10, y: y0 + r.c! * sc + 3, s: `c = ${fx(r.c, 1)}`, size: 7, c: 'y' })
  ops.push({ t: 'text', x: x0 + W + 10, y: y0 + Math.max(7, (r.a! * sc) / 2 + 3), s: `a = ${fx(r.a, 1)}`, size: 7, c: 'm' })
  // diagram regangan
  const sx0 = 360, ecu = 0.003
  const kE = 60 / Math.max(ecu, Math.abs(r.et!))
  const yc = y0 + r.c! * sc, yt = y0 + r.dt! * sc
  ops.push({ t: 'line', x1: sx0, y1: y0, x2: sx0, y2: y0 + H, lw: 0.6, c: 'muted' })
  ops.push({ t: 'poly', pts: [[sx0, y0], [sx0 - ecu * kE, y0], [sx0, yc]], fill: true, c: 'm', op: 0.3 })
  ops.push({ t: 'poly', pts: [[sx0, yc], [sx0 + r.et! * kE, yt], [sx0, yt]], fill: true, c: 'y', op: 0.3 })
  ops.push({ t: 'line', x1: sx0 - ecu * kE, y1: y0, x2: sx0 + r.et! * kE, y2: yt, lw: 1, c: 'ink' })
  ops.push({ t: 'text', x: sx0 - ecu * kE - 4, y: y0 + 3, s: 'ε_{cu} = 0.003', size: 6.5, align: 'r' })
  ops.push({ t: 'text', x: sx0 + r.et! * kE + 4, y: yt + 3, s: `ε_{t} = ${fx(r.et, 4)}`, size: 6.5 })
  ops.push({ t: 'text', x: sx0, y: y0 + H + 14, s: 'regangan', size: 6.5, align: 'c', c: 'muted' })
  return {
    h: figRows(y0 + H + 22),
    ops,
    alt: 'Penampang balok, blok tegangan, dan diagram regangan',
    caption: `Gbr. 1 — Penampang ${fx(b, 0)} × ${fx(h, 0)} mm: ${r.n1} D${fx(r.db1, 0)}${r.nLay! > 1 ? ` (${r.nLay} lapis)` : ''}${r.doubly && r.n2! > 0 ? ` + ${r.n2} D${fx(r.db2, 0)} tekan` : ''}; blok tegangan a, sumbu netral c, dan regangan.`,
  }
}

/** Gbr. 2 — faktor reduksi φ terhadap εt (21.2.2, sengkang ikat). */
function figPhi(r: BeamFlexureResult): Figure {
  const ops: FigOp[] = []
  const x0 = 90, x1 = 430, y0 = 12, y1 = 110
  const eMax = Math.max(0.008, r.et! * 1.15)
  const X = (e: number) => x0 + (Math.max(0, e) / eMax) * (x1 - x0)
  const Y = (p: number) => y1 - ((p - 0.6) / 0.35) * (y1 - y0)
  const ey = r.ey!
  ops.push({ t: 'poly', pts: [[X(0), Y(0.65)], [X(ey), Y(0.65)], [X(0.005), Y(0.9)], [X(eMax), Y(0.9)]], lw: 1.3, c: 'm' })
  for (const [e, lab] of [[ey, 'ε_{ty}'], [0.004, '0.004'], [0.005, '0.005']] as const) {
    ops.push({ t: 'line', x1: X(e), y1: y0, x2: X(e), y2: y1, lw: 0.4, c: 'grid', dash: [2, 2] })
    ops.push({ t: 'text', x: X(e), y: y1 + 10, s: lab, size: 6.5, align: 'c', c: 'muted' })
  }
  for (const p of [0.65, 0.9]) ops.push({ t: 'text', x: x0 - 4, y: Y(p) + 2.5, s: fx(p, 2), size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y1, x2: x1, y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'circle', cx: X(r.et!), cy: Y(r.phi!), r: 3, fill: true, c: r.et! >= 0.004 ? 'load' : 'bad' })
  ops.push({ t: 'text', x: X(r.et!) + 5, y: Y(r.phi!) + (r.phi! > 0.85 ? 11 : -5), s: `φ = ${fx(r.phi, 3)}`, size: 7, bold: true })
  ops.push({ t: 'text', x: x1, y: y1 + 21, s: 'ε_{t}', size: 6.5, align: 'r', c: 'muted' })
  return { h: figRows(y1 + 24), ops, alt: 'Faktor reduksi terhadap regangan tarik', caption: 'Gbr. 2 — Faktor reduksi kekuatan φ terhadap regangan tarik neto ε_{t} (Tabel 21.2.2, sengkang ikat) dan titik desain.' }
}

export function beamFlexReport(r: BeamFlexureResult): Report {
  const fc = fx(r.fc, 0), fy = fx(r.fy, 0)
  const layerY = r.layers!.map((nl, li) => ({ nl, y: r.h! - (r.cc! + r.ds! + r.db1! / 2 + li * (r.db1! + r.sv!)) }))
  const C = (0.85 * r.fc! * r.b! * r.a!) / 1000, Cs = (r.Asc! * r.fsc!) / 1000, T = (r.As! * r.fs!) / 1000
  const b1Step: CalcStep =
    r.fc! <= 28
      ? { desc: "f'_{c} ≤ 28 MPa", lhs: 'β_{1}', value: '0.85', ref: '22.2.2.4.3' }
      : r.fc! >= 55
        ? { desc: "f'_{c} ≥ 55 MPa", lhs: 'β_{1}', value: '0.65', ref: '22.2.2.4.3' }
        : { lhs: 'β_{1}', expr: "0.85 − \\frac{0.05(f'_{c} − 28)}{7}", subst: `0.85 − \\frac{0.05 × (${fc} − 28)}{7}`, value: fx(r.b1, 3), ref: '22.2.2.4.3' }
  const phiStep: CalcStep =
    r.et! >= 0.005
      ? { desc: 'ε_{t} ≥ 0,005 — terkendali tarik', lhs: 'φ', value: '0.90', ref: '21.2.2' }
      : r.et! <= r.ey!
        ? { desc: 'ε_{t} ≤ ε_{ty} — terkendali tekan', lhs: 'φ', value: '0.65', ref: '21.2.2' }
        : { desc: 'Transisi', lhs: 'φ', expr: '0.65 + 0.25\\frac{ε_{t} − ε_{ty}}{0.005 − ε_{ty}}', subst: `0.65 + 0.25 × \\frac{${fx(r.et, 5)} − ${fx(r.ey, 5)}}{0.005 − ${fx(r.ey, 5)}}`, value: fx(r.phi, 3), ref: '21.2.2' }

  const sections: Section[] = [
    {
      title: 'Data penampang & material',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv("f'_{c} / f_{y} / E_{s}", `${fc} / ${fy} / ${fx(ES, 0)} MPa`),
            kv('b × h / selimut bersih / sengkang', `${fx(r.b, 0)} × ${fx(r.h, 0)} mm / ${fx(r.cc, 0)} mm / Ø${fx(r.ds, 0)}`),
            kv('Tulangan tarik', `${r.n1} D${fx(r.db1, 0)} dalam ${r.nLay} lapis (${r.layers!.join(' + ')} dari bawah)`),
            kv('Tulangan tekan', r.doubly && r.n2! > 0 ? `${r.n2} D${fx(r.db2, 0)}` : 'tidak ada (tunggal)'),
          ],
        },
        {
          k: 'calc',
          steps: [
            { lhs: 'A_{s}', expr: 'n · \\frac{π d_{b}^{2}}{4}', subst: `${r.n1} × \\frac{π × ${fx(r.db1, 0)}^{2}}{4}`, value: fx(r.As, 1), unit: 'mm^{2}' },
            ...(r.Asc! > 0 ? [{ lhs: "A'_{s}", expr: 'n · \\frac{π d_{b}^{2}}{4}', subst: `${r.n2} × \\frac{π × ${fx(r.db2, 0)}^{2}}{4}`, value: fx(r.Asc, 1), unit: 'mm^{2}' }] : []),
          ],
        },
        { k: 'figure', fig: figSection(r) },
      ],
    },
    {
      title: 'Tinggi efektif',
      blocks: [
        ...(r.nLay! > 1
          ? [
              {
                k: 'table' as const,
                head: ['Lapis (dari bawah)', 'Jumlah batang', 'Kedalaman dari serat tekan (mm)'],
                align: ['l', 'r', 'r'] as ('l' | 'r')[],
                rows: layerY.map((l, k) => [String(k + 1), String(l.nl), fx(l.y, 1)]),
              },
              { k: 'p' as const, text: `Spasi bersih antar lapis ${fx(r.sv, 0)} mm. Gaya tarik dipusatkan di titik berat grup; ε_{t} dihitung di lapis terbawah.` },
            ]
          : []),
        {
          k: 'calc',
          steps: [
            {
              desc: r.nLay! > 1 ? 'Titik berat grup tulangan tarik' : 'Satu lapis',
              lhs: 'd',
              expr: r.nLay! > 1 ? '\\frac{Σ n_{i} d_{i}}{Σ n_{i}}' : 'h − selimut − Ø_{s} − d_{b}/2',
              subst: r.nLay! > 1 ? undefined : `${fx(r.h, 0)} − ${fx(r.cc, 0)} − ${fx(r.ds, 0)} − ${fx(r.db1! / 2, 1)}`,
              value: fx(r.d, 1),
              unit: 'mm',
            },
            { desc: 'Baja tarik terluar', lhs: 'd_{t}', value: fx(r.dt, 1), unit: 'mm' },
            ...(r.Asc! > 0 ? [{ desc: 'Pusat tulangan tekan', lhs: "d'", value: fx(r.dp, 1), unit: 'mm' }] : []),
          ],
        },
      ],
    },
    {
      title: 'Kesetimbangan gaya & sumbu netral',
      blocks: [
        {
          k: 'p',
          text: "Sumbu netral c dicari (bisection) sehingga C + C_{s} = T, dengan f_{s} = min(f_{y}; E_{s}·0.003(d − c)/c) dan f'_{s} = min(f_{y}; E_{s}·0.003(c − d')/c) — berlaku untuk penampang under- maupun over-reinforced. Perpindahan beton oleh baja tekan diabaikan.",
        },
        {
          k: 'calc',
          steps: [
            b1Step,
            { desc: 'Hasil iterasi', lhs: 'c', value: fx(r.c, 2), unit: 'mm' },
            { lhs: 'a', expr: 'β_{1} c', subst: `${fx(r.b1, 3)} × ${fx(r.c, 2)}`, value: fx(r.a, 2), unit: 'mm' },
            { lhs: 'f_{s}', expr: 'min(f_{y}; E_{s} · 0.003\\frac{d − c}{c})', value: fx(r.fs, 1), unit: 'MPa' },
            ...(r.Asc! > 0 ? [{ lhs: "f'_{s}", expr: "min(f_{y}; E_{s} · 0.003\\frac{c − d'}{c})", value: fx(r.fsc, 1), unit: 'MPa' }] : []),
            { lhs: 'C', expr: "0.85 f'_{c} b a", subst: `0.85 × ${fc} × ${fx(r.b, 0)} × ${fx(r.a, 2)} / 10^{3}`, value: fx(C, 1), unit: 'kN' },
            ...(r.Asc! > 0 ? [{ lhs: 'C_{s}', expr: "A'_{s} f'_{s}", subst: `${fx(r.Asc, 1)} × ${fx(r.fsc, 1)} / 10^{3}`, value: fx(Cs, 1), unit: 'kN' }] : []),
            { lhs: 'T', expr: 'A_{s} f_{s}', subst: `${fx(r.As, 1)} × ${fx(r.fs, 1)} / 10^{3}`, value: fx(T, 1), unit: 'kN' },
            { desc: 'Kontrol', lhs: 'C + C_{s} − T', value: fx(C + Cs - T, 2), unit: 'kN' },
          ],
        },
      ],
    },
    {
      title: 'Regangan & faktor reduksi',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'ε_{t}', expr: '0.003\\frac{d_{t} − c}{c}', subst: `0.003 × \\frac{${fx(r.dt, 1)} − ${fx(r.c, 2)}}{${fx(r.c, 2)}}`, value: fx(r.et, 5) },
            { lhs: 'ε_{ty}', expr: 'f_{y}/E_{s}', subst: `${fy}/${fx(ES, 0)}`, value: fx(r.ey, 5) },
            phiStep,
          ],
        },
        { k: 'rows', rows: [kv('Klasifikasi', r.cls!), check('Daktilitas: 0,004 / ε_{t} (Ps. 9.3.3.1)', 0.004 / Math.max(r.et!, 1e-9))] },
        { k: 'figure', fig: figPhi(r) },
      ],
    },
    {
      title: 'Kekuatan lentur',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'M_{n}', expr: r.Asc! > 0 ? "C(d − \\frac{a}{2}) + C_{s}(d − d')" : 'C(d − \\frac{a}{2})', subst: r.Asc! > 0 ? `${fx(C, 1)} × (${fx(r.d, 1)} − ${fx(r.a! / 2, 2)}) + ${fx(Cs, 1)} × (${fx(r.d, 1)} − ${fx(r.dp, 1)})` : `${fx(C, 1)} × (${fx(r.d, 1)} − ${fx(r.a! / 2, 2)})`, value: fx(r.MnkNm, 2), unit: 'kN·m' },
            { lhs: 'φM_{n}', subst: `${fx(r.phi, 3)} × ${fx(r.MnkNm, 2)}`, value: fx(r.phiMnkNm, 2), unit: 'kN·m' },
          ],
        },
      ],
    },
    {
      title: 'Tulangan minimum & spasi',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'ρ_{min}', expr: "maks(\\frac{0.25√(f'_{c})}{f_{y}}; \\frac{1.4}{f_{y}})", value: fx(r.Asmin! / (r.b! * r.d!), 5), ref: '9.6.1.2' },
            { lhs: 'A_{s,min}', expr: 'ρ_{min} b d', subst: `${fx(r.Asmin! / (r.b! * r.d!), 5)} × ${fx(r.b, 0)} × ${fx(r.d, 1)}`, value: fx(r.Asmin, 1), unit: 'mm^{2}' },
            { lhs: 'ρ', expr: '\\frac{A_{s}}{b d}', value: fx(r.rho, 5) },
          ],
        },
        {
          k: 'rows',
          rows: [
            check('A_{s,min} / A_{s}', r.Asmin! / r.As!),
            ...(r.sClear != null ? [kv(`Spasi bersih horizontal (${r.nmax} batang per lapis)`, `${fx(r.sClear, 0)} mm`), check(`s_{min} = maks(25; d_{b}) = ${fx(r.sMin, 0)} mm / spasi bersih`, r.sMin! / Math.max(r.sClear, 1e-9))] : []),
          ],
        },
      ],
    },
  ]

  return {
    title: 'Kapasitas Lentur Balok Persegi (SNI 2847:2019)',
    summary: [
      kv('Kekuatan lentur rencana φM_{n}', `${fx(r.phiMnkNm, 2)} kN·m`),
      kv('Kekuatan nominal M_{n} / φ', `${fx(r.MnkNm, 2)} kN·m / ${fx(r.phi, 3)}`),
      kv(`ε_{t} — ${r.cls}`, fx(r.et, 5)),
      kv('c / a / d', `${fx(r.c, 1)} / ${fx(r.a, 1)} / ${fx(r.d, 1)} mm`),
    ],
    sections,
    warnings: r.warn,
    scope: [
      `Balok persegi, blok tegangan ekuivalen (β_{1}), ε_{cu} = 0,003, E_{s} = ${sci(ES)} MPa; batang tersebar merata per lapis; spasi minimum mengabaikan syarat 4/3 ukuran agregat.`,
      'Belum termasuk: penampang T/L, geser & torsi, lendutan, retak. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildBeamFlexReport(i: BeamFlexInput): Report | null {
  const r = computeBeamFlex(i)
  return r ? beamFlexReport(r) : null
}

export default {
  defaults: BEAM_FLEX_DEFAULTS,
  build: (i: BeamFlexInput) => buildBeamFlexReport(i) ?? { title: 'Kapasitas Balok', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
