import type { BeamCheckResult, ShearCheck } from '../../calc/beam-check'
import { check, fx, kv, type Report, type Section } from '../../report/model'
import { beamFlexReport } from '../beam-flexure/report'
import { shearReport } from '../beam-shear-torsion/report'
import { BEAM_CHECK_DEFAULTS, computeCheck, type BeamCheckForm } from './model'

// Laporan Cek Desain Balok Beton (SNI 2847:2019): data, lentur lapangan (M+), lentur tumpuan (M−), geser tumpuan,
// opsional geser lapangan & torsi. Bagian lentur/geser/torsi memakai ulang laporan tool Kapasitas Balok dan Geser & Torsi.

export { BEAM_CHECK_DEFAULTS }

/** Geser tanpa torsi: Vc, Vs, φVn, sengkang minimum, spasi maksimum. */
function plainShear(tag: string, c: ShearCheck): Section {
  const r = c.r
  const lam = '1', sq = fx(r.sqrtfc, 3), fyt = fx(r.fyt, 0)
  return {
    title: `Geser ${tag}`,
    strong: tag === 'tumpuan',
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'd', desc: 'Dari titik berat tulangan tarik pada penampang ini', value: fx(r.d, 1), unit: 'mm' },
          { lhs: 'V_{c}', expr: "0.17λ√(f'_{c}) b_{w} d", subst: `0.17 × ${lam} × ${sq} × ${fx(r.b, 0)} × ${fx(r.d, 1)} / 10^{3}`, value: fx(r.VckN, 1), unit: 'kN', ref: '22.5.5.1' },
          { lhs: 'A_{v}', expr: `${r.nLegs} × A_{b}`, subst: `${r.nLegs} × ${fx(r.Ab, 1)}`, value: fx(r.Av, 1), unit: 'mm^{2}' },
          { lhs: 'V_{s}', expr: '\\frac{A_{v} f_{yt} d}{s}', subst: `\\frac{${fx(r.Av, 1)} × ${fyt} × ${fx(r.d, 1)}}{${fx(r.s, 0)}} / 10^{3}`, value: fx(r.VskN, 1), unit: 'kN', ref: '22.5.8.5.3' },
          { lhs: 'V_{s,maks}', expr: "0.66√(f'_{c}) b_{w} d", value: fx(r.VsMaxkN, 1), unit: 'kN', ref: '22.5.1.2' },
          { lhs: 'φV_{n}', expr: 'φ(V_{c} + min(V_{s}; V_{s,maks}))', subst: `0.75 × (${fx(r.VckN, 1)} + ${fx(r.VskN, 1)})`, value: fx(r.phiVnkN, 1), unit: 'kN' },
          { lhs: '\\frac{A_{v}}{s}_{perlu}', expr: "maks(\\frac{V_{u}/φ − V_{c}}{f_{yt} d}; maks(0.062√(f'_{c}); 0.35)\\frac{b_{w}}{f_{yt}})", value: fx(Math.max(r.AvsShear!, r.minTrans!), 4), unit: 'mm^{2}/mm', ref: '9.6.3.3' },
          { lhs: '\\frac{A_{v}}{s}_{pasang}', expr: '\\frac{A_{v}}{s}', value: fx(r.Av! / r.s!, 4), unit: 'mm^{2}/mm' },
          { lhs: 's_{maks}', expr: r.Vs! <= 0.33 * r.sqrtfc! * r.b! * r.d! ? 'min(d/2; 600)' : 'min(d/4; 300)', value: fx(r.smaxShear, 0), unit: 'mm', ref: '9.7.6.2.2' },
        ],
      },
      {
        k: 'rows',
        rows: [
          check(`V_{u} = ${fx(r.VukN, 1)} kN / φV_{n}`, c.ratioV),
          check('Dimensi penampang (kiri / kanan)', c.ratioSec),
          check('Sengkang perlu / terpasang', c.ratioStir),
          check(`s = ${fx(r.s, 0)} mm / s_{maks}`, c.ratioS),
        ],
      },
    ],
  }
}

function shearSections(tag: string, c: ShearCheck, torsion: boolean): Section[] {
  if (!torsion) return [plainShear(tag, c)]
  const sub = shearReport(c.r).sections.slice(1) // tanpa 'Data'
  return sub.map((s) => ({ ...s, title: `${s.title} — ${tag}` }))
}

export function beamCheckReport(res: BeamCheckResult): Report {
  const v = res.input!, pos = res.pos!, neg = res.neg!, sup = res.sup!, mid = res.mid ?? null
  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv("f'_{c} / f_{y} / f_{yt}", `${fx(v.fc, 0)} / ${fx(v.fy, 0)} / ${fx(v.fyt, 0)} MPa`),
            kv('b × h / selimut bersih', `${fx(v.b, 0)} × ${fx(v.h, 0)} mm / ${fx(v.cc, 0)} mm`),
            kv('Tulangan lapangan (M+)', `tarik bawah ${v.nPosT}D${v.db} (${v.layPos} lapis), tekan atas ${v.nPosC}D${v.db}`),
            kv('Tulangan tumpuan (M−)', `tarik atas ${v.nNegT}D${v.db} (${v.layNeg} lapis), tekan bawah ${v.nNegC}D${v.db}`),
            kv('Sengkang tumpuan', `Ø${v.ds}–${fx(v.sSup, 0)} mm, ${v.nLegs} kaki`),
            ...(mid ? [kv('Sengkang lapangan', `Ø${v.ds}–${fx(v.sMid, 0)} mm, ${v.nLegs} kaki`)] : []),
            kv('Beban terfaktor', `M_{u}+ = ${fx(v.Mpos, 1)} kN·m, M_{u}− = ${fx(v.Mneg, 1)} kN·m, V_{u} tumpuan = ${fx(v.Vu, 1)} kN${mid ? `, V_{u} lapangan = ${fx(v.VuMid, 1)} kN` : ''}`),
            ...(v.torsion ? [kv('Torsi', `T_{u} = ${fx(v.Tu, 2)} kN·m; tulangan samping ${v.nSide}D${v.dbSide}`)] : []),
          ],
        },
      ],
    },
    ...beamFlexReport(pos.flex).sections.map((s) => ({ ...s, title: `Lentur lapangan (M+) — ${s.title}`, strong: false })),
    { title: 'Kontrol lentur lapangan (M+)', strong: true, blocks: [{ k: 'rows', rows: [check(`M_{u}+ = ${fx(v.Mpos, 1)} kN·m / φM_{n} = ${fx(pos.flex.phiMnkNm, 1)} kN·m`, pos.ratioM)] }] },
    ...beamFlexReport(neg.flex).sections.map((s) => ({ ...s, title: `Lentur tumpuan (M−) — ${s.title}`, strong: false })),
    { title: 'Kontrol lentur tumpuan (M−)', strong: true, blocks: [{ k: 'rows', rows: [check(`M_{u}− = ${fx(v.Mneg, 1)} kN·m / φM_{n} = ${fx(neg.flex.phiMnkNm, 1)} kN·m`, neg.ratioM)] }] },
    ...shearSections('tumpuan', sup, v.torsion),
    ...(mid ? shearSections('lapangan', mid, v.torsion) : []),
  ]

  const summary = [
    check(`Lentur lapangan: M_{u}+ = ${fx(v.Mpos, 1)} / φM_{n} = ${fx(pos.flex.phiMnkNm, 1)} kN·m`, pos.ratioM),
    check(`Lentur tumpuan: M_{u}− = ${fx(v.Mneg, 1)} / φM_{n} = ${fx(neg.flex.phiMnkNm, 1)} kN·m`, neg.ratioM),
    check(`Geser tumpuan: V_{u} = ${fx(v.Vu, 1)} / φV_{n} = ${fx(sup.r.phiVnkN, 1)} kN`, sup.ratioV),
    ...(mid ? [check(`Geser lapangan: V_{u} = ${fx(v.VuMid, 1)} / φV_{n} = ${fx(mid.r.phiVnkN, 1)} kN`, mid.ratioV)] : []),
    ...(v.torsion ? [sup.ratioT > 0 ? check(`Torsi: T_{u} = ${fx(v.Tu, 2)} / φT_{n} = ${fx(sup.r.phiTnkNm, 2)} kN·m`, sup.ratioT) : kv('Torsi', `T_{u} < φT_{th} = ${fx(sup.r.phiTthkNm, 2)} kN·m — diabaikan`)] : []),
    check('Tulangan minimum & daktilitas lentur', Math.max(pos.ratioMin, neg.ratioMin, pos.ratioEt, neg.ratioEt)),
    check('Sengkang minimum & spasi maksimum', Math.max(sup.ratioStir, sup.ratioS, mid?.ratioStir ?? 0, mid?.ratioS ?? 0)),
  ]

  return {
    title: 'Cek Desain Balok Beton (SNI 2847:2019)',
    summary,
    sections,
    governing: { label: 'Rasio terbesar', ratio: res.gov! },
    warnings: res.warn,
    scope: [
      'Balok persegi, φ lentur dari εt, φ geser/torsi = 0,75, θ = 45°, beton normal (λ = 1). Tinggi efektif geser = titik berat tulangan tarik tiap penampang. Torsi (bila aktif) dianggap konstan sepanjang balok.',
      'Belum termasuk: penampang T/L, lendutan, retak, penyaluran/sambungan lewatan, kapasitas ujung kolom-balok. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildBeamCheckReport(i: BeamCheckForm): Report | null {
  const r = computeCheck(i)
  return r ? beamCheckReport(r) : null
}

export default {
  defaults: BEAM_CHECK_DEFAULTS,
  build: (i: BeamCheckForm) => buildBeamCheckReport(i) ?? { title: 'Cek Desain Balok Beton', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
