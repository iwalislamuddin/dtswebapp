// Sambungan baut tipe tumpu — SNI 1729:2020 (AISC 360-16) Ps. J3, DFBK (φ = 0,75).
// Port 1:1 dari modules/bolt-connection/module.js (compute), diverifikasi golden test.
//
//   Geser baut Rn = Fnv·Ab·m, tarik Rn = Fnt·Ab (J3.6); kombinasi F'nt = 1,3Fnt − Fnt/(φFnv)·frv ≤ Fnt (J3.7,
//   wajib bila kedua rasio > 30%); tumpu/sobek Rn = 1,2·lc·t·Fu ≤ 2,4·d·t·Fu (J3.10, lubang standar).
//   Kapasitas geser grup efektif = Σ min(geser, tumpu) per baut. Batas spasi (J3.3), tepi (Tabel J3.4M, J3.5).
// TIDAK termasuk: geser eksentris (ICR), slip-critical, blok geser, leleh/fraktur pelat sambung, prying.

import { numFinite as num, type NumLike } from './shared/num'

export type BoltGrade = 'a325' | 'a490' | 'a307' | 'custom'

/** Mutu baut (Tabel J3.2, MPa). */
export const BOLT_GRADES: Record<BoltGrade, { label: string; Fnt: number; FnvN: number; FnvX: number; threadOpt: boolean }> = {
  a325: { label: 'A325 / Gr.8.8', Fnt: 620, FnvN: 372, FnvX: 457, threadOpt: true },
  a490: { label: 'A490 / Gr.10.9', Fnt: 780, FnvN: 457, FnvX: 579, threadOpt: true },
  a307: { label: 'A307 (biasa)', Fnt: 310, FnvN: 188, FnvX: 188, threadOpt: false },
  custom: { label: 'Kustom', Fnt: 620, FnvN: 372, FnvX: 457, threadOpt: true },
}

/** Lubang standar (Tabel J3.3M): d < 24 → d+2; d ≥ 24 → d+3. */
export const holeDia = (d: number): number => d + (d < 24 ? 2 : 3)

const EDGE_MIN: Record<number, number> = { 16: 22, 20: 26, 22: 28, 24: 30, 27: 34, 30: 38, 36: 46 }
/** Jarak tepi minimum (Tabel J3.4M); di luar tabel 1,25d. */
export const edgeMin = (d: number): number => EDGE_MIN[d] || Math.ceil(1.25 * d)

export interface BoltConnectionInput {
  grade?: BoltGrade
  /** 'N' ulir termasuk bidang geser, 'X' di luar. */
  thread?: 'N' | 'X'
  /** Dipakai bila grade = custom (MPa). */
  Fnt: NumLike
  Fnv: NumLike
  /** Diameter baut (mm). */
  d: NumLike
  /** Jumlah bidang geser. */
  planes: NumLike
  /** Baris searah beban, kolom tegak lurus. */
  nr: NumLike
  nc: NumLike
  /** Spasi searah beban, gage, jarak tepi searah beban (mm). */
  s: NumLike
  sg: NumLike
  le: NumLike
  /** Pelat tumpu: tebal (mm), Fu (MPa). */
  t: NumLike
  Fu: NumLike
  /** Beban terfaktor grup (kN). */
  Vu: NumLike
  Tu: NumLike
}

export interface BoltConnectionResult {
  valid: boolean
  warn: string[]
  grade: BoltGrade
  gradeLabel: string
  thread: 'N' | 'X'
  Fnt: number
  Fnv: number
  d: number
  m: number
  nr: number
  nc: number
  n: number
  s: number
  sg: number
  le: number
  t: number
  Fu: number
  Vu: number
  Tu: number
  /** mm² */
  Ab: number
  dh: number
  phi: number
  /** Beban per baut (kN). */
  rv: number
  rt: number
  rnv: number
  phiRnv: number
  rnt: number
  phiRnt: number
  dcTension: number
  bearingOk: boolean
  lcEdge: number
  lcInner: number
  rnBrgEdge: number
  rnBrgInner: number
  rnBrgCap: number
  Rge: number
  phiRge: number
  dcShear: number
  phiVboltTotal: number
  phiBrgTotal: number | null
  frv: number
  frt: number
  ratioV: number
  ratioT: number
  comboNeeded: boolean
  FntMod: number | null
  phiRntMod: number | null
  dcCombo: number
  dcComboInfo: number
  gov: 'geser' | 'tarik' | 'kombinasi'
  govDC: number
  sMin: number
  sPref: number
  leMin: number
}

export function computeBoltConnection(v: BoltConnectionInput): BoltConnectionResult {
  const warn: string[] = []
  const grade: BoltGrade = v.grade || 'a325'
  const G = BOLT_GRADES[grade]
  const thread = grade === 'a307' ? 'N' : v.thread || 'N'
  const Fnt = grade === 'custom' ? num(v.Fnt) : G.Fnt
  const Fnv = grade === 'custom' ? num(v.Fnv) : thread === 'X' ? G.FnvX : G.FnvN
  const d = num(v.d)
  const m = Math.max(1, Math.round(num(v.planes)))
  const nr = Math.max(1, Math.round(num(v.nr)))
  const nc = Math.max(1, Math.round(num(v.nc)))
  const s = num(v.s), sg = num(v.sg), le = num(v.le)
  const t = num(v.t), Fu = num(v.Fu)
  const Vu = num(v.Vu), Tu = num(v.Tu)

  const n = nr * nc
  const Ab = (Math.PI * d * d) / 4
  const dh = holeDia(d)
  const phi = 0.75

  // beban per baut
  const rv = n > 0 ? Vu / n : 0
  const rt = n > 0 ? Tu / n : 0

  // geser & tarik baut (J3.6)
  const rnv = (Fnv * Ab * m) / 1000
  const phiRnv = phi * rnv
  const rnt = (Fnt * Ab) / 1000
  const phiRnt = phi * rnt
  const dcTension = Tu > 0 ? (phiRnt > 0 ? rt / phiRnt : Infinity) : 0

  // tumpu / sobek (J3.10) per baut
  const bearingOk = t > 0 && Fu > 0 && le > 0
  const lcEdge = le - dh / 2
  const lcInner = s - dh
  const rnBrgCap = (2.4 * d * t * Fu) / 1000
  let rnBrgEdge = 0, rnBrgInner = 0
  if (bearingOk) {
    rnBrgEdge = Math.min((1.2 * Math.max(0, lcEdge) * t * Fu) / 1000, rnBrgCap)
    rnBrgInner = nr > 1 ? Math.min((1.2 * Math.max(0, lcInner) * t * Fu) / 1000, rnBrgCap) : 0
  }

  // kapasitas grup geser efektif: tiap kolom 1 baut tepi + (nr−1) baut dalam
  const Rge = bearingOk ? nc * (Math.min(rnv, rnBrgEdge) + (nr - 1) * Math.min(rnv, rnBrgInner)) : n * rnv
  const phiRge = phi * Rge
  const dcShear = Vu > 0 ? (phiRge > 0 ? Vu / phiRge : Infinity) : 0

  // kombinasi tarik + geser (J3.7)
  const frv = Ab > 0 ? (rv * 1000) / (Ab * m) : 0
  const frt = Ab > 0 ? (rt * 1000) / Ab : 0
  const ratioV = Fnv > 0 ? frv / (phi * Fnv) : 0
  const ratioT = Fnt > 0 ? frt / (phi * Fnt) : 0
  const comboNeeded = Vu > 0 && Tu > 0 && ratioV > 0.3 && ratioT > 0.3
  let FntMod: number | null = null, phiRntMod: number | null = null, dcCombo = 0
  if (Vu > 0 && Tu > 0) {
    FntMod = Math.min(Fnt, Math.max(0, 1.3 * Fnt - (Fnt / (phi * Fnv)) * frv))
    phiRntMod = (phi * FntMod * Ab) / 1000
    dcCombo = phiRntMod > 0 ? rt / phiRntMod : Infinity
  }

  const r: BoltConnectionResult = {
    valid: false, warn, grade, gradeLabel: G.label, thread, Fnt, Fnv, d, m, nr, nc, n, s, sg, le, t, Fu, Vu, Tu,
    Ab, dh, phi, rv, rt, rnv, phiRnv, rnt, phiRnt, dcTension,
    bearingOk, lcEdge, lcInner, rnBrgEdge, rnBrgInner, rnBrgCap, Rge, phiRge, dcShear,
    phiVboltTotal: phi * n * rnv,
    phiBrgTotal: bearingOk ? phi * nc * (rnBrgEdge + (nr - 1) * rnBrgInner) : null,
    frv, frt, ratioV, ratioT, comboNeeded, FntMod, phiRntMod,
    dcCombo: comboNeeded ? dcCombo : 0,
    dcComboInfo: dcCombo,
    gov: 'geser', govDC: 0, sMin: 0, sPref: 0, leMin: 0,
  }

  // keadaan batas menentukan (yang pertama bila sama)
  const checks = [
    { key: 'geser', dc: r.dcShear },
    { key: 'tarik', dc: r.dcTension },
    { key: 'kombinasi', dc: r.dcCombo },
  ] as const
  let gov: (typeof checks)[number] = checks[0]
  for (const c of checks) if (c.dc > gov.dc) gov = c
  r.gov = gov.key
  r.govDC = gov.dc
  r.valid = true

  // geometri & catatan
  const sMin = Math.ceil(2.67 * d), sPref = 3 * d, leMin = edgeMin(d)
  r.sMin = sMin; r.sPref = sPref; r.leMin = leMin
  if (nr > 1 && s < sMin)
    warn.push('Spasi s = ' + s + ' mm < minimum 2,67·d = ' + sMin + ' mm (J3.3) — TIDAK memenuhi syarat.')
  else if (nr > 1 && s < sPref)
    warn.push('Spasi s = ' + s + ' mm < preferensi 3·d = ' + sPref + ' mm (J3.3) — boleh, tetapi kurang disarankan.')
  if (nc > 1 && sg > 0 && sg < sMin) warn.push('Gage g = ' + sg + ' mm < minimum 2,67·d = ' + sMin + ' mm (J3.3).')
  if (le > 0 && le < leMin)
    warn.push('Jarak tepi le = ' + le + ' mm < minimum Tabel J3.4M = ' + leMin + ' mm — TIDAK memenuhi syarat.')
  if (t > 0 && le > Math.min(12 * t, 150))
    warn.push('Jarak tepi le = ' + le + ' mm > maksimum 12t = ' + Math.min(12 * t, 150).toFixed(0) + ' mm (J3.5).')
  if (bearingOk && lcEdge <= 0)
    warn.push('lc tepi = ' + lcEdge.toFixed(1) + ' mm ≤ 0 — lubang terlalu dekat tepi, kuat sobek nol.')
  if (!bearingOk && Vu > 0)
    warn.push('Data pelat (t, Fu, le) belum lengkap — cek tumpu/sobek dilewati; kapasitas geser = baut saja.')
  if (grade === 'a307' && v.thread === 'X')
    warn.push('A307: ulir selalu dianggap termasuk bidang geser (tidak ada opsi X).')
  if (Vu > 0 && Tu > 0 && !comboNeeded)
    warn.push('Interaksi J3.7 tidak wajib ditinjau (tegangan perlu ≤ 30% tersedia) — nilai tetap ditampilkan sebagai info.')
  if (r.dcShear > 1)
    warn.push('D/C geser grup = ' + r.dcShear.toFixed(2) + ' > 1 — tambah baut/diameter, atau perbaiki tumpu (t, le, s).')
  if (r.dcTension > 1) warn.push('D/C tarik = ' + r.dcTension.toFixed(2) + ' > 1 — tambah baut atau perbesar diameter.')
  if (r.dcCombo > 1)
    warn.push('D/C kombinasi tarik+geser = ' + r.dcCombo.toFixed(2) + ' > 1 (J3.7) — kombinasi menentukan.')

  return r
}
