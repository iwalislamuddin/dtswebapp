import type { PortalResult } from '../../calc/portal-frame'
import { fx, kv, type Block, type Report } from '../../report/model'
import { deformSection, fefSteps, forceSection, methodText, modelFigure, reactionSection, sectionBlocks, stiffnessTable } from '../_frame/report'
import { computePortalUI, PORTAL_DEFAULTS, portalDims, portalView, type PortalUIInput } from './model'

// Laporan Analisis Portal (2 kolom + 1 balok): data & beban, model, metode kekakuan, reaksi & kesetimbangan,
// gaya dalam + tegangan elastis informatif, deformasi & batas layan.

export function portalReport(input: PortalUIInput, r: PortalResult): Report {
  const v = portalView(r)
  const selfOn = input.self === 'ya'
  const col = r.col!, beam = r.beam!
  const wb = Math.abs(r.wbeam!)
  const df = r.defl!
  const ptSum = r.inpPt!.reduce((t, p) => t + p.P, 0)

  const wTerms = ['w · L', ...(r.inpPt!.length ? ['ΣP'] : []), ...(selfOn ? ['2 w_{bs,kolom} H'] : [])].join(' + ')
  const wSubst = [`${fx(wb, 3)} × ${fx(r.Lb, 2)}`, ...(r.inpPt!.length ? [fx(ptSum, 2)] : []), ...(selfOn ? [`2 × ${fx(col.wLine, 3)} × ${fx(r.H, 2)}`] : [])].join(' + ')

  const loadBlocks: Block[] = [
    {
      k: 'rows',
      rows: [
        kv('Berat sendiri', selfOn ? 'disertakan (kolom: aksial; balok: merata ke bawah)' : 'diabaikan'),
        kv('Beban merata gravitasi balok q', `${fx(r.qsup, 2)} kN/m`),
        ...r.inpPt!.map((p, k) => kv(`Beban terpusat P_{${k + 1}}`, `${fx(p.P, 2)} kN @ ${fx(p.a, 2)} m dari kolom kiri`)),
        kv('Lateral puncak H_{1} / H_{2} (+ ke kanan)', `${fx(r.HL1, 2)} / ${fx(r.HL2, 2)} kN`),
      ],
    },
    {
      k: 'calc',
      steps: [
        {
          desc: 'Beban merata total pada balok',
          lhs: 'w',
          expr: selfOn ? 'q + w_{bs,balok}' : 'q',
          subst: selfOn ? `${fx(r.qsup, 2)} + ${fx(beam.wLine, 3)}` : fx(r.qsup, 2),
          value: fx(wb, 3),
          unit: 'kN/m',
        },
      ],
    },
    modelFigure(v, portalDims(r), `Gbr. 1 — Model portal (tumpuan ${r.fixed ? 'jepit' : 'sendi'}) dan beban.`),
  ]

  return {
    title: 'Analisis Portal Sederhana (Metode Kekakuan Langsung)',
    summary: [
      kv('Momen maksimum |M|_{maks}', `${fx(Math.abs(r.Mmax!), 2)} kN·m`),
      kv('Geser maksimum |V|_{maks}', `${fx(Math.abs(r.Vmax!), 2)} kN`),
      kv('Aksial maksimum N', `${fx(r.Nmax, 2)} kN (${r.Nmax! < 0 ? 'tekan' : 'tarik'})`),
      kv('Reaksi R_{Ay} / R_{By}', `${fx(r.RA!.Ry, 2)} / ${fx(r.RB!.Ry, 2)} kN`),
      kv('Drift puncak Δ', `${fx(Math.abs(df.drift), 2)} mm${Number.isFinite(df.driftRatio) ? ` (H/${fx(df.driftRatio, 0)})` : ''}`),
      kv(`Lendutan balok δ (x = ${fx(df.sagX, 2)} m)`, `${fx(Math.abs(df.sag), 2)} mm${Number.isFinite(df.sagRatio) ? ` (L/${fx(df.sagRatio, 0)})` : ''}`),
    ],
    sections: [
      {
        title: 'Geometri & penampang',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Tinggi kolom H', `${fx(r.H, 2)} m`),
              kv('Panjang balok L', `${fx(r.Lb, 2)} m`),
              kv('Tumpuan kaki kolom', r.fixed ? 'jepit – jepit' : 'sendi – sendi'),
            ],
          },
          ...sectionBlocks('Kolom', col, selfOn),
          ...sectionBlocks('Balok', beam, selfOn),
          { k: 'p', text: 'Lentur terhadap sumbu kuat (dalam bidang portal). Beton memakai I bruto tanpa reduksi retak.' },
        ],
      },
      { title: 'Beban', blocks: loadBlocks },
      {
        title: 'Metode analisis',
        blocks: [
          ...methodText(4, !!r.fixed),
          stiffnessTable(v),
          ...(wb > 1e-9 ? [{ k: 'calc' as const, steps: fefSteps('Balok', wb, r.Lb!) }] : []),
          ...(r.inpPt!.length
            ? [{ k: 'p' as const, text: 'Beban terpusat pada balok: M_{F,i} = \\frac{P a b^{2}}{L^{2}}, M_{F,j} = \\frac{P a^{2} b}{L^{2}}, V_{F,i} = \\frac{P b^{2}(L + 2a)}{L^{3}}.' }]
            : []),
        ],
      },
      reactionSection(v, { Wgrav: r.Wgrav!, sumRy: r.sumRy!, sumRx: r.sumRx!, Hsum: r.HL1! + r.HL2!, wTerms, wSubst }),
      forceSection(v, { M: r.Mmax!, V: r.Vmax!, N: r.Nmax! }),
      deformSection(
        v,
        [
          { name: 'N2 — puncak kiri', i: 2 },
          { name: 'N3 — puncak kanan', i: 3 },
        ],
        { drift: df.drift, Hmm: r.H! * 1000, sag: df.sag, sagLabel: `Lendutan balok relatif tali busur (x = ${fx(df.sagX, 2)} m)`, Lmm: r.Lb! * 1000, Lname: 'L' },
      ),
    ],
    warnings: r.warn,
    scope: [
      'Analisis elastis linier orde pertama (tanpa P-Δ), deformasi geser diabaikan; kombinasi beban dimasukkan pengguna.',
      'Alat bantu analisis — bukan cek kapasitas penampang. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid / struktur tidak stabil). */
export function buildPortalReport(i: PortalUIInput): Report | null {
  const o = computePortalUI(i)
  return o && o.r.valid ? portalReport(o.input, o.r) : null
}

export default {
  defaults: PORTAL_DEFAULTS,
  build: (i: PortalUIInput) => buildPortalReport(i) ?? { title: 'Analisis Portal', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
