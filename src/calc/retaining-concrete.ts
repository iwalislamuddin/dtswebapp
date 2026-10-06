// Dinding penahan tanah beton bertulang kantilever, per meter panjang — stabilitas + desain stem, toe, heel + BOQ.
// Port 1:1 dari modules/retaining-concrete/module.js (compute), diverifikasi golden test.
//
//   Stabilitas (layan): sama dengan dinding pasangan batu (shared/retaining.ts).
//   Struktur (U = 1,2D + 1,6H + 1,6L): tekanan tumpu terfaktor; momen & geser stem di dasar, toe & heel
//   diintegrasikan 200 pias; lentur per meter SNI 2847:2019 (As,min balok, εt ≥ 0,005, spasi kelipatan 25).
// TIDAK termasuk: air tanah, gempa, panjang penyaluran stek stem→tapak (pakai tool Penyaluran Tulangan).

import { barArea, beta1, flexuralRn, rhoFromRn } from './shared/concrete'
import { rankineKaSloped } from './shared/geotech'
import { num, type NumLike } from './shared/num'
import { earthThrust, wallStability, type WeightPart } from './shared/retaining'
import type { WallOrientation } from './retaining-stone'

export { opsiName } from './retaining-stone'

export interface ConcreteWallInput {
  opsi?: WallOrientation
  /** Geometri (m). */
  H: NumLike
  bTop: NumLike
  bBot: NumLike
  tf: NumLike
  toe: NumLike
  heel: NumLike
  D: NumLike
  gamma1: NumLike
  phi1: NumLike
  beta: NumLike
  q: NumLike
  gamma2: NumLike
  phi2: NumLike
  c2: NumLike
  qall: NumLike
  kf: NumLike
  passive?: string
  /** Berat isi beton (kN/m³). */
  gammaC: NumLike
  fc: NumLike
  fy: NumLike
  /** Selimut stem & tapak (mm), 0 = 50 / 75. */
  coverS: NumLike
  coverF: NumLike
  /** Diameter tulangan utama & bagi (mm). */
  dbMain: NumLike
  dbDist: NumLike
  FSot: NumLike
  FSsl: NumLike
  Lwall: NumLike
}

/** Desain lentur satu meter lebar (+ geser diisi pemanggil). */
export interface WallFlexure {
  Mu: number
  d: number
  ng: boolean
  note: string
  AsReq?: number
  AsMin?: number
  AsUse?: number
  db?: number
  s?: number
  AsProv?: number
  phiMn?: number
  dc?: number
  et?: number
  Vu?: number
  phiVc?: number
  dcV?: number
}

export interface RebarSet {
  nm: string
  /** mm²/m */
  As: number
  /** Panjang per set (m). */
  len: number
  /** kg per meter dinding. */
  kg?: number
}

export interface ConcreteWallResult {
  warn: string[]
  valid: boolean
  opsi?: WallOrientation
  H?: number
  bTop?: number
  bBot?: number
  tf?: number
  toe?: number
  heel?: number
  B?: number
  D?: number
  ws?: number
  Hp?: number
  xb?: number
  xw?: number
  g1?: number
  phi1?: number
  beta?: number
  q?: number
  g2?: number
  phi2?: number
  c2?: number
  qall?: number
  kf?: number
  usePp?: boolean
  gc?: number
  fc?: number
  fy?: number
  covS?: number
  covF?: number
  dbM?: number
  dbD?: number
  Lw?: number
  Ka?: number
  Kp?: number
  Pa?: number
  Pq?: number
  Pah?: number
  Pav?: number
  Pqh?: number
  Pqv?: number
  yPa?: number
  yPq?: number
  Ph?: number
  Pp?: number
  parts?: WeightPart[]
  sumW?: number
  sumV?: number
  Mr?: number
  Mo?: number
  xbar?: number
  e?: number
  tri?: boolean
  qmax?: number
  qmin?: number
  dcQ?: number | null
  FSot?: number
  FSsl?: number
  FSotT?: number
  FSslT?: number
  Fr?: number
  FrTot?: number
  sumVu?: number
  Mru?: number
  Mou?: number
  xbaru?: number
  eu?: number
  quMax?: number
  quMin?: number
  triU?: boolean
  LcU?: number
  quSideHeel?: boolean
  /** Tekanan tumpu terfaktor (kPa) pada jarak x (m) dari toe. */
  quAt?: (x: number) => number
  stem?: WallFlexure
  toeD?: WallFlexure
  heelD?: WallFlexure
  MuStem?: number
  MuToe?: number
  MuHeel?: number
  dStem?: number
  dFoot?: number
  AsH?: number
  AsFv?: number
  AsFt?: number
  sH?: number
  sFv?: number
  sFt?: number
  Astem?: number
  Afoot?: number
  volM?: number
  volTot?: number | null
  sets?: RebarSet[]
  steelM?: number
  steelTot?: number | null
  /** kg besi per m³ beton. */
  ratio?: number
  formM?: number
  formTot?: number | null
  okOt?: boolean
  okSl?: boolean
  okQ?: boolean | null
  okE?: boolean
  okStem?: boolean
  okToe?: boolean
  okHeel?: boolean
}

/** Lentur satu meter (Mu kNm/m; d, h, db mm; MPa). */
function flexure(MukNm: number, d: number, hmm: number, db: number, fc: number, fy: number): WallFlexure {
  const out: WallFlexure = { Mu: MukNm, d, ng: false, note: '' }
  const b = 1000, phi = 0.9
  let AsReq = 0
  if (MukNm > 0.005) {
    const { disc, rho } = rhoFromRn(flexuralRn(MukNm * 1e6, phi, b, d), fc, fy)
    if (disc <= 0) { out.ng = true; out.note = 'Penampang terlalu tipis (Rn terlalu besar) — perbesar tebal.'; return out }
    AsReq = rho * b * d
  }
  const AsMin = (Math.max(0.25 * Math.sqrt(fc), 1.4) / fy) * b * d
  let AsUse = Math.max(AsReq, Math.min(AsMin, (4 / 3) * AsReq))
  if (AsUse < 1e-6) AsUse = AsMin // momen ≈ 0: pasang minimum
  const Abar = barArea(db)
  let s = Math.floor((1000 * Abar) / AsUse / 25) * 25
  const sMax = Math.min(3 * hmm, 450)
  if (s > sMax) s = Math.floor(sMax / 25) * 25
  if (s < 50) { out.ng = true; out.note = 'Spasi < 50 mm — pakai diameter lebih besar / pertebal penampang.'; s = 50 }
  const AsProv = (1000 * Abar) / s
  const a = (AsProv * fy) / (0.85 * fc * b)
  const c = a / beta1(fc)
  const et = c > 1e-9 ? (0.003 * (d - c)) / c : 9
  const phiMn = (phi * AsProv * fy * (d - a / 2)) / 1e6
  Object.assign(out, { AsReq, AsMin, AsUse, db, s, AsProv, phiMn, dc: MukNm > 0.005 ? MukNm / phiMn : 0, et })
  if (et < 0.005) { out.ng = true; out.note = 'εt = ' + et.toFixed(4) + ' < 0,005 (bukan terkendali tarik) — perbesar tebal/kurangi tulangan.' }
  if ((out.dc as number) > 1) out.ng = true
  return out
}

/** Spasi tulangan bagi/susut (mm) untuk As perlu per meter. */
function spacingFor(AsNeed: number, Ab: number, hRef: number): number {
  if (AsNeed < 1e-9) return 450
  let s = Math.floor((1000 * Ab) / AsNeed / 25) * 25
  const sMax = Math.min(3 * hRef, 450)
  if (s > sMax) s = Math.floor(sMax / 25) * 25
  if (s < 50) s = 50
  return s
}

export function computeConcreteWall(v: ConcreteWallInput): ConcreteWallResult {
  const r: ConcreteWallResult = { warn: [], valid: false }
  const opsi = v.opsi || 'tegak'
  const H = num(v.H), bTop = num(v.bTop), bBot = num(v.bBot)
  const tf = num(v.tf), toe = num(v.toe), heel = num(v.heel)
  const D = num(v.D)
  const g1 = num(v.gamma1), phi1 = num(v.phi1), q = num(v.q)
  let beta = num(v.beta), kf = num(v.kf), covS = num(v.coverS), covF = num(v.coverF)
  const g2 = num(v.gamma2), phi2 = num(v.phi2), c2 = num(v.c2)
  const qall = num(v.qall)
  const usePp = String(v.passive) === 'ya'
  const gc = num(v.gammaC)
  const fc = num(v.fc), fy = num(v.fy)
  const dbM = num(v.dbMain), dbD = num(v.dbDist)
  const FSotT = num(v.FSot) || 2.0, FSslT = num(v.FSsl) || 1.5
  const Lw = num(v.Lwall)

  if (!(H > 0)) { r.warn.push('Tinggi badan H harus > 0.'); return r }
  if (!(bTop > 0) || !(bBot > 0)) { r.warn.push('Tebal puncak & dasar stem harus > 0.'); return r }
  if (bBot < bTop) { r.warn.push('Tebal dasar stem harus ≥ tebal puncak (trapesium siku-siku).'); return r }
  if (!(tf > 0)) { r.warn.push('Tebal tapak tf harus > 0.'); return r }
  if (toe < 0 || heel < 0) { r.warn.push('Proyeksi tapak tidak boleh negatif.'); return r }
  if (!(g1 > 0) || !(gc > 0)) { r.warn.push('Berat isi tanah & beton harus > 0.'); return r }
  if (!(phi1 > 0)) { r.warn.push('Sudut geser urugan φ₁ harus > 0 (urugan granular, c = 0).'); return r }
  if (!(fc > 0) || !(fy > 0)) { r.warn.push('Mutu beton fc′ & baja fy harus > 0.'); return r }
  if (beta < 0) beta = 0
  if (beta >= phi1) { r.warn.push('Kemiringan lereng β harus < φ₁ (Rankine tidak terdefinisi).'); return r }
  if (kf <= 0 || kf > 1) kf = 0.67
  if (!(covS > 0)) covS = 50
  if (!(covF > 0)) covF = 75

  const D2R = Math.PI / 180
  const B = toe + bBot + heel
  const xb = toe + bBot // muka belakang stem di dasar
  const xw = opsi === 'tegak' ? xb : toe + bTop // puncak-belakang stem
  const ws = B - xw // lebar horizontal ke bidang semu
  const tanB = Math.tan(beta * D2R)
  const Hp = H + tf + ws * tanB
  const Ka = rankineKaSloped(phi1, beta)
  const cbeta = Math.cos(beta * D2R)
  const t = earthThrust(Ka, g1, q, Hp, beta)

  // Komponen berat: j = 'c' beton, 's' tanah.
  const parts: WeightPart[] = []
  if (opsi === 'tegak') {
    parts.push({ nm: 'Stem persegi', W: bTop * H * gc, x: xb - bTop / 2, j: 'c' })
    const bw = bBot - bTop
    if (bw > 1e-9) parts.push({ nm: 'Stem segitiga (muka depan)', W: 0.5 * bw * H * gc, x: toe + (2 * bw) / 3, j: 'c' })
  } else {
    parts.push({ nm: 'Stem persegi', W: bTop * H * gc, x: toe + bTop / 2, j: 'c' })
    const bw2 = bBot - bTop
    if (bw2 > 1e-9) {
      parts.push({ nm: 'Stem segitiga (sisi tanah)', W: 0.5 * bw2 * H * gc, x: toe + bTop + bw2 / 3, j: 'c' })
      parts.push({ nm: 'Tanah di atas sisi miring', W: 0.5 * bw2 * H * g1, x: toe + bTop + (2 * bw2) / 3, j: 's' })
    }
  }
  if (heel > 1e-9) parts.push({ nm: 'Tanah di atas tumit', W: heel * H * g1, x: B - heel / 2, j: 's' })
  if (beta > 0.001 && ws > 1e-9) {
    const hW = ws * tanB
    parts.push({ nm: 'Baji lereng di atas ws', W: 0.5 * ws * hW * g1, x: B - ws + (2 * ws) / 3, j: 's' })
  }
  parts.push({ nm: 'Tapak beton', W: B * tf * gc, x: B / 2, j: 'c' })

  // 1) Stabilitas (layan).
  const st = wallStability(parts, t, B, { g2, phi2, c2, D, kf, usePp, qall })
  if (st.overturned) r.warn.push('Resultan layan jatuh di luar dasar (x̄ ≤ 0) — dinding GULING. Perbesar dimensi.')

  // 2) Terfaktor U = 1,2D + 1,6H + 1,6L.
  const fD = 1.2, fH = 1.6, fL = 1.6
  let sumVu = 0, sumMwu = 0
  for (const p of parts) { sumVu += fD * p.W; sumMwu += fD * p.W * p.x }
  sumVu += fH * t.Pav + fL * t.Pqv
  const Mru = sumMwu + (fH * t.Pav + fL * t.Pqv) * B
  const Mou = fH * t.Pah * t.yPa + fL * t.Pqh * t.yPq
  const xbaru = (Mru - Mou) / sumVu
  const eu = B / 2 - xbaru
  let quMaxV: number, quMinV: number, triU = false, LcU = B, quSideHeel = false
  if (xbaru <= 0) { triU = true; quMaxV = 0; quMinV = 0; LcU = 0 }
  else if (Math.abs(eu) <= B / 6 + 1e-12) {
    quMaxV = (sumVu / B) * (1 + (6 * eu) / B)
    quMinV = (sumVu / B) * (1 - (6 * eu) / B)
  } else if (eu > 0) { triU = true; LcU = 3 * xbaru; quMaxV = (2 * sumVu) / LcU; quMinV = 0 }
  else { triU = true; quSideHeel = true; LcU = 3 * (B - xbaru); quMaxV = (2 * sumVu) / LcU; quMinV = 0 }

  const quAt = (x: number): number => {
    if (LcU <= 0) return 0
    if (!triU) return quMaxV - ((quMaxV - quMinV) * x) / B
    if (!quSideHeel) return x <= LcU ? quMaxV * (1 - x / LcU) : 0
    return x >= B - LcU ? quMaxV * (1 - (B - x) / LcU) : 0
  }
  const phiVcPerM = (d: number): number => (0.75 * 0.17 * Math.sqrt(fc) * 1000 * d) / 1000

  // Stem (dasar).
  const MuStem = fH * cbeta * Ka * ((g1 * H * H * H) / 6) + fL * cbeta * Ka * ((q * H * H) / 2)
  const VuStem = fH * cbeta * Ka * ((g1 * H * H) / 2) + fL * cbeta * Ka * (q * H)
  const dStem = bBot * 1000 - covS - dbM / 2
  const stem = flexure(MuStem, dStem, bBot * 1000, dbM, fc, fy)
  stem.Vu = VuStem
  stem.phiVc = phiVcPerM(dStem)
  stem.dcV = VuStem / stem.phiVc

  // Toe (numerik, 200 pias); tanah di atas toe diabaikan (konservatif).
  const N = 200
  let MuToe = 0, VuToe = 0
  if (toe > 1e-6) {
    const dx = toe / N
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx
      const wnet = quAt(x) - fD * gc * tf
      MuToe += wnet * (toe - x) * dx
      VuToe += wnet * dx
    }
    if (MuToe < 0) MuToe = 0
    if (VuToe < 0) VuToe = 0
  }
  const dFoot = tf * 1000 - covF - dbM / 2
  const toeD = flexure(MuToe, dFoot, tf * 1000, dbM, fc, fy)
  toeD.Vu = VuToe
  toeD.phiVc = phiVcPerM(dFoot)
  toeD.dcV = VuToe / toeD.phiVc

  // Heel (numerik).
  let MuHeel = 0, VuHeel = 0
  const heelSpan = B - xb
  if (heelSpan > 1e-6) {
    const dx2 = heelSpan / N
    for (let i = 0; i < N; i++) {
      const x2 = xb + (i + 0.5) * dx2
      const hs = H + Math.max(0, x2 - xw) * tanB // tinggi tanah di atas x2
      const wdn = fD * (gc * tf + g1 * hs) + fL * q - quAt(x2)
      MuHeel += wdn * (x2 - xb) * dx2
      VuHeel += wdn * dx2
    }
    if (MuHeel < 0) MuHeel = 0
    if (VuHeel < 0) VuHeel = 0
  }
  const heelD = flexure(MuHeel, dFoot, tf * 1000, dbM, fc, fy)
  heelD.Vu = VuHeel
  heelD.phiVc = phiVcPerM(dFoot)
  heelD.dcV = VuHeel / heelD.phiVc

  // Susut-suhu / minimum.
  const tAvg = 0.5 * (bTop + bBot) * 1000
  const AsH = 0.002 * 1000 * tAvg // stem horizontal, total 2 muka
  const AsFv = 0.0012 * 1000 * tAvg // stem muka depan vertikal
  const AsFt = 0.0018 * 1000 * tf * 1000 // tapak memanjang
  const AbD = barArea(dbD)
  const sH = spacingFor(AsH / 2, AbD, tAvg)
  const sFv = spacingFor(AsFv, AbD, tAvg)
  const sFt = spacingFor(AsFt / 2, AbD, tf * 1000)

  // BOQ per meter dinding.
  const Astem = 0.5 * (bTop + bBot) * H
  const Afoot = B * tf
  const volM = Astem + Afoot
  const sets: RebarSet[] = [
    { nm: 'Stem vertikal muka tanah D' + dbM + '-' + stem.s, As: stem.AsProv as number, len: H + tf + (40 * dbM) / 1000 },
    { nm: 'Stem vertikal muka depan D' + dbD + '-' + sFv, As: (1000 * AbD) / sFv, len: H },
    { nm: 'Stem horizontal 2 muka D' + dbD + '-' + sH, As: (2 * 1000 * AbD) / sH, len: H },
    { nm: 'Toe bawah D' + dbM + '-' + toeD.s, As: toe > 0.01 ? (toeD.AsProv as number) : 0, len: toe + (40 * dbM) / 1000 },
    { nm: 'Heel atas D' + dbM + '-' + heelD.s, As: heelSpan > 0.01 ? (heelD.AsProv as number) : 0, len: heelSpan + (40 * dbM) / 1000 },
    { nm: 'Tapak memanjang 2 lapis D' + dbD + '-' + sFt, As: (2 * 1000 * AbD) / sFt, len: B },
  ]
  let steelM = 0
  for (const s2 of sets) { s2.kg = s2.As * 1e-6 * s2.len * 7850; steelM += s2.kg }
  const formM = 2 * H + 2 * tf

  const okE = Math.abs(st.e) <= B / 6 + 1e-12
  Object.assign(r, {
    valid: true, opsi, H, bTop, bBot, tf, toe, heel, B, D, ws, Hp, xb, xw, g1, phi1, beta, q, g2, phi2, c2, qall, kf,
    usePp, gc, fc, fy, covS, covF, dbM, dbD, Lw,
    Ka, Kp: st.Kp, Pa: t.Pa, Pq: t.Pq, Pah: t.Pah, Pav: t.Pav, Pqh: t.Pqh, Pqv: t.Pqv, yPa: t.yPa, yPq: t.yPq, Ph: st.Ph, Pp: st.Pp,
    parts, sumW: st.sumW, sumV: st.sumV, Mr: st.Mr, Mo: st.Mo, xbar: st.xbar, e: st.e, tri: st.tri,
    qmax: st.qmax, qmin: st.qmin, dcQ: st.dcQ, FSot: st.FSot, FSsl: st.FSsl, FSotT, FSslT, Fr: st.Fr, FrTot: st.FrTot,
    sumVu, Mru, Mou, xbaru, eu, quMax: quMaxV, quMin: quMinV, triU, LcU, quSideHeel, quAt,
    stem, toeD, heelD, MuStem, MuToe, MuHeel, dStem, dFoot, AsH, AsFv, AsFt, sH, sFv, sFt,
    Astem, Afoot, volM, volTot: Lw > 0 ? volM * Lw : null, sets, steelM, steelTot: Lw > 0 ? steelM * Lw : null,
    ratio: steelM / volM, formM, formTot: Lw > 0 ? formM * Lw : null,
    okOt: st.FSot >= FSotT, okSl: st.FSsl >= FSslT, okQ: st.dcQ === null ? null : st.dcQ <= 1, okE,
    okStem: !stem.ng && (stem.dcV as number) <= 1,
    okToe: toe < 0.01 || (!toeD.ng && (toeD.dcV as number) <= 1),
    okHeel: heelSpan < 0.01 || (!heelD.ng && (heelD.dcV as number) <= 1),
  })

  if (!r.okOt) r.warn.push('FS guling ' + st.FSot.toFixed(2) + ' < ' + FSotT.toFixed(1) + ' — TIDAK AMAN; perpanjang heel (paling efektif).')
  if (!r.okSl) r.warn.push('FS geser ' + st.FSsl.toFixed(2) + ' < ' + FSslT.toFixed(1) + ' — TIDAK AMAN; pertimbangkan shear key / tambah tanam / aktifkan pasif.')
  if (!okE) r.warn.push('e = ' + st.e.toFixed(3) + ' m > B/6 = ' + (B / 6).toFixed(3) + ' m — resultan layan di luar inti tengah.')
  if (st.dcQ !== null && st.dcQ > 1) r.warn.push('qmax = ' + st.qmax.toFixed(1) + ' kPa > q_izin = ' + qall.toFixed(1) + ' kPa — daya dukung TIDAK memadai.')
  if (stem.ng) r.warn.push('STEM: ' + (stem.note || 'kapasitas lentur tidak cukup (D/C ' + (stem.dc as number).toFixed(2) + ').'))
  if ((stem.dcV as number) > 1) r.warn.push('STEM: geser Vu ' + VuStem.toFixed(1) + ' kN > φVc ' + stem.phiVc.toFixed(1) + ' kN — pertebal dasar stem.')
  if (toeD.ng && toe > 0.01) r.warn.push('TOE: ' + (toeD.note || 'kapasitas lentur tidak cukup.'))
  if ((toeD.dcV as number) > 1 && toe > 0.01) r.warn.push('TOE: geser > φVc — pertebal tapak.')
  if (heelD.ng && heelSpan > 0.01) r.warn.push('HEEL: ' + (heelD.note || 'kapasitas lentur tidak cukup.'))
  if ((heelD.dcV as number) > 1 && heelSpan > 0.01) r.warn.push('HEEL: geser > φVc — pertebal tapak.')
  if (triU) r.warn.push('Distribusi tumpu TERFAKTOR segitiga (e_u > B/6) — kontak sebagian ' + LcU.toFixed(2) + ' m.')
  if (usePp) r.warn.push('Tahanan pasif diikutkan pada cek geser — pastikan tanah depan D = ' + D.toFixed(2) + ' m permanen.')
  r.warn.push('Cek panjang penyaluran & stek tulangan stem→tapak dengan tool Penyaluran Tulangan Tarik. Air tanah tidak dimodelkan — wajib drainase + suling-suling.')
  return r
}
