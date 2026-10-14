import type { ConcreteWallResult, WallFlexure } from '../../calc/retaining-concrete'
import { opsiName } from '../../calc/retaining-concrete'
import { figRows } from '../../report/figure'
import { check, fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { basePressures, geomOf, stabilityRatios, wallPolys, type Pt } from '../_retaining/common'
import { figWall, stabilitySections } from '../_retaining/report'
import { WALL_DEFAULTS, computeConcrete, structRatios, type ConcreteWallUIInput } from './model'

// Laporan DPT Beton Kantilever: stabilitas layan (bersama), lalu tumpu terfaktor 1,2D + 1,6H + 1,6L, tulangan
// stem/toe/heel per SNI 2847:2019, tulangan susut-suhu, dan BOQ (beton, besi, bekisting).

export { WALL_DEFAULTS }

/** Gbr. 2 — skema penulangan: tulangan utama stem (muka tanah), toe (bawah), heel (atas), tulangan bagi. */
function figRebar(r: ConcreteWallResult): Figure {
  const g = geomOf(r)
  const P = wallPolys(g)
  const ops: FigOp[] = []
  const hTot = g.H + g.tf
  const sc = Math.min(300 / g.B, 170 / hTot)
  const x0 = 120, yBase = 16 + hTot * sc
  const X = (x: number) => x0 + x * sc
  const Y = (y: number) => yBase - y * sc
  const poly = (pts: Pt[], op: number) => {
    const q = pts.map(([x, y]) => [X(x), Y(y)] as Pt)
    ops.push({ t: 'poly', pts: q, close: true, fill: true, c: 'support', op })
    ops.push({ t: 'poly', pts: q, close: true, lw: 0.9, c: 'support' })
  }
  poly(P.foot, 0.12)
  poly(P.stem, 0.18)
  const cs = r.covS! / 1000, cf = r.covF! / 1000
  const xBack = g.toe + g.bBot
  const xBackTop = P.xTopBack
  const bw = g.bBot - g.bTop
  const tegak = g.opsi === 'tegak'
  const bar = Math.max(1.4, (r.dbM! / 1000) * sc)
  const dotR = Math.max(1.3, ((r.dbD! / 1000) * sc) / 2)
  // x muka belakang / depan stem pada ketinggian y (dari dasar tapak), sudah dikurangi selimut
  const xBackAt = (y: number) => (tegak ? xBack - cs : xBack - ((xBack - xBackTop) * (y - g.tf)) / g.H - cs * 1.2)
  const xFrontAt = (y: number) => (tegak ? g.toe + (bw * (y - g.tf)) / g.H + cs * 1.2 : g.toe + cs)
  // utama stem (merah): muka tanah, turun menembus tapak sampai dasar tapak, dibengkokkan ke arah toe
  const yTopBar = g.tf + g.H - 0.05
  const stemBar: Pt[] = [[xBackAt(yTopBar), yTopBar], [xBackAt(g.tf), g.tf], [xBackAt(g.tf), cf + 0.02], [Math.max(cf + 0.02, xBackAt(g.tf) - 0.35), cf + 0.02]]
  ops.push({ t: 'poly', pts: stemBar.map(([x, y]) => [X(x), Y(y)] as Pt), lw: bar, c: 'y' })
  // tulangan atas tapak (biru): memanjang penuh dari ujung toe sampai ujung heel
  ops.push({ t: 'line', x1: X(cf), y1: Y(g.tf - cf), x2: X(g.B - cf), y2: Y(g.tf - cf), lw: bar, c: 'm' })
  // tulangan bawah toe/heel
  ops.push({ t: 'line', x1: X(cf), y1: Y(cf), x2: X(g.B - cf), y2: Y(cf), lw: bar, c: 'v' })
  // muka depan stem: tulangan vertikal (garis) di muka depan
  ops.push({ t: 'line', x1: X(xFrontAt(g.tf)), y1: Y(g.tf), x2: X(xFrontAt(yTopBar)), y2: Y(yTopBar), lw: Math.max(1, (r.dbD! / 1000) * sc), c: 'muted' })
  // tulangan susut horizontal (tegak lurus bidang gambar → titik) di kedua muka stem, spasi sebenarnya
  const sH = r.sH! / 1000
  for (let y = g.tf + 0.08; y <= yTopBar; y += sH) {
    for (const x of [xBackAt(y) - cs * 0.9, xFrontAt(y) + cs * 0.9]) ops.push({ t: 'circle', cx: X(x), cy: Y(y), r: dotR, fill: true, c: 'ink' })
  }
  const st = r.stem!, to = r.toeD!, he = r.heelD!
  const lx = X(g.B) + 16
  const lab = (y: number, s: string, c: 'y' | 'v' | 'm' | 'muted' | 'ink', tx: number, ty: number) => {
    ops.push({ t: 'line', x1: tx, y1: ty, x2: lx - 3, y2: y - 2.5, lw: 0.4, c })
    ops.push({ t: 'text', x: lx, y, s, size: 6.5, c })
  }
  const yL = Y(g.tf + g.H) + 6
  lab(yL, `D${fx(r.dbM, 0)}-${st.s} stem utama`, 'y', X(xBackAt(yTopBar)), Y(yTopBar))
  lab(yL + 12, `D${fx(r.dbD, 0)}-${r.sH} susut horizontal (titik)`, 'ink', X(xBackAt(g.tf + 0.08 + sH * 2) - cs * 0.9), Y(g.tf + 0.08 + sH * 2))
  lab(yL + 24, `D${fx(r.dbD, 0)}-${r.sFv} muka depan vertikal`, 'muted', X(xFrontAt(g.tf + 0.5 * g.H)), Y(g.tf + 0.5 * g.H))
  lab(Y(g.tf) - 4, `D${fx(r.dbM, 0)}-${he.s} atas tapak (penuh)`, 'm', X(g.B - 0.3), Y(g.tf - cf))
  lab(Y(0) + 4, `D${fx(r.dbM, 0)}-${to.s} bawah tapak`, 'v', X(g.B - 0.3), Y(cf))
  ops.push({ t: 'text', x: X(0), y: Y(0) + 22, s: `Tapak memanjang D${fx(r.dbD, 0)}-${r.sFt}`, size: 6.5, c: 'muted' })
  return {
    h: figRows(Y(0) + 28),
    ops,
    alt: 'Skema penulangan dinding kantilever',
    caption: 'Gbr. 2 — Skema penulangan (bengkokan tidak berskala): tulangan utama stem (merah) turun sampai dasar tapak lalu dibengkokkan ke toe; lapis atas tapak (biru) memanjang penuh; lapis bawah tapak (hijau); susut horizontal stem berupa titik pada kedua muka.',
  }
}

function flexBlocks(f: WallFlexure, name: string, r: ConcreteWallResult, lead: CalcStep[]): Block[] {
  const fc = fx(r.fc, 0), fy = fx(r.fy, 0)
  const steps: CalcStep[] = [...lead]
  const blocks: Block[] = [{ k: 'calc', steps }]
  if (f.AsProv === undefined) {
    blocks.push({ k: 'p', text: `${name}: ${f.note}` })
    return blocks
  }
  steps.push(
    { lhs: 'A_{s,perlu}', expr: `ρ b d,  ρ = \\frac{0.85 f'_{c}}{f_{y}}(1 − √(1 − \\frac{2R_{n}}{0.85 f'_{c}}))`, subst: `R_{n} = \\frac{M_{u}}{0.9 · 1000 · d^{2}},  f'_{c} = ${fc},  f_{y} = ${fy}`, value: fx(f.AsReq, 0), unit: 'mm²/m' },
    { lhs: 'A_{s,min}', expr: "maks(0.25√f'_{c}; 1.4)/f_{y} · b d", value: fx(f.AsMin, 0), unit: 'mm²/m', ref: '9.6.1.2' },
    { desc: 'Dipakai maks(A_{s}; min(A_{s,min}; 4/3 A_{s}))', lhs: 'A_{s,pakai}', value: fx(f.AsUse, 0), unit: 'mm²/m', ref: '9.6.1.3' },
    { desc: `Terpasang D${fx(f.db, 0)}-${f.s} (kelipatan 25 mm)`, lhs: 'A_{s,pasang}', expr: '\\frac{1000 · π d_{b}^{2}/4}{s}', value: fx(f.AsProv, 0), unit: 'mm²/m' },
    { lhs: 'φM_{n}', expr: 'φ A_{s} f_{y}(d − \\frac{a}{2})', value: fx(f.phiMn, 2), unit: 'kN·m/m' },
    { lhs: 'ε_{t}', expr: '0.003\\frac{d − c}{c}', value: fx(f.et, 4), ref: '21.2.2' },
  )
  blocks.push({
    k: 'rows',
    rows: [check(`${name} lentur: M_{u} / φM_{n}`, f.dc ?? 0), ...(f.et! < 0.005 ? [kv('Catatan', `ε_{t} < 0,005 — ${f.note || 'bukan terkendali tarik'}`)] : [])],
  })
  return blocks
}

function shearBlock(f: WallFlexure, name: string, r: ConcreteWallResult): Block[] {
  if (f.Vu === undefined || f.phiVc === undefined) return []
  return [
    {
      k: 'calc',
      steps: [
        { lhs: 'V_{u}', value: fx(f.Vu, 2), unit: 'kN/m' },
        { lhs: 'φV_{c}', expr: "φ · 0.17 √(f'_{c}) · 1000 · d", subst: `0.75 × 0.17 × √${fx(r.fc, 0)} × 1000 × ${fx(f.d, 1)} / 10^{3}`, value: fx(f.phiVc, 2), unit: 'kN/m', ref: '22.5.5.1' },
      ],
    },
    { k: 'rows', rows: [check(`${name} geser: V_{u} / φV_{c}`, f.dcV ?? 0)] },
  ]
}

export function concreteWallReport(r: ConcreteWallResult): Report {
  const stabRatios = stabilityRatios(r)
  const allRatios = [...stabRatios, ...structRatios(r)]
  const gov = allRatios.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  const bp = basePressures(r)
  const cb = Math.cos(((r.beta ?? 0) * Math.PI) / 180)
  const hasToe = r.toe! > 0.01, hasHeel = r.B! - r.xb! > 0.01

  const stability = stabilitySections(r, true)

  const factored: Section = {
    title: 'Tumpu terfaktor (1,2D + 1,6H + 1,6L)',
    blocks: [
      {
        k: 'p',
        text: 'Berat sendiri dan tanah × 1,2; tekanan tanah dan beban merata × 1,6. Tekanan tumpu terfaktor dipakai untuk momen dan geser toe dan heel; tanah di atas toe diabaikan (konservatif).',
      },
      {
        k: 'calc',
        steps: [
          { lhs: 'ΣV_{u}', expr: '1.2 ΣW + 1.6 P_{a,v} + 1.6 P_{q,v}', value: fx(r.sumVu, 2), unit: 'kN/m' },
          { lhs: 'M_{r,u}', value: fx(r.Mru, 2), unit: 'kN·m/m' },
          { lhs: 'M_{o,u}', expr: '1.6 P_{a,h} y_{Pa} + 1.6 P_{q,h} y_{Pq}', value: fx(r.Mou, 2), unit: 'kN·m/m' },
          { lhs: 'x̄_{u}', expr: '\\frac{M_{r,u} − M_{o,u}}{ΣV_{u}}', value: fx(r.xbaru, 3), unit: 'm' },
          { lhs: 'e_{u}', expr: '\\frac{B}{2} − x̄_{u}', value: fx(r.eu, 3), unit: 'm' },
          { desc: r.triU ? `Segitiga, kontak ${fx(r.LcU, 2)} m` : 'Trapesium', lhs: 'q_{u,toe} / q_{u,heel}', value: `${fx(r.quAt!(0), 1)} / ${fx(r.quAt!(r.B!), 1)}`, unit: 'kPa' },
        ],
      },
    ],
  }

  const stemBlocks: Block[] = [
    ...flexBlocks(r.stem!, 'Stem', r, [
      { lhs: 'M_{u}', expr: '1.6 cosβ K_{a} \\frac{γ H^{3}}{6} + 1.6 cosβ K_{a} \\frac{q H^{2}}{2}', subst: `1.6 × ${fx(cb, 4)} × ${fx(r.Ka, 4)} × \\frac{${fx(r.g1, 1)} × ${fx(r.H, 2)}^{3}}{6} + 1.6 × ${fx(cb, 4)} × ${fx(r.Ka, 4)} × \\frac{${fx(r.q, 1)} × ${fx(r.H, 2)}^{2}}{2}`, value: fx(r.MuStem, 2), unit: 'kN·m/m' },
      { lhs: 'V_{u}', expr: '1.6 cosβ K_{a} \\frac{γ H^{2}}{2} + 1.6 cosβ K_{a} q H', value: fx(r.stem!.Vu, 2), unit: 'kN/m' },
      { lhs: 'd', expr: 'b_{bawah} − selimut − d_{b}/2', subst: `${fx(r.bBot! * 1000, 0)} − ${fx(r.covS, 0)} − ${fx(r.dbM! / 2, 1)}`, value: fx(r.dStem, 1), unit: 'mm' },
    ]),
    ...shearBlock(r.stem!, 'Stem', r),
  ]
  const footD = r.dFoot
  const toeBlocks: Block[] = hasToe
    ? [
        { k: 'p', text: 'Momen toe = integral (q_{u} − 1,2 γ_{c} t) × lengan, 200 pias dari muka stem ke ujung toe.' },
        ...flexBlocks(r.toeD!, 'Toe', r, [
          { lhs: 'M_{u}', expr: 'integral numerik', value: fx(r.MuToe, 2), unit: 'kN·m/m' },
          { lhs: 'd', expr: 't − selimut − d_{b}/2', value: fx(footD, 1), unit: 'mm' },
        ]),
        ...shearBlock(r.toeD!, 'Toe', r),
      ]
    : [{ k: 'p', text: 'Tidak ada toe (proyeksi depan ≈ 0).' }]
  const heelBlocks: Block[] = hasHeel
    ? [
        { k: 'p', text: 'Momen heel = integral beban ke bawah (1,2(γ_{c} t + γ h_{tanah}) + 1,6 q) − q_{u} dari muka stem ke ujung heel.' },
        ...flexBlocks(r.heelD!, 'Heel', r, [
          { lhs: 'M_{u}', expr: 'integral numerik', value: fx(r.MuHeel, 2), unit: 'kN·m/m' },
          { lhs: 'd', expr: 't − selimut − d_{b}/2', value: fx(footD, 1), unit: 'mm' },
        ]),
        ...shearBlock(r.heelD!, 'Heel', r),
      ]
    : [{ k: 'p', text: 'Tidak ada heel (proyeksi belakang ≈ 0).' }]

  const shrink: Section = {
    title: 'Tulangan bagi / susut-suhu',
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'A_{s,horizontal}', expr: '0.002 · 1000 · t_{rt}', subst: `t_{rt} = tebal stem rata-rata ${fx((r.bTop! + r.bBot!) * 500, 0)} mm`, value: fx(r.AsH, 0), unit: 'mm²/m (2 muka)' },
          { lhs: 's_{horizontal}', value: `D${fx(r.dbD, 0)}-${r.sH}`, unit: 'tiap muka' },
          { lhs: 'A_{s,vertikal muka depan}', expr: '0.0012 · 1000 · t_{rt}', value: fx(r.AsFv, 0), unit: 'mm²/m' },
          { lhs: 's_{vertikal depan}', value: `D${fx(r.dbD, 0)}-${r.sFv}` },
          { lhs: 'A_{s,tapak memanjang}', expr: '0.0018 · 1000 · t', value: fx(r.AsFt, 0), unit: 'mm²/m (2 lapis)' },
          { lhs: 's_{tapak}', value: `D${fx(r.dbD, 0)}-${r.sFt}` },
        ],
      },
    ],
  }

  const boq: Section = {
    title: 'Kuantitas (BOQ)',
    blocks: [
      {
        k: 'table',
        head: ['Set tulangan', 'As (mm²/m)', 'Panjang (m)', 'Berat (kg/m dinding)'],
        align: ['l', 'r', 'r', 'r'],
        rows: [
          ...r.sets!.map((s) => [s.nm, fx(s.As, 0), fx(s.len, 2), fx(s.kg, 2)]),
          ['Σ besi', '', '', fx(r.steelM, 2)],
        ],
        caption: 'Panjang set utama sudah memasukkan penyaluran/stek 40 d_{b}; berat = As × panjang × 7850 kg/m³.',
      },
      {
        k: 'rows',
        rows: [
          kv('Beton', `${fx(r.volM, 3)} m³/m${r.volTot != null ? ` → ${fx(r.volTot, 2)} m³` : ''}`),
          kv('Besi', `${fx(r.steelM, 1)} kg/m${r.steelTot != null ? ` → ${fx(r.steelTot, 0)} kg` : ''} (${fx(r.ratio, 0)} kg/m³ beton)`),
          kv('Bekisting (2H + 2t)', `${fx(r.formM, 2)} m²/m${r.formTot != null ? ` → ${fx(r.formTot, 1)} m²` : ''}`),
        ],
      },
    ],
  }

  const sections: Section[] = [
    {
      title: 'Data & geometri',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Bentuk', opsiName(r.opsi!)),
            kv('H / b_{atas} / b_{bawah}', `${fx(r.H, 2)} / ${fx(r.bTop, 2)} / ${fx(r.bBot, 2)} m`),
            kv('Tapak t / toe / heel', `${fx(r.tf, 2)} / ${fx(r.toe, 2)} / ${fx(r.heel, 2)} m → B = ${fx(r.B, 2)} m`),
            kv('Urugan γ / φ / β / q', `${fx(r.g1, 1)} kN/m³ / ${fx(r.phi1, 1)}° / ${fx(r.beta, 1)}° / ${fx(r.q, 1)} kPa`),
            kv('Tanah fondasi γ / φ / c', `${fx(r.g2, 1)} kN/m³ / ${fx(r.phi2, 1)}° / ${fx(r.c2, 1)} kPa`),
            kv('q_{izin} / k / D / pasif', `${r.qall! > 0 ? fx(r.qall, 0) + ' kPa' : '—'} / ${fx(r.kf, 2)} / ${fx(r.D, 2)} m / ${r.usePp ? 'diikutkan' : 'diabaikan'}`),
            kv("Beton γ / f'_{c} / f_{y}", `${fx(r.gc, 1)} kN/m³ / ${fx(r.fc, 0)} / ${fx(r.fy, 0)} MPa`),
            kv('Selimut stem / tapak, tulangan utama / bagi', `${fx(r.covS, 0)} / ${fx(r.covF, 0)} mm, D${fx(r.dbM, 0)} / D${fx(r.dbD, 0)}`),
          ],
        },
        { k: 'figure', fig: figWall(r, `Gbr. 1 — Penampang dinding (${opsiName(r.opsi!)}): stem, tapak, urugan, tekanan dasar layan (kPa) dan gaya aktif horizontal.`) },
      ],
    },
    ...stability,
    factored,
    { title: 'Stem (lentur & geser di dasar)', blocks: stemBlocks },
    { title: 'Toe', blocks: toeBlocks },
    { title: 'Heel', blocks: heelBlocks },
    shrink,
    { title: 'Skema penulangan', blocks: [{ k: 'figure', fig: figRebar(r) }] },
    boq,
  ]
  return {
    title: 'DPT Beton Kantilever (SNI 2847:2019)',
    summary: [
      kv('FS guling / geser', `${fx(r.FSot, 2)} / ${fx(r.FSsl, 2)} (min ${fx(r.FSotT, 1)} / ${fx(r.FSslT, 1)})`),
      kv('Tekanan dasar toe / heel', `${Number.isFinite(bp.toe) ? fx(bp.toe, 1) : '∞'} / ${fx(bp.heel, 1)} kPa`),
      kv('Tulangan stem / toe / heel', `D${fx(r.dbM, 0)}-${r.stem!.s ?? '—'} / ${hasToe ? 'D' + fx(r.dbM, 0) + '-' + (r.toeD!.s ?? '—') : '—'} / ${hasHeel ? 'D' + fx(r.dbM, 0) + '-' + (r.heelD!.s ?? '—') : '—'}`),
      kv('Beton / besi', `${fx(r.volM, 2)} m³/m · ${fx(r.steelM, 0)} kg/m`),
    ],
    sections,
    governing: Number.isFinite(gov.ratio) ? { label: gov.label, ratio: gov.ratio } : undefined,
    warnings: r.warn,
    scope: [
      'Per meter panjang dinding; tekanan aktif Rankine pada bidang vertikal semu di ujung heel (urugan granular), gesekan dinding diabaikan; tulangan tunggal.',
      'Belum termasuk: air tanah (wajib drainase dan lubang suling-suling), gempa, panjang penyaluran stek stem–tapak (gunakan Penyaluran Tulangan), shear key. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildConcreteWallReport(i: ConcreteWallUIInput): Report | null {
  const r = computeConcrete(i)
  return r ? concreteWallReport(r) : null
}

export default {
  defaults: WALL_DEFAULTS,
  build: (i: ConcreteWallUIInput) => buildConcreteWallReport(i) ?? { title: 'DPT Beton Kantilever', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
