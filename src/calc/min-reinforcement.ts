// Tulangan minimum — balok (lentur + geser), kolom persegi/lingkaran (ikat/spiral), pelat, pile cap. SNI 2847:2019.
// Port 1:1 dari modules/min-reinforcement/module.js (compute), diverifikasi golden test.

import { barArea, rhoMinBeam, rhoShrinkage } from './shared/concrete'

export type MinRebarElement = 'balok' | 'kolom-p' | 'kolom-l' | 'pelat' | 'pilecap'

export const MIN_REBAR_BARS = [10, 13, 16, 19, 22, 25, 29, 32, 36]
export const MIN_REBAR_STIRRUPS = [8, 10, 13]

export interface MinRebarInput {
  elem: MinRebarElement
  fc: number
  fy: number
  /** Mutu sengkang/spiral (MPa). */
  fyt: number
  /** Balok/kolom persegi: b × h; pelat & pile cap: tebal h (mm). */
  b: number
  h: number
  /** Kolom lingkaran (mm). */
  D: number
  /** Pile cap B × L (mm). */
  B: number
  L: number
  cc: number
  /** Diameter tulangan utama, sengkang, spiral (mm, dari select). */
  db: number | string
  ds: number | string
  dsp: number | string
  tieType: 'ikat' | 'spiral'
  arah: 'satu' | 'dua'
}

export interface MinRebarResult {
  elem: MinRebarElement
  warn: string[]
  valid: boolean
  fc?: number
  fy?: number
  db?: number
  ds?: number
  Ab?: number
  // balok
  bw?: number
  h?: number
  cc?: number
  fyt?: number
  d?: number
  rho1?: number
  rho2?: number
  rhoMin?: number
  govSqrt?: boolean
  AsMin?: number
  n?: number
  AsProv?: number
  sClearMin?: number
  sClear?: number
  avPerS?: number
  Av?: number
  sAv?: number
  sMaxD?: number
  sPakai?: number
  // kolom
  b?: number
  Ag?: number
  AstMin?: number
  AstMax?: number
  rhoProv?: number
  layout?: { nx: number; ny: number }
  tieDia?: number
  sTie?: number
  sTiePakai?: number
  D?: number
  spiral?: boolean
  dsp?: number
  nMin?: number
  ringR?: number
  Dc?: number
  Ach?: number
  rhoS?: number
  sPitch?: number
  sPitchPakai?: number
  sPitchClear?: number
  // pelat & pile cap
  dua?: boolean
  sTheo?: number
  sMax?: number
  sMax2?: number
  B?: number
  L?: number
  nDirB?: number
  nDirL?: number
  AsTotB?: number
  AsTotL?: number
}

type R = MinRebarResult & { fc: number; fy: number; db: number; ds: number; Ab: number }

export function computeMinRebar(v: MinRebarInput): MinRebarResult {
  const r: MinRebarResult = { elem: v.elem, warn: [], valid: true }
  const { fc, fy } = v
  if (!(fc > 0) || !(fy > 0)) { r.valid = false; return r }
  const db = parseFloat(String(v.db)), ds = parseFloat(String(v.ds))
  Object.assign(r, { fc, fy, db, ds, Ab: barArea(db) })
  const rr = r as R
  if (v.elem === 'balok') beam(rr, v)
  else if (v.elem === 'kolom-p') rectColumn(rr, v)
  else if (v.elem === 'kolom-l') roundColumn(rr, v)
  else if (v.elem === 'pelat') slab(rr, v)
  else pileCap(rr, v)
  return r
}

function beam(r: R, v: MinRebarInput): void {
  const bw = v.b, h = v.h, cc = v.cc, fyt = v.fyt
  if (!(bw > 0) || !(h > 0) || !(cc >= 0) || !(fyt > 0)) { r.valid = false; return }
  Object.assign(r, { bw, h, cc, fyt })
  const d = h - cc - r.ds - r.db / 2 // satu lapis
  r.d = d
  if (d <= 0) { r.valid = false; return }
  const rho1 = (0.25 * Math.sqrt(r.fc)) / r.fy // Ps. 9.6.1.2(a)
  const rho2 = 1.4 / r.fy // Ps. 9.6.1.2(b)
  const rhoMin = rhoMinBeam(r.fc, r.fy)
  const AsMin = rhoMin * bw * d
  const n = Math.max(2, Math.ceil(AsMin / r.Ab)) // min praktis 2 batang (sudut sengkang)
  const sClearMin = Math.max(25, r.db)
  const sClear = (bw - 2 * (cc + r.ds) - n * r.db) / Math.max(1, n - 1)
  Object.assign(r, { rho1, rho2, rhoMin, govSqrt: rho1 >= rho2, AsMin, n, AsProv: n * r.Ab, sClearMin, sClear })
  if (n > 1 && sClear < sClearMin)
    r.warn.push('Spasi bersih ' + sClear.toFixed(0) + ' mm < ' + sClearMin.toFixed(0) + ' mm (Ps. 25.2.1) — perbesar bw, perkecil db, atau susun 2 lapis.')
  // Geser minimum (Ps. 9.6.3.4): Av/s ≥ max(0,062√f'c, 0,35)·bw/fyt.
  const avPerS = (Math.max(0.062 * Math.sqrt(r.fc), 0.35) * bw) / fyt
  const Av = 2 * barArea(r.ds) // 2 kaki
  const sAv = Av / avPerS
  const sMaxD = Math.min(d / 2, 600) // Ps. 9.7.6.2.2 (Vs kecil)
  Object.assign(r, { avPerS, Av, sAv, sMaxD, sPakai: Math.floor(Math.min(sAv, sMaxD) / 10) * 10 })
  if (h > 900) r.warn.push('h > 900 mm — perlu tulangan kulit (skin) di kedua sisi badan (Ps. 9.7.2.3).')
}

/** Distribusi batang keliling kolom persegi: 4 sudut + sisanya ke sisi dengan jarak terbesar. */
export function layoutRect(n: number, b: number, h: number): { nx: number; ny: number } {
  let nx = 2, ny = 2, rem = n - 4
  while (rem > 0) {
    if (b / (nx - 1) >= h / (ny - 1)) nx++
    else ny++
    rem -= 2
  }
  return { nx, ny }
}

const tieMinDia = (db: number): number => (db <= 32 ? 10 : 13) // Ps. 25.7.2.2

function rectColumn(r: R, v: MinRebarInput): void {
  const b = v.b, h = v.h, cc = v.cc
  if (!(b > 0) || !(h > 0) || !(cc >= 0)) { r.valid = false; return }
  const Ag = b * h
  const AstMin = 0.01 * Ag // Ps. 10.6.1.1
  let n = Math.max(4, Math.ceil(AstMin / r.Ab)) // min 4 batang (Ps. 10.7.3.1)
  if (n % 2 === 1) n++ // genap agar simetris
  const layout = layoutRect(n, b, h)
  const cx = b - 2 * (cc + r.ds) - r.db // pusat sudut-ke-sudut
  const cy = h - 2 * (cc + r.ds) - r.db
  const sClearMin = Math.max(1.5 * r.db, 40)
  const sClear = Math.min(cx / (layout.nx - 1), cy / (layout.ny - 1)) - r.db
  Object.assign(r, { b, h, cc, Ag, AstMin, AstMax: 0.08 * Ag, n, AsProv: n * r.Ab, rhoProv: (n * r.Ab) / Ag, layout, sClearMin, sClear })
  if (sClear < sClearMin)
    r.warn.push('Spasi bersih antar batang ' + sClear.toFixed(0) + ' mm < ' + sClearMin.toFixed(0) + ' mm (Ps. 25.2.3) — perbesar penampang atau kurangi jumlah batang (db lebih besar).')
  const tieDia = tieMinDia(r.db)
  r.tieDia = tieDia
  if (r.ds < tieDia) r.warn.push('Sengkang ikat Ø' + r.ds + ' < minimum Ø' + tieDia + ' untuk tulangan D' + r.db + ' (Ps. 25.7.2.2).')
  const sTie = Math.min(16 * r.db, 48 * r.ds, Math.min(b, h)) // Ps. 25.7.2.1
  r.sTie = sTie
  r.sTiePakai = Math.floor(sTie / 10) * 10
}

function roundColumn(r: R, v: MinRebarInput): void {
  const D = v.D, cc = v.cc, spiral = v.tieType === 'spiral'
  if (!(D > 0) || !(cc >= 0)) { r.valid = false; return }
  const dsp = spiral ? parseFloat(String(v.dsp)) : r.ds
  const Ag = (Math.PI / 4) * D * D
  const AstMin = 0.01 * Ag
  const nMin = spiral ? 6 : 4 // Ps. 10.7.3.1
  const n = Math.max(nMin, Math.ceil(AstMin / r.Ab))
  const rb = D / 2 - cc - dsp - r.db / 2 // jari-jari lingkaran pusat batang
  const sClearMin = Math.max(1.5 * r.db, 40)
  const sClear = 2 * rb * Math.sin(Math.PI / n) - r.db
  Object.assign(r, { D, cc, spiral, dsp, Ag, AstMin, AstMax: 0.08 * Ag, nMin, n, AsProv: n * r.Ab, rhoProv: (n * r.Ab) / Ag, ringR: rb, sClearMin, sClear })
  if (rb <= 0) { r.valid = false; return }
  if (sClear < sClearMin)
    r.warn.push('Spasi bersih antar batang ' + sClear.toFixed(0) + ' mm < ' + sClearMin.toFixed(0) + ' mm (Ps. 25.2.3) — gunakan db lebih besar (jumlah lebih sedikit) atau perbesar D.')

  if (spiral) {
    let fyt = v.fyt
    if (!(fyt > 0)) { r.valid = false; return }
    if (fyt > 700) { fyt = 700; r.warn.push('fyt spiral dibatasi 700 MPa (Ps. 25.7.3.3).') }
    const Dc = D - 2 * cc // diameter inti (luar-luar spiral)
    const Ach = (Math.PI / 4) * Dc * Dc
    const rhoS = (0.45 * (Ag / Ach - 1) * r.fc) / fyt // Ps. 25.7.3.3
    const sPitch = (4 * barArea(dsp)) / (Dc * rhoS) // ρs = 4·Asp/(Dc·s)
    let sPitchPakai = Math.floor(sPitch / 5) * 5
    let sPitchClear = sPitchPakai - dsp // pitch bersih 25–75 (Ps. 25.7.3.1)
    if (sPitchClear > 75) {
      sPitchPakai = 75 + dsp
      r.warn.push('Pitch bersih dibatasi maksimum 75 mm (Ps. 25.7.3.1).')
      sPitchClear = 75
    }
    if (sPitchClear < 25) r.warn.push('Pitch bersih ' + sPitchClear.toFixed(0) + ' mm < 25 mm (Ps. 25.7.3.1) — gunakan batang spiral lebih besar.')
    Object.assign(r, { fyt, Dc, Ach, rhoS, sPitch, sPitchPakai, sPitchClear })
  } else {
    const tieDia = tieMinDia(r.db)
    r.tieDia = tieDia
    if (r.ds < tieDia) r.warn.push('Sengkang ikat Ø' + r.ds + ' < minimum Ø' + tieDia + ' untuk tulangan D' + r.db + ' (Ps. 25.7.2.2).')
    const sTie = Math.min(16 * r.db, 48 * r.ds, D)
    r.sTie = sTie
    r.sTiePakai = Math.floor(sTie / 10) * 10
  }
}

function slab(r: R, v: MinRebarInput): void {
  const h = v.h
  if (!(h > 0)) { r.valid = false; return }
  const dua = v.arah === 'dua'
  const rhoMin = rhoShrinkage(r.fy)
  const AsMin = rhoMin * 1000 * h // mm²/m
  const sTheo = (r.Ab * 1000) / AsMin
  const sMax = Math.min(3 * h, 450) // Ps. 7.7.2.3 / 24.4.3.3
  const sMax2 = Math.min(2 * h, 450) // dua arah, penampang kritis (Ps. 8.7.2.2)
  const sPakai = Math.floor(Math.min(sTheo, sMax) / 5) * 5
  Object.assign(r, { h, dua, rhoMin, AsMin, sTheo, sMax, sMax2, sPakai, AsProv: (r.Ab * 1000) / sPakai })
  if (sPakai < 25 + r.db) r.warn.push('Spasi sangat rapat — pertimbangkan batang lebih besar.')
  if (dua) r.warn.push('Pelat dua arah: pada penampang kritis spasi maksimum min(2h, 450) = ' + sMax2.toFixed(0) + ' mm (Ps. 8.7.2.2).')
}

function pileCap(r: R, v: MinRebarInput): void {
  const h = v.h, B = v.B, L = v.L, cc = v.cc
  if (!(h > 0) || !(B > 0) || !(L > 0) || !(cc >= 0)) { r.valid = false; return }
  const rhoMin = rhoShrinkage(r.fy) // Ps. 13.3 → 7.6.1.1 / 8.6.1.1
  const AsMin = rhoMin * 1000 * h // mm²/m per arah
  const sTheo = (r.Ab * 1000) / AsMin
  const sMax = Math.min(3 * h, 450)
  const sPakai = Math.floor(Math.min(sTheo, sMax) / 5) * 5
  // Batang arah-B tersebar sepanjang L, dan sebaliknya.
  const nDirB = Math.ceil((L - 2 * cc) / sPakai) + 1
  const nDirL = Math.ceil((B - 2 * cc) / sPakai) + 1
  Object.assign(r, { h, B, L, cc, rhoMin, AsMin, sTheo, sMax, sPakai, AsProv: (r.Ab * 1000) / sPakai, nDirB, nDirL, AsTotB: nDirB * r.Ab, AsTotL: nDirL * r.Ab })
  if (h >= 900) r.warn.push('Pile cap sangat tebal — cek aksi balok tinggi / strut-and-tie (Ps. 9.9 / Ps. 23) dan tulangan kulit sisi.')
  r.warn.push('Minimum ini basis fondasi telapak (Ps. 13.3). Sebagian praktisi memakai As,min balok (1,4/fy·b·d) untuk pile cap yang bekerja sebagai balok — lebih konservatif.')
}
