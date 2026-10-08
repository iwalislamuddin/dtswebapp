import { typeInfo } from '../../calc/shared/steel-profiles'
import type { SteelBeamResult } from '../../calc/steel-beam-analysis'
import { arrow, dimH, figRows } from '../../report/figure'
import { check, fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { BEAM_DEFAULTS, computeBeam, type BeamInput } from './model'

// Laporan Analisis Balok Baja: data, beban & resultannya, reaksi (ΣM = 0, ΣV = 0), momen pada titik maksimum
// (kontribusi tiap gaya), lendutan & batas L/240–L/360, tegangan lentur elastis — dengan rumus dan substitusi.

const EPS = 1e-9

interface LoadItem {
  name: string
  kind: string
  /** Resultan (kN, + ke bawah) & posisinya dari ujung kiri (m). */
  W: number
  x: number
  /** Deskripsi beban untuk tabel. */
  desc: string
  span: string
}

/** Daftar beban dengan resultannya (sama dengan patchFull di mesin hitung, satuan kN & m). */
function loadItems(r: SteelBeamResult): LoadItem[] {
  const out: LoadItem[] = []
  let k = 0
  for (const d of r.inpDist!) {
    const Lp = d.a2 - d.a1
    const W = ((d.w1 + d.w2) / 2) * Lp
    const xc = d.w1 + d.w2 > EPS ? (Lp * (d.w1 + 2 * d.w2)) / (3 * (d.w1 + d.w2)) : Lp / 2
    out.push({
      name: d.self ? 'q_{sw}' : `q_{${++k}}`,
      kind: d.self ? 'berat sendiri' : d.w1 === d.w2 ? 'merata' : d.w1 === 0 || d.w2 === 0 ? 'segitiga' : 'trapesium',
      W, x: d.a1 + xc,
      desc: d.w1 === d.w2 ? `${fx(d.w1, 2)} kN/m` : `${fx(d.w1, 2)} → ${fx(d.w2, 2)} kN/m`,
      span: `${fx(d.a1, 2)} – ${fx(d.a2, 2)}`,
    })
  }
  r.inpPt!.forEach((p, i) => out.push({ name: `P_{${i + 1}}`, kind: 'terpusat', W: p.P, x: p.a, desc: `${fx(p.P, 2)} kN`, span: `@ ${fx(p.a, 2)}` }))
  return out
}

/** Kontribusi momen di potongan x (m) — gaya di kiri potongan, momen sagging (+). Sama dengan moment() mesin hitung. */
function momentTerms(r: SteelBeamResult, x: number): { name: string; F: number; arm: number; M: number }[] {
  const t: { name: string; F: number; arm: number; M: number }[] = []
  const e = 1e-9
  if (r.xA! < x + e) t.push({ name: 'R_{A}', F: r.RA!, arm: x - r.xA!, M: r.RA! * (x - r.xA!) })
  if (r.xB! < x + e) t.push({ name: 'R_{B}', F: r.RB!, arm: x - r.xB!, M: r.RB! * (x - r.xB!) })
  r.inpPt!.forEach((p, i) => {
    if (p.a <= x + e) t.push({ name: `P_{${i + 1}}`, F: -p.P, arm: x - p.a, M: -p.P * (x - p.a) })
  })
  let k = 0
  for (const d of r.inpDist!) {
    const name = d.self ? 'q_{sw}' : `q_{${++k}}`
    if (x <= d.a1 + e) continue
    const tt = Math.min(x, d.a2), Lp = d.a2 - d.a1
    const wt = Lp > e ? d.w1 + ((d.w2 - d.w1) * (tt - d.a1)) / Lp : d.w1
    const len = tt - d.a1
    const A = ((d.w1 + wt) / 2) * len
    const xbar = d.w1 + wt > e ? (len * (d.w1 + 2 * wt)) / (3 * (d.w1 + wt)) : len / 2
    const arm = x - (d.a1 + xbar)
    t.push({ name: `${name} (bagian kiri)`, F: -A, arm, M: -A * arm })
  }
  return t
}

/* ---------------- gambar ---------------- */

const X0 = 46, X1 = 482

/** Gbr. 1 — model balok, tumpuan, beban, dimensi (berwarna). */
function figModel(r: SteelBeamResult): Figure {
  const ops: FigOp[] = []
  const X = (x: number) => X0 + (x / r.Ltot!) * (X1 - X0)
  const user = r.inpDist!.filter((d) => !d.self)
  const lanes = Math.max(1, user.length)
  const band = 34 / lanes
  const hasDown = r.inpPt!.some((p) => p.P > 0)
  const yBeam = 34 + lanes * (band + 4) + (hasDown ? 26 : 0)
  const wMax = Math.max(EPS, ...user.flatMap((d) => [Math.abs(d.w1), Math.abs(d.w2)]))
  user.forEach((d, i) => {
    const base = yBeam - 6 - i * (band + 4)
    const h = (w: number) => 4 + (band - 4) * (Math.abs(w) / wMax)
    const xa = X(d.a1), xb = X(d.a2), ya = base - h(d.w1), yb = base - h(d.w2)
    ops.push({ t: 'poly', pts: [[xa, base], [xa, ya], [xb, yb], [xb, base]], fill: true, c: 'load', op: 0.14 })
    ops.push({ t: 'poly', pts: [[xa, base], [xa, ya], [xb, yb], [xb, base]], close: true, c: 'load', lw: 0.8 })
    const n = Math.max(2, Math.round((xb - xa) / 18))
    for (let k = 0; k <= n; k++) {
      const x = xa + ((xb - xa) * k) / n
      arrow(ops, x, ya + ((yb - ya) * k) / n + 1, x, base, { c: 'load', lw: 0.6, head: 3.2 })
    }
    ops.push({ t: 'text', x: xa + 2, y: Math.min(ya, yb) - 3, s: `q_{${i + 1}} = ${d.w1 === d.w2 ? fx(d.w1, 2) : `${fx(d.w1, 2)}→${fx(d.w2, 2)}`} kN/m`, size: 7, c: 'load', bold: true })
  })
  r.inpPt!.forEach((p, i) => {
    const x = X(p.a)
    if (p.P >= 0) {
      // di atas semua jalur beban merata (label tidak bertabrakan dengan label q)
      const top = yBeam - 6 - lanes * (band + 4) - 20
      arrow(ops, x, top, x, yBeam - 2, { c: 'load', lw: 1.6, head: 5 })
      ops.push({ t: 'text', x, y: top - 4, s: `P_{${i + 1}} = ${fx(p.P, 1)} kN`, size: 7, c: 'load', bold: true, align: 'c' })
    } else {
      arrow(ops, x, yBeam + 34, x, yBeam + 3, { c: 'load', lw: 1.6, head: 5 })
      ops.push({ t: 'text', x: x + 4, y: yBeam + 34, s: `P_{${i + 1}} = ${fx(p.P, 1)} kN`, size: 7, c: 'load', bold: true })
    }
  })
  ops.push({ t: 'line', x1: X(0), y1: yBeam, x2: X(r.Ltot!), y2: yBeam, lw: 3, c: 'ink' })
  for (const [xs, lab, roller] of [[r.xA!, 'A', false], [r.xB!, 'B', true]] as const) {
    const x = X(xs)
    ops.push({ t: 'poly', pts: [[x, yBeam + 2], [x - 7, yBeam + 13], [x + 7, yBeam + 13]], fill: true, c: 'support', op: 0.25 })
    ops.push({ t: 'poly', pts: [[x, yBeam + 2], [x - 7, yBeam + 13], [x + 7, yBeam + 13]], close: true, c: 'support', lw: 1 })
    if (roller) {
      ops.push({ t: 'circle', cx: x - 3.5, cy: yBeam + 16, r: 2.4, c: 'support', lw: 0.8 })
      ops.push({ t: 'circle', cx: x + 3.5, cy: yBeam + 16, r: 2.4, c: 'support', lw: 0.8 })
    }
    ops.push({ t: 'line', x1: x - 10, y1: yBeam + (roller ? 19 : 13), x2: x + 10, y2: yBeam + (roller ? 19 : 13), lw: 1, c: 'support' })
    ops.push({ t: 'text', x, y: yBeam + 30, s: lab, size: 8, align: 'c', bold: true, c: 'ink' })
  }
  const yd = yBeam + 46
  if (r.cL! > 0) dimH(ops, X(0), X(r.xA!), yd, `${fx(r.cL, 2)} m`)
  dimH(ops, X(r.xA!), X(r.xB!), yd, `L = ${fx(r.L, 2)} m`)
  if (r.cR! > 0) dimH(ops, X(r.xB!), X(r.Ltot!), yd, `${fx(r.cR, 2)} m`)
  if (r.wself) ops.push({ t: 'text', x: X1, y: 12, s: `+ berat sendiri q_{sw} = ${fx(r.wself, 3)} kN/m`, size: 6.5, align: 'r', c: 'muted' })
  return { h: figRows(yd + 12), ops, alt: 'Model balok, tumpuan, dan beban', caption: `Gbr. 1 — Model balok ${r.prof!.name}: tumpuan A sendi, B rol; beban rencana.` }
}

/** Gbr. 2 — diagram geser, momen, lendutan (berwarna, terisi). */
function figDiagrams(r: SteelBeamResult): Figure {
  const ops: FigOp[] = []
  const plot = r.plot!
  const X = (x: number) => X0 + (x / r.Ltot!) * (X1 - X0)
  const bh = 64, gap = 18
  const band = (top: number, pts: [number, number][], ext: { x: number; v: number }, title: string, unit: string, c: 'v' | 'm' | 'y', down: boolean, dp: number) => {
    const maxAbs = Math.max(EPS, ...pts.map((p) => Math.abs(p[1])))
    const zero = top + bh / 2, k = (bh / 2 - 6) / maxAbs, sg = down ? 1 : -1
    const Yv = (v: number) => zero + sg * v * k
    for (const xs of [r.xA!, r.xB!]) ops.push({ t: 'line', x1: X(xs), y1: top, x2: X(xs), y2: top + bh, lw: 0.4, c: 'grid', dash: [2, 2] })
    const poly: [number, number][] = pts.map((p) => [X(p[0]), Yv(p[1])])
    ops.push({ t: 'poly', pts: [[X(pts[0][0]), zero], ...poly, [X(pts[pts.length - 1][0]), zero]], fill: true, c, op: 0.18 })
    ops.push({ t: 'line', x1: X(0), y1: zero, x2: X(r.Ltot!), y2: zero, lw: 0.6, c: 'muted' })
    ops.push({ t: 'poly', pts: poly, lw: 1.3, c })
    ops.push({ t: 'text', x: X0 - 4, y: top + 4, s: title, size: 7.5, bold: true, c })
    ops.push({ t: 'text', x: X1, y: top + 4, s: unit, size: 6.5, align: 'r', c: 'muted' })
    if (Math.abs(ext.v) > EPS) {
      const y = Yv(ext.v)
      ops.push({ t: 'circle', cx: X(ext.x), cy: y, r: 2, fill: true, c })
      ops.push({ t: 'text', x: X(ext.x), y: y + (sg * ext.v > 0 ? 10 : -4), s: fx(ext.v, dp), size: 7, align: 'c', bold: true, c: 'ink' })
    }
  }
  band(14, plot.Vpts.map((p) => [p[0] / 1000, p[1] / 1000]), { x: r.xVmax!, v: r.Vmax! }, 'Gaya geser V', 'kN', 'v', false, 2)
  band(14 + bh + gap, plot.xs.map((x, i) => [x / 1000, plot.M[i] / 1e6]), { x: r.xMmax!, v: r.Mmax! }, 'Momen lentur M', 'kN·m', 'm', true, 2)
  band(14 + 2 * (bh + gap), plot.xs.map((x, i) => [x / 1000, plot.y[i]]), { x: r.xYmax!, v: r.ymax! }, 'Lendutan δ', 'mm', 'y', true, 2)
  const yAxis = 14 + 3 * bh + 2 * gap + 8
  ops.push({ t: 'line', x1: X(0), y1: yAxis, x2: X(r.Ltot!), y2: yAxis, lw: 0.6, c: 'muted' })
  const step = r.Ltot! <= 6 ? 1 : r.Ltot! <= 15 ? 2 : 5
  for (let v = 0; v <= r.Ltot! + 1e-9; v += step) {
    ops.push({ t: 'line', x1: X(v), y1: yAxis, x2: X(v), y2: yAxis + 3, lw: 0.6, c: 'muted' })
    ops.push({ t: 'text', x: X(v), y: yAxis + 11, s: String(+v.toFixed(2)), size: 6.5, align: 'c', c: 'muted' })
  }
  ops.push({ t: 'text', x: X1, y: yAxis + 21, s: 'x (m)', size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(yAxis + 24),
    ops,
    alt: 'Diagram gaya geser, momen lentur, dan lendutan',
    caption: 'Gbr. 2 — Diagram gaya geser (V), momen lentur (M, positif digambar di sisi tarik bawah), dan lendutan (δ, ke bawah positif).',
  }
}

/* ---------------- laporan ---------------- */

export function beamReport(input: BeamInput, r: SteelBeamResult): Report {
  const prof = r.prof!
  const ti = typeInfo(input.ptype)
  const Sx = prof.Sx as number
  const loads = loadItems(r)
  const sumW = loads.reduce((t, l) => t + l.W, 0)
  const sumMA = loads.reduce((t, l) => t + l.W * (l.x - r.xA!), 0)
  const terms = momentTerms(r, r.xMmax!)
  const ratio = Number.isFinite(r.ratio) ? r.ratio! : null
  const dAllow240 = (r.L! * 1000) / 240, dAllow360 = (r.L! * 1000) / 360
  const cant = r.cL! > 0 || r.cR! > 0

  const sections: Section[] = [
    {
      title: 'Data penampang & material',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Profil', `${ti ? ti.name : input.ptype} ${prof.name}`),
            kv('Momen inersia I_{x}', `${fx(prof.Ix, 0)} cm^{4}`),
            kv('Modulus penampang elastis S_{x}', `${fx(Sx, 1)} cm^{3}`),
            kv('Berat profil', `${fx(prof.w, 1)} kg/m`),
            kv('Modulus elastisitas E', `${fx(r.E, 0)} MPa`),
          ],
        },
        {
          k: 'calc',
          steps: [{ desc: 'Kekakuan lentur balok', lhs: 'EI', expr: 'E · I_{x}', subst: `${fx(r.E, 0)} × ${fx(prof.Ix, 0)}×10^{4}`, value: sci(r.EI!), unit: 'N·mm^{2}' }],
        },
      ],
    },
    {
      title: 'Geometri & beban',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Bentang antar tumpuan L', `${fx(r.L, 2)} m`),
            ...(cant ? [kv('Kantilever kiri / kanan', `${fx(r.cL, 2)} / ${fx(r.cR, 2)} m`), kv('Panjang total balok', `${fx(r.Ltot, 2)} m`)] : []),
            kv('Posisi tumpuan A (sendi) / B (rol) dari ujung kiri', `${fx(r.xA, 2)} / ${fx(r.xB, 2)} m`),
          ],
        },
        ...(r.wself
          ? [{ k: 'calc' as const, steps: [{ desc: 'Berat sendiri profil sebagai beban merata sepanjang balok', lhs: 'q_{sw}', expr: '\\frac{m · g}{1000}', subst: `\\frac{${fx(prof.w, 1)} × 9.81}{1000}`, value: fx(r.wself, 3), unit: 'kN/m' }] }]
          : []),
        { k: 'figure', fig: figModel(r) },
        { k: 'h', text: 'Resultan beban' },
        {
          k: 'p',
          text: 'Beban merata/trapesium w_{1} → w_{2} pada a_{1}…a_{2} diganti resultannya: W = \\frac{w_{1} + w_{2}}{2}(a_{2} − a_{1}), bekerja di x = a_{1} + \\frac{(a_{2} − a_{1})(w_{1} + 2w_{2})}{3(w_{1} + w_{2})} dari ujung kiri.',
        },
        {
          k: 'table',
          head: ['Beban', 'Jenis', 'Intensitas', 'Letak (m)', 'W (kN)', 'x (m)'],
          align: ['l', 'l', 'r', 'r', 'r', 'r'],
          rows: [
            ...loads.map((l) => [l.name, l.kind, l.desc, l.span, fx(l.W, 2), fx(l.x, 3)]),
            ['ΣW', '', '', '', fx(sumW, 2), ''],
          ],
        },
      ],
    },
    {
      title: 'Reaksi tumpuan',
      blocks: [
        { k: 'p', text: 'Balok statis tertentu (sendi–rol). Momen terhadap tumpuan A dan keseimbangan gaya vertikal (beban ke bawah positif):' },
        {
          k: 'table',
          head: ['Beban', 'W (kN)', 'x − x_{A} (m)', 'W·(x − x_{A}) (kN·m)'],
          rows: [...loads.map((l) => [l.name, fx(l.W, 2), fx(l.x - r.xA!, 3), fx(l.W * (l.x - r.xA!), 2)]), ['Σ', fx(sumW, 2), '', fx(sumMA, 2)]],
        },
        {
          k: 'calc',
          steps: [
            { desc: 'ΣM_{A} = 0', lhs: 'R_{B}', expr: '\\frac{Σ W_{i}(x_{i} − x_{A})}{L}', subst: `\\frac{${fx(sumMA, 2)}}{${fx(r.L, 2)}}`, value: fx(r.RB, 2), unit: 'kN' },
            { desc: 'ΣV = 0', lhs: 'R_{A}', expr: 'ΣW − R_{B}', subst: `${fx(sumW, 2)} − ${fx(r.RB, 2)}`, value: fx(r.RA, 2), unit: 'kN' },
          ],
        },
      ],
    },
    {
      title: 'Gaya dalam',
      blocks: [
        {
          k: 'p',
          text: 'Gaya geser dan momen di potongan x dihitung dari gaya-gaya di kiri potongan: V(x) = ΣR − ΣP − ΣW_{kiri}, M(x) = ΣR(x − x_{R}) − ΣP(x − a) − ΣW_{kiri}(x − x̄_{kiri}). Momen sagging (serat bawah tarik) positif. Diagram lengkap pada Gbr. 2.',
        },
        { k: 'figure', fig: figDiagrams(r) },
        { k: 'h', text: `Momen maksimum (x = ${fx(r.xMmax, 2)} m)` },
        {
          k: 'p',
          text: 'Momen maksimum dicari pada titik V(x) = 0, posisi beban terpusat, dan tumpuan. Kontribusi tiap gaya di kiri potongan:',
        },
        {
          k: 'table',
          head: ['Gaya', 'F (kN)', 'Lengan (m)', 'M (kN·m)'],
          rows: [...terms.map((t) => [t.name, fx(t.F, 2), fx(t.arm, 3), fx(t.M, 2)]), ['M_{maks}', '', '', fx(r.Mmax, 2)]],
        },
        {
          k: 'calc',
          steps: [
            {
              lhs: 'M_{maks}',
              expr: 'Σ F · lengan',
              subst: terms.map((t) => `(${fx(t.M, 2)})`).join(' + '),
              value: fx(r.Mmax, 2),
              unit: `kN·m${r.Mmax! < 0 ? ' (hogging)' : ''}`,
            },
          ],
        },
        { k: 'h', text: 'Gaya geser maksimum' },
        { k: 'rows', rows: [kv(`|V|_{maks} di x = ${fx(r.xVmax, 2)} m`, `${fx(Math.abs(r.Vmax!), 2)} kN`)] },
      ],
    },
    {
      title: 'Lendutan',
      strong: true,
      blocks: [
        {
          k: 'p',
          text: 'Kurva elastis EI·y″ = −M(x) diintegrasikan dua kali secara numerik (aturan trapesium, 400 segmen sepanjang balok) dengan syarat batas y = 0 di tumpuan A dan B.',
        },
        { k: 'rows', rows: [kv(`δ_{maks} di x = ${fx(r.xYmax, 2)} m`, `${fx(r.ymax, 2)} mm ${r.ymax! < 0 ? '(ke atas)' : '(ke bawah)'}`)] },
        {
          k: 'calc',
          steps: [
            ...(ratio ? [{ lhs: 'L/δ', expr: '\\frac{L}{δ_{maks}}', subst: `\\frac{${fx(r.L! * 1000, 0)}}{${fx(Math.abs(r.ymax!), 2)}}`, value: fx(ratio, 0) }] : []),
            { desc: 'Batas lendutan total (atap / umum)', lhs: 'δ_{izin}', expr: '\\frac{L}{240}', subst: `\\frac{${fx(r.L! * 1000, 0)}}{240}`, value: fx(dAllow240, 2), unit: 'mm' },
            { desc: 'Batas lendutan akibat beban hidup (lantai)', lhs: 'δ_{izin}', expr: '\\frac{L}{360}', subst: `\\frac{${fx(r.L! * 1000, 0)}}{360}`, value: fx(dAllow360, 2), unit: 'mm' },
          ] as CalcStep[],
        },
        {
          k: 'rows',
          rows: [
            check('δ_{maks} / (L/240)', Math.abs(r.ymax!) / dAllow240),
            check('δ_{maks} / (L/360)', Math.abs(r.ymax!) / dAllow360),
          ],
        },
        {
          k: 'p',
          text: 'Batas L/360 berlaku untuk lendutan akibat beban hidup saja; di sini dibandingkan dengan lendutan total (konservatif). Pisahkan beban hidup bila perlu meninjau batas ini secara tepat.',
        },
      ],
    },
    ...(r.fb != null
      ? [
          {
            title: 'Tegangan lentur elastis',
            blocks: [
              {
                k: 'calc' as const,
                steps: [{ lhs: 'f_{b}', expr: '\\frac{|M_{maks}|}{S_{x}}', subst: `\\frac{${fx(Math.abs(r.Mmax!), 2)}×10^{6}}{${fx(Sx, 1)}×10^{3}}`, value: fx(r.fb, 1), unit: 'MPa' }],
              },
              {
                k: 'p' as const,
                text: 'f_{b} adalah tegangan lentur elastis, belum termasuk tekuk torsi-lateral (LTB) maupun klasifikasi penampang. Cek kapasitas φM_{n} memakai tool Balok Baja (Lentur).',
              },
            ],
          },
        ]
      : []),
  ]

  return {
    title: 'Analisis Balok Baja Sederhana',
    summary: [
      kv('Reaksi R_{A} / R_{B}', `${fx(r.RA, 2)} / ${fx(r.RB, 2)} kN`),
      kv(`Momen maksimum M_{maks} (x = ${fx(r.xMmax, 2)} m)`, `${fx(r.Mmax, 2)} kN·m`),
      kv(`Gaya geser maksimum |V|_{maks} (x = ${fx(r.xVmax, 2)} m)`, `${fx(Math.abs(r.Vmax!), 2)} kN`),
      kv(`Lendutan maksimum δ_{maks} (x = ${fx(r.xYmax, 2)} m)`, `${fx(r.ymax, 2)} mm${ratio ? ` (L/${fx(ratio, 0)})` : ''}`),
      ...(r.fb != null ? [kv('Tegangan lentur elastis f_{b}', `${fx(r.fb, 1)} MPa`)] : []),
    ],
    sections,
    warnings: r.warn,
    scope: [
      'Konvensi: beban & lendutan ke bawah positif, momen sagging positif; posisi diukur dari ujung kiri balok.',
      'Alat bantu analisis statika — bukan cek kapasitas penampang. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid / tanpa beban). */
export function buildBeamReport(i: BeamInput): Report | null {
  const o = computeBeam(i)
  return o && o.r.valid ? beamReport(o.input, o.r) : null
}

export default {
  defaults: BEAM_DEFAULTS,
  build: (i: BeamInput) => buildBeamReport(i) ?? { title: 'Analisis Balok Baja', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
