import { BEARING_METHODS, methodName, shapeName, type BearingMethod, type MethodResult } from '../../calc/bearing-capacity'
import { GAMMA_W } from '../../calc/shared/geotech'
import { dimH, dimV, figRows } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { BEARING_DEFAULTS, computeBearingUI, type BearingOk, type BearingUIInput } from './model'

// Laporan Daya Dukung Tanah fondasi dangkal: data, tegangan overburden (koreksi MAT), faktor tiga metode,
// rincian metode utama (rumus → substitusi → hasil), q izin dan rasio D/C.

export { BEARING_DEFAULTS }

/** Gbr. 1 — potongan fondasi (kiri) + batang q izin tiga metode (kanan). */
function figBearing(r: BearingOk): Figure {
  const ops: FigOp[] = []
  const gx0 = 30, gx1 = 250, yg = 30, cxF = 140
  const depthExt = Math.max(r.Df + r.B, r.Dw > 0 && r.Dw < 50 ? r.Dw + 0.3 : 0, 1)
  const s = Math.min(120 / depthExt, 130 / Math.max(r.B * 1.7, 1))
  const Bs = r.B * s, yBase = yg + r.Df * s
  ops.push({ t: 'line', x1: gx0, y1: yg, x2: gx1, y2: yg, lw: 1, c: 'muted' })
  ops.push({ t: 'rect', x: gx0, y: yg, w: gx1 - gx0, h: yBase - yg + 28, fill: true, c: 'muted', op: 0.08 })
  const tF = Math.max(10, Bs * 0.18)
  ops.push({ t: 'rect', x: cxF - Bs / 2, y: yBase - tF, w: Bs, h: tF, fill: true, c: 'support', op: 0.2 })
  ops.push({ t: 'rect', x: cxF - Bs / 2, y: yBase - tF, w: Bs, h: tF, lw: 1.1, c: 'support' })
  const yc = Math.min(yg - 8, yBase - tF - 22)
  ops.push({ t: 'rect', x: cxF - Bs * 0.12, y: yc, w: Bs * 0.24, h: yBase - tF - yc, fill: true, c: 'ink', op: 0.3 })
  ops.push({ t: 'rect', x: cxF - Bs * 0.12, y: yc, w: Bs * 0.24, h: yBase - tF - yc, lw: 0.8, c: 'ink' })
  dimH(ops, cxF - Bs / 2, cxF + Bs / 2, yBase + 16, `B = ${fx(r.B, 2)} m`)
  if (r.Df > 0) {
    dimV(ops, yg, yBase, gx1 + 14, '')
    ops.push({ t: 'text', x: gx1 + 20, y: (yg + yBase) / 2 + 2.5, s: `Df = ${fx(r.Df, 2)}`, size: 6.5 })
  }
  if (r.Dw > 0 && r.Dw < depthExt) {
    const yw = yg + r.Dw * s
    ops.push({ t: 'line', x1: gx0, y1: yw, x2: gx1, y2: yw, lw: 0.7, c: 'accent', dash: [5, 3] })
    ops.push({ t: 'text', x: gx0 + 4, y: yw - 3, s: `MAT Dw = ${fx(r.Dw, 2)}`, size: 6.5, c: 'accent' })
  }
  ops.push({ t: 'text', x: gx0 + 2, y: yBase + 36, s: `γ = ${fx(r.gamma, 1)} kN/m³, c = ${fx(r.c, 1)} kPa, φ = ${fx(r.phiDeg, 1)}°`, size: 6.5, c: 'muted' })

  const bx0 = 342, bw = 130, by = 40
  const rows: [string, number, 'v' | 'm' | 'y'][] = [
    ['Terzaghi', r.methods.terzaghi.qall, 'v'],
    ['Meyerhof', r.methods.meyerhof.qall, 'm'],
    ['Vesic', r.methods.vesic.qall, 'y'],
  ]
  const maxV = Math.max(...rows.map((x) => x[1]), r.qApp || 0) * 1.1
  rows.forEach(([name, v, c], i) => {
    const y = by + i * 22
    ops.push({ t: 'text', x: bx0 - 6, y: y + 9, s: name, size: 6.5, align: 'r' })
    ops.push({ t: 'rect', x: bx0, y, w: (v / maxV) * bw, h: 12, fill: true, c, op: 0.4 })
    ops.push({ t: 'rect', x: bx0, y, w: (v / maxV) * bw, h: 12, lw: 0.6, c })
    ops.push({ t: 'text', x: bx0 + (v / maxV) * bw + 4, y: y + 9, s: fx(v, 0), size: 6.5 })
  })
  ops.push({ t: 'text', x: bx0 + bw / 2, y: by - 10, s: `q izin (kPa), FS = ${fx(r.FS, 1)}`, size: 6.5, align: 'c', c: 'muted' })
  if (r.qApp > 0 && r.qApp < maxV) {
    const xq = bx0 + (r.qApp / maxV) * bw
    ops.push({ t: 'line', x1: xq, y1: by - 4, x2: xq, y2: by + 66, lw: 1.2, c: r.dc! > 1 ? 'bad' : 'load', dash: [3, 2] })
    ops.push({ t: 'text', x: xq, y: by + 76, s: `q kerja = ${fx(r.qApp, 0)}`, size: 6.5, align: 'c', c: r.dc! > 1 ? 'bad' : 'load' })
  }
  const bottom = Math.max(yBase + 44, by + 84)
  return {
    h: figRows(bottom),
    ops,
    alt: 'Potongan fondasi dangkal dan batang q izin tiga metode',
    caption: `Gbr. 1 — Fondasi ${shapeName(r.shape).toLowerCase()} B = ${fx(r.B, 2)} m, D_{f} = ${fx(r.Df, 2)} m; q izin tiga metode.`,
  }
}

/** Langkah hitung tiga suku persamaan daya dukung metode utama. */
function termSteps(r: BearingOk, m: MethodResult): CalcStep[] {
  const { B } = r
  const g = r.gBase
  if (m.method === 'terzaghi') {
    const kc = m.sc, kg = m.sg * 0.5
    return [
      { desc: 'Suku kohesi', lhs: 'q_{1}', expr: 'k_{c} c N_{c}', subst: `${fx(kc, 2)} × ${fx(m.c, 2)} × ${fx(m.Nc, 2)}`, value: fx(m.t1, 1), unit: 'kPa' },
      { desc: 'Suku overburden', lhs: 'q_{2}', expr: 'q N_{q}', subst: `${fx(r.q, 2)} × ${fx(m.Nq, 2)}`, value: fx(m.t2, 1), unit: 'kPa' },
      { desc: 'Suku berat tanah', lhs: 'q_{3}', expr: 'k_{γ} γ B N_{γ}', subst: `${fx(kg, 2)} × ${fx(g, 2)} × ${fx(B, 2)} × ${fx(m.Ng, 2)}`, value: fx(m.t3, 1), unit: 'kPa' },
    ]
  }
  return [
    { desc: 'Suku kohesi', lhs: 'q_{1}', expr: 'c N_{c} s_{c} d_{c}', subst: `${fx(m.c, 2)} × ${fx(m.Nc, 2)} × ${fx(m.sc, 3)} × ${fx(m.dc, 3)}`, value: fx(m.t1, 1), unit: 'kPa' },
    { desc: 'Suku overburden', lhs: 'q_{2}', expr: 'q N_{q} s_{q} d_{q}', subst: `${fx(r.q, 2)} × ${fx(m.Nq, 2)} × ${fx(m.sq, 3)} × ${fx(m.dq, 3)}`, value: fx(m.t2, 1), unit: 'kPa' },
    { desc: 'Suku berat tanah', lhs: 'q_{3}', expr: '½ γ B N_{γ} s_{γ} d_{γ}', subst: `0.5 × ${fx(g, 2)} × ${fx(B, 2)} × ${fx(m.Ng, 2)} × ${fx(m.sg, 3)} × ${fx(m.dg, 3)}`, value: fx(m.t3, 1), unit: 'kPa' },
  ]
}

const FACTOR_NOTE: Record<BearingMethod, string> = {
  terzaghi: 'Terzaghi (1943): N_{q} bentuk tertutup, N_{γ} tabel keruntuhan umum (interpolasi log-linear), koefisien bentuk k_{c}, k_{γ}; tanpa faktor kedalaman.',
  meyerhof: 'Meyerhof (1963): N_{q} Prandtl, N_{γ} = (N_{q} − 1) tan 1,4φ; faktor bentuk & kedalaman Meyerhof (s_{q}, d_{q} hanya φ ≥ 10°).',
  vesic: 'Vesic (1973): N_{q} Prandtl, N_{γ} = 2(N_{q} + 1) tanφ; faktor bentuk Vesic, kedalaman Hansen.',
}

export function bearingReport(r: BearingOk): Report {
  const pm = r.pm
  const data: Section = {
    title: 'Data',
    blocks: [
      {
        k: 'rows',
        rows: [
          kv('Bentuk fondasi', shapeName(r.shape)),
          kv(r.shape === 'circular' ? 'Diameter B' : 'B (lebar / sisi)', `${fx(r.B, 2)} m`),
          ...(r.shape === 'rect' ? [kv('L (panjang)', `${fx(r.L, 2)} m`)] : []),
          kv('D_{f} (kedalaman dasar)', `${fx(r.Df, 2)} m`),
          kv('c / φ', `${fx(r.c, 1)} kPa / ${fx(r.phiDeg, 1)}°`),
          kv('γ / γ_{sat}', `${fx(r.gamma, 1)} / ${fx(r.gsat, 1)} kN/m³`),
          kv('D_{w} (muka air tanah)', r.Dw >= 50 ? 'tidak ada' : `${fx(r.Dw, 2)} m`),
          kv('Metode utama / keruntuhan', `${methodName(r.primary)} / ${r.local && r.primary === 'terzaghi' ? 'lokal' : 'umum'}`),
          kv('FS', fx(r.FS, 1)),
          ...(r.qApp > 0 ? [kv('q kerja', `${fx(r.qApp, 1)} kPa`)] : []),
        ],
      },
    ],
  }

  const water: Section = {
    title: 'Tegangan overburden & muka air tanah',
    blocks: [
      { k: 'p', text: r.wc },
      {
        k: 'calc',
        steps: [
          { lhs: "γ'", expr: `γ_{sat} − γ_{w}`, subst: `${fx(r.gsat, 1)} − ${fx(GAMMA_W, 2)}`, value: fx(r.gsub, 2), unit: 'kN/m³' },
          { desc: 'Overburden efektif di dasar fondasi', lhs: 'q', value: fx(r.q, 2), unit: 'kPa' },
          { desc: 'Berat isi efektif untuk suku N_{γ}', lhs: 'γ_{ef}', value: fx(r.gBase, 2), unit: 'kN/m³' },
          ...(r.shape === 'strip' ? [] : [{ lhs: 'B/L', value: fx(r.bl, 3) } satisfies CalcStep]),
        ],
      },
    ],
  }

  const factors: Section = {
    title: 'Faktor daya dukung — perbandingan tiga metode',
    blocks: [
      {
        k: 'table',
        head: ['Metode', 'N_{c}', 'N_{q}', 'N_{γ}', 'q_{u} (kPa)', 'q izin (kPa)'],
        align: ['l', 'r', 'r', 'r', 'r', 'r'],
        rows: BEARING_METHODS.map(([k, name]) => {
          const m = r.methods[k]
          return [name + (k === r.primary ? ' ◂' : ''), fx(m.Nc, 2), fx(m.Nq, 2), fx(m.Ng, 2), fx(m.qu, 0), fx(m.qall, 0)]
        }),
      },
      { k: 'figure', fig: figBearing(r) },
    ],
  }

  const detail: Section = {
    title: `Rincian — ${methodName(r.primary)}`,
    blocks: [
      { k: 'p', text: FACTOR_NOTE[r.primary] },
      ...(pm.local ? [{ k: 'p' as const, text: `Keruntuhan lokal: c* = ⅔c = ${fx(pm.c, 2)} kPa; φ* = atan(⅔ tanφ) = ${fx(pm.phiDeg, 2)}°.` }] : []),
      { k: 'calc', steps: termSteps(r, pm) },
      {
        k: 'calc',
        steps: [
          { lhs: 'q_{u}', expr: 'q_{1} + q_{2} + q_{3}', subst: `${fx(pm.t1, 1)} + ${fx(pm.t2, 1)} + ${fx(pm.t3, 1)}`, value: fx(pm.qu, 1), unit: 'kPa' },
          { lhs: 'q_{u,net}', expr: 'q_{u} − q', subst: `${fx(pm.qu, 1)} − ${fx(r.q, 1)}`, value: fx(pm.qnet, 1), unit: 'kPa' },
          { lhs: 'q_{izin}', expr: '\\frac{q_{u}}{FS}', subst: `\\frac{${fx(pm.qu, 1)}}{${fx(r.FS, 1)}}`, value: fx(pm.qall, 1), unit: 'kPa' },
          { lhs: 'q_{izin,net}', expr: '\\frac{q_{u,net}}{FS}', value: fx(pm.qallNet, 1), unit: 'kPa' },
        ],
      },
      ...(r.dc !== null ? [{ k: 'rows' as const, rows: [check('q kerja / q izin', r.dc)] }] : []),
    ],
  }

  return {
    title: 'Daya Dukung Tanah — Fondasi Dangkal',
    summary: [
      kv(`q_{u} — ${methodName(r.primary)}`, `${fx(pm.qu, 1)} kPa`),
      kv('q izin = q_{u} / FS', `${fx(pm.qall, 1)} kPa`),
      kv('q_{u,net}', `${fx(pm.qnet, 1)} kPa`),
      ...(r.dc !== null ? [kv('q kerja / q izin', fx(r.dc, 2))] : []),
    ],
    sections: [data, water, factors, detail],
    governing: r.dc !== null ? { label: 'q kerja / q izin', ratio: r.dc } : undefined,
    warnings: r.warn,
    scope: [
      'Persamaan umum q_{u} = c N_{c} s_{c} d_{c} + q N_{q} s_{q} d_{q} + ½ γ B N_{γ} s_{γ} d_{γ}; koreksi MAT metode Das (γ′ = γ_{sat} − 9,81).',
      'Belum termasuk: beban miring/eksentris, dasar/lereng miring, penurunan, tanah berlapis, fondasi dalam. Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildBearingReport(i: BearingUIInput): Report | null {
  const r = computeBearingUI(i)
  return r ? bearingReport(r) : null
}

export default {
  defaults: BEARING_DEFAULTS,
  build: (i: BearingUIInput) => buildBearingReport(i) ?? { title: 'Daya Dukung Tanah', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
