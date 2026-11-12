import { ANCHOR_GRADES, type BaseCheck, type BasePlateResult } from '../../calc/base-plate'
import { typeInfo } from '../../calc/shared/steel-profiles'
import { arrow, dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { BASE_PLATE_DEFAULTS, computeBasePlateUI, type BasePlateUIInput } from './model'

// Laporan Base Plate (sendi & jepit): beban rencana, tumpu beton, distribusi gaya, tebal pelat, angkur (ACI 318-19
// Bab 17 / SNI 2847:2019 Ps. 17), geser dasar, las kolom–pelat, rekap D/C — dengan rumus dan substitusi.

export { BASE_PLATE_DEFAULTS }

export const FIXITY_LABEL = { pinned: 'Sendi (pinned)', fixed: 'Jepit (fixed)' } as const
export const REGIME_LABEL = {
  bearing: 'konsentrik — tumpu penuh',
  small: 'momen kecil (e ≤ e_{krit}) — tumpu saja',
  large: 'momen besar (e > e_{krit}) — tumpu + angkur tarik',
  uplift: 'gaya angkat — seluruhnya oleh angkur',
} as const
export const SUPPORT_LABEL = { pedestal: 'Pedestal beton', slab: 'Pelat / slab beton', manual: 'Jarak tepi manual' } as const

const dc = (v: number) => (Number.isFinite(v) ? fx(v, 3) : '∞')
const dist = (c: number) => (Number.isFinite(c) ? `${fx(c, 0)} mm` : 'jauh (∞)')

const dcStep = (lhs: string, dem: string, cap: string, d: number, c: number): CalcStep => ({
  lhs,
  expr: `\\frac{${dem}}{${cap}}`,
  subst: `\\frac{${fx(d, 2)}}{${fx(c, 2)}}`,
  value: dc(c > 0 ? d / c : Infinity),
})

/** Posisi angkur (mm) terhadap pusat pelat: x sejajar N, y sejajar B. */
export function anchorPositions(r: BasePlateResult): { x: number; y: number; row: 1 | 2 }[] {
  const { nRow, aB } = r.inp
  const B = r.inp.B
  const out: { x: number; y: number; row: 1 | 2 }[] = []
  for (const [x, row] of [[r.f, 1], [-r.f, 2]] as const)
    for (let k = 0; k < nRow; k++) out.push({ x, y: nRow > 1 ? -B / 2 + aB + k * r.sB : 0, row })
  return out
}

/** Gbr. 1 — denah pelat, kolom, angkur dan beton tumpuan. */
export function figPlan(r: BasePlateResult): Figure {
  const ops: FigOp[] = []
  const { N, B } = r.inp
  const Lc = Number.isFinite(r.caN) ? N + 2 * (r.caN - r.inp.aN) : N * 1.6
  const Bc = Number.isFinite(r.caB) ? B + 2 * (r.caB - r.inp.aB) : B * 1.6
  const sc = Math.min(300 / Lc, 190 / Bc)
  const cx = 264, cy = 16 + (Bc * sc) / 2
  const X = (x: number) => cx + x * sc, Y = (y: number) => cy - y * sc
  ops.push({ t: 'rect', x: X(-Lc / 2), y: Y(Bc / 2), w: Lc * sc, h: Bc * sc, fill: true, c: 'support', op: 0.08 })
  ops.push({ t: 'rect', x: X(-Lc / 2), y: Y(Bc / 2), w: Lc * sc, h: Bc * sc, lw: 0.8, c: 'support', dash: Number.isFinite(r.caN) ? undefined : [4, 3] })
  ops.push({ t: 'rect', x: X(-N / 2), y: Y(B / 2), w: N * sc, h: B * sc, fill: true, c: 'accent', op: 0.12 })
  ops.push({ t: 'rect', x: X(-N / 2), y: Y(B / 2), w: N * sc, h: B * sc, lw: 1.1, c: 'ink' })
  columnOps(ops, r, X, Y, sc)
  for (const a of anchorPositions(r)) {
    const tens = a.row === 1 ? r.Trow > 0 : r.Trow2 > 0
    ops.push({ t: 'circle', cx: X(a.x), cy: Y(a.y), r: Math.max(2.5, (r.hole * sc) / 2), lw: 0.6, c: 'muted' })
    ops.push({ t: 'circle', cx: X(a.x), cy: Y(a.y), r: Math.max(2, (r.inp.da * sc) / 2), fill: true, c: tens ? 'bad' : 'ink', op: 0.75 })
  }
  const yb = Y(-Bc / 2) + 12
  dimH(ops, X(-N / 2), X(N / 2), yb, `N = ${fx(N, 0)}`)
  dimV(ops, Y(B / 2), Y(-B / 2), X(Lc / 2) + 10, `B = ${fx(B, 0)}`)
  dimH(ops, X(N / 2 - r.inp.aN), X(N / 2), Y(B / 2) - 8, `a_{N} = ${fx(r.inp.aN, 0)}`)
  return {
    h: figRows(yb + 10),
    ops,
    alt: 'Denah pelat landas, kolom, angkur dan beton tumpuan',
    caption: `Gbr. 1 — Denah: pelat ${fx(N, 0)} × ${fx(B, 0)} × ${fx(r.inp.tp, 0)} mm, ${r.nA} angkur Ø${fx(r.inp.da, 0)} (lubang Ø${fx(r.hole, 0)}); merah = angkur tarik. Ukuran dalam mm.`,
  }
}

/** Garis luar kolom pada denah (x sejajar N = tinggi d). */
function columnOps(ops: FigOp[], r: BasePlateResult, X: (x: number) => number, Y: (y: number) => number, sc: number) {
  const { d, bf, tf, tw } = r
  const t = r.inp.colType
  if (t === 'PIPE') {
    ops.push({ t: 'circle', cx: X(0), cy: Y(0), r: (d / 2) * sc, lw: 1.2, c: 'm' })
    ops.push({ t: 'circle', cx: X(0), cy: Y(0), r: (d / 2 - tf) * sc, lw: 0.6, c: 'm' })
    return
  }
  if (t === 'SHS') {
    ops.push({ t: 'rect', x: X(-d / 2), y: Y(bf / 2), w: d * sc, h: bf * sc, lw: 1.2, c: 'm' })
    ops.push({ t: 'rect', x: X(-d / 2 + tf), y: Y(bf / 2 - tf), w: (d - 2 * tf) * sc, h: (bf - 2 * tf) * sc, lw: 0.6, c: 'm' })
    return
  }
  // WF: sayap tegak lurus N (di x = ±d/2), badan sejajar N. UNP: badan di sisi y = −bf/2.
  const pts: [number, number][] =
    t === 'WF'
      ? [
          [-d / 2, bf / 2], [-d / 2 + tf, bf / 2], [-d / 2 + tf, tw / 2], [d / 2 - tf, tw / 2], [d / 2 - tf, bf / 2], [d / 2, bf / 2],
          [d / 2, -bf / 2], [d / 2 - tf, -bf / 2], [d / 2 - tf, -tw / 2], [-d / 2 + tf, -tw / 2], [-d / 2 + tf, -bf / 2], [-d / 2, -bf / 2],
        ]
      : [
          [-d / 2, bf / 2], [-d / 2 + tf, bf / 2], [-d / 2 + tf, -bf / 2 + tw], [d / 2 - tf, -bf / 2 + tw], [d / 2 - tf, bf / 2], [d / 2, bf / 2],
          [d / 2, -bf / 2], [-d / 2, -bf / 2],
        ]
  ops.push({ t: 'poly', pts: pts.map(([x, y]) => [X(x), Y(y)]), close: true, fill: true, c: 'm', op: 0.25 })
  ops.push({ t: 'poly', pts: pts.map(([x, y]) => [X(x), Y(y)]), close: true, lw: 1, c: 'm' })
  void sc
}

/** Gbr. 2 — elevasi: blok tegangan tumpu, gaya tarik angkur, beban. */
export function figElev(r: BasePlateResult): Figure {
  const ops: FigOp[] = []
  const N = r.inp.N
  const sc = 300 / N
  const cx = 264, yPl = 100
  const X = (x: number) => cx + x * sc
  const tpH = Math.max(4, Math.min(12, r.inp.tp * sc))
  // beton
  ops.push({ t: 'rect', x: X(-N / 2) - 40, y: yPl + tpH, w: N * sc + 80, h: 60, fill: true, c: 'support', op: 0.08 })
  ops.push({ t: 'line', x1: X(-N / 2) - 40, y1: yPl + tpH, x2: X(N / 2) + 40, y2: yPl + tpH, lw: 0.6, c: 'support' })
  // pelat & kolom
  ops.push({ t: 'rect', x: X(-N / 2), y: yPl, w: N * sc, h: tpH, fill: true, c: 'accent', op: 0.35 })
  ops.push({ t: 'rect', x: X(-N / 2), y: yPl, w: N * sc, h: tpH, lw: 0.9, c: 'ink' })
  ops.push({ t: 'rect', x: X(-r.d / 2), y: yPl - 50, w: r.d * sc, h: 50, lw: 1, c: 'm' })
  if (r.inp.colType === 'WF' || r.inp.colType === 'UNP') {
    ops.push({ t: 'rect', x: X(-r.d / 2), y: yPl - 50, w: r.tf * sc, h: 50, fill: true, c: 'm', op: 0.35 })
    ops.push({ t: 'rect', x: X(r.d / 2 - r.tf), y: yPl - 50, w: r.tf * sc, h: 50, fill: true, c: 'm', op: 0.35 })
  }
  // angkur
  for (const x of [r.f, -r.f]) {
    const tens = x > 0 ? r.Trow > 0 : r.Trow2 > 0
    ops.push({ t: 'line', x1: X(x), y1: yPl - 10, x2: X(x), y2: yPl + tpH + 50, lw: 1.6, c: tens ? 'bad' : 'muted' })
    ops.push({ t: 'rect', x: X(x) - 5, y: yPl - 6, w: 10, h: 5, fill: true, c: 'ink', op: 0.7 })
  }
  // tegangan tumpu (zona tekan di sisi −x)
  if (r.regime !== 'uplift' && r.Y > 0) {
    const Ywid = Math.min(r.Y, N) * sc
    const qh = 26
    const x0 = X(-N / 2) // zona tekan di sisi berlawanan baris angkur tarik (+f)
    ops.push({ t: 'rect', x: x0, y: yPl + tpH, w: Ywid, h: qh, fill: true, c: 'load', op: 0.25 })
    ops.push({ t: 'rect', x: x0, y: yPl + tpH, w: Ywid, h: qh, lw: 0.6, c: 'load' })
    ops.push({ t: 'text', x: x0 + Ywid / 2, y: yPl + tpH + qh + 10, s: `f_{p} = ${fx(r.fp, 2)} MPa, Y = ${fx(r.Y, 0)} mm`, size: 7, align: 'c', c: 'load', bold: true })
  }
  if (r.Trow > 0) {
    arrow(ops, X(r.f), yPl + tpH + 54, X(r.f), yPl + tpH + 84, { c: 'bad', lw: 1.6, head: 6 })
    ops.push({ t: 'text', x: X(r.f) + 6, y: yPl + tpH + 80, s: `T = ${fx(r.Trow, 1)} kN`, size: 7, c: 'bad', bold: true })
  }
  // beban
  const P = r.Pu
  if (P !== 0) {
    if (P > 0) arrow(ops, cx, yPl - 86, cx, yPl - 54, { c: 'load', lw: 1.8, head: 6 })
    else arrow(ops, cx, yPl - 54, cx, yPl - 86, { c: 'load', lw: 1.8, head: 6 })
    ops.push({ t: 'text', x: cx + 6, y: yPl - 74, s: `P_{u} = ${fx(Math.abs(P), 1)} kN ${P > 0 ? '(tekan)' : '(tarik)'}`, size: 7, c: 'load', bold: true })
  }
  if (r.Vu > 0) {
    arrow(ops, X(-r.d / 2) - 40, yPl - 30, X(-r.d / 2) - 4, yPl - 30, { c: 'v', lw: 1.6, head: 6 })
    ops.push({ t: 'text', x: X(-r.d / 2) - 42, y: yPl - 34, s: `V_{u} = ${fx(r.Vu, 1)} kN`, size: 7, align: 'r', c: 'v', bold: true })
  }
  if (r.Mu > 0) ops.push({ t: 'text', x: X(r.d / 2) + 8, y: yPl - 40, s: `M_{u} = ${fx(r.Mu, 1)} kN·m ↻`, size: 7, c: 'm', bold: true })
  dimH(ops, X(r.f), X(N / 2), yPl + tpH + 98, `a_{N}`)
  dimH(ops, X(0), X(r.f), yPl + tpH + 98, `f = ${fx(r.f, 0)}`)
  return {
    h: figRows(yPl + tpH + 106),
    ops,
    alt: 'Elevasi pelat landas: tegangan tumpu dan gaya tarik angkur',
    caption: `Gbr. 2 — Elevasi arah N: ${REGIME_LABEL[r.regime]}. Ukuran dalam mm.`,
  }
}

/** Gbr. 3 — rasio D/C tiap pemeriksaan. */
function figChecks(checks: BaseCheck[]): Figure {
  const ops: FigOp[] = []
  const bx0 = 210, bw = 240, rh = 17
  const top = Math.max(1.2, ...checks.map((c) => (Number.isFinite(c.dc) ? c.dc : 1.2)))
  const X = (v: number) => bx0 + (Math.min(v, top) / top) * bw
  checks.forEach((c, i) => {
    const y = 8 + i * rh
    const bad = c.dc > 1
    ops.push({ t: 'text', x: bx0 - 8, y: y + 8, s: c.label, size: 7, align: 'r', c: 'ink' })
    ops.push({ t: 'rect', x: bx0, y, w: Math.max(1.5, X(c.dc) - bx0), h: 10, fill: true, c: bad ? 'bad' : 'ok', op: 0.4 })
    ops.push({ t: 'text', x: X(c.dc) + 4, y: y + 8, s: dc(c.dc), size: 7, c: bad ? 'bad' : 'ink' })
  })
  const yb = 8 + checks.length * rh
  ops.push({ t: 'line', x1: X(1), y1: 4, x2: X(1), y2: yb, lw: 1.1, c: 'bad', dash: [3, 2] })
  ops.push({ t: 'text', x: X(1), y: yb + 9, s: 'D/C = 1', size: 6.5, align: 'c', c: 'muted' })
  return { h: figRows(yb + 12), ops, alt: 'Rasio D/C tiap pemeriksaan', caption: 'Gbr. 3 — Rasio kebutuhan / kapasitas tiap pemeriksaan.' }
}

export function basePlateReport(r: BasePlateResult): Report {
  const v = r.inp
  const ti = typeInfo(v.colType)
  const grade = ANCHOR_GRADES.find((g) => g.key === v.anchorGrade)!
  const pinned = v.fixity === 'pinned'
  const sections: Section[] = []

  sections.push({
    title: 'Data perletakan',
    blocks: [
      {
        k: 'rows',
        rows: [
          kv('Tipe perletakan', FIXITY_LABEL[v.fixity]),
          kv('Kolom', `${ti?.name ?? v.colType} ${v.prof.name} — d × b_{f} = ${fx(r.d, 0)} × ${fx(r.bf, 0)} mm, F_{y} = ${fx(v.colFy, 0)} MPa`),
          kv('Pelat landas N × B × t_{p}', `${fx(v.N, 0)} × ${fx(v.B, 0)} × ${fx(v.tp, 0)} mm, F_{y} = ${fx(v.plateFy, 0)} MPa`),
          kv('Angkur', `${r.nA} × Ø${fx(v.da, 0)} ${grade.label} (2 baris × ${v.nRow}), A_{se} = ${fx(r.Ase, 0)} mm^{2}, f_{uta} = ${fx(r.futa, 0)} MPa`),
          kv('Kepala angkur / kedalaman tanam h_{ef}', `${v.head === 'headed' ? 'berkepala (mur hex berat)' : `kait, e_{h} = ${fx(v.eh, 0)} mm`} / ${fx(v.hef, 0)} mm`),
          kv('Tepi pelat → angkur a_{N} / a_{B}', `${fx(v.aN, 0)} / ${fx(v.aB, 0)} mm, lubang Ø${fx(r.hole, 0)} mm (DG1 Tabel 2.3)`),
          kv('Beton tumpuan', `${SUPPORT_LABEL[v.support]}${v.support === 'pedestal' ? ` ${fx(v.Lp, 0)} × ${fx(v.Bp, 0)} mm` : ''}, h_{a} = ${fx(r.ha, 0)} mm, f'_{c} = ${fx(v.fc, 0)} MPa`),
          kv('Jarak sumbu angkur → tepi beton c_{a,N} / c_{a,B}', `${dist(r.caN)} / ${dist(r.caB)}`),
          kv('Kondisi beton', `${v.cracked ? 'retak' : 'tak retak'}, kondisi ${v.condA ? 'A (ada tulangan suplemen)' : 'B (tanpa tulangan suplemen)'}`),
          kv('Grout', v.grout > 0 ? `${fx(v.grout, 0)} mm` : 'tanpa grout'),
          kv('Penyaluran geser', v.shearMode === 'friction' ? 'gesekan pelat–grout/beton' : 'angkur'),
          kv('Las sudut kolom–pelat', v.weld > 0 ? `w = ${fx(v.weld, 0)} mm, F_{EXX} = ${fx(v.FEXX, 0)} MPa` : 'tidak ditinjau'),
        ],
      },
      { k: 'figure', fig: figPlan(r) },
    ],
  })

  // beban rencana
  const loadSteps: CalcStep[] = []
  if (v.loadMode === 'capacity' && r.cap) {
    if (pinned) {
      loadSteps.push(
        { desc: 'Desain kapasitas sendi: pelat landas menyalurkan kuat tekan rencana kolom', lhs: 'L_{c}', expr: 'K · H', subst: `${fx(v.K, 2)} × ${fx(v.H, 0)}`, value: fx(r.cap.Lc, 0), unit: 'mm' },
        { lhs: '\\frac{L_{c}}{r_{min}}', subst: `\\frac{${fx(r.cap.Lc, 0)}}{${fx(r.cap.rmin, 1)}}`, value: fx(r.cap.lam, 1) },
        { lhs: 'F_{cr}', expr: 'Pers. E3-2 / E3-3', value: fx(r.cap.Fcr, 1), unit: 'MPa', ref: 'SNI 1729 E3' },
        { lhs: 'P_{u} = φ_{c}P_{n}', expr: '0.9 F_{cr} A_{g}', subst: `0.9 × ${fx(r.cap.Fcr, 1)} × ${fx(r.Ag, 0)} / 10^{3}`, value: fx(r.Pu, 1), unit: 'kN' },
      )
    } else {
      loadSteps.push(
        { desc: 'Modulus plastis kolom sumbu kuat', lhs: 'Z_{x}', value: sci(r.Zx), unit: 'mm^{3}' },
        { desc: 'Kuat lentur ekspektasi kolom', lhs: 'M_{pr}', expr: '1.1 R_{y} F_{y} Z_{x}', subst: `1.1 × ${fx(v.Ry, 2)} × ${fx(v.colFy, 0)} × ${sci(r.Zx)} / 10^{6}`, value: fx(r.Mu, 1), unit: 'kN·m', ref: 'SNI 7860 D2.6c' },
        { desc: 'Geser mekanisme dua sendi plastis', lhs: 'V_{u}', expr: '\\frac{2M_{pr}}{H}', subst: `\\frac{2 × ${fx(r.Mu, 1)}}{${fx(v.H / 1000, 2)}}`, value: fx(r.Vu, 1), unit: 'kN', ref: 'SNI 7860 D2.6b' },
      )
    }
  }
  sections.push({
    title: 'Beban rencana',
    blocks: [
      { k: 'p', text: v.loadMode === 'capacity' ? 'Mode desain kapasitas: gaya dari kekuatan kolom (lihat langkah di bawah); gaya lain dari isian.' : 'Mode beban aktual: gaya terfaktor (DFBK) dari isian.' },
      ...(loadSteps.length ? [{ k: 'calc' as const, steps: loadSteps }] : []),
      {
        k: 'rows',
        rows: [
          kv('P_{u} (+ tekan / − tarik)', `${fx(r.Pu, 1)} kN`),
          kv('M_{u} (sumbu kuat kolom)', pinned ? '0 (sendi)' : `${fx(r.Mu, 1)} kN·m`),
          kv('V_{u} (sejajar N)', `${fx(r.Vu, 1)} kN`),
        ],
      },
    ],
  })

  // tumpu
  const brgSteps: CalcStep[] = [
    { lhs: 'A_{1}', expr: 'N · B', subst: `${fx(v.N, 0)} × ${fx(v.B, 0)}`, value: sci(r.A1), unit: 'mm^{2}' },
    {
      desc: v.support === 'slab' ? 'A_{2} dari frustum kemiringan 1V:2H di dalam tebal slab' : 'A_{2} = luas terbesar sebangun & sepusat dengan A_{1} di dalam beton tumpuan',
      lhs: 'A_{2}',
      value: sci(r.A2),
      unit: 'mm^{2}',
      ref: '22.8.3',
    },
    { lhs: '√(A_{2}/A_{1})', expr: '≤ 2', value: fx(r.sqrtR, 3) },
    { desc: 'φ_{c} = 0,65', lhs: 'φ_{c}f_{p(maks)}', expr: "φ_{c} 0.85 f'_{c} √(A_{2}/A_{1})", subst: `0.65 × 0.85 × ${fx(v.fc, 0)} × ${fx(r.sqrtR, 3)}`, value: fx(r.fpMax, 2), unit: 'MPa', ref: 'J8 / 22.8.3.2' },
    { lhs: 'q_{maks}', expr: 'φ_{c}f_{p(maks)} · B', subst: `${fx(r.fpMax, 2)} × ${fx(v.B, 0)}`, value: fx(r.qmax, 0), unit: 'N/mm' },
  ]
  sections.push({ title: 'Kuat tumpu beton', blocks: [{ k: 'calc', steps: brgSteps }] })

  // distribusi gaya
  const fSteps: CalcStep[] = [{ lhs: 'f', expr: 'N/2 − a_{N}', subst: `${fx(v.N / 2, 0)} − ${fx(v.aN, 0)}`, value: fx(r.f, 0), unit: 'mm' }]
  if (r.Pu > 0 && r.Mu > 0) {
    fSteps.push(
      { lhs: 'e', expr: '\\frac{M_{u}}{P_{u}}', subst: `\\frac{${fx(r.Mu * 1000, 0)}}{${fx(r.Pu, 1)}}`, value: fx(r.e, 0), unit: 'mm' },
      { lhs: 'e_{krit}', expr: '\\frac{N}{2} − \\frac{P_{u}}{2q_{maks}}', subst: `${fx(v.N / 2, 0)} − \\frac{${fx(r.Pu * 1000, 0)}}{2 × ${fx(r.qmax, 0)}}`, value: fx(r.ecrit, 0), unit: 'mm', ref: 'DG1 3.3.6' },
    )
  }
  if (r.regime === 'bearing' || r.regime === 'small') {
    fSteps.push(
      { lhs: 'Y', expr: r.regime === 'small' ? 'N − 2e' : 'N', value: fx(r.Y, 0), unit: 'mm' },
      { lhs: 'f_{p}', expr: '\\frac{P_{u}}{B · Y}', subst: `\\frac{${fx(r.Pu * 1000, 0)}}{${fx(v.B, 0)} × ${fx(r.Y, 0)}}`, value: fx(r.fp, 2), unit: 'MPa' },
    )
  } else if (r.regime === 'large') {
    fSteps.push(
      { desc: 'Momen terhadap baris angkur tarik (P_{u} bertanda, tekan +)', lhs: 'K', expr: 'M_{u} + P_{u} f', value: fx(r.K, 2), unit: 'kN·m' },
      { lhs: 'Y', expr: '(f + \\frac{N}{2}) − √((f + \\frac{N}{2})^{2} − \\frac{2K}{q_{maks}})', value: fx(r.Y, 1), unit: 'mm', ref: 'DG1 3.4.4' },
      { lhs: 'T', expr: 'q_{maks} Y − P_{u}', subst: `${fx(r.qmax, 0)} × ${fx(r.Y, 1)} / 10^{3} − ${fx(r.Pu, 1)}`, value: fx(r.Trow, 2), unit: 'kN', ref: 'DG1 3.4.5' },
    )
  } else {
    fSteps.push(
      { desc: 'Tanpa tumpu: kedua baris angkur tertarik', lhs: 'T_{1}', expr: '\\frac{−P_{u}}{2} + \\frac{M_{u}}{2f}', value: fx(r.Trow, 2), unit: 'kN' },
      { lhs: 'T_{2}', expr: '\\frac{−P_{u}}{2} − \\frac{M_{u}}{2f}', value: fx(r.Trow2, 2), unit: 'kN' },
    )
  }
  if (r.Trow > 0) fSteps.push({ lhs: 'T_{angkur}', expr: '\\frac{T}{n_{baris}}', subst: `\\frac{${fx(r.Trow, 2)}}{${v.nRow}}`, value: fx(r.Tanchor, 2), unit: 'kN' })
  sections.push({
    title: 'Distribusi gaya pada pelat',
    blocks: [{ k: 'p', text: `Rezim: ${REGIME_LABEL[r.regime]}. Tegangan tumpu persegi seragam (metode AISC DG1).` }, { k: 'calc', steps: fSteps }, { k: 'figure', fig: figElev(r) }],
  })

  // tebal pelat
  const tSteps: CalcStep[] = []
  if (r.regime !== 'uplift') {
    const kM = v.colType === 'PIPE' ? '0.8' : '0.95'
    const kN = v.colType === 'PIPE' ? '0.8' : v.colType === 'SHS' ? '0.95' : '0.8'
    tSteps.push(
      { lhs: 'm', expr: `\\frac{N − ${kM}d}{2}`, subst: `\\frac{${fx(v.N, 0)} − ${kM} × ${fx(r.d, 0)}}{2}`, value: fx(r.m, 1), unit: 'mm' },
      { lhs: 'n', expr: `\\frac{B − ${kN}b_{f}}{2}`, subst: `\\frac{${fx(v.B, 0)} − ${kN} × ${fx(r.bf, 0)}}{2}`, value: fx(r.n, 1), unit: 'mm' },
    )
    if (r.lamN > 0)
      tSteps.push(
        { lhs: 'X', expr: '\\frac{4db_{f}}{(d + b_{f})^{2}} \\frac{P_{u}}{φ_{c}P_{p}}', value: fx(r.X, 3) },
        { lhs: 'λ', expr: '\\frac{2√(X)}{1 + √(1 − X)} ≤ 1', value: fx(r.lam, 3) },
        { lhs: "λn'", expr: '\\frac{λ√(db_{f})}{4}', value: fx(r.lamN, 1), unit: 'mm', ref: 'DG1 3.1.3' },
      )
    tSteps.push({
      desc: 'Lentur garis leleh kantilever ℓ = maks(m; n; λn′) dengan tegangan tumpu f_{p} sepanjang Y',
      lhs: 't_{p,tumpu}',
      expr: 'Y ≥ ℓ: ℓ√(\\frac{2f_{p}}{0.9F_{y}}); Y < ℓ: √(\\frac{4f_{p}Y(ℓ − Y/2)}{0.9F_{y}})',
      value: fx(r.tpBrg, 1),
      unit: 'mm',
      ref: 'DG1 3.1.2, 3.3.14',
    })
  }
  if (r.Trow > 0)
    tSteps.push(
      { desc: 'Lengan dari sumbu angkur ke garis tengah sayap/dinding kolom terdekat', lhs: 'x', expr: 'f − \\frac{d}{2} + \\frac{t_{f}}{2}', value: fx(r.x, 1), unit: 'mm', ref: 'DG1 3.4.6' },
      { lhs: 't_{p,tarik}', expr: '√(\\frac{4Tx}{0.9F_{y}B})', subst: `√(\\frac{4 × ${fx(r.Trow * 1000, 0)} × ${fx(r.x, 1)}}{0.9 × ${fx(v.plateFy, 0)} × ${fx(v.B, 0)}})`, value: fx(r.tpTens, 1), unit: 'mm', ref: 'DG1 3.4.7' },
    )
  tSteps.push(
    { lhs: 't_{p,perlu}', expr: 'maks(t_{p,tumpu}; t_{p,tarik})', value: fx(r.tpReq, 1), unit: 'mm' },
    dcStep('D/C_{pelat}', 't_{p,perlu}', 't_{p}', r.tpReq, v.tp),
  )
  sections.push({ title: 'Tebal pelat landas (leleh lentur, φ_{b} = 0,9)', blocks: [{ k: 'calc', steps: tSteps }] })

  // angkur tarik
  if (r.Trow > 0) {
    const aSteps: CalcStep[] = [
      { desc: `f_{uta} = min(F_{u}; 1,9f_{ya}; 862) = ${fx(r.futa, 0)} MPa; φ = 0,75`, lhs: 'φN_{sa}', expr: '0.75 A_{se} f_{uta}', subst: `0.75 × ${fx(r.Ase, 0)} × ${fx(r.futa, 0)} / 10^{3}`, value: fx(r.phiNsa, 2), unit: 'kN', ref: '17.6.1.2' },
      dcStep('D/C', 'T_{angkur}', 'φN_{sa}', r.Tanchor, r.phiNsa),
      ...(r.hefReduced ? [{ desc: 'Tiga tepi atau lebih < 1,5h_{ef}', lhs: "h'_{ef}", expr: 'maks(\\frac{c_{a,maks}}{1.5}; \\frac{s_{maks}}{3})', value: fx(r.hefUsed, 0), unit: 'mm', ref: '17.6.2.1.2' }] : []),
      {
        lhs: 'N_{b}',
        expr: r.hefUsed >= 280 && r.hefUsed <= 635 ? "3.9 λ √(f'_{c}) h_{ef}^{5/3}" : "10 λ √(f'_{c}) h_{ef}^{1.5}",
        value: fx(r.Nb, 2),
        unit: 'kN',
        ref: '17.6.2.2',
      },
      { lhs: 'A_{Nc} / A_{Nco}', subst: `${sci(r.ANc)} / ${sci(r.ANco)}`, value: fx(r.ANc / r.ANco, 3), ref: '17.6.2.1' },
      { lhs: 'ψ_{ec,N} / ψ_{ed,N} / ψ_{c,N}', value: `${fx(r.psiEcN, 3)} / ${fx(r.psiEdN, 3)} / ${fx(r.psiCN, 2)}` },
      { lhs: 'N_{cbg}', expr: '\\frac{A_{Nc}}{A_{Nco}} ψ_{ec,N} ψ_{ed,N} ψ_{c,N} N_{b}', value: fx(r.Ncbg, 2), unit: 'kN', ref: '17.6.2.1b' },
      { lhs: 'φN_{cbg}', subst: `${fx(r.phiConc, 2)} × ${fx(r.Ncbg, 2)}`, value: fx(r.phiNcbg, 2), unit: 'kN' },
      dcStep('D/C', 'ΣT', 'φN_{cbg}', r.Trow + r.Trow2, r.phiNcbg),
      v.head === 'headed'
        ? { desc: `Luas tumpu kepala (mur hex berat) A_{brg} = ${fx(r.Abrg, 0)} mm^{2}`, lhs: 'N_{p}', expr: "8 A_{brg} f'_{c}", subst: `8 × ${fx(r.Abrg, 0)} × ${fx(v.fc, 0)} / 10^{3}`, value: fx(r.Np, 2), unit: 'kN', ref: '17.6.3.2.2a' }
        : { lhs: 'N_{p}', expr: "0.9 f'_{c} e_{h} d_{a}", value: fx(r.Np, 2), unit: 'kN', ref: '17.6.3.2.2b' },
      { desc: `ψ_{c,P} = ${v.cracked ? '1,0' : '1,4'}; φ = 0,70`, lhs: 'φN_{pn}', value: fx(r.phiNpn, 2), unit: 'kN', ref: '17.6.3.1' },
      dcStep('D/C', 'T_{angkur}', 'φN_{pn}', r.Tanchor, r.phiNpn),
    ]
    if (r.phiNsbg != null && r.Nsbg != null)
      aSteps.push(
        { desc: 'h_{ef} > 2,5c_{a1} → ledakan sisi ditinjau', lhs: 'N_{sbg}', expr: "13 c_{a1} √(A_{brg}) λ √(f'_{c}) (faktor c_{a2}, grup)", value: fx(r.Nsbg, 2), unit: 'kN', ref: '17.6.4' },
        { lhs: 'φN_{sbg}', value: fx(r.phiNsbg, 2), unit: 'kN' },
        dcStep('D/C', 'N_{ua}', 'φN_{sbg}', r.NsbDem, r.phiNsbg),
      )
    sections.push({ title: 'Angkur tarik (SNI 2847:2019 Ps. 17.6)', blocks: [{ k: 'calc', steps: aSteps }] })
  }

  // geser
  if (r.Vu > 0) {
    const vSteps: CalcStep[] =
      v.shearMode === 'friction'
        ? [
            { desc: `μ = ${fx(r.mu, 2)} (${v.grout > 0 ? 'baja di atas grout' : 'baja di atas beton'}); hanya tekan P_{u}`, lhs: 'φV_{n}', expr: "0.75 · min(μP_{u}; 0.2f'_{c}A_{1})", value: fx(r.phiVfr, 2), unit: 'kN', ref: 'DG1 3.5.1' },
            dcStep('D/C', 'V_{u}', 'φV_{n}', r.Vu, r.phiVfr),
          ]
        : [
            { desc: v.grout > 0 ? 'Pelat di atas grout → ×0,8' : undefined, lhs: 'V_{sa}', expr: `0.6 A_{se} f_{uta}${v.grout > 0 ? ' × 0.8' : ''}`, value: fx(r.Vsa, 2), unit: 'kN', ref: '17.7.1.2' },
            { desc: `φ = 0,65; geser dibagi ke ${r.nShear} angkur`, lhs: 'φV_{sa}', value: fx(r.phiVsa, 2), unit: 'kN' },
            dcStep('D/C', 'V_{u}/n', 'φV_{sa}', r.Vanchor, r.phiVsa),
            ...(r.phiVcbg != null && r.Vcbg != null
              ? [
                  { desc: `Geser sejajar N menuju tepi, seluruh V_{u} oleh baris depan, c_{a1} = ${fx(r.ca1, 0)} mm`, lhs: 'V_{b}', expr: "min(0.6(\\frac{l_{e}}{d_{a}})^{0.2}√(d_{a}) λ √(f'_{c}) c_{a1}^{1.5}; 3.7 λ √(f'_{c}) c_{a1}^{1.5})", value: fx(r.Vb, 2), unit: 'kN', ref: '17.7.2.2' },
                  { lhs: 'A_{Vc} / A_{Vco}', subst: `${sci(r.AVc)} / ${sci(r.AVco)}`, value: fx(r.AVc / r.AVco, 3) },
                  { lhs: 'ψ_{ed,V} / ψ_{c,V} / ψ_{h,V}', value: `${fx(r.psiEdV, 3)} / ${fx(r.psiCV, 2)} / ${fx(r.psiHV, 3)}` },
                  { lhs: 'φV_{cbg}', expr: 'φ \\frac{A_{Vc}}{A_{Vco}} ψ_{ed,V} ψ_{c,V} ψ_{h,V} V_{b}', value: fx(r.phiVcbg, 2), unit: 'kN', ref: '17.7.2.1' },
                  dcStep('D/C', 'V_{u}', 'φV_{cbg}', r.Vu, r.phiVcbg),
                ]
              : []),
            { desc: `k_{cp} = ${r.kcp}; N_{cpg} = ${fx(r.Ncpg, 2)} kN (semua angkur, ψ_{ec} = 1); φ = 0,70`, lhs: 'φV_{cpg}', expr: 'φ k_{cp} N_{cpg}', value: fx(r.phiVcpg, 2), unit: 'kN', ref: '17.7.3' },
            dcStep('D/C', 'V_{u}', 'φV_{cpg}', r.Vu, r.phiVcpg),
          ]
    if (r.inter != null)
      vSteps.push({ desc: 'Rasio tarik & geser sama-sama > 0,2', lhs: 'Σ', expr: '\\frac{N_{ua}}{φN_{n}} + \\frac{V_{ua}}{φV_{n}} ≤ 1.2', subst: `${fx(r.interN, 3)} + ${fx(r.interV, 3)}`, value: fx(r.inter, 3), ref: '17.8.3' })
    sections.push({ title: v.shearMode === 'friction' ? 'Geser dasar — gesekan' : 'Geser dasar — angkur (Ps. 17.7)', blocks: [{ k: 'calc', steps: vSteps }] })
  }

  // las
  if (v.weld > 0 && (r.fn > 0 || r.fv > 0)) {
    sections.push({
      title: 'Las sudut kolom–pelat (metode elastis garis)',
      blocks: [
        { k: 'p', text: 'Tekan disalurkan lewat tumpu ujung kolom pada pelat (J1.4); las memikul tarik, momen dan geser. Geser dipikul las sejajar arah gaya.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'L_{w}', value: fx(r.Lw, 0), unit: 'mm' },
            { lhs: 'I_{w}', value: sci(r.Iw), unit: 'mm^{3}' },
            { lhs: 'f_{n}', expr: '\\frac{T_{u}}{L_{w}} + \\frac{M_{u} c}{I_{w}}', value: fx(r.fn, 1), unit: 'N/mm' },
            { lhs: 'f_{v}', expr: '\\frac{V_{u}}{L_{w,v}}', value: fx(r.fv, 1), unit: 'N/mm' },
            { lhs: 'f_{r}', expr: '√(f_{n}^{2} + f_{v}^{2})', value: fx(r.fr, 1), unit: 'N/mm' },
            { lhs: 'φR_{n}', expr: '0.75 × 0.6 F_{EXX} × 0.707w', subst: `0.75 × 0.6 × ${fx(v.FEXX, 0)} × 0.707 × ${fx(v.weld, 0)}`, value: fx(r.phiRw, 1), unit: 'N/mm', ref: 'J2.4' },
            dcStep('D/C', 'f_{r}', 'φR_{n}', r.fr, r.phiRw),
          ],
        },
      ],
    })
  }

  const rows: Row[] = r.checks.map((c) => check(c.label, c.dc, c.ref))
  sections.push({ title: 'Rekapitulasi', strong: true, blocks: [{ k: 'rows', rows }, { k: 'figure', fig: figChecks(r.checks) }] })

  return {
    title: `Base Plate ${pinned ? 'Sendi' : 'Jepit'} Kolom Baja (AISC Design Guide 1 / SNI 1729:2020 / SNI 2847:2019)`,
    summary: [
      kv('Perletakan / rezim', `${FIXITY_LABEL[v.fixity]} — ${REGIME_LABEL[r.regime]}`),
      kv('Beban rencana P_{u} / M_{u} / V_{u}', `${fx(r.Pu, 1)} kN / ${fx(r.Mu, 1)} kN·m / ${fx(r.Vu, 1)} kN`),
      kv('Tebal pelat perlu / pasang', `${fx(r.tpReq, 1)} / ${fx(v.tp, 0)} mm`),
      ...(r.Trow > 0 ? [kv('Tarik per angkur T_{angkur}', `${fx(r.Tanchor, 2)} kN`)] : []),
      ...(r.gov ? [check(`Menentukan: ${r.gov.label}`, r.gov.dc)] : []),
    ],
    sections,
    governing: r.gov ? { label: `D/C menentukan (${r.gov.label})`, ratio: r.gov.dc } : undefined,
    warnings: r.warn,
    scope: [
      'Asumsi: pelat kaku dengan tegangan tumpu persegi seragam (AISC DG1); momen satu arah terhadap sumbu kuat kolom; geser sejajar N; dua baris angkur sejajar B; angkur cor di tempat dengan mur hex berat; beton normal (λ = 1).',
      'Desain kapasitas mengikuti SNI 7860:2020 Ps. D2.6 (jepit: 1,1R_{y}F_{y}Z_{x}; sendi: φ_{c}P_{n} kolom). Tumpu sendi tidak menahan momen.',
      'Belum termasuk: shear lug, tulangan angkur (17.5.2.1), momen dua arah, lentur angkur pada grout tebal, kuat las terhadap logam dasar, pengencangan & pratarik angkur. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildBasePlateReport(i: BasePlateUIInput): Report | null {
  const r = computeBasePlateUI(i)
  return r ? basePlateReport(r) : null
}

export default {
  defaults: BASE_PLATE_DEFAULTS,
  build: (i: BasePlateUIInput) => buildBasePlateReport(i) ?? { title: 'Base Plate', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
