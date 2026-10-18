// Ikon garis per tool (src/icons/{id}.svg, stroke=currentColor) — disalin dari modules/{id}/icon.svg build lama.
const ICONS = import.meta.glob<string>('../icons/*.svg', { query: '?raw', import: 'default', eager: true })

/** Ikon tool untuk slug `id`; kosong bila tidak ada berkasnya. */
export function ToolIcon({ id, className }: { id: string; className?: string }) {
  const svg = ICONS[`../icons/${id}.svg`]
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
}
