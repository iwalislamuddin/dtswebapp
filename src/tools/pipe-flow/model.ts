import { computePipeFlow, PIPE_MATERIALS, type PipeFlowInput, type PipeFlowResult } from '../../calc/pipe-flow'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Aliran Pipa (Darcy–Weisbach + Hazen–Williams): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah — bidang turunan pasti terisi. */
export type PipeOk = PipeFlowResult & {
  valid: true; A: number; V: number; Re: number; regime: 'laminar' | 'transisi' | 'turbulen'; f: number
  hv: number; hf: number; hm: number; hTot: number; gradient: number; hfHW: number; diffHW: number
}

export interface PipeUIInput {
  /** Diameter dalam (mm), panjang (m), debit (L/s). */
  D: string
  Lp: string
  Q: string
  /** Kunci PIPE_MATERIALS atau 'custom'. */
  mat: string
  /** Kustom: kekasaran ε (mm), C Hazen–Williams. */
  eps: string
  C: string
  /** Viskositas kinematik (×10⁻⁶ m²/s). */
  nu: string
  /** Jumlah koefisien kehilangan minor. */
  sumK: string
}

/** Input bawaan = kasus golden default (PVC Ø100, L 200 m, Q 10 L/s). */
export const PIPE_DEFAULTS: PipeUIInput = { D: '100', Lp: '200', Q: '10', mat: 'pvc', eps: '0.0015', C: '150', nu: '1.004', sumK: '2' }

export const MAT_KEYS = Object.keys(PIPE_MATERIALS)

export function validate(i: PipeUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  for (const k of ['D', 'Lp', 'Q', 'nu'] as const) need(k, pos)
  need('sumK', nonneg)
  if (i.mat === 'custom') {
    need('eps', nonneg)
    need('C', pos)
  }
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: PipeUIInput): PipeFlowInput {
  return { D: num(i.D), Lp: num(i.Lp), Q: num(i.Q), mat: i.mat, eps: num(i.eps), C: num(i.C), nu: num(i.nu), sumK: num(i.sumK) }
}

/** Hitung; null bila input tidak valid. */
export function computePipeUI(i: PipeUIInput): PipeOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computePipeFlow(toCalcInput(i))
  return r.valid ? (r as PipeOk) : null
}

/** Hitung ulang dengan debit lain (m³/s) — mesin hitung yang sama, satuan masukan mm / L/s. */
function atQ(r: PipeOk, Q: number): PipeOk {
  return computePipeFlow({ D: r.D * 1000, Lp: r.Lp, Q: Q * 1000, mat: r.mat, eps: r.eps * 1000, C: r.C, nu: r.nu * 1e6, sumK: r.sumK }) as PipeOk
}

/** Kurva sistem: hf Darcy, hf + hm, dan hf Hazen–Williams terhadap Q (L/s), Q = 0 … 2·Q hasil. */
export function systemCurve(r: PipeOk, n = 40) {
  const Qs: number[] = [], hf: number[] = [], hTot: number[] = [], hw: number[] = []
  for (let k = 0; k <= n; k++) {
    const Q = (2 * r.Q * k) / n
    Qs.push(Q * 1000)
    if (k === 0) { hf.push(0); hTot.push(0); hw.push(0); continue }
    const s = atQ(r, Q)
    hf.push(s.hf); hTot.push(s.hTot); hw.push(s.hfHW)
  }
  return { Q: Qs, hf, hTot, hw }
}

/** Diagram Moody untuk ε/D pipa ini: f(Re), Re = 10³ … 10⁸ (log), + pembanding pipa licin (ε = 0). */
export function moodyCurve(r: PipeOk, n = 60) {
  const Re: number[] = [], f: number[] = [], smooth: number[] = []
  for (let k = 0; k <= n; k++) {
    const re = Math.pow(10, 3 + (5 * k) / n)
    const Q = (re * r.nu * r.A) / r.D
    Re.push(re)
    f.push(atQ(r, Q).f)
    smooth.push(atQ({ ...r, mat: 'custom', eps: 0 }, Q).f)
  }
  return { Re, f, smooth }
}
