// Pelat satu arah menerus — varian pelat dari mesin `continuous-beam` (metode koefisien Ps. 6.5 / analisis elastis,
// pengaruh retak, lendutan). Lajur 1 m; berbagi seluruh perhitungan dengan balok menerus.

import { computeContinuousMember, type CMInput, type CMResult } from './continuous-beam'

export type OneWaySlabInput = Omit<CMInput, 'elem' | 'sect' | 'bt' | 'hf' | 'qDb' | 'qLb' | 'b'>

export function computeOneWaySlab(v: OneWaySlabInput): CMResult {
  return computeContinuousMember({ ...v, elem: 'pelat', b: 1000, sect: 'persegi', bt: 0, hf: 0, qDb: 0, qLb: 0 })
}
