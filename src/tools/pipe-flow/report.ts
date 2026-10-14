import { dimV, figRows } from '../../report/figure'
import { fx, kv, sci, type CalcStep, type FigOp, type Figure, type Report } from '../../report/model'
import { fq } from '../_hydraulics/figure'
import { computePipeUI, PIPE_DEFAULTS, type PipeOk, type PipeUIInput } from './model'

// Laporan Aliran Pipa bertekanan — Darcy–Weisbach (f Swamee–Jain / 64/Re), kehilangan minor ΣK, pembanding
// Hazen–Williams.

export { PIPE_DEFAULTS }

/** Geometri garis energi (EGL) & hidraulik (HGL) skematik: kehilangan minor digambar terpusat di hulu. */
export function gradeLines(r: PipeOk) {
  const top = r.hTot + r.hv
  return {
    top,
    /** [x/L, tinggi di atas sumbu pipa relatif ke ujung hilir HGL] */
    egl: [[0, top], [0, top - r.hm], [1, r.hv]] as [number, number][],
    hgl: [[0, top - r.hv], [0, top - r.hm - r.hv], [1, 0]] as [number, number][],
  }
}

/** Gbr. 1 — profil memanjang pipa dengan garis energi & garis hidraulik. */
function figGrade(r: PipeOk): Figure {
  const ops: FigOp[] = []
  const x0 = 90, x1 = 430, yP = 150, yTop = 30
  const gl = gradeLines(r)
  const sc = (yP - 22 - yTop) / (gl.top || 1)
  const Y = (h: number) => yP - 22 - h * sc
  const X = (t: number) => x0 + t * (x1 - x0)
  ops.push({ t: 'rect', x: x0, y: yP - 5, w: x1 - x0, h: 10, fill: true, c: 'support', op: 0.18 })
  ops.push({ t: 'rect', x: x0, y: yP - 5, w: x1 - x0, h: 10, lw: 0.9, c: 'support' })
  ops.push({ t: 'text', x: (x0 + x1) / 2, y: yP + 18, s: `L = ${fx(r.Lp, 1)} m, D = ${fx(r.D * 1000, 1)} mm, Q = ${fq(r.Q * 1000, 3)} L/s, V = ${fx(r.V, 3)} m/s`, size: 7, align: 'c' })
  ops.push({ t: 'poly', pts: gl.egl.map(([t, h]) => [X(t), Y(h)]), lw: 1.2, c: 'm' })
  ops.push({ t: 'poly', pts: gl.hgl.map(([t, h]) => [X(t), Y(h)]), lw: 1.2, c: 'v', dash: [4, 2] })
  ops.push({ t: 'line', x1: x0 - 6, y1: Y(gl.top), x2: x1 + 6, y2: Y(gl.top), lw: 0.4, c: 'muted', dash: [2, 2] })
  ops.push({ t: 'text', x: x1 + 6, y: Y(r.hv) - 4, s: 'EGL', size: 7, c: 'm' })
  ops.push({ t: 'text', x: x1 + 6, y: Y(0) + 9, s: 'HGL', size: 7, c: 'v' })
  dimV(ops, Y(gl.top), Y(gl.top - r.hm), x0 - 14, '')
  ops.push({ t: 'text', x: x0 - 20, y: (Y(gl.top) + Y(gl.top - r.hm)) / 2 + 2.5, s: `h_{m} = ${fx(r.hm, 3)} m`, size: 7, align: 'r' })
  dimV(ops, Y(gl.top - r.hm), Y(r.hv), x1 + 30, '')
  ops.push({ t: 'text', x: x1 + 36, y: (Y(gl.top - r.hm) + Y(r.hv)) / 2 + 2.5, s: `h_{f} = ${fx(r.hf, 3)} m`, size: 7 })
  ops.push({ t: 'text', x: X(0.5), y: (Y(gl.top - r.hm) + Y(r.hv)) / 2 - 6, s: `V^{2}/2g = ${fx(r.hv, 3)} m`, size: 6.5, align: 'c', c: 'muted' })
  return {
    h: figRows(yP + 26),
    ops,
    alt: 'Profil memanjang pipa dengan garis energi dan garis hidraulik',
    caption: `Gbr. 1 — Garis energi (EGL) dan hidraulik (HGL), skematik; kehilangan minor ΣK = ${fx(r.sumK, 2)} digambar terpusat di hulu. Total h = ${fx(r.hTot, 3)} m.`,
  }
}

export function pipeReport(r: PipeOk): Report {
  const D = fx(r.D, 4), V = fx(r.V, 4), nu = sci(r.nu, 3)
  const fStep: CalcStep =
    r.regime === 'laminar'
      ? { desc: 'Aliran laminar (Re < 2300) — Hagen–Poiseuille', lhs: 'f', expr: '\\frac{64}{Re}', subst: `\\frac{64}{${fx(r.Re, 0)}}`, value: fx(r.f, 5) }
      : {
          desc: 'Swamee–Jain (pendekatan eksplisit Colebrook–White)',
          lhs: 'f',
          expr: '\\frac{0.25}{[log(\\frac{ε}{3.7D} + \\frac{5.74}{Re^{0.9}})]^{2}}',
          subst: `\\frac{0.25}{[log(\\frac{${sci(r.eps, 3)}}{3.7 × ${D}} + \\frac{5.74}{${sci(r.Re, 3)}^{0.9}})]^{2}}`,
          value: fx(r.f, 5),
        }
  return {
    title: 'Aliran Pipa — Darcy–Weisbach & Hazen–Williams',
    summary: [
      kv('Kehilangan energi total h', `${fx(r.hTot, 3)} m (mayor ${fx(r.hf, 3)} + minor ${fx(r.hm, 3)})`),
      kv('Kecepatan V', `${fx(r.V, 3)} m/s`),
      kv('Gradien hidraulik', `${fx(r.gradient, 2)} m/km`),
    ],
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Diameter dalam D', `${fx(r.D * 1000, 1)} mm`),
              kv('Panjang pipa L', `${fx(r.Lp, 1)} m`),
              kv('Debit Q', `${fq(r.Q * 1000, 3)} L/s = ${fq(r.Q, 4)} m³/s`),
              kv('Material', `${r.matLabel}, ε = ${fq(r.eps * 1000, 3)} mm, C_{HW} = ${fx(r.C, 0)}`),
              kv('Viskositas kinematik ν', `${nu} m²/s`),
              kv('Koefisien minor ΣK', fx(r.sumK, 2)),
            ],
          },
        ],
      },
      {
        title: 'Kecepatan & bilangan Reynolds',
        blocks: [
          {
            k: 'calc',
            steps: [
              { lhs: 'A', expr: '\\frac{π D^{2}}{4}', subst: `\\frac{π × ${D}^{2}}{4}`, value: fx(r.A, 6), unit: 'm²' },
              { lhs: 'V', expr: '\\frac{Q}{A}', subst: `\\frac{${fq(r.Q, 4)}}{${fx(r.A, 6)}}`, value: fx(r.V, 3), unit: 'm/s' },
              { lhs: 'Re', expr: '\\frac{V D}{ν}', subst: `\\frac{${V} × ${D}}{${nu}}`, value: sci(r.Re, 3) },
            ],
          },
          { k: 'p', text: `Rezim: ${r.regime} (laminar Re < 2300, transisi 2300–4000, turbulen > 4000).` },
        ],
      },
      {
        title: 'Faktor gesek',
        blocks: [{ k: 'calc', steps: [{ desc: 'Kekasaran relatif', lhs: 'ε/D', expr: '\\frac{ε}{D}', subst: `\\frac{${sci(r.eps, 3)}}{${D}}`, value: sci(r.eps / r.D, 3) }, fStep] }],
      },
      {
        title: 'Kehilangan energi',
        strong: true,
        blocks: [
          {
            k: 'calc',
            steps: [
              { desc: 'Tinggi kecepatan', lhs: 'h_{v}', expr: '\\frac{V^{2}}{2g}', subst: `\\frac{${fx(r.V, 4)}^{2}}{2 × 9.81}`, value: fx(r.hv, 4), unit: 'm' },
              { desc: 'Kehilangan mayor — Darcy–Weisbach', lhs: 'h_{f}', expr: 'f \\frac{L}{D} \\frac{V^{2}}{2g}', subst: `${fx(r.f, 5)} × \\frac{${fx(r.Lp, 1)}}{${D}} × ${fx(r.hv, 4)}`, value: fx(r.hf, 3), unit: 'm' },
              { desc: 'Kehilangan minor (katup, belokan, inlet/outlet)', lhs: 'h_{m}', expr: 'ΣK \\frac{V^{2}}{2g}', subst: `${fx(r.sumK, 2)} × ${fx(r.hv, 4)}`, value: fx(r.hm, 3), unit: 'm' },
              { lhs: 'h', expr: 'h_{f} + h_{m}', subst: `${fx(r.hf, 3)} + ${fx(r.hm, 3)}`, value: fx(r.hTot, 3), unit: 'm' },
              { desc: 'Gradien hidraulik (mayor)', lhs: 'i', expr: '\\frac{h_{f}}{L} × 1000', subst: `\\frac{${fx(r.hf, 3)}}{${fx(r.Lp, 1)}} × 1000`, value: fx(r.gradient, 2), unit: 'm/km' },
            ],
          },
          { k: 'figure', fig: figGrade(r) },
        ],
      },
      {
        title: 'Pembanding Hazen–Williams',
        blocks: [
          {
            k: 'calc',
            steps: [
              {
                desc: 'Rumus empiris untuk air (SI)',
                lhs: 'h_{f,HW}',
                expr: '\\frac{10.67 L Q^{1.852}}{C^{1.852} D^{4.87}}',
                subst: `\\frac{10.67 × ${fx(r.Lp, 1)} × ${fq(r.Q, 4)}^{1.852}}{${fx(r.C, 0)}^{1.852} × ${D}^{4.87}}`,
                value: fx(r.hfHW, 3),
                unit: 'm',
              },
              { lhs: 'Δ', expr: '\\frac{h_{f,HW} − h_{f}}{h_{f}}', subst: `\\frac{${fx(r.hfHW, 3)} − ${fx(r.hf, 3)}}{${fx(r.hf, 3)}}`, value: `${r.diffHW >= 0 ? '+' : ''}${fx(r.diffHW, 1)}`, unit: '%' },
            ],
          },
        ],
      },
    ],
    warnings: r.warn,
    scope: [
      'Satu ruas pipa bertekanan penuh, aliran tetap, fluida air (ν bawaan 1,004 × 10^{−6} m²/s ≈ 20 °C). Darcy–Weisbach berlaku umum; Hazen–Williams hanya pembanding empiris untuk air.',
      'Belum termasuk: jaringan pipa (Hardy-Cross), pompa & kurva operasi, beda elevasi/tekanan sisa, water hammer. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildPipeReport(i: PipeUIInput): Report | null {
  const r = computePipeUI(i)
  return r ? pipeReport(r) : null
}

export default {
  defaults: PIPE_DEFAULTS,
  build: (i: PipeUIInput) => buildPipeReport(i) ?? { title: 'Aliran Pipa (Tertutup)', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
