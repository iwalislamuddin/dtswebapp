// Rumus geoteknik bersama — dipakai Daya Dukung Tanah (fondasi dangkal) dan Daya Dukung Tiang.

/** Berat isi air (kN/m³). */
export const GAMMA_W = 9.81
/** Tekanan atmosfer (kPa). */
export const P_ATM = 100

/** Nq Prandtl–Reissner (Meyerhof, Vesic, ujung tiang): e^(π·tanφ)·tan²(45°+φ/2). φ dalam radian. */
export function nqPrandtl(phi: number): number {
  return Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2)
}

/** Nq Terzaghi (1943): e^(2(3π/4−φ/2)tanφ) / (2cos²(45°+φ/2)). φ dalam radian. */
export function nqTerzaghi(phi: number): number {
  const a = Math.exp((0.75 * Math.PI - phi / 2) * Math.tan(phi))
  return (a * a) / (2 * Math.pow(Math.cos(Math.PI / 4 + phi / 2), 2))
}

/** Tabel Nγ Terzaghi, keruntuhan geser umum (Bowles/Das): [φ°, Nγ]. */
const TERZAGHI_NGAMMA: readonly (readonly [number, number])[] = [
  [0, 0], [5, 0.5], [10, 1.2], [15, 2.5], [20, 5.0],
  [25, 9.7], [30, 19.7], [35, 42.4], [40, 100.4], [45, 297.5], [50, 1153.2],
]

/** Nγ Terzaghi dari tabel, interpolasi log-linear. φ > 50° di-clamp ke 50° (`capped`). φ dalam derajat. */
export function ngTerzaghi(phiDeg: number): { value: number; capped: boolean } {
  if (phiDeg <= 0) return { value: 0, capped: false }
  const capped = phiDeg > 50
  if (capped) phiDeg = 50
  const T = TERZAGHI_NGAMMA
  let i = 0
  for (; i < T.length - 1; i++) if (phiDeg < T[i + 1][0]) break
  if (i >= T.length - 1) i = T.length - 2
  const [x0, y0] = T[i]
  const [x1, y1] = T[i + 1]
  const t = (phiDeg - x0) / (x1 - x0)
  const value = y0 > 0 && y1 > 0 ? Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0))) : y0 + t * (y1 - y0)
  return { value, capped }
}

export interface SoilLayerWeight {
  /** Tebal lapis (m). */
  H: number
  /** Berat isi (kN/m³); di bawah MAT dipakai γ − γw. */
  gamma: number
}

/** Tegangan vertikal efektif σ'v (kPa) di kedalaman z (m) pada profil berlapis, MAT di kedalaman Dw (m). */
export function effectiveStressAt(z: number, layers: readonly SoilLayerWeight[], Dw: number): number {
  let s = 0
  let zc = 0
  for (const layer of layers) {
    const top = zc
    const bot = zc + layer.H
    if (z <= top) break
    const b = Math.min(z, bot)
    let a = top
    if (Dw > a) {
      const upTo = Math.min(b, Dw)
      s += layer.gamma * (upTo - a)
      a = upTo
    }
    if (b > a) s += (layer.gamma - GAMMA_W) * (b - a)
    zc = bot
    if (z <= bot) break
  }
  return s
}
