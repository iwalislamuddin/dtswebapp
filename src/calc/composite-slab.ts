// Pelat komposit dek baja (Bondek / Smartdek): tahap konstruksi (dek sendiri) + tahap komposit (lentur positif,
// tulangan negatif, susut-suhu, lendutan Branson) + konektor geser ke balok baja penumpu.
// Port 1:1 dari modules/composite-slab/module.js (compute), diverifikasi golden test.
// Properti dek INDIKATIF dari tabel pabrikan — wajib diverifikasi dengan tabel kapasitas resmi; semua dapat ditimpa.

import { crackedInertia, ES, stripDesign, type StripDesign } from './shared/concrete'
import { numFinite as num, type NumLike } from './shared/num'

const GAMMA_C = 24

export type DeckProfile = 'heavy' | 'light'

interface DeckThickness {
  fy: number
  Ase: number
  Ix: number
  Zx: number
  ye: number
  mass: number
}

interface DeckGeometry {
  name: string
  hr: number
  pitch: number
  cover: number
  bc: number
  bmts: string[]
  t: Record<string, DeckThickness>
}

/**
 * Tabel dek (katalog Lysaght): heavy = Bondek / Bondek II (re-entrant, hr 54, rusuk 200); light = Smartdek
 * (profil W, cover efektif 960). Ase (mm²/m), Ix (mm⁴/m), Zx (mm³/m), ye titik berat dari bawah (mm), massa kg/m².
 */
export const DECK: Record<DeckProfile, DeckGeometry> = {
  heavy: {
    name: 'Bondek / Bondek II', hr: 54, pitch: 200, cover: 600, bc: 600,
    bmts: ['0.75', '1.0', '1.2'],
    t: {
      '0.75': { fy: 550, Ase: 1259, Ix: 479800, Zx: 12500, ye: 15.3, mass: 10.3 },
      '1.0': { fy: 550, Ase: 1678, Ix: 640800, Zx: 16690, ye: 15.5, mass: 13.6 },
      '1.2': { fy: 500, Ase: 2014, Ix: 769000, Zx: 20030, ye: 15.5, mass: 16.2 },
    },
  },
  light: {
    name: 'Smartdek', hr: 50, pitch: 320, cover: 960, bc: 500,
    bmts: ['0.70', '1.0', '1.2'],
    t: {
      '0.70': { fy: 550, Ase: 890, Ix: 409375, Zx: 16974, ye: 26, mass: 7.38 },
      '1.0': { fy: 450, Ase: 1270, Ix: 584791, Zx: 24357, ye: 26, mass: 10.34 },
      '1.2': { fy: 450, Ase: 1524, Ix: 701979, Zx: 29330, ye: 26, mass: 12.33 },
    },
  },
}

/** BMT terdekat yang tersedia untuk profil. */
export function nearestBmt(profile: string, bmt: NumLike): string {
  const d = DECK[profile as DeckProfile] || DECK.heavy, b = num(bmt)
  let best = d.bmts[0], bd = Infinity
  for (const k of d.bmts) { const dd = Math.abs(num(k) - b); if (dd < bd) { bd = dd; best = k } }
  return best
}

/** Nilai default form dari tabel dek; kapasitas konstruksi φMn = 0,9·fy·Zx (kNm/m, 2 desimal). */
export function deckDefaults(profile: string, bmt: NumLike) {
  const d = DECK[profile as DeckProfile] || DECK.heavy
  const p = d.t[nearestBmt(profile, bmt)]
  return {
    hr: d.hr, pitch: d.pitch, cover: d.cover, bc: d.bc, Ase: p.Ase, ye: p.ye, Ideck: p.Ix, fyd: p.fy, mass: p.mass, Zx: p.Zx,
    Mcap: +((0.9 * p.fy * p.Zx) / 1e6).toFixed(2),
  }
}

/** Koefisien momen (+, −) & lendutan untuk 1 / 2 / ≥3 bentang. */
function coefPerm(spans: number) {
  if (spans <= 1) return { kP: 1 / 8, kN: 0, kD: 5 / 384, lbl: '1 bentang (sederhana)' }
  if (spans === 2) return { kP: 9 / 128, kN: 1 / 8, kD: 1 / 185, lbl: '2 bentang menerus' }
  return { kP: 1 / 11, kN: 1 / 9, kD: 1 / 145, lbl: '≥3 bentang menerus' }
}

export interface CompositeSlabInput {
  /** Bentang (m), tebal total (mm). */
  L: NumLike
  D: NumLike
  spans: NumLike
  prop?: 'none' | 'mid'
  composite?: 'comp' | 'noncomp'
  profile?: DeckProfile
  fc: NumLike
  fy: NumLike
  /** Beban mati tambahan, hidup, hidup konstruksi (kN/m²). */
  SDL: NumLike
  LL: NumLike
  cLL: NumLike
  cover: NumLike
  db: NumLike
  dbSt: NumLike
  dbBot: NumLike
  /** Properti dek (dapat ditimpa). */
  hr: NumLike
  Ase: NumLike
  ye: NumLike
  Ideck: NumLike
  Mcap: NumLike
  fyd: NumLike
  bc: NumLike
  conType?: 'stud' | 'rebar'
  ds: NumLike
  fuS: NumLike
}

export interface CompositeSlabResult {
  warn: string[]
  valid: boolean
  /** Satuan: kN, m, mm, kNm/m sesuai nama field di modul lama. */
  L?: number
  D?: number
  spans?: number
  fc?: number
  fy?: number
  SDL?: number
  LL?: number
  cLL?: number
  cover?: number
  db?: number
  dbSt?: number
  dbBot?: number
  hr?: number
  Ase?: number
  ye?: number
  Ideck?: number
  Mcap?: number
  fyd?: number
  bc?: number
  ds?: number
  fuS?: number
  pitch?: number
  deckCover?: number
  tc?: number
  DcAvg?: number
  concSW?: number
  deckSW?: number
  permSW?: number
  Lc?: number
  wcServ?: number
  wcDef?: number
  wcU?: number
  McU?: number
  McCap?: number
  dc?: number
  dcLim?: number
  wD?: number
  wL?: number
  wu?: number
  wSvc?: number
  Mpos?: number
  Mneg?: number
  Ec?: number
  dp?: number
  aPos?: number
  Tpos?: number
  phiMnPos?: number
  posDCR?: number
  dBot?: number
  dn?: number
  AsStSNI?: number
  AsStSDI?: number
  AsSt?: number
  sSt?: number
  AsStProv?: number
  wDefTot?: number
  wDefLL?: number
  Ie?: number
  Ig?: number
  Icr?: number
  Mcr?: number
  MaDef?: number
  dTot?: number
  dLL?: number
  lim250?: number
  lim360?: number
  Vh?: number
  Cc?: number
  Tsteel?: number
  Rg?: number
  Rp?: number
  Qn?: number
  Nstud?: number
  studSpace?: number
  comp?: boolean
  cDefOK?: boolean
  gov14?: boolean
  aInRib?: boolean
  posOK?: boolean
  negOK?: boolean
  cracked?: boolean
  defOK?: boolean
  cMomOK?: boolean | null
  profile?: DeckProfile
  deckName?: string
  prop?: 'none' | 'mid'
  conType?: 'stud' | 'rebar'
  coefLbl?: string
  asBot?: StripDesign
  asNeg?: StripDesign | null
}

/** Desain RC selebar b; ρmin default susut-suhu; Mu ≤ 0,005 → minimum. */
const designRC = (Mu: number, b: number, d: number, fc: number, fy: number, db: number, h: number, rhoMin?: number): StripDesign =>
  stripDesign(Mu, d, fc, fy, db, h, 3, 0.005, { b, rhoMin })

export function computeCompositeSlab(v: CompositeSlabInput): CompositeSlabResult {
  const r: CompositeSlabResult = { warn: [], valid: false }
  const L = num(v.L), D = num(v.D)
  const spans = parseInt(String(v.spans), 10) || 1
  const prop = v.prop || 'none'
  const comp = (v.composite || 'comp') === 'comp'
  const fc = num(v.fc), fy = num(v.fy)
  const SDL = num(v.SDL), LL = num(v.LL), cLL = num(v.cLL)
  const cover = num(v.cover), db = num(v.db), dbSt = num(v.dbSt), dbBot = num(v.dbBot)
  const hr = num(v.hr), Ase = num(v.Ase), ye = num(v.ye), Ideck = num(v.Ideck)
  const Mcap = num(v.Mcap), fyd = num(v.fyd), bc = num(v.bc)
  const conType = v.conType || 'stud', ds = num(v.ds), fuS = num(v.fuS)

  if (!(L > 0) || !(D > 0) || !(fc > 0) || !(fy > 0) || !(hr > 0)) return r
  if (D <= hr + 10) r.warn.push('Tebal slab D harus > tinggi rusuk dek + selimut (hr=' + hr + ' mm).')
  const dGeom = DECK[v.profile as DeckProfile] || DECK.heavy
  Object.assign(r, {
    profile: v.profile, deckName: dGeom.name, pitch: dGeom.pitch, deckCover: dGeom.cover,
    L, D, spans, prop, comp, fc, fy, SDL, LL, cLL, cover, db, dbSt, dbBot, hr, Ase, ye, Ideck, Mcap, fyd, bc, conType, ds, fuS,
  })

  const tc = D - hr // beton di atas rusuk (mm)
  const DcAvg = D - 0.5 * hr // tebal beton rata-rata (mm)
  const concSW = (GAMMA_C * DcAvg) / 1000 // kN/m²
  const deckSW = Ase * 7.7e-5
  const permSW = concSW + deckSW
  Object.assign(r, { tc, DcAvg, concSW, deckSW, permSW })

  // Tahap konstruksi (dek sendiri).
  const cc = prop === 'mid' ? { kP: 9 / 128, kN: 1 / 8, kD: 1 / 185 } : coefPerm(spans)
  const Lc = prop === 'mid' ? L / 2 : L
  const wcU = 1.2 * (concSW + deckSW) + 1.6 * cLL
  const McU = Math.max(cc.kP, cc.kN) * wcU * Lc * Lc
  const wcDef = concSW + deckSW // beton basah saja untuk lendutan
  const dc = (cc.kD * wcDef * Math.pow(Lc * 1000, 4)) / (ES * Math.max(Ideck, 1)) // mm
  const dcLim = Math.min((Lc * 1000) / 180, 20) // cegah ponding
  Object.assign(r, {
    Lc, wcServ: concSW + deckSW + cLL, wcDef, wcU, McU, McCap: Mcap, cMomOK: Mcap > 0 ? McU <= Mcap : null,
    dc, dcLim, cDefOK: dc <= dcLim,
  })

  // Tahap komposit.
  const cp = coefPerm(spans)
  const wD = permSW + SDL, wL = LL
  const wu = Math.max(1.4 * wD, 1.2 * wD + 1.6 * wL)
  const wSvc = wD + wL
  const Mpos = cp.kP * wu * L * L
  const Mneg = cp.kN * wu * L * L
  const Ec = 4700 * Math.sqrt(fc)
  Object.assign(r, { coefLbl: cp.lbl, wD, wL, wu, gov14: 1.4 * wD >= 1.2 * wD + 1.6 * wL, wSvc, Mpos, Mneg, Ec })

  // Momen positif.
  let asBot: StripDesign | undefined, dBot = 0, dp = 0
  if (comp) {
    dp = D - ye // ke titik berat dek
    const T = Ase * fyd // N/m
    const a = T / (0.85 * fc * 1000)
    const phiMnPos = (0.9 * T * (dp - a / 2)) / 1e6
    Object.assign(r, { dp, aPos: a, Tpos: T / 1000, aInRib: a > tc, phiMnPos, posOK: phiMnPos >= Mpos, posDCR: Mpos / phiMnPos })
  } else {
    dBot = D - cover - dbBot / 2 // tulangan bawah RC
    asBot = designRC(Mpos, 1000, dBot, fc, fy, dbBot, D)
    const phiMnPos = (0.9 * asBot.AsProv * fy * (dBot - (asBot.AsProv * fy) / (0.85 * fc * 1000) / 2)) / 1e6
    Object.assign(r, { dBot, asBot, phiMnPos, posOK: !asBot.infeasible })
  }

  // Tulangan negatif di tumpuan menerus (tekan di bawah rusuk, lebar bc).
  const dn = D - cover - db / 2
  r.dn = dn
  if (Mneg > 0.005) {
    const asNeg = designRC(Mneg, bc, dn, fc, fy, db, D, 0.0018)
    Object.assign(r, { asNeg, negOK: !asNeg.infeasible })
  } else r.asNeg = null

  // Susut-suhu di atas dek (maks SNI 0,0018 & SDI 0,00075).
  const AsStSNI = 0.0018 * 1000 * tc, AsStSDI = 0.00075 * 1000 * tc
  const AsSt = Math.max(AsStSNI, AsStSDI)
  const AbSt = (Math.PI / 4) * dbSt * dbSt
  let sSt = Math.floor((1000 * AbSt) / AsSt / 25) * 25
  const sStMax = Math.floor(Math.min(5 * tc, 450) / 25) * 25
  if (sSt > sStMax) sSt = sStMax
  if (sSt < 50) sSt = 50
  Object.assign(r, { AsStSNI, AsStSDI, AsSt, sSt, AsStProv: (1000 * AbSt) / sSt })

  // Lendutan komposit (retak, Branson).
  const Asdef = comp ? Ase : (asBot as StripDesign).AsProv
  const ddef = comp ? dp : dBot
  const Icr = crackedInertia(Asdef, ddef, fc, 1000).Icr
  const Ig = (1000 * Math.pow(DcAvg, 3)) / 12
  const fr = 0.62 * Math.sqrt(fc), yt = DcAvg / 2
  const Mcr = (fr * Ig) / yt / 1e6
  const wDefTot = prop === 'mid' ? wSvc : SDL + LL // dipropi → seluruh D+L pada komposit
  const Ma = cp.kP * wDefTot * L * L
  const ratio = Ma > Mcr ? Math.pow(Mcr / Ma, 3) : 1
  const Ie = Ma > Mcr ? Math.min(Ig, ratio * Ig + (1 - ratio) * Icr) : Ig
  const dTot = (cp.kD * wDefTot * Math.pow(L * 1000, 4)) / (Ec * Ie)
  const dLL = (cp.kD * LL * Math.pow(L * 1000, 4)) / (Ec * Ie)
  const lim250 = (L * 1000) / 250, lim360 = (L * 1000) / 360
  Object.assign(r, {
    wDefTot, wDefLL: LL, Ie, Ig, Icr, Mcr, MaDef: Ma, cracked: Ma > Mcr, dTot, dLL, lim250, lim360,
    defOK: dTot <= lim250 && dLL <= lim360,
  })

  // Konektor geser ke balok baja (dek tegak lurus balok, Rg = 1,0, Rp = 0,6).
  const Cc = 0.85 * fc * 1000 * tc // N/m
  const Tsteel = comp ? Ase * fyd : asBot ? asBot.AsProv * fy : 0
  const Vh = Math.min(Tsteel, Cc) / 1000
  const Asc = (Math.PI / 4) * ds * ds
  const Rg = 1.0, Rp = 0.6
  const Qn = conType === 'stud'
    ? Math.min(0.5 * Asc * Math.sqrt(fc * Ec), Rg * Rp * fuS * Asc) / 1000
    : Math.min(0.5 * Asc * Math.sqrt(fc * Ec), 0.6 * fuS * Asc) / 1000 // tulangan ulir dilas
  const Nstud = Qn > 0 ? Math.ceil(Vh / Qn) : 0
  Object.assign(r, {
    Vh, Cc: Cc / 1000, Tsteel: Tsteel / 1000, Rg, Rp, Qn, Nstud,
    studSpace: Nstud > 0 ? Math.floor(1000 / Nstud / 25) * 25 : 0, valid: true,
  })
  return r
}

