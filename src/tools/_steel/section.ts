import type { SteelProfile } from '../../calc/shared/steel-profiles'
import type { FigColor, FigOp } from '../../report/model'

// Geometri penampang profil baja (mm, origin kiri-atas, y ke bawah) — satu sumber untuk SVG di UI dan gambar laporan.
// Tiap cincin = kontur luar + kontur dalam opsional (berlubang: SHS/RHS/pipa). Isian digambar sebagai satu poligon
// luar→dalam terbalik (aturan nonzero membuat lubang), garis tepi digambar terpisah agar sambungan tak terlihat.

export type Pt = [number, number]

export interface SectionGeom {
  /** Lebar & tinggi kotak batas (mm). */
  w: number
  h: number
  rings: { outer: Pt[]; inner?: Pt[] }[]
}

const circle = (cx: number, cy: number, r: number, n = 48): Pt[] =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Pt)

export function sectionGeom(p: SteelProfile): SectionGeom | null {
  const H = p.H ?? 0, B = p.B ?? 0, t = p.t
  switch (p.shape) {
    case 'I': {
      const tw = p.tw!, tf = p.tf!, x1 = (B - tw) / 2, x2 = (B + tw) / 2
      return {
        w: B, h: H,
        rings: [{ outer: [[0, 0], [B, 0], [B, tf], [x2, tf], [x2, H - tf], [B, H - tf], [B, H], [0, H], [0, H - tf], [x1, H - tf], [x1, tf], [0, tf]] }],
      }
    }
    case 'C': {
      if (p.C !== undefined) {
        // CNP berbibir, tebal seragam t
        const C = p.C
        return {
          w: B, h: H,
          rings: [{ outer: [[0, 0], [B, 0], [B, C], [B - t, C], [B - t, t], [t, t], [t, H - t], [B - t, H - t], [B - t, H - C], [B, H - C], [B, H], [0, H]] }],
        }
      }
      const tw = p.tw!, tf = p.tf!
      return { w: B, h: H, rings: [{ outer: [[0, 0], [B, 0], [B, tf], [tw, tf], [tw, H - tf], [B, H - tf], [B, H], [0, H]] }] }
    }
    case 'L': {
      const a = p.a!
      return { w: a, h: a, rings: [{ outer: [[0, 0], [t, 0], [t, a - t], [a, a - t], [a, a], [0, a]] }] }
    }
    case 'box':
      return { w: B, h: H, rings: [{ outer: [[0, 0], [B, 0], [B, H], [0, H]], inner: [[t, t], [B - t, t], [B - t, H - t], [t, H - t]] }] }
    case 'pipe': {
      const D = p.D!
      return { w: D, h: D, rings: [{ outer: circle(D / 2, D / 2, D / 2), inner: circle(D / 2, D / 2, D / 2 - t) }] }
    }
  }
  return null
}

/** Poligon isian (nonzero): kontur luar lalu kontur dalam terbalik. */
export const fillPts = (ring: { outer: Pt[]; inner?: Pt[] }): Pt[] =>
  ring.inner ? [...ring.outer, ring.outer[0], ...[...ring.inner].reverse(), ring.inner[ring.inner.length - 1]] : ring.outer

/** Gambar penampang ke operasi gambar laporan, diskalakan ke kotak (x, y, maks w×h pt). Mengembalikan skala & posisi. */
export function sectionOps(ops: FigOp[], g: SectionGeom, x: number, y: number, maxW: number, maxH: number, c: FigColor = 'support') {
  const sc = Math.min(maxW / g.w, maxH / g.h)
  const ox = x + (maxW - g.w * sc) / 2, oy = y + (maxH - g.h * sc) / 2
  const T = (pts: Pt[]): [number, number][] => pts.map(([px, py]) => [ox + px * sc, oy + py * sc])
  for (const ring of g.rings) {
    ops.push({ t: 'poly', pts: T(fillPts(ring)), fill: true, c, op: 0.22 })
    ops.push({ t: 'poly', pts: T(ring.outer), close: true, lw: 0.9, c: 'ink' })
    if (ring.inner) ops.push({ t: 'poly', pts: T(ring.inner), close: true, lw: 0.9, c: 'ink' })
  }
  return { sc, ox, oy, W: g.w * sc, H: g.h * sc }
}
