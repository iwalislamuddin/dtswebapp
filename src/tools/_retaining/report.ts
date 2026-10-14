import { figRows, dimH, dimV } from '../../report/figure'
import { check, fx, kv, type Block, type FigOp, type Figure, type Section } from '../../report/model'
import { basePressures, geomOf, wallPolys, type Pt, type WallStab } from './common'

// Bagian laporan bersama dinding penahan tanah: gambar penampang + stabilitas layan (tekanan aktif, guling, geser,
// tekanan dasar). Dipakai laporan DPT Batu Kali dan DPT Beton Kantilever.

/** Gambar penampang dinding dengan urugan, tanah depan, tekanan dasar dan gaya aktif. */
export function figWall(r: WallStab, caption: string, extra?: (ops: FigOp[], X: (x: number) => number, Y: (y: number) => number, sc: number) => void): Figure {
  const g = geomOf(r)
  const P = wallPolys(g)
  const ops: FigOp[] = []
  const hTot = P.yTopSoil + 0.3
  const sc = Math.min(300 / (g.B + 1.6), 170 / hTot)
  const x0 = 130, yBase = 18 + hTot * sc
  const X = (x: number) => x0 + x * sc
  const Y = (y: number) => yBase - y * sc
  const poly = (pts: Pt[], c: 'support' | 'm' | 'muted' | 'ink', op: number) => {
    const q = pts.map(([x, y]) => [X(x), Y(y)] as Pt)
    ops.push({ t: 'poly', pts: q, close: true, fill: true, c, op })
    ops.push({ t: 'poly', pts: q, close: true, lw: 0.8, c })
  }
  poly(P.front, 'muted', 0.18)
  poly(P.back, 'm', 0.16)
  poly(P.foot, 'support', 0.22)
  poly(P.stem, 'support', 0.32)
  // muka urugan sampai bidang semu & beban merata
  if (r.q! > 0) {
    const xa = P.xTopBack, xb = g.B
    const yq = Y(g.tf + g.H) - 12
    ops.push({ t: 'line', x1: X(xa), y1: yq, x2: X(xb), y2: yq, lw: 0.8, c: 'load' })
    for (let k = 0; k <= 4; k++) {
      const x = X(xa + ((xb - xa) * k) / 4)
      ops.push({ t: 'line', x1: x, y1: yq, x2: x, y2: yq + 8, lw: 0.8, c: 'load' })
    }
    ops.push({ t: 'text', x: X(xa) , y: yq - 3, s: `q = ${fx(r.q, 0)} kPa`, size: 6.5, c: 'load' })
  }
  // tekanan dasar (layan)
  const bp = basePressures(r)
  const maxQ = Math.min(Number.isFinite(bp.max) ? bp.max : 1, 1e9)
  const qh = 26
  const yb = Y(0)
  const qs = (v: number) => (maxQ > 0 ? (v / maxQ) * qh : 0)
  if (Number.isFinite(bp.max) && bp.max > 0) {
    const pts: Pt[] = [[X(0), yb], [X(g.B), yb], [X(g.B), yb + qs(bp.heel)], [X(0), yb + qs(bp.toe)]]
    ops.push({ t: 'poly', pts, close: true, fill: true, c: 'y', op: 0.3 })
    ops.push({ t: 'poly', pts, close: true, lw: 0.7, c: 'y' })
    ops.push({ t: 'text', x: X(0) - 3, y: yb + qs(bp.toe) + 3, s: `${fx(bp.toe, 1)}`, size: 6.5, align: 'r', c: 'y' })
    ops.push({ t: 'text', x: X(g.B) + 3, y: yb + qs(bp.heel) + 3, s: `${fx(bp.heel, 1)}`, size: 6.5, c: 'y' })
  }
  // gaya aktif horizontal
  const yPa = Y(r.yPa!), yPq = Y(r.yPq!)
  ops.push({ t: 'line', x1: X(g.B) + 22, y1: yPa, x2: X(g.B) + 4, y2: yPa, lw: 1.4, c: 'bad' })
  ops.push({ t: 'poly', pts: [[X(g.B) + 4, yPa], [X(g.B) + 9, yPa - 2.5], [X(g.B) + 9, yPa + 2.5]], close: true, fill: true, c: 'bad' })
  ops.push({ t: 'text', x: X(g.B) + 24, y: yPa + 2.5, s: `Pa,h = ${fx(r.Pah, 1)}`, size: 6.5, c: 'bad' })
  if (r.q! > 0) {
    ops.push({ t: 'line', x1: X(g.B) + 22, y1: yPq, x2: X(g.B) + 4, y2: yPq, lw: 1.1, c: 'load' })
    ops.push({ t: 'text', x: X(g.B) + 24, y: yPq + 2.5, s: `Pq,h = ${fx(r.Pqh, 1)}`, size: 6.5, c: 'load' })
  }
  dimH(ops, X(0), X(g.B), yb + qh + 12, `B = ${fx(g.B, 2)} m`)
  dimV(ops, Y(g.tf + g.H), yb, X(0) - 34, '')
  ops.push({ t: 'text', x: X(0) - 38, y: (Y(g.tf + g.H) + yb) / 2 + 3, s: `H + t = ${fx(g.H + g.tf, 2)} m`, size: 7, align: 'r' })
  extra?.(ops, X, Y, sc)
  return { h: figRows(yb + qh + 22), ops, alt: 'Penampang dinding penahan tanah dengan tekanan dasar', caption }
}

const kpa = (n: number) => (Number.isFinite(n) ? fx(n, 1) : '∞')

/** Tiga bagian stabilitas layan: tekanan aktif, guling, geser & tekanan dasar. */
export function stabilitySections(r: WallStab, concrete: boolean): Section[] {
  const D2R = Math.PI / 180
  const t = Math.tan(r.beta! * D2R)
  const g1 = fx(r.g1, 1)
  const active: Section = {
    title: 'Tekanan tanah aktif (Rankine)',
    blocks: [
      {
        k: 'p',
        text: 'Tekanan aktif Rankine bekerja pada bidang vertikal semu di ujung heel (urugan granular, c = 0); komponen vertikal Pa sinβ dihitung sebagai penahan.',
      },
      {
        k: 'calc',
        steps: [
          { lhs: 'K_{a}', expr: 'cosβ · \\frac{cosβ − √(cos^{2}β − cos^{2}φ)}{cosβ + √(cos^{2}β − cos^{2}φ)}', subst: `φ = ${fx(r.phi1, 1)}°, β = ${fx(r.beta, 1)}°`, value: fx(r.Ka, 4) },
          { desc: `Lebar urugan di atas badan/heel w_{s} = ${fx(r.ws, 3)} m`, lhs: "H'", expr: 'H + t + w_{s} tanβ', subst: `${fx(r.H, 2)} + ${fx(r.tf, 2)} + ${fx(r.ws, 3)} × ${fx(t, 4)}`, value: fx(r.Hp, 3), unit: 'm' },
          { lhs: 'P_{a}', expr: "½ K_{a} γ H'^{2}", subst: `½ × ${fx(r.Ka, 4)} × ${g1} × ${fx(r.Hp, 3)}^{2}`, value: fx(r.Pa, 2), unit: 'kN/m' },
          ...(r.q! > 0 ? [{ lhs: 'P_{q}', expr: "K_{a} q H'", subst: `${fx(r.Ka, 4)} × ${fx(r.q, 1)} × ${fx(r.Hp, 3)}`, value: fx(r.Pq, 2), unit: 'kN/m' }] : []),
          { lhs: 'P_{a,h} / P_{a,v}', expr: 'P_{a} cosβ / P_{a} sinβ', value: `${fx(r.Pah, 2)} / ${fx(r.Pav, 2)}`, unit: 'kN/m' },
          ...(r.q! > 0 ? [{ lhs: 'P_{q,h} / P_{q,v}', expr: 'P_{q} cosβ / P_{q} sinβ', value: `${fx(r.Pqh, 2)} / ${fx(r.Pqv, 2)}`, unit: 'kN/m' }] : []),
          { lhs: 'y_{Pa} / y_{Pq}', expr: "H'/3 / H'/2", value: `${fx(r.yPa, 3)} / ${fx(r.yPq, 3)}`, unit: 'm' },
        ],
      },
    ],
  }
  const wRows = r.parts!.map((p) => [p.nm, fx(p.W, 2), fx(p.x, 3), fx(p.W * p.x, 2)])
  wRows.push(['Σ berat', fx(r.sumW, 2), '', fx(r.parts!.reduce((a, p) => a + p.W * p.x, 0), 2)])
  const overturning: Section = {
    title: 'Guling terhadap toe',
    blocks: [
      {
        k: 'table',
        head: ['Komponen berat', 'W (kN/m)', 'Lengan x (m)', 'W·x (kN·m/m)'],
        align: ['l', 'r', 'r', 'r'],
        rows: wRows,
        caption: concrete ? 'Lengan x diukur dari ujung toe; beton dan tanah di atas heel/miring diperhitungkan.' : 'Lengan x diukur dari ujung toe.',
      },
      {
        k: 'calc',
        steps: [
          { lhs: 'ΣV', expr: 'ΣW + P_{a,v} + P_{q,v}', subst: `${fx(r.sumW, 2)} + ${fx(r.Pav, 2)} + ${fx(r.Pqv, 2)}`, value: fx(r.sumV, 2), unit: 'kN/m' },
          { lhs: 'M_{r}', expr: 'Σ W x + (P_{a,v} + P_{q,v}) B', value: fx(r.Mr, 2), unit: 'kN·m/m' },
          { lhs: 'M_{o}', expr: 'P_{a,h} y_{Pa} + P_{q,h} y_{Pq}', subst: `${fx(r.Pah, 2)} × ${fx(r.yPa, 3)} + ${fx(r.Pqh, 2)} × ${fx(r.yPq, 3)}`, value: fx(r.Mo, 2), unit: 'kN·m/m' },
          { lhs: 'FS_{guling}', expr: '\\frac{M_{r}}{M_{o}}', subst: `\\frac{${fx(r.Mr, 2)}}{${fx(r.Mo, 2)}}`, value: fx(r.FSot, 2), unit: `(≥ ${fx(r.FSotT, 1)})` },
        ],
      },
      { k: 'rows', rows: [check(`FS min ${fx(r.FSotT, 1)} / FS guling`, r.FSotT! / r.FSot!)] },
    ],
  }
  const bp = basePressures(r)
  const tanK = Math.tan(r.kf! * r.phi2! * D2R)
  const slide: Section = {
    title: 'Geser & daya dukung dasar',
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'F_{r}', expr: 'ΣV tan(k φ_{2}) + k c_{2} B', subst: `${fx(r.sumV, 2)} × ${fx(tanK, 4)} + ${fx(r.kf, 2)} × ${fx(r.c2, 1)} × ${fx(r.B, 2)}`, value: fx(r.Fr, 2), unit: 'kN/m' },
          ...(r.usePp
            ? [
                { lhs: 'K_{p}', expr: 'tan^{2}(45° + φ_{2}/2)', value: fx(r.Kp, 3) },
                { lhs: 'P_{p}', expr: '½ K_{p} γ_{2} D^{2} + 2 c_{2} √K_{p} D', value: fx(r.Pp, 2), unit: 'kN/m' },
              ]
            : []),
          { lhs: 'ΣH', expr: 'P_{a,h} + P_{q,h}', value: fx(r.Ph, 2), unit: 'kN/m' },
          { lhs: 'FS_{geser}', expr: r.usePp ? '\\frac{F_{r} + P_{p}}{ΣH}' : '\\frac{F_{r}}{ΣH}', subst: `\\frac{${fx(r.FrTot, 2)}}{${fx(r.Ph, 2)}}`, value: fx(r.FSsl, 2), unit: `(≥ ${fx(r.FSslT, 1)})` },
          { lhs: 'x̄', expr: '\\frac{M_{r} − M_{o}}{ΣV}', subst: `\\frac{${fx(r.Mr, 2)} − ${fx(r.Mo, 2)}}{${fx(r.sumV, 2)}}`, value: fx(r.xbar, 3), unit: 'm dari toe' },
          { lhs: 'e', expr: '\\frac{B}{2} − x̄', value: fx(r.e, 3), unit: `m (inti tengah B/6 = ${fx(r.B! / 6, 3)} m)` },
          { desc: r.tri ? 'Resultan di luar inti tengah → distribusi segitiga' : 'Resultan di dalam inti tengah → trapesium', lhs: 'q_{toe} / q_{heel}', expr: r.tri ? '\\frac{2ΣV}{3 · lengan\\ kontak}' : '\\frac{ΣV}{B}(1 ± \\frac{6e}{B})', value: `${kpa(bp.toe)} / ${kpa(bp.heel)}`, unit: 'kPa' },
        ],
      },
      {
        k: 'rows',
        rows: [
          check(`FS min ${fx(r.FSslT, 1)} / FS geser`, r.FSslT! / r.FSsl!),
          check('|e| / (B/6)', Math.abs(r.e!) / (r.B! / 6)),
          ...(r.qall! > 0 ? [check(`q_{maks} / q_{izin} (${fx(r.qall, 0)} kPa)`, bp.max / r.qall!)] : [kv('Daya dukung', 'q_{izin} tidak diisi — dilewati')]),
        ],
      },
    ],
  }
  return [active, overturning, slide]
}

export type { Block }
