import type { CBElement } from '../../calc/shared/coefficient-method'
import type { CMItem, CMResult } from '../../calc/continuous-beam'
import { dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { computeCM, defaultsFor, type CMUI } from './model'
import { rebarFigures } from './rebar'

// Laporan Balok Menerus & Pelat Satu Arah Menerus (SNI 2847:2019): beban, penampang T/L, syarat 6.5.1 & metode,
// momen/geser (koefisien atau solver elastis), desain lentur & geser, lendutan dengan pengaruh retak.

const UJUNG: Record<string, string> = { bebas: 'tidak terkekang (bebas)', spandrel: 'menyatu balok tepi', kolom: 'menyatu kolom' }
const TUMP1: Record<string, string> = { ss: 'sendi – sendi', js: 'jepit – sendi', jj: 'jepit – jepit' }
const RETAK: Record<string, string> = {
  ig: 'penampang utuh (E_{c}I_{g})',
  rata: 'I_{e} Branson rata-rata per bentang (24.2.3.7)',
  variabel: 'I_{e} Branson bervariasi sepanjang bentang (tiap 1/10 bentang)',
}

/** Gbr. 1 — elevasi, momen desain di muka tumpuan/lapangan, dan diagram momen (amplop). */
function figBeam(r: CMResult): Figure {
  const ops: FigOp[] = []
  const total = r.spanLen!.reduce((a, b) => a + b, 0)
  const x0 = 46, x1 = 482, yB = 30
  const X = (x: number) => x0 + (x / total) * (x1 - x0)
  ops.push({ t: 'line', x1: X(0), y1: yB, x2: X(total), y2: yB, lw: 2.5, c: 'ink' })
  let acc = 0
  const sx = [0, ...r.spanLen!.map((L) => (acc += L))]
  sx.forEach((x) => {
    ops.push({ t: 'poly', pts: [[X(x), yB + 2], [X(x) - 5, yB + 11], [X(x) + 5, yB + 11]], fill: true, c: 'support', op: 0.4 })
  })
  r.spanLen!.forEach((L, k) => ops.push({ t: 'text', x: X(sx[k] + L / 2), y: yB + 22, s: `${fx(L, 2)} m`, size: 6.5, align: 'c', c: 'y' }))
  const d = r.diagram!
  const Mmax = Math.max(1e-9, ...d.mHi.map(Math.abs), ...d.mLo.map(Math.abs))
  const y0 = yB + 70, k = 38 / Mmax
  const hi: [number, number][] = d.x.map((x, i) => [X(x), y0 + d.mHi[i] * k])
  const lo: [number, number][] = d.x.map((x, i) => [X(x), y0 + d.mLo[i] * k])
  const same = d.mHi.every((v, i) => Math.abs(v - d.mLo[i]) < 1e-9)
  ops.push({ t: 'poly', pts: [...hi, ...(same ? [[X(total), y0], [X(0), y0]] : [...lo].reverse())] as [number, number][], fill: true, c: 'm', op: 0.16 })
  ops.push({ t: 'poly', pts: hi, lw: 1.2, c: 'm' })
  if (!same) ops.push({ t: 'poly', pts: lo, lw: 1.2, c: 'm' })
  ops.push({ t: 'line', x1: X(0), y1: y0, x2: X(total), y2: y0, lw: 0.6, c: 'muted' })
  r.supM!.forEach((m, k2) => {
    if (m > 1e-6) ops.push({ t: 'text', x: X(sx[k2]), y: y0 - m * k - 4, s: fx(-m, 1), size: 6.5, align: 'c', bold: true })
  })
  r.spanM!.forEach((m, k2) => {
    if (m > 1e-6) ops.push({ t: 'text', x: X(sx[k2] + r.spanLen![k2] / 2), y: y0 + m * k + 10, s: fx(m, 1), size: 6.5, align: 'c', bold: true })
  })
  ops.push({ t: 'text', x: X(0) - 4, y: y0 + 3, s: 'M_{u}', size: 7, align: 'r', c: 'm' })
  return {
    h: figRows(y0 + 50),
    ops,
    alt: 'Balok menerus dan diagram momen',
    caption: `Gbr. 1 — Elevasi (bentang as–as) dan diagram momen terfaktor ${r.metode === 'solver' ? '(amplop pola beban, analisis elastis)' : 'indikatif (metode koefisien)'} (kN·m, positif ke bawah); angka = momen desain di muka tumpuan & lapangan.`,
  }
}

/** Gbr. 2 — penampang balok persegi / T / L dengan lebar efektif sayap (bentang 1). */
function figSection(r: CMResult): Figure {
  const ops: FigOp[] = []
  const bw = r.b!, h = r.h!, hf = r.hf!, bf = r.bfSpan![0]
  const kind = r.kind!
  const sc = Math.min(120 / h, 250 / bf)
  const W = bf * sc, H = h * sc, x0 = 150, y0 = 14
  const wW = bw * sc, hF = hf * sc
  const left = x0 // balok L: badan di kiri, sayap menjulur ke kanan
  const wx = kind === 'T' ? x0 + (W - wW) / 2 : x0
  if (kind === 'persegi') {
    ops.push({ t: 'poly', pts: [[x0, y0], [x0 + wW, y0], [x0 + wW, y0 + H], [x0, y0 + H]], fill: true, c: 'm', op: 0.14 })
    ops.push({ t: 'poly', pts: [[x0, y0], [x0 + wW, y0], [x0 + wW, y0 + H], [x0, y0 + H], [x0, y0]], lw: 1.4, c: 'ink' })
    dimH(ops, x0, x0 + wW, y0 + H + 14, `b_{w} = ${fx(bw, 0)}`)
    dimV(ops, y0, y0 + H, x0 - 14, `h = ${fx(h, 0)}`)
  } else {
    const pts: [number, number][] =
      kind === 'T'
        ? [[left, y0], [left + W, y0], [left + W, y0 + hF], [wx + wW, y0 + hF], [wx + wW, y0 + H], [wx, y0 + H], [wx, y0 + hF], [left, y0 + hF], [left, y0]]
        : [[left, y0], [left + W, y0], [left + W, y0 + hF], [left + wW, y0 + hF], [left + wW, y0 + H], [left, y0 + H], [left, y0]]
    ops.push({ t: 'poly', pts, fill: true, c: 'm', op: 0.14 })
    ops.push({ t: 'poly', pts, lw: 1.4, c: 'ink' })
    dimH(ops, left, left + W, y0 + H + 14, `b_{f} = ${fx(bf, 0)}`)
    dimV(ops, y0, y0 + H, left - 14, `h = ${fx(h, 0)}`)
    dimV(ops, y0, y0 + hF, left + W + 14, `h_{f} = ${fx(hf, 0)}`)
    ops.push({ t: 'text', x: kind === 'T' ? wx + wW / 2 : left + wW / 2, y: y0 + H - 6, s: `b_{w} = ${fx(bw, 0)}`, size: 6.5, align: 'c', c: 'muted' })
  }
  return {
    h: figRows(y0 + H + 40),
    ops,
    alt: `Penampang balok ${kind}`,
    caption: `Gbr. 2 — Penampang ${kind === 'persegi' ? 'persegi' : `balok ${kind}`} (momen positif; momen negatif memakai b_{w}, sayap tarik).`,
  }
}

function designRows(items: CMItem[], balok: boolean): string[][] {
  return items.map((it) => [
    it.label,
    it.kind === 'pos' ? 'bawah' : 'atas',
    fx(it.Mu, 2),
    ...(balok ? [it.kind === 'pos' ? fx(it.bEff, 0) : '—'] : []),
    fx(it.As, 0),
    fx(it.AsReq, 0),
    it.txt,
    fx(it.AsProv, 0),
    it.infeasible ? 'tak layak' : it.govMin ? 'minimum' : it.tShaped ? 'balok T (a > h_{f})' : it.tc ? 'εt ≥ 0,005' : 'transisi',
  ])
}

export function cmReport(i: CMUI, r: CMResult): Report {
  const pelat = r.elem === 'pelat'
  const unitQ = pelat ? 'kN/m (lajur 1 m)' : 'kN/m'
  const des = r.des
  const rc = r.coef!
  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Elemen', pelat ? 'pelat satu arah (lajur 1 m)' : `balok ${r.kind === 'persegi' ? 'persegi' : r.kind} ${fx(r.b, 0)} × ${fx(r.h, 0)} mm`),
            ...(pelat ? [kv('Tebal pelat h', `${fx(r.h, 0)} mm`)] : []),
            kv('Jumlah bentang', String(r.n)),
            kv('Bentang as–as ujung / dalam, lebar tumpuan', `${fx(r.L, 2)} / ${fx(r.Li, 2)} m, ${fx(r.bsup, 0)} mm`),
            ...(r.n === 1
              ? [kv('Tumpuan', TUMP1[i.tumpuan1])]
              : r.metode === 'koef'
                ? [kv('Ujung eksterior', UJUNG[i.ujung]), kv('M^{−} tumpuan', i.m12 === 'm12' ? 'opsi 1/12 semua tumpuan' : 'Tabel 6.5.2')]
                : [kv('Ujung eksterior (solver)', i.ujungS === 'jepit' ? 'jepit' : 'sendi')]),
          ],
        },
        { k: 'figure', fig: figBeam(r) },
      ],
    },
  ]

  const loadSteps: CalcStep[] = [
    { desc: pelat ? 'Berat sendiri, γ_{c} = 24 kN/m^{3}' : 'Berat sendiri balok, γ_{c} = 24 kN/m^{3}', lhs: 'q_{sw}', expr: pelat ? '24 h' : '24 b_{w} h', value: fx(r.qself, 3), unit: unitQ },
  ]
  if (!pelat && (r.qslab ?? 0) > 0)
    loadSteps.push({ desc: `Berat pelat sayap pada lebar tributari ${fx(Number(i.bt), 2)} m`, lhs: 'q_{slab}', expr: '24 h_{f} (b_{t} − b_{w})', value: fx(r.qslab, 3), unit: 'kN/m' })
  loadSteps.push(
    { lhs: 'w_{D}', expr: pelat ? 'q_{sw} + q_{D,tambahan}' : 'q_{sw} + q_{slab} + q_{D,pelat} b_{t} + q_{D,garis}', value: fx(r.wD, 3), unit: unitQ },
    { lhs: 'w_{L}', expr: pelat ? undefined : 'q_{L,pelat} b_{t} + q_{L,garis}', value: fx(r.wL, 3), unit: unitQ },
    { lhs: 'w_{u}', expr: 'maks(1.4w_{D}; 1.2w_{D} + 1.6w_{L})', subst: `maks(${fx(r.wu14, 2)}; ${fx(r.wu12, 2)})`, value: fx(r.wu, 2), unit: unitQ },
  )
  sections.push({ title: 'Beban terfaktor', blocks: [{ k: 'calc', steps: loadSteps }] })

  if (!pelat && r.kind !== 'persegi') {
    sections.push({
      title: `Penampang balok ${r.kind} — lebar efektif sayap (Tabel 6.3.2.1)`,
      blocks: [
        {
          k: 'p',
          text:
            r.kind === 'T'
              ? 'Tiap sisi badan: min(8h_{f}; s_{w}/2; l_{n}/8), s_{w}/2 ≈ (b_{t} − b_{w})/2. Balok L: satu sisi min(6h_{f}; s_{w}/2; l_{n}/12). Momen positif memakai b_{f} (sayap tekan); momen negatif memakai b_{w} (sayap tarik).'
              : 'Balok L, satu sisi: min(6h_{f}; s_{w}/2; l_{n}/12), s_{w}/2 ≈ b_{t} − b_{w}/2. Momen positif memakai b_{f} (sayap tekan); momen negatif memakai b_{w} (sayap tarik).',
        },
        {
          k: 'table',
          head: ['Bentang', 'l_{n} (m)', 'b_{f} (mm)', 'I_{g} (10^{9} mm^{4})'],
          align: ['l', 'r', 'r', 'r'],
          rows: r.spanLen!.map((_, s) => [String(s + 1), fx(r.lnSpan![s], 3), fx(r.bfSpan![s], 0), fx(r.Ig![s] / 1e9, 3)]),
        },
        { k: 'figure', fig: figSection(r) },
      ],
    })
  }

  if (r.n >= 2) {
    const cond: Row[] = [check('w_{L} ≤ 3w_{D} (6.5.1c): w_{L} / 3w_{D}', r.wL! / (3 * r.wD!))]
    if (rc.rasio != null) cond.push(check('Beda bentang bersebelahan ≤ 20% (6.5.1e): l_{n,maks}/l_{n,min} / 1,2', rc.rasio / 1.2))
    sections.push({
      title: 'Syarat metode koefisien & metode analisis',
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
        { k: 'p', text: `Metode dipakai: ${r.metode === 'koef' ? 'koefisien (Ps. 6.5)' : 'analisis elastis sebenarnya'}. ${r.alasan}` },
      ],
    })
  }

  if (r.metode === 'solver') {
    const retak = des?.valid ? i.retak : 'ig'
    sections.push({
      title: 'Analisis elastis (solver) — momen & geser terfaktor',
      strong: true,
      blocks: [
        {
          k: 'p',
          text: `Balok menerus di atas tumpuan sendi dengan ujung eksterior ${r.n === 1 ? TUMP1[i.tumpuan1] : i.ujungS === 'jepit' ? 'jepit' : 'sendi'}; tiap bentang dibagi 10 elemen (metode kekakuan matriks rangka bidang, EI per elemen). Kekakuan: ${RETAK[retak]}. Beban: 1,4D semua bentang serta 1,2D + 1,6L dengan ${r.nPola! - 1} pola beban hidup (semua bentang, selang-seling, dan bentang bersebelahan tiap tumpuan) — nilai di bawah adalah amplopnya. Momen tumpuan direduksi ke muka tumpuan.`,
        },
        {
          k: 'table',
          head: ['Lokasi', 'M_{u} (kN·m)', 'V_{u} (kN)'],
          align: ['l', 'r', 'r'],
          rows: [
            ...r.supM!.map((m, k) => [`M^{−} tumpuan ${k + 1}`, fx(m, 2), fx(r.supV![k], 2)]),
            ...r.spanM!.map((m, k) => [`M^{+} bentang ${k + 1}`, fx(m, 2), '—']),
          ],
        },
      ],
    })
  } else if (r.n === 1) {
    const ln = r.lnE!
    const c = i.tumpuan1
    sections.push({
      title: 'Momen & geser (satu bentang, statika)',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'l_{n}', expr: 'L − b_{tumpuan}', subst: `${fx(r.L, 2)} − ${fx(r.bsup! / 1000, 3)}`, value: fx(ln, 3), unit: 'm' },
            { lhs: 'M_{u}^{+}', expr: c === 'jj' ? 'w_{u}l_{n}^{2}/24' : c === 'js' ? '9w_{u}l_{n}^{2}/128' : 'w_{u}l_{n}^{2}/8', subst: `${fx(r.wu, 2)} × ${fx(ln, 3)}^{2}`, value: fx(rc.Mpos1, 2), unit: 'kN·m' },
            ...(rc.MnegJ ? [{ lhs: 'M_{u}^{−}', expr: c === 'jj' ? 'w_{u}l_{n}^{2}/12' : 'w_{u}l_{n}^{2}/8', value: fx(rc.MnegJ, 2), unit: 'kN·m' }] : []),
            { lhs: 'V_{u}', expr: c === 'js' ? '5w_{u}l_{n}/8 (sisi jepit)' : 'w_{u}l_{n}/2', value: fx(rc.VJ, 2), unit: 'kN' },
          ],
        },
      ],
    })
  } else {
    const rowsM: string[][] = [
      ['M^{+} bentang ujung', `1/${rc.cPosEnd}`, fx(rc.lnE, 3), fx(rc.MposEnd, 2)],
      ...(rc.MposInt != null ? [['M^{+} bentang dalam', '1/16', fx(rc.lnI, 3), fx(rc.MposInt, 2)]] : []),
      ['M^{−} tumpuan luar', rc.cNegExt ? `1/${rc.cNegExt}` : '0', fx(rc.lnE, 3), fx(rc.MnegExt, 2)],
      ['M^{−} muka dalam tumpuan dalam pertama', `1/${rc.cNegFI}`, fx(rc.lnAvgFI, 3), fx(rc.MnegFI, 2)],
      ...(rc.MnegInt != null ? [['M^{−} tumpuan dalam lain', `1/${rc.cNegInt}`, fx(rc.lnI, 3), fx(rc.MnegInt, 2)]] : []),
    ]
    const rowsV: string[][] = [
      ['V_{u} tumpuan luar', '1/2', fx(rc.lnE, 3), fx(rc.Vext, 2)],
      ['V_{u} muka tumpuan dalam pertama', '1.15/2', fx(rc.lnE, 3), fx(rc.VFI, 2)],
      ...(rc.Vint != null ? [['V_{u} tumpuan dalam lain', '1/2', fx(rc.lnI, 3), fx(rc.Vint, 2)]] : []),
    ]
    sections.push({
      title: 'Momen & geser terfaktor (Tabel 6.5.2 & 6.5.4)',
      strong: true,
      blocks: [
        { k: 'p', text: 'M = C_{m} w_{u} l_{n}^{2}; V = C_{v} w_{u} l_{n}. M^{−} di muka tumpuan dalam memakai rata-rata l_{n} bentang bersebelahan.' },
        { k: 'table', head: ['Lokasi', 'C_{m}', 'l_{n} (m)', 'M_{u} (kN·m)'], align: ['l', 'r', 'r', 'r'], rows: rowsM },
        { k: 'table', head: ['Lokasi', 'C_{v}', 'l_{n} (m)', 'V_{u} (kN)'], align: ['l', 'r', 'r', 'r'], rows: rowsV },
      ],
    })
  }

  if (des && des.valid && des.items) {
    const ex = [...des.items].sort((a, b) => b.Mu - a.Mu)[0]
    const Rn = ex ? (ex.Mu * 1e6) / (0.9 * ex.bEff * des.d! * des.d!) : 0
    const steps: CalcStep[] = [
      { desc: 'Satu lapis tulangan', lhs: 'd', expr: pelat ? 'h − selimut − d_{b}/2' : 'h − selimut − Ø_{s} − d_{b}/2', value: fx(des.d, 1), unit: 'mm' },
      pelat
        ? { desc: 'Susut-suhu (24.4.3.2) pada penampang bruto', lhs: 'A_{s,min}', value: fx(des.AsMin, 0), unit: 'mm^{2}/m' }
        : { lhs: 'A_{s,min}', expr: "maks(\\frac{0.25√(f'_{c})}{f_{y}}; \\frac{1.4}{f_{y}}) b_{w} d", value: fx(des.AsMin, 0), unit: 'mm^{2}', ref: '9.6.1.2' },
      ...(ex
        ? [
            { desc: `Contoh: ${ex.label}, M_{u} = ${fx(ex.Mu, 2)} kN·m, b = ${fx(ex.bEff, 0)} mm`, lhs: 'R_{n}', expr: '\\frac{M_{u}}{φ b d^{2}}', value: fx(Rn, 3), unit: 'MPa' },
            { lhs: 'A_{s}', expr: ex.tShaped ? 'A_{sf} + A_{sw} (blok tekan menembus sayap)' : "\\frac{0.85f'_{c}}{f_{y}}(1 − √(1 − \\frac{2R_{n}}{0.85f'_{c}})) b d", value: fx(ex.As, 0), unit: pelat ? 'mm^{2}/m' : 'mm^{2}' },
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
          head: ['Lokasi', 'Sisi', 'M_{u} (kN·m)', ...(pelat ? [] : ['b (mm)']), 'A_{s} perlu', 'A_{s} desain', 'Tulangan', 'A_{s} pasang', 'Catatan'],
          align: ['l', 'l', 'r', ...(pelat ? [] : ['r' as const]), 'r', 'r', 'l', 'r', 'l'],
          caption: `Luas dalam ${pelat ? 'mm^{2}/m' : 'mm^{2}'}.`,
          rows: designRows(des.items, !pelat),
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
              ...(sh.sPakai != null ? [{ desc: `A_{v} = ${fx(sh.Av, 1)} mm^{2} (2 kaki)`, lhs: 's_{pakai}', expr: 'min(A_{v}/(A_{v}/s); s_{maks}), kelipatan 25 mm', value: fx(sh.sPakai, 0), unit: 'mm' }] : []),
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
          ...(sh.overMax ? [{ k: 'rows' as const, rows: [check("V_{s,perlu} / V_{s,maks} (0,66√f'c bw d)", sh.VsReq / sh.VsMax)] }] : []),
        ],
      })
  } else if (des?.err) sections.push({ title: 'Desain tulangan lentur', blocks: [{ k: 'p', text: des.err }] })

  if (des?.valid) {
    const figs = rebarFigures(r, !pelat && r.kind !== 'persegi' ? 3 : 2)
    if (figs.length)
      sections.push({
        title: 'Gambar penulangan',
        blocks: [
          ...(r.stir
            ? [
                {
                  k: 'table' as const,
                  head: ['Bentang', 'Zona sengkang (jarak dari sumbu tumpuan kiri)'],
                  align: ['l' as const, 'l' as const],
                  caption: `Sengkang Ø${r.stir.ds} 2 kaki; spasi kelipatan 25 mm.`,
                  rows: r.stir.spans.map((zs, i) => [String(i + 1), zs.map((z) => `${fx(z.x0, 2)}–${fx(z.x1, 2)} m: Ø${r.stir!.ds}-${z.s}`).join(' · ')]),
                },
              ]
            : []),
          ...figs.map((fig) => ({ k: 'figure' as const, fig })),
        ],
      })
  }

  const df = r.defl
  if (df?.valid && df.spans) {
    sections.push({
      title: 'Lendutan layan (24.2)',
      strong: true,
      blocks: [
        {
          k: 'p',
          text: `Lendutan dari analisis elastis beban layan (D dan D+L, semua bentang berbeban) dengan kekakuan ${RETAK[i.retak]}. Pada I_{e} Branson (24.2.3.5): I_{e} = (M_{cr}/M_{a})^{3} I_{g} + [1 − (M_{cr}/M_{a})^{3}] I_{cr} ≤ I_{g}, f_{r} = 0,62√(f'_{c}); momen positif memakai sayap tekan (balok T/L), momen negatif memakai b_{w}. δ_{L} = δ_{D+L} − δ_{D}.`,
        },
        {
          k: 'calc',
          steps: [
            { lhs: 'E_{c}', expr: "4700√(f'_{c})", value: fx(df.Ec, 0), unit: 'MPa' },
            { lhs: 'λ_{Δ}', expr: "\\frac{ξ}{1 + 50ρ'}", subst: `${fx(df.xi, 1)} / (1 + 50 × 0)`, value: fx(df.lambda, 2) },
          ],
        },
        {
          k: 'table',
          head: ['Bentang', 'L (m)', 'I_{e} min–maks (10^{9})', 'δ_{D} (mm)', 'δ_{L} (mm)', 'λδ_{tetap} (mm)', 'δ_{total} (mm)'],
          align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'],
          caption: 'I_{e} dalam mm^{4} pada beban D+L. δ_{tetap} = δ_{D} + (fraksi beban hidup tetap) δ_{L}.',
          rows: df.spans.map((s) => [String(s.span), fx(s.L, 2), `${fx(s.IeMin / 1e9, 3)}–${fx(s.IeMax / 1e9, 3)}`, fx(s.dD, 2), fx(s.dL, 2), fx(s.dLT, 2), fx(s.dTot, 2)]),
        },
        {
          k: 'rows',
          rows: df.spans.flatMap((s) => [
            check(`Bentang ${s.span}: δ_{L} / (L/360)`, s.dL / s.limL),
            check(`Bentang ${s.span}: (λδ_{tetap} + δ_{L}) / (L/${df.limDiv})`, s.dAfter / s.limAfter),
          ]),
        },
        { k: 'p', text: `Fraksi beban hidup tetap ${fx((df.sustL ?? 0) * 100, 0)}%. Batas 24.2.2: δ_{L} ≤ L/360; bagian lendutan sesudah pemasangan elemen non-struktural ≤ L/${df.limDiv}. L = bentang as–as.` },
      ],
    })
  } else if (df?.err) sections.push({ title: 'Lendutan layan (24.2)', blocks: [{ k: 'p', text: df.err }] })

  const gs = df?.valid ? df.spans![df.gov!] : null
  return {
    title: `${pelat ? 'Pelat Satu Arah' : 'Balok'} Menerus (SNI 2847:2019)`,
    summary: [
      kv('Metode', r.metode === 'koef' ? (r.n === 1 ? 'statika eksak' : 'koefisien Ps. 6.5') : 'analisis elastis (solver)'),
      kv('w_{u}', `${fx(r.wu, 2)} ${unitQ}`),
      kv('M_{u}^{+} maks / M_{u}^{−} maks', `${fx(r.MposMax, 2)} / ${fx(r.MnegMax, 2)} kN·m`),
      kv('V_{u} maks', `${fx(r.VuMax, 2)} kN`),
      ...(des?.valid && des.items
        ? [...des.items].sort((a, b) => b.Mu - a.Mu).slice(0, 3).map((it) => kv(`Tulangan ${it.label}`, it.txt))
        : []),
      ...(gs ? [kv(`Lendutan bentang ${gs.span}: δ_{L} / sesudah non-struktural`, `${fx(gs.dL, 1)} / ${fx(gs.dAfter, 1)} mm — ${df!.ok ? 'OK' : 'TIDAK OK'}`)] : []),
    ],
    sections,
    warnings: [...r.warn, ...(des?.anyInfeasible ? ['Ada lokasi dengan M_{u} melebihi kapasitas penampang tulangan tunggal — perbesar h.'] : [])],
    scope: [
      'Tulangan tunggal satu lapis, sengkang 2 kaki. Metode koefisien = amplop (syarat 6.5.1 wajib); solver = analisis elastis balok menerus dengan pola beban hidup, momen di sumbu tumpuan direduksi ke muka. Lendutan: ρ′ = 0, beban D+L pada semua bentang. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildCMReport(i: CMUI, elem: CBElement): Report | null {
  const r = computeCM(i, elem)
  return r ? cmReport(i, r) : null
}

/** Modul laporan satu tool (default export `src/tools/<id>/report.ts`). */
export function reportModule(elem: CBElement) {
  return {
    defaults: defaultsFor(elem),
    build: (i: CMUI): Report => buildCMReport(i, elem) ?? { title: elem === 'pelat' ? 'Pelat Satu Arah Menerus' : 'Balok Menerus', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
  }
}
