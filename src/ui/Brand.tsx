/** Logo heksagon EDFS (warna brand tetap di kedua tema). */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 108) / 100} viewBox="0 0 100 108" aria-hidden="true" focusable="false">
      <polygon points="28,8 50,8 50,50 6.1,50" fill="#F28F3B" />
      <polygon points="50,8 72,8 93.9,50 50,50" fill="#566246" />
      <polygon points="6.1,58 93.9,58 72,100 28,100" fill="#566246" />
    </svg>
  )
}
