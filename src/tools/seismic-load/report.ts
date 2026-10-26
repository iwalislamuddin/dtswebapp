import { CT, IE, SITE_LABEL, type SeismicSystem } from '../../calc/seismic-load'
import { fx, kv, type CalcStep, type Report } from '../../report/model'
import { figSpectrum, figStory } from './figures'
import { computeSeismicUI, KIND_LABEL, RISK_LABEL, SEISMIC_DEFAULTS, type SeismicOk, type SeismicUIInput } from './model'

// Laporan Beban Gempa — SNI 1726:2019 (ASCE 7-16): parameter spektral, spektrum desain, KDS, sistem struktur,
// periode, geser dasar statik ekivalen, distribusi vertikal, simpangan izin, pengaruh beban gempa.

export { SEISMIC_DEFAULTS }

/** Batas tinggi sebagai teks: TB / TI / "48 m". */
export const hText = (h: number | null | undefined) => (h === undefined ? '—' : h === null ? 'TB' : h === 0 ? 'TI' : `${h} m`)

const sysRef = (s: SeismicSystem) =>
  s.id === 'custom' ? 'ditentukan pengguna' : s.id.startsWith('T') ? 'ASCE 7-16 Tabel 15.4-2' : s.id.startsWith('N') ? 'ASCE 7-16 Tabel 15.4-1' : 'Tabel 12'

export function seismicReport(r: SeismicOk, loc?: string): Report {
  const i = r.inp
  const RI = `${fx(r.sys.R, 2)}/${fx(r.Ie, 2)}`
  const Tsteps: CalcStep[] = []
  if (i.kind !== 'nb-other') {
    Tsteps.push(
      { desc: `${CT[r.sys.ct].label}`, lhs: 'T_{a}', expr: 'C_{t} h_{n}^{x}', subst: `${fx(r.Ct, 4)} × ${fx(r.hn, 2)}^{${fx(r.x, 2)}}`, value: fx(r.Ta, 3), unit: 's', ref: 'Ps. 7.8.2.1, Tabel 18' },
      { desc: `Koefisien batas atas (S_{D1} = ${fx(r.SD1, 3)})`, lhs: 'C_{u}', value: fx(r.Cu, 3), ref: 'Tabel 17' },
      { lhs: 'C_{u}T_{a}', subst: `${fx(r.Cu, 3)} × ${fx(r.Ta, 3)}`, value: fx(r.CuTa, 3), unit: 's' },
    )
  }
  const tNote =
    i.Tc === null
      ? 'Periode hasil analisis tidak diisi → T = T_{a}.'
      : i.kind === 'nb-other'
        ? 'Struktur nongedung tidak mirip gedung: T dari analisis (ASCE 7-16 Ps. 15.4.4).'
        : r.Tsrc === 'CuTa'
          ? `T_{c} = ${fx(i.Tc, 3)} s > C_{u}T_{a} → T = C_{u}T_{a}.`
          : r.Tsrc === 'Ta'
            ? `T_{c} = ${fx(i.Tc, 3)} s < T_{a} → T = T_{a}.`
            : `T_{a} ≤ T_{c} = ${fx(i.Tc, 3)} s ≤ C_{u}T_{a} → T = T_{c}.`
  Tsteps.push({ desc: tNote, lhs: 'T', value: fx(r.T, 3), unit: 's', ref: 'Ps. 7.8.2' })

  const csMaxStep: CalcStep =
    r.T <= i.TL
      ? { desc: `T = ${fx(r.T, 3)} s ≤ T_{L}`, lhs: 'C_{s,maks}', expr: '\\frac{S_{D1}}{T (R/I_{e})}', subst: `${fx(r.SD1, 4)} / (${fx(r.T, 3)} × ${RI})`, value: fx(r.CsMax, 4), ref: 'Ps. 7.8.1.1' }
      : { desc: `T = ${fx(r.T, 3)} s > T_{L}`, lhs: 'C_{s,maks}', expr: '\\frac{S_{D1} T_{L}}{T^{2} (R/I_{e})}', subst: `${fx(r.SD1, 4)} × ${fx(i.TL, 0)} / (${fx(r.T, 3)}^{2} × ${RI})`, value: fx(r.CsMax, 4), ref: 'Ps. 7.8.1.1' }
  const csSteps: CalcStep[] = r.rigid
    ? [{ desc: 'Struktur nongedung kaku (T < 0,06 s)', lhs: 'C_{s}', expr: '0.30 S_{DS} I_{e}', subst: `0.30 × ${fx(r.SDS, 4)} × ${fx(r.Ie, 2)}`, value: fx(r.Cs, 4), ref: 'ASCE 7-16 Pers. 15.4-5' }]
    : [
        { lhs: 'C_{s}', expr: '\\frac{S_{DS}}{R/I_{e}}', subst: `${fx(r.SDS, 4)} / (${RI})`, value: fx(r.Cs0, 4), ref: 'Ps. 7.8.1.1' },
        csMaxStep,
        { desc: i.kind === 'nb-other' ? 'Minimum nongedung tidak mirip gedung (ASCE 7-16 Pers. 15.4-1, 15.4-2)' : 'Minimum (Ps. 7.8.1.1)', lhs: 'C_{s,min}', expr: r.CsMinNote, value: fx(r.CsMin, 4) },
        { lhs: 'C_{s}', expr: 'max(min(C_{s}; C_{s,maks}); C_{s,min})', value: fx(r.Cs, 4), ref: 'Ps. 7.8.1.1' },
      ]

  return {
    title: 'Beban Gempa Statik Ekivalen (SNI 1726:2019)',
    summary: [
      kv('Geser dasar seismik V', `${fx(r.V, 1)} kN (C_{s} = ${fx(r.Cs, 4)}, W = ${fx(r.W, 0)} kN)`),
      kv('S_{DS} / S_{D1}', `${fx(r.SDS, 3)} g / ${fx(r.SD1, 3)} g`),
      kv('Kategori desain seismik', `KDS ${r.sdc}`),
      kv('Sistem struktur', `${r.sys.label} (R = ${fx(r.sys.R, 2)})`),
      kv('Periode fundamental T', `${fx(r.T, 3)} s`),
    ],
    sections: [
      {
        title: 'Data situs',
        blocks: [
          {
            k: 'rows',
            rows: [
              ...(loc ? [kv('Lokasi', loc)] : []),
              kv('Parameter batuan dasar MCE_{R}', `S_{s} = ${fx(i.Ss, 3)} g, S_{1} = ${fx(i.S1, 3)} g`),
              kv('PGA (MCE_{G})', `${fx(i.PGA, 3)} g`),
              kv('Periode transisi panjang T_{L}', `${fx(i.TL, 0)} s`),
              kv('Kelas situs', SITE_LABEL[i.site]),
              kv('Kategori risiko', RISK_LABEL[i.risk]),
              kv('Jenis struktur', KIND_LABEL[i.kind]),
            ],
          },
          {
            k: 'calc',
            steps: [{ desc: `Kategori risiko ${i.risk}`, lhs: 'I_{e}', value: fx(IE[i.risk], 2), ref: 'Tabel 4' }],
          },
        ],
      },
      {
        title: 'Parameter respons spektral',
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: `Koefisien situs periode pendek (kelas ${i.site}, interpolasi linear)`, lhs: 'F_{a}', value: fx(r.Fa, 3), ref: 'Tabel 6' },
              { desc: 'Koefisien situs periode 1 detik', lhs: 'F_{v}', value: fx(r.Fv, 3), ref: 'Tabel 7' },
              { lhs: 'S_{MS}', expr: 'F_{a} S_{s}', subst: `${fx(r.Fa, 3)} × ${fx(i.Ss, 3)}`, value: fx(r.SMS, 4), unit: 'g', ref: 'Ps. 6.2' },
              { lhs: 'S_{M1}', expr: 'F_{v} S_{1}', subst: `${fx(r.Fv, 3)} × ${fx(i.S1, 3)}`, value: fx(r.SM1, 4), unit: 'g', ref: 'Ps. 6.2' },
              { lhs: 'S_{DS}', expr: '⅔ S_{MS}', subst: `⅔ × ${fx(r.SMS, 4)}`, value: fx(r.SDS, 4), unit: 'g', ref: 'Ps. 6.3' },
              { lhs: 'S_{D1}', expr: '⅔ S_{M1}', subst: `⅔ × ${fx(r.SM1, 4)}`, value: fx(r.SD1, 4), unit: 'g', ref: 'Ps. 6.3' },
              { lhs: 'T_{0}', expr: '0.2 S_{D1}/S_{DS}', subst: `0.2 × ${fx(r.SD1, 4)} / ${fx(r.SDS, 4)}`, value: fx(r.T0, 3), unit: 's' },
              { lhs: 'T_{s}', expr: 'S_{D1}/S_{DS}', subst: `${fx(r.SD1, 4)} / ${fx(r.SDS, 4)}`, value: fx(r.Ts, 3), unit: 's' },
              { desc: 'Percepatan tanah puncak tersesuaikan (ASCE 7-16 Tabel 11.8-1)', lhs: 'PGA_{M}', expr: 'F_{PGA} PGA', subst: `${fx(r.Fpga, 3)} × ${fx(i.PGA, 3)}`, value: fx(r.PGAM, 4), unit: 'g', ref: 'Ps. 11.8.3' },
            ],
          },
          { k: 'p', text: 'S_{a} = S_{DS}(0.4 + 0.6T/T_{0}) untuk T < T_{0}; S_{a} = S_{DS} untuk T_{0} ≤ T ≤ T_{s}; S_{a} = S_{D1}/T untuk T_{s} < T ≤ T_{L}; S_{a} = S_{D1}T_{L}/T^{2} untuk T > T_{L} (Ps. 6.4).' },
          { k: 'figure', fig: figSpectrum(r, 1) },
        ],
      },
      {
        title: 'Kategori desain seismik',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Berdasarkan S_{DS} (Tabel 8)', `KDS ${r.sdcS}`),
              kv('Berdasarkan S_{D1} (Tabel 9)', `KDS ${r.sdc1}`),
              kv('KDS menentukan (yang lebih berat)', `KDS ${r.sdc}${i.S1 >= 0.75 ? ' (S_{1} ≥ 0,75)' : ''}`),
            ],
          },
        ],
      },
      {
        title: 'Sistem pemikul gaya seismik',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Sistem', `${r.sys.group !== 'Kustom' ? r.sys.group + ' — ' : ''}${r.sys.label}`),
              kv('R / Ω_{0} / C_{d}', `${fx(r.sys.R, 2)} / ${fx(r.sys.Om, 2)} / ${fx(r.sys.Cd, 2)} (${sysRef(r.sys)})`),
              kv('Batas tinggi KDS B / C / D / E / F', r.sys.h.map(hText).join(' / ')),
              kv(`Batas berlaku KDS ${r.sdc}`, `${hText(r.hLimit)} — h_{n} = ${fx(r.hn, 2)} m`),
              kv('Faktor redundansi ρ', fx(i.rho, 1)),
            ],
          },
        ],
      },
      { title: 'Periode fundamental', blocks: [{ k: 'calc', steps: Tsteps }] },
      {
        title: 'Geser dasar seismik',
        strong: true,
        blocks: [
          {
            k: 'calc',
            steps: [
              ...csSteps,
              { desc: 'Berat seismik efektif total', lhs: 'W', expr: 'Σ w_{x}', value: fx(r.W, 1), unit: 'kN', ref: 'Ps. 7.7.2' },
              { lhs: 'V', expr: 'C_{s} W', subst: `${fx(r.Cs, 4)} × ${fx(r.W, 1)}`, value: fx(r.V, 1), unit: 'kN', ref: 'Ps. 7.8.1' },
            ],
          },
        ],
      },
      {
        title: 'Distribusi vertikal & geser tingkat',
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: 'Eksponen distribusi (1 untuk T ≤ 0,5 s; 2 untuk T ≥ 2,5 s; interpolasi)', lhs: 'k', value: fx(r.k, 3), ref: 'Ps. 7.8.3' },
              { lhs: 'F_{x}', expr: 'C_{vx} V = \\frac{w_{x} h_{x}^{k}}{Σ w_{i} h_{i}^{k}} V', value: 'tabel', ref: 'Ps. 7.8.3' },
            ],
          },
          {
            k: 'table',
            head: ['Lantai', 'h_{x} (m)', 'w_{x} (kN)', 'C_{vx}', 'F_{x} (kN)', 'V_{x} (kN)', 'M_{x} (kN·m)', 'Δ_{a} (mm)'],
            rows: [...r.levels]
              .reverse()
              .map((l) => [String(l.i), fx(l.hx, 2), fx(l.wx, 1), fx(l.Cvx, 4), fx(l.Fx, 1), fx(l.Vx, 1), fx(l.Mx, 0), fx(l.drift, 0)]),
            align: ['c', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
            caption: `Gaya lantai, geser tingkat, momen guling di dasar tingkat, dan simpangan antar tingkat izin (Σ F_{x} = V; M_{dasar} = ${fx(r.M0, 0)} kN·m)`,
          },
          { k: 'figure', fig: figStory(r, 2) },
        ],
      },
      {
        title: 'Simpangan & pengaruh beban gempa',
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: 'Simpangan desain dari simpangan elastis δ_{xe}', lhs: 'δ_{x}', expr: 'C_{d} δ_{xe} / I_{e}', subst: `${fx(r.sys.Cd, 2)} δ_{xe} / ${fx(r.Ie, 2)}`, value: `${fx(r.sys.Cd / r.Ie, 3)} δ_{xe}`, ref: 'Ps. 7.8.6' },
              {
                desc: `Simpangan antar tingkat izin, kategori risiko ${i.risk}${r.sys.mrf && 'DEF'.includes(r.sdc) ? `, SRPM KDS ${r.sdc} dibagi ρ` : ''}`,
                lhs: 'Δ_{a}',
                expr: r.sys.mrf && 'DEF'.includes(r.sdc) ? `${fx(r.driftCoef, 3)} h_{sx} / ρ` : `${fx(r.driftCoef, 3)} h_{sx}`,
                value: 'tabel',
                ref: 'Ps. 7.12.1, Tabel 20',
              },
              { desc: 'Pengaruh gempa vertikal', lhs: 'E_{v}', expr: '0.2 S_{DS} D', value: `${fx(r.ev, 3)} D`, ref: 'Ps. 7.4.2.2' },
              { desc: 'Pengaruh gempa horizontal', lhs: 'E_{h}', expr: 'ρ Q_{E}', value: `${fx(i.rho, 1)} Q_{E}`, ref: 'Ps. 7.4.2.1' },
              { desc: 'Kombinasi 1,2D + E_{v} + E_{h} + L', lhs: 'U_{1}', expr: '(1.2 + 0.2 S_{DS}) D + ρ Q_{E} + L', value: `${fx(r.cD1, 3)} D + ${fx(i.rho, 1)} Q_{E} + L`, ref: 'Ps. 4.2.2' },
              { desc: 'Kombinasi 0,9D − E_{v} + E_{h}', lhs: 'U_{2}', expr: '(0.9 − 0.2 S_{DS}) D + ρ Q_{E}', value: `${fx(r.cD2, 3)} D + ${fx(i.rho, 1)} Q_{E}`, ref: 'Ps. 4.2.2' },
              { desc: 'Dengan faktor kuat lebih (elemen yang disyaratkan)', lhs: 'U_{Ω}', expr: '(1.2 + 0.2 S_{DS}) D + Ω_{0} Q_{E} + L', value: `${fx(r.cD1, 3)} D + ${fx(r.sys.Om, 2)} Q_{E} + L`, ref: 'Ps. 7.4.3' },
            ],
          },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'SNI 1726:2019 (adopsi ASCE 7-16): parameter spektral, KDS, sistem struktur, prosedur gaya lateral ekivalen (Ps. 7.8) satu arah; jalankan untuk tiap arah utama bila sistem/periode berbeda. Struktur nongedung mengikuti ASCE 7-16 Bab 15.',
      'Nilai S_{s}, S_{1}, PGA, T_{L} dari peta diinterpolasi bilinear grid 0,1° data Desain Spektra Indonesia (PUPR); verifikasi dengan aplikasi resmi rsa.ciptakarya.pu.go.id untuk desain akhir.',
      'Belum termasuk: ketidakberaturan & syarat analisis dinamik (Ps. 7.6), torsi tak terduga & pembesaran, efek P-Δ, diafragma, komponen nonstruktural, analisis respons spesifik situs. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildSeismicReport(i: SeismicUIInput): Report | null {
  const r = computeSeismicUI(i)
  return r ? seismicReport(r, locText(i)) : null
}

/** Teks lokasi untuk laporan, atau undefined bila tidak diisi. */
export const locText = (i: SeismicUIInput) => (i.loc.trim() ? `${i.loc.trim()} (bujur ${i.lon}, lintang ${i.lat})` : undefined)

export default {
  defaults: SEISMIC_DEFAULTS,
  build: (i: SeismicUIInput) => buildSeismicReport(i) ?? { title: 'Beban Gempa', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
