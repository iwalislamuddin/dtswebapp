import type { Classification, FlexureState, SteelFlexureResult } from '../../calc/steel-flexure'
import { E_STEEL } from '../../calc/shared/steel'
import { capacityFigure, figRows } from '../../report/figure'
import { check, fx, kv, sci, type Block, type CalcStep, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { profileRows } from '../_steel/profile'
import { sectionGeom, sectionOps } from '../_steel/section'
import { computeFlexure, FLEXURE_DEFAULTS, mnCurve, type FlexureInput } from './model'

// Laporan Balok Baja Lentur (SNI 1729:2020 Bab F, DFBK & ASD): properti, klasifikasi (Tabel B4.1b), leleh, tekuk
// torsi-lateral, tekuk lokal sesuai pasal (F2/F3, F6, F7, F8), kekuatan desain — dengan rumus dan substitusi.

export { FLEXURE_DEFAULTS }

const kNm = (Nmm: number | undefined, dp = 2) => fx((Nmm ?? 0) / 1e6, dp)
const CLS: Record<string, string> = { kompak: 'Kompak', nonkompak: 'Nonkompak', langsing: 'Langsing' }

/** Gbr. 1 — penampang dengan sumbu lentur. */
function figSection(r: SteelFlexureResult): Figure {
  const ops: FigOp[] = []
  const p = r.p!
  const s = sectionOps(ops, sectionGeom(p)!, 170, 14, 180, 130)
  const cx = s.ox + s.W / 2, cy = s.oy + s.H / 2
  if (r.axis === 'y') {
    ops.push({ t: 'line', x1: cx, y1: s.oy - 12, x2: cx, y2: s.oy + s.H + 12, lw: 0.9, c: 'm', dash: [5, 2, 1, 2] })
    ops.push({ t: 'text', x: cx + 4, y: s.oy - 4, s: 'sumbu lentur y-y', size: 7, c: 'm' })
  } else {
    ops.push({ t: 'line', x1: s.ox - 22, y1: cy, x2: s.ox + s.W + 22, y2: cy, lw: 0.9, c: 'm', dash: [5, 2, 1, 2] })
    ops.push({ t: 'text', x: s.ox + s.W + 26, y: cy + 3, s: 'sumbu lentur x-x', size: 7, c: 'm' })
  }
  return { h: figRows(s.oy + s.H + 18), ops, alt: 'Penampang dan sumbu lentur', caption: `Gbr. 1 — Penampang ${p.name}, lentur terhadap sumbu ${r.axis === 'y' ? 'lemah y-y' : 'kuat x-x'}.` }
}

/** Gbr. 2 — kurva Mn terhadap Lb dan titik desain (bila LTB ditinjau). */
function figCurve(i: FlexureInput, r: SteelFlexureResult): Figure {
  const f = r.f!
  const ops: FigOp[] = []
  const LbMax = Math.max(1.3 * (f.Lr ?? 0), 1.2 * (f.Lb ?? 0), 1000)
  const pts = mnCurve(i, LbMax, 90)
  const Mp = r.Mp!
  const x0 = 70, x1 = 470, y0 = 14, y1 = 140
  const X = (lb: number) => x0 + (lb / LbMax) * (x1 - x0)
  const Y = (m: number) => y1 - (m / (Mp * 1.05)) * (y1 - y0)
  for (const k of [0, 0.25, 0.5, 0.75, 1]) {
    ops.push({ t: 'line', x1: x0, y1: Y(k * Mp), x2: x1, y2: Y(k * Mp), lw: 0.3, c: 'grid' })
    ops.push({ t: 'text', x: x0 - 4, y: Y(k * Mp) + 2.5, s: fx(0.9 * k * Mp, 0), size: 6.5, align: 'r', c: 'muted' })
  }
  ops.push({ t: 'poly', pts: pts.map(([lb, m]) => [X(lb), Y(m)]), lw: 1.3, c: 'm' })
  for (const [L, lab] of [[f.Lp!, 'L_{p}'], [f.Lr!, 'L_{r}']] as const) {
    if (!(L > 0) || L > LbMax) continue
    ops.push({ t: 'line', x1: X(L), y1: y0, x2: X(L), y2: y1, lw: 0.6, c: 'muted', dash: [3, 2] })
    ops.push({ t: 'text', x: X(L) + 3, y: y1 - 4, s: `${lab} = ${fx(L / 1000, 2)} m`, size: 6.5, c: 'muted' })
  }
  ops.push({ t: 'circle', cx: X(f.Lb!), cy: Y(r.Mn!), r: 3, fill: true, c: 'load' })
  ops.push({ t: 'text', x: X(f.Lb!) + 6, y: Y(r.Mn!) - 5, s: `φ_{b}M_{n} = ${fx(r.phiMn, 1)} kN·m`, size: 7, bold: true, c: 'ink' })
  ops.push({ t: 'line', x1: x0, y1: y1, x2: x1, y2: y1, lw: 0.6, c: 'muted' })
  ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y1, lw: 0.6, c: 'muted' })
  const step = LbMax <= 6000 ? 1000 : LbMax <= 15000 ? 2000 : 5000
  for (let lb = 0; lb <= LbMax + 1; lb += step) ops.push({ t: 'text', x: X(lb), y: y1 + 10, s: String(lb / 1000), size: 6.5, align: 'c', c: 'muted' })
  ops.push({ t: 'text', x: x1, y: y1 + 21, s: 'L_{b} (m)', size: 6.5, align: 'r', c: 'muted' })
  ops.push({ t: 'text', x: x0 - 4, y: y0 - 4, s: 'φ_{b}M_{n} (kN·m)', size: 6.5, align: 'r', c: 'muted' })
  return {
    h: figRows(y1 + 26),
    ops,
    alt: 'Kurva kekuatan lentur terhadap panjang tak-terkekang',
    caption: `Gbr. 2 — Kekuatan lentur rencana φ_{b}M_{n} terhadap panjang tak-terkekang L_{b} (C_{b} = ${fx(f.Cb, 2)}), termasuk batas tekuk lokal; titik = desain.`,
  }
}

function classTable(rows: [string, Classification][]): Block {
  return {
    k: 'table',
    head: ['Elemen', 'λ', 'λ_{p}', 'λ_{r}', 'Klasifikasi'],
    align: ['l', 'r', 'r', 'r', 'l'],
    rows: rows.map(([el, c]) => [el, fx(c.lam, 2), fx(c.lp, 2), fx(c.lr, 2), CLS[c.cls]]),
  }
}

/** Langkah LTB (F2 atau F7.4). */
function ltbSteps(f: FlexureState, box: boolean, Ag = 0): CalcStep[] {
  const Fy = f.Fy, Cb = fx(f.Cb, 2)
  const S = box ? f.S! : f.Sx!
  const s: CalcStep[] = []
  if (box) {
    const JA = `√(${sci(f.J!)} × ${fx(Ag, 0)})`
    s.push(
      { lhs: 'L_{p}', expr: '\\frac{0.13 E r_{y} √(JA_{g})}{M_{p}}', subst: `\\frac{0.13 × ${fx(E_STEEL, 0)} × ${fx(f.ry, 1)} × ${JA}}{${kNm(f.Mp)}×10^{6}}`, value: fx(f.Lp, 0), unit: 'mm', ref: 'F7-12' },
      { lhs: 'L_{r}', expr: '\\frac{2 E r_{y} √(JA_{g})}{0.7F_{y}S_{x}}', subst: `\\frac{2 × ${fx(E_STEEL, 0)} × ${fx(f.ry, 1)} × ${JA}}{0.7 × ${fx(Fy, 0)} × ${sci(S)}}`, value: fx(f.Lr, 0), unit: 'mm', ref: 'F7-13' },
    )
  } else {
    s.push(
      { lhs: 'L_{p}', expr: '1.76 r_{y} √(\\frac{E}{F_{y}})', subst: `1.76 × ${fx(f.ry, 1)} × √(\\frac{${fx(E_STEEL, 0)}}{${fx(Fy, 0)}})`, value: fx(f.Lp, 0), unit: 'mm', ref: 'F2-5' },
      {
        lhs: '\\frac{Jc}{S_{x}h_{o}}',
        subst: `\\frac{${sci(f.J!)} × ${fx(f.c, 3)}}{${sci(S)} × ${fx(f.ho, 1)}}`,
        value: sci((f.J! * f.c!) / (S * f.ho!), 4),
      },
      {
        lhs: 'L_{r}',
        expr: '1.95 r_{ts} \\frac{E}{0.7F_{y}} √(\\frac{Jc}{S_{x}h_{o}} + √((\\frac{Jc}{S_{x}h_{o}})^{2} + 6.76(\\frac{0.7F_{y}}{E})^{2}))',
        value: fx(f.Lr, 0),
        unit: 'mm',
        ref: 'F2-6',
      },
    )
  }
  const Lb = fx(f.Lb, 0)
  if (f.Lb! <= f.Lp!) s.push({ desc: `L_{b} = ${Lb} ≤ L_{p} — tidak terjadi tekuk torsi-lateral`, lhs: 'M_{n,LTB}', expr: 'M_{p}', value: kNm(f.Mn_ltb), unit: 'kN·m' })
  else if (f.Lb! <= f.Lr!)
    s.push({
      desc: `L_{p} < L_{b} = ${Lb} ≤ L_{r} — LTB inelastis`,
      lhs: 'M_{n,LTB}',
      expr: `C_{b}[M_{p} − (M_{p} − 0.7F_{y}S_{x})\\frac{L_{b} − L_{p}}{L_{r} − L_{p}}] ≤ M_{p}`,
      subst: `${Cb} × [${kNm(f.Mp)} − (${kNm(f.Mp)} − ${kNm(0.7 * Fy * S)}) × \\frac{${Lb} − ${fx(f.Lp, 0)}}{${fx(f.Lr, 0)} − ${fx(f.Lp, 0)}}]`,
      value: kNm(f.Mn_ltb),
      unit: 'kN·m',
      ref: box ? 'F7-10' : 'F2-2',
    })
  else if (box)
    s.push({
      desc: `L_{b} = ${Lb} > L_{r} — LTB elastis`,
      lhs: 'M_{n,LTB}',
      expr: '\\frac{2EC_{b}√(JA_{g})}{L_{b}/r_{y}} ≤ M_{p}',
      value: kNm(f.Mn_ltb),
      unit: 'kN·m',
      ref: 'F7-11',
    })
  else
    s.push({
      desc: `L_{b} = ${Lb} > L_{r} — LTB elastis, F_{cr} = \\frac{C_{b}π^{2}E}{(L_{b}/r_{ts})^{2}}√(1 + 0.078\\frac{Jc}{S_{x}h_{o}}(\\frac{L_{b}}{r_{ts}})^{2}) (F2-4)`,
      lhs: 'M_{n,LTB}',
      expr: 'F_{cr} S_{x} ≤ M_{p}',
      subst: `${fx(f.Mn_ltb! / S, 1)} × ${sci(S)} / 10^{6}`,
      value: kNm(f.Mn_ltb),
      unit: 'kN·m',
      ref: 'F2-3',
    })
  return s
}

/** Bagian per pasal. */
function clauseSections(r: SteelFlexureResult, i: FlexureInput): Section[] {
  const f = r.f!
  const Fy = fx(f.Fy, 0)
  const sec: Section[] = []
  if (f.section === 'F2/F3' || f.section === 'F2') {
    sec.push({
      title: 'Properti penampang (sumbu kuat)',
      blocks: [
        { k: 'p', text: 'Z_{x}, J, C_{w} dihitung dari geometri (dinding tipis tanpa fillet → J konservatif); S_{x} dari tabel.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'Z_{x}', expr: 'Bt_{f}(H − t_{f}) + \\frac{t_{w}(H − 2t_{f})^{2}}{4}', value: sci(f.Zx!), unit: 'mm^{3}' },
            { lhs: 'S_{x}', value: sci(f.Sx!), unit: 'mm^{3}' },
            { lhs: 'J', expr: '\\frac{2Bt_{f}^{3} + (H − 2t_{f})t_{w}^{3}}{3}', value: sci(f.J!), unit: 'mm^{4}' },
            { lhs: 'C_{w}', expr: r.type === 'WF' ? '\\frac{I_{y}h_{o}^{2}}{4}' : 'kanal (pendekatan)', value: sci(f.Cw!), unit: 'mm^{6}' },
            { lhs: 'r_{ts}', expr: '√(\\frac{√(I_{y}C_{w})}{S_{x}})', value: fx(f.rts, 1), unit: 'mm' },
            { lhs: 'h_{o} / c', value: `${fx(f.ho, 1)} mm / ${fx(f.c, 3)}` },
          ],
        },
      ],
    })
    sec.push({ title: 'Klasifikasi penampang (Tabel B4.1b)', blocks: [classTable([[r.type === 'WF' ? 'Sayap b_{f}/2t_{f}' : 'Sayap b_{f}/t_{f}', f.flange!], ['Badan h/t_{w}', f.web!]])] })
    sec.push({
      title: 'Leleh (F2.1)',
      blocks: [{ k: 'calc', steps: [{ lhs: 'M_{p}', expr: 'F_{y} Z_{x}', subst: `${Fy} × ${sci(f.Zx!)} / 10^{6}`, value: kNm(f.Mp), unit: 'kN·m', ref: 'F2-1' }] }],
    })
    sec.push({ title: 'Tekuk torsi-lateral (F2.2)', blocks: [{ k: 'calc', steps: ltbSteps(f, false) }] })
    if (f.section === 'F2/F3')
      sec.push({
        title: 'Tekuk lokal sayap (F3)',
        blocks: [flbI(f, 'x')],
      })
  } else if (f.section === 'F6') {
    sec.push({ title: 'Klasifikasi sayap (Tabel B4.1b)', blocks: [classTable([['Sayap b_{f}/2t_{f}', f.flange!]])] })
    sec.push({
      title: 'Leleh sumbu lemah (F6.1)',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'Z_{y}', expr: '\\frac{t_{f}B^{2}}{2} + \\frac{(H − 2t_{f})t_{w}^{2}}{4}', value: sci(f.Zy!), unit: 'mm^{3}' },
            { lhs: 'M_{p}', expr: 'min(F_{y}Z_{y}; 1.6F_{y}S_{y})', subst: `min(${kNm(f.Fy * f.Zy!)}; ${kNm(f.MpCap)})`, value: kNm(f.Mp), unit: 'kN·m', ref: 'F6-1' },
          ],
        },
      ],
    })
    sec.push({ title: 'Tekuk lokal sayap (F6.2)', blocks: [flbI(f, 'y')] })
  } else if (f.section === 'F7') {
    sec.push({
      title: 'Klasifikasi penampang HSS (Tabel B4.1b)',
      blocks: [
        { k: 'p', text: `Lebar datar b = B − 3t = ${fx(f.bflat, 1)} mm, h = H − 3t = ${fx(f.hflat, 1)} mm (terhadap sumbu lentur).` },
        classTable([['Sayap b/t', f.flange!], ['Badan h/t', f.web!]]),
      ],
    })
    const S = f.S!
    const steps: CalcStep[] = [{ lhs: 'M_{p}', expr: 'F_{y} Z', subst: `${Fy} × ${sci(f.Z!)} / 10^{6}`, value: kNm(f.Mp), unit: 'kN·m', ref: 'F7-1' }]
    steps.push(
      f.flange!.cls === 'kompak'
        ? { desc: 'Sayap kompak — tekuk lokal sayap tidak berlaku', lhs: 'M_{n,sayap}', expr: 'M_{p}', value: kNm(f.Mn_f), unit: 'kN·m' }
        : f.flange!.cls === 'nonkompak'
          ? { lhs: 'M_{n,sayap}', expr: 'M_{p} − (M_{p} − F_{y}S)(3.57\\frac{b}{t}√(\\frac{F_{y}}{E}) − 4.0) ≤ M_{p}', subst: `${kNm(f.Mp)} − (${kNm(f.Mp)} − ${kNm(f.Fy * S)}) × (3.57 × ${fx(f.flange!.lam, 2)} × √(\\frac{${Fy}}{${fx(E_STEEL, 0)}}) − 4.0)`, value: kNm(f.Mn_f), unit: 'kN·m', ref: 'F7-2' }
          : { desc: 'Sayap langsing — pendekatan lebar efektif b_{e} (konservatif)', lhs: 'M_{n,sayap}', expr: 'F_{y} S \\frac{b_{e}}{b}', value: kNm(f.Mn_f), unit: 'kN·m', ref: 'F7-3' },
    )
    steps.push(
      f.web!.cls === 'kompak'
        ? { desc: 'Badan kompak — tekuk lokal badan tidak berlaku', lhs: 'M_{n,badan}', expr: 'M_{p}', value: kNm(f.Mn_w), unit: 'kN·m' }
        : f.web!.cls === 'nonkompak'
          ? { lhs: 'M_{n,badan}', expr: 'M_{p} − (M_{p} − F_{y}S)(0.305\\frac{h}{t}√(\\frac{F_{y}}{E}) − 0.738) ≤ M_{p}', subst: `${kNm(f.Mp)} − (${kNm(f.Mp)} − ${kNm(f.Fy * S)}) × (0.305 × ${fx(f.web!.lam, 2)} × √(\\frac{${Fy}}{${fx(E_STEEL, 0)}}) − 0.738)`, value: kNm(f.Mn_w), unit: 'kN·m', ref: 'F7-6' }
          : { desc: 'Badan langsing — pendekatan', lhs: 'M_{n,badan}', expr: 'F_{y} S', value: kNm(f.Mn_w), unit: 'kN·m' },
    )
    sec.push({ title: 'Leleh & tekuk lokal (F7.1–F7.3)', blocks: [{ k: 'calc', steps }] })
    if (f.ltb) sec.push({ title: 'Tekuk torsi-lateral HSS persegi panjang (F7.4)', blocks: [{ k: 'p', text: `J kotak dinding tipis = ${sci(f.J!)} mm^{4}.` }, { k: 'calc', steps: ltbSteps(f, true, r.p!.A * 100) }] })
  } else if (f.section === 'F8') {
    const Dt = fx(f.Dt, 2)
    sec.push({
      title: 'HSS bundar (F8)',
      blocks: [
        {
          k: 'table',
          head: ['Rasio', 'D/t', 'λ_{p} = 0.07E/F_{y}', 'λ_{r} = 0.31E/F_{y}', 'Klasifikasi'],
          align: ['l', 'r', 'r', 'r', 'l'],
          rows: [['Dinding', Dt, fx(f.lp, 1), fx(f.lr, 1), CLS[f.cls!]]],
        },
        {
          k: 'calc',
          steps: [
            { lhs: 'M_{p}', expr: 'F_{y} Z', subst: `${Fy} × ${sci(f.Z!)} / 10^{6}`, value: kNm(f.Mp), unit: 'kN·m', ref: 'F8-1' },
            f.cls === 'kompak'
              ? { desc: 'Kompak — leleh menentukan', lhs: 'M_{n}', expr: 'M_{p}', value: kNm(f.Mn), unit: 'kN·m' }
              : f.cls === 'nonkompak'
                ? { lhs: 'M_{n}', expr: '(\\frac{0.021E}{D/t} + F_{y}) S', subst: `(\\frac{0.021 × ${fx(E_STEEL, 0)}}{${Dt}} + ${Fy}) × ${sci(f.S!)} / 10^{6}`, value: kNm(f.Mn), unit: 'kN·m', ref: 'F8-2' }
                : { lhs: 'M_{n}', expr: '\\frac{0.33E}{D/t} S', subst: `\\frac{0.33 × ${fx(E_STEEL, 0)}}{${Dt}} × ${sci(f.S!)} / 10^{6}`, value: kNm(f.Mn), unit: 'kN·m', ref: 'F8-3' },
          ],
        },
      ],
    })
  } else {
    sec.push({
      title: 'Leleh elastis (indikatif)',
      blocks: [
        { k: 'p', text: `${r.ti?.name ?? i.ptype}: kekuatan ${r.type === 'L' ? 'F10 (siku)' : 'F12 (tak simetris)'} membutuhkan sumbu utama & pusat geser yang belum ada di library. Yang dihitung hanya momen leleh pertama — bukan untuk desain akhir.` },
        { k: 'calc', steps: [{ lhs: 'M_{y}', expr: 'F_{y} S_{x}', subst: `${Fy} × ${sci(f.S!)} / 10^{6}`, value: kNm(f.Mn), unit: 'kN·m' }] },
      ],
    })
  }
  return sec
}

/** Tekuk lokal sayap profil I: F3 (sumbu kuat) atau F6 (sumbu lemah). */
function flbI(f: FlexureState, axis: 'x' | 'y'): Block {
  const fl = f.flange!
  const S = axis === 'x' ? f.Sx! : f.Sy!
  const sub = axis === 'x' ? 'x' : 'y'
  const step: CalcStep =
    fl.cls === 'kompak'
      ? { desc: 'Sayap kompak — tekuk lokal sayap tidak berlaku', lhs: 'M_{n,FLB}', expr: 'M_{p}', value: kNm(axis === 'x' ? f.Mn_flb : f.Mn), unit: 'kN·m' }
      : fl.cls === 'nonkompak'
        ? {
            lhs: 'M_{n,FLB}',
            expr: `M_{p} − (M_{p} − 0.7F_{y}S_{${sub}})\\frac{λ − λ_{pf}}{λ_{rf} − λ_{pf}}`,
            subst: `${kNm(f.Mp)} − (${kNm(f.Mp)} − ${kNm(0.7 * f.Fy * S)}) × \\frac{${fx(fl.lam, 2)} − ${fx(fl.lp, 2)}}{${fx(fl.lr, 2)} − ${fx(fl.lp, 2)}}`,
            value: kNm(axis === 'x' ? f.Mn_flb : f.Mn),
            unit: 'kN·m',
            ref: axis === 'x' ? 'F3-1' : 'F6-2',
          }
        : axis === 'x'
          ? { desc: 'Sayap langsing, k_{c} = 4/√(h/t_{w}) (0,35…0,76)', lhs: 'M_{n,FLB}', expr: '\\frac{0.9Ek_{c}S_{x}}{λ^{2}}', value: kNm(f.Mn_flb), unit: 'kN·m', ref: 'F3-2' }
          : { desc: 'Sayap langsing, F_{cr} = 0.69E/λ^{2}', lhs: 'M_{n,FLB}', expr: 'F_{cr} S_{y}', value: kNm(f.Mn), unit: 'kN·m', ref: 'F6-3' }
  return { k: 'calc', steps: [step] }
}

export function flexureReport(i: FlexureInput, r: SteelFlexureResult): Report {
  const f = r.f!
  const p = r.p!
  const dcRows: Row[] = [
    ...(r.dcL != null ? [check('D/C DFBK = M_{u} / φ_{b}M_{n}', r.dcL)] : []),
    ...(r.dcA != null ? [check('D/C ASD = M_{a} / (M_{n}/Ω_{b})', r.dcA)] : []),
  ]
  const cands: { label: string; cap: number; c: 'v' | 'm' | 'y' }[] = [{ label: 'Leleh φ_{b}M_{p}', cap: 0.9 * r.Mp!, c: 'v' }]
  if (f.ltb && f.Mn_ltb !== undefined) cands.push({ label: 'Tekuk torsi-lateral', cap: (0.9 * f.Mn_ltb) / 1e6, c: 'm' })
  if (f.Mn_flb !== undefined) cands.push({ label: 'Tekuk lokal sayap', cap: (0.9 * f.Mn_flb) / 1e6, c: 'y' })
  if (f.Mn_f !== undefined) cands.push({ label: 'Tekuk lokal sayap', cap: (0.9 * f.Mn_f) / 1e6, c: 'y' })
  if (f.Mn_w !== undefined) cands.push({ label: 'Tekuk lokal badan', cap: (0.9 * f.Mn_w) / 1e6, c: 'y' })

  const sections: Section[] = [
    { title: 'Data profil & material', blocks: [{ k: 'rows', rows: [...profileRows(r.type!, p, f.Fy), kv('Sumbu lentur', r.axis === 'y' ? 'lemah (y-y)' : 'kuat (x-x)'), ...(f.ltb ? [kv('L_{b} / C_{b}', `${fx(f.Lb, 0)} mm / ${fx(f.Cb, 2)}`)] : [])] }, { k: 'figure', fig: figSection(r) }] },
    ...clauseSections(r, i),
    {
      title: 'Kekuatan lentur desain',
      strong: true,
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: `Menentukan: ${f.gov}`, lhs: 'M_{n}', expr: 'min(keadaan batas)', value: fx(r.Mn, 2), unit: 'kN·m' },
            { desc: 'DFBK, φ_{b} = 0,90', lhs: 'φ_{b}M_{n}', subst: `0.90 × ${fx(r.Mn, 2)}`, value: fx(r.phiMn, 2), unit: 'kN·m' },
            { desc: 'ASD, Ω_{b} = 1,67', lhs: '\\frac{M_{n}}{Ω_{b}}', subst: `\\frac{${fx(r.Mn, 2)}}{1.67}`, value: fx(r.Ma, 2), unit: 'kN·m' },
            ...(r.dcL != null ? [{ lhs: 'D/C_{DFBK}', expr: '\\frac{M_{u}}{φ_{b}M_{n}}', subst: `\\frac{${fx(r.Mu, 2)}}{${fx(r.phiMn, 2)}}`, value: fx(r.dcL, 3) }] : []),
            ...(r.dcA != null ? [{ lhs: 'D/C_{ASD}', expr: '\\frac{M_{a}}{M_{n}/Ω_{b}}', subst: `\\frac{${fx(r.MaDem, 2)}}{${fx(r.Ma, 2)}}`, value: fx(r.dcA, 3) }] : []),
          ],
        },
        ...(dcRows.length ? [{ k: 'rows' as const, rows: dcRows }] : [{ k: 'p' as const, text: 'Momen perlu M_{u} / M_{a} belum diisi — hanya kapasitas yang dilaporkan.' }]),
        {
          k: 'figure',
          fig: f.ltb
            ? figCurve(i, r)
            : capacityFigure(cands, r.Mu!, { unit: 'kN·m', demLabel: `M_{u} = ${fx(r.Mu, 2)} kN·m`, caption: 'Gbr. 2 — Kekuatan lentur rencana tiap keadaan batas (batang) dan momen perlu M_{u} (garis).', alt: 'Kekuatan lentur rencana' }),
        },
      ],
    },
  ]

  const gov = r.dcL != null ? { label: 'D/C DFBK menentukan', ratio: r.dcL } : r.dcA != null ? { label: 'D/C ASD menentukan', ratio: r.dcA } : undefined
  return {
    title: 'Balok Baja — Lentur (SNI 1729:2020 Bab F)',
    summary: [
      kv(`Kekuatan lentur desain φ_{b}M_{n} (${f.gov})`, `${fx(r.phiMn, 2)} kN·m`),
      kv('Kekuatan lentur izin M_{n}/Ω_{b}', `${fx(r.Ma, 2)} kN·m`),
      kv('Momen plastis M_{p}', `${fx(r.Mp, 2)} kN·m`),
      ...dcRows,
    ],
    sections,
    ...(gov ? { governing: gov } : {}),
    warnings: r.warn,
    scope: [
      'Lentur satu sumbu tanpa gaya aksial. I & kanal sumbu kuat (F2/F3), WF sumbu lemah (F6), HSS persegi (F7), HSS bundar (F8); siku & CNP hanya leleh elastis indikatif.',
      'Belum termasuk: badan nonkompak/langsing penuh (F4/F5), F10/F12 lengkap, geser (Bab G), lendutan, interaksi aksial-lentur (Bab H). Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildFlexureReport(i: FlexureInput): Report | null {
  const r = computeFlexure(i)
  return r ? flexureReport(i, r) : null
}

export default {
  defaults: FLEXURE_DEFAULTS,
  build: (i: FlexureInput) => buildFlexureReport(i) ?? { title: 'Balok Baja (Lentur)', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
