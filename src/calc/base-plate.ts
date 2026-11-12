// Base plate kolom baja — perletakan SENDI (pinned) & JEPIT (fixed), DFBK/LRFD.
// Acuan: AISC Design Guide 1 (2nd Ed., Fisher & Kloiber) · SNI 1729:2020 (AISC 360-16) Ps. J2, J8 ·
//        SNI 2847:2019 (ACI 318-19) Ps. 17 & 22.8 · SNI 7860:2020 (AISC 341-16) Ps. D2.6 (desain kapasitas).
// Menggantikan port 1:1 build lama (2026-11-12, keputusan pemilik: base plate kembali ke Civil Tools).
//
//   Tumpu beton   : φc·fp(max) = φc·0,85f'c·√(A2/A1) ≤ φc·1,7f'c, φc = 0,65 (J8 / 22.8.3.2); A2 dari pedestal,
//                   frustum 1V:2H pelat (slab), atau tepi manual.
//   Gaya          : satu persamaan untuk semua rezim (Pu + tekan / − tarik, f = N/2 − aN):
//                   e ≤ ecrit → tumpu saja (Y = N − 2e);  K = Mu + Pu·f ≤ 0 → semua angkur tarik (tanpa tumpu);
//                   lainnya → Y = (f + N/2) − √[(f + N/2)² − 2K/qmax], T = qmax·Y − Pu (DG1 §3.4).
//   Tebal pelat   : garis leleh kantilever m, n, λn' (sisi tumpu) dan sisi tarik tp = √(4·T·x / (φb·Fy·B)), φb = 0,9.
//   Angkur        : baja tarik/geser, jebol beton tarik grup, cabut, ledakan sisi, jebol geser, cungkil, interaksi
//                   N/φNn + V/φVn ≤ 1,2 (17.8.3). Kepala angkur: mur hex berat.
//   Geser dasar   : gesekan μ·Pu (DG1 §3.5) atau angkur (17.7).
//   Las kolom     : las sudut keliling profil, metode elastis garis; tekan disalurkan lewat tumpu (J1.4).
//   Kapasitas     : jepit Mpr = 1,1·Ry·Fy·Zx, Vu = 2·Mpr/H; sendi Pu = φc·Pn kolom (E3, Lc = K·H).
// TIDAK termasuk: shear lug, tulangan angkur (17.5.2.1), momen dua arah, prying, beton ringan, angkur pasca-pasang.

import { E_STEEL } from './shared/steel'
import type { SteelProfile } from './shared/steel-profiles'

export type Fixity = 'pinned' | 'fixed'
export type ColumnKind = 'WF' | 'UNP' | 'SHS' | 'PIPE'
export type BaseSupport = 'pedestal' | 'slab' | 'manual'
export type LoadMode = 'actual' | 'capacity'
export type ShearMode = 'friction' | 'anchors'
export type AnchorHead = 'headed' | 'hooked'

/** Mutu angkur (MPa). futa dibatasi min(1,9·fya; 862) (17.6.1.2). */
export const ANCHOR_GRADES: { key: string; label: string; Fy: number; Fu: number }[] = [
  { key: 'F1554-36', label: 'ASTM F1554 Gr.36', Fy: 248, Fu: 400 },
  { key: 'F1554-55', label: 'ASTM F1554 Gr.55', Fy: 380, Fu: 517 },
  { key: 'F1554-105', label: 'ASTM F1554 Gr.105', Fy: 724, Fu: 862 },
  { key: '4.6', label: 'ISO kelas 4.6', Fy: 240, Fu: 400 },
  { key: '8.8', label: 'ISO kelas 8.8', Fy: 640, Fu: 800 },
]

/** Diameter angkur ulir kasar ISO (mm) → luas tarik efektif Ase (mm²). */
export const ANCHOR_SIZES: { d: number; Ase: number }[] = [
  { d: 16, Ase: 157 }, { d: 20, Ase: 245 }, { d: 22, Ase: 303 }, { d: 24, Ase: 353 }, { d: 27, Ase: 459 },
  { d: 30, Ase: 561 }, { d: 33, Ase: 694 }, { d: 36, Ase: 817 }, { d: 39, Ase: 976 }, { d: 42, Ase: 1120 },
  { d: 48, Ase: 1470 }, { d: 56, Ase: 2030 }, { d: 64, Ase: 2680 },
]

/** Lubang angkur pada pelat (mm), mengikuti AISC DG1 Tabel 2.3 (lubang besar) dibulatkan ke metrik. */
export function holeDiameter(da: number): number {
  return da + (da <= 20 ? 13 : da <= 24 ? 16 : da <= 42 ? 21 : da <= 48 ? 25 : 32)
}

const PHI_C = 0.65 // tumpu beton
const PHI_B = 0.9 // leleh lentur pelat
const PHI_W = 0.75 // las
const PHI_FR = 0.75 // geser gesekan (DG1)
const PHI_STEEL_N = 0.75 // baja angkur daktail, tarik
const PHI_STEEL_V = 0.65 // baja angkur daktail, geser
const PHI_PULL = 0.7 // cabut & cungkil kondisi B (17.5.3)

export interface BasePlateInput {
  fixity: Fixity
  colType: ColumnKind
  /** Profil kolom (geometri mm, properti tabel cm-satuan). Sumbu kuat kolom sejajar panjang pelat N. */
  prof: SteelProfile
  /** Mutu kolom (MPa) & faktor tegangan leleh ekspektasi Ry (desain kapasitas). */
  colFy: number
  Ry: number
  /** Pelat landas N (sejajar tinggi kolom d) × B × tp (mm), Fy pelat (MPa). */
  N: number
  B: number
  tp: number
  plateFy: number
  /** Angkur: mutu, diameter (mm), jumlah per baris (2 baris, di tiap ujung N), jarak sumbu angkur ke tepi pelat. */
  anchorGrade: string
  da: number
  nRow: number
  /** aN = tepi pelat arah N → sumbu baris angkur; aB = tepi pelat arah B → angkur terluar (mm). */
  aN: number
  aB: number
  hef: number
  head: AnchorHead
  /** Panjang kait eh (mm), hanya angkur kait. */
  eh: number
  /** Beton & tumpuan. */
  fc: number
  support: BaseSupport
  /** Pedestal Lp (arah N) × Bp (arah B) (mm). */
  Lp: number
  Bp: number
  /** Tebal/tinggi beton di bawah pelat ha (mm) — pedestal, slab, atau manual. */
  ha: number
  /** Manual: jarak sumbu angkur ke tepi beton arah N & arah B (mm). */
  caN: number
  caB: number
  cracked: boolean
  /** Kondisi A = ada tulangan suplemen (φ jebol 0,75), B = tanpa (0,70). */
  condA: boolean
  /** Tebal grout (mm); > 0 → Vsa × 0,8 (17.7.1.2.1) dan μ = 0,55. */
  grout: number
  /** Beban: mode, Pu (+ tekan, − tarik) kN, Mu kN·m, Vu kN (sejajar N). */
  loadMode: LoadMode
  Pu: number
  Mu: number
  Vu: number
  /** Desain kapasitas: tinggi bersih kolom H (mm), faktor panjang efektif K (sendi). */
  H: number
  K: number
  shearMode: ShearMode
  /** Las sudut kolom–pelat: ukuran kaki w (mm), FEXX (MPa). */
  weld: number
  FEXX: number
}

export interface BaseCheck {
  key: string
  label: string
  /** Kebutuhan & kapasitas (satuan `unit`), rasio D/C. */
  dem: number
  cap: number
  dc: number
  unit: string
  ref: string
}

export interface BasePlateResult {
  valid: boolean
  /** Panjang tumpu tidak punya solusi nyata (pelat terlalu kecil). */
  noSol: boolean
  warn: string[]
  inp: BasePlateInput
  /** Geometri kolom (mm): tinggi d (arah N), lebar bf (arah B), tf (sayap / dinding), tw. */
  d: number
  bf: number
  tf: number
  tw: number
  Ag: number
  /** Modulus plastis sumbu kuat (mm³). */
  Zx: number
  /** Beban rencana (sesudah mode kapasitas): Pu (+ tekan), Mu, Vu. */
  Pu: number
  Mu: number
  Vu: number
  cap?: { Mpr?: number; Vcap?: number; Pn?: number; phiPn?: number; lam?: number; Fcr?: number; rmin?: number; Lc?: number }
  /** Tumpu. */
  A1: number
  A2: number
  sqrtR: number
  sqrtLimit: 'geometri' | 'batas 2'
  fpMax: number
  qmax: number
  e: number
  ecrit: number
  f: number
  regime: 'bearing' | 'small' | 'large' | 'uplift'
  Y: number
  fp: number
  /** Gaya tarik total baris angkur tarik (kN) & per angkur. */
  Trow: number
  Trow2: number
  Tanchor: number
  nTens: number
  K: number
  /** Kantilever pelat (mm). */
  m: number
  n: number
  lam: number
  lamN: number
  X: number
  lCrit: number
  tpBrg: number
  x: number
  tpTens: number
  tpReq: number
  /** Angkur. */
  nA: number
  sB: number
  Ase: number
  futa: number
  fya: number
  hole: number
  /** Jarak tepi beton dari sumbu angkur (mm), Infinity = jauh. */
  caN: number
  caB: number
  ha: number
  phiConc: number
  phiNsa: number
  hefUsed: number
  hefReduced: boolean
  Nb: number
  ANc: number
  ANco: number
  psiEdN: number
  psiCN: number
  psiEcN: number
  eN: number
  Ncbg: number
  phiNcbg: number
  Abrg: number
  Np: number
  phiNpn: number
  Nsbg: number | null
  phiNsbg: number | null
  NsbDem: number
  /** Geser. */
  mu: number
  phiVfr: number
  Vsa: number
  phiVsa: number
  nShear: number
  Vanchor: number
  ca1: number
  Vb: number
  AVc: number
  AVco: number
  psiEdV: number
  psiCV: number
  psiHV: number
  Vcbg: number | null
  phiVcbg: number | null
  kcp: number
  Ncpg: number
  phiVcpg: number
  interN: number
  interV: number
  inter: number | null
  /** Las. */
  Lw: number
  Iw: number
  cw: number
  fn: number
  fv: number
  fr: number
  phiRw: number
  /** Semua pemeriksaan & yang menentukan. */
  checks: BaseCheck[]
  gov: BaseCheck | null
}

const ok = (n: number) => Number.isFinite(n)

/** Geometri kolom dalam mm (d sejajar N). */
function columnGeom(type: ColumnKind, p: SteelProfile) {
  if (type === 'PIPE') {
    const D = p.D as number
    return { d: D, bf: D, tf: p.t, tw: p.t, Zx: (p.Zx as number) * 1e3 }
  }
  if (type === 'SHS') return { d: p.H as number, bf: p.B as number, tf: p.t, tw: p.t, Zx: (p.Zx as number) * 1e3 }
  const d = p.H as number, bf = p.B as number, tw = p.tw as number, tf = p.tf as number
  return { d, bf, tf, tw, Zx: bf * tf * (d - tf) + (tw * Math.pow(d - 2 * tf, 2)) / 4 }
}

/** Garis las sudut keliling profil: panjang total, momen inersia garis terhadap sumbu kuat, panjang penahan geser. */
function weldGroup(type: ColumnKind, d: number, bf: number, tf: number, tw: number) {
  if (type === 'PIPE') {
    const R = d / 2
    return { L: Math.PI * d, I: Math.PI * R * R * R, Lv: (Math.PI * d) / 2 }
  }
  if (type === 'SHS') return { L: 2 * (d + bf), I: 2 * bf * (d / 2) ** 2 + (2 * d ** 3) / 12, Lv: 2 * d }
  // WF & UNP: muka luar & dalam sayap, dua sisi badan (UNP: badan luar penuh di antara sayap).
  const hw = d - 2 * tf
  const yo = d / 2, yi = d / 2 - tf
  const inner = 2 * (bf - tw)
  // WF: dua sisi badan setinggi hw; UNP: punggung badan setinggi d + sisi dalam hw
  const web = type === 'WF' ? 2 * hw : d + hw
  const L = 2 * bf + inner + web
  const I = 2 * bf * yo * yo + inner * yi * yi + (type === 'WF' ? (2 * hw ** 3) / 12 : (d ** 3 + hw ** 3) / 12)
  return { L, I, Lv: web }
}

/** Fcr tekuk lentur (E3) untuk KL/r. */
function fcr(lam: number, Fy: number): number {
  if (!(lam > 0)) return Fy
  const Fe = (Math.PI * Math.PI * E_STEEL) / (lam * lam)
  return Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe
}

export function computeBasePlate(v: BasePlateInput): BasePlateResult {
  const warn: string[] = []
  const g = columnGeom(v.colType, v.prof)
  const { d, bf, tf, tw, Zx } = g
  const Ag = v.prof.A * 100
  const { N, B, tp } = v
  const fc = v.fc
  const pinned = v.fixity === 'pinned'

  // ---------- beban rencana ----------
  let Pu = v.Pu, Mu = pinned ? 0 : Math.abs(v.Mu), Vu = Math.abs(v.Vu)
  let cap: BasePlateResult['cap']
  if (v.loadMode === 'capacity') {
    if (pinned) {
      const rmin = (v.prof.imin as number) * 10
      const Lc = v.K * v.H
      const lam = rmin > 0 ? Lc / rmin : 0
      const Fcr = fcr(lam, v.colFy)
      const Pn = (Fcr * Ag) / 1000
      cap = { Pn, phiPn: 0.9 * Pn, lam, Fcr, rmin, Lc }
      Pu = 0.9 * Pn
      if (lam > 200) warn.push('KL/r kolom = ' + lam.toFixed(0) + ' > 200 — periksa panjang tekuk; Pu kapasitas menjadi kecil.')
    } else {
      const Mpr = (1.1 * v.Ry * v.colFy * Zx) / 1e6
      const Vcap = v.H > 0 ? (2 * Mpr) / (v.H / 1000) : 0
      cap = { Mpr, Vcap }
      Mu = Mpr
      Vu = Vcap
    }
  }
  if (pinned && Math.abs(v.Mu) > 0 && v.loadMode === 'actual')
    warn.push('Perletakan sendi: Mu diabaikan (pelat & angkur sendi tidak dirancang menahan momen).')

  // ---------- jarak tepi beton & A2 ----------
  const f = N / 2 - v.aN // pusat pelat → baris angkur
  let caN: number, caB: number, ha: number, A2: number, sqrtGeo: number
  const A1 = N * B
  if (v.support === 'slab') {
    caN = Infinity
    caB = Infinity
    ha = v.ha
    // frustum kemiringan 1V:2H di dalam tebal slab (22.8.3)
    sqrtGeo = Math.min((N + 4 * ha) / N, (B + 4 * ha) / B)
    A2 = A1 * sqrtGeo * sqrtGeo
  } else {
    let Lp: number, Bp: number
    if (v.support === 'pedestal') {
      Lp = v.Lp
      Bp = v.Bp
      caN = (Lp - N) / 2 + v.aN
      caB = (Bp - B) / 2 + v.aB
    } else {
      caN = v.caN
      caB = v.caB
      Lp = N + 2 * (caN - v.aN)
      Bp = B + 2 * (caB - v.aB)
    }
    ha = v.ha
    if (Lp < N || Bp < B) warn.push('Beton tumpuan lebih kecil dari pelat (Lp × Bp < N × B) — perbesar pedestal atau jarak tepi.')
    sqrtGeo = Math.max(1, Math.min(Lp / N, Bp / B))
    A2 = A1 * sqrtGeo * sqrtGeo
  }
  const sqrtR = Math.max(1, Math.min(sqrtGeo, 2))
  const fpMax = PHI_C * 0.85 * fc * sqrtR // MPa (sudah × φc)
  const qmax = fpMax * B // N/mm

  // ---------- rezim gaya (DG1 §3.3–3.4, diperluas ke tarik) ----------
  const PuN = Pu * 1000, MuN = Mu * 1e6
  const e = PuN > 0 ? MuN / PuN : Infinity
  const ecrit = N / 2 - (PuN > 0 ? PuN / (2 * qmax) : 0)
  let regime: BasePlateResult['regime'], Y = 0, fp = 0, Trow = 0, Trow2 = 0
  const K = MuN + PuN * f
  let noSol = false
  if (PuN > 0 && (MuN <= 0 || e <= ecrit + 1e-9)) {
    regime = MuN > 0 ? 'small' : 'bearing'
    Y = N - 2 * (MuN > 0 ? e : 0)
    fp = Y > 0 ? PuN / (B * Y) : Infinity
  } else if (K <= 0) {
    regime = 'uplift'
    const Tu = -PuN
    Trow = Tu / 2 + (f > 0 ? MuN / (2 * f) : 0)
    Trow2 = Tu / 2 - (f > 0 ? MuN / (2 * f) : 0)
  } else {
    regime = 'large'
    const h = f + N / 2
    const disc = h * h - (2 * K) / qmax
    if (disc < 0) {
      noSol = true
      Y = h
      warn.push('Tidak ada solusi nyata panjang tumpu Y (DG1 Pers. 3.4.4) — pelat/beton terlalu kecil untuk momen ini; perbesar N, B, atau f\'c.')
    } else Y = h - Math.sqrt(disc)
    fp = fpMax
    Trow = qmax * Y - PuN
    if (Y > N) warn.push('Y = ' + Y.toFixed(0) + ' mm > N — zona tekan melebihi panjang pelat; perbesar N.')
  }
  const nRow = Math.max(1, Math.round(v.nRow))
  const nA = 2 * nRow
  const nTens = Trow2 > 1e-6 ? nA : Trow > 1e-6 ? nRow : 0
  const Tanchor = Trow / nRow / 1000 // kN per angkur pada baris paling tertarik

  // ---------- tebal pelat ----------
  let m: number, n: number
  if (v.colType === 'PIPE') {
    m = (N - 0.8 * d) / 2
    n = (B - 0.8 * d) / 2
  } else if (v.colType === 'SHS') {
    m = (N - 0.95 * d) / 2
    n = (B - 0.95 * bf) / 2
  } else {
    m = (N - 0.95 * d) / 2
    n = (B - 0.8 * bf) / 2
  }
  m = Math.max(0, m)
  n = Math.max(0, n)
  let lam = 1, lamN = 0, X = 0
  if ((v.colType === 'WF' || v.colType === 'UNP') && regime === 'bearing') {
    const Pp = 0.85 * fc * sqrtR * A1 // N, nominal
    X = Math.min(((4 * d * bf) / Math.pow(d + bf, 2)) * (PuN / (PHI_C * Pp)), 1)
    lam = Math.min(1, (2 * Math.sqrt(X)) / (1 + Math.sqrt(Math.max(0, 1 - X))))
    lamN = (lam * Math.sqrt(d * bf)) / 4
  }
  const tpFor = (c: number): number => {
    if (c <= 0 || !ok(fp) || fp <= 0) return 0
    const Mpl = Y >= c ? (fp * c * c) / 2 : fp * Y * (c - Y / 2)
    return Math.sqrt((4 * Math.max(0, Mpl)) / (PHI_B * v.plateFy))
  }
  const lCrit = Math.max(m, n, lamN)
  const tpBrg = regime === 'uplift' ? 0 : Math.max(tpFor(m), tpFor(n), tpFor(lamN))
  // sisi tarik: lengan dari sumbu angkur ke garis tengah sayap/dinding terdekat (DG1 Pers. 3.4.6)
  const x = Math.abs(f - (d / 2 - tf / 2))
  const tpTens = Trow > 0 ? Math.sqrt((4 * Trow * x) / (PHI_B * v.plateFy * B)) : 0
  const tpReq = Math.max(tpBrg, tpTens)

  // ---------- angkur: baja ----------
  const grade = ANCHOR_GRADES.find((a) => a.key === v.anchorGrade) ?? ANCHOR_GRADES[0]
  const fya = grade.Fy
  const futa = Math.min(grade.Fu, 1.9 * fya, 862)
  const size = ANCHOR_SIZES.find((s) => s.d === v.da)
  const Ase = size ? size.Ase : 0.58 * v.da * v.da
  const da = v.da
  const hole = holeDiameter(da)
  const phiNsa = (PHI_STEEL_N * Ase * futa) / 1000
  const sB = nRow > 1 ? (B - 2 * v.aB) / (nRow - 1) : 0
  const Wb = nRow > 1 ? B - 2 * v.aB : 0 // lebar baris angkur arah B

  // ---------- angkur: jebol beton tarik grup (17.6.2) ----------
  const condA = v.condA
  const phiConc = condA ? 0.75 : 0.7
  let hef = v.hef
  const edges = [caN, caN, caB, caB]
  const near = edges.filter((c) => c < 1.5 * hef).length
  let hefReduced = false
  if (near >= 3) {
    const caMax = Math.max(...edges.filter((c) => ok(c)))
    const sMax = Math.max(sB, 2 * f)
    const h2 = Math.max(caMax / 1.5, sMax / 3)
    if (h2 < hef) {
      hef = h2
      hefReduced = true
    }
  }
  const lamA = 1
  const Nb = (hef >= 280 && hef <= 635 ? 3.9 * lamA * Math.sqrt(fc) * Math.pow(hef, 5 / 3) : 10 * lamA * Math.sqrt(fc) * Math.pow(hef, 1.5)) / 1000
  const ANco = 9 * hef * hef
  const c15 = 1.5 * hef
  const extB = Math.min(c15, caB)
  const lenB = Wb + 2 * extB
  let lenN: number
  if (nTens === nA) lenN = 2 * f + 2 * Math.min(c15, caN)
  else lenN = Math.min(c15, caN) + Math.min(c15, 2 * f)
  const ANc = nTens > 0 ? Math.min(lenN * lenB, nTens * ANco) : ANco
  const caMinN = Math.min(caN, caB)
  const psiEdN = caMinN >= c15 ? 1 : 0.7 + (0.3 * caMinN) / c15
  const psiCN = v.cracked ? 1 : 1.25
  // eksentrisitas resultan tarik terhadap titik berat angkur tertarik (dua baris tak sama)
  let eN = 0
  if (nTens === nA && Trow + Trow2 > 0) eN = (f * (Trow - Trow2)) / (Trow + Trow2)
  const psiEcN = 1 / (1 + eN / c15)
  const Ncbg = (ANc / ANco) * psiEcN * psiEdN * psiCN * Nb
  const phiNcbg = phiConc * Ncbg
  const Ttot = (Trow + Math.max(0, Trow2)) / 1000

  // cabut (17.6.3)
  const F = 1.5 * da + 3.2 // lebar mur hex berat (≈ AISC: 1,5d + 1/8")
  const Abrg = 0.866 * F * F - (Math.PI * da * da) / 4
  const psiCP = v.cracked ? 1 : 1.4
  const Np = v.head === 'headed' ? (8 * Abrg * fc) / 1000 : (0.9 * fc * Math.min(Math.max(v.eh, 3 * da), 4.5 * da) * da) / 1000
  const phiNpn = PHI_PULL * psiCP * Np

  // ledakan sisi (17.6.4) — angkur berkepala dengan hef > 2,5·ca1; tepi terdekat menentukan anggota "sebaris tepi"
  let Nsbg: number | null = null, phiNsbg: number | null = null, NsbDem = 0
  const ca1sb = Math.min(caN, caB)
  if (v.head === 'headed' && ok(ca1sb) && v.hef > 2.5 * ca1sb && Trow > 1e-6) {
    const alongN = caN <= caB // tepi arah N → anggota = baris tarik; tepi arah B → angkur ujung tiap baris
    const ca2 = alongN ? caB : caN
    const k2 = ok(ca2) && ca2 < 3 * ca1sb ? (1 + ca2 / ca1sb) / 4 : 1
    const Nsb = (13 * ca1sb * Math.sqrt(Abrg) * lamA * Math.sqrt(fc) * k2) / 1000
    const sOut = alongN ? (nRow - 1) * sB : nTens === nA ? 2 * f : 0
    const nEdge = alongN ? nRow : nTens === nA ? 2 : 1
    if (nEdge > 1 && sOut < 6 * ca1sb) {
      Nsbg = (1 + sOut / (6 * ca1sb)) * Nsb
      NsbDem = alongN ? Trow / 1000 : Tanchor * nEdge
    } else {
      Nsbg = Nsb
      NsbDem = Tanchor
    }
    phiNsbg = phiConc * Nsbg
  }

  // ---------- geser ----------
  const mu = v.grout > 0 ? 0.55 : 0.7
  const phiVfr = PHI_FR * Math.min(mu * Math.max(0, Pu), (0.2 * fc * A1) / 1000)
  const Vsa = ((0.6 * Ase * futa) / 1000) * (v.grout > 0 ? 0.8 : 1)
  const phiVsa = PHI_STEEL_V * Vsa
  const nShear = nA
  const Vanchor = Vu / nShear
  // jebol beton geser: geser sejajar N menuju tepi, seluruh Vu oleh baris depan (konservatif), ca1 = caN
  const ca1 = caN
  const le = Math.min(v.hef, 8 * da)
  let Vb = 0, AVc = 0, AVco = 0, psiEdV = 1, psiCV = 1, psiHV = 1
  let Vcbg: number | null = null, phiVcbg: number | null = null
  if (ok(ca1) && v.shearMode === 'anchors' && Vu > 0) {
    Vb = Math.min(0.6 * Math.pow(le / da, 0.2) * Math.sqrt(da) * lamA * Math.sqrt(fc) * Math.pow(ca1, 1.5), 3.7 * lamA * Math.sqrt(fc) * Math.pow(ca1, 1.5)) / 1000
    AVco = 4.5 * ca1 * ca1
    const sideB = Math.min(1.5 * ca1, caB)
    AVc = Math.min((Wb + 2 * sideB) * Math.min(1.5 * ca1, ha), nRow * AVco)
    psiEdV = caB >= 1.5 * ca1 ? 1 : 0.7 + (0.3 * caB) / (1.5 * ca1)
    psiCV = v.cracked ? (condA ? 1.2 : 1) : 1.4
    psiHV = ha < 1.5 * ca1 ? Math.sqrt((1.5 * ca1) / ha) : 1
    Vcbg = (AVc / AVco) * psiEdV * psiCV * psiHV * Vb
    phiVcbg = phiConc * Vcbg
  }
  // cungkil (17.7.3): seluruh angkur, ψec = 1
  const kcp = v.hef < 65 ? 1 : 2
  const ANcAll = Math.min((2 * f + 2 * Math.min(c15, caN)) * lenB, nA * ANco)
  const Ncpg = (ANcAll / ANco) * psiEdN * psiCN * Nb
  const phiVcpg = PHI_PULL * kcp * Ncpg

  // ---------- las kolom–pelat ----------
  const wg = weldGroup(v.colType, d, bf, tf, tw)
  const cw = d / 2
  const Tw = Math.max(0, -PuN) // tekan lewat tumpu (J1.4)
  const fn = Tw / wg.L + (MuN * cw) / wg.I // N/mm
  const fv = (Vu * 1000) / wg.Lv
  const fr = Math.sqrt(fn * fn + fv * fv)
  const phiRw = PHI_W * 0.6 * v.FEXX * 0.707 * v.weld // N/mm

  // ---------- rekap pemeriksaan ----------
  const checks: BaseCheck[] = []
  const add = (key: string, label: string, dem: number, capv: number, unit: string, ref: string) =>
    checks.push({ key, label, dem, cap: capv, dc: capv > 0 ? dem / capv : dem > 0 ? Infinity : 0, unit, ref })
  if (regime !== 'uplift') add('brg', 'Tumpu beton fp ≤ φc·fp(max)', fp, fpMax, 'MPa', 'J8 / 22.8.3')
  add('tp', 'Tebal pelat tp,perlu ≤ tp', tpReq, tp, 'mm', 'DG1 §3.1, 3.4')
  const tensionOn = Trow > 1e-6
  let interN = 0
  if (tensionOn) {
    add('Nsa', 'Angkur — baja tarik', Tanchor, phiNsa, 'kN', '17.6.1')
    add('Ncb', 'Angkur — jebol beton tarik', Ttot, phiNcbg, 'kN', '17.6.2')
    add('Np', 'Angkur — cabut', Tanchor, phiNpn, 'kN', '17.6.3')
    if (phiNsbg != null) add('Nsb', 'Angkur — ledakan sisi', NsbDem, phiNsbg, 'kN', '17.6.4')
    interN = Math.max(Tanchor / phiNsa, Ttot / phiNcbg, Tanchor / phiNpn, phiNsbg != null ? NsbDem / phiNsbg : 0)
  }
  let interV = 0
  if (Vu > 0) {
    if (v.shearMode === 'friction') add('Vfr', 'Geser dasar — gesekan', Vu, phiVfr, 'kN', 'DG1 §3.5.1')
    else {
      add('Vsa', 'Angkur — baja geser', Vanchor, phiVsa, 'kN', '17.7.1')
      if (phiVcbg != null) add('Vcb', 'Angkur — jebol beton geser', Vu, phiVcbg, 'kN', '17.7.2')
      add('Vcp', 'Angkur — cungkil (pryout)', Vu, phiVcpg, 'kN', '17.7.3')
      interV = Math.max(Vanchor / phiVsa, phiVcbg != null ? Vu / phiVcbg : 0, Vu / phiVcpg)
    }
  }
  let inter: number | null = null
  if (interN > 0.2 && interV > 0.2) {
    inter = interN + interV
    add('NV', 'Angkur — interaksi tarik + geser', inter, 1.2, '', '17.8.3')
  }
  if (v.weld > 0 && (fn > 0 || fv > 0)) add('weld', 'Las sudut kolom–pelat', fr, phiRw, 'N/mm', 'J2.4')

  let gov: BaseCheck | null = null
  for (const c of checks) if (!gov || c.dc > gov.dc) gov = c

  // ---------- peringatan detail ----------
  if (N < d + 2 * 10 || B < bf + 2 * 10) warn.push('Pelat terlalu kecil terhadap jejak kolom (N ≥ d + 20 mm dan B ≥ bf + 20 mm dianjurkan untuk las).')
  if (f <= d / 2 && v.colType !== 'PIPE' && v.colType !== 'SHS')
    warn.push('Baris angkur berada di dalam jejak kolom (aN > (N − d)/2) — lengan lentur pelat sisi tarik dihitung ke garis tengah sayap; periksa ruang kunci/mur.')
  if (v.aN < 1.5 * da || v.aB < 1.5 * da) warn.push('Jarak tepi angkur pada pelat < 1,5·da — perbesar aN/aB (praktik AISC J3.4 & ruang ring pelat).')
  if (nA < 4) warn.push('Jumlah angkur < 4 — OSHA 29 CFR 1926.755 mensyaratkan minimal 4 angkur untuk stabilitas ereksi kolom.')
  if (nRow > 1 && sB < 4 * da) warn.push('Spasi angkur ' + sB.toFixed(0) + ' mm < 4·da = ' + (4 * da).toFixed(0) + ' mm (17.9.2).')
  if (ok(caMinN) && caMinN < 6 * da) warn.push('Jarak tepi beton ' + caMinN.toFixed(0) + ' mm < 6·da = ' + (6 * da).toFixed(0) + ' mm — anjuran minimum angkur dikencangkan (17.9.2).')
  if (hefReduced) warn.push('Tiga tepi atau lebih < 1,5·hef → hef dihitung ulang = ' + hef.toFixed(0) + ' mm (17.6.2.1.2).')
  if (v.hef > (2 / 3) * ha) warn.push('hef > 2/3·ha — tebal beton kurang untuk kedalaman tanam; perdalam pedestal/slab atau kurangi hef.')
  if (v.head === 'hooked' && tensionOn) warn.push('Angkur kait: kuat cabut kecil dan hanya untuk angkur yang tidak menerima tarik besar (DG1 §3.2.2) — pertimbangkan angkur berkepala.')
  if (v.shearMode === 'friction' && Vu > 0 && Pu <= 0) warn.push('Pu ≤ 0 — tidak ada gesekan; pilih geser oleh angkur atau pasang shear lug.')
  if (v.shearMode === 'anchors' && v.grout > 50) warn.push('Grout > 50 mm dengan geser oleh angkur — lentur angkur perlu ditinjau (DG1 §3.5.2); pertimbangkan shear lug.')
  if (regime === 'large' && !noSol) warn.push('e = ' + (e === Infinity ? '∞' : e.toFixed(0)) + ' mm > ecrit = ' + ecrit.toFixed(0) + ' mm → momen BESAR: angkur menahan tarik ' + (Trow / 1000).toFixed(1) + ' kN.')
  if (regime === 'small') warn.push('e = ' + e.toFixed(0) + ' mm ≤ ecrit = ' + ecrit.toFixed(0) + ' mm → momen KECIL: tumpu menahan sendiri, angkur tidak tarik.')
  if (regime === 'uplift') warn.push('Gaya angkat (uplift): tidak ada tumpu beton, seluruh gaya ditahan angkur.')
  if (!pinned && v.loadMode === 'capacity') warn.push('Desain kapasitas jepit: las kolom–pelat sebaiknya CJP (SNI 7860 Ps. D2.6c); cek las sudut di sini sebagai pembanding.')
  if (pinned && tp > 0 && tp < 12) warn.push('tp < 12 mm — DG1 menganjurkan tebal minimum ±12 mm untuk ereksi dan kerataan.')
  if (gov && gov.dc > 1) warn.push('D/C menentukan = ' + gov.dc.toFixed(2) + ' > 1 (' + gov.label + ') — ubah dimensi/mutu.')

  return {
    valid: true, noSol,
    warn, inp: v, d, bf, tf, tw, Ag, Zx, Pu, Mu, Vu, cap,
    A1, A2, sqrtR, sqrtLimit: sqrtGeo > 2 ? 'batas 2' : 'geometri', fpMax, qmax, e, ecrit, f, regime, Y, fp,
    Trow: Trow / 1000, Trow2: Math.max(0, Trow2) / 1000, Tanchor, nTens, K: K / 1e6,
    m, n, lam, lamN, X, lCrit, tpBrg, x, tpTens, tpReq,
    nA, sB, Ase, futa, fya, hole, caN, caB, ha, phiConc, phiNsa, hefUsed: hef, hefReduced, Nb, ANc, ANco, psiEdN, psiCN, psiEcN, eN,
    Ncbg, phiNcbg, Abrg, Np, phiNpn, Nsbg, phiNsbg, NsbDem,
    mu, phiVfr, Vsa, phiVsa, nShear, Vanchor, ca1, Vb, AVc, AVco, psiEdV, psiCV, psiHV, Vcbg, phiVcbg, kcp, Ncpg, phiVcpg,
    interN, interV, inter,
    Lw: wg.L, Iw: wg.I, cw, fn, fv, fr, phiRw,
    checks, gov,
  }
}
