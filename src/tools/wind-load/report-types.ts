import { EXPO, KzAt, whP, type FreeRoofResult, type OpenFrameResult, type WarehouseResult, type WhSurface, type WindBase } from '../../calc/wind-load'
import { fx, kv, type Block, type CalcStep, type Report, type Section } from '../../report/model'
import { figFreeRoof, figFreeRoof90, figOpenFrame, figWarehouse, mn, sg } from './figures'

// Laporan tipe struktur lain — SNI 1727:2020 (ASCE 7-16): gudang atap pelana (Gbr. 27.3-1), atap bebas bangunan
// terbuka (Ps. 27.3.2, Gbr. 27.3-4/5/7), rangka terbuka (Ps. 29.4, Gbr. 29.4-2/3).

const dataRows = (b: WindBase) => {
  const ex = EXPO[b.expo] ?? EXPO.C
  return [
    kv('Kecepatan angin dasar V', `${fx(b.V, 1)} m/s`),
    kv('Kategori eksposur', `${b.expo} (α = ${fx(ex.alpha, 1)}, z_{g} = ${fx(ex.zg, 2)} m)`),
    kv('K_{d} / K_{zt} / K_{e} / G', `${fx(b.Kd, 2)} / ${fx(b.Kzt, 2)} / ${fx(b.Ke, 2)} / ${fx(b.G, 2)}`),
  ]
}

/** Langkah Kz & qz di elevasi z (label sub, mis. 'h'). */
function qSteps(b: WindBase, z: number, sub: string, Kz: number, q: number, desc?: string): CalcStep[] {
  const ex = EXPO[b.expo] ?? EXPO.C
  const zz = Math.max(4.6, Math.min(z, ex.zg))
  return [
    { desc, lhs: `K_{${sub}}`, expr: '2.01 (z/z_{g})^{2/α}', subst: `2.01 × (${fx(zz, 2)}/${fx(ex.zg, 2)})^{2/${fx(ex.alpha, 1)}}`, value: fx(Kz, 3), ref: 'Tabel 26.10-1' },
    { lhs: `q_{${sub}}`, expr: `0.613 K_{${sub}} K_{zt} K_{d} K_{e} V^{2}`, subst: `0.613 × ${fx(Kz, 3)} × ${fx(b.Kzt, 2)} × ${fx(b.Kd, 2)} × ${fx(b.Ke, 2)} × ${fx(b.V, 1)}^{2} / 1000`, value: fx(q, 3), unit: 'kPa', ref: 'Pers. 26.10-1' },
  ]
}

/** Label subskrip q per elevasi: h = atap rata-rata, he = tritisan, hr = bubungan. */
const QSUB = { h: 'h', e: 'he', r: 'hr' } as const

// ── Gudang ────────────────────────────────────────────────────────────────────────────────────────────────

function whTable(r: WarehouseResult, d: 0 | 1): Block {
  const s = r.inp.s
  const rows: string[][] = []
  for (const sf of r.dirs[d].surfaces) {
    const ks: (0 | 1)[] = sf.Cp[0] === sf.Cp[1] ? [0] : [0, 1]
    for (const k of ks) {
      const pp = whP(r, sf, k, 1), pm = whP(r, sf, k, -1)
      rows.push([sf.name, ks.length > 1 ? String(k + 1) : '1, 2', `q_{${QSUB[sf.qAt]}}`, sg(sf.Cp[k], 2), sg(sf.q * r.inp.G * sf.Cp[k]), sg(pp), sg(pm), sg(pp * s, 2), sg(pm * s, 2)])
    }
  }
  return {
    k: 'table',
    head: ['Permukaan', 'Kasus', 'q', 'C_{p}', 'qGC_{p}', 'p +GC_{pi}', 'p −GC_{pi}', 'w +GC_{pi}', 'w −GC_{pi}'],
    rows,
    align: ['l', 'c', 'c', 'r', 'r', 'r', 'r', 'r', 'r'],
    caption: `Tekanan desain (kPa) dan beban garis portal w = p·s, s = ${fx(s, 2)} m (kN/m). Kasus 1/2 = dua nilai C_{p} atap.`,
  }
}

function whDirSection(r: WarehouseResult, d: 0 | 1): Section {
  const dir = r.dirs[d], { G } = r.inp
  const roofs = dir.surfaces.filter((sf) => sf.kind === 'roof')
  const wW = dir.surfaces[0], wL = dir.surfaces[dir.surfaces.length - 2]
  const cpSteps: CalcStep[] = [
    { desc: 'Dinding windward', lhs: 'C_{p,w}', value: sg(0.8, 2), ref: 'Gbr. 27.3-1' },
    { desc: `Dinding leeward, L/B = ${fx(dir.L, 1)}/${fx(dir.B, 1)} = ${fx(dir.LB, 3)}`, lhs: 'C_{p,l}', value: sg(wL.Cp[0], 3), ref: 'Gbr. 27.3-1' },
  ]
  const roofDesc = (sf: WhSurface) => (d === 0 && r.inp.theta >= 10 ? `${sf.name}, h/L = ${fx(dir.hL, 3)}, θ = ${fx(r.inp.theta, 1)}° (interpolasi linear)` : `${sf.name} dari tepi windward, h/L = ${fx(dir.hL, 3)}`)
  for (const sf of roofs) cpSteps.push({ desc: roofDesc(sf), lhs: 'C_{p}', value: sf.Cp[0] === sf.Cp[1] ? sg(sf.Cp[0], 3) : `${sg(sf.Cp[0], 3)} / ${sg(sf.Cp[1], 3)}`, ref: 'Gbr. 27.3-1' })
  const ext = (sf: WhSurface, k: 0 | 1) => sf.q * G * sf.Cp[k]
  const fSteps: CalcStep[] =
    d === 0
      ? ([0, 1] as const).map((k) => ({
          desc: `Gaya horizontal kasus ${k + 1}: dinding (q_{he}GC_{p,w} − q_{h}GC_{p,l}) h_{e} L_{b} + komponen horizontal atap ± p·Δx·tanθ·L_{b}`,
          lhs: `F_{${k + 1}}`,
          expr: '(p_{w} − p_{l}) h_{e} L_{b} + Σ p_{atap} Δh L_{b}',
          subst: `(${sg(ext(wW, k))} − (${sg(ext(wL, k))})) × ${fx(r.inp.he, 2)} × ${fx(r.inp.Lb, 1)} + …`,
          value: fx(dir.F[k], 1),
          unit: 'kN',
        }))
      : [
          {
            desc: 'Gaya horizontal pada ujung pelana (luas A = S·h_{e} + S·rise/2)',
            lhs: 'F',
            expr: '(p_{w} − p_{l}) A',
            subst: `(${sg(ext(wW, 0))} − (${sg(ext(wL, 0))})) × ${fx(dir.Awall, 2)}`,
            value: fx(dir.F[0], 1),
            unit: 'kN',
          },
        ]
  fSteps.push({
    desc: 'Beban minimum SPGAU: 0,77 kPa × luas dinding + 0,38 kPa × proyeksi vertikal atap',
    lhs: 'F_{min}',
    expr: '0.77 A_{dinding} + 0.38 A_{atap}',
    subst: `0.77 × ${fx(dir.Awall, 2)} + 0.38 × ${fx(dir.Aroof, 2)}`,
    value: fx(dir.Fmin, 1),
    unit: 'kN',
    ref: 'Ps. 27.1.5',
  })
  for (const k of [0, 1] as const)
    fSteps.push({ desc: `Gaya angkat atap total kasus ${k + 1} dengan +GC_{pi} (+ = ke atas)`, lhs: `U_{${k + 1}}`, expr: '−Σ (q_{h}GC_{p} − q_{h}GC_{pi}) A_{horizontal}', value: fx(dir.U[k], 1), unit: 'kN' })
  return {
    title: dir.label,
    strong: d === 0,
    blocks: [
      { k: 'p', text: `B = ${fx(dir.B, 1)} m tegak lurus angin, L = ${fx(dir.L, 1)} m searah angin. p = q G C_{p} − q_{h}(GC_{pi}); positif = menekan permukaan.` },
      { k: 'calc', steps: cpSteps },
      whTable(r, d),
      { k: 'calc', steps: fSteps },
      { k: 'figure', fig: figWarehouse(r, d, 0) },
    ],
  }
}

export function warehouseReport(r: WarehouseResult): Report {
  const i = r.inp
  const n = r.dirs[0], p = r.dirs[1]
  const Umax = Math.max(...n.U, ...p.U)
  return {
    title: 'Beban Angin Gudang Atap Pelana (SNI 1727:2020)',
    summary: [
      kv('Gaya horizontal ⊥ bubungan', `${fx(Math.max(...n.F, n.Fmin), 1)} kN${n.Fmin > Math.max(...n.F) ? ' (minimum menentukan)' : ''}`),
      kv('Gaya horizontal ∥ bubungan', `${fx(Math.max(p.F[0], p.Fmin), 1)} kN${p.Fmin > p.F[0] ? ' (minimum menentukan)' : ''}`),
      kv('Gaya angkat atap maks (+GC_{pi})', `${fx(Umax, 1)} kN`),
      kv('Tekanan velositas q_{h}', `${fx(r.qh, 3)} kPa`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              ...dataRows(i),
              kv('Ketertutupan', `${i.enc === 'partial' ? 'tertutup sebagian' : 'tertutup'}, GC_{pi} = ±${fx(r.GCpi, 2)}`),
              kv('Bentang S × panjang L_{b}', `${fx(i.S, 1)} × ${fx(i.Lb, 1)} m`),
              kv('Tinggi tritisan h_{e} / bubungan h_{r}', `${fx(i.he, 2)} / ${fx(r.hr, 2)} m (θ = ${fx(i.theta, 1)}°)`),
              kv('Jarak portal s', `${fx(i.s, 2)} m`),
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
              { desc: i.theta <= 10 ? 'Tinggi atap rata-rata — θ ≤ 10°: tinggi tritisan' : 'Tinggi atap rata-rata', lhs: 'h', expr: i.theta <= 10 ? 'h_{e}' : 'h_{e} + (S/2) tanθ / 2', value: fx(r.h, 3), unit: 'm', ref: 'Ps. 26.2' },
              ...qSteps(i, r.h, 'h', r.Kh, r.qh),
              ...qSteps(i, i.he, 'he', KzAt(i.he, i.expo), r.qe, 'Di tritisan (dinding windward ⊥ bubungan)'),
              ...qSteps(i, r.hr, 'hr', KzAt(r.hr, i.expo), r.qr, 'Di bubungan (dinding ujung pelana)'),
              { desc: `Koefisien tekanan internal (${i.enc === 'partial' ? 'tertutup sebagian' : 'tertutup'})`, lhs: 'GC_{pi}', value: `±${fx(r.GCpi, 2)}`, ref: 'Tabel 26.13-1' },
            ],
          },
        ],
      },
      whDirSection(r, 0),
      whDirSection(r, 1),
    ],
    warnings: r.warn,
    scope: [
      'SNI 1727:2020 (adopsi ASCE 7-16) Bab 26–27, prosedur pengarah Bagian 1, gudang tertutup/tertutup sebagian kaku (G = 0,85), atap pelana θ ≤ 45°, SPGAU dinding & atap untuk angin tegak lurus dan sejajar bubungan.',
      'Belum termasuk: prosedur amplop (Bab 28), kasus torsi, beban parsial, tritisan/overhang, K_{zt} dihitung, komponen & kladding (Bab 30). Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

// ── Atap bebas ────────────────────────────────────────────────────────────────────────────────────────────

export function freeRoofReport(r: FreeRoofResult): Report {
  const i = r.inp, s = i.s
  const shapeL = i.shape === 'mono' ? 'monoslope' : 'pelana'
  const flowL = i.flow === 'clear' ? 'bersih (blokade ≤ 50%)' : 'terhalang (blokade > 50%)'
  const fig = i.shape === 'mono' ? 'Gbr. 27.3-4' : r.usesMonoZero ? 'Gbr. 27.3-4 (θ = 0°)' : 'Gbr. 27.3-5'
  const all = r.cases.flatMap((c) => [c.A, c.B])
  const pMin = Math.min(...all.flatMap((l) => [l.pW, l.pL])), pMax = Math.max(...all.flatMap((l) => [l.pW, l.pL]))
  const FvUp = Math.min(...all.map((l) => l.Fv), ...r.Fv90), FvDn = Math.max(...all.map((l) => l.Fv), ...r.Fv90)
  const thNote = i.theta < 7.5 ? 'θ < 7,5° → nilai θ = 0°' : 'interpolasi linear θ'
  const figs: Block[] = []
  r.cases.forEach((_c, ci) => (['A', 'B'] as const).forEach((lc) => figs.push({ k: 'figure', fig: figFreeRoof(r, ci, lc) })))
  figs.push({ k: 'figure', fig: figFreeRoof90(r, 'A') })
  return {
    title: `Beban Angin Atap Bebas ${i.shape === 'mono' ? 'Monoslope' : 'Pelana'} — Bangunan Terbuka (SNI 1727:2020)`,
    summary: [
      kv('Tekanan neto ekstrem', `${sg(pMin)} / ${sg(pMax)} kPa`),
      kv('Gaya vertikal total ekstrem', `${fx(-FvUp, 1)} kN angkat / ${fx(FvDn, 1)} kN tekan`),
      kv('Tekanan velositas q_{h}', `${fx(r.qh, 3)} kPa`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              ...dataRows(i),
              kv('Bentuk atap / aliran angin', `${shapeL} / ${flowL}`),
              kv('Sudut atap θ', `${fx(i.theta, 1)}°`),
              kv('h (rata-rata) / L (searah angin) / B', `${fx(i.h, 2)} / ${fx(i.L, 1)} / ${fx(i.B, 1)} m (h/L = ${fx(r.hL, 3)})`),
              kv('Jarak rangka s', `${fx(s, 2)} m`),
            ],
          },
        ],
      },
      { title: 'Tekanan velositas', blocks: [{ k: 'calc', steps: qSteps(i, i.h, 'h', r.Kh, r.qh) }] },
      {
        title: 'Angin tegak lurus bubungan (γ = 0°, 180°)',
        strong: true,
        blocks: [
          { k: 'p', text: `p = q_{h} G C_{N} (Ps. 27.3.2). C_{NW}/C_{NL} = tekanan neto (sisi atas + bawah) paruh windward/leeward; + menekan sisi atas. ${fig}, aliran ${flowL}, ${thNote}.` },
          {
            k: 'calc',
            steps: r.cases.flatMap((c) =>
              (['A', 'B'] as const).map((lc) => ({
                desc: `${c.label}, kasus ${lc}`,
                lhs: 'p_{W} / p_{L}',
                expr: 'q_{h} G C_{NW} / q_{h} G C_{NL}',
                subst: `${fx(r.qh, 3)} × ${fx(i.G, 2)} × (${mn(c[lc].CNW, 3)} / ${mn(c[lc].CNL, 3)})`,
                value: `${sg(c[lc].pW)} / ${sg(c[lc].pL)}`,
                unit: 'kPa',
                ref: fig,
              })),
            ),
          },
          {
            k: 'table',
            head: ['Arah', 'Kasus', 'C_{NW}', 'C_{NL}', 'p_{W}', 'p_{L}', 'w_{W}', 'w_{L}', 'F_{v}', 'F_{h}'],
            rows: r.cases.flatMap((c) => (['A', 'B'] as const).map((lc) => {
              const l = c[lc]
              return [c.key === 'g0' ? (i.shape === 'mono' ? 'γ 0°' : 'γ 0/180°') : 'γ 180°', lc, mn(l.CNW, 3), mn(l.CNL, 3), sg(l.pW), sg(l.pL), sg(l.pW * s, 2), sg(l.pL * s, 2), sg(l.Fv, 1), sg(l.Fh, 1)]
            })),
            align: ['l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
            caption: `p (kPa); beban garis rangka w = p·s (kN/m, tegak lurus atap); F_{v} = (p_{W} + p_{L})(L/2)B ke bawah, F_{h} = komponen horizontal searah angin (kN).`,
          },
          ...figs.slice(0, -1),
        ],
      },
      {
        title: 'Angin sejajar bubungan (γ = 90°)',
        blocks: [
          { k: 'p', text: `Zona jarak dari tepi windward sepanjang B (Gbr. 27.3-7, semua bentuk atap θ ≤ 45°), aliran ${flowL}.` },
          {
            k: 'table',
            head: ['Zona (m)', 'C_{N} A', 'C_{N} B', 'p A', 'p B', 'w A', 'w B'],
            rows: r.zones.map((z) => [`${fx(z.x0, 1)}–${fx(z.x1, 1)}`, mn(z.CNA), mn(z.CNB), sg(z.pA), sg(z.pB), sg(z.pA * s, 2), sg(z.pB * s, 2)]),
            align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'],
            caption: 'p (kPa), w = p·s (kN/m) untuk rangka di zona tersebut.',
          },
          { k: 'calc', steps: (['A', 'B'] as const).map((lc, k) => ({ desc: `Gaya vertikal total kasus ${lc} (+ = ke bawah)`, lhs: `F_{v,${lc}}`, expr: 'Σ p_{zona} Δx L', value: sg(r.Fv90[k], 1), unit: 'kN' })) },
          figs[figs.length - 1],
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'SNI 1727:2020 (adopsi ASCE 7-16) Ps. 27.3.2, bangunan terbuka atap bebas monoslope/pelana θ ≤ 45°, 0,25 ≤ h/L ≤ 1,0, SPGAU (rangka utama) untuk angin tegak lurus (γ = 0°/180°) dan sejajar bubungan (γ = 90°).',
      'Belum termasuk: atap palung (troughed, Gbr. 27.3-6), kanopi menempel gedung, gaya gesek horizontal atap, fascia, komponen & kladding (Ps. 30.7). Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

// ── Rangka terbuka ────────────────────────────────────────────────────────────────────────────────────────

export function openFrameReport(r: OpenFrameResult): Report {
  const i = r.inp
  const plane = i.kind === 'plane'
  const cfSteps: CalcStep[] = []
  if (i.member === 'round')
    cfSteps.push({ desc: 'Kriteria batang bulat (D m, q_{z} N/m²)', lhs: 'D √q_{z}', expr: 'D √(1000 q_{z})', subst: `${fx(i.D, 3)} × √(1000 × ${fx(r.qzc, 3)})`, value: fx(r.DsqrtQ, 2), ref: plane ? 'Gbr. 29.4-2' : undefined })
  if (plane)
    cfSteps.push({ desc: `Rangka/papan terbuka, ${r.epsRow}, batang ${i.member === 'flat' ? 'bersisi datar' : i.member === 'round' && (r.DsqrtQ ?? 0) <= 5.3 ? 'bulat, D√q_{z} ≤ 5,3' : 'bulat, D√q_{z} > 5,3'}`, lhs: 'C_{f}', value: fx(r.Cf, 2), ref: 'Gbr. 29.4-2' })
  else {
    const sq = i.tower === 'square'
    cfSteps.push({ desc: `Menara rangka penampang ${sq ? 'bujur sangkar' : 'segitiga'}, angin tegak lurus muka`, lhs: 'C_{f,0}', expr: sq ? '4.0ε^{2} − 5.9ε + 4.0' : '3.4ε^{2} − 4.7ε + 3.4', subst: sq ? `4.0 × ${fx(i.eps, 3)}^{2} − 5.9 × ${fx(i.eps, 3)} + 4.0` : `3.4 × ${fx(i.eps, 3)}^{2} − 4.7 × ${fx(i.eps, 3)} + 3.4`, value: fx(r.CfBase, 3), ref: 'Gbr. 29.4-3' })
    if (i.member === 'round') cfSteps.push({ desc: 'Faktor batang bulat (≤ 1,0)', lhs: 'k_{r}', expr: '0.51ε^{2} + 0.57', subst: `0.51 × ${fx(i.eps, 3)}^{2} + 0.57`, value: fx(r.roundFactor, 3), ref: 'Gbr. 29.4-3' })
    cfSteps.push({ lhs: 'C_{f}', expr: i.member === 'round' ? 'C_{f,0} k_{r}' : 'C_{f,0}', value: fx(r.Cf, 3) })
    if (r.diagFactor) cfSteps.push({ desc: 'Angin arah diagonal menara bujur sangkar (≤ 1,2)', lhs: 'k_{diag}', expr: '1 + 0.75ε', subst: `1 + 0.75 × ${fx(i.eps, 3)}`, value: fx(r.diagFactor, 3), ref: 'Gbr. 29.4-3' })
  }
  const step = Math.max(1, Math.floor(r.seg.length / 5))
  const segRows = r.seg.filter((_, k) => k % step === step - 1 || k === 0).map((s) => [fx(s.z, 2), fx(s.qz, 3), fx(s.w, 3)])
  const Fs: CalcStep[] = [
    { desc: 'Luas padat terproyeksi', lhs: 'A_{f}', expr: 'ε b (z_{2} − z_{1})', subst: `${fx(i.eps, 3)} × ${fx(i.b, 2)} × (${fx(i.z2, 2)} − ${fx(i.z1, 2)})`, value: fx(r.Af, 3), unit: 'm²' },
    { desc: `Cara titik berat A_{f} (z̄ = ${fx(r.zc, 2)} m)`, lhs: 'F_{c}', expr: 'q_{z̄} G C_{f} A_{f}', subst: `${fx(r.qzc, 3)} × ${fx(i.G, 2)} × ${fx(r.Cf, 3)} × ${fx(r.Af, 3)}`, value: fx(r.Fc, 2), unit: 'kN', ref: 'Pers. 29.4-1' },
    { desc: `20 segmen, Δz = ${fx((i.z2 - i.z1) / 20, 3)} m, q_{z} di tengah tiap segmen`, lhs: 'F_{s}', expr: 'Σ q_{z} G C_{f} ε b Δz', value: fx(r.F, 2), unit: 'kN', ref: 'Pers. 29.4-1' },
    { desc: 'Gaya tegak lurus muka (yang lebih besar)', lhs: 'F', expr: 'max(F_{c}; F_{s})', subst: `max(${fx(r.Fc, 2)}; ${fx(r.F, 2)})`, value: fx(r.Fn, 2), unit: 'kN' },
    { desc: 'Momen guling di dasar (z = 0): segmen Σ F_{i} z_{i} vs titik berat F_{c} z̄', lhs: 'M', expr: 'max(Σ F_{i} z_{i}; F_{c} z̄)', subst: `max(${fx(r.M, 1)}; ${fx(r.Mc, 1)})`, value: fx(r.Mn, 1), unit: 'kN·m' },
  ]
  if (r.Fdiag !== undefined) {
    Fs.push({ desc: 'Angin diagonal', lhs: 'F_{diag}', expr: 'k_{diag} F', subst: `${fx(r.diagFactor, 3)} × ${fx(r.Fn, 2)}`, value: fx(r.Fdiag, 2), unit: 'kN' })
    Fs.push({ lhs: 'M_{diag}', expr: 'k_{diag} M', subst: `${fx(r.diagFactor, 3)} × ${fx(r.Mn, 1)}`, value: fx(r.Mdiag, 1), unit: 'kN·m' })
  }
  Fs.push({ desc: 'Beban angin minimum', lhs: 'F_{min}', expr: '0.77 A_{f}', subst: `0.77 × ${fx(r.Af, 3)}`, value: fx(r.Fmin, 2), unit: 'kN', ref: 'Ps. 29.7' })
  Fs.push({ lhs: 'F_{desain}', expr: r.Fdiag !== undefined ? 'max(F_{diag}; F_{min})' : 'max(F; F_{min})', value: fx(r.Fdesign, 2), unit: 'kN' })
  return {
    title: `Beban Angin ${plane ? 'Rangka Bidang Terbuka' : 'Menara Rangka'} (SNI 1727:2020 Ps. 29.4)`,
    summary: [
      kv('Gaya angin desain F', `${fx(r.Fdesign, 2)} kN${r.minGoverns ? ' (minimum menentukan)' : ''}`),
      kv('Momen guling dasar M', `${fx(r.Mdiag ?? r.Mn, 1)} kN·m${r.Mdiag !== undefined ? ' (diagonal)' : ''}`),
      kv('Koefisien gaya C_{f}', `${fx(r.Cf, 3)}${r.CfDiag ? ` (diagonal ${fx(r.CfDiag, 3)})` : ''}`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              ...dataRows(i),
              kv('Jenis', plane ? 'rangka bidang tunggal / papan terbuka (bukaan ≥ 30%)' : `menara rangka penampang ${i.tower === 'square' ? 'bujur sangkar' : 'segitiga'}`),
              kv('Batang', i.member === 'flat' ? 'bersisi datar (profil siku, kanal, pelat)' : `bulat, D = ${fx(i.D, 3)} m`),
              kv('Rasio padat ε', fx(i.eps, 3)),
              kv(plane ? 'Lebar bidang b' : 'Lebar muka b', `${fx(i.b, 2)} m`),
              kv('Elevasi z_{1} – z_{2}', `${fx(i.z1, 2)} – ${fx(i.z2, 2)} m`),
            ],
          },
        ],
      },
      { title: 'Tekanan velositas', blocks: [{ k: 'calc', steps: qSteps(i, r.zc, 'z̄', r.Kzc, r.qzc, `Di titik berat A_{f}, z̄ = (z_{1} + z_{2})/2 = ${fx(r.zc, 2)} m`) }] },
      { title: 'Koefisien gaya', blocks: [{ k: 'calc', steps: cfSteps }] },
      {
        title: 'Gaya angin',
        strong: true,
        blocks: [
          { k: 'calc', steps: Fs },
          { k: 'table', head: ['z (m)', 'q_{z} (kPa)', 'w (kN/m)'], rows: segRows, align: ['r', 'r', 'r'], caption: `Beban garis w = q_{z} G C_{f} ε b sepanjang tinggi (cuplikan segmen${r.diagFactor ? '; arah diagonal × k_{diag}' : ''}).` },
          { k: 'figure', fig: figOpenFrame(r) },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'SNI 1727:2020 (adopsi ASCE 7-16) Ps. 29.4, struktur lain: rangka bidang terbuka (Gbr. 29.4-2) atau menara rangka (Gbr. 29.4-3), struktur kaku G = 0,85, F = q_{z} G C_{f} A_{f}.',
      'Belum termasuk: efek perisai rangka berlapis, struktur fleksibel (G_{f}), aksesori menara, papan/dinding pejal (Ps. 29.3). Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}
