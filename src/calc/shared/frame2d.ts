// Analisis rangka bidang (matrix stiffness) bersama — portal, gable, tangga beton.
// Elemen aksial + lentur 6 DOF lokal [u_i, v_i, θ_i, u_j, v_j, θ_j]; konvensi {f} = [k]{d} + {ff}, dengan {ff} gaya
// ujung terjepit yang menahan batang (beban simpul ekuivalen = −{ff}). Satuan internal N & mm.
// Urutan operasi identik dengan build lama (golden test).

export type Mat = number[][]

export const matZ = (n: number, m: number): Mat => Array.from({ length: n }, () => Array.from({ length: m }, () => 0))

export function matMul(A: Mat, B: Mat): Mat {
  const n = A.length, k = B.length, m = B[0].length, C = matZ(n, m)
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    let s = 0
    for (let p = 0; p < k; p++) s += A[i][p] * B[p][j]
    C[i][j] = s
  }
  return C
}

export function matT(A: Mat): Mat {
  const n = A.length, m = A[0].length, C = matZ(m, n)
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) C[j][i] = A[i][j]
  return C
}

/** K·x = b dengan Gauss-Jordan + pivot parsial; null bila pivot < 1e-12 (singular / mekanisme). */
export function solveLinear(K: Mat, b: number[]): number[] | null {
  const n = b.length
  const A = K.map((r, i) => r.slice().concat([b[i]]))
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    if (Math.abs(A[piv][c]) < 1e-12) return null
    const tmp = A[c]; A[c] = A[piv]; A[piv] = tmp
    const d = A[c][c]
    for (let j = c; j <= n; j++) A[c][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = A[r][c]
      if (f === 0) continue
      for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j]
    }
  }
  return A.map((r) => r[n])
}

/** Kekakuan lokal 6×6 elemen rangka bidang. */
export function kLocal(EA: number, EI: number, L: number): Mat {
  const a = EA / L
  const c1 = (12 * EI) / (L * L * L), c2 = (6 * EI) / (L * L), c3 = (4 * EI) / L, c4 = (2 * EI) / L
  return [
    [a, 0, 0, -a, 0, 0],
    [0, c1, c2, 0, -c1, c2],
    [0, c2, c3, 0, -c2, c4],
    [-a, 0, 0, a, 0, 0],
    [0, -c1, -c2, 0, c1, -c2],
    [0, c2, c4, 0, -c2, c3],
  ]
}

/** Transformasi 6×6 global → lokal dari kosinus arah. */
export function transform(cx: number, cy: number): Mat {
  const T = matZ(6, 6)
  const R = [[cx, cy, 0], [-cy, cx, 0], [0, 0, 1]]
  for (let b = 0; b < 2; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[b * 3 + i][b * 3 + j] = R[i][j]
  return T
}

export interface SpanPoint {
  /** N di +lokal (y untuk lintang, x untuk aksial). */
  P: number
  /** Jarak dari ujung i (mm). */
  a: number
}

/** FEF lokal: merata aksial wx & lintang wy (N/mm), terpusat lintang ptsY & aksial ptsX. */
export function fefLocal(wx: number, wy: number, L: number, ptsY: readonly SpanPoint[] = [], ptsX: readonly SpanPoint[] = []): number[] {
  const f = [(-wx * L) / 2, (-wy * L) / 2, (-wy * L * L) / 12, (-wx * L) / 2, (-wy * L) / 2, (wy * L * L) / 12]
  for (const p of ptsY) {
    const a = p.a, bb = L - a, P = p.P
    f[1] -= (P * bb * bb * (L + 2 * a)) / (L * L * L)
    f[2] -= (P * a * bb * bb) / (L * L)
    f[4] -= (P * a * a * (L + 2 * bb)) / (L * L * L)
    f[5] += (P * a * a * bb) / (L * L)
  }
  for (const p of ptsX) {
    const a = p.a, bb = L - a, P = p.P
    f[0] -= (P * bb) / L
    f[3] -= (P * a) / L
  }
  return f
}

/** Nilai dengan magnitudo terbesar (bertanda). */
export function extAbs(arr: readonly number[]): number {
  let m = 0
  for (const x of arr) if (Math.abs(x) > Math.abs(m)) m = x
  return m
}

/** Penampang batang untuk analisis (satuan mm, MPa). */
export interface FrameSection {
  A: number
  I: number
  S: number
  E: number
}

/** Batang rangka; field hasil diisi oleh analyzeFrame (dimutasi di tempat, seperti build lama). */
export interface FrameMember {
  ni: number
  nj: number
  sec: FrameSection
  wx: number
  wy: number
  L?: number
  cx?: number
  cy?: number
  kl?: Mat
  T?: Mat
  EI?: number
  EA?: number
  ff?: number[]
  fLocal?: number[]
  dloc?: number[]
  xs?: number[]
  Ns?: number[]
  Vs?: number[]
  Ms?: number[]
  /** kN, kN, kNm */
  Nmax?: number
  Vmax?: number
  Mmax?: number
  /** Tegangan elastis informatif (MPa). */
  fb?: number | null
  fa?: number | null
}

export interface FrameAnalysis {
  /** Perpindahan global (mm, rad). */
  D: number[]
  /** N·mm, N, N */
  maxM: number
  maxV: number
  maxN: number
}

/** Sampel diagram per batang. */
const NSEG = 48

const dofMap = (e: FrameMember) => [e.ni * 3, e.ni * 3 + 1, e.ni * 3 + 2, e.nj * 3, e.nj * 3 + 1, e.nj * 3 + 2]

/**
 * Rakit, selesaikan, dan pulihkan diagram N/V/M rangka bidang. Geometri batang (L, cx, cy) harus sudah terisi.
 * ptsY/ptsX memberi beban terpusat lintang/aksial tiap batang. F = beban simpul global (dimutasi: + beban ekuivalen).
 * Mengembalikan null bila struktur tidak stabil.
 */
export function analyzeFrame<E extends FrameMember>(
  elems: E[], ND: number, F: number[], fixedDof: number[],
  ptsY: (e: E) => readonly SpanPoint[], ptsX: (e: E) => readonly SpanPoint[] = () => [],
): FrameAnalysis | null {
  const K = matZ(ND, ND)
  for (const e of elems) {
    const L = e.L as number
    const EA = e.sec.E * e.sec.A, EI = e.sec.E * e.sec.I
    const kl = kLocal(EA, EI, L)
    const T = transform(e.cx as number, e.cy as number)
    const kg = matMul(matMul(matT(T), kl), T)
    Object.assign(e, { kl, T, EI, EA })
    const ff = fefLocal(e.wx, e.wy, L, ptsY(e), ptsX(e))
    e.ff = ff
    const ffg = matMul(matT(T), ff.map((x) => [x]))
    const map = dofMap(e)
    for (let a2 = 0; a2 < 6; a2++) {
      F[map[a2]] -= ffg[a2][0]
      for (let b2 = 0; b2 < 6; b2++) K[map[a2]][map[b2]] += kg[a2][b2]
    }
  }

  const isFixed = Array.from({ length: ND }, () => false)
  for (const d of fixedDof) isFixed[d] = true
  const free: number[] = []
  for (let i = 0; i < ND; i++) if (!isFixed[i]) free.push(i)
  const nf = free.length
  const Kr = matZ(nf, nf), Fr = Array.from({ length: nf }, () => 0)
  for (let i = 0; i < nf; i++) {
    Fr[i] = F[free[i]]
    for (let j = 0; j < nf; j++) Kr[i][j] = K[free[i]][free[j]]
  }
  const dr = solveLinear(Kr, Fr)
  if (!dr) return null
  const D = Array.from({ length: ND }, () => 0)
  for (let i = 0; i < nf; i++) D[free[i]] = dr[i]

  let maxM = 0, maxV = 0, maxN = 0
  for (const e of elems) {
    const L = e.L as number
    const dloc = matMul(e.T as Mat, dofMap(e).map((m) => [D[m]]))
    const fl = matMul(e.kl as Mat, dloc)
    const fLocal = fl.map((row, k) => row[0] + (e.ff as number[])[k]) // + FEF = gaya ujung nyata
    e.fLocal = fLocal
    e.dloc = dloc.map((x) => x[0])
    const py = ptsY(e), px = ptsX(e)

    // Titik sampel: NSEG pias + dobel titik di beban terpusat lintang (kunci teks 4 desimal, seperti build lama).
    const stops: Record<string, number> = {}
    for (let s = 0; s <= NSEG; s++) stops[((L * s) / NSEG).toFixed(4)] = (L * s) / NSEG
    for (const p of py) {
      stops[(p.a - 1e-3).toFixed(4)] = Math.max(0, p.a - 1e-3)
      stops[(p.a + 1e-3).toFixed(4)] = Math.min(L, p.a + 1e-3)
    }
    const xs = Object.keys(stops).map((k) => stops[k]).sort((a, b) => a - b)
    const Ns: number[] = [], Vs: number[] = [], Ms: number[] = []
    for (const x of xs) {
      let Wx = e.wx * x
      let Wy = e.wy * x
      for (const p of px) if (p.a < x - 1e-6) Wx += p.P
      for (const p of py) if (p.a < x - 1e-6) Wy += p.P
      const Nv = -(fLocal[0] + Wx) // tarik (+)
      const Vv = -(fLocal[1] + Wy)
      let Mv = -fLocal[2] + fLocal[1] * x + (e.wy * x * x) / 2 // sagging (+)
      for (const p of py) if (p.a < x - 1e-6) Mv -= (p.a - x) * p.P
      Ns.push(Nv)
      Vs.push(Vv)
      Ms.push(Mv)
      if (Math.abs(Nv) > Math.abs(maxN)) maxN = Nv
      if (Math.abs(Vv) > Math.abs(maxV)) maxV = Vv
      if (Math.abs(Mv) > Math.abs(maxM)) maxM = Mv
    }
    Object.assign(e, {
      xs, Ns, Vs, Ms, Nmax: extAbs(Ns) / 1e3, Vmax: extAbs(Vs) / 1e3, Mmax: extAbs(Ms) / 1e6,
      fb: e.sec.S > 0 ? Math.abs(extAbs(Ms)) / e.sec.S : null,
      fa: e.sec.A > 0 ? Math.abs(extAbs(Ns)) / e.sec.A : null,
    })
  }
  return { D, maxM, maxV, maxN }
}

/** Reaksi di ujung batang (gaya ujung global): kN, kN, kNm. */
export function memberEndReaction(e: FrameMember, endIsI: boolean): { Rx: number; Ry: number; M: number } {
  const fg = matMul(matT(e.T as Mat), (e.fLocal as number[]).map((x) => [x]))
  const o = endIsI ? 0 : 3
  return { Rx: fg[o][0] / 1e3, Ry: fg[o + 1][0] / 1e3, M: fg[o + 2][0] / 1e6 }
}

/** Lendutan lintang lokal (Hermite) di t ∈ [0, 1] dari perpindahan ujung lokal dl. */
export function hermiteV(dl: readonly number[], L: number, t: number): number {
  return (1 - 3 * t * t + 2 * t * t * t) * dl[1] + L * (t - 2 * t * t + t * t * t) * dl[2] +
    (3 * t * t - 2 * t * t * t) * dl[4] + L * (-t * t + t * t * t) * dl[5]
}
