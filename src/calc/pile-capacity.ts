// Daya dukung aksial tekan tiang tunggal pada profil tanah berlapis.
// Port 1:1 dari modules/pile-capacity/module.js (compute), diverifikasi golden test.
//
//   Qu = Qp + Qs; Q_izin = Qu/FS (− berat sendiri, opsional).
//   Selimut per lapis: lempung α (API RP2A), pasir β (K·σ'v·tanδ), atau SPT Meyerhof (nf·N); fs ≤ 120 kPa.
//   Ujung: lempung 9·cu; pasir σ'v·Nq ≤ 0,5·pa·Nq·tanφ (Meyerhof); SPT 40N·L/D ≤ 400N (pasir) / 300N (lempung).
//   Pembanding empiris Decourt-Quaresma bila semua lapis tertanam punya N > 0.
//   Opsional: kepala tiang di kedalaman cut-off zc (selimut mulai zc, ujung di zc + L) dan gesekan negatif pada
//   zona zc…zn (fs sama dengan selimut positif, arah ke bawah): Q_izin = (Qp + Qs,positif)/FS − Qn.
// TIDAK termasuk: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan tiang, beban gempa.

import { barArea } from './shared/concrete'
import { effectiveStressAt, GAMMA_W, nqPrandtl, P_ATM } from './shared/geotech'
import { deg2rad, num, type NumLike } from './shared/num'

/** Batas lunak gesekan selimut (kPa) — diberi peringatan bila tercapai. */
const FS_CAP = 120
/** Berat isi beton tiang (kN/m³). */
const GAMMA_PILE = 24

export type PileShape = 'circular' | 'square'
export type SoilKind = 'clay' | 'sand'
export type LayerMethod = 'static' | 'spt'

export interface PileLayer {
  soil: SoilKind
  /** Tebal (m). */
  H: number
  /** Berat isi (kN/m³). */
  gamma: number
  /** Kuat geser tak terdrainase (kPa), lempung. */
  cu: NumLike
  /** Sudut geser dalam (°), pasir. */
  phi: NumLike
  N: NumLike
  method: LayerMethod
}

export interface PileInput {
  shape?: PileShape
  /** Diameter / sisi (m). */
  D: NumLike
  /** Panjang tertanam (m). */
  L: NumLike
  ptype?: 'driven' | 'bored'
  material?: 'concrete' | 'steel'
  /** Kedalaman muka air tanah (m). */
  Dw: NumLike
  FS: NumLike
  /** 'yes' = kurangi berat sendiri dari Q_izin. */
  inclW?: string
  /** Kedalaman pile cut-off / kepala tiang dari permukaan (m); bawaan 0. */
  zc?: NumLike
  /** Dasar zona gesekan negatif (m dari permukaan); ≤ zc = tanpa gesekan negatif. */
  zn?: NumLike
  /** Ujung SPT tiang bor = 1/3 tiang pancang (Meyerhof 1976). Bawaan false = perilaku build lama. */
  boredTip?: boolean
}

export interface ShaftSegment {
  /** Nomor lapis (mulai 1). */
  idx: number
  soil: SoilKind
  method: LayerMethod
  top: number
  bot: number
  dL: number
  sv: number
  fs: number
  Qs: number
  how: string
  /** Segmen di zona gesekan negatif (tidak masuk Qs). */
  neg?: boolean
}

export type DecourtResult =
  | { active: false }
  | {
      active: true
      NsAvg: number
      fsDq: number
      QsDq: number
      C: number
      Np: number
      qpDq: number
      QpDq: number
      QuDq: number
      Qallow: number
    }

export type PileResult =
  | { valid: false; warn: string[] }
  | {
      valid: true
      warn: string[]
      shape: PileShape
      D: number
      L: number
      Leff: number
      zc: number
      zTip: number
      zn: number
      Qn: number
      FS: number
      Dw: number
      ptype: 'driven' | 'bored'
      material: 'concrete' | 'steel'
      inclW: boolean
      Wp: number
      perim: number
      Ap: number
      totalH: number
      cK: number
      cDelta: number
      nfSPT: number
      segs: ShaftSegment[]
      Qs: number
      tipLayer: PileLayer
      svTip: number
      qp: number
      qpHow: string
      Nq: number | null
      ql: number | null
      Qp: number
      Qu: number
      Qallow: number
      dq: DecourtResult
      layers: PileLayer[]
    }

export const DEFAULT_PILE_LAYERS: readonly PileLayer[] = [
  { soil: 'clay', H: 4, gamma: 17, cu: 40, phi: 0, N: 6, method: 'static' },
  { soil: 'sand', H: 6, gamma: 18, cu: 0, phi: 32, N: 18, method: 'static' },
  { soil: 'sand', H: 8, gamma: 19, cu: 0, phi: 36, N: 35, method: 'static' },
]

export function computePile(g: PileInput, layers: PileLayer[]): PileResult {
  const warn: string[] = []
  const shape = g.shape || 'circular'
  const D = num(g.D), L = num(g.L)
  let FS = num(g.FS), Dw = num(g.Dw)
  const ptype = g.ptype || 'driven', material = g.material || 'concrete'
  const inclW = String(g.inclW) === 'yes'

  if (!(D > 0)) { warn.push('Diameter/sisi tiang D harus > 0.'); return { valid: false, warn } }
  if (!(L > 0)) { warn.push('Panjang tertanam L harus > 0.'); return { valid: false, warn } }
  if (!(FS > 0)) { FS = 2.5; warn.push('FS tidak valid — dipakai 2,5.') }
  if (Dw < 0) Dw = 0
  if (!layers || !layers.length) { warn.push('Tambahkan minimal satu lapis tanah.'); return { valid: false, warn } }
  const zc = Math.max(0, num(g.zc))

  const perim = shape === 'square' ? 4 * D : Math.PI * D
  const Ap = shape === 'square' ? D * D : (Math.PI * D * D) / 4

  let totalH = 0
  for (const l of layers) totalH += l.H
  if (zc >= totalH - 1e-6) { warn.push('Pile cut-off di bawah dasar profil tanah.'); return { valid: false, warn } }
  let Leff = L
  if (zc + L > totalH + 1e-6) {
    Leff = totalH - zc
    warn.push('Panjang tiang L=' + L.toFixed(1) + ' m melebihi total profil tanah ' + totalH.toFixed(1) + ' m — ujung dianggap di dasar profil (' + totalH.toFixed(1) + ' m). Tambahkan lapis di bawah ujung.')
  }
  const zTip = zc + Leff
  // Zona gesekan negatif zc…zn (dibatasi ke ujung).
  const zn = Math.min(Math.max(num(g.zn), zc), zTip)
  const nsf = zn > zc + 1e-9

  const cK = ptype === 'bored' ? 1.0 : 1.4
  const cDelta = material === 'steel' ? 0.6 : 0.8
  const nfSPT = ptype === 'bored' ? 1.0 : 2.0

  // Selimut per lapis dalam zona tertanam (dipecah di batas zona gesekan negatif).
  const segs: ShaftSegment[] = []
  let Qs = 0, Qn = 0, zl = 0, capHit = false
  const pieces: [number, number, number][] = []
  layers.forEach((Ly, i) => {
    const top = zl, bot = zl + Ly.H
    zl = bot
    if (top >= zTip - 1e-9 || bot <= zc + 1e-9) return
    const a = Math.max(top, zc), b = Math.min(bot, zTip)
    if (nsf && zn > a + 1e-9 && zn < b - 1e-9) pieces.push([i, a, zn], [i, zn, b])
    else pieces.push([i, a, b])
  })
  for (const [i, segTop, segBot] of pieces) {
    const Ly = layers[i]
    const dL = segBot - segTop
    if (dL <= 1e-9) continue
    let sv = effectiveStressAt((segTop + segBot) / 2, layers, Dw)
    if (sv < 1) sv = 1
    let fs: number, how: string
    if (Ly.method === 'spt') {
      fs = nfSPT * num(Ly.N)
      how = 'SPT ' + nfSPT.toFixed(0) + 'N'
    } else if (Ly.soil === 'clay') {
      const cu = num(Ly.cu)
      const psi = cu / sv
      let alpha = psi <= 1 ? 0.5 * Math.pow(psi, -0.5) : 0.5 * Math.pow(psi, -0.25)
      if (alpha > 1) alpha = 1
      fs = alpha * cu
      how = 'alpha=' + alpha.toFixed(2)
    } else {
      const phi = num(Ly.phi)
      const K = cK * (1 - Math.sin(deg2rad(phi)))
      const delta = cDelta * phi
      fs = K * sv * Math.tan(deg2rad(delta))
      how = 'beta K=' + K.toFixed(2) + ',d=' + delta.toFixed(0)
    }
    if (fs > FS_CAP) { fs = FS_CAP; capHit = true }
    if (fs < 0) fs = 0
    const Qsi = perim * dL * fs
    const neg = nsf && segBot <= zn + 1e-9
    if (neg) Qn += Qsi
    else Qs += Qsi
    segs.push({ idx: i + 1, soil: Ly.soil, method: Ly.method, top: segTop, bot: segBot, dL, sv, fs, Qs: Qsi, how, ...(neg ? { neg } : {}) })
  }
  if (capHit) warn.push('Sebagian fs dibatasi ke ' + FS_CAP + ' kPa (batas lunak konservatif) — periksa parameter kekuatan/pilih metode lain bila perlu.')

  // Ujung: lapis tempat ujung tiang.
  const tipDepth = Math.min(zTip, totalH)
  let tipLayer = layers[layers.length - 1]
  let zc2 = 0
  for (const l of layers) {
    zc2 += l.H
    if (tipDepth <= zc2 + 1e-9) { tipLayer = l; break }
  }

  const svTip = effectiveStressAt(zTip, layers, Dw)
  let qp: number, qpHow: string
  let Nq: number | null = null, ql: number | null = null
  if (tipLayer.method === 'spt') {
    const Ntip = num(tipLayer.N)
    const sandTip = tipLayer.soil === 'sand'
    // Tiang bor (opsi boredTip): 1/3 nilai tiang pancang (Meyerhof 1976).
    const k = g.boredTip && ptype === 'bored' ? 1 / 3 : 1
    qp = k * Math.min(40 * Ntip * (Leff / D), (sandTip ? 400 : 300) * Ntip)
    qpHow = (k < 1 ? '1/3 x ' : '') + 'SPT 40N*L/D<=' + (sandTip ? '400' : '300') + 'N'
  } else if (tipLayer.soil === 'clay') {
    qp = 9 * num(tipLayer.cu)
    qpHow = '9*cu'
  } else {
    const phiT = num(tipLayer.phi)
    Nq = nqPrandtl(deg2rad(phiT))
    ql = 0.5 * P_ATM * Nq * Math.tan(deg2rad(phiT))
    qp = Math.min(svTip * Nq, ql)
    qpHow = "sigma'v*Nq<=ql"
  }
  if (qp < 0) qp = 0
  const Qp = Ap * qp
  const Qu = Qp + Qs
  const Wp = Ap * Leff * GAMMA_PILE
  const Qallow = Qu / FS - Qn - (inclW ? Wp : 0)

  // Decourt-Quaresma (pembanding empiris).
  let dq: DecourtResult = { active: false }
  let allN = true, sumN = 0, sumL = 0
  for (const s of segs) {
    if (s.neg) continue
    const Nl = num(layers[s.idx - 1].N)
    if (!(Nl > 0)) { allN = false; break }
    sumN += Nl * s.dL
    sumL += s.dL
  }
  const Ntip2 = num(tipLayer.N)
  if (allN && sumL > 0 && Ntip2 > 0) {
    const NsAvg = sumN / sumL
    const fsDq = 10 * (NsAvg / 3 + 1)
    const QsDq = perim * (nsf ? sumL : Leff) * fsDq
    const C = tipLayer.soil === 'sand' ? 400 : 120
    const qpDq = C * Ntip2
    const QpDq = Ap * qpDq
    const QuDq = QpDq + QsDq
    dq = { active: true, NsAvg, fsDq, QsDq, C, Np: Ntip2, qpDq, QpDq, QuDq, Qallow: QuDq / FS - Qn - (inclW ? Wp : 0) }
  }

  if (Leff / D < 4) warn.push('L/D = ' + (Leff / D).toFixed(1) + ' < 4 — tiang pendek; qp lempung (Nc=9) & rumus tiang panjang mungkin tidak berlaku (cek daya dukung dangkal).')
  if (Dw >= totalH) warn.push('MAT (' + Dw.toFixed(1) + ' m) di bawah profil — dihitung tanpa pengaruh air (tegangan efektif = total).')
  warn.push('Berat sendiri tiang ' + (inclW ? 'DIKURANGKAN' : 'diabaikan') + ' dari Q_izin (Wp = ' + Wp.toFixed(0) + ' kN, γ beton 24 kN/m³).')
  if (dq.active) warn.push('Decourt-Quaresma ditampilkan sebagai pembanding empiris (faktor α,β=1,0). Selisih dengan metode statik/Meyerhof adalah wajar — gunakan penilaian teknik.')
  else warn.push('Decourt-Quaresma dilewati — isi N-SPT (>0) pada SEMUA lapis tertanam untuk pembanding empiris.')
  warn.push('Analisis TIANG TUNGGAL. TIDAK termasuk: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan tiang, beban gempa.')

  return {
    valid: true, warn, shape, D, L, Leff, zc, zTip, zn, Qn, FS, Dw, ptype, material, inclW, Wp, perim, Ap, totalH, cK, cDelta, nfSPT,
    segs, Qs, tipLayer, svTip, qp, qpHow, Nq, ql, Qp, Qu, Qallow, dq, layers,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Tool UI: daya dukung tiang tunggal dari data SPT (tabel Z – N-SPT – jenis tanah), memakai computePile() sebagai mesin
// tekan, lalu ditambah kapasitas tarik dan penulangan tiang beton.
//
//   Profil: baris i = lapis dari Z_i sampai Z_{i+1}; baris terakhir menerus ke bawah ujung tiang.
//   Korelasi bila kosong: γ dari N & jenis (tabel Terzaghi–Peck/Bowles), c_u = 6,25 N kPa (Terzaghi–Peck),
//   φ pasir (metode statik) = 27,1 + 0,3 N − 0,00054 N² (Peck–Hanson–Thornburn).
//   Tarik: T_u = Σ c_t · Q_s,i (c_t = 1,0 lempung; 0,75 pasir), T_izin = T_u/FS_t + W′_p (berat efektif tiang beton).
//   Penulangan (SNI 2847:2019): φP_n,maks = 0,65·0,80·[0,85 f′c (A_g − A_st) + f_y A_st] (sengkang, 22.4.2);
//   tarik φT_n = 0,90 f_y A_st; A_st ≥ ρ_min A_g.

const PHI_C = 0.65
const PHI_T = 0.9
/** Faktor reduksi gesekan selimut saat cabut. */
export const CT_CLAY = 1.0
export const CT_SAND = 0.75

export type SptSoil = 'L' | 'P'

export interface SptRow {
  /** Kedalaman atas lapis (m), baris pertama = 0. */
  z: number
  N: number
  soil: SptSoil
  /** Berat isi (kN/m³); null = korelasi. */
  gamma: number | null
  /** Kuat geser tak terdrainase (kPa); null = korelasi. Hanya lempung, metode statik. */
  cu: number | null
}

export interface PileRebarInput {
  /** Beban terfaktor tekan / tarik (kN). */
  Pu: number
  Tu: number
  /** MPa. */
  fc: number
  fy: number
  /** Diameter tulangan memanjang & sengkang, selimut bersih (mm). */
  db: number
  ds: number
  cover: number
  /** Rasio tulangan minimum (%). */
  rhoMin: number
}

export interface PileSptInput {
  shape: PileShape
  /** Diameter / sisi (mm). */
  Dmm: number
  /** Pile cut-off (m dari permukaan) dan panjang tiang dari cut-off ke ujung (m). */
  zc: number
  L: number
  ptype: 'driven' | 'bored'
  material: 'concrete' | 'steel'
  Dw: number
  FS: number
  /** FS tarik. */
  FSt: number
  inclW: 'yes' | 'no'
  method: LayerMethod
  rows: SptRow[]
  /** Gesekan negatif: dasar zona (m dari permukaan). */
  nsf: boolean
  zn: number
  /** Beban layan tekan / tarik (kN) untuk cek geoteknik. */
  P: number
  T: number
  /** Penulangan — hanya tiang beton. */
  rebar: PileRebarInput | null
}

export interface ResolvedRow {
  z: number
  bot: number | null
  N: number
  soil: SptSoil
  gamma: number
  gammaCorr: boolean
  cu: number
  cuCorr: boolean
  phi: number
}

export interface PileRebarResult {
  Pu: number
  Tu: number
  db: number
  ds: number
  fc: number
  fy: number
  cover: number
  rhoMin: number
  Ag: number
  AsT: number
  AsP: number
  AsMin: number
  AsReq: number
  nMin: number
  n: number
  Ab: number
  As: number
  rho: number
  phiPn: number
  phiTn: number
  /** Jarak bersih antar tulangan (mm) dan batas min. */
  clear: number
  clearMin: number
  /** Spasi sengkang maks (mm). */
  sMax: number
  /** Jari-jari pusat tulangan (bulat) / jarak pusat ke tepi (persegi), mm. */
  rc: number
  okP: boolean
  okT: boolean
  okSpacing: boolean
  overMax: boolean
}

type PileOk = Extract<PileResult, { valid: true }>

export type PileSptResult =
  | { valid: false; warn: string[] }
  | (PileOk & {
      method: LayerMethod
      rows: ResolvedRow[]
      Dmm: number
      nsf: boolean
      /** Tarik. */
      Tsu: number
      Wpe: number
      Tallow: number
      P: number
      T: number
      FSt: number
      rebar: PileRebarResult | null
    })

/** γ (kN/m³) dari N-SPT — tabel konsistensi/kepadatan (Terzaghi–Peck, Bowles). */
export function gammaFromN(soil: SptSoil, N: number): number {
  if (soil === 'P') return N < 4 ? 16 : N < 10 ? 17 : N < 30 ? 18 : N < 50 ? 19 : 20
  return N < 2 ? 16 : N < 4 ? 17 : N < 8 ? 17.5 : N < 15 ? 18.5 : N < 30 ? 19.5 : 20.5
}

/** c_u (kPa) lempung dari N-SPT — Terzaghi & Peck (q_u ≈ 12,5 N kPa). */
export const cuFromN = (N: number): number => 6.25 * N

/** φ (°) pasir dari N-SPT — Peck, Hanson & Thornburn (1974), N dibatasi 60. */
export function phiFromN(N: number): number {
  const n = Math.min(Math.max(N, 0), 60)
  return 27.1 + 0.3 * n - 0.00054 * n * n
}

/** Lengkapi baris (korelasi) dan bentuk lapis untuk computePile; lapis terakhir menerus hingga di bawah ujung. */
export function resolveRows(rows: readonly SptRow[], method: LayerMethod, zTip: number): { rows: ResolvedRow[]; layers: PileLayer[] } {
  const out: ResolvedRow[] = rows.map((r, i) => {
    const gammaCorr = !(r.gamma !== null && r.gamma > 0)
    const cuCorr = !(r.cu !== null && r.cu > 0)
    return {
      z: r.z,
      bot: i < rows.length - 1 ? rows[i + 1].z : null,
      N: r.N,
      soil: r.soil,
      gamma: gammaCorr ? gammaFromN(r.soil, r.N) : (r.gamma as number),
      gammaCorr,
      cu: r.soil === 'L' ? (cuCorr ? cuFromN(r.N) : (r.cu as number)) : 0,
      cuCorr: r.soil === 'L' && cuCorr,
      phi: r.soil === 'P' ? phiFromN(r.N) : 0,
    }
  })
  const layers: PileLayer[] = out.map((r) => ({
    soil: r.soil === 'L' ? 'clay' : 'sand',
    H: r.bot !== null ? r.bot - r.z : Math.max(zTip + 2 - r.z, 2),
    gamma: r.gamma,
    cu: r.cu,
    phi: r.phi,
    N: r.N,
    method,
  }))
  return { rows: out, layers }
}

/** Penulangan tiang beton: kebutuhan tarik, tekan, dan minimum; jumlah batang dan cek spasi. */
export function designPileRebar(shape: PileShape, Dmm: number, b: PileRebarInput): PileRebarResult {
  const Ag = shape === 'square' ? Dmm * Dmm : (Math.PI * Dmm * Dmm) / 4
  const AsT = (Math.max(b.Tu, 0) * 1000) / (PHI_T * b.fy)
  // φPn = 0,52 [0,85 f'c (Ag − As) + fy As] ≥ Pu → As
  const AsP = Math.max(0, ((Math.max(b.Pu, 0) * 1000) / (PHI_C * 0.8) - 0.85 * b.fc * Ag) / (b.fy - 0.85 * b.fc))
  const AsMin = (b.rhoMin / 100) * Ag
  const AsReq = Math.max(AsT, AsP, AsMin)
  const Ab = barArea(b.db)
  const nMin = shape === 'square' ? 4 : 6
  let n = Math.max(nMin, Math.ceil(AsReq / Ab - 1e-9))
  if (shape === 'square') n = Math.ceil(n / 4) * 4
  const As = n * Ab
  const phiPn = (PHI_C * 0.8 * (0.85 * b.fc * (Ag - As) + b.fy * As)) / 1000
  const phiTn = (PHI_T * b.fy * As) / 1000
  const rc = Dmm / 2 - b.cover - b.ds - b.db / 2
  let clear: number
  if (shape === 'square') {
    const perSide = n / 4 + 1
    clear = (2 * rc) / (perSide - 1) - b.db
  } else clear = (2 * Math.PI * rc) / n - b.db
  const clearMin = Math.max(1.5 * b.db, 40)
  return {
    Pu: b.Pu, Tu: b.Tu, db: b.db, ds: b.ds, fc: b.fc, fy: b.fy, cover: b.cover, rhoMin: b.rhoMin,
    Ag, AsT, AsP, AsMin, AsReq, nMin, n, Ab, As, rho: As / Ag, phiPn, phiTn, clear, clearMin,
    sMax: Math.min(16 * b.db, 48 * b.ds, Dmm),
    rc,
    okP: b.Pu <= phiPn + 1e-9,
    okT: b.Tu <= phiTn + 1e-9,
    okSpacing: clear >= clearMin - 1e-9,
    overMax: As > 0.08 * Ag,
  }
}

export function computePileSpt(i: PileSptInput): PileSptResult {
  const warn: string[] = []
  if (!i.rows.length) return { valid: false, warn: ['Isi minimal satu baris data SPT.'] }
  const D = i.Dmm / 1000
  const { rows, layers } = resolveRows(i.rows, i.method, i.zc + i.L)
  const r = computePile(
    { shape: i.shape, D, L: i.L, ptype: i.ptype, material: i.material, Dw: i.Dw, FS: i.FS, inclW: i.inclW, zc: i.zc, zn: i.nsf ? i.zn : 0, boredTip: true },
    layers,
  )
  if (!r.valid) return r

  const zLast = rows[rows.length - 1].z
  if (r.zTip > zLast + 1e-9) warn.push(`Ujung tiang (${r.zTip.toFixed(1)} m) di bawah data SPT terakhir (Z = ${zLast.toFixed(1)} m) — lapis terakhir dianggap menerus ke bawah.`)
  if (rows.some((x) => x.gammaCorr || x.cuCorr)) warn.push('Sebagian γ / c_u memakai korelasi N-SPT (ditandai * di laporan) — ganti dengan hasil uji laboratorium bila tersedia.')
  if (i.method === 'static' && rows.some((x) => x.soil === 'P')) warn.push('Metode statik: φ pasir dari korelasi N-SPT (Peck–Hanson–Thornburn).')
  if (i.nsf && r.Qn <= 0) warn.push('Gesekan negatif aktif tetapi zona di atas cut-off — tidak ada gesekan negatif.')

  // Tarik: semua segmen selimut (termasuk zona gesekan negatif) melawan cabut.
  const Tsu = r.segs.reduce((s, g) => s + (g.soil === 'clay' ? CT_CLAY : CT_SAND) * g.Qs, 0)
  let Wpe = 0
  if (i.material === 'concrete') {
    const dry = Math.max(0, Math.min(i.Dw, r.zTip) - r.zc)
    Wpe = r.Ap * (dry * GAMMA_PILE + (r.Leff - dry) * (GAMMA_PILE - GAMMA_W))
  }
  const FSt = i.FSt > 0 ? i.FSt : 3
  const Tallow = Tsu / FSt + Wpe

  const rebar = i.material === 'concrete' && i.rebar ? designPileRebar(i.shape, i.Dmm, i.rebar) : null
  if (rebar) {
    if (!rebar.okP) warn.push('Penampang tiang tidak cukup untuk P_u — perbesar diameter atau mutu beton.')
    if (rebar.overMax) warn.push('A_st > 8% A_g — perbesar penampang.')
    if (!rebar.okSpacing) warn.push(`Jarak bersih tulangan ${rebar.clear.toFixed(0)} mm < ${rebar.clearMin.toFixed(0)} mm — pakai diameter tulangan lebih besar.`)
  }
  if (i.P > r.Qallow) warn.push('Beban layan P melebihi Q izin tekan.')
  if (i.T > Tallow) warn.push('Beban layan T melebihi T izin tarik.')

  // Ganti catatan lingkup computePile (gesekan negatif & cabut kini dihitung).
  const base = r.warn.filter((m) => !m.startsWith('Analisis TIANG TUNGGAL'))
  base.push('Analisis TIANG TUNGGAL. TIDAK termasuk: efisiensi kelompok, beban lateral, penurunan tiang, beban gempa.')

  return {
    ...r,
    warn: [...warn, ...base],
    method: i.method,
    rows,
    Dmm: i.Dmm,
    nsf: i.nsf && r.Qn > 0,
    Tsu,
    Wpe,
    Tallow,
    P: i.P,
    T: i.T,
    FSt,
    rebar,
  }
}
