import { EXPO } from '../../calc/wind-load'
import { arrow, dimV, figRows } from '../../report/figure'
import { fx, kv, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { computeWindUI, ENC_LABEL, qzAt, WIND_DEFAULTS, type WindOk, type WindUIInput } from './model'

// Laporan Beban Angin SPGAU dinding — SNI 1727:2020 (ASCE 7-16) Bab 26–27, prosedur pengarah, gedung tertutup
// kaku: tekanan velositas, koefisien Cp dinding, tekanan desain ±GCpi, geser dasar & momen guling.

export { WIND_DEFAULTS }

/** Teks tekanan bertanda, mis. "+0.522" / "−0.400". */
const sg = (n: number, dp = 3) => (n < 0 ? `−${fx(-n, dp)}` : `+${fx(n, dp)}`)

/** Gbr. 1 — elevasi gedung, profil tekanan windward (qz·G·Cp) dan isap leeward, gaya geser dasar. */
function figWind(r: WindOk): Figure {
  const ops: FigOp[] = []
  const bx = 220, bw = 110, yTop = 30, hB = 115, yG = yTop + hB
  const Yz = (z: number) => yG - (z / r.H) * hB
  // tanah + gedung
  ops.push({ t: 'line', x1: 60, y1: yG, x2: 470, y2: yG, lw: 1, c: 'muted' })
  for (let i = 0; i < 18; i++) {
    const xh = 60 + (410 * i) / 17
    ops.push({ t: 'line', x1: xh, y1: yG, x2: xh - 6, y2: yG + 6, lw: 0.4, c: 'muted' })
  }
  ops.push({ t: 'rect', x: bx, y: yTop, w: bw, h: hB, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'rect', x: bx, y: yTop, w: bw, h: hB, lw: 1.1, c: 'support' })
  ops.push({ t: 'text', x: bx + bw / 2, y: yTop + hB / 2, s: `B = ${fx(r.B, 1)} m`, size: 7, align: 'c', c: 'muted' })
  dimV(ops, yTop, yG, bx + bw + 92, '')
  ops.push({ t: 'text', x: bx + bw + 98, y: (yTop + yG) / 2 + 2.5, s: `H = ${fx(r.H, 1)} m`, size: 7 })
  // profil windward eksternal qz·G·Cp (kiri, panah menuju dinding)
  const pTop = r.qh * r.G * r.CpW
  const pSc = 70 / Math.max(pTop, Math.abs(r.qh * r.G * r.CpL), 0.01)
  const n = 24
  const pts: [number, number][] = [[bx, yG]]
  for (let k = 0; k <= n; k++) {
    const z = (r.H * k) / n
    pts.push([bx - qzAt(r, z) * r.G * r.CpW * pSc, Yz(z)])
  }
  pts.push([bx, yTop])
  ops.push({ t: 'poly', pts, close: true, fill: true, c: 'load', op: 0.18 })
  ops.push({ t: 'poly', pts: pts.slice(1, -1), lw: 0.9, c: 'load' })
  for (const f of [0.2, 0.5, 0.8]) {
    const z = f * r.H, p = qzAt(r, z) * r.G * r.CpW
    arrow(ops, bx - p * pSc + 1, Yz(z), bx - 2, Yz(z), { lw: 0.9, c: 'load' })
  }
  ops.push({ t: 'text', x: bx - 6, y: yTop - 7, s: `windward q_{h}GC_{p} = ${fx(pTop, 3)} kPa`, size: 6.5, align: 'r', c: 'load' })
  // leeward: isap seragam qh·G·Cp (panah menjauhi dinding)
  const pL = Math.abs(r.qh * r.G * r.CpL), dl = pL * pSc
  for (const f of [0.2, 0.5, 0.8]) arrow(ops, bx + bw + 2, Yz(f * r.H), bx + bw + 2 + dl, Yz(f * r.H), { lw: 0.9, c: 'm' })
  ops.push({ t: 'line', x1: bx + bw + 2 + dl, y1: yTop, x2: bx + bw + 2 + dl, y2: yG, lw: 0.6, c: 'm', dash: [3, 2] })
  ops.push({ t: 'text', x: bx + bw + 6, y: yTop - 7, s: `leeward ${sg(r.qh * r.G * r.CpL)} kPa`, size: 6.5, c: 'm' })
  // angin datang + geser dasar
  const yV = Yz(0.62 * r.H)
  arrow(ops, 64, yV, 112, yV, { lw: 1.6, c: 'ink' })
  ops.push({ t: 'text', x: 64, y: yV - 8, s: `V = ${fx(r.V, 0)} m/s (${r.expo})`, size: 7 })
  arrow(ops, bx + bw / 2 - 30, yG + 16, bx + bw / 2 + 30, yG + 16, { lw: 1.2, c: 'v' })
  ops.push({ t: 'text', x: bx + bw / 2 + 36, y: yG + 18.5, s: `F = ${fx(r.Fdesign, 1)} kN, M = ${fx(r.M, 0)} kN·m`, size: 7, c: 'v' })
  return {
    h: figRows(yG + 28),
    ops,
    alt: 'Elevasi gedung dengan profil tekanan angin windward dan leeward',
    caption: `Gbr. 1 — Tekanan angin eksternal SPGAU dinding (q_{h} = ${fx(r.qh, 3)} kPa, G = ${fx(r.G, 2)}); tekanan internal ±${fx(r.GCpi, 2)} q_{h} saling meniadakan pada gaya total.`,
  }
}

export function windReport(r: WindOk): Report {
  const ex = EXPO[r.expo as keyof typeof EXPO] ?? EXPO.C
  const zh = Math.max(4.6, Math.min(r.H, ex.zg))
  const V2 = `${fx(r.Kzt, 2)} × ${fx(r.Kd, 2)} × ${fx(r.Ke, 2)} × ${fx(r.V, 1)}^{2}`
  const LBs = fx(r.LB, 3)
  const cpLee: Pick<CalcStep, 'expr' | 'subst'> =
    r.LB <= 1 || r.LB > 4 ? {} : r.LB <= 2 ? { expr: '−0.5 + 0.2(L/B − 1)', subst: `−0.5 + 0.2 × (${LBs} − 1)` } : { expr: '−0.3 + 0.05(L/B − 2)', subst: `−0.3 + 0.05 × (${LBs} − 2)` }
  const lbNote = r.LB <= 1 ? ' ≤ 1' : r.LB > 4 ? ' ≥ 4' : ', interpolasi linear'
  const pStep = (desc: string, lhs: string, Cp: number, qz: number, zLabel: string): CalcStep => ({
    desc,
    lhs,
    expr: `q_{${zLabel}} G C_{p} ∓ q_{h}(GC_{pi})`,
    subst: `${fx(qz, 3)} × ${fx(r.G, 2)} × (${sg(Cp, 2)}) ∓ ${fx(r.qh, 3)} × ${fx(r.GCpi, 2)}`,
    value: `${sg(qz * r.G * Cp - r.qh * r.GCpi)} / ${sg(qz * r.G * Cp + r.qh * r.GCpi)}`,
    unit: 'kPa',
  })
  return {
    title: 'Beban Angin SPGAU Dinding (SNI 1727:2020)',
    summary: [
      kv('Geser dasar desain F', `${fx(r.Fdesign, 1)} kN${r.minGoverns ? ' (beban minimum menentukan)' : ''}`),
      kv('Momen guling dasar M', `${fx(r.M, 0)} kN·m`),
      kv('Tekanan velositas q_{h}', `${fx(r.qh, 3)} kPa`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Kecepatan angin dasar V', `${fx(r.V, 1)} m/s`),
              kv('Kategori eksposur', `${r.expo} (α = ${fx(ex.alpha, 1)}, z_{g} = ${fx(ex.zg, 2)} m)`),
              kv('K_{d} / K_{zt} / K_{e} / G', `${fx(r.Kd, 2)} / ${fx(r.Kzt, 2)} / ${fx(r.Ke, 2)} / ${fx(r.G, 2)}`),
              kv('Ketertutupan', `${ENC_LABEL[r.enc as keyof typeof ENC_LABEL] ?? r.enc}, GC_{pi} = ±${fx(r.GCpi, 2)}`),
              kv('B × L × H', `${fx(r.B, 1)} × ${fx(r.L, 1)} × ${fx(r.H, 1)} m (B tegak lurus arah angin)`),
            ],
          },
        ],
      },
      {
        title: 'Tekanan velositas',
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: 'Koefisien eksposur di z = H (z ≥ 4,6 m)', lhs: 'K_{h}', expr: '2.01 (z/z_{g})^{2/α}', subst: `2.01 × (${fx(zh, 2)}/${fx(ex.zg, 2)})^{2/${fx(ex.alpha, 1)}}`, value: fx(r.Kh, 3), ref: 'Tabel 26.10-1' },
              { lhs: 'q_{h}', expr: '0.613 K_{h} K_{zt} K_{d} K_{e} V^{2}', subst: `0.613 × ${fx(r.Kh, 3)} × ${V2} / 1000`, value: fx(r.qh, 3), unit: 'kPa', ref: 'Pers. 26.10-1' },
            ],
          },
          {
            k: 'table',
            head: ['z (m)', 'K_{z}', 'q_{z} (kPa)', 'p_{ww} +GC_{pi}', 'p_{ww} −GC_{pi}'],
            rows: r.table.map((t) => [fx(t.z, 1), fx(t.Kz, 3), fx(t.qz, 3), sg(t.pWW), sg(t.pWWm)]),
            align: ['r', 'r', 'r', 'r', 'r'],
            caption: 'Distribusi windward per elevasi (kPa)',
          },
        ],
      },
      {
        title: 'Koefisien tekanan dinding',
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: 'Dinding datang (windward), bervariasi terhadap z', lhs: 'C_{p,w}', value: sg(r.CpW, 2), ref: 'Gbr. 27.3-1' },
              { desc: `Dinding pergi (leeward), L/B = ${fx(r.L, 1)}/${fx(r.B, 1)} = ${LBs}${lbNote}`, lhs: 'C_{p,l}', ...cpLee, value: sg(r.CpL, 3), ref: 'Gbr. 27.3-1' },
              { desc: 'Dinding samping', lhs: 'C_{p,s}', value: sg(r.CpS, 2), ref: 'Gbr. 27.3-1' },
              { desc: `Koefisien tekanan internal (${ENC_LABEL[r.enc as keyof typeof ENC_LABEL] ?? r.enc})`, lhs: 'GC_{pi}', value: `±${fx(r.GCpi, 2)}`, ref: 'Tabel 26.13-1' },
            ],
          },
        ],
      },
      {
        title: 'Tekanan desain dinding',
        blocks: [
          { k: 'p', text: 'p = q G C_{p} − q_{h}(GC_{pi}); nilai ditulis untuk GC_{pi} positif / negatif. Positif = tekan ke permukaan dinding.' },
          {
            k: 'calc',
            steps: [
              pStep('Windward di puncak (z = H)', 'p_{w}', r.CpW, r.qh, 'h'),
              pStep('Leeward (seragam, q_{h})', 'p_{l}', r.CpL, r.qh, 'h'),
              pStep('Samping (seragam, q_{h})', 'p_{s}', r.CpS, r.qh, 'h'),
            ],
          },
        ],
      },
      {
        title: 'Gaya total arah angin',
        strong: true,
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: 'Tekanan netto windward + leeward di puncak (internal saling meniadakan)', lhs: 'p_{net,h}', expr: 'q_{h} G (C_{p,w} + |C_{p,l}|)', subst: `${fx(r.qh, 3)} × ${fx(r.G, 2)} × (${fx(r.CpW, 2)} + ${fx(Math.abs(r.CpL), 3)})`, value: fx(r.pNetTop, 3), unit: 'kPa' },
              { desc: `Geser dasar: integrasi 40 strip setinggi H, Δz = ${fx(r.H, 1)}/40 = ${fx(r.H / 40, 3)} m`, lhs: 'F', expr: 'Σ [q_{z} G C_{p,w} + q_{h} G |C_{p,l}|] B Δz', value: fx(r.F, 1), unit: 'kN' },
              { desc: 'Beban angin minimum SPGAU 0,77 kN/m² pada proyeksi dinding', lhs: 'F_{min}', expr: '0.77 B H', subst: `0.77 × ${fx(r.B, 1)} × ${fx(r.H, 1)}`, value: fx(r.Fmin, 1), unit: 'kN', ref: 'Ps. 27.1.5' },
              { lhs: 'F_{desain}', expr: 'max(F; F_{min})', subst: `max(${fx(r.F, 1)}; ${fx(r.Fmin, 1)})`, value: fx(r.Fdesign, 1), unit: 'kN' },
              { desc: 'Momen guling dasar (dari F hitungan)', lhs: 'M', expr: 'Σ p_{net}(z) B Δz · z', value: fx(r.M, 0), unit: 'kN·m' },
            ],
          },
          { k: 'figure', fig: figWind(r) },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'SNI 1727:2020 (adopsi ASCE 7-16) Bab 26–27, prosedur pengarah, gedung tertutup & kaku (G = 0,85), SPGAU dinding untuk satu arah angin (tegak lurus lebar B). Jalankan untuk kedua arah gedung (tukar B ↔ L).',
      'Belum termasuk: atap (uplift), gedung fleksibel (G_{f}), K_{zt} dihitung, parapet, komponen & kladding (Bab 30), prosedur amplop. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildWindReport(i: WindUIInput): Report | null {
  const r = computeWindUI(i)
  return r ? windReport(r) : null
}

export default {
  defaults: WIND_DEFAULTS,
  build: (i: WindUIInput) => buildWindReport(i) ?? { title: 'Beban Angin', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
