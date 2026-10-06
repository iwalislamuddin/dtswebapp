// Rekam hasil compute() modul LAMA (modules/<id>/module.js) sebagai acuan golden untuk port src/calc.
//
//   npm run golden                 # semua tool di cases.mjs
//   npm run golden -- pile-capacity
//
// Modul lama adalah IIFE; fungsinya privat. Sumbernya dijalankan di sandbox vm dengan satu baris tambahan
// sebelum penutup IIFE yang mengekspos fungsi bernama di EXPOSED — file modul tidak diubah. Kasus memanggil
// `compute` kecuali menyebut `fn`. Argumen { $parse: [teks, satuan] } diganti hasil parseCPT() modul itu
// sendiri sebelum dipanggil. `omit: [kunci]` membuang field hasil yang identik dengan kasus lain (tidak
// dibandingkan). Hasil disimpan di src/calc/__golden__/<id>.json: [{ name, fn, args, output }].
// Jalankan ulang HANYA bila kasus ditambah; modul lama adalah acuan yang dibekukan.

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { CASES } from './cases.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, 'src', 'calc', '__golden__')

const EXPOSED = ['compute', 'parseCPT']

function loadModule(id) {
  const file = path.join(ROOT, 'modules', id, 'module.js')
  const src = fs.readFileSync(file, 'utf8')
  const end = src.lastIndexOf('})();')
  if (end < 0) throw new Error(`${id}: penutup IIFE tidak ditemukan`)
  // eval langsung di dalam IIFE membaca fungsi privat; nama yang tidak ada dilewati.
  const hook = `;globalThis.__golden = {}; ${JSON.stringify(EXPOSED)}.forEach(function (n) {
    try { globalThis.__golden[n] = eval(n) } catch (e) {} });\n`
  const hooked = src.slice(0, end) + hook + src.slice(end)
  const sandbox = { Math, JSON, console, window: {} }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(hooked, sandbox, { filename: file })
  return sandbox.__golden
}

// Salinan data murni (lewat JSON) — buang fungsi, NaN/Infinity jadi null seperti JSON.
const plain = (v) => JSON.parse(JSON.stringify(v))

fs.mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
for (const [id, cases] of Object.entries(CASES)) {
  if (only.length && !only.includes(id)) continue
  const mod = loadModule(id)
  const resolve = (a) => (a && a.$parse ? mod.parseCPT(...a.$parse) : a)
  const rows = cases.map(({ name, fn = 'compute', args, omit = [] }) => {
    const real = plain(args.map(resolve))
    const output = plain(mod[fn](...plain(real)))
    for (const k of omit) delete output[k] // field berulang yang sudah diverifikasi kasus lain (tidak dibandingkan)
    return { name, fn, args: real, output }
  })
  // Acuan besar (mis. permukaan interaksi) ditulis ringkas, angka 12 digit signifikan (galat relatif ≤ 5e-13,
  // jauh di bawah toleransi pembanding 1e-9) agar repo tidak membengkak.
  const pretty = JSON.stringify(rows, null, 1)
  const compact = () => JSON.stringify(rows, (_k, x) => (typeof x === 'number' ? Number(x.toPrecision(12)) : x))
  fs.writeFileSync(path.join(OUT, `${id}.json`), (pretty.length > 500_000 ? compact() : pretty) + '\n')
  console.log(`${id}: ${rows.length} kasus`)
}
