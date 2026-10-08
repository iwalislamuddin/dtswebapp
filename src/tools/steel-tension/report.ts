import { U_PRESETS, type SteelTensionResult } from '../../calc/steel-tension'
import { tGov } from '../../calc/shared/steel-profiles'
import { capacityFigure } from '../../report/figure'
import { check, fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { profileRows } from '../_steel/profile'
import { sectionGeom, sectionOps } from '../_steel/section'
import { computeTension, TENSION_DEFAULTS, type TensionInput } from './model'

// Laporan Batang Tarik Baja (SNI 1729:2020 Bab D, DFBK & ASD): luas bruto/neto/efektif, leleh bruto, fraktur neto,
// kekuatan desain, kelangsingan — dengan rumus dan substitusi.

export { TENSION_DEFAULTS }

/** Gbr. 1 — penampang profil (lubang baut ditandai di elemen tersambung). */
function figSection(r: SteelTensionResult): Figure {
  const ops: FigOp[] = []
  const p = r.p!
  const g = sectionGeom(p)!
  const s = sectionOps(ops, g, 150, 8, 220, 140)
  ops.push({ t: 'text', x: s.ox + s.W / 2, y: s.oy + s.H + 14, s: p.shape === 'pipe' ? `D = ${fx(p.D, 1)}` : p.shape === 'L' ? `a = ${fx(p.a, 0)}` : `B = ${fx(p.B, 0)}`, size: 7, align: 'c' })
  if (p.shape !== 'pipe' && p.shape !== 'L') ops.push({ t: 'text', x: s.ox + s.W + 8, y: s.oy + s.H / 2 + 3, s: `H = ${fx(p.H, 0)}`, size: 7 })
  if (r.conn === 'bolt' && r.nHole! > 0) {
    ops.push({ t: 'text', x: s.ox - 10, y: s.oy + 10, s: `${r.nHole} lubang Ø${fx(r.dh, 0)}`, size: 7, align: 'r', c: 'bad', bold: true })
    ops.push({ t: 'text', x: s.ox - 10, y: s.oy + 21, s: `pada tebal t = ${fx(r.tHole, 1)} mm`, size: 6.5, align: 'r', c: 'muted' })
  }
  return {
    h: Math.ceil((s.oy + s.H + 22) / 11.5),
    ops,
    alt: 'Penampang profil batang tarik',
    caption: `Gbr. 1 — Penampang ${p.name}${r.conn === 'bolt' && r.nHole! > 0 ? `; luas neto dikurangi ${r.nHole} lubang baut` : r.conn === 'weld' ? '; sambungan las (tanpa lubang)' : ''}. Ukuran dalam mm.`,
  }
}

export function tensionReport(i: TensionInput, r: SteelTensionResult): Report {
  const p = r.p!
  const bolt = r.conn === 'bolt' && r.nHole! > 0
  const uLabel = i.Upreset === '0' ? 'manual' : (U_PRESETS.find(([, u]) => String(u) === i.Upreset)?.[0] ?? '').replace(/\s*\(U=.*\)$/, '')
  const tAuto = !(parseFloat(i.tHole) > 0)

  const areaSteps: CalcStep[] = [{ desc: 'Luas bruto (library profil)', lhs: 'A_{g}', expr: 'A · 100', subst: `${fx(p.A, 2)} × 100`, value: fx(r.Ag, 0), unit: 'mm^{2}' }]
  if (bolt)
    areaSteps.push(
      { desc: 'Diameter lubang = diameter baut + kelonggaran', lhs: 'd_{h}', expr: 'd_{b} + Δ', subst: `${fx(r.db, 1)} + ${fx(r.hole, 1)}`, value: fx(r.dh, 1), unit: 'mm' },
      {
        desc: `Luas neto, n = ${r.nHole} lubang pada tebal t = ${fx(r.tHole, 1)} mm${tAuto ? ` (otomatis: ${fx(tGov(r.type!, p), 1)} mm dari library)` : ''}`,
        lhs: 'A_{n}',
        expr: 'A_{g} − n · d_{h} · t',
        subst: `${fx(r.Ag, 0)} − ${r.nHole} × ${fx(r.dh, 1)} × ${fx(r.tHole, 1)}`,
        value: fx(r.An, 0),
        unit: 'mm^{2}',
        ref: 'B4.3b',
      },
    )
  areaSteps.push({ desc: `Faktor shear lag U = ${fx(r.U, 2)} (${uLabel}, Tabel D3.1)`, lhs: 'A_{e}', expr: 'U · A_{n}', subst: `${fx(r.U, 2)} × ${fx(r.An, 0)}`, value: fx(r.Ae, 0), unit: 'mm^{2}', ref: 'D3-1' })

  const sections: Section[] = [
    { title: 'Data profil & material', blocks: [{ k: 'rows', rows: profileRows(r.type!, p, r.Fy!, r.Fu) }, { k: 'figure', fig: figSection(r) }] },
    {
      title: 'Luas penampang',
      blocks: [
        ...(bolt ? [] : [{ k: 'p' as const, text: r.conn === 'weld' ? 'Sambungan las — tidak ada lubang: A_{n} = A_{g}.' : 'Tanpa lubang di penampang kritis: A_{n} = A_{g}.' }]),
        { k: 'calc', steps: areaSteps },
      ],
    },
    {
      title: 'Leleh tarik penampang bruto (D2a)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'P_{n}', expr: 'F_{y} · A_{g}', subst: `${fx(r.Fy, 0)} × ${fx(r.Ag, 0)} / 10^{3}`, value: fx(r.PnY, 1), unit: 'kN', ref: 'D2-1' },
            { desc: 'DFBK, φ_{t} = 0,90', lhs: 'φ_{t}P_{n}', subst: `0.90 × ${fx(r.PnY, 1)}`, value: fx(r.phiPnY, 1), unit: 'kN' },
            { desc: 'ASD, Ω_{t} = 1,67', lhs: '\\frac{P_{n}}{Ω_{t}}', subst: `\\frac{${fx(r.PnY, 1)}}{1.67}`, value: fx(r.PaY, 1), unit: 'kN' },
          ],
        },
      ],
    },
    {
      title: 'Fraktur tarik penampang neto efektif (D2b)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'P_{n}', expr: 'F_{u} · A_{e}', subst: `${fx(r.Fu, 0)} × ${fx(r.Ae, 0)} / 10^{3}`, value: fx(r.PnR, 1), unit: 'kN', ref: 'D2-2' },
            { desc: 'DFBK, φ_{t} = 0,75', lhs: 'φ_{t}P_{n}', subst: `0.75 × ${fx(r.PnR, 1)}`, value: fx(r.phiPnR, 1), unit: 'kN' },
            { desc: 'ASD, Ω_{t} = 2,00', lhs: '\\frac{P_{n}}{Ω_{t}}', subst: `\\frac{${fx(r.PnR, 1)}}{2.00}`, value: fx(r.PaR, 1), unit: 'kN' },
          ],
        },
      ],
    },
  ]

  const dcRows: Row[] = [
    ...(r.dcL != null ? [check('D/C DFBK = P_{u} / φ_{t}P_{n}', r.dcL)] : []),
    ...(r.dcA != null ? [check('D/C ASD = P_{a} / (P_{n}/Ω_{t})', r.dcA)] : []),
  ]
  sections.push({
    title: 'Kekuatan tarik desain',
    strong: true,
    blocks: [
      {
        k: 'calc',
        steps: [
          { desc: `DFBK — menentukan: ${r.govLRFD}`, lhs: 'φ_{t}P_{n}', expr: 'min(leleh; fraktur)', subst: `min(${fx(r.phiPnY, 1)}; ${fx(r.phiPnR, 1)})`, value: fx(r.phiPn, 1), unit: 'kN' },
          { desc: `ASD — menentukan: ${r.govASD}`, lhs: '\\frac{P_{n}}{Ω_{t}}', expr: 'min(leleh; fraktur)', subst: `min(${fx(r.PaY, 1)}; ${fx(r.PaR, 1)})`, value: fx(r.Pa, 1), unit: 'kN' },
          ...(r.dcL != null ? [{ lhs: 'D/C_{DFBK}', expr: '\\frac{P_{u}}{φ_{t}P_{n}}', subst: `\\frac{${fx(r.Pu, 1)}}{${fx(r.phiPn, 1)}}`, value: fx(r.dcL, 3) }] : []),
          ...(r.dcA != null ? [{ lhs: 'D/C_{ASD}', expr: '\\frac{P_{a}}{P_{n}/Ω_{t}}', subst: `\\frac{${fx(r.Pa_dem, 1)}}{${fx(r.Pa, 1)}}`, value: fx(r.dcA, 3) }] : []),
        ],
      },
      ...(dcRows.length ? [{ k: 'rows' as const, rows: dcRows }] : [{ k: 'p' as const, text: 'Gaya perlu P_{u} / P_{a} belum diisi — hanya kapasitas yang dilaporkan.' }]),
      {
        k: 'figure',
        fig: capacityFigure(
          [
            { label: 'Leleh bruto φ_{t}P_{n}', cap: r.phiPnY!, c: 'v' },
            { label: 'Fraktur neto φ_{t}P_{n}', cap: r.phiPnR!, c: 'm' },
          ],
          r.Pu!,
          { unit: 'kN', demLabel: `P_{u} = ${fx(r.Pu, 1)} kN`, caption: 'Gbr. 2 — Kekuatan tarik rencana DFBK tiap keadaan batas (batang) dan gaya perlu P_{u} (garis).', alt: 'Kekuatan tarik rencana' },
        ),
      },
    ],
  })

  sections.push({
    title: 'Kelangsingan (D1)',
    blocks:
      r.slender != null
        ? [
            {
              k: 'calc',
              steps: [{ lhs: '\\frac{L}{r_{min}}', subst: `\\frac{${fx(r.L, 0)}}{${fx(r.rmin, 1)}}`, value: fx(r.slender, 0) }],
            },
            { k: 'rows', rows: [check('L/r terhadap batas anjuran 300', r.slender / 300)] },
          ]
        : [
            {
              k: 'p',
              text:
                r.L! > 0
                  ? 'Jari-jari girasi minimum profil ini belum tersedia di library — cek kelangsingan dilewati.'
                  : 'Panjang batang L tidak diisi — cek kelangsingan dilewati.',
            },
          ],
  })

  const summary: Row[] = [
    kv(`Kekuatan tarik desain φ_{t}P_{n} (${r.govLRFD})`, `${fx(r.phiPn, 1)} kN`),
    kv(`Kekuatan tarik izin P_{n}/Ω_{t} (${r.govASD})`, `${fx(r.Pa, 1)} kN`),
    ...dcRows,
    ...(r.slender != null ? [kv('Kelangsingan L/r', `${fx(r.slender, 0)} (anjuran ≤ 300)`)] : []),
  ]
  const gov = r.dcL != null ? { label: 'D/C DFBK menentukan', ratio: r.dcL } : r.dcA != null ? { label: 'D/C ASD menentukan', ratio: r.dcA } : undefined

  return {
    title: 'Batang Tarik Baja (SNI 1729:2020 Bab D)',
    summary,
    sections,
    ...(gov ? { governing: gov } : {}),
    warnings: r.warn,
    scope: [
      'Gaya tarik aksial konsentris. Luas neto memakai lubang sebaris (tanpa koreksi zig-zag s²/4g); U dari Tabel D3.1 (preset) atau isian.',
      'Belum termasuk: blok geser (J4.3), batas A_{n} ≤ 0,85A_{g} pelat sambung, desain sambungan. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildTensionReport(i: TensionInput): Report | null {
  const r = computeTension(i)
  return r ? tensionReport(i, r) : null
}

export default {
  defaults: TENSION_DEFAULTS,
  build: (i: TensionInput) => buildTensionReport(i) ?? { title: 'Batang Tarik Baja', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
