import type { DevLengthResult } from '../../calc/development-length'
import { dimH, figRows } from '../../report/figure'
import { fx, kv, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { computeDev, DEV_DEFAULTS, ldPerDiameter, PSIE_OPTIONS, type DevInput } from './model'

// Laporan Panjang Penyaluran Tulangan Tarik (SNI 2847:2019 Ps. 25.4.2.4a, bentuk SI): faktor modifikasi, batas,
// Ktr, ld dengan rumus dan substitusi, tabel ld per diameter.

export { DEV_DEFAULTS }

/** Gbr. 1 — batang tertanam sepanjang ld pada beton. */
function figBar(r: DevLengthResult): Figure {
  const ops: FigOp[] = []
  const x0 = 60, x1 = 440, y0 = 20, hB = 70
  ops.push({ t: 'rect', x: x0, y: y0, w: x1 - x0 + 40, h: hB, fill: true, c: 'support', op: 0.12 })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y0 + hB, lw: 1, c: 'support' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x1 + 40, y2: y0, lw: 0.8, c: 'support' })
  ops.push({ t: 'line', x1: x0, y1: y0 + hB, x2: x1 + 40, y2: y0 + hB, lw: 0.8, c: 'support' })
  const yb = y0 + hB - 22, t = 7
  ops.push({ t: 'rect', x: x0 - 30, y: yb - t / 2, w: x1 - x0 + 30, h: t, fill: true, c: 'm', op: 0.55 })
  if (!r.polos) for (let x = x0 - 26; x < x1; x += 9) ops.push({ t: 'line', x1: x, y1: yb - t / 2, x2: x + 4, y2: yb + t / 2, lw: 0.5, c: 'ink' })
  ops.push({ t: 'line', x1: x1, y1: yb - 10, x2: x1, y2: yb + 10, lw: 0.6, c: 'muted', dash: [3, 2] })
  dimH(ops, x0, x1, y0 + hB + 16, `l_{d} = ${fx(r.ldRound, 0)} mm`)
  ops.push({ t: 'line', x1: x0 + 60, y1: yb + t / 2, x2: x0 + 60, y2: y0 + hB, lw: 0.6, c: 'y' })
  ops.push({ t: 'text', x: x0 + 64, y: y0 + hB - 4, s: `c_{b} = ${fx(r.cb, 0)}`, size: 7, c: 'y' })
  ops.push({ t: 'text', x: x0 - 32, y: yb - 8, s: `${r.polos ? 'Ø' : 'D'}${fx(r.db, 0)}`, size: 7.5, bold: true })
  ops.push({ t: 'text', x: x0 + 4, y: y0 + 12, s: 'muka penampang kritis', size: 6.5, c: 'muted' })
  return {
    h: figRows(y0 + hB + 24),
    ops,
    alt: 'Batang tertanam sepanjang panjang penyaluran',
    caption: `Gbr. 1 — Batang ${r.polos ? 'polos Ø' : 'ulir D'}${fx(r.db, 0)} tertanam lurus sepanjang l_{d} dari penampang kritis.`,
  }
}

export function devReport(i: DevInput, r: DevLengthResult): Report {
  const db = fx(r.db, 0)
  const psieLabel = PSIE_OPTIONS.find((o) => o.value === i.psie)?.label ?? ''
  const steps: CalcStep[] = []
  if (i.ktrMode === 'calc')
    steps.push({ desc: 'Indeks tulangan transversal', lhs: 'K_{tr}', expr: '\\frac{40 A_{tr}}{s · n}', subst: `\\frac{40 × ${fx(Number(i.Atr), 0)}}{${fx(Number(i.s), 0)} × ${i.n}}`, value: fx(r.Ktr, 2), unit: 'mm', ref: '25.4.2.4b' })
  steps.push(
    {
      desc: `Faktor kekangan, dibatasi ≤ 2,5${i.ktrMode === 'zero' ? ' (K_{tr} = 0, konservatif)' : ''}`,
      lhs: '\\frac{c_{b} + K_{tr}}{d_{b}}',
      subst: `\\frac{${fx(r.cb, 0)} + ${fx(r.Ktr, 2)}}{${db}}`,
      value: fx(r.ratio, 3),
    },
    {
      lhs: 'l_{d}',
      expr: "\\frac{f_{y} ψ_{t}ψ_{e} ψ_{s} ψ_{g}}{1.1 λ √(f'_{c}) (c_{b} + K_{tr})/d_{b}} d_{b}",
      subst: `\\frac{${fx(Number(i.fy), 0)} × ${fx(r.psite, 2)} × ${fx(r.psis, 1)} × ${fx(r.psig, 2)}}{1.1 × ${fx(r.lambda, 2)} × ${fx(r.sqrtfc, 3)} × ${fx(r.ratio, 3)}} × ${db}`,
      value: fx(r.ldBase, 1),
      unit: 'mm',
      ref: '25.4.2.4a',
    },
  )
  if (r.polos) steps.push({ desc: 'Batang polos: pendekatan konservatif 2,0 × l_{d} ulir setara (bukan rumus SNI)', lhs: 'l_{d}', expr: '2.0 × l_{d,ulir}', subst: `2.0 × ${fx(r.ldBase, 1)}`, value: fx(r.ldBase! * 2, 1), unit: 'mm' })
  steps.push({ desc: r.ldMin ? 'Kurang dari batas bawah — dipakai 300 mm' : 'Batas bawah 300 mm terpenuhi', lhs: 'l_{d}', expr: 'maks(l_{d}; 300)', value: fx(r.ld, 1), unit: 'mm', ref: '25.4.2.1' })
  steps.push({ desc: 'Dibulatkan ke atas kelipatan 10 mm', lhs: 'l_{d,pakai}', value: fx(r.ldRound, 0), unit: 'mm' })

  const table = ldPerDiameter(i)
  const sections: Section[] = [
    {
      title: 'Data material & tulangan',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv("Mutu beton f'_{c} / baja f_{y}", `${fx(Number(i.fc), 0)} / ${fx(Number(i.fy), 0)} MPa`),
            kv('Tulangan', `${r.polos ? 'polos Ø' : 'ulir D'}${db} mm`),
            kv('c_{b} = min(selimut ke pusat batang; ½ spasi pusat)', `${fx(r.cb, 0)} mm`),
          ],
        },
        { k: 'figure', fig: figBar(r) },
      ],
    },
    {
      title: 'Faktor modifikasi (Tabel 25.4.2.5)',
      blocks: [
        {
          k: 'table',
          head: ['Faktor', 'Kondisi', 'Nilai'],
          align: ['l', 'l', 'r'],
          rows: [
            ['ψ_{t} (posisi pengecoran)', i.psit === '1.3' ? 'tulangan atas (> 300 mm beton segar di bawahnya)' : 'lainnya', fx(r.psit, 1)],
            ['ψ_{e} (pelapis)', psieLabel.replace(/\s*\(.*\)$/, ''), fx(r.psie, 1)],
            ['ψ_{t}·ψ_{e}', 'dibatasi ≤ 1,7', fx(r.psite, 2)],
            ['ψ_{s} (ukuran batang)', r.db <= 19 ? 'd_{b} ≤ 19 mm' : 'd_{b} ≥ 22 mm', fx(r.psis, 1)],
            ['ψ_{g} (mutu tulangan)', Number(i.fy) <= 420 ? 'f_{y} ≤ 420 MPa' : Number(i.fy) <= 550 ? '420 < f_{y} ≤ 550 MPa' : 'f_{y} > 550 MPa', fx(r.psig, 2)],
            ['λ (beton)', r.lambda! < 1 ? 'beton ringan' : 'beton normal', fx(r.lambda, 2)],
            ["√(f'_{c})", 'dibatasi ≤ 8,3 MPa (25.4.1.4)', fx(r.sqrtfc, 3)],
          ],
        },
      ],
    },
    { title: 'Panjang penyaluran', strong: true, blocks: [{ k: 'calc', steps }, { k: 'rows', rows: [kv('l_{d} / d_{b}', fx(r.ldbratio, 1))] }] },
    {
      title: 'Panjang penyaluran per diameter',
      blocks: [
        { k: 'p', text: 'Faktor dan kekangan yang sama, untuk semua diameter jenis tulangan ini (ψ_{s} mengikuti diameter).' },
        {
          k: 'table',
          head: ['Diameter', 'l_{d} (mm)', 'l_{d,pakai} (mm)', 'l_{d}/d_{b}'],
          align: ['l', 'r', 'r', 'r'],
          rows: table.map((t) => [`${r.polos ? 'Ø' : 'D'}${t.db}${t.db === r.db ? ' (dipilih)' : ''}`, fx(t.ld, 1), fx(Math.ceil(t.ld / 10) * 10, 0), fx(t.ld / t.db, 1)]),
        },
      ],
    },
  ]

  return {
    title: 'Panjang Penyaluran Tulangan Tarik (SNI 2847:2019 Ps. 25.4.2)',
    summary: [kv(`Panjang penyaluran l_{d} (${r.polos ? 'Ø' : 'D'}${db})`, `${fx(r.ldRound, 0)} mm`), kv('l_{d} / d_{b}', fx(r.ldbratio, 1)), kv('(c_{b} + K_{tr}) / d_{b}', fx(r.ratio, 2))],
    sections,
    warnings: [...r.warn, ...(r.polos ? ['Batang polos: SNI mensyaratkan kait standar; l_{d} lurus di sini hanya pendekatan konservatif 2 × ulir.'] : [])],
    scope: ['Batang tarik lurus tanpa kait, bentuk umum Ps. 25.4.2.4a. Belum termasuk: kait (25.4.3), sambungan lewatan (25.5), tulangan tekan (25.4.9). Verifikasi oleh insinyur penanggung jawab.'],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildDevReport(i: DevInput): Report | null {
  const r = computeDev(i)
  return r ? devReport(i, r) : null
}

export default {
  defaults: DEV_DEFAULTS,
  build: (i: DevInput) => buildDevReport(i) ?? { title: 'Panjang Penyaluran', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
