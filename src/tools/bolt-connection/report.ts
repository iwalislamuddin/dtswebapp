import { BOLT_GRADES, type BoltConnectionResult } from '../../calc/bolt-connection'
import { arrow, dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { BOLT_DEFAULTS, computeBolt, type BoltInput } from './model'

// Laporan Sambungan Baut (SNI 1729:2020 Ps. J3, DFBK): data, syarat geometri, beban per baut, kuat geser baut,
// tumpu/sobek lubang dan kapasitas grup efektif, tarik, interaksi tarik–geser — dengan rumus dan substitusi.

export { BOLT_DEFAULTS }

const PHI = '0.75'

/** Label mutu panjang untuk laporan. */
const gradeName = (r: BoltConnectionResult) => (r.grade === 'custom' ? 'Kustom' : BOLT_GRADES[r.grade].label)

/** Geometri gambar denah (mm) — sama dengan preview UI. */
export function planGeometry(r: BoltConnectionResult) {
  const s = r.s > 0 ? r.s : 3 * r.d
  const sg = r.sg > 0 ? r.sg : 3 * r.d
  const le = r.le > 0 ? r.le : 1.5 * r.d
  /** Jarak tepi tegak lurus beban (tidak diinput; untuk gambar saja). */
  const eg = Math.max(1.5 * r.d, 30)
  /** Pelat dari tepi kiri (beban ke kanan) sampai garis putus di kanan. */
  const W = le + (r.nr - 1) * s + Math.max(3 * r.d, 40)
  const H = (r.nc - 1) * sg + 2 * eg
  return { s, sg, le, eg, W, H }
}

/* ---------------- gambar ---------------- */

/** Gbr. 1 — denah pola baut pada pelat tumpu, beban Vu, dimensi (berwarna). */
function figPlan(r: BoltConnectionResult): Figure {
  const ops: FigOp[] = []
  const g = planGeometry(r)
  const sc = Math.min(300 / g.W, 130 / g.H)
  const x0 = 70, y0 = 22, W = g.W * sc, H = g.H * sc
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, fill: true, c: 'support', op: 0.1 })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0 + W, y2: y0, lw: 1, c: 'support' })
  ops.push({ t: 'line', x1: x0, y1: y0 + H, x2: x0 + W, y2: y0 + H, lw: 1, c: 'support' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y0 + H, lw: 1.4, c: 'support' })
  ops.push({ t: 'line', x1: x0 + W, y1: y0, x2: x0 + W, y2: y0 + H, lw: 0.6, c: 'muted', dash: [4, 3] })
  const rb = Math.max(2.4, (r.dh * sc) / 2)
  for (let i = 0; i < r.nr; i++)
    for (let j = 0; j < r.nc; j++) {
      const bx = x0 + (g.le + i * g.s) * sc, by = y0 + (g.eg + j * g.sg) * sc
      ops.push({ t: 'circle', cx: bx, cy: by, r: rb, fill: true, c: 'accent', op: 0.35 })
      ops.push({ t: 'circle', cx: bx, cy: by, r: rb, lw: 0.9, c: 'ink' })
      ops.push({ t: 'line', x1: bx - rb - 2.5, y1: by, x2: bx + rb + 2.5, y2: by, lw: 0.3, c: 'muted' })
      ops.push({ t: 'line', x1: bx, y1: by - rb - 2.5, x2: bx, y2: by + rb + 2.5, lw: 0.3, c: 'muted' })
    }
  const yd = y0 + H + 14
  dimH(ops, x0, x0 + g.le * sc, yd, `l_{e} = ${fx(r.le, 0)}`)
  if (r.nr > 1) dimH(ops, x0 + g.le * sc, x0 + (g.le + g.s) * sc, yd, `s = ${fx(r.s, 0)}`)
  if (r.nc > 1) {
    const xg = x0 - 14
    dimV(ops, y0 + g.eg * sc, y0 + (g.eg + g.sg) * sc, xg, '')
    ops.push({ t: 'text', x: xg - 4, y: y0 + (g.eg + g.sg / 2) * sc + 2.5, s: `g = ${fx(r.sg, 0)}`, size: 7, align: 'r' })
  }
  // beban: pelat ditarik ke kanan (searah baris)
  const ya = y0 + H / 2
  arrow(ops, x0 + W + 8, ya, x0 + W + 56, ya, { c: 'load', lw: 1.8, head: 6 })
  ops.push({ t: 'text', x: x0 + W + 10, y: ya - 7, s: `V_{u} = ${fx(r.Vu, 1)} kN`, size: 7.5, c: 'load', bold: true })
  if (r.Tu > 0) ops.push({ t: 'text', x: x0 + W + 10, y: ya + 14, s: `T_{u} = ${fx(r.Tu, 1)} kN (⊥ bidang)`, size: 7, c: 'load' })
  ops.push({ t: 'text', x: x0 + W - 4, y: y0 - 6, s: 'pelat tumpu t = ' + fx(r.t, 0) + ' mm', size: 6.5, c: 'muted', align: 'r' })
  ops.push({ t: 'text', x: x0, y: y0 - 6, s: 'tepi', size: 6.5, c: 'muted' })
  return {
    h: figRows(yd + 10),
    ops,
    alt: 'Denah pola baut pada pelat tumpu',
    caption: `Gbr. 1 — Pola baut ${r.nr} baris × ${r.nc} kolom M${fx(r.d, 0)} (lubang ${fx(r.dh, 0)} mm); baris searah beban, ukuran dalam mm.`,
  }
}

/** Gbr. 2 — kapasitas per baut (geser, tumpu tepi/dalam, tarik) terhadap beban per baut. */
function figPerBolt(r: BoltConnectionResult): Figure {
  const ops: FigOp[] = []
  const rows: { label: string; cap: number; dem: number; c: 'v' | 'm' | 'y' }[] = [
    { label: `Geser baut φr_{nv} (${r.m} bidang)`, cap: r.phiRnv, dem: r.rv, c: 'v' },
  ]
  if (r.bearingOk) {
    rows.push({ label: 'Tumpu baut tepi φr_{n,tepi}', cap: 0.75 * r.rnBrgEdge, dem: r.rv, c: 'm' })
    if (r.nr > 1) rows.push({ label: 'Tumpu baut dalam φr_{n,dalam}', cap: 0.75 * r.rnBrgInner, dem: r.rv, c: 'm' })
  }
  if (r.Tu > 0) {
    rows.push({ label: 'Tarik baut φr_{nt}', cap: r.phiRnt, dem: r.rt, c: 'y' })
    if (r.phiRntMod != null) rows.push({ label: "Tarik termodifikasi φr'_{nt}", cap: r.phiRntMod, dem: r.rt, c: 'y' })
  }
  const bx0 = 190, bw = 260, rh = 20
  const maxV = Math.max(1e-9, ...rows.flatMap((b) => [b.cap, b.dem])) * 1.08
  rows.forEach((b, i) => {
    const y = 12 + i * rh
    const len = Math.max(1.5, (b.cap / maxV) * bw)
    ops.push({ t: 'text', x: bx0 - 8, y: y + 9, s: b.label, size: 7, align: 'r', c: 'ink' })
    ops.push({ t: 'rect', x: bx0, y, w: len, h: 12, fill: true, c: b.c, op: 0.35 })
    ops.push({ t: 'rect', x: bx0, y, w: len, h: 12, lw: 0.6, c: b.c })
    const xd = bx0 + (b.dem / maxV) * bw
    // angka di kanan batang — atau di kanan garis beban bila beban melampaui kapasitas
    ops.push({ t: 'text', x: Math.max(bx0 + len, b.dem > b.cap ? xd : 0) + 4, y: y + 9, s: `${fx(b.cap, 1)} kN`, size: 7, c: 'ink' })
    if (b.dem > 0) ops.push({ t: 'line', x1: xd, y1: y - 3, x2: xd, y2: y + 15, lw: 1.4, c: b.dem > b.cap ? 'bad' : 'load' })
  })
  const yb = 12 + rows.length * rh + 6
  ops.push({ t: 'line', x1: bx0, y1: 6, x2: bx0, y2: yb - 4, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: bx0, y1: yb + 4, x2: bx0 + 14, y2: yb + 4, lw: 1.4, c: 'load' })
  ops.push({ t: 'text', x: bx0 + 18, y: yb + 6.5, s: `beban per baut: r_{v} = ${fx(r.rv, 1)} kN, r_{t} = ${fx(r.rt, 1)} kN`, size: 6.5, c: 'muted' })
  return {
    h: figRows(yb + 12),
    ops,
    alt: 'Kapasitas per baut dibanding beban per baut',
    caption: 'Gbr. 2 — Kapasitas rencana per baut (batang) dan beban per baut (garis).',
  }
}

/* ---------------- laporan ---------------- */

/** Baris tabel syarat geometri: [syarat, nilai, batas, status]. */
function geometryRows(r: BoltConnectionResult): string[][] {
  const rows: string[][] = []
  const st = (ok: boolean, okTxt = 'OK', ng = 'Tidak memenuhi') => (ok ? okTxt : ng)
  if (r.nr > 1) {
    rows.push(['Spasi s ≥ 2,67d (J3.3)', fx(r.s, 0), fx(r.sMin, 0), st(r.s >= r.sMin)])
    rows.push(['Spasi s ≥ 3d (dianjurkan)', fx(r.s, 0), fx(r.sPref, 0), st(r.s >= r.sPref, 'OK', 'Kurang dianjurkan')])
  }
  if (r.nc > 1 && r.sg > 0) rows.push(['Gage g ≥ 2,67d (J3.3)', fx(r.sg, 0), fx(r.sMin, 0), st(r.sg >= r.sMin)])
  if (r.le > 0) rows.push(['Jarak tepi l_{e} ≥ l_{e,min} (Tabel J3.4M)', fx(r.le, 0), fx(r.leMin, 0), st(r.le >= r.leMin)])
  if (r.le > 0 && r.t > 0) {
    const leMax = Math.min(12 * r.t, 150)
    rows.push(['Jarak tepi l_{e} ≤ min(12t; 150) (J3.5)', fx(r.le, 0), fx(leMax, 0), st(r.le <= leMax)])
  }
  return rows
}

export function boltReport(r: BoltConnectionResult): Report {
  const both = r.Vu > 0 && r.Tu > 0
  const geo = geometryRows(r)
  const d = fx(r.d, 0)
  const sections: Section[] = [
    {
      title: 'Data baut & pelat tumpu',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Mutu baut', gradeName(r)),
            kv('Posisi ulir', r.thread === 'N' ? 'N — ulir termasuk bidang geser' : 'X — ulir di luar bidang geser'),
            kv('Kuat tarik nominal F_{nt}', `${fx(r.Fnt, 0)} MPa`),
            kv('Kuat geser nominal F_{nv}', `${fx(r.Fnv, 0)} MPa`),
            kv('Diameter baut d', `${d} mm`),
            kv('Jumlah bidang geser m', String(r.m)),
            kv('Pola baut (baris searah beban × kolom)', `${r.nr} × ${r.nc} = ${r.n} baut`),
            kv('Tebal pelat tumpu t / kuat tarik F_{u}', `${fx(r.t, 0)} mm / ${fx(r.Fu, 0)} MPa`),
          ],
        },
        {
          k: 'p',
          text: r.grade === 'custom' ? 'F_{nt} dan F_{nv} diisi pengguna (mutu kustom).' : `F_{nt} dan F_{nv} dari Tabel J3.2 untuk ${gradeName(r)}, ulir ${r.thread}.`,
        },
        {
          k: 'calc',
          steps: [
            { desc: 'Luas penampang bruto baut', lhs: 'A_{b}', expr: '\\frac{π d^{2}}{4}', subst: `\\frac{π × ${d}^{2}}{4}`, value: fx(r.Ab, 1), unit: 'mm^{2}' },
            { desc: `Diameter lubang standar (Tabel J3.3M, d ${r.d < 24 ? '< 24 mm → d + 2' : '≥ 24 mm → d + 3'})`, lhs: 'd_{h}', expr: r.d < 24 ? 'd + 2' : 'd + 3', subst: `${d} + ${r.d < 24 ? 2 : 3}`, value: fx(r.dh, 0), unit: 'mm' },
          ],
        },
      ],
    },
    {
      title: 'Geometri pola baut',
      blocks: [
        { k: 'rows', rows: [kv('Spasi searah beban s / gage g', `${fx(r.s, 0)} / ${fx(r.sg, 0)} mm`), kv('Jarak tepi searah beban l_{e}', `${fx(r.le, 0)} mm`)] },
        { k: 'figure', fig: figPlan(r) },
        ...(geo.length
          ? [{ k: 'table' as const, head: ['Syarat', 'Nilai (mm)', 'Batas (mm)', 'Status'], align: ['l', 'r', 'r', 'l'] as ('l' | 'r')[], rows: geo }]
          : []),
      ],
    },
    {
      title: 'Beban per baut',
      blocks: [
        { k: 'p', text: 'Beban terfaktor bekerja di titik berat grup (konsentris) dan dibagi rata ke semua baut.' },
        {
          k: 'calc',
          steps: [
            { desc: 'Geser per baut', lhs: 'r_{v}', expr: '\\frac{V_{u}}{n}', subst: `\\frac{${fx(r.Vu, 1)}}{${r.n}}`, value: fx(r.rv, 2), unit: 'kN' },
            ...(r.Tu > 0 ? [{ desc: 'Tarik per baut', lhs: 'r_{t}', expr: '\\frac{T_{u}}{n}', subst: `\\frac{${fx(r.Tu, 1)}}{${r.n}}`, value: fx(r.rt, 2), unit: 'kN' }] : []),
          ],
        },
      ],
    },
    {
      title: 'Kuat geser baut (J3.6)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'r_{nv}', expr: 'F_{nv} · A_{b} · m', subst: `${fx(r.Fnv, 0)} × ${fx(r.Ab, 1)} × ${r.m} / 10^{3}`, value: fx(r.rnv, 2), unit: 'kN', ref: 'J3-1' },
            { lhs: 'φr_{nv}', expr: 'φ · r_{nv}', subst: `${PHI} × ${fx(r.rnv, 2)}`, value: fx(r.phiRnv, 2), unit: 'kN' },
          ],
        },
      ],
    },
    {
      title: 'Tumpu & sobek lubang, kapasitas geser grup (J3.10)',
      strong: true,
      blocks: r.bearingOk ? bearingBlocks(r) : [
        { k: 'p', text: 'Data pelat tumpu (t, F_{u}, l_{e}) tidak lengkap — cek tumpu/sobek dilewati; kapasitas geser grup = kuat geser baut saja.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'φR_{n}', expr: 'n · φr_{nv}', subst: `${r.n} × ${fx(r.phiRnv, 2)}`, value: fx(r.phiRge, 2), unit: 'kN' },
            ...(r.Vu > 0 ? [dcStep('D/C_{geser}', 'V_{u}', 'φR_{n}', r.Vu, r.phiRge, r.dcShear)] : []),
          ],
        },
        ...(r.Vu > 0 ? [{ k: 'rows' as const, rows: [check('D/C geser grup', r.dcShear)] }] : []),
      ],
    },
  ]

  if (r.Tu > 0)
    sections.push({
      title: 'Kuat tarik baut (J3.6)',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'r_{nt}', expr: 'F_{nt} · A_{b}', subst: `${fx(r.Fnt, 0)} × ${fx(r.Ab, 1)} / 10^{3}`, value: fx(r.rnt, 2), unit: 'kN', ref: 'J3-1' },
            { lhs: 'φr_{nt}', expr: 'φ · r_{nt}', subst: `${PHI} × ${fx(r.rnt, 2)}`, value: fx(r.phiRnt, 2), unit: 'kN' },
            dcStep('D/C_{tarik}', 'r_{t}', 'φr_{nt}', r.rt, r.phiRnt, r.dcTension),
          ],
        },
        { k: 'rows', rows: [check('D/C tarik', r.dcTension)] },
      ],
    })

  if (both && r.FntMod != null)
    sections.push({
      title: 'Kombinasi tarik dan geser (J3.7)',
      strong: r.comboNeeded,
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Tegangan geser perlu', lhs: 'f_{rv}', expr: '\\frac{r_{v}}{A_{b} · m}', subst: `\\frac{${fx(r.rv, 2)}×10^{3}}{${fx(r.Ab, 1)} × ${r.m}}`, value: fx(r.frv, 1), unit: 'MPa' },
            { desc: 'Tegangan tarik perlu', lhs: 'f_{rt}', expr: '\\frac{r_{t}}{A_{b}}', subst: `\\frac{${fx(r.rt, 2)}×10^{3}}{${fx(r.Ab, 1)}}`, value: fx(r.frt, 1), unit: 'MPa' },
            { lhs: '\\frac{f_{rv}}{φF_{nv}}', subst: `\\frac{${fx(r.frv, 1)}}{${PHI} × ${fx(r.Fnv, 0)}}`, value: `${fx(r.ratioV * 100, 0)}%` },
            { lhs: '\\frac{f_{rt}}{φF_{nt}}', subst: `\\frac{${fx(r.frt, 1)}}{${PHI} × ${fx(r.Fnt, 0)}}`, value: `${fx(r.ratioT * 100, 0)}%` },
          ],
        },
        {
          k: 'p',
          text: r.comboNeeded
            ? 'Kedua rasio > 30% — interaksi tarik–geser wajib ditinjau (J3.7).'
            : 'Salah satu rasio ≤ 30% — interaksi tidak wajib ditinjau (J3.7); nilai di bawah sebagai informasi dan tidak ikut menentukan.',
        },
        {
          k: 'calc',
          steps: [
            {
              desc: 'Tegangan tarik nominal termodifikasi',
              lhs: "F'_{nt}",
              expr: '1.3F_{nt} − \\frac{F_{nt}}{φF_{nv}} f_{rv} ≤ F_{nt}',
              subst: `1.3 × ${fx(r.Fnt, 0)} − \\frac{${fx(r.Fnt, 0)}}{${PHI} × ${fx(r.Fnv, 0)}} × ${fx(r.frv, 1)}`,
              value: fx(r.FntMod, 1),
              unit: 'MPa',
              ref: 'J3-3a',
            },
            { lhs: "φr'_{nt}", expr: "φ · F'_{nt} · A_{b}", subst: `${PHI} × ${fx(r.FntMod, 1)} × ${fx(r.Ab, 1)} / 10^{3}`, value: fx(r.phiRntMod, 2), unit: 'kN' },
            dcStep('D/C_{kombinasi}', 'r_{t}', "φr'_{nt}", r.rt, r.phiRntMod!, r.dcComboInfo),
          ],
        },
        { k: 'rows', rows: [check('D/C kombinasi', r.dcComboInfo, r.comboNeeded ? undefined : 'informasi, tidak wajib')] },
      ],
    })

  const summary: Row[] = [
    kv('Kapasitas geser grup efektif φR_{n}', `${fx(r.phiRge, 1)} kN`),
    ...(r.Vu > 0 ? [check('D/C geser grup', r.dcShear)] : []),
    ...(r.Tu > 0 ? [check('D/C tarik', r.dcTension)] : []),
    ...(r.comboNeeded ? [check('D/C kombinasi tarik–geser', r.dcCombo)] : []),
  ]

  return {
    title: 'Sambungan Baut (SNI 1729:2020 Ps. J3)',
    summary,
    sections,
    governing: { label: `D/C menentukan (${r.gov})`, ratio: r.govDC },
    warnings: r.warn,
    scope: [
      'DFBK, φ = 0,75. Sambungan tipe tumpu (bearing-type), lubang standar, deformasi lubang diperhitungkan, beban konsentris dibagi rata ke semua baut.',
      'Belum termasuk: geser eksentris (pusat rotasi sesaat), slip-critical, blok geser (J4.3), leleh/fraktur pelat sambung, prying action. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Langkah D/C = kebutuhan / kapasitas. */
function dcStep(lhs: string, dem: string, cap: string, demV: number, capV: number, dc: number): CalcStep {
  return { lhs, expr: `\\frac{${dem}}{${cap}}`, subst: `\\frac{${fx(demV, 2)}}{${fx(capV, 2)}}`, value: fx(dc, 3) }
}

/** Blok tumpu/sobek + kapasitas grup efektif (data pelat lengkap). */
function bearingBlocks(r: BoltConnectionResult): Section['blocks'] {
  const t = fx(r.t, 0), Fu = fx(r.Fu, 0), d = fx(r.d, 0)
  const inner = r.nr > 1
  const steps: CalcStep[] = [
    { desc: 'Batas atas tumpu per baut (ovalisasi lubang)', lhs: 'r_{n,maks}', expr: '2.4 · d · t · F_{u}', subst: `2.4 × ${d} × ${t} × ${Fu} / 10^{3}`, value: fx(r.rnBrgCap, 2), unit: 'kN', ref: 'J3-6a' },
    { desc: 'Jarak bersih baut tepi ke tepi pelat, searah beban', lhs: 'l_{c,tepi}', expr: 'l_{e} − \\frac{d_{h}}{2}', subst: `${fx(r.le, 0)} − \\frac{${fx(r.dh, 0)}}{2}`, value: fx(r.lcEdge, 1), unit: 'mm' },
    {
      lhs: 'r_{n,tepi}',
      expr: '1.2 · l_{c} · t · F_{u} ≤ r_{n,maks}',
      subst: `1.2 × ${fx(Math.max(0, r.lcEdge), 1)} × ${t} × ${Fu} / 10^{3}`,
      value: fx(r.rnBrgEdge, 2),
      unit: 'kN',
      ref: 'J3-6c',
    },
  ]
  if (inner)
    steps.push(
      { desc: 'Jarak bersih antar lubang, searah beban', lhs: 'l_{c,dalam}', expr: 's − d_{h}', subst: `${fx(r.s, 0)} − ${fx(r.dh, 0)}`, value: fx(r.lcInner, 1), unit: 'mm' },
      {
        lhs: 'r_{n,dalam}',
        expr: '1.2 · l_{c} · t · F_{u} ≤ r_{n,maks}',
        subst: `1.2 × ${fx(Math.max(0, r.lcInner), 1)} × ${t} × ${Fu} / 10^{3}`,
        value: fx(r.rnBrgInner, 2),
        unit: 'kN',
        ref: 'J3-6c',
      },
    )
  const edgeEff = Math.min(r.rnv, r.rnBrgEdge), innerEff = Math.min(r.rnv, r.rnBrgInner)
  const table: string[][] = [
    ['Tepi', String(r.nc), fx(r.rnv, 2), fx(r.rnBrgEdge, 2), fx(edgeEff, 2), fx(r.nc * edgeEff, 2)],
    ...(inner ? [['Dalam', String((r.nr - 1) * r.nc), fx(r.rnv, 2), fx(r.rnBrgInner, 2), fx(innerEff, 2), fx((r.nr - 1) * r.nc * innerEff, 2)]] : []),
    ['Σ', String(r.n), '', '', '', fx(r.Rge, 2)],
  ]
  return [
    { k: 'p', text: 'Kuat tumpu per baut dengan deformasi lubang diperhitungkan, lubang standar. Setiap kolom baut memiliki satu baut tepi (terdekat ke tepi pelat searah beban) dan (n_{r} − 1) baut dalam.' },
    { k: 'calc', steps },
    { k: 'h', text: 'Kapasitas geser grup efektif' },
    { k: 'p', text: 'Kuat nominal tiap baut = nilai terkecil antara kuat geser baut dan kuat tumpu lubangnya; kapasitas grup = jumlahnya (Penjelasan J3.6).' },
    {
      k: 'table',
      head: ['Baut', 'Jumlah', 'r_{nv} (kN)', 'r_{n,tumpu} (kN)', 'min (kN)', 'Subtotal (kN)'],
      align: ['l', 'r', 'r', 'r', 'r', 'r'],
      rows: table,
    },
    {
      k: 'calc',
      steps: [
        { lhs: 'φR_{n}', expr: 'φ · Σ min(r_{nv}; r_{n,tumpu})', subst: `${PHI} × ${fx(r.Rge, 2)}`, value: fx(r.phiRge, 2), unit: 'kN' },
        ...(r.Vu > 0 ? [dcStep('D/C_{geser}', 'V_{u}', 'φR_{n}', r.Vu, r.phiRge, r.dcShear)] : []),
      ],
    },
    { k: 'figure', fig: figPerBolt(r) },
    ...(r.Vu > 0 ? [{ k: 'rows' as const, rows: [check('D/C geser grup', r.dcShear)] }] : []),
  ]
}

/** Laporan dari input (null bila input tidak valid). */
export function buildBoltReport(i: BoltInput): Report | null {
  const r = computeBolt(i)
  return r ? boltReport(r) : null
}

export default {
  defaults: BOLT_DEFAULTS,
  build: (i: BoltInput) => buildBoltReport(i) ?? { title: 'Sambungan Baut', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
