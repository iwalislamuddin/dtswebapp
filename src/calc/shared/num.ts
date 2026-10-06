/** Nilai dari form: angka, atau teks yang di-parse seperti build lama (parseFloat; tak valid = 0). */
export type NumLike = number | string

export function num(v: NumLike | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '')
  return Number.isNaN(n) ? 0 : n
}

export const D2R = Math.PI / 180

export const deg2rad = (deg: number): number => (deg * Math.PI) / 180

/** Seperti num(), tetapi ±Infinity juga dianggap 0 (perilaku parser tool CPT lama). */
export function numFinite(v: NumLike | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}
