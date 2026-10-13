// Solver balok menerus (analisis elastis sebenarnya) di atas solver rangka bidang `frame2d` — tiap bentang dibagi
// beberapa elemen sehingga kekakuan EI boleh bervariasi sepanjang bentang (pengaruh retak). Dipakai Balok Menerus &
// Pelat Satu Arah; dirancang agar bisa dipakai tool analisis lain (beban merata per bentang, tumpuan sendi, ujung
// sendi/jepit). Satuan: mm, N, N·mm. Konvensi hasil: momen sagging (+), geser positif di ujung kiri bentang bila
// beban gravitasi, lendutan ke bawah (+).

import { analyzeFrame, hermiteV, type FrameMember } from './frame2d'

export interface BeamModel {
  /** Bentang as–as (mm). */
  spans: number[]
  /** Jumlah elemen tiap bentang. */
  nEl: number
  /** Rotasi tertahan di ujung kiri / kanan (jepit). */
  fixedL: boolean
  fixedR: boolean
}

export interface BeamElementResult {
  span: number
  /** Posisi awal elemen dari ujung kiri balok (mm) & panjangnya. */
  x0: number
  L: number
  /** Titik sampel (mm dari awal elemen), momen (N·mm), geser (N). */
  xs: number[]
  Ms: number[]
  Vs: number[]
}

export interface BeamSolution {
  els: BeamElementResult[]
  /** Titik lendutan (mm dari ujung kiri): ujung elemen & tengah elemen; lendutan ke bawah (mm). */
  dx: number[]
  dy: number[]
}

interface Member extends FrameMember { span: number }

/** Jumlah elemen total & indeks simpul tumpuan. */
export const supportNodes = (m: BeamModel): number[] => [0, ...m.spans.map((_, i) => (i + 1) * m.nEl)]

/**
 * Selesaikan satu kasus beban. EI: kekakuan lentur tiap elemen (N·mm², urut bentang demi bentang);
 * w: beban merata ke bawah tiap bentang (N/mm). null bila struktur tak stabil.
 */
export function solveBeam(model: BeamModel, EI: readonly number[], w: readonly number[]): BeamSolution | null {
  const { spans, nEl } = model
  const nNode = spans.length * nEl + 1
  const elems: Member[] = []
  let xAcc = 0
  const xNode: number[] = [0]
  spans.forEach((L, s) => {
    const le = L / nEl
    for (let e = 0; e < nEl; e++) {
      const k = s * nEl + e
      elems.push({ ni: k, nj: k + 1, sec: { A: 1, I: 1, S: 0, E: EI[k] }, wx: 0, wy: -w[s], L: le, cx: 1, cy: 0, span: s })
      xNode.push(xAcc + (e + 1) * le)
    }
    xAcc += L
  })
  const fixed: number[] = [0]
  for (const j of supportNodes(model)) fixed.push(3 * j + 1)
  if (model.fixedL) fixed.push(2)
  if (model.fixedR) fixed.push(3 * (nNode - 1) + 2)
  const F = Array.from({ length: 3 * nNode }, () => 0)
  const res = analyzeFrame(elems, 3 * nNode, F, fixed, () => [])
  if (!res) return null

  const els: BeamElementResult[] = []
  const dx: number[] = [], dy: number[] = []
  elems.forEach((e, k) => {
    // analyzeFrame: V = −(gaya ujung kiri + beban) → balik tanda agar gravitasi memberi V(+) di ujung kiri bentang.
    els.push({ span: e.span, x0: xNode[k], L: e.L as number, xs: e.xs as number[], Ms: e.Ms as number[], Vs: (e.Vs as number[]).map((v) => -v) })
    const dl = e.dloc as number[]
    for (const t of [0, 0.5]) {
      dx.push(xNode[k] + t * (e.L as number))
      dy.push(-hermiteV(dl, e.L as number, t))
    }
    if (k === elems.length - 1) {
      dx.push(xNode[k + 1])
      dy.push(-hermiteV(dl, e.L as number, 1))
    }
  })
  return { els, dx, dy }
}

export interface BeamEnvelope {
  /** Titik sampel gabungan (mm), amplop momen (N·mm) & geser (N). */
  x: number[]
  Mmax: number[]
  Mmin: number[]
  Vmax: number[]
  Vmin: number[]
}

/** Amplop beberapa kasus beban (titik sampel identik antar kasus). */
export function envelope(sols: readonly BeamSolution[]): BeamEnvelope {
  const x: number[] = [], Mmax: number[] = [], Mmin: number[] = [], Vmax: number[] = [], Vmin: number[] = []
  sols[0].els.forEach((el, k) => {
    el.xs.forEach((xs, p) => {
      x.push(el.x0 + xs)
      let hiM = -Infinity, loM = Infinity, hiV = -Infinity, loV = Infinity
      for (const s of sols) {
        const m = s.els[k].Ms[p], v = s.els[k].Vs[p]
        if (m > hiM) hiM = m
        if (m < loM) loM = m
        if (v > hiV) hiV = v
        if (v < loV) loV = v
      }
      Mmax.push(hiM); Mmin.push(loM); Vmax.push(hiV); Vmin.push(loV)
    })
  })
  return { x, Mmax, Mmin, Vmax, Vmin }
}
