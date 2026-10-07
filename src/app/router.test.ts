import { describe, expect, it } from 'vitest'
import { parsePath } from './router'

describe('parsePath', () => {
  it('halaman depan', () => {
    for (const p of ['/', '', '/index.html']) expect(parsePath(p)).toEqual({ kind: 'home' })
  })
  it('slug tool di katalog, termasuk yang tidak tampil di navigasi', () => {
    expect(parsePath('/beam-flexure')).toEqual({ kind: 'tool', id: 'beam-flexure' })
    expect(parsePath('/beam-flexure/')).toEqual({ kind: 'tool', id: 'beam-flexure' })
    expect(parsePath('/base-plate')).toEqual({ kind: 'tool', id: 'base-plate' })
    expect(parsePath('/load-combo')).toEqual({ kind: 'tool', id: 'load-combo' })
  })
  it('selain itu tidak ditemukan', () => {
    for (const p of ['/tidak-ada', '/Beam-Flexure', '/beam-flexure/x', '/assets/a.js'])
      expect(parsePath(p).kind).toBe('notfound')
  })
})
