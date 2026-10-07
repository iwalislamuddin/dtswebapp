import { describe, expect, it } from 'vitest'
import { headFor } from './head'

describe('headFor', () => {
  it('tool aktif: judul & deskripsi SEO katalog, kanonik di domain baru', () => {
    const h = headFor({ kind: 'tool', id: 'beam-flexure' })
    expect(h.title).toMatch(/^Kapasitas Lentur Balok Beton φMn .* · EDFS Civil Tools$/)
    expect(h.canonical).toBe('https://tools.edifisia.com/beam-flexure')
  })
  it('tool tidak aktif & 404 tidak diindeks', () => {
    expect(headFor({ kind: 'tool', id: 'base-plate' }).canonical).toBeNull()
    expect(headFor({ kind: 'tool', id: 'load-combo' }).canonical).toBeNull()
    expect(headFor({ kind: 'tool', id: 'bolt-connection' }).canonical).toBeNull()
    expect(headFor({ kind: 'notfound', path: '/x' }).canonical).toBeNull()
  })
  it('halaman depan', () => {
    expect(headFor({ kind: 'home' }).canonical).toBe('https://tools.edifisia.com/')
  })
})
