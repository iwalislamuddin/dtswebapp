// Rekam hasil compute() modul LAMA (modules/<id>/module.js) sebagai acuan golden untuk port src/calc.
//
//   npm run golden                 # semua tool di cases.mjs
//   npm run golden -- pile-capacity
//
// Modul lama adalah IIFE; compute() bersifat privat. Sumbernya dijalankan di sandbox vm dengan satu baris
// tambahan sebelum penutup IIFE yang mengekspos compute — file modul tidak diubah. Hasil disimpan di
// src/calc/__golden__/<id>.json: [{ name, args, output }]. Jalankan ulang HANYA bila kasus ditambah;
// modul lama adalah acuan yang dibekukan, jadi output untuk kasus yang sama tidak boleh berubah.

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { CASES } from './cases.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, 'src', 'calc', '__golden__')

function loadCompute(id) {
  const file = path.join(ROOT, 'modules', id, 'module.js')
  const src = fs.readFileSync(file, 'utf8')
  const end = src.lastIndexOf('})();')
  if (end < 0) throw new Error(`${id}: penutup IIFE tidak ditemukan`)
  const hooked = src.slice(0, end) + ';globalThis.__golden = { compute: compute };\n' + src.slice(end)
  const sandbox = { Math, JSON, console, window: {} }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(hooked, sandbox, { filename: file })
  return sandbox.__golden.compute
}

// Salinan data murni (lewat JSON) — buang fungsi, NaN/Infinity jadi null seperti JSON.
const plain = (v) => JSON.parse(JSON.stringify(v))

fs.mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
for (const [id, cases] of Object.entries(CASES)) {
  if (only.length && !only.includes(id)) continue
  const compute = loadCompute(id)
  const rows = cases.map(({ name, args }) => ({ name, args, output: plain(compute(...plain(args))) }))
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(rows, null, 1) + '\n')
  console.log(`${id}: ${rows.length} kasus`)
}
