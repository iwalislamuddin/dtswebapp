import { fx, kv, type CalcStep, type Report } from '../../report/model'
import { chartFigure } from '../_hydraulics/figure'
import { computeRationalUI, idfCurve, qByLand, RATIONAL_DEFAULTS, type RationalOk, type RationalUIInput } from './model'

// Laporan Debit Banjir Rencana — metode rasional: waktu konsentrasi (Kirpich / manual), intensitas Mononobe,
// debit puncak Q = 0,00278·C·i·A.

export { RATIONAL_DEFAULTS }

export function rationalReport(r: RationalOk): Report {
  const tcSteps: CalcStep[] =
    r.tcMode === 'kirpich'
      ? [
          { desc: 'Kemiringan rata-rata lintasan aliran', lhs: 'S', expr: '\\frac{ΔH}{L}', subst: `\\frac{${fx(r.dH, 2)}}{${fx(r.Lf, 1)}}`, value: fx(r.S!, 5), unit: 'm/m' },
          {
            desc: 'Waktu konsentrasi — Kirpich',
            lhs: 't_{c}',
            expr: '0.0195 L^{0.77} S^{−0.385}',
            subst: `0.0195 × ${fx(r.Lf, 1)}^{0.77} × ${fx(r.S!, 5)}^{−0.385}`,
            value: fx(r.tcMin, 2),
            unit: 'menit',
          },
        ]
      : [{ desc: 'Waktu konsentrasi ditetapkan pengguna', lhs: 't_{c}', value: fx(r.tcMin, 2), unit: 'menit' }]
  const lands = qByLand(r)
  return {
    title: 'Debit Banjir Rencana — Metode Rasional',
    summary: [
      kv('Debit puncak Q', `${fx(r.Q, 3)} m³/s (${fx(r.Q * 1000, 0)} L/s)`),
      kv('Intensitas hujan i', `${fx(r.i, 1)} mm/jam`),
      kv('Waktu konsentrasi t_{c}', `${fx(r.tcMin, 1)} menit`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Luas daerah tangkapan A', `${fx(r.A, 2)} ha`),
              kv('Tutupan lahan', `${r.landLabel.replace(/\s*\(.*\)$/, '')}, C = ${fx(r.C, 2)}`),
              kv('Hujan harian rencana R_{24}', `${fx(r.R24, 1)} mm`),
              kv('Waktu konsentrasi', r.tcMode === 'kirpich' ? `Kirpich, L = ${fx(r.Lf, 1)} m, ΔH = ${fx(r.dH, 2)} m` : 'Manual'),
            ],
          },
        ],
      },
      {
        title: 'Waktu konsentrasi',
        blocks: [{ k: 'calc', steps: [...tcSteps, { lhs: 't_{c}', expr: '\\frac{t_{c}}{60}', subst: `\\frac{${fx(r.tcMin, 2)}}{60}`, value: fx(r.tcHr, 4), unit: 'jam' }] }],
      },
      {
        title: 'Intensitas hujan',
        blocks: [
          {
            k: 'calc',
            steps: [
              {
                desc: 'Intensitas selama t_{c} — Mononobe (dari hujan harian)',
                lhs: 'i',
                expr: '\\frac{R_{24}}{24} (\\frac{24}{t_{c}})^{2/3}',
                subst: `\\frac{${fx(r.R24, 1)}}{24} × (\\frac{24}{${fx(r.tcHr, 4)}})^{2/3}`,
                value: fx(r.i, 2),
                unit: 'mm/jam',
              },
            ],
          },
          {
            k: 'figure',
            fig: chartFigure({
              series: [{ pts: idfCurve(r), c: 'v', label: 'Mononobe' }],
              marks: [{ x: r.tcMin, y: r.i, c: 'load', label: `t_{c} ${fx(r.tcMin, 1)} mnt → i ${fx(r.i, 1)} mm/jam` }],
              xLabel: 'Durasi t (menit)',
              yLabel: 'Intensitas i (mm/jam)',
              alt: 'Kurva intensitas hujan Mononobe terhadap durasi dengan titik waktu konsentrasi',
              caption: `Gbr. 1 — Kurva intensitas–durasi Mononobe untuk R_{24} = ${fx(r.R24, 1)} mm.`,
            }),
          },
        ],
      },
      {
        title: 'Debit puncak',
        strong: true,
        blocks: [
          {
            k: 'calc',
            steps: [
              {
                desc: 'Metode rasional (A dalam ha, i dalam mm/jam)',
                lhs: 'Q',
                expr: '0.00278 C i A',
                subst: `0.00278 × ${fx(r.C, 2)} × ${fx(r.i, 2)} × ${fx(r.A, 2)}`,
                value: fx(r.Q, 3),
                unit: 'm³/s',
              },
            ],
          },
          {
            k: 'table',
            head: ['Tutupan lahan', 'C', 'Q (m³/s)'],
            rows: lands.map((l) => [l.label + (l.used ? ' ◂' : ''), fx(l.C, 2), fx(l.Q, 3)]),
            align: ['l', 'r', 'r'],
            caption: 'Pembanding debit untuk tutupan lahan lain pada A dan i yang sama (◂ = dipakai)',
          },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'Metode rasional untuk daerah tangkapan kecil (lazim ≤ 80–300 ha) dengan hujan merata selama t_{c}; intensitas dari pendekatan Mononobe hujan harian. Bila tersedia kurva IDF lokal hasil analisis frekuensi, gunakan itu.',
      'Belum termasuk: C komposit beberapa tutupan, analisis frekuensi hujan (Gumbel/Log-Pearson III), hidrograf satuan (HSS), penelusuran banjir. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildRationalReport(i: RationalUIInput): Report | null {
  const r = computeRationalUI(i)
  return r ? rationalReport(r) : null
}

export default {
  defaults: RATIONAL_DEFAULTS,
  build: (i: RationalUIInput) => buildRationalReport(i) ?? { title: 'Debit Banjir Rasional', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
