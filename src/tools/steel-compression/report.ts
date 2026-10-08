import { fcrFlexural, K_PRESETS, type SteelCompressionResult } from '../../calc/steel-compression'
import { E_STEEL } from '../../calc/shared/steel'
import { figRows } from '../../report/figure'
import { check, fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { profileRows } from '../_steel/profile'
import { sectionGeom, sectionOps } from '../_steel/section'
import { COMPRESSION_DEFAULTS, computeCompression, type CompressionInput } from './model'

// Laporan Batang Tekan Baja (SNI 1729:2020 Bab E, DFBK & ASD): kelangsingan, tekuk lentur (E3), tekuk torsi WF (E4),
// elemen langsing (Tabel B4.1a), kekuatan desain — dengan rumus dan substitusi, plus kurva kolom.

export { COMPRESSION_DEFAULTS }

/** Gbr. 1 — penampang dengan sumbu x-x (kuat) & y-y (lemah). */
function figSection(r: SteelCompressionResult): Figure {
  const ops: FigOp[] = []
  const p = r.p!
  const s = sectionOps(ops, sectionGeom(p)!, 170, 14, 180, 130)
  const cx = s.ox + s.W / 2, cy = s.oy + s.H / 2
  ops.push({ t: 'line', x1: s.ox - 22, y1: cy, x2: s.ox + s.W + 22, y2: cy, lw: 0.6, c: 'm', dash: [5, 2, 1, 2] })
  ops.push({ t: 'line', x1: cx, y1: s.oy - 12, x2: cx, y2: s.oy + s.H + 12, lw: 0.6, c: 'y', dash: [5, 2, 1, 2] })
  ops.push({ t: 'text', x: s.ox + s.W + 26, y: cy + 3, s: `x (r_{x} = ${fx(r.rx, 1)})`, size: 7, c: 'm' })
  ops.push({ t: 'text', x: cx + 4, y: s.oy - 4, s: `y (r_{y} = ${fx(r.ry, 1)})`, size: 7, c: 'y' })
  return { h: figRows(s.oy + s.H + 18), ops, alt: 'Penampang dan sumbu tekuk', caption: `Gbr. 1 — Penampang ${p.name} dengan sumbu kuat x-x dan sumbu lemah y-y (jari-jari girasi dalam mm).` }
}

/** Gbr. 2 — kurva kolom φcFcr terhadap KL/r (E3), titik desain. */
function figCurve(r: SteelCompressionResult): Figure {
  const ops: FigOp[] = []
  const Fy = r.Fy!, x0 = 70, x1 = 470, y0 = 14, y1 = 150
  const lamMax = Math.max(250, Math.ceil((r.lam! * 1.1) / 50) * 50)
  const X = (l: number) => x0 + (l / lamMax) * (x1 - x0)
  const Y = (f: number) => y1 - (f / Fy) * (y1 - y0)
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    ops.push({ t: 'line', x1: x0, y1: Y(f * Fy), x2: x1, y2: Y(f * Fy), lw: 0.3, c: 'grid' })
    ops.push({ t: 'text', x: x0 - 4, y: Y(f * Fy) + 2.5, s: fx(f * Fy, 0), size: 6.5, align: 'r', c: 'muted' })
  }
  for (let l = 0; l <= lamMax; l += 50) ops.push({ t: 'text', x: X(l), y: y1 + 10, s: String(l), size: 6.5, align: 'c', c: 'muted' })
  const pts: [number, number][] = []
  for (let l = 1; l <= lamMax; l += 2) pts.push([X(l), Y(0.9 * fcrFlexural(l, Fy))])
  ops.push({ t: 'poly', pts, lw: 1.3, c: 'm' })
  const lt = r.lamLimit!
  ops.push({ t: 'line', x1: X(lt), y1: y0, x2: X(lt), y2: y1, lw: 0.6, c: 'muted', dash: [3, 2] })
  ops.push({ t: 'text', x: X(lt) + 3, y: y0 + 8, s: `4.71√(E/F_{y}) = ${fx(lt, 0)}`, size: 6.5, c: 'muted' })
  ops.push({ t: 'line', x1: X(200), y1: y0, x2: X(200), y2: y1, lw: 0.6, c: 'bad', dash: [3, 2] })
  ops.push({ t: 'text', x: X(200) + 3, y: y0 + 18, s: 'KL/r = 200', size: 6.5, c: 'bad' })
  // tekuk torsi menentukan: titik pada kelangsingan ekuivalen π√(E/Fe)
  const lamPt = Math.min(r.tors && r.govLS!.includes('torsi') ? r.tors.lamEq : r.lam!, lamMax)
  const yp = Y(0.9 * r.Fcr!)
  ops.push({ t: 'circle', cx: X(lamPt), cy: yp, r: 3, fill: true, c: 'load' })
  ops.push({ t: 'text', x: X(lamPt) + 6, y: yp - 5, s: `φ_{c}F_{cr} = ${fx(0.9 * r.Fcr!, 1)} MPa`, size: 7, bold: true, c: 'ink' })
  ops.push({ t: 'line', x1: x0, y1: y1, x2: x1, y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y1 + 21, s: 'KL/r', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: x0 - 4, y: y0 - 4, s: 'MPa', size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(y1 + 26),
    ops,
    alt: 'Kurva kolom tekuk lentur',
    caption: `Gbr. 2 — Kurva kolom φ_{c}F_{cr} (E3, F_{y} = ${fx(Fy, 0)} MPa) dan titik desain${r.tors && r.govLS!.includes('torsi') ? ' (tekuk torsi, pada kelangsingan ekuivalen π√(E/F_{e}))' : ''}.`,
  }
}

export function compressionReport(i: CompressionInput, r: SteelCompressionResult): Report {
  const p = r.p!
  const kLabel = i.Kpreset === '0' ? 'manual' : (K_PRESETS.find(([, k]) => String(k) === i.Kpreset)?.[0] ?? '').replace(/\s*\(K=.*\)$/, '').trim()
  const Fy = r.Fy!
  const inel = (Fe: number) => Fy / Fe <= 2.25
  const fcrStep = (Fe: number, Fcr: number): CalcStep =>
    inel(Fe)
      ? { desc: `F_{y}/F_{e} = ${fx(Fy / Fe, 3)} ≤ 2,25 → tekuk inelastis`, lhs: 'F_{cr}', expr: '0.658^{F_{y}/F_{e}} · F_{y}', subst: `0.658^{${fx(Fy / Fe, 3)}} × ${fx(Fy, 0)}`, value: fx(Fcr, 1), unit: 'MPa', ref: 'E3-2' }
      : { desc: `F_{y}/F_{e} = ${fx(Fy / Fe, 3)} > 2,25 → tekuk elastis`, lhs: 'F_{cr}', expr: '0.877 · F_{e}', subst: `0.877 × ${fx(Fe, 1)}`, value: fx(Fcr, 1), unit: 'MPa', ref: 'E3-3' }

  const lamSteps: CalcStep[] = []
  if (r.Lx! > 0) lamSteps.push({ lhs: '\\frac{KL_{x}}{r_{x}}', subst: `\\frac{${fx(r.K, 2)} × ${fx(r.Lx, 0)}}{${fx(r.rx, 1)}}`, value: fx(r.lamX, 1) })
  if (r.Ly! > 0) lamSteps.push({ lhs: '\\frac{KL_{y}}{r_{y}}', subst: `\\frac{${fx(r.K, 2)} × ${fx(r.Ly, 0)}}{${fx(r.ry, 1)}}`, value: fx(r.lamY, 1) })
  lamSteps.push({ desc: `Menentukan: sumbu ${r.govAxis}`, lhs: '\\frac{KL}{r}', expr: 'maks', value: fx(r.lam, 1) })

  const sections: Section[] = [
    { title: 'Data profil & material', blocks: [{ k: 'rows', rows: [...profileRows(r.type!, p, Fy), kv('Modulus elastisitas E', `${fx(E_STEEL, 0)} MPa`)] }, { k: 'figure', fig: figSection(r) }] },
    {
      title: 'Panjang efektif & kelangsingan (E2)',
      blocks: [
        { k: 'rows', rows: [kv('Faktor panjang efektif K', `${fx(r.K, 2)} (${kLabel})`), kv('L_{x} / L_{y}', `${fx(r.Lx, 0)} / ${fx(r.Ly, 0)} mm`)] },
        { k: 'calc', steps: lamSteps },
        { k: 'rows', rows: [check('KL/r terhadap batas anjuran 200', r.lam! / 200)] },
      ],
    },
    {
      title: 'Tekuk lentur (E3)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Tegangan tekuk elastis', lhs: 'F_{e}', expr: '\\frac{π^{2}E}{(KL/r)^{2}}', subst: `\\frac{π^{2} × ${fx(E_STEEL, 0)}}{${fx(r.lam, 1)}^{2}}`, value: fx(r.FeFlex, 1), unit: 'MPa', ref: 'E3-4' },
            fcrStep(r.FeFlex!, r.FcrFlex!),
            { lhs: 'P_{n}', expr: 'F_{cr} · A_{g}', subst: `${fx(r.FcrFlex, 1)} × ${fx(r.Ag, 0)} / 10^{3}`, value: fx(r.PnFlex, 1), unit: 'kN', ref: 'E3-1' },
          ],
        },
      ],
    },
  ]

  const t = r.tors
  if (t)
    sections.push({
      title: 'Tekuk torsi — WF simetris ganda (E4)',
      blocks: [
        { k: 'p', text: `Panjang efektif torsi K_{z}L_{z} = ${fx(t.Kz, 2)} × ${fx(t.Lz, 0)} = ${fx(t.Lcz, 0)} mm. J dihitung dinding tipis tanpa fillet (konservatif).` },
        {
          k: 'calc',
          steps: [
            { lhs: 'C_{w}', expr: '\\frac{I_{y} h_{o}^{2}}{4}', subst: `\\frac{${fx(p.Iy, 1)}×10^{4} × ${fx(p.H! - p.tf!, 1)}^{2}}{4}`, value: sci(t.Cw), unit: 'mm^{6}' },
            { lhs: 'J', expr: '\\frac{2Bt_{f}^{3} + (H − 2t_{f})t_{w}^{3}}{3}', subst: `\\frac{2 × ${fx(p.B, 0)} × ${fx(p.tf, 1)}^{3} + ${fx(p.H! - 2 * p.tf!, 1)} × ${fx(p.tw, 1)}^{3}}{3}`, value: sci(t.J), unit: 'mm^{4}' },
            {
              lhs: 'F_{e}',
              expr: '\\frac{π^{2}EC_{w}/(K_{z}L_{z})^{2} + GJ}{I_{x} + I_{y}}',
              subst: `\\frac{π^{2} × ${fx(E_STEEL, 0)} × ${sci(t.Cw)}/${fx(t.Lcz, 0)}^{2} + ${fx(t.G, 0)} × ${sci(t.J)}}{(${fx(p.Ix, 0)} + ${fx(p.Iy, 0)})×10^{4}}`,
              value: fx(t.Fe, 1),
              unit: 'MPa',
              ref: 'E4-2',
            },
            fcrStep(t.Fe, t.Fcr),
            { lhs: 'P_{n}', expr: 'F_{cr} · A_{g}', subst: `${fx(t.Fcr, 1)} × ${fx(r.Ag, 0)} / 10^{3}`, value: fx(t.Pn, 1), unit: 'kN' },
          ],
        },
      ],
    })

  const lc = r.local!
  if (lc.items.length)
    sections.push({
      title: 'Kelangsingan elemen (Tabel B4.1a)',
      blocks: [
        {
          k: 'table',
          head: ['Elemen', 'λ', 'λ_{r}', 'Status'],
          align: ['l', 'r', 'r', 'l'],
          rows: lc.items.map((it) => [it.el, fx(it.lam, 1), fx(it.lamr, 1), it.slender ? 'Langsing' : 'Nonlangsing']),
        },
        { k: 'p', text: lc.slender ? 'Ada elemen langsing — reduksi E7 belum diterapkan; kekuatan di bawah berpotensi terlalu besar.' : 'Semua elemen nonlangsing — E7 tidak berlaku.' },
      ],
    })

  const dcRows: Row[] = [
    ...(r.dcL != null ? [check('D/C DFBK = P_{u} / φ_{c}P_{n}', r.dcL)] : []),
    ...(r.dcA != null ? [check('D/C ASD = P_{a} / (P_{n}/Ω_{c})', r.dcA)] : []),
  ]
  sections.push({
    title: 'Kekuatan tekan desain',
    strong: true,
    blocks: [
      {
        k: 'calc',
        steps: [
          ...(t ? [{ desc: `Menentukan: ${r.govLS}`, lhs: 'P_{n}', expr: 'min(lentur; torsi)', subst: `min(${fx(r.PnFlex, 1)}; ${fx(t.Pn, 1)})`, value: fx(r.Pn, 1), unit: 'kN' }] : []),
          { desc: 'DFBK, φ_{c} = 0,90', lhs: 'φ_{c}P_{n}', subst: `0.90 × ${fx(r.Pn, 1)}`, value: fx(r.phiPn, 1), unit: 'kN' },
          { desc: 'ASD, Ω_{c} = 1,67', lhs: '\\frac{P_{n}}{Ω_{c}}', subst: `\\frac{${fx(r.Pn, 1)}}{1.67}`, value: fx(r.Pa, 1), unit: 'kN' },
          ...(r.dcL != null ? [{ lhs: 'D/C_{DFBK}', expr: '\\frac{P_{u}}{φ_{c}P_{n}}', subst: `\\frac{${fx(r.Pu, 1)}}{${fx(r.phiPn, 1)}}`, value: fx(r.dcL, 3) }] : []),
          ...(r.dcA != null ? [{ lhs: 'D/C_{ASD}', expr: '\\frac{P_{a}}{P_{n}/Ω_{c}}', subst: `\\frac{${fx(r.Pa_dem, 1)}}{${fx(r.Pa, 1)}}`, value: fx(r.dcA, 3) }] : []),
        ],
      },
      ...(dcRows.length ? [{ k: 'rows' as const, rows: dcRows }] : [{ k: 'p' as const, text: 'Gaya perlu P_{u} / P_{a} belum diisi — hanya kapasitas yang dilaporkan.' }]),
      { k: 'figure', fig: figCurve(r) },
    ],
  })

  const gov = r.dcL != null ? { label: 'D/C DFBK menentukan', ratio: r.dcL } : r.dcA != null ? { label: 'D/C ASD menentukan', ratio: r.dcA } : undefined
  return {
    title: 'Batang Tekan Baja (SNI 1729:2020 Bab E)',
    summary: [
      kv(`Kekuatan tekan desain φ_{c}P_{n} (${r.govLS})`, `${fx(r.phiPn, 1)} kN`),
      kv('Kekuatan tekan izin P_{n}/Ω_{c}', `${fx(r.Pa, 1)} kN`),
      kv(`Kelangsingan KL/r (${r.govAxis})`, `${fx(r.lam, 1)} — ${r.mode}`),
      ...dcRows,
    ],
    sections,
    ...(gov ? { governing: gov } : {}),
    warnings: r.warn,
    scope: [
      'Gaya tekan aksial konsentris. Tekuk lentur E3 semua profil; tekuk torsi E4 hanya WF simetris ganda.',
      'Belum termasuk: tekuk lentur-torsi profil tak simetris (UNP, siku, CNP — E4/E5), reduksi elemen langsing (E7), interaksi aksial-lentur (Bab H). Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildCompressionReport(i: CompressionInput): Report | null {
  const r = computeCompression(i)
  return r ? compressionReport(i, r) : null
}

export default {
  defaults: COMPRESSION_DEFAULTS,
  build: (i: CompressionInput) => buildCompressionReport(i) ?? { title: 'Batang Tekan Baja', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
