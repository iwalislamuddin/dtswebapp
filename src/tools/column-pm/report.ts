import { sectionLabel, type ColumnPMResult } from '../../calc/column-pm'
import { figRows } from '../../report/figure'
import { check, fx, kv, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { COLUMN_DEFAULTS, computeColumn, meridian, uniaxialCurve, type ColumnInput } from './model'

// Laporan Diagram Interaksi P–M Kolom (SNI 2847:2019 Ps. 22.4, 21.2.2, 10.6): data penampang, titik acuan
// (Po, Pn,maks, Pnt), titik seimbang, momen murni, tabel diagram interaksi, cek beban uniaksial/biaksial.

export { COLUMN_DEFAULTS }

/** Gbr. 1 — penampang & tulangan (koordinat sentroid, y ke atas). */
function figSection(r: ColumnPMResult): Figure {
  const ops: FigOp[] = []
  const xs = r.poly!.map((p) => p.x), ys = r.poly!.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  const sc = Math.min(170 / w, 150 / h)
  const cx = 264, cy = 14 + (h * sc) / 2 + 4
  const T = (x: number, y: number): [number, number] => [cx + x * sc, cy - y * sc]
  ops.push({ t: 'poly', pts: r.poly!.map((p) => T(p.x, p.y)), fill: true, c: 'support', op: 0.14 })
  ops.push({ t: 'poly', pts: r.poly!.map((p) => T(p.x, p.y)), close: true, lw: 1, c: 'support' })
  for (const b of r.bars!) {
    const [x, y] = T(b.x, b.y)
    ops.push({ t: 'circle', cx: x, cy: y, r: Math.max(1.8, (r.db * sc) / 2), fill: true, c: 'ink' })
  }
  ops.push({ t: 'line', x1: cx - (w / 2) * sc - 16, y1: cy, x2: cx + (w / 2) * sc + 16, y2: cy, lw: 0.6, c: 'm', dash: [5, 2, 1, 2] })
  ops.push({ t: 'line', x1: cx, y1: cy - (h / 2) * sc - 10, x2: cx, y2: cy + (h / 2) * sc + 10, lw: 0.6, c: 'y', dash: [5, 2, 1, 2] })
  ops.push({ t: 'text', x: cx + (w / 2) * sc + 20, y: cy + 3, s: 'x', size: 7.5, c: 'm', bold: true })
  ops.push({ t: 'text', x: cx + 4, y: cy - (h / 2) * sc - 12, s: 'y', size: 7.5, c: 'y', bold: true })
  return {
    h: figRows(cy + (h / 2) * sc + 18),
    ops,
    alt: 'Penampang kolom dan tulangan',
    caption: `Gbr. 1 — Penampang ${sectionLabel(r)} mm, ${r.nBars} D${r.db}; sumbu melalui sentroid geometris. M_{ux} menekan sisi atas/bawah (lentur thd sumbu-x).`,
  }
}

/** Gbr. 2 — diagram interaksi uniaksial P–M (desain & nominal) + titik beban. */
function figPM(r: ColumnPMResult, axis: 'x' | 'y'): Figure {
  const ops: FigOp[] = []
  const des = uniaxialCurve(r, axis), nom = uniaxialCurve(r, axis, true)
  const Mmax = Math.max(1, ...nom.map((p) => Math.abs(p[0])), Math.abs(axis === 'x' ? r.Mux : r.Muy)) * 1.1
  const Pmax = Math.max(r.Po!, r.Pu) * 1.05, Pmin = Math.min(r.Pnt!, r.Pu) * 1.1
  const x0 = 80, x1 = 450, y0 = 12, y1 = 200
  const X = (m: number) => x0 + ((m + Mmax) / (2 * Mmax)) * (x1 - x0)
  const Y = (p: number) => y1 - ((p - Pmin) / (Pmax - Pmin)) * (y1 - y0)
  ops.push({ t: 'line', x1: x0, y1: Y(0), x2: x1, y2: Y(0), lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: X(0), y1: y0, x2: X(0), y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'poly', pts: nom.map(([m, p]) => [X(m), Y(p)]), close: true, lw: 0.8, c: 'muted', dash: [3, 2] })
  ops.push({ t: 'poly', pts: des.map(([m, p]) => [X(m), Y(p)]), fill: true, c: 'm', op: 0.12 })
  ops.push({ t: 'poly', pts: des.map(([m, p]) => [X(m), Y(p)]), close: true, lw: 1.3, c: 'm' })
  const Mu = axis === 'x' ? r.Mux : r.Muy
  ops.push({ t: 'circle', cx: X(Mu), cy: Y(r.Pu), r: 3.2, fill: true, c: r.dc != null && r.dc > 1 ? 'bad' : 'load' })
  ops.push({ t: 'text', x: X(Mu) + 6, y: Y(r.Pu) - 4, s: `(${fx(Mu, 0)}; ${fx(r.Pu, 0)})`, size: 7, bold: true })
  for (const p of [r.phiPnMax!, r.phiPnt!, 0]) ops.push({ t: 'text', x: x0 - 4, y: Y(p) + 2.5, s: fx(p, 0), size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: x1, y: Y(0) + 10, s: `M_{${axis}} (kN·m)`, size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: X(0) + 4, y: y0 + 6, s: 'P (kN)', size: 6.5, c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y0 + 6, s: `± ${fx(Mmax / 1.1, 0)} kN·m`, size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(y1 + 10),
    ops,
    alt: `Diagram interaksi P–M${axis}`,
    caption: `Gbr. ${axis === 'x' ? 2 : 3} — Diagram interaksi P–M_{${axis}}: desain φP_{n}–φM_{n} (garis tebal, plafon φP_{n,maks}) dan nominal P_{n}–M_{n} (putus-putus); titik = beban.`,
  }
}

/** Gbr. — kontur kapasitas Mx–My pada P = Pu (biaksial). */
function figContour(r: ColumnPMResult): Figure {
  const ops: FigOp[] = []
  const c = r.contour!
  const Mmax = Math.max(1, ...c.map((p) => Math.max(Math.abs(p.Mx), Math.abs(p.My))), Math.abs(r.Mux), Math.abs(r.Muy)) * 1.1
  const cx = 264, cy = 100, R = 85
  const T = (mx: number, my: number): [number, number] => [cx + (my / Mmax) * R, cy - (mx / Mmax) * R]
  ops.push({ t: 'line', x1: cx - R, y1: cy, x2: cx + R, y2: cy, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: cx, y1: cy - R, x2: cx, y2: cy + R, lw: 0.6, c: 'muted' })
  ops.push({ t: 'poly', pts: c.map((p) => T(p.Mx, p.My)), fill: true, c: 'm', op: 0.12 })
  ops.push({ t: 'poly', pts: c.map((p) => T(p.Mx, p.My)), close: true, lw: 1.3, c: 'm' })
  const [lx, ly] = T(r.Mux, r.Muy)
  ops.push({ t: 'line', x1: cx, y1: cy, x2: lx, y2: ly, lw: 0.8, c: 'load', dash: [3, 2] })
  ops.push({ t: 'circle', cx: lx, cy: ly, r: 3.2, fill: true, c: r.dc! > 1 ? 'bad' : 'load' })
  if (r.capM) {
    const [qx, qy] = T(r.capM.Mx, r.capM.My)
    ops.push({ t: 'circle', cx: qx, cy: qy, r: 2.6, lw: 1, c: 'ink' })
  }
  ops.push({ t: 'text', x: cx + R, y: cy + 10, s: 'φM_{ny} →', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: cx + 4, y: cy - R + 6, s: '↑ φM_{nx}', size: 6.5, c: 'muted' })
  ops.push({ t: 'text', x: cx - R, y: cy - R + 6, s: `skala ± ${fx(Mmax / 1.1, 0)} kN·m`, size: 6.5, c: 'muted' })
  return {
    h: figRows(cy + R + 8),
    ops,
    alt: 'Kontur kapasitas momen biaksial',
    caption: `Gbr. 4 — Irisan permukaan desain pada P = P_{u} = ${fx(r.Pu, 0)} kN: kontur φM_{nx}–φM_{ny}, titik beban (isi) dan kapasitas searah beban (cincin).`,
  }
}

export function columnReport(r: ColumnPMResult): Report {
  const fc = fx(r.fc, 0), fy = fx(r.fy, 0)
  const tieName = r.tie === 'spiral' ? 'spiral' : 'sengkang ikat'
  const rowX = meridian(r, 90)
  const sample = rowX.filter((_, k) => k > 0 && k < rowX.length - 1 && k % 4 === 1)
  const biax = Math.abs(r.Muy) > 0.001 && Math.abs(r.Mux) > 0.001
  const sections: Section[] = [
    {
      title: 'Data penampang & material',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Penampang', `${r.shape === 'rect' ? 'persegi ' : r.shape === 'circle' ? 'lingkaran ' : ''}${sectionLabel(r)} mm`),
            kv("f'_{c} / f_{y}", `${fc} / ${fy} MPa`),
            kv('Tulangan', `${r.nBars} D${r.db} (A_{b} = ${fx(r.Abar, 1)} mm^{2}), d' = ${fx(r.dp, 0)} mm`),
            kv('Pengikat', `${tieName} (φ tekan ${fx(r.phiC, 2)}, α = ${fx(r.alphaMax, 2)})`),
          ],
        },
        { k: 'figure', fig: figSection(r) },
        {
          k: 'calc',
          steps: [
            { lhs: 'A_{g}', value: fx(r.Ag, 0), unit: 'mm^{2}' },
            { lhs: 'A_{st}', expr: 'n A_{b}', subst: `${r.nBars} × ${fx(r.Abar, 1)}`, value: fx(r.Ast, 0), unit: 'mm^{2}' },
            { lhs: 'ρ_{g}', expr: '\\frac{A_{st}}{A_{g}}', value: `${fx(r.rho! * 100, 2)}%`, ref: '10.6.1.1' },
            { lhs: 'β_{1}', value: fx(r.beta1, 3), ref: '22.2.2.4.3' },
            { lhs: 'ε_{ty}', expr: 'f_{y}/E_{s}', subst: `${fy}/200000`, value: fx(r.ety, 5) },
          ],
        },
        { k: 'rows', rows: [check('ρ_{g} terhadap batas 1% (1% / ρ_{g})', 0.01 / r.rho!), check('ρ_{g} terhadap batas 8%', r.rho! / 0.08)] },
      ],
    },
    {
      title: 'Titik acuan aksial (22.4)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'P_{o}', expr: "0.85f'_{c}(A_{g} − A_{st}) + f_{y}A_{st}", subst: `0.85 × ${fc} × (${fx(r.Ag, 0)} − ${fx(r.Ast, 0)}) + ${fy} × ${fx(r.Ast, 0)}`, value: fx(r.Po, 0), unit: 'kN', ref: '22.4.2.2' },
            { lhs: 'φP_{n,maks}', expr: `φ · ${fx(r.alphaMax, 2)} P_{o}`, subst: `${fx(r.phiC, 2)} × ${fx(r.alphaMax, 2)} × ${fx(r.Po, 0)}`, value: fx(r.phiPnMax, 0), unit: 'kN', ref: '22.4.2.1' },
            { lhs: 'P_{nt}', expr: '−f_{y}A_{st}', value: fx(r.Pnt, 0), unit: 'kN' },
            { lhs: 'φP_{nt}', subst: `0.90 × ${fx(r.Pnt, 0)}`, value: fx(r.phiPnt, 0), unit: 'kN' },
          ],
        },
      ],
    },
    {
      title: 'Metode permukaan interaksi',
      blocks: [
        {
          k: 'p',
          text: `Kompatibilitas regangan: untuk tiap arah sumbu netral θ (48 arah) dan kedalaman c (34 nilai), ε = 0.003(c − u)/c, f_{s} = E_{s}ε dibatasi ±f_{y}, baja di blok tekan dikurangi 0.85f'_{c}; blok tekan a = β_{1}c dipotong dari poligon penampang. φ dari ε_{t} baja terjauh (21.2.2): ${fx(r.phiC, 2)} → 0.90; φP_{n} dibatasi φP_{n,maks}.`,
        },
      ],
    },
    {
      title: 'Titik seimbang & lentur murni',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Lentur thd sumbu-x: c_{b} = 0.003/(0.003 + ε_{ty}) · d_{t}', lhs: 'c_{b,x}', value: fx(r.cBalX, 1), unit: 'mm' },
            { lhs: 'P_{b,x} / M_{b,x}', value: `${fx(r.PbalX, 0)} kN / ${fx(r.MbalX, 1)} kN·m` },
            { desc: 'Lentur thd sumbu-y', lhs: 'c_{b,y}', value: fx(r.cBalY, 1), unit: 'mm' },
            { lhs: 'P_{b,y} / M_{b,y}', value: `${fx(r.PbalY, 0)} kN / ${fx(r.MbalY, 1)} kN·m` },
            { desc: 'Kapasitas lentur desain pada P = 0', lhs: 'φM_{n0,x} / φM_{n0,y}', value: `${fx(r.M0x, 1)} / ${fx(r.M0y, 1)}`, unit: 'kN·m' },
          ],
        },
      ],
    },
    {
      title: 'Diagram interaksi uniaksial',
      blocks: [
        {
          k: 'table',
          head: ['c (mm)', 'φ', 'P_{n} (kN)', 'M_{nx} (kN·m)', 'φP_{n} (kN)', 'φM_{nx} (kN·m)'],
          align: ['r', 'r', 'r', 'r', 'r', 'r'],
          caption: 'Titik terpilih pada meridian lentur thd sumbu-x (θ = 90°).',
          rows: sample.map((p) => [fx(p.c, 1), fx(p.phi, 3), fx(p.nP, 0), fx(p.nMx, 1), fx(p.P, 0), fx(p.Mx, 1)]),
        },
        { k: 'figure', fig: figPM(r, 'x') },
        ...(Math.abs(r.Muy) > 0.001 || r.shape !== 'rect' || r.b !== r.h ? [{ k: 'figure' as const, fig: figPM(r, 'y') }] : []),
      ],
    },
    {
      title: 'Cek beban',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'M_{u}', expr: '√(M_{ux}^{2} + M_{uy}^{2})', subst: `√(${fx(r.Mux, 1)}^{2} + ${fx(r.Muy, 1)}^{2})`, value: fx(r.Mu, 1), unit: 'kN·m' },
            ...(r.capM ? [{ desc: `Irisan permukaan pada P_{u} = ${fx(r.Pu, 0)} kN, searah beban`, lhs: 'φM_{n}', value: fx(r.capM.m, 1), unit: 'kN·m' }] : []),
            ...(r.dc != null ? [{ lhs: 'D/C', expr: r.capM ? '\\frac{M_{u}}{φM_{n}}' : r.Pu > r.phiPnMax! ? '\\frac{P_{u}}{φP_{n,maks}}' : undefined, value: fx(r.dc, 3) }] : []),
          ],
        },
        ...(r.dc != null ? [{ k: 'rows' as const, rows: [check('D/C kolom', r.dc)] }] : []),
        ...(biax && r.contour && r.contour.length >= 8 ? [{ k: 'figure' as const, fig: figContour(r) }] : []),
      ],
    },
  ]

  return {
    title: 'Diagram Interaksi P–M Kolom (SNI 2847:2019)',
    summary: [
      kv('Penampang / tulangan', `${sectionLabel(r)} mm / ${r.nBars} D${r.db} (ρ_{g} = ${fx(r.rho! * 100, 2)}%)`),
      kv('φP_{n,maks} / φP_{nt}', `${fx(r.phiPnMax, 0)} / ${fx(r.phiPnt, 0)} kN`),
      kv('φM_{n0,x} / φM_{n0,y} (P = 0)', `${fx(r.M0x, 1)} / ${fx(r.M0y, 1)} kN·m`),
      ...(r.dc != null ? [check(`Beban P_{u} = ${fx(r.Pu, 0)} kN, M_{u} = ${fx(r.Mu, 1)} kN·m`, r.dc)] : []),
    ],
    sections,
    ...(r.dc != null ? { governing: { label: 'D/C kolom', ratio: r.dc } } : {}),
    warnings: r.warn,
    scope: [
      'Kolom pendek: M_{ux}, M_{uy} harus sudah termasuk pembesaran momen orde-2 (6.6.4). Penampang L/T dihitung terhadap sentroid geometris.',
      'Belum termasuk: detail gempa, kekangan inti, geser kolom. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildColumnReport(i: ColumnInput): Report | null {
  const r = computeColumn(i)
  return r ? columnReport(r) : null
}

export default {
  defaults: COLUMN_DEFAULTS,
  build: (i: ColumnInput) => buildColumnReport(i) ?? { title: 'Diagram P–M Kolom', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}

