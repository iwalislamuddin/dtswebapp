import type { ShearTorsionResult } from '../../calc/beam-shear-torsion'
import { capacityFigure, dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, sci, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { computeShear, SHEAR_DEFAULTS, type ShearInput } from './model'

// Laporan Geser & Torsi Balok (SNI 2847:2019 Ps. 22.5, 22.7, 9.6, 9.7; φ = 0,75; θ = 45°): geometri torsi, ambang
// torsi, kecukupan penampang, kuat geser & torsi, tulangan transversal & longitudinal, spasi — dengan rumus.

export { SHEAR_DEFAULTS }

/** Posisi batang longitudinal (mm dari kiri-atas) — dipakai UI & laporan. */
export function longBars(r: ShearTorsionResult) {
  const b = r.b!, h = r.h!, c = r.cc! + r.ds!
  const row = (n: number, db: number, y: number) =>
    Array.from({ length: n }, (_, k) => ({ x: c + db / 2 + ((b - 2 * c - db) * k) / Math.max(1, n - 1), y, db }))
  const top = row(r.nTop!, r.dbTop!, c + r.dbTop! / 2)
  const bot = row(r.nBot!, r.dbBot!, h - c - r.dbBot! / 2)
  const per = r.nSide! / 2
  const side = Array.from({ length: per }, (_, k) => {
    const y = c + ((h - 2 * c) * (k + 1)) / (per + 1)
    return [{ x: c + r.dbSide! / 2, y, db: r.dbSide! }, { x: b - c - r.dbSide! / 2, y, db: r.dbSide! }]
  }).flat()
  return [...top, ...bot, ...side]
}

/** Gbr. 1 — penampang: sengkang tertutup, Aoh (garis putus), tulangan longitudinal. */
function figSection(r: ShearTorsionResult): Figure {
  const ops: FigOp[] = []
  const b = r.b!, h = r.h!
  const sc = Math.min(160 / b, 180 / h)
  const x0 = 170, y0 = 14, W = b * sc, H = h * sc
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, lw: 1, c: 'support' })
  const o = (r.cc! + r.ds! / 2) * sc
  ops.push({ t: 'rect', x: x0 + o, y: y0 + o, w: W - 2 * o, h: H - 2 * o, lw: 1.2, c: 'm' })
  ops.push({ t: 'rect', x: x0 + o, y: y0 + o, w: W - 2 * o, h: H - 2 * o, fill: true, c: 'y', op: 0.1 })
  for (const p of longBars(r)) ops.push({ t: 'circle', cx: x0 + p.x * sc, cy: y0 + p.y * sc, r: Math.max(1.8, (p.db * sc) / 2), fill: true, c: 'ink' })
  dimH(ops, x0, x0 + W, y0 + H + 12, `b = ${fx(b, 0)}`)
  dimV(ops, y0, y0 + H, x0 - 20, '')
  ops.push({ t: 'text', x: x0 - 24, y: y0 + H / 2, s: `h = ${fx(h, 0)}`, size: 7, align: 'r' })
  ops.push({ t: 'text', x: x0 + W + 10, y: y0 + H / 2, s: `A_{oh} = ${fx(r.x1, 0)} × ${fx(r.y1, 0)}`, size: 7, c: 'y' })
  ops.push({ t: 'text', x: x0 + W + 10, y: y0 + H / 2 + 11, s: `sengkang Ø${fx(r.ds, 0)}-${fx(r.s, 0)} (${r.nLegs} kaki)`, size: 7, c: 'm' })
  return { h: figRows(y0 + H + 20), ops, alt: 'Penampang balok dengan sengkang tertutup', caption: 'Gbr. 1 — Penampang, sengkang tertutup (garis as) yang membatasi A_{oh} dan p_{h}, serta tulangan longitudinal.' }
}

export function shearReport(r: ShearTorsionResult): Report {
  const fc = fx(r.fc, 0), sq = fx(r.sqrtfc, 3), lam = fx(r.lam, 2), b = fx(r.b, 0), d = fx(r.d, 1), fyt = fx(r.fyt, 0)
  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv("f'_{c} / f_{y} / f_{yt}", `${fc} / ${fx(r.fy, 0)} / ${fyt} MPa · λ = ${lam}`),
            kv('b × h / selimut bersih', `${b} × ${fx(r.h, 0)} mm / ${fx(r.cc, 0)} mm`),
            kv('Sengkang tertutup', `Ø${fx(r.ds, 0)} – ${fx(r.s, 0)} mm, ${r.nLegs} kaki`),
            kv('Tulangan longitudinal', `atas ${r.nTop}D${fx(r.dbTop, 0)}, bawah ${r.nBot}D${fx(r.dbBot, 0)}${r.nSide ? `, samping ${r.nSide}D${fx(r.dbSide, 0)}` : ''}`),
            kv('Beban terfaktor V_{u} / T_{u}', `${fx(r.VukN, 1)} kN / ${fx(r.TukNm, 2)} kN·m`),
          ],
        },
        { k: 'figure', fig: figSection(r) },
      ],
    },
    {
      title: 'Geometri penampang',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: "√(f'_{c}) dibatasi ≤ 8,3 MPa (22.5.3.1)", lhs: "√(f'_{c})", value: sq, unit: 'MPa' },
            { lhs: 'd', expr: 'h − selimut − Ø_{s} − d_{b,bawah}/2', subst: `${fx(r.h, 0)} − ${fx(r.cc, 0)} − ${fx(r.ds, 0)} − ${fx(r.dbBot! / 2, 1)}`, value: d, unit: 'mm' },
            { desc: 'Luas & keliling as sengkang tertutup terluar', lhs: 'A_{oh}', expr: 'x_{1} y_{1}', subst: `${fx(r.x1, 0)} × ${fx(r.y1, 0)}`, value: sci(r.Aoh!), unit: 'mm^{2}' },
            { lhs: 'p_{h}', expr: '2(x_{1} + y_{1})', value: fx(r.ph, 0), unit: 'mm' },
            { lhs: 'A_{o}', expr: '0.85 A_{oh}', value: sci(r.Ao!), unit: 'mm^{2}' },
            { lhs: 'A_{cp} / p_{cp}', expr: 'bh / 2(b + h)', value: `${sci(r.Acp!)} mm^{2} / ${fx(r.pcp, 0)} mm` },
          ],
        },
      ],
    },
    {
      title: 'Ambang torsi (22.7.4)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'T_{th}', expr: "0.083λ√(f'_{c}) \\frac{A_{cp}^{2}}{p_{cp}}", subst: `0.083 × ${lam} × ${sq} × \\frac{(${sci(r.Acp!)})^{2}}{${fx(r.pcp, 0)}}`, value: fx(r.Tth! / 1e6, 2), unit: 'kN·m' },
            { lhs: 'φT_{th}', subst: `0.75 × ${fx(r.Tth! / 1e6, 2)}`, value: fx(r.phiTthkNm, 2), unit: 'kN·m' },
          ],
        },
        { k: 'p', text: r.torsionNeglig ? `T_{u} = ${fx(r.TukNm, 2)} < φT_{th} — torsi boleh diabaikan (22.7.1.1); desain cukup terhadap geser.` : `T_{u} = ${fx(r.TukNm, 2)} ≥ φT_{th} — torsi harus diperhitungkan.` },
      ],
    },
    {
      title: 'Kecukupan dimensi penampang (22.7.7.1a)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'kiri', expr: '√((\\frac{V_{u}}{b_{w}d})^{2} + (\\frac{T_{u}p_{h}}{1.7A_{oh}^{2}})^{2})', value: fx(r.lhs, 3), unit: 'MPa' },
            { lhs: 'kanan', expr: "φ(\\frac{V_{c}}{b_{w}d} + 0.66√(f'_{c}))", value: fx(r.rhs, 3), unit: 'MPa' },
          ],
        },
        { k: 'rows', rows: [check('Dimensi penampang (kiri / kanan)', r.ratioSec!)] },
      ],
    },
    {
      title: 'Kuat geser (22.5)',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'V_{c}', expr: "0.17λ√(f'_{c}) b_{w} d", subst: `0.17 × ${lam} × ${sq} × ${b} × ${d} / 10^{3}`, value: fx(r.VckN, 1), unit: 'kN', ref: '22.5.5.1' },
            { lhs: 'A_{v}', expr: `${r.nLegs} × A_{b}`, subst: `${r.nLegs} × ${fx(r.Ab, 1)}`, value: fx(r.Av, 1), unit: 'mm^{2}' },
            { lhs: 'V_{s}', expr: '\\frac{A_{v} f_{yt} d}{s}', subst: `\\frac{${fx(r.Av, 1)} × ${fyt} × ${d}}{${fx(r.s, 0)}} / 10^{3}`, value: fx(r.Vs! / 1e3, 1), unit: 'kN', ref: '22.5.8.5.3' },
            { lhs: 'V_{s,maks}', expr: "0.66√(f'_{c}) b_{w} d", value: fx(r.VsMaxkN, 1), unit: 'kN', ref: '22.5.1.2' },
            { lhs: 'φV_{n}', expr: 'φ(V_{c} + min(V_{s}; V_{s,maks}))', subst: `0.75 × (${fx(r.VckN, 1)} + ${fx(r.VskN, 1)})`, value: fx(r.phiVnkN, 1), unit: 'kN' },
          ],
        },
        { k: 'rows', rows: [check('V_{u} / φV_{n}', r.ratioV!)] },
      ],
    },
  ]

  if (!r.torsionNeglig || r.Tu! > 0)
    sections.push({
      title: 'Kuat torsi (22.7.6)',
      strong: !r.torsionNeglig,
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'A_{t} = luas satu kaki sengkang tertutup, θ = 45°', lhs: 'T_{n}', expr: '\\frac{2A_{o}A_{t}f_{yt}}{s} cot θ', subst: `\\frac{2 × ${sci(r.Ao!)} × ${fx(r.At, 1)} × ${fyt}}{${fx(r.s, 0)}} × 1.0 / 10^{6}`, value: fx(r.Tn! / 1e6, 2), unit: 'kN·m', ref: '22.7.6.1a' },
            { lhs: 'φT_{n}', subst: `0.75 × ${fx(r.Tn! / 1e6, 2)}`, value: fx(r.phiTnkNm, 2), unit: 'kN·m' },
          ],
        },
        { k: 'rows', rows: [check('T_{u} / φT_{n}', r.ratioT!, r.torsionNeglig ? 'torsi boleh diabaikan' : undefined)] },
      ],
    })

  sections.push(
    {
      title: 'Tulangan transversal gabungan',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: '\\frac{A_{v}}{s}', expr: '\\frac{V_{u}/φ − V_{c}}{f_{yt} d} ≥ 0', value: fx(r.AvsShear, 4), unit: 'mm^{2}/mm' },
            { lhs: '\\frac{A_{t}}{s}', expr: '\\frac{T_{u}}{φ 2A_{o} f_{yt} cot θ}', value: fx(r.AtsTors, 4), unit: 'mm^{2}/mm' },
            { lhs: 'minimum', expr: "maks(0.062√(f'_{c}); 0.35)\\frac{b_{w}}{f_{yt}}", value: fx(r.minTrans, 4), unit: 'mm^{2}/mm', ref: '9.6.4.2' },
            { lhs: '(\\frac{A_{v} + 2A_{t}}{s})_{perlu}', expr: 'maks(A_{v}/s + 2A_{t}/s; minimum)', value: fx(r.demandTransGov, 4), unit: 'mm^{2}/mm' },
            { desc: 'Terpasang: A_{v} (semua kaki) + 2A_{t} (dua kaki luar)', lhs: '(\\frac{A_{v} + 2A_{t}}{s})_{pasang}', expr: '\\frac{(n_{kaki} + 2)A_{b}}{s}', subst: `\\frac{(${r.nLegs} + 2) × ${fx(r.Ab, 1)}}{${fx(r.s, 0)}}`, value: fx(r.provTrans, 4), unit: 'mm^{2}/mm' },
          ],
        },
        { k: 'rows', rows: [check('Sengkang perlu / terpasang', r.ratioTrans!)] },
      ],
    },
    {
      title: 'Tulangan longitudinal torsi (22.7.6.1, 9.6.4.3)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'A_{l}', expr: '\\frac{A_{t}}{s} p_{h} \\frac{f_{yt}}{f_{y}} cot^{2}θ', value: fx(r.AlReq, 0), unit: 'mm^{2}', ref: '22.7.6.1b' },
            { lhs: 'A_{l,min}', expr: "\\frac{0.42√(f'_{c})A_{cp}}{f_{y}} − \\frac{A_{t}}{s}p_{h}\\frac{f_{yt}}{f_{y}}", value: fx(r.AlMin, 0), unit: 'mm^{2}', ref: '9.6.4.3' },
            { lhs: 'A_{l,pasang}', expr: 'Σ batang atas + bawah + samping', value: fx(r.AlProv, 0), unit: 'mm^{2}' },
          ],
        },
        { k: 'rows', rows: [check('A_{l} perlu / terpasang', r.ratioAl!)] },
      ],
    },
    {
      title: 'Spasi sengkang maksimum',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: `V_{s} ${r.Vs! <= 0.33 * r.sqrtfc! * r.b! * r.d! ? "≤" : ">"} 0,33√(f'_{c})b_{w}d (9.7.6.2.2)`, lhs: 's_{maks,geser}', expr: r.Vs! <= 0.33 * r.sqrtfc! * r.b! * r.d! ? 'min(d/2; 600)' : 'min(d/4; 300)', value: fx(r.smaxShear, 0), unit: 'mm' },
            { lhs: 's_{maks,torsi}', expr: 'min(p_{h}/8; 300)', value: fx(r.smaxTors, 0), unit: 'mm', ref: '9.7.6.3.3' },
          ],
        },
        { k: 'rows', rows: [check(`s = ${fx(r.s, 0)} mm / s_{maks} = ${fx(r.smax, 0)} mm`, r.s! / r.smax!)] },
        {
          k: 'figure',
          fig: capacityFigure(
            [
              { label: 'φV_{c}', cap: (0.75 * r.Vc!) / 1e3, c: 'v' },
              { label: 'φV_{n}', cap: r.phiVnkN!, c: 'm' },
            ],
            r.VukN!,
            { unit: 'kN', demLabel: `V_{u} = ${fx(r.VukN, 1)} kN`, caption: 'Gbr. 2 — Kuat geser rencana (batang) terhadap V_{u} (garis).', alt: 'Kuat geser rencana' },
          ),
        },
      ],
    },
  )

  const gov = Math.max(r.ratioV!, r.torsionNeglig ? 0 : r.ratioT!, r.ratioSec!, r.ratioTrans!, r.ratioAl!)
  return {
    title: 'Geser & Torsi Balok (SNI 2847:2019 Ps. 22.5 & 22.7)',
    summary: [
      check(`Geser: V_{u} = ${fx(r.VukN, 1)} kN / φV_{n} = ${fx(r.phiVnkN, 1)} kN`, r.ratioV!),
      ...(r.torsionNeglig ? [kv('Torsi', `T_{u} < φT_{th} = ${fx(r.phiTthkNm, 2)} kN·m — diabaikan`)] : [check(`Torsi: T_{u} = ${fx(r.TukNm, 2)} / φT_{n} = ${fx(r.phiTnkNm, 2)} kN·m`, r.ratioT!)]),
      check('Dimensi penampang', r.ratioSec!),
      check('Sengkang gabungan', r.ratioTrans!),
      check('Tulangan longitudinal torsi', r.ratioAl!),
    ],
    sections,
    governing: { label: 'Rasio terbesar', ratio: gov },
    warnings: r.warn,
    scope: ['Balok persegi pejal, sengkang tertutup, θ = 45°, φ = 0,75. Belum termasuk: penampang berongga/bersayap, gaya aksial, geser-friksi. Verifikasi oleh insinyur penanggung jawab.'],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildShearReport(i: ShearInput): Report | null {
  const r = computeShear(i)
  return r ? shearReport(r) : null
}

export default {
  defaults: SHEAR_DEFAULTS,
  build: (i: ShearInput) => buildShearReport(i) ?? { title: 'Geser & Torsi Balok', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
