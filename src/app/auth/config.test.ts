import { describe, expect, it } from 'vitest'
import { authEnvFor, authMode, cookieDomain, loginUrl } from './config'
import { premiumLabel } from './label'

describe('authMode', () => {
  it('*.edifisia.com → redirect ke pusat akun', () => {
    for (const h of ['edifisia.com', 'tools.edifisia.com', 'tools-staging.edifisia.com', 'matrix.edifisia.com'])
      expect(authMode(h)).toBe('redirect')
  })
  it('localhost, IP LAN, pages.dev, domain mirip → dialog lokal', () => {
    for (const h of ['localhost', '127.0.0.1', '192.168.1.5', 'civil-tools.pages.dev', 'notedifisia.com', 'edifisia.com.evil.io'])
      expect(authMode(h)).toBe('local')
  })
})

describe('cookieDomain', () => {
  it('sama dengan aplikasi Edifisia lain di *.edifisia.com, host-only selain itu', () => {
    expect(cookieDomain('tools.edifisia.com')).toBe('.edifisia.com')
    expect(cookieDomain('localhost')).toBeUndefined()
  })
})

describe('loginUrl', () => {
  it('next = URL halaman, ter-encode', () => {
    expect(loginUrl('https://edifisia.com', 'https://tools.edifisia.com/beam-flexure?x=1')).toBe(
      'https://edifisia.com/masuk?next=https%3A%2F%2Ftools.edifisia.com%2Fbeam-flexure%3Fx%3D1',
    )
  })
})

describe('authEnvFor', () => {
  it('tools.edifisia.com → prod + edifisia.com', () => {
    expect(authEnvFor('tools.edifisia.com')).toMatchObject({ target: 'prod', accountUrl: 'https://edifisia.com' })
  })
  it('pages.dev & localhost → dev + staging.edifisia.com', () => {
    for (const h of ['civil-tools.pages.dev', 'abc123.civil-tools.pages.dev', 'localhost'])
      expect(authEnvFor(h)).toMatchObject({ target: 'dev', accountUrl: 'https://staging.edifisia.com' })
  })
  it('VITE_AUTH_TARGET memaksa pilihan; nilai lain diabaikan', () => {
    expect(authEnvFor('localhost', 'prod').target).toBe('prod')
    expect(authEnvFor('tools.edifisia.com', 'dev').target).toBe('dev')
    expect(authEnvFor('localhost', 'staging').target).toBe('dev')
  })
})

describe('premiumLabel', () => {
  const now = Date.parse('2026-10-15T00:00:00Z')
  it('trial aktif, ≤ 7 hari → warn', () => {
    expect(premiumLabel({ active: true, expires_at: '2026-10-20T00:00:00Z', is_trial: true }, now)).toMatchObject({
      tone: 'warn',
    })
  })
  it('premium aktif lama → ok', () => {
    const l = premiumLabel({ active: true, expires_at: '2027-01-20T00:00:00Z', is_trial: false }, now)
    expect(l.tone).toBe('ok')
    expect(l.text.startsWith('Premium s/d')).toBe(true)
  })
  it('kedaluwarsa / belum pernah', () => {
    expect(premiumLabel({ active: false, expires_at: '2026-10-01T00:00:00Z', is_trial: false }, now).text).toMatch(/^Premium berakhir/)
    expect(premiumLabel({ active: false, expires_at: null, is_trial: false }, now).text).toBe('Belum Premium')
  })
})
