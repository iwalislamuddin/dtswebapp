import type { MemberSection } from '../../calc/portal-frame'
import type { FrameMember } from '../../calc/shared/frame2d'
import { formatNumber } from '../../calc/shared/format'
import { check, fx, kv, sci, type Block, type CalcStep, type Row, type Section } from '../../report/model'
import { frameFigure, type FrameDim } from './figure'
import type { FrameView } from './geom'

// Bagian laporan bersama rangka bidang (Analisis Portal & Portal Gable): penampang, metode kekakuan, reaksi &
// kesetimbangan, gaya dalam per batang, tegangan elastis informatif, deformasi.

/** Baris & langkah hitung satu penampang batang. */
export function sectionBlocks(name: string, s: MemberSection, selfOn: boolean): Block[] {
  const rows: Row[] = [kv(name, s.label)]
  const steps: CalcStep[] = []
  if (s.mat === 'beton') {
    steps.push(
      { desc: `${name}: modulus elastisitas beton`, lhs: 'E_{c}', expr: "4700√(f'_{c})", subst: `4700√(${fx(s.fc, 1)})`, value: fx(s.E, 0), unit: 'MPa', ref: 'SNI 2847 19.2.2' },
      { lhs: 'A', expr: 'b · h', subst: `${fx(s.b, 0)} × ${fx(s.h, 0)}`, value: fx(s.A, 0), unit: 'mm^{2}' },
      { lhs: 'I_{g}', expr: '\\frac{b h^{3}}{12}', subst: `\\frac{${fx(s.b, 0)} × ${fx(s.h, 0)}^{3}}{12}`, value: sci(s.I), unit: 'mm^{4}' },
      { lhs: 'S', expr: '\\frac{b h^{2}}{6}', subst: `\\frac{${fx(s.b, 0)} × ${fx(s.h, 0)}^{2}}{6}`, value: sci(s.S), unit: 'mm^{3}' },
    )
    if (selfOn) steps.push({ desc: 'Berat sendiri (γ_{c} = 24 kN/m³)', lhs: 'w_{bs}', expr: 'A · γ_{c}', subst: `${fx(s.A, 0)}×10^{-6} × 24`, value: fx(s.wLine, 3), unit: 'kN/m' })
  } else {
    const p = s.prof!
    rows.push(
      kv('  A / I_{x} / S_{x}', `${formatNumber(p.A, 2)} cm^{2} / ${formatNumber(p.Ix, 0)} cm^{4} / ${formatNumber(p.Sx, 1)} cm^{3}`),
      kv('  E / F_{y} (informasi)', `${fx(s.E, 0)} / ${fx(s.Fy, 0)} MPa`),
    )
    if (selfOn) steps.push({ desc: `${name}: berat sendiri profil`, lhs: 'w_{bs}', expr: '\\frac{m · g}{1000}', subst: `\\frac{${fx(p.w, 1)} × 9.81}{1000}`, value: fx(s.wLine, 3), unit: 'kN/m' })
  }
  return [{ k: 'rows', rows }, ...(steps.length ? [{ k: 'calc' as const, steps }] : [])]
}

/** Tabel kekakuan batang (suku matriks kekakuan lokal). */
export function stiffnessTable(v: FrameView): Block {
  return {
    k: 'table',
    head: ['Batang', 'L (m)', 'EA/L (kN/mm)', '12EI/L^{3} (kN/mm)', '4EI/L (kN·m/rad)', 'c_{x} / c_{y}'],
    align: ['l', 'r', 'r', 'r', 'r', 'r'],
    rows: v.elems.map((e, k) => {
      const L = e.L as number, EA = e.EA as number, EI = e.EI as number
      return [v.names[k], fx(L / 1000, 3), fx(EA / L / 1000, 1), fx((12 * EI) / L ** 3 / 1000, 3), fx((4 * EI) / L / 1e6, 0), `${fx(e.cx, 3)} / ${fx(e.cy, 3)}`]
    }),
    caption: 'Suku kekakuan lokal batang; k_{global} = T^{T} k_{lokal} T dengan c_{x}, c_{y} = kosinus arah.',
  }
}

export const methodText = (nNodes: number, fixed: boolean): Block[] => [
  {
    k: 'p',
    text: `Metode kekakuan langsung rangka bidang: ${nNodes} simpul × 3 DOF (u, v, θ), elemen aksial + lentur Euler–Bernoulli. Tiap batang: {f} = [k]{d} + {f_{F}}, dengan {f_{F}} gaya ujung terjepit akibat beban bentang. Matriks global dirakit, DOF tumpuan dikekang (${fixed ? 'jepit: u = v = θ = 0' : 'sendi: u = v = 0'}), lalu [K]{D} = {F} − {F_{F}} diselesaikan (eliminasi Gauss–Jordan).`,
  },
]

/** Langkah hitung gaya ujung terjepit beban merata (balok/rafter). */
export function fefSteps(name: string, w: number, Lm: number): CalcStep[] {
  return [
    { desc: `${name}: gaya ujung terjepit beban merata tegak lurus batang`, lhs: 'M_{F}', expr: '\\frac{w L^{2}}{12}', subst: `\\frac{${fx(w, 3)} × ${fx(Lm, 3)}^{2}}{12}`, value: fx((w * Lm * Lm) / 12, 2), unit: 'kN·m' },
    { lhs: 'V_{F}', expr: '\\frac{w L}{2}', subst: `\\frac{${fx(w, 3)} × ${fx(Lm, 3)}}{2}`, value: fx((w * Lm) / 2, 2), unit: 'kN' },
  ]
}

export function reactionSection(v: FrameView, o: { Wgrav: number; sumRy: number; sumRx: number; Hsum: number; wTerms: string; wSubst: string }): Section {
  const [RA, RB] = v.reactions
  return {
    title: 'Reaksi tumpuan & kesetimbangan',
    blocks: [
      {
        k: 'table',
        head: ['Tumpuan', 'R_{x} (kN)', 'R_{y} (kN)', ...(v.fixed ? ['M (kN·m)'] : [])],
        align: ['l', 'r', 'r', 'r'],
        rows: [
          ['A — kaki kolom kiri', fx(RA.Rx, 2), fx(RA.Ry, 2), ...(v.fixed ? [fx(RA.M, 2)] : [])],
          ['B — kaki kolom kanan', fx(RB.Rx, 2), fx(RB.Ry, 2), ...(v.fixed ? [fx(RB.M, 2)] : [])],
        ],
        caption: 'R_{x} + ke kanan, R_{y} + ke atas, M + berlawanan jarum jam.',
      },
      { k: 'figure', fig: frameFigure(v, 'R', 'Gbr. 2 — Reaksi tumpuan.') },
      {
        k: 'calc',
        steps: [
          { desc: 'Total beban gravitasi', lhs: 'ΣW', expr: o.wTerms, subst: o.wSubst, value: fx(o.Wgrav, 2), unit: 'kN' },
          { desc: 'ΣV = 0', lhs: 'R_{Ay} + R_{By}', subst: `${fx(RA.Ry, 2)} + ${fx(RB.Ry, 2)}`, value: fx(o.sumRy, 2), unit: 'kN (= ΣW)' },
          { desc: 'ΣH = 0', lhs: '−(R_{Ax} + R_{Bx})', subst: `−(${fx(RA.Rx, 2)} + ${fx(RB.Rx, 2)})`, value: fx(-o.sumRx, 2), unit: `kN (= H_{1} + H_{2} = ${fx(o.Hsum, 2)})` },
        ],
      },
    ],
  }
}

const endVals = (e: FrameMember) => {
  const M = e.Ms as number[], V = e.Vs as number[], N = e.Ns as number[], n = M.length - 1
  return { Mi: M[0] / 1e6, Mj: M[n] / 1e6, Vi: V[0] / 1e3, Vj: V[n] / 1e3, Ni: N[0] / 1e3, Nj: N[n] / 1e3 }
}

export function forceSection(v: FrameView, gMax: { M: number; V: number; N: number }): Section {
  const stress: CalcStep[] = []
  v.elems.forEach((e, k) => {
    if (e.fb == null) return
    const S = e.sec.S, A = e.sec.A
    stress.push(
      { desc: v.names[k], lhs: 'σ_{b}', expr: '\\frac{|M|_{maks}}{S}', subst: `\\frac{${fx(Math.abs(e.Mmax!), 2)}×10^{6}}{${sci(S)}}`, value: fx(e.fb, 1), unit: 'MPa' },
      { lhs: 'σ_{a}', expr: '\\frac{|N|_{maks}}{A}', subst: `\\frac{${fx(Math.abs(e.Nmax!), 2)}×10^{3}}{${fx(A, 0)}}`, value: fx(e.fa, 1), unit: 'MPa' },
    )
  })
  return {
    title: 'Gaya dalam',
    blocks: [
      {
        k: 'p',
        text: 'Gaya dalam sepanjang batang dipulihkan dari gaya ujung {f} dan beban bentang (48 pias per batang + titik di kiri/kanan beban terpusat). Konvensi: momen sagging (+) digambar di sisi serat tarik, aksial tarik (+), geser + searah sumbu y lokal. Ujung i = kaki kolom / ujung kiri balok.',
      },
      { k: 'figure', fig: frameFigure(v, 'M', 'Gbr. 3 — Diagram momen lentur M (kN·m), di sisi serat tarik.') },
      { k: 'figure', fig: frameFigure(v, 'V', 'Gbr. 4 — Diagram gaya geser V (kN).') },
      { k: 'figure', fig: frameFigure(v, 'N', 'Gbr. 5 — Diagram gaya aksial N (kN), tarik (+).') },
      {
        k: 'table',
        head: ['Batang', 'M_{i}', 'M_{j}', 'V_{i}', 'V_{j}', 'N_{i}', 'N_{j}', '|M|_{maks}', '|V|_{maks}'],
        align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
        rows: v.elems.map((e, k) => {
          const g = endVals(e)
          return [v.names[k], fx(g.Mi, 2), fx(g.Mj, 2), fx(g.Vi, 2), fx(g.Vj, 2), fx(g.Ni, 2), fx(g.Nj, 2), fx(Math.abs(e.Mmax!), 2), fx(Math.abs(e.Vmax!), 2)]
        }),
        caption: 'Gaya ujung & maksimum per batang (kN·m, kN).',
      },
      {
        k: 'rows',
        rows: [
          kv('Momen maksimum global |M|_{maks}', `${fx(Math.abs(gMax.M), 2)} kN·m`),
          kv('Geser maksimum global |V|_{maks}', `${fx(Math.abs(gMax.V), 2)} kN`),
          kv('Aksial maksimum global N', `${fx(gMax.N, 2)} kN (${gMax.N < 0 ? 'tekan' : 'tarik'})`),
        ],
      },
      ...(stress.length
        ? [
            { k: 'h' as const, text: 'Tegangan elastis (informatif)' },
            { k: 'calc' as const, steps: stress },
            {
              k: 'p' as const,
              text: 'σ = M/S + N/A hanya tegangan elastis serat terluar — bukan cek kapasitas (tekuk lentur, tekuk torsi-lateral, interaksi aksial–lentur H1). Desain batang memakai tool Balok Baja (Lentur), Batang Tekan, atau Diagram P–M.',
            },
          ]
        : []),
    ],
  }
}

/** Bagian deformasi: tabel perpindahan simpul + rasio drift & lendutan terhadap batas layan lazim. */
export function deformSection(
  v: FrameView,
  nodes: { name: string; i: number }[],
  o: { drift: number; Hmm: number; sag: number; sagLabel: string; Lmm: number; Lname: string; extra?: Block[] },
): Section {
  const dAbs = Math.abs(o.drift), sAbs = Math.abs(o.sag)
  return {
    title: 'Deformasi',
    strong: true,
    blocks: [
      { k: 'figure', fig: frameFigure(v, 'D', 'Gbr. 6 — Bentuk terdeformasi (diperbesar), interpolasi Hermite kubik.') },
      {
        k: 'table',
        head: ['Simpul', 'Δx (mm)', 'Δy (mm)', 'θ (mrad)'],
        align: ['l', 'r', 'r', 'r'],
        rows: nodes.map((n) => [n.name, fx(v.D[n.i * 3], 2), fx(v.D[n.i * 3 + 1], 2), fx(v.D[n.i * 3 + 2] * 1000, 3)]),
        caption: 'Δx + ke kanan, Δy + ke atas, θ + berlawanan jarum jam.',
      },
      ...(o.extra ?? []),
      {
        k: 'calc',
        steps: [
          ...(dAbs > 1e-6
            ? [{ desc: 'Drift lateral puncak (terbesar)', lhs: 'H/Δ', expr: '\\frac{H}{|Δ_{x}|}', subst: `\\frac{${fx(o.Hmm, 0)}}{${fx(dAbs, 2)}}`, value: fx(o.Hmm / dAbs, 0) }]
            : []),
          ...(sAbs > 1e-6
            ? [{ desc: o.sagLabel, lhs: `${o.Lname}/δ`, expr: `\\frac{${o.Lname}}{|δ|}`, subst: `\\frac{${fx(o.Lmm, 0)}}{${fx(sAbs, 2)}}`, value: fx(o.Lmm / sAbs, 0) }]
            : []),
        ],
      },
      {
        k: 'rows',
        rows: [
          check('Δ / (H/500)', dAbs / (o.Hmm / 500), `H/500 = ${fx(o.Hmm / 500, 2)} mm`),
          check('Δ / (H/250)', dAbs / (o.Hmm / 250), `H/250 = ${fx(o.Hmm / 250, 2)} mm`),
          check(`δ / (${o.Lname}/360)`, sAbs / (o.Lmm / 360), `${o.Lname}/360 = ${fx(o.Lmm / 360, 2)} mm`),
          check(`δ / (${o.Lname}/240)`, sAbs / (o.Lmm / 240), `${o.Lname}/240 = ${fx(o.Lmm / 240, 2)} mm`),
        ],
      },
      {
        k: 'p',
        text: `Batas layan acuan umum: goyangan H/500…H/250; lendutan ${o.Lname}/360 (beban hidup) … ${o.Lname}/240 (total). Lendutan dihitung dari beban yang dimasukkan (total), relatif terhadap tali busur ujung batang — perbandingan dengan ${o.Lname}/360 konservatif.`,
      },
    ],
  }
}

export const modelFigure = (v: FrameView, dims: FrameDim[], caption: string): Block => ({ k: 'figure', fig: frameFigure(v, 'model', caption, dims) })
