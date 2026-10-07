import { typeInfo } from '../../calc/shared/steel-profiles'
import type { SteelBeamResult } from '../../calc/steel-beam-analysis'
import { arrow, figRows } from '../../report/figure'
import { fx, kv, type FigOp, type Figure, type Report, type Row } from '../../report/model'
import { BEAM_DEFAULTS, computeBeam, type BeamInput } from './model'

// Laporan Analisis Balok Baja — isi sama dengan buildReport build lama.

/** Gbr. 1 — balok + beban, SFD, BMD, lendutan (abu-abu, skala sumbu x = panjang balok). */
export function figDiagrams(r: SteelBeamResult): Figure {
  const ops: FigOp[] = []
  const Ltot = r.Ltot!, plot = r.plot!
  const x0 = 60, sx = 460 / Ltot
  const X = (xm: number) => x0 + xm * sx
  const yBeam = 26
  const mxw = Math.max(1, ...r.inpDist!.flatMap((q) => [q.w1, q.w2]))
  for (const d of r.inpDist!) {
    const h1 = 12 * (Math.abs(d.w1) / mxw), h2 = 12 * (Math.abs(d.w2) / mxw)
    ops.push({ t: 'line', x1: X(d.a1), y1: yBeam - 6 - h1, x2: X(d.a2), y2: yBeam - 6 - h2, lw: 0.5, g: 0.5 })
    const span = X(d.a2) - X(d.a1), nA = Math.max(2, Math.round(span / 20))
    for (let k = 0; k <= nA; k++) {
      const xx = X(d.a1) + (span * k) / nA, hh = h1 + ((h2 - h1) * k) / nA
      arrow(ops, xx, yBeam - 6 - hh, xx, yBeam - 6, { lw: 0.4, g: 0.55 })
    }
  }
  for (const p of r.inpPt!) {
    arrow(ops, X(p.a), yBeam - 22, X(p.a), yBeam - 4, { lw: 0.9, g: 0.1 })
    ops.push({ t: 'text', x: X(p.a), y: yBeam - 24, s: fx(Math.abs(p.P), 0) + 'kN', size: 6, align: 'c', g: 0.2 })
  }
  ops.push({ t: 'line', x1: X(0), y1: yBeam, x2: X(Ltot), y2: yBeam, lw: 1.6 })
  for (const xs of [r.xA!, r.xB!])
    ops.push({ t: 'poly', pts: [[X(xs), yBeam], [X(xs) - 5, yBeam + 8], [X(xs) + 5, yBeam + 8]], close: true, g: 0.3 })
  ops.push({ t: 'text', x: X(r.xA!), y: yBeam + 18, s: 'RA=' + fx(r.RA, 1), size: 6, align: 'c', g: 0.2 })
  ops.push({ t: 'text', x: X(r.xB!), y: yBeam + 18, s: 'RB=' + fx(r.RB, 1), size: 6, align: 'c', g: 0.2 })
  ops.push({ t: 'text', x: (X(r.xA!) + X(r.xB!)) / 2, y: yBeam + 18, s: 'L=' + fx(r.L, 2) + 'm', size: 6, align: 'c', g: 0.4 })

  const band = (yc: number, hh: number, poly: [number, number][], maxVal: number, maxX: number, title: string, invert: boolean, dp: number) => {
    const maxAbs = Math.max(1e-9, ...poly.map((p) => Math.abs(p[1])))
    const zeroY = yc + hh / 2, sc = (hh / 2 - 8) / maxAbs, sgn = invert ? 1 : -1
    const Y = (v: number) => zeroY + sgn * v * sc
    ops.push({ t: 'line', x1: X(0), y1: zeroY, x2: X(Ltot), y2: zeroY, lw: 0.5, g: 0.6 })
    ops.push({ t: 'text', x: X(0), y: yc + 6, s: title, size: 6.5, g: 0.15 })
    ops.push({ t: 'poly', pts: poly.map((p) => [X(p[0]), Y(p[1])]), lw: 1 })
    if (Math.abs(maxVal) > 1e-9)
      ops.push({ t: 'text', x: X(maxX), y: Y(maxVal) + (sgn * maxVal > 0 ? 8 : -3), s: fx(maxVal, dp), size: 6, align: 'c', g: 0.1 })
  }
  const bh = 46
  band(48, bh, plot.Vpts.map((p) => [p[0] / 1000, p[1] / 1e3]), r.Vmax!, r.xVmax!, 'V (kN)', false, 1)
  band(48 + bh + 8, bh, plot.xs.map((x, i) => [x / 1000, plot.M[i] / 1e6]), r.Mmax!, r.xMmax!, 'M (kNm)', true, 1)
  band(48 + 2 * (bh + 8), bh, plot.xs.map((x, i) => [x / 1000, plot.y[i]]), r.ymax!, r.xYmax!, 'lendutan (mm)', true, 2)
  const yCap = 48 + 3 * (bh + 8) + 6
  ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Balok + beban, SFD, BMD & lendutan', size: 7.5, align: 'c' })
  return { h: figRows(yCap + 10), ops, alt: 'Gbr. 1 SFD/BMD/lendutan — lihat versi PDF' }
}

export function beamReport(input: BeamInput, r: SteelBeamResult): Report {
  const prof = r.prof!
  const ti = typeInfo(input.ptype)
  const cant = r.cL! > 0 || r.cR! > 0
  const loads: Row[] = []
  r.inpDist!.forEach((d, i) => {
    if (d.self) return
    loads.push(kv(`Merata #${i + 1} w1–w2`, `${fx(d.w1, 2)}–${fx(d.w2, 2)} kN/m`))
    loads.push(kv('   rentang a1 … a2', `${fx(d.a1, 2)} … ${fx(d.a2, 2)} m`))
  })
  r.inpPt!.forEach((p, i) => loads.push(kv(`Terpusat #${i + 1}`, `P = ${fx(p.P, 2)} kN @ ${fx(p.a, 2)} m`)))
  if (!loads.length) loads.push(kv('Beban', 'hanya berat sendiri'))
  return {
    title: 'Analisis Balok Baja Sederhana (SFD / BMD / Lendutan)',
    method: 'Balok statis tertentu (sendi–rol)',
    sections: [
      {
        title: 'Data input',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Tipe profil', `${ti ? ti.name : input.ptype} ${prof.name}`),
              kv('Ix / Sx / Zx', `${fx(prof.Ix, 0)} / ${fx(prof.Sx as number, 1)} / ${prof.Zx ? fx(prof.Zx as number, 1) : '-'} (cm⁴ / cm³)`),
              kv('Berat profil', `${fx(prof.w, 1)} kg/m`),
              kv('Bentang antar tumpuan L', `${fx(r.L, 2)} m`),
              ...(cant
                ? [
                    kv('Kantilever kiri / kanan', `${fx(r.cL, 2)} / ${fx(r.cR, 2)} m`),
                    kv('Panjang total balok', `${fx(r.Ltot, 2)} m`),
                    kv('Tumpuan A / B dari ujung kiri', `${fx(r.xA, 2)} / ${fx(r.xB, 2)} m`),
                  ]
                : []),
              kv('Modulus E', `${fx(r.E, 0)} MPa`),
              kv('Berat sendiri', r.wself ? `disertakan (${fx(r.wself, 3)} kN/m)` : 'diabaikan'),
            ],
          },
        ],
      },
      { title: 'Beban', blocks: [{ k: 'rows', rows: loads }, { k: 'figure', fig: figDiagrams(r) }] },
      {
        title: 'Reaksi',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('RA (tumpuan A, sendi)', `${fx(r.RA, 2)} kN`),
              kv('RB (tumpuan B, rol)', `${fx(r.RB, 2)} kN`),
              kv('Total beban ΣW', `${fx(r.Wtot, 2)} kN`),
            ],
          },
        ],
      },
      {
        title: 'Hasil',
        strong: true,
        blocks: [
          {
            k: 'rows',
            rows: [
              kv(`Momen maks M @ x = ${fx(r.xMmax, 2)} m`, `${fx(r.Mmax, 2)} kN·m${r.Mmax! < 0 ? ' (hogging)' : ''}`),
              kv(`Geser maks V @ x = ${fx(r.xVmax, 2)} m`, `${fx(r.Vmax, 2)} kN`),
              kv(`Lendutan maks δ @ x = ${fx(r.xYmax, 2)} m`, `${fx(r.ymax, 2)} mm ${r.ymax! < 0 ? '(ke atas)' : '(ke bawah)'}`),
              kv('Rasio L/δ', Number.isFinite(r.ratio) ? fx(r.ratio, 0) : '-'),
              ...(r.fb != null ? [kv('Tegangan lentur fb = |M|/Sx', `${fx(r.fb, 1)} MPa`)] : []),
            ],
          },
          {
            k: 'text',
            lines: [
              'Batas lendutan lazim: L/360 (beban hidup lantai), L/240 (total). fb = tegangan lentur elastis; belum termasuk tekuk torsi-lateral. Untuk cek kapasitas (φMn, LTB) pakai tool Balok Baja (Lentur).',
            ],
          },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'Reaksi dari kesetimbangan; V(x) & M(x) dari statika potongan; lendutan dari integrasi ganda EI·y″ = M(x) dengan y = 0 di kedua tumpuan. Beban & lendutan ke bawah positif, momen sagging positif.',
      'Alat bantu analisis; verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid / tanpa beban). */
export function buildBeamReport(i: BeamInput): Report | null {
  const o = computeBeam(i)
  return o && o.r.valid ? beamReport(o.input, o.r) : null
}

export default {
  defaults: BEAM_DEFAULTS,
  build: (i: BeamInput) => buildBeamReport(i) ?? { title: 'Analisis Balok Baja', method: '-', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
