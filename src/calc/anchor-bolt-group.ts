// Grup angkur cor-di-tempat: tarik + momen + geser — ACI 318-19 Ch. 17 (SNI 2847:2019 Ps. 17).
// Port 1:1 dari modules/anchor-bolt-group/module.js (compute), diverifikasi golden test.
//
//   Gaya baut elastis Ti = Nu/n + Mx·xi/Σxi² + My·yi/Σyi² (pelat kaku). Tarik: baja Nsa = Ase·futa (φ 0,75),
//   breakout grup Ncbg = (ANc/ANco)·ψec·ψed·ψc·ψcp·Nb, Nb = 10·λ·√f'c·hef^1,5 (17.6.2).
//   Geser (17.7): baja Vsa = 0,6·Ase·futa (×0,8 grout, φ 0,65), breakout grup searah satu tepi (ca1 = ca),
//   pryout Vcpg = kcp·Ncbg (konsentris). Interaksi (17.8): (N/φNn)^5/3 + (V/φVn)^5/3 ≤ 1.
// TIDAK termasuk: side-face blowout, angkur pasca-pasang, tulangan angkur, bearing pelat, eksentrisitas geser.

import { numFinite as num, type NumLike } from './shared/num'

export interface AnchorBoltGroupInput {
  /** Jumlah baut arah X & Y, spasi (mm). */
  nx: NumLike
  ny: NumLike
  sx: NumLike
  sy: NumLike
  /** Diameter, kedalaman tanam (mm). */
  da: NumLike
  hef: NumLike
  /** f'c & futa (MPa); luas tarik efektif per baut (mm²). */
  fc: NumLike
  futa: NumLike
  Ase: NumLike
  /** Jarak tepi semua sisi & tebal beton (mm); 0 = tanpa tepi / tak dibatasi. */
  ca: NumLike
  ha: NumLike
  /** Tarik (+) kN, momen kN·m, geser kN — di centroid grup. */
  Nu: NumLike
  Mx: NumLike
  My: NumLike
  Vu: NumLike
  /** Kondisi φ breakout: A ada tulangan suplemen (0,75), B tanpa (0,70). */
  cond?: 'A' | 'B'
  crack?: 'cracked' | 'uncracked'
  shearDir?: 'x' | 'y'
  grout?: 'yes' | 'no'
}

export interface AnchorBolt {
  /** Posisi terhadap centroid grup (mm) & gaya tarik (kN, + tarik). */
  x: number
  y: number
  T: number
}

export interface AnchorBoltGroupResult {
  valid: boolean
  warn: string[]
  nx: number
  ny: number
  sx: number
  sy: number
  n: number
  da: number
  hef: number
  fc: number
  futa: number
  Ase: number
  ca: number
  ha: number
  Nu: number
  Mx: number
  My: number
  cond: 'A' | 'B'
  crack: 'cracked' | 'uncracked'
  Vu: number
  shearDir: 'x' | 'y'
  grout: boolean
  /** Σxi², Σyi² (mm²). */
  Sxx: number
  Syy: number
  bolts: AnchorBolt[]
  Tmax: number
  sumTt: number
  Nsa: number
  phiNsa: number
  dcSteel: number
  Nb: number
  ANco: number
  ANc: number
  ratioA: number
  psiEd: number
  psiC: number
  psiCp: number
  psiEc: number
  /** Eksentrisitas resultan tarik (mm). */
  ex: number
  ey: number
  Ncbg: number
  phiC: number
  phiNcbg: number
  eff: number
  dcConc: number
  minSpacing: number
  overlap: boolean
  Vsa: number
  phiVsa: number
  Vbolt: number
  dcVsteel: number
  le: number
  Vb: number
  AVco: number
  AVc: number
  ratioAV: number
  psiEdV: number
  psiCV: number
  psiHV: number
  breakoutApplic: boolean
  /** Infinity bila breakout geser tidak ditinjau. */
  Vcbg: number
  phiVcbg: number
  dcVbreak: number
  kcp: number
  Ncbg0: number
  Vcpg: number
  phiVcpg: number
  dcVpry: number
  dcShear: number
  govShear: 'baja' | 'breakout' | 'pryout'
  dcTension: number
  combined: number | null
  interactMode: string
  UN: number
  UV: number
  dcGov: number
  gov: string
  govDC: number
}

export function computeAnchorBoltGroup(v: AnchorBoltGroupInput): AnchorBoltGroupResult {
  const warn: string[] = []
  const nx = Math.max(1, Math.round(num(v.nx)))
  const ny = Math.max(1, Math.round(num(v.ny)))
  const sx = num(v.sx), sy = num(v.sy)
  const da = num(v.da), hef = num(v.hef)
  const fc = num(v.fc), futa = num(v.futa)
  const Ase = num(v.Ase)
  const ca = num(v.ca)
  const ha = num(v.ha)
  const Nu = num(v.Nu)
  const Mx = num(v.Mx), My = num(v.My)
  const cond = v.cond || 'B'
  const crack = v.crack || 'cracked'
  const Vu = num(v.Vu)
  const shearDir = v.shearDir || 'x'
  const grout = v.grout === 'yes'
  const n = nx * ny

  // posisi baut (mm), pusat = centroid grup
  const xs: number[] = [], ys: number[] = []
  for (let i = 0; i < nx; i++) xs.push((i - (nx - 1) / 2) * sx)
  for (let j = 0; j < ny; j++) ys.push((j - (ny - 1) / 2) * sy)
  let Sxx = 0, Syy = 0
  for (const x of xs) Sxx += x * x * ny
  for (const y of ys) Syy += y * y * nx

  // distribusi gaya baut elastis (kN)
  const SxxM = Sxx / 1e6, SyyM = Syy / 1e6
  const bolts: AnchorBolt[] = []
  let Tmax = -Infinity, sumTt = 0, exNum = 0, eyNum = 0
  for (let a = 0; a < nx; a++)
    for (let b = 0; b < ny; b++) {
      const xi = xs[a], yi = ys[b]
      const Tmoi = SxxM > 0 ? (Mx * (xi / 1000)) / SxxM : 0
      const Tmoj = SyyM > 0 ? (My * (yi / 1000)) / SyyM : 0
      const Ti = Nu / n + Tmoi + Tmoj
      bolts.push({ x: xi, y: yi, T: Ti })
      if (Ti > Tmax) Tmax = Ti
      if (Ti > 0) {
        sumTt += Ti
        exNum += Ti * (xi / 1000)
        eyNum += Ti * (yi / 1000)
      }
    }

  // baja tarik (17.6.1)
  const Nsa = (Ase * futa) / 1000
  const phiNsa = 0.75 * Nsa
  const dcSteel = phiNsa > 0 ? Tmax / phiNsa : Infinity

  // breakout tarik grup (17.6.2): beton normal, cast-in
  const lam = 1.0, kc = 10
  const Nb = (kc * lam * Math.sqrt(Math.max(0, fc)) * Math.pow(hef, 1.5)) / 1000
  const ANco = 9 * hef * hef
  const eff = Math.min(1.5 * hef, ca > 0 ? ca : 1.5 * hef)
  const Wx = (nx - 1) * sx, Wy = (ny - 1) * sy
  const ANc = Math.min((Wx + 2 * eff) * (Wy + 2 * eff), n * ANco)
  const ratioA = ANco > 0 ? ANc / ANco : 0
  const caMin = ca > 0 ? ca : 1.5 * hef
  const psiEd = caMin >= 1.5 * hef ? 1.0 : 0.7 + (0.3 * caMin) / (1.5 * hef)
  const psiC = crack === 'uncracked' ? 1.25 : 1.0
  const psiCp = 1.0
  const ex = sumTt > 0 ? Math.abs(exNum / sumTt) : 0 // m
  const ey = sumTt > 0 ? Math.abs(eyNum / sumTt) : 0
  const lim = (1.5 * hef) / 1000
  const psiEc = Math.min(1, 1 / (1 + ex / lim)) * Math.min(1, 1 / (1 + ey / lim))
  const Ncbg = ratioA * psiEc * psiEd * psiC * psiCp * Nb
  const phiC = cond === 'A' ? 0.75 : 0.7
  const phiNcbg = phiC * Ncbg
  const dcConc = phiNcbg > 0 ? sumTt / phiNcbg : Infinity

  // tumpang-tindih kerucut (spasi < 3·hef)
  let minGap = Infinity
  for (let p = 0; p < bolts.length; p++)
    for (let q = p + 1; q < bolts.length; q++) {
      const dx = bolts[p].x - bolts[q].x, dy = bolts[p].y - bolts[q].y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minGap) minGap = d
    }
  const minSpacing = Number.isFinite(minGap) ? minGap : 0
  const overlap = Number.isFinite(minGap) && minGap < 3 * hef

  // GESER (17.7): baja per angkur, grout ×0,8
  let Vsa = (0.6 * Ase * futa) / 1000
  if (grout) Vsa *= 0.8
  const phiVsa = 0.65 * Vsa
  const Vbolt = n > 0 ? Vu / n : 0
  const dcVsteel = phiVsa > 0 ? Vbolt / phiVsa : Infinity

  // breakout geser grup (17.7.2) — searah satu tepi, ca1 = ca
  const ca1 = ca, le = Math.min(hef, 8 * da)
  let Vb = 0, AVco = 0, AVc = 0, ratioAV = 0, psiEdV = 1, psiCV = 1, psiHV = 1
  let Vcbg = Infinity, phiVcbg = Infinity, dcVbreak = 0
  const breakoutApplic = ca1 > 0 && Vu > 0
  if (breakoutApplic) {
    const Vb1 = (0.66 * Math.pow(le / da, 0.2) * Math.sqrt(da) * Math.sqrt(fc) * Math.pow(ca1, 1.5)) / 1000
    const Vb2 = (3.7 * Math.sqrt(fc) * Math.pow(ca1, 1.5)) / 1000
    Vb = Math.min(Vb1, Vb2)
    AVco = 4.5 * ca1 * ca1
    const Wperp = shearDir === 'x' ? (ny - 1) * sy : (nx - 1) * sx
    const hAvail = ha > 0 ? Math.min(1.5 * ca1, ha) : 1.5 * ca1
    AVc = (Wperp + 3 * ca1) * hAvail
    ratioAV = AVco > 0 ? AVc / AVco : 0
    psiEdV = ca >= 1.5 * ca1 ? 1.0 : 0.7 + (0.3 * ca) / (1.5 * ca1) // ca2 = ca
    psiCV = crack === 'uncracked' ? 1.4 : 1.0
    psiHV = ha > 0 && ha < 1.5 * ca1 ? Math.sqrt((1.5 * ca1) / ha) : 1.0
    Vcbg = ratioAV * 1.0 * psiEdV * psiCV * psiHV * Vb // ψec,V = 1
    phiVcbg = phiC * Vcbg
    dcVbreak = phiVcbg > 0 ? Vu / phiVcbg : Infinity
  }

  // pryout (17.7.3) — breakout tarik konsentris (ψec = 1)
  const kcp = hef < 65 ? 1.0 : 2.0
  const Ncbg0 = ratioA * psiEd * psiC * psiCp * Nb
  const Vcpg = kcp * Ncbg0
  const phiVcpg = phiC * Vcpg
  const dcVpry = Vu > 0 && phiVcpg > 0 ? Vu / phiVcpg : 0

  const dcShear = Math.max(dcVsteel, dcVbreak, dcVpry)
  let govShear: AnchorBoltGroupResult['govShear'] = 'baja'
  if (dcVbreak >= dcVsteel && dcVbreak >= dcVpry) govShear = 'breakout'
  else if (dcVpry >= dcVsteel && dcVpry >= dcVbreak) govShear = 'pryout'

  // interaksi (17.8)
  const dcTension = Math.max(dcSteel, dcConc)
  const UN = dcTension, UV = dcShear
  let combined: number | null = null, interactMode = 'tunggal'
  if (sumTt > 0 && Vu > 0) {
    if (UN <= 0.2) interactMode = 'geser saja (N≤0,2)'
    else if (UV <= 0.2) interactMode = 'tarik saja (V≤0,2)'
    else {
      combined = Math.pow(UN, 5 / 3) + Math.pow(UV, 5 / 3)
      interactMode = 'interaksi 5/3'
    }
  }

  // menentukan
  const dcGov = Math.max(dcTension, dcShear, combined || 0)
  let gov: string
  if (combined != null && combined >= dcTension && combined >= dcShear) gov = 'interaksi tarik+geser'
  else if (Vu > 0 && dcShear >= dcTension) gov = 'geser — ' + govShear
  else gov = 'tarik — ' + (dcSteel >= dcConc ? 'baja' : 'breakout')

  // peringatan
  if (sumTt <= 0)
    warn.push('Tidak ada baut tertarik (Nu tekan & momen kecil) — cek breakout tarik tidak menentukan. Geser & tekan/bearing di luar cakupan v1.')
  if (Mx !== 0 && Sxx === 0)
    warn.push('Mx > 0 tetapi hanya 1 baris baut arah-X (Σxi²=0) — grup tak dapat menahan momen arah ini secara elastis.')
  if (My !== 0 && Syy === 0)
    warn.push('My > 0 tetapi hanya 1 kolom baut arah-Y (Σyi²=0) — grup tak dapat menahan momen arah ini.')
  if (overlap)
    warn.push('Kerucut breakout tumpang-tindih (spasi ' + minSpacing.toFixed(0) + ' mm < 3·hef = ' + (3 * hef).toFixed(0) + ' mm) — kapasitas grup < Σ kapasitas tunggal; sudah tercermin di ANc/ANco = ' + ratioA.toFixed(2) + '.')
  if (caMin < 1.5 * hef)
    warn.push('Jarak tepi ca = ' + caMin.toFixed(0) + ' mm < 1,5·hef = ' + (1.5 * hef).toFixed(0) + ' mm — efek tepi mengurangi kapasitas (ψed = ' + psiEd.toFixed(2) + ').')
  if (ha > 0 && ha < 1.5 * hef)
    warn.push('Tebal beton ha = ' + ha.toFixed(0) + ' mm < 1,5·hef — kemungkinan breakout tembus / perlu tinjauan hef,maks (ACI 17.6.2.1.2). Tidak dikoreksi otomatis di v1.')
  if (dcSteel > 1) warn.push('D/C baja tarik = ' + dcSteel.toFixed(2) + ' > 1 — baut leleh/putus. Perbesar diameter atau jumlah baut.')
  if (dcConc > 1)
    warn.push('D/C breakout beton (tarik) = ' + dcConc.toFixed(2) + ' > 1 — perbesar hef, spasi, jarak tepi, atau pasang tulangan angkur.')
  if (Vu > 0 && ca1 <= 0)
    warn.push('Geser Vu > 0 tetapi ca = 0 — breakout geser tidak ditinjau (dianggap tepi jauh). Bila ada tepi, isi ca agar breakout geser dihitung.')
  if (dcVsteel > 1)
    warn.push('D/C geser baja = ' + dcVsteel.toFixed(2) + ' > 1 — perbesar diameter/jumlah baut atau tambah kunci geser (shear key).')
  if (dcVbreak > 1)
    warn.push('D/C breakout geser = ' + dcVbreak.toFixed(2) + ' > 1 — perbesar jarak tepi ca1/tebal ha, atau pasang tulangan tepi.')
  if (dcVpry > 1)
    warn.push('D/C pryout = ' + dcVpry.toFixed(2) + ' > 1 — pryout menentukan (hef dangkal relatif terhadap geser). Perdalam hef.')
  if (combined != null && combined > 1.0)
    warn.push('Interaksi tarik+geser (Nua/φNn)^5/3 + (Vua/φVn)^5/3 = ' + combined.toFixed(2) + ' > 1,0 (ACI 17.8) — kombinasi menentukan meski masing-masing < 1.')

  return {
    valid: true, warn, nx, ny, sx, sy, n, da, hef, fc, futa, Ase, ca, ha, Nu, Mx, My, cond, crack, Vu, shearDir, grout,
    Sxx, Syy, bolts, Tmax, sumTt, Nsa, phiNsa, dcSteel,
    Nb, ANco, ANc, ratioA, psiEd, psiC, psiCp, psiEc, ex: ex * 1000, ey: ey * 1000, Ncbg, phiC, phiNcbg, eff, dcConc,
    minSpacing, overlap,
    Vsa, phiVsa, Vbolt, dcVsteel, le, Vb, AVco, AVc, ratioAV, psiEdV, psiCV, psiHV, breakoutApplic,
    Vcbg, phiVcbg, dcVbreak, kcp, Ncbg0, Vcpg, phiVcpg, dcVpry, dcShear, govShear,
    dcTension, combined, interactMode, UN, UV, dcGov, gov, govDC: dcGov,
  }
}
