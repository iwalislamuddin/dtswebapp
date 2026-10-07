import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOL_CATEGORIES, TOOLS, toolGroups, visibleTools } from './tools'

const CALC = join(__dirname, 'calc')
const calcTools = readdirSync(CALC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3))

describe('katalog tool', () => {
  it('id unik dan berformat slug', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/) // sama dengan CHECK tools.saved_works.tool_id
  })

  it('ported ⇔ ada src/calc/{id}.ts; setiap file perhitungan terdaftar', () => {
    for (const t of TOOLS) expect(existsSync(join(CALC, t.id + '.ts')), t.id).toBe(t.ported)
    for (const f of calcTools) expect(TOOLS.some((t) => t.id === f), f).toBe(true)
  })

  it('setiap tool aktif sudah di-port & punya SEO; kategori terdaftar', () => {
    for (const t of visibleTools()) {
      expect(t.ported, t.id).toBe(true)
      expect(t.seo.title.length).toBeGreaterThan(10)
      expect(t.seo.desc.length).toBeGreaterThan(40)
    }
    for (const t of TOOLS) expect(TOOL_CATEGORIES).toContain(t.category)
  })

  it('keputusan 2026-10-07: Pembebanan, Struktur Bawah, sambungan → Baja, base-plate → EDFS Nexus', () => {
    const t = (id: string) => TOOLS.find((x) => x.id === id)
    expect(t('wind-load')?.category).toBe('Pembebanan')
    expect(t('load-combo')?.status).toBe('hidden')
    for (const id of ['footing-design', 'pile-cap', 'retaining-stone', 'retaining-concrete'])
      expect(t(id)?.category).toBe('Struktur Bawah')
    for (const id of ['bolt-connection', 'weld-connection', 'anchor-bolt-group']) {
      expect(t(id)?.category).toBe('Baja')
      expect(t(id)).toMatchObject({ status: 'active', ported: true })
    }
    expect(t('base-plate')).toMatchObject({ status: 'moved', movedTo: 'EDFS Nexus' })
    for (const x of TOOLS) expect(x.status === 'moved', x.id).toBe(!!x.movedTo)
  })

  it('navigasi: urutan kategori, tanpa kategori kosong, setiap tool aktif tepat sekali', () => {
    const groups = toolGroups()
    expect(groups.map((g) => g.category)).toEqual(TOOL_CATEGORIES.filter((c) => groups.some((g) => g.category === c)))
    expect(groups.flatMap((g) => g.tools.map((x) => x.id))).toEqual(
      TOOL_CATEGORIES.flatMap((c) => visibleTools().filter((x) => x.category === c).map((x) => x.id)),
    )
    expect(groups.every((g) => g.tools.length > 0)).toBe(true)
  })
})
