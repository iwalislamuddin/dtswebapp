// Dinding penahan tanah pasangan batu (gravitasi), per meter panjang — guling, geser, daya dukung, volume.
// Port 1:1 dari modules/retaining-stone/module.js (compute), diverifikasi golden test.
//
//   Tekanan aktif Rankine (urugan granular, lereng β) pada bidang vertikal semu di ujung tumit.
//   FS guling = Mr/Mo; FS geser = (ΣV·tan(kφ2) + k·c2·B [+ Pp]) / ΣH; tekanan dasar trapesium/segitiga.
// TIDAK termasuk: air tanah (wajib drainase & suling-suling), gempa, stabilitas lereng global.

import { rankineKaSloped } from './shared/geotech'
import { num, type NumLike } from './shared/num'
import { earthThrust, wallStability, type WeightPart } from './shared/retaining'

export type WallOrientation = 'tegak' | 'miring'

export interface StoneWallInput {
  /** 'tegak' = sisi tegak ke tanah; 'miring' = sisi miring ke tanah. */
  opsi?: WallOrientation
  /** Geometri (m). */
  H: NumLike
  bTop: NumLike
  bBot: NumLike
  tf: NumLike
  toe: NumLike
  heel: NumLike
  /** Kedalaman tanah depan (m). */
  D: NumLike
  /** Urugan: γ1 (kN/m³), φ1 (°), lereng β (°), beban merata q (kPa). */
  gamma1: NumLike
  phi1: NumLike
  beta: NumLike
  q: NumLike
  /** Tanah fondasi. */
  gamma2: NumLike
  phi2: NumLike
  c2: NumLike
  qall: NumLike
  kf: NumLike
  passive?: string
  /** Berat isi pasangan batu (kN/m³). */
  gammaW: NumLike
  FSot: NumLike
  FSsl: NumLike
  /** Panjang dinding untuk volume total (m), 0 = per meter. */
  Lwall: NumLike
}

export interface StoneWallResult {
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
  gw?: number
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
  Astem?: number
  Afoot?: number
  /** Volume per meter (m³/m) & total (m³). */
  volM?: number
  volTot?: number | null
  okOt?: boolean
  okSl?: boolean
  okQ?: boolean | null
  okE?: boolean
}

export const opsiName = (k: string): string => (k === 'tegak' ? 'Opsi 1 — sisi tegak ke tanah' : 'Opsi 2 — sisi miring ke tanah')

export function computeStoneWall(v: StoneWallInput): StoneWallResult {
  const r: StoneWallResult = { warn: [], valid: false }
  const opsi = v.opsi || 'tegak'
  const H = num(v.H), bTop = num(v.bTop), bBot = num(v.bBot)
  const tf = num(v.tf), toe = num(v.toe), heel = num(v.heel)
  const D = num(v.D)
  const g1 = num(v.gamma1), phi1 = num(v.phi1), q = num(v.q)
  let beta = num(v.beta), kf = num(v.kf)
  const g2 = num(v.gamma2), phi2 = num(v.phi2), c2 = num(v.c2)
  const qall = num(v.qall)
  const usePp = String(v.passive) === 'ya'
  const gw = num(v.gammaW)
  const FSotT = num(v.FSot) || 2.0, FSslT = num(v.FSsl) || 1.5
  const Lw = num(v.Lwall)

  if (!(H > 0)) { r.warn.push('Tinggi badan H harus > 0.'); return r }
  if (!(bTop > 0) || !(bBot > 0)) { r.warn.push('Lebar puncak & dasar badan harus > 0.'); return r }
  if (bBot < bTop) { r.warn.push('Lebar dasar badan (b_bawah) harus ≥ lebar puncak (b_atas) untuk trapesium siku-siku.'); return r }
  if (!(tf > 0)) { r.warn.push('Tebal tapak tf harus > 0.'); return r }
  if (toe < 0 || heel < 0) { r.warn.push('Proyeksi tapak tidak boleh negatif.'); return r }
  if (!(g1 > 0) || !(gw > 0)) { r.warn.push('Berat isi tanah urugan & pasangan harus > 0.'); return r }
  if (!(phi1 > 0)) { r.warn.push('Sudut geser tanah urugan φ harus > 0 (urugan granular, c = 0).'); return r }
  if (beta < 0) beta = 0
  if (beta >= phi1) { r.warn.push('Kemiringan lereng β harus < φ urugan (Rankine tidak terdefinisi).'); return r }
  if (kf <= 0 || kf > 1) kf = 0.67

  const D2R = Math.PI / 180
  const B = toe + bBot + heel
  // Lebar horizontal dari puncak-belakang badan ke bidang semu (x = B).
  const ws = opsi === 'tegak' ? heel : heel + (bBot - bTop)
  const Hp = H + tf + ws * Math.tan(beta * D2R)
  const Ka = rankineKaSloped(phi1, beta)
  const t = earthThrust(Ka, g1, q, Hp, beta)

  // Komponen berat (x dari toe).
  const parts: WeightPart[] = []
  const xBackBot = toe + bBot // muka belakang badan di dasar
  if (opsi === 'tegak') {
    parts.push({ nm: 'Badan persegi', W: bTop * H * gw, x: xBackBot - bTop / 2 })
    const bw = bBot - bTop
    if (bw > 1e-9) parts.push({ nm: 'Badan segitiga (muka depan)', W: 0.5 * bw * H * gw, x: toe + (2 * bw) / 3 })
    if (heel > 1e-9) parts.push({ nm: 'Tanah di atas tumit', W: heel * H * g1, x: B - heel / 2 })
  } else {
    parts.push({ nm: 'Badan persegi', W: bTop * H * gw, x: toe + bTop / 2 })
    const bw2 = bBot - bTop
    if (bw2 > 1e-9) {
      parts.push({ nm: 'Badan segitiga (sisi tanah)', W: 0.5 * bw2 * H * gw, x: toe + bTop + bw2 / 3 })
      parts.push({ nm: 'Tanah di atas sisi miring', W: 0.5 * bw2 * H * g1, x: toe + bTop + (2 * bw2) / 3 })
    }
    if (heel > 1e-9) parts.push({ nm: 'Tanah di atas tumit', W: heel * H * g1, x: B - heel / 2 })
  }
  if (beta > 0.001 && ws > 1e-9) {
    const hW = ws * Math.tan(beta * D2R)
    parts.push({ nm: 'Baji lereng di atas ws', W: 0.5 * ws * hW * g1, x: B - ws + (2 * ws) / 3 })
  }
  parts.push({ nm: 'Tapak (shoe)', W: B * tf * gw, x: B / 2 })

  const st = wallStability(parts, t, B, { g2, phi2, c2, D, kf, usePp, qall })
  if (st.overturned) r.warn.push('Resultan jatuh di luar dasar tapak (x̄ ≤ 0) — dinding GULING. Perbesar dimensi.')

  const Astem = 0.5 * (bTop + bBot) * H
  const Afoot = B * tf
  const volM = Astem + Afoot
  const okE = Math.abs(st.e) <= B / 6 + 1e-12
  Object.assign(r, {
    valid: true, opsi, H, bTop, bBot, tf, toe, heel, B, D, ws, Hp, g1, phi1, beta, q, g2, phi2, c2, qall, kf, usePp, gw, Lw,
    Ka, Kp: st.Kp, Pa: t.Pa, Pq: t.Pq, Pah: t.Pah, Pav: t.Pav, Pqh: t.Pqh, Pqv: t.Pqv, yPa: t.yPa, yPq: t.yPq, Ph: st.Ph, Pp: st.Pp,
    parts, sumW: st.sumW, sumV: st.sumV, Mr: st.Mr, Mo: st.Mo, xbar: st.xbar, e: st.e, tri: st.tri,
    qmax: st.qmax, qmin: st.qmin, dcQ: st.dcQ, FSot: st.FSot, FSsl: st.FSsl, FSotT, FSslT, Fr: st.Fr, FrTot: st.FrTot,
    Astem, Afoot, volM, volTot: Lw > 0 ? volM * Lw : null,
    okOt: st.FSot >= FSotT, okSl: st.FSsl >= FSslT, okQ: st.dcQ === null ? null : st.dcQ <= 1, okE,
  })

  if (!r.okOt) r.warn.push('FS guling ' + st.FSot.toFixed(2) + ' < ' + FSotT.toFixed(1) + ' — TIDAK AMAN terhadap guling.')
  if (!r.okSl) r.warn.push('FS geser ' + st.FSsl.toFixed(2) + ' < ' + FSslT.toFixed(1) + ' — TIDAK AMAN terhadap geser' + (usePp ? '' : ' (coba aktifkan tahanan pasif atau tambah kedalaman tanam)') + '.')
  if (!okE) r.warn.push('e = ' + st.e.toFixed(3) + ' m > B/6 = ' + (B / 6).toFixed(3) + ' m — resultan di luar inti tengah; sebagian dasar terangkat (distribusi segitiga). Untuk pasangan batu sebaiknya e ≤ B/6.')
  if (st.dcQ !== null && st.dcQ > 1) r.warn.push('qmax = ' + st.qmax.toFixed(1) + ' kPa > q_izin = ' + qall.toFixed(1) + ' kPa — daya dukung TIDAK memadai.')
  if (usePp) r.warn.push('Tahanan pasif diikutkan pada cek geser — pastikan tanah depan setebal D = ' + D.toFixed(2) + ' m PERMANEN (tidak akan tergali/tererosi).')
  if (bBot / H < 0.4) r.warn.push('b_bawah/H = ' + (bBot / H).toFixed(2) + ' < 0,4 — proporsi badan gravitasi umumnya 0,4–0,7·H; periksa kembali.')
  r.warn.push('Air tanah TIDAK dimodelkan — wajib sediakan drainase & lubang suling-suling (weep hole) agar tekanan hidrostatik tidak bekerja.')
  return r
}
