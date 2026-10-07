import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOL_CATEGORIES, TOOLS, visibleTools } from './tools'

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

  it('keputusan 2026-10-07: beban angin di Pembebanan, load-combo tersembunyi, sambungan tertahan', () => {
    expect(TOOLS.find((t) => t.id === 'wind-load')?.category).toBe('Pembebanan')
    expect(TOOLS.find((t) => t.id === 'load-combo')?.status).toBe('hidden')
    for (const id of ['bolt-connection', 'weld-connection', 'anchor-bolt-group'])
      expect(TOOLS.find((t) => t.id === id)?.status).toBe('pending')
  })
})
