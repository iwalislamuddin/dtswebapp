import type { StoneWallResult } from '../../calc/retaining-stone'
import { opsiName } from '../../calc/retaining-stone'
import { check, fx, kv, type Report, type Section } from '../../report/model'
import { basePressures, stabilityRatios } from '../_retaining/common'
import { figWall, stabilitySections } from '../_retaining/report'
import { STONE_DEFAULTS, computeStone, type StoneInput } from './model'

// Laporan DPT Batu Kali (gravitasi): tekanan aktif Rankine, guling, geser, daya dukung dasar, volume pasangan.

export { STONE_DEFAULTS }

export function stoneReport(r: StoneWallResult): Report {
  const ratios = stabilityRatios(r)
  const gov = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  const bp = basePressures(r)
  const stability = stabilitySections(r, false)
  stability[stability.length - 1].blocks.push({ k: 'rows', rows: [check('Rasio terbesar', gov.ratio, gov.label)] })
  const sections: Section[] = [
    {
      title: 'Data & geometri',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Bentuk', opsiName(r.opsi!)),
            kv('H / b_{atas} / b_{bawah}', `${fx(r.H, 2)} / ${fx(r.bTop, 2)} / ${fx(r.bBot, 2)} m`),
            kv('Tapak t / toe / heel', `${fx(r.tf, 2)} / ${fx(r.toe, 2)} / ${fx(r.heel, 2)} m → B = ${fx(r.B, 2)} m`),
            kv('Urugan γ / φ / β / q', `${fx(r.g1, 1)} kN/m³ / ${fx(r.phi1, 1)}° / ${fx(r.beta, 1)}° / ${fx(r.q, 1)} kPa`),
            kv('Tanah fondasi γ / φ / c', `${fx(r.g2, 1)} kN/m³ / ${fx(r.phi2, 1)}° / ${fx(r.c2, 1)} kPa`),
            kv('q_{izin} / k / D / pasif', `${r.qall! > 0 ? fx(r.qall, 0) + ' kPa' : '—'} / ${fx(r.kf, 2)} / ${fx(r.D, 2)} m / ${r.usePp ? 'diikutkan' : 'diabaikan'}`),
            kv('γ pasangan batu', `${fx(r.gw, 1)} kN/m³`),
          ],
        },
        { k: 'figure', fig: figWall(r, `Gbr. 1 — Penampang dinding (${opsiName(r.opsi!)}): badan, tapak, urugan, tekanan dasar layan (kPa) dan gaya aktif horizontal.`) },
      ],
    },
    ...stability,
    {
      title: 'Volume pasangan',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'A_{badan}', expr: '½(b_{atas} + b_{bawah}) H', subst: `½ × (${fx(r.bTop, 2)} + ${fx(r.bBot, 2)}) × ${fx(r.H, 2)}`, value: fx(r.Astem, 3), unit: 'm²' },
            { lhs: 'A_{tapak}', expr: 'B t', subst: `${fx(r.B, 2)} × ${fx(r.tf, 2)}`, value: fx(r.Afoot, 3), unit: 'm²' },
            { lhs: 'V', expr: 'A_{badan} + A_{tapak}', value: fx(r.volM, 3), unit: 'm³/m' },
            ...(r.volTot != null ? [{ lhs: 'V_{total}', expr: 'V × L', subst: `${fx(r.volM, 3)} × ${fx(r.Lw, 1)}`, value: fx(r.volTot, 2), unit: 'm³' }] : []),
          ],
        },
      ],
    },
  ]
  return {
    title: 'DPT Batu Kali — Gravitasi (Stabilitas & Volume)',
    summary: [
      kv('FS guling / geser', `${fx(r.FSot, 2)} / ${fx(r.FSsl, 2)} (min ${fx(r.FSotT, 1)} / ${fx(r.FSslT, 1)})`),
      kv('Eksentrisitas e / B/6', `${fx(r.e, 3)} / ${fx(r.B! / 6, 3)} m`),
      kv('Tekanan dasar toe / heel', `${Number.isFinite(bp.toe) ? fx(bp.toe, 1) : '∞'} / ${fx(bp.heel, 1)} kPa`),
      kv('Volume pasangan', `${fx(r.volM, 3)} m³/m${r.volTot != null ? ` · ${fx(r.volTot, 2)} m³ total` : ''}`),
    ],
    sections,
    governing: { label: gov.label, ratio: gov.ratio },
    warnings: r.warn,
    scope: [
      'Per meter panjang dinding; tekanan aktif Rankine pada bidang vertikal semu di ujung heel (urugan granular), gesekan dinding diabaikan.',
      'Belum termasuk: air tanah (wajib drainase dan lubang suling-suling), gempa, stabilitas lereng global, penurunan. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildStoneReport(i: StoneInput): Report | null {
  const r = computeStone(i)
  return r ? stoneReport(r) : null
}

export default {
  defaults: STONE_DEFAULTS,
  build: (i: StoneInput) => buildStoneReport(i) ?? { title: 'DPT Batu Kali', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
