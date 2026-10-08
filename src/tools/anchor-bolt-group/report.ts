import type { AnchorBoltGroupResult } from '../../calc/anchor-bolt-group'
import { arrow, dimH, figRows } from '../../report/figure'
import { check, fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { ANCHOR_DEFAULTS, computeAnchor, type AnchorInput } from './model'

// Laporan Anchor Bolt Group (ACI 318-19 Bab 17 / SNI 2847:2019 Ps. 17): gaya baut elastis, baja tarik, breakout tarik
// grup, baja geser, breakout geser, pryout, interaksi tarik–geser — dengan rumus dan substitusi.

export { ANCHOR_DEFAULTS }

/** Geometri denah (mm): tepi beton di sekeliling baut terluar. */
export function planExtent(r: AnchorBoltGroupResult) {
  const Wx = (r.nx - 1) * r.sx, Wy = (r.ny - 1) * r.sy
  const edge = r.ca > 0 ? r.ca : Math.max(1.5 * r.hef, 150)
  return { Wx, Wy, edge, W: Wx + 2 * edge, H: Wy + 2 * edge }
}

/** Gbr. 1 — denah grup baut, gaya tarik tiap baut, tepi beton, arah geser. */
function figPlan(r: AnchorBoltGroupResult): Figure {
  const ops: FigOp[] = []
  const g = planExtent(r)
  const sc = Math.min(260 / g.W, 170 / g.H)
  const x0 = 140, y0 = 16, W = g.W * sc, H = g.H * sc
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, fill: true, c: 'support', op: 0.08 })
  ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, lw: r.ca > 0 ? 1.1 : 0.6, c: 'support', dash: r.ca > 0 ? undefined : [4, 3] })
  const cx = x0 + W / 2, cy = y0 + H / 2
  const Tmax = Math.max(1e-9, ...r.bolts.map((b) => Math.abs(b.T)))
  for (const b of r.bolts) {
    const bx = cx + b.x * sc, by = cy - b.y * sc
    const rad = Math.max(3, (r.da * sc) / 2 + 1)
    ops.push({ t: 'circle', cx: bx, cy: by, r: rad, fill: true, c: b.T > 0 ? 'bad' : 'muted', op: 0.25 + 0.6 * (Math.abs(b.T) / Tmax) })
    ops.push({ t: 'circle', cx: bx, cy: by, r: rad, lw: 0.8, c: 'ink' })
    ops.push({ t: 'text', x: bx, y: by - rad - 3, s: fx(b.T, 1), size: 6.5, align: 'c', c: b.T > 0 ? 'bad' : 'muted', bold: true })
  }
  if (r.ca > 0) dimH(ops, x0, cx - (g.Wx / 2) * sc, y0 + H + 12, `c_{a} = ${fx(r.ca, 0)}`)
  if (r.nx > 1) dimH(ops, cx - (g.Wx / 2) * sc, cx - (g.Wx / 2) * sc + r.sx * sc, y0 + H + 12, `s_{x} = ${fx(r.sx, 0)}`)
  if (r.Vu > 0) {
    // di luar grup agar tidak menimpa angka gaya baut
    const rad = Math.max(3, (r.da * sc) / 2 + 1)
    const gx = cx + (g.Wx / 2) * sc + rad + 8, gy = cy - (g.Wy / 2) * sc - rad - 14
    if (r.shearDir === 'x') arrow(ops, gx, cy, gx + 40, cy, { c: 'load', lw: 1.8, head: 6 })
    else arrow(ops, cx, gy, cx, gy - 34, { c: 'load', lw: 1.8, head: 6 })
    ops.push({ t: 'text', x: r.shearDir === 'x' ? gx : cx + 6, y: r.shearDir === 'x' ? cy + 12 : gy - 24, s: `V_{u} = ${fx(r.Vu, 0)} kN`, size: 7, c: 'load', bold: true })
  }
  ops.push({ t: 'text', x: x0 + W + 8, y: y0 + 10, s: 'X →', size: 7, c: 'muted' })
  ops.push({ t: 'text', x: x0 - 6, y: y0 + 8, s: r.ca > 0 ? 'tepi beton' : 'tanpa tepi dekat', size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(y0 + H + 22),
    ops,
    alt: 'Denah grup angkur dan gaya tarik tiap baut',
    caption: `Gbr. 1 — Denah grup ${r.nx} × ${r.ny} angkur Ø${fx(r.da, 0)}; angka = gaya tarik baut T_{i} (kN, merah = tarik). Ukuran dalam mm.`,
  }
}

/** Gbr. 2 — diagram interaksi tarik–geser (17.8): (N)^{5/3} + (V)^{5/3} = 1, batas 0,2 dan titik desain. */
function figInteraction(r: AnchorBoltGroupResult): Figure {
  const ops: FigOp[] = []
  const x0 = 170, y0 = 14, S = 150
  const top = Math.max(1.2, Math.min(2, Math.max(r.UV, r.UN) * 1.1))
  const X = (v: number) => x0 + (v / top) * S, Y = (n: number) => y0 + S - (n / top) * S
  for (const k of [0, 0.2, 0.5, 1]) {
    if (k > top) continue
    ops.push({ t: 'line', x1: X(0), y1: Y(k), x2: X(top), y2: Y(k), lw: 0.3, c: 'grid' })
    ops.push({ t: 'line', x1: X(k), y1: Y(0), x2: X(k), y2: Y(top), lw: 0.3, c: 'grid' })
    ops.push({ t: 'text', x: X(0) - 4, y: Y(k) + 2.5, s: fx(k, 1), size: 6.5, align: 'r', c: 'muted' })
    ops.push({ t: 'text', x: X(k), y: Y(0) + 10, s: fx(k, 1), size: 6.5, align: 'c', c: 'muted' })
  }
  const curve: [number, number][] = []
  for (let k = 0; k <= 40; k++) {
    const v = k / 40
    curve.push([X(v), Y(Math.pow(Math.max(0, 1 - Math.pow(v, 5 / 3)), 3 / 5))])
  }
  ops.push({ t: 'poly', pts: curve, lw: 1.3, c: 'm' })
  ops.push({ t: 'line', x1: X(0), y1: Y(0), x2: X(top), y2: Y(0), lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: X(0), y1: Y(0), x2: X(0), y2: Y(top), lw: 0.6, c: 'muted' })
  const ok = r.dcGov <= 1
  ops.push({ t: 'circle', cx: X(Math.min(r.UV, top)), cy: Y(Math.min(r.UN, top)), r: 3.2, fill: true, c: ok ? 'load' : 'bad' })
  ops.push({ t: 'text', x: X(Math.min(r.UV, top)) + 6, y: Y(Math.min(r.UN, top)) - 4, s: `(${fx(r.UV, 2)}; ${fx(r.UN, 2)})`, size: 7, bold: true })
  ops.push({ t: 'text', x: X(top), y: Y(0) + 21, s: 'V_{ua}/φV_{n}', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: X(0) - 4, y: Y(top) - 4, s: 'N_{ua}/φN_{n}', size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(Y(0) + 26),
    ops,
    alt: 'Diagram interaksi tarik dan geser',
    caption: 'Gbr. 2 — Interaksi tarik–geser (17.8): kurva (N_{ua}/φN_{n})^{5/3} + (V_{ua}/φV_{n})^{5/3} = 1 dan titik desain.',
  }
}

const dcStep = (lhs: string, dem: string, cap: string, d: number, c: number, v: number): CalcStep => ({
  lhs,
  expr: `\\frac{${dem}}{${cap}}`,
  subst: `\\frac{${fx(d, 2)}}{${fx(c, 2)}}`,
  value: Number.isFinite(v) ? fx(v, 3) : '∞',
})

export function anchorReport(r: AnchorBoltGroupResult): Report {
  const phiC = fx(r.phiC, 2)
  const hef = fx(r.hef, 0)
  const sections: Section[] = [
    {
      title: 'Data angkur & beton',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Pola angkur (arah X × arah Y)', `${r.nx} × ${r.ny} = ${r.n} baut, s_{x} / s_{y} = ${fx(r.sx, 0)} / ${fx(r.sy, 0)} mm`),
            kv('Diameter d_{a} / luas tarik efektif A_{se,N}', `${fx(r.da, 0)} mm / ${fx(r.Ase, 0)} mm^{2}`),
            kv('Kedalaman tanam h_{ef}', `${hef} mm (angkur cor di tempat)`),
            kv('Jarak tepi c_{a} / tebal beton h_{a}', `${r.ca > 0 ? fx(r.ca, 0) + ' mm' : 'tanpa tepi dekat'} / ${r.ha > 0 ? fx(r.ha, 0) + ' mm' : '-'}`),
            kv("f'_{c} / f_{uta}", `${fx(r.fc, 0)} / ${fx(r.futa, 0)} MPa`),
            kv('Kondisi beton / φ breakout', `${r.crack === 'cracked' ? 'retak' : 'tak retak'} / kondisi ${r.cond} (φ = ${phiC})`),
            kv('Beban terfaktor N_{u} / M_{x} / M_{y} / V_{u}', `${fx(r.Nu, 1)} kN / ${fx(r.Mx, 1)} / ${fx(r.My, 1)} kN·m / ${fx(r.Vu, 1)} kN (arah ${r.shearDir.toUpperCase()})`),
          ],
        },
      ],
    },
    {
      title: 'Gaya tarik tiap baut (pelat dasar kaku)',
      blocks: [
        { k: 'p', text: 'Distribusi elastis linear: T_{i} = \\frac{N_{u}}{n} + \\frac{M_{x} x_{i}}{Σx^{2}} + \\frac{M_{y} y_{i}}{Σy^{2}}; posisi terhadap titik berat grup, tarik positif.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'Σx^{2}', value: sci(r.Sxx), unit: 'mm^{2}' },
            { lhs: 'Σy^{2}', value: sci(r.Syy), unit: 'mm^{2}' },
          ],
        },
        {
          k: 'table',
          head: ['Baut', 'x (mm)', 'y (mm)', 'T_{i} (kN)'],
          align: ['l', 'r', 'r', 'r'],
          rows: [
            ...r.bolts.map((b, k) => [String(k + 1), fx(b.x, 0), fx(b.y, 0), fx(b.T, 2)]),
            ['T_{maks} / ΣT_{tarik}', '', '', `${fx(r.Tmax, 2)} / ${fx(r.sumTt, 2)}`],
          ],
        },
        { k: 'figure', fig: figPlan(r) },
      ],
    },
    {
      title: 'Kuat baja angkur tarik (17.6.1)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'N_{sa}', expr: 'A_{se,N} · f_{uta}', subst: `${fx(r.Ase, 0)} × ${fx(r.futa, 0)} / 10^{3}`, value: fx(r.Nsa, 2), unit: 'kN', ref: '17.6.1.2' },
            { desc: 'φ = 0,75 (baja daktail)', lhs: 'φN_{sa}', subst: `0.75 × ${fx(r.Nsa, 2)}`, value: fx(r.phiNsa, 2), unit: 'kN' },
            dcStep('D/C_{baja,N}', 'T_{maks}', 'φN_{sa}', r.Tmax, r.phiNsa, r.dcSteel),
          ],
        },
      ],
    },
    {
      title: 'Jebol beton akibat tarik — grup (17.6.2)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Kuat jebol satu angkur, k_{c} = 10 (cor di tempat), λ = 1', lhs: 'N_{b}', expr: "k_{c} λ √(f'_{c}) h_{ef}^{1.5}", subst: `10 × 1 × √(${fx(r.fc, 0)}) × ${hef}^{1.5} / 10^{3}`, value: fx(r.Nb, 2), unit: 'kN', ref: '17.6.2.2.1' },
            { lhs: 'A_{Nco}', expr: '9 h_{ef}^{2}', subst: `9 × ${hef}^{2}`, value: sci(r.ANco), unit: 'mm^{2}' },
            {
              desc: `Luas proyeksi grup, tepi efektif min(1,5h_{ef}; c_{a}) = ${fx(r.eff, 0)} mm, ≤ n·A_{Nco}`,
              lhs: 'A_{Nc}',
              expr: '(W_{x} + 2c)(W_{y} + 2c)',
              subst: `(${fx((r.nx - 1) * r.sx, 0)} + 2 × ${fx(r.eff, 0)}) × (${fx((r.ny - 1) * r.sy, 0)} + 2 × ${fx(r.eff, 0)})`,
              value: sci(r.ANc),
              unit: 'mm^{2}',
            },
            {
              desc: `Eksentrisitas resultan tarik e_{N,x} = ${fx(r.ex, 1)} mm, e_{N,y} = ${fx(r.ey, 1)} mm (faktor tiap arah dikalikan)`,
              lhs: 'ψ_{ec,N}',
              expr: '\\frac{1}{1 + e_{N}/(1.5h_{ef})}',
              value: fx(r.psiEc, 3),
              ref: '17.6.2.3.1',
            },
            {
              lhs: 'ψ_{ed,N}',
              expr: r.psiEd < 1 ? '0.7 + 0.3\\frac{c_{a,min}}{1.5h_{ef}}' : '1.0 (c_{a,min} ≥ 1,5h_{ef})',
              value: fx(r.psiEd, 3),
              ref: '17.6.2.4.1',
            },
            { lhs: 'ψ_{c,N} / ψ_{cp,N}', value: `${fx(r.psiC, 2)} / ${fx(r.psiCp, 2)}` },
            {
              lhs: 'N_{cbg}',
              expr: '\\frac{A_{Nc}}{A_{Nco}} ψ_{ec,N} ψ_{ed,N} ψ_{c,N} ψ_{cp,N} N_{b}',
              subst: `${fx(r.ratioA, 3)} × ${fx(r.psiEc, 3)} × ${fx(r.psiEd, 3)} × ${fx(r.psiC, 2)} × ${fx(r.psiCp, 2)} × ${fx(r.Nb, 2)}`,
              value: fx(r.Ncbg, 2),
              unit: 'kN',
              ref: '17.6.2.1b',
            },
            { lhs: 'φN_{cbg}', subst: `${phiC} × ${fx(r.Ncbg, 2)}`, value: fx(r.phiNcbg, 2), unit: 'kN' },
            dcStep('D/C_{jebol,N}', 'ΣT_{tarik}', 'φN_{cbg}', r.sumTt, r.phiNcbg, r.dcConc),
          ],
        },
      ],
    },
  ]

  if (r.Vu > 0) {
    const shear: CalcStep[] = [
      { desc: `Kuat baja geser per angkur${r.grout ? ', pelat di atas grout ×0,8' : ''}`, lhs: 'V_{sa}', expr: `0.6 A_{se,V} f_{uta}${r.grout ? ' × 0.8' : ''}`, subst: `0.6 × ${fx(r.Ase, 0)} × ${fx(r.futa, 0)}${r.grout ? ' × 0.8' : ''} / 10^{3}`, value: fx(r.Vsa, 2), unit: 'kN', ref: '17.7.1.2b' },
      { desc: 'φ = 0,65', lhs: 'φV_{sa}', subst: `0.65 × ${fx(r.Vsa, 2)}`, value: fx(r.phiVsa, 2), unit: 'kN' },
      { lhs: 'V_{u}/n', subst: `\\frac{${fx(r.Vu, 1)}}{${r.n}}`, value: fx(r.Vbolt, 2), unit: 'kN' },
      dcStep('D/C_{baja,V}', 'V_{u}/n', 'φV_{sa}', r.Vbolt, r.phiVsa, r.dcVsteel),
    ]
    sections.push({ title: 'Kuat baja angkur geser (17.7.1)', blocks: [{ k: 'calc', steps: shear }] })
    sections.push({
      title: 'Jebol beton akibat geser — grup (17.7.2)',
      blocks: r.breakoutApplic
        ? [
            { k: 'p', text: `Geser ke arah satu tepi, c_{a1} = c_{a} = ${fx(r.ca, 0)} mm, l_{e} = min(h_{ef}; 8d_{a}) = ${fx(r.le, 0)} mm.` },
            {
              k: 'calc',
              steps: [
                { lhs: 'V_{b}', expr: "min(0.66(\\frac{l_{e}}{d_{a}})^{0.2}√(d_{a})√(f'_{c})c_{a1}^{1.5}; 3.7√(f'_{c})c_{a1}^{1.5})", value: fx(r.Vb, 2), unit: 'kN', ref: '17.7.2.2.1' },
                { lhs: 'A_{Vco}', expr: '4.5 c_{a1}^{2}', subst: `4.5 × ${fx(r.ca, 0)}^{2}`, value: sci(r.AVco), unit: 'mm^{2}' },
                { lhs: 'A_{Vc}', expr: '(W_{⊥} + 3c_{a1}) · min(1.5c_{a1}; h_{a})', value: sci(r.AVc), unit: 'mm^{2}' },
                { lhs: 'ψ_{ed,V} / ψ_{c,V} / ψ_{h,V}', value: `${fx(r.psiEdV, 3)} / ${fx(r.psiCV, 2)} / ${fx(r.psiHV, 3)}` },
                {
                  lhs: 'V_{cbg}',
                  expr: '\\frac{A_{Vc}}{A_{Vco}} ψ_{ec,V} ψ_{ed,V} ψ_{c,V} ψ_{h,V} V_{b}',
                  subst: `${fx(r.ratioAV, 3)} × 1.0 × ${fx(r.psiEdV, 3)} × ${fx(r.psiCV, 2)} × ${fx(r.psiHV, 3)} × ${fx(r.Vb, 2)}`,
                  value: fx(r.Vcbg, 2),
                  unit: 'kN',
                  ref: '17.7.2.1b',
                },
                { lhs: 'φV_{cbg}', subst: `${phiC} × ${fx(r.Vcbg, 2)}`, value: fx(r.phiVcbg, 2), unit: 'kN' },
                dcStep('D/C_{jebol,V}', 'V_{u}', 'φV_{cbg}', r.Vu, r.phiVcbg, r.dcVbreak),
              ],
            },
          ]
        : [{ k: 'p', text: 'Jarak tepi tidak diisi (c_{a} = 0, tepi dianggap jauh) — jebol beton akibat geser tidak ditinjau.' }],
    })
    sections.push({
      title: 'Cungkil beton / pryout (17.7.3)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: `k_{cp} = ${r.kcp} (h_{ef} ${r.hef < 65 ? '<' : '≥'} 65 mm); N_{cpg} = N_{cbg} dengan ψ_{ec,N} = 1`, lhs: 'N_{cpg}', value: fx(r.Ncbg0, 2), unit: 'kN' },
            { lhs: 'V_{cpg}', expr: 'k_{cp} N_{cpg}', subst: `${r.kcp} × ${fx(r.Ncbg0, 2)}`, value: fx(r.Vcpg, 2), unit: 'kN', ref: '17.7.3.1b' },
            { lhs: 'φV_{cpg}', subst: `${phiC} × ${fx(r.Vcpg, 2)}`, value: fx(r.phiVcpg, 2), unit: 'kN' },
            dcStep('D/C_{pryout}', 'V_{u}', 'φV_{cpg}', r.Vu, r.phiVcpg, r.dcVpry),
          ],
        },
      ],
    })
  }

  const rows: Row[] = [check('Tarik — baja (17.6.1)', r.dcSteel), check('Tarik — jebol beton (17.6.2)', r.dcConc)]
  if (r.Vu > 0) {
    rows.push(check('Geser — baja (17.7.1)', r.dcVsteel))
    if (r.breakoutApplic) rows.push(check('Geser — jebol beton (17.7.2)', r.dcVbreak))
    rows.push(check('Geser — pryout (17.7.3)', r.dcVpry))
  }
  const inter: CalcStep[] = [
    { lhs: '\\frac{N_{ua}}{φN_{n}}', expr: 'maks D/C tarik', value: fx(r.UN, 3) },
    ...(r.Vu > 0 ? [{ lhs: '\\frac{V_{ua}}{φV_{n}}', expr: 'maks D/C geser', value: fx(r.UV, 3) }] : []),
    ...(r.combined != null
      ? [{ desc: 'Keduanya > 0,2 → interaksi', lhs: 'Σ', expr: '(\\frac{N_{ua}}{φN_{n}})^{5/3} + (\\frac{V_{ua}}{φV_{n}})^{5/3}', subst: `${fx(r.UN, 3)}^{5/3} + ${fx(r.UV, 3)}^{5/3}`, value: fx(r.combined, 3), ref: '17.8.3' }]
      : []),
  ]
  sections.push({
    title: 'Rekapitulasi & interaksi tarik–geser (17.8)',
    strong: true,
    blocks: [
      { k: 'rows', rows },
      { k: 'calc', steps: inter },
      {
        k: 'p',
        text:
          r.combined != null
            ? 'Rasio tarik dan geser sama-sama > 0,2 — interaksi 5/3 ditinjau.'
            : r.Vu > 0 && r.sumTt > 0
              ? `Interaksi tidak diperlukan: ${r.interactMode} (17.8.1/17.8.2).`
              : 'Hanya satu jenis gaya bekerja — interaksi tidak berlaku.',
      },
      ...(r.combined != null ? [{ k: 'rows' as const, rows: [check('Interaksi tarik–geser', r.combined)] }] : []),
      ...(r.sumTt > 0 && r.Vu > 0 ? [{ k: 'figure' as const, fig: figInteraction(r) }] : []),
    ],
  })

  return {
    title: 'Grup Angkur Cor di Tempat (ACI 318-19 Bab 17 / SNI 2847:2019 Ps. 17)',
    summary: [
      kv('Gaya tarik baut maksimum T_{maks} / total ΣT', `${fx(r.Tmax, 2)} / ${fx(r.sumTt, 2)} kN`),
      kv('φN_{sa} / φN_{cbg}', `${fx(r.phiNsa, 1)} / ${fx(r.phiNcbg, 1)} kN`),
      ...(r.Vu > 0 ? [kv(`Geser menentukan: ${r.govShear}`, `D/C ${fx(r.dcShear, 2)}`)] : []),
      check(`Menentukan: ${r.gov}`, r.govDC),
    ],
    sections,
    governing: { label: `D/C menentukan (${r.gov})`, ratio: r.govDC },
    warnings: r.warn,
    scope: [
      'Angkur cor di tempat berkepala, pelat dasar kaku (distribusi elastis linear), geser dibagi rata dan bekerja ke arah satu tepi; beton normal (λ = 1).',
      'Belum termasuk: cabut (pullout) & side-face blowout, angkur pasca-pasang, tulangan angkur, tumpu pelat dasar, eksentrisitas geser. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildAnchorReport(i: AnchorInput): Report | null {
  const r = computeAnchor(i)
  return r ? anchorReport(r) : null
}

export default {
  defaults: ANCHOR_DEFAULTS,
  build: (i: AnchorInput) => buildAnchorReport(i) ?? { title: 'Anchor Bolt Group', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
