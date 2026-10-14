import type { GableResult } from '../../calc/gable-frame'
import { fx, kv, type Block, type Report } from '../../report/model'
import { deformSection, fefSteps, forceSection, methodText, modelFigure, reactionSection, sectionBlocks, stiffnessTable } from '../_frame/report'
import { computeGableUI, GABLE_DEFAULTS, gableDims, gableView, type GableUIInput } from './model'

// Laporan Analisis Portal Gable: geometri atap (rise, panjang rafter), penguraian beban atap ke komponen lokal
// rafter, metode kekakuan, reaksi & kesetimbangan, gaya dalam, deformasi (drift eave, turun puncak, lendutan rafter).

export function gableReport(input: GableUIInput, r: GableResult): Report {
  const v = gableView(r)
  const selfOn = input.self === 'ya'
  const col = r.col!, raf = r.raf!
  const df = r.defl!
  const Lr = r.Lraf!
  const cosA = Lr > 0 ? r.Lb! / 2 / Lr : 1
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  const rafE = r.elems![2]
  const wv = rafE.wv!
  const ptSum = r.inpPt!.reduce((t, p) => t + p.P, 0)

  const wTerms = ['q · L', ...(r.inpPt!.length ? ['ΣP'] : []), ...(selfOn ? ['2 w_{bs,k} H', '2 w_{bs,r} L_{r}'] : [])].join(' + ')
  const wSubst = [
    `${fx(r.qsup, 2)} × ${fx(r.Lb, 2)}`,
    ...(r.inpPt!.length ? [fx(ptSum, 2)] : []),
    ...(selfOn ? [`2 × ${fx(col.wLine, 3)} × ${fx(r.H, 2)}`, `2 × ${fx(raf.wLine, 3)} × ${fx(Lr, 3)}`] : []),
  ].join(' + ')

  const loadBlocks: Block[] = [
    {
      k: 'rows',
      rows: [
        kv('Berat sendiri', selfOn ? 'disertakan (vertikal, sepanjang batang)' : 'diabaikan'),
        kv('Beban atap q (per proyeksi horizontal)', `${fx(r.qsup, 2)} kN/m`),
        ...r.inpPt!.map((p, k) => kv(`Beban terpusat P_{${k + 1}}`, `${fx(p.P, 2)} kN @ ${fx(p.a, 2)} m horizontal dari kolom kiri`)),
        kv('Lateral eave H_{1} / H_{2} (+ ke kanan)', `${fx(r.HL1, 2)} / ${fx(r.HL2, 2)} kN`),
      ],
    },
    { k: 'h', text: 'Penguraian beban atap pada rafter' },
    {
      k: 'p',
      text: 'Beban per proyeksi horizontal diubah ke per panjang rafter (×cos α), lalu beban vertikal diuraikan ke komponen tegak lurus rafter (lentur) dan sejajar rafter (aksial).',
    },
    {
      k: 'calc',
      steps: [
        { lhs: 'cos α', expr: '\\frac{L/2}{L_{r}}', subst: `\\frac{${fx(r.Lb! / 2, 3)}}{${fx(Lr, 3)}}`, value: fx(cosA, 4) },
        {
          desc: 'Beban vertikal per panjang rafter',
          lhs: 'w_{v}',
          expr: selfOn ? 'q cos α + w_{bs,r}' : 'q cos α',
          subst: selfOn ? `${fx(r.qsup, 2)} × ${fx(cosA, 4)} + ${fx(raf.wLine, 3)}` : `${fx(r.qsup, 2)} × ${fx(cosA, 4)}`,
          value: fx(wv, 3),
          unit: 'kN/m',
        },
        { desc: 'Komponen tegak lurus rafter', lhs: 'w_{⊥}', expr: 'w_{v} cos α', subst: `${fx(wv, 3)} × ${fx(cosA, 4)}`, value: fx(wv * cosA, 3), unit: 'kN/m' },
        { desc: 'Komponen sejajar rafter (ke arah eave)', lhs: 'w_{∥}', expr: 'w_{v} sin α', subst: `${fx(wv, 3)} × ${fx(sinA, 4)}`, value: fx(wv * sinA, 3), unit: 'kN/m' },
      ],
    },
    modelFigure(v, gableDims(r), `Gbr. 1 — Model portal gable (tumpuan ${r.fixed ? 'jepit' : 'sendi'}) dan beban.`),
  ]

  return {
    title: 'Analisis Portal Gable (Metode Kekakuan Langsung)',
    summary: [
      kv('Momen maksimum |M|_{maks}', `${fx(Math.abs(r.Mmax!), 2)} kN·m`),
      kv('Geser maksimum |V|_{maks}', `${fx(Math.abs(r.Vmax!), 2)} kN`),
      kv('Aksial maksimum N', `${fx(r.Nmax, 2)} kN (${r.Nmax! < 0 ? 'tekan' : 'tarik'})`),
      kv('Reaksi R_{Ay} / R_{By}', `${fx(r.RA!.Ry, 2)} / ${fx(r.RB!.Ry, 2)} kN`),
      kv('Reaksi horizontal R_{Ax} / R_{Bx}', `${fx(r.RA!.Rx, 2)} / ${fx(r.RB!.Rx, 2)} kN`),
      kv('Drift eave Δ', `${fx(Math.abs(df.drift), 2)} mm${Number.isFinite(df.driftRatio) ? ` (H/${fx(df.driftRatio, 0)})` : ''}`),
      kv('Turun puncak Δy', `${fx(df.apexV, 2)} mm${Number.isFinite(df.apexRatio) ? ` (L/${fx(df.apexRatio, 0)})` : ''}`),
    ],
    sections: [
      {
        title: 'Geometri & penampang',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Tinggi kolom ke eave H', `${fx(r.H, 2)} m`),
              kv('Bentang L', `${fx(r.Lb, 2)} m`),
              kv('Kemiringan atap α', `${fx(r.alpha, 1)}°`),
              kv('Tumpuan kaki kolom', r.fixed ? 'jepit – jepit' : 'sendi – sendi'),
            ],
          },
          {
            k: 'calc',
            steps: [
              { desc: 'Tinggi puncak di atas eave', lhs: 'f', expr: '\\frac{L}{2} tan α', subst: `\\frac{${fx(r.Lb, 2)}}{2} × tan ${fx(r.alpha, 1)}°`, value: fx(r.rise, 3), unit: 'm' },
              { lhs: 'y_{puncak}', expr: 'H + f', subst: `${fx(r.H, 2)} + ${fx(r.rise, 3)}`, value: fx(r.apexY, 3), unit: 'm' },
              { desc: 'Panjang rafter', lhs: 'L_{r}', expr: '√((L/2)^{2} + f^{2})', subst: `√(${fx(r.Lb! / 2, 3)}^{2} + ${fx(r.rise, 3)}^{2})`, value: fx(Lr, 3), unit: 'm' },
            ],
          },
          ...sectionBlocks('Kolom', col, selfOn),
          ...sectionBlocks('Rafter', raf, selfOn),
          { k: 'p', text: 'Profil baja, lentur terhadap sumbu kuat (dalam bidang portal), E = 200000 MPa.' },
        ],
      },
      { title: 'Beban', blocks: loadBlocks },
      {
        title: 'Metode analisis',
        blocks: [
          ...methodText(5, !!r.fixed),
          stiffnessTable(v),
          ...(wv > 1e-9 ? [{ k: 'calc' as const, steps: fefSteps('Rafter', wv * cosA, Lr) }] : []),
          ...(r.inpPt!.length
            ? [{ k: 'p' as const, text: 'Beban terpusat atap diuraikan sama (P cos α tegak lurus, P sin α sejajar rafter) pada jarak a_{lokal} = \\frac{a}{L/2} L_{r} dari eave (rafter kanan diukur dari eave kanan).' }]
            : []),
        ],
      },
      reactionSection(v, { Wgrav: r.Wgrav!, sumRy: r.sumRy!, sumRx: r.sumRx!, Hsum: r.HL1! + r.HL2!, wTerms, wSubst }),
      forceSection(v, { M: r.Mmax!, V: r.Vmax!, N: r.Nmax! }),
      deformSection(
        v,
        [
          { name: 'N2 — eave kiri', i: 2 },
          { name: 'N3 — eave kanan', i: 3 },
          { name: 'N4 — puncak', i: 4 },
        ],
        {
          drift: df.drift, Hmm: r.H! * 1000, sag: df.rafSag, Lmm: Lr * 1000, Lname: 'L_{r}',
          sagLabel: `Lendutan rafter ${df.rafWhich} relatif tali busur (x = ${fx(df.rafSagX, 2)} m)`,
          extra: Math.abs(df.apexV) > 1e-6
            ? [{
                k: 'calc',
                steps: [{ desc: 'Turun puncak terhadap bentang', lhs: 'L/Δ_{y}', expr: '\frac{L}{|Δ_{y,puncak}|}', subst: `\frac{${fx(r.Lb! * 1000, 0)}}{${fx(Math.abs(df.apexV), 2)}}`, value: fx(df.apexRatio, 0) }],
              }]
            : [],
        },
      ),
    ],
    warnings: r.warn,
    scope: [
      'Analisis elastis linier orde pertama (tanpa P-Δ), sambungan kaku di eave & puncak; kombinasi beban dimasukkan pengguna.',
      'Alat bantu analisis — bukan cek kapasitas penampang. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

export function buildGableReport(i: GableUIInput): Report | null {
  const o = computeGableUI(i)
  return o && o.r.valid ? gableReport(o.input, o.r) : null
}

export default {
  defaults: GABLE_DEFAULTS,
  build: (i: GableUIInput) => buildGableReport(i) ?? { title: 'Analisis Portal Gable', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
