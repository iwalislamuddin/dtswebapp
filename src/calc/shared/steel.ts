// Konstanta & data baja bersama (SNI 1729:2020 ≈ AISC 360-16).

/** Modulus elastisitas baja (MPa). */
export const E_STEEL = 200000

/** Mutu baja struktural: Fy & Fu (MPa). Label tampilan disusun UI per tool. */
export const STEEL_GRADES: readonly { key: string; Fy: number; Fu: number }[] = [
  { key: 'BJ 37', Fy: 240, Fu: 370 },
  { key: 'BJ 41', Fy: 250, Fu: 410 },
  { key: 'BJ 50', Fy: 290, Fu: 500 },
  { key: 'BJ 55', Fy: 410, Fu: 550 },
  { key: 'SS400', Fy: 245, Fu: 400 },
  { key: 'A36', Fy: 250, Fu: 400 },
  { key: 'A572 Gr50', Fy: 345, Fu: 450 },
  { key: 'A992', Fy: 345, Fu: 450 },
]
