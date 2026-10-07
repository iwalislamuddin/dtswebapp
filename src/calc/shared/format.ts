/** Format angka seperti UI.fmt build lama (en-US, dp desimal tetap; kosong/NaN → '—'). */
export function formatNumber(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}
