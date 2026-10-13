import { describe, expect, it } from 'vitest'
import golden from './__golden__/continuous-beam.json'
import type { GoldenCase } from './__golden__/golden'
import { computeContinuousMember, type CMInput } from './continuous-beam'
import { designTee, effectiveFlangeWidth } from './shared/tee'

const cases = golden as GoldenCase[]

/** Input golden build lama → CMInput (koefisien, tanpa retak/lendutan). */
function fromGolden(name: string, over: Partial<CMInput> = {}): CMInput {
  const a = cases.find((c) => c.name.startsWith(name))!.args[0] as Record<string, string | number>
  const num = (k: string) => Number(a[k])
  return {
    elem: a.elem as CMInput['elem'], n: num('n'), L: num('L'), Li: num('Li'), bsup: num('bsup'), b: num('b'), h: num('h'),
    sect: 'persegi', bt: 0, hf: 0, qDs: num('qDs'), qLs: num('qLs'), qDb: num('qDb'), qLb: num('qLb'),
    ujung: a.ujung as CMInput['ujung'], m12: a.m12 as CMInput['m12'], tumpuan1: a.tumpuan1 as CMInput['tumpuan1'],
    metode: 'koef', ujungS: 'sendi', retak: 'ig', design: 'ya', fc: num('fc'), fy: num('fy'), cc: num('cc'), db: num('db'), fyt: num('fyt'), ds: num('ds'),
    defl: 'tidak', xi: 2, sustL: 0.25, limDiv: 480, ...over,
  }
}

const key = (mu: number, as: number) => `${mu.toFixed(5)}|${as.toFixed(2)}`

describe('continuous-member — metode koefisien = build lama', () => {
  it.each(['default', 'pelat 2 bentang', 'pelat ujung bebas', 'balok 3 bentang', 'balok geser tinggi', '1 bentang jepit-sendi', '1 bentang jepit-jepit'])(
    'desain "%s" sama dengan golden',
    (name) => {
      const ref = cases.find((c) => c.name.startsWith(name))!.output as { des: { items: { Mu: number; AsProv: number; txt: string }[]; shear?: { sPakai: number | null; sReq: number; zone: string } } }
      const r = computeContinuousMember(fromGolden(name))
      expect(r.valid).toBe(true)
      const mine = new Set(r.des!.items!.map((i) => key(i.Mu, i.AsProv)))
      const old = new Set(ref.des.items.map((i) => key(i.Mu, i.AsProv)))
      expect([...mine].sort()).toEqual([...old].sort())
      if (ref.des.shear) {
        const sh = ref.des.shear
        expect(r.des!.shear!.sPakai).toBe(sh.zone === 'none' ? null : Math.max(50, Math.floor(sh.sReq / 25) * 25)) // kelipatan 25 mm
      }
    },
  )
})

describe('continuous-member — solver', () => {
  const base = (over: Partial<CMInput> = {}) => fromGolden('default', { metode: 'solver', n: 3, L: 4, Li: 4, bsup: 0, qLs: 0, ...over })

  it('3 bentang sama, beban penuh: M− tumpuan dalam = wu·L²/10, M+ ujung = 0,08·wu·L² (sendi di ujung)', () => {
    const r = computeContinuousMember(base())
    expect(r.metode).toBe('solver')
    expect(r.supM![1]).toBeCloseTo((r.wu! * 16) / 10, 3)
    expect(r.spanM![0]).toBeCloseTo(0.08 * r.wu! * 16, 3)
    expect(r.supM![0]).toBeCloseTo(0, 6)
  })

  it('mode auto: syarat 6.5.1 gagal (qL > 3qD) → solver; terpenuhi → koefisien', () => {
    expect(computeContinuousMember(base({ metode: 'auto', qLs: 20 })).metode).toBe('solver')
    expect(computeContinuousMember(base({ metode: 'auto', qLs: 3 })).metode).toBe('koef')
    expect(computeContinuousMember(base({ metode: 'auto', n: 3, L: 4, Li: 6, qLs: 1 })).metode).toBe('solver') // rasio 50%
  })

  it('pola beban hidup: M+ bentang & M− tumpuan ≥ kasus beban penuh', () => {
    const full = computeContinuousMember(base({ qLs: 0 }))
    const pat = computeContinuousMember(base({ qLs: 6 }))
    expect(pat.nPola!).toBeGreaterThan(3)
    expect(pat.spanM![1]).toBeGreaterThan(0)
    expect(pat.MnegMax!).toBeGreaterThan(full.MnegMax!)
  })

  it('reduksi ke muka tumpuan: lebar tumpuan besar → M− lebih kecil', () => {
    const a = computeContinuousMember(base({ bsup: 0 })), b = computeContinuousMember(base({ bsup: 400 }))
    expect(b.supM![1]).toBeLessThan(a.supM![1])
  })

  it('ujung jepit menambah M− tumpuan luar', () => {
    const r = computeContinuousMember(base({ ujungS: 'jepit' }))
    expect(r.supM![0]).toBeGreaterThan(0)
  })

  it('satu bentang solver = statika (sendi-sendi wL²/8)', () => {
    const r = computeContinuousMember(base({ n: 1, tumpuan1: 'ss', bsup: 0 }))
    expect(r.spanM![0]).toBeCloseTo((r.wu! * 16) / 8, 3)
  })
})

describe('continuous-member — balok T/L', () => {
  it('lebar efektif sayap Tabel 6.3.2.1', () => {
    // T: bw 300, hf 120, bt 3000, ln 6 m → tiap sisi min(960, 1350, 750) = 750 → 1800
    expect(effectiveFlangeWidth('T', 300, 120, 3000, 6)).toBe(1800)
    // L: min(6hf = 720, bt − bw/2 = 1350, ln/12 = 500) = 500 → 800
    expect(effectiveFlangeWidth('L', 300, 120, 1500, 6)).toBe(800)
    expect(effectiveFlangeWidth('persegi', 300, 120, 3000, 6)).toBe(300)
  })

  it('designTee: a ≤ hf = persegi bf; a > hf memenuhi keseimbangan φMn = Mu', () => {
    const fc = 25, fy = 420, bw = 300, bf = 1200, hf = 120, d = 540
    const small = designTee(150, bw, bf, hf, d, fc, fy)
    expect(small.tShaped).toBe(false)
    const big = designTee(1500, bw, bf, hf, d, fc, fy)
    expect(big.tShaped).toBe(true)
    const a = big.a
    const Cf = 0.85 * fc * (bf - bw) * hf, Cw = 0.85 * fc * bw * a
    expect(Cf + Cw).toBeCloseTo(big.As * fy, 0)
    const Mn = Cf * (d - hf / 2) + Cw * (d - a / 2)
    expect(0.9 * Mn / 1e6).toBeCloseTo(1500, 1)
  })

  it('T hemat tulangan dibanding persegi; beban pelat tributari ikut dihitung', () => {
    const mk = (sect: CMInput['sect']): CMInput => ({
      ...fromGolden('balok 3 bentang'), sect, bt: 3, hf: 120, qDs: 2, qLs: 3, qDb: 5, qLb: 5, bsup: 300, b: 300, h: 600,
    })
    const rect = computeContinuousMember(mk('persegi')), tee = computeContinuousMember(mk('T'))
    expect(tee.kind).toBe('T')
    expect(tee.wD!).toBeGreaterThan(rect.wD! - 1e-9) // pelat sayap dihitung pada keduanya bila bt & hf diisi
    const pos = (r: ReturnType<typeof computeContinuousMember>) => r.des!.items!.filter((i) => i.kind === 'pos').map((i) => i.AsReq)
    expect(Math.max(...pos(tee))).toBeLessThanOrEqual(Math.max(...pos(rect)) + 1e-6)
    expect(tee.bfSpan![0]).toBeGreaterThan(300)
  })

  it('T tanpa data pelat → peringatan, dihitung persegi', () => {
    const r = computeContinuousMember({ ...fromGolden('balok 3 bentang'), sect: 'T', bt: 0, hf: 0 })
    expect(r.kind).toBe('persegi')
    expect(r.warn.some((w) => /persegi/.test(w))).toBe(true)
  })
})

describe('continuous-member — lendutan & retak', () => {
  const ss = (over: Partial<CMInput> = {}): CMInput => ({
    ...fromGolden('1 bentang sendi'), h: 200, L: 3, bsup: 0, qDs: 1, qLs: 1, metode: 'solver', defl: 'ya', ...over,
  })

  it('pelat sendi-sendi tak retak: δ(D+L) = 5wL⁴/384EcIg (hitung tangan 0,458 mm)', () => {
    const r = computeContinuousMember(ss({ retak: 'ig' }))
    expect(r.defl!.spans![0].dDL).toBeCloseTo(0.4578, 3)
    expect(r.defl!.spans![0].dL).toBeCloseTo(((0.4578 * 1) / 6.8), 3)
  })

  it('retak variabel / rata-rata ≥ penampang utuh pada bentang yang retak', () => {
    const o = { h: 130, L: 5, qDs: 2, qLs: 5 }
    const ig = computeContinuousMember(ss({ ...o, retak: 'ig' })).defl!.spans![0].dDL
    const va = computeContinuousMember(ss({ ...o, retak: 'variabel' })).defl!.spans![0].dDL
    const ra = computeContinuousMember(ss({ ...o, retak: 'rata' })).defl!.spans![0].dDL
    expect(va).toBeGreaterThan(ig * 1.05)
    expect(ra).toBeGreaterThan(ig * 1.05)
  })

  it('variabel: Ie bervariasi sepanjang bentang menerus (tengah < tumpuan-tak-retak)', () => {
    const r = computeContinuousMember({ ...fromGolden('pelat 3 bentang'), metode: 'solver', retak: 'variabel', defl: 'ya', h: 120, qLs: 5 })
    const sp = r.defl!.spans![1]
    expect(sp.IeMin).toBeLessThan(sp.IeMax)
  })

  it('tanpa desain tulangan → pesan lendutan', () => {
    const r = computeContinuousMember(ss({ design: 'tidak' }))
    expect(r.defl!.valid).toBe(false)
  })
})

describe('continuous-member — penulangan', () => {
  const beam = (over: Partial<CMInput> = {}): CMInput => ({ ...fromGolden('balok 3 bentang'), ...over })

  it('zona sengkang: spasi kelipatan 25 mm, makin rapat di dekat tumpuan; zona menutup seluruh bentang', () => {
    const r = computeContinuousMember(beam())
    const st = r.stir!
    expect(st.sGov).toBeGreaterThanOrEqual(50)
    st.spans.forEach((zs, i) => {
      zs.forEach((z) => expect(z.s % 25).toBe(0))
      expect(zs[0].x0).toBe(0)
      expect(zs[zs.length - 1].x1).toBeCloseTo(r.spanLen![i], 9)
      for (let k = 1; k < zs.length; k++) expect(zs[k].x0).toBeCloseTo(zs[k - 1].x1, 9)
    })
    const z0 = st.spans[0]
    expect(z0[0].s).toBeLessThanOrEqual(z0[Math.floor(z0.length / 2)].s)
    expect(st.sGov).toBe(Math.min(...st.spans.flat().map((z) => z.s)))
  })

  it('pelat: spasi tulangan utama & bagi kelipatan 25 mm; bagi ≤ min(5h, 450)', () => {
    const r = computeContinuousMember(fromGolden('default'))
    r.des!.items!.forEach((it) => expect(it.s! % 25).toBe(0))
    const d = r.des!.dist!
    expect(d.s % 25).toBe(0)
    expect(d.s).toBeLessThanOrEqual(Math.min(5 * r.h!, 450))
    expect(d.AsProv).toBeGreaterThanOrEqual(d.As - 1e-9)
  })

  it('balok: jumlah batang tak muat satu lapis → peringatan 2 lapis', () => {
    const r = computeContinuousMember(beam({ b: 150, db: 16, qDb: 80, qLb: 40 }))
    expect(r.des!.items!.some((i) => (i.layers ?? 1) > 1)).toBe(true)
    expect(r.warn.some((w) => /lapis/.test(w))).toBe(true)
  })
})
