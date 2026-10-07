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

// Library inti yang dimuat ke sandbox sebelum modul (modul baja membacanya saat mount: SP / state.steel).
const CORE_LIBS = { 'steel-profiles': 'SteelProfiles' }

function newSandbox() {
  const sandbox = { Math, JSON, console, window: {} }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  for (const lib of Object.keys(CORE_LIBS)) {
    const file = path.join(ROOT, 'core', `${lib}.js`)
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file })
  }
  return sandbox
}

/** id `core:<nama>` → objek global library inti (mis. window.SteelProfiles) dipakai sebagai "modul". */
function loadModule(id) {
  if (id.startsWith('core:')) return newSandbox().window[CORE_LIBS[id.slice(5)]]
  const file = path.join(ROOT, 'modules', id, 'module.js')
  const src = fs.readFileSync(file, 'utf8')
  const end = src.lastIndexOf('})();')
  if (end < 0) throw new Error(`${id}: penutup IIFE tidak ditemukan`)
  // Isi variabel yang biasanya diisi mount() (SP, state.steel); eval langsung di dalam IIFE membaca fungsi
  // privat; nama yang tidak ada dilewati.
  const hook = `;try { SP = window.SteelProfiles } catch (e) {}
    try { state.steel = window.SteelProfiles } catch (e) {}
    try { state.UI = { fmt: function (n, dp) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      dp = dp === undefined ? 2 : dp;
      return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) } } } catch (e) {}
    globalThis.__golden = { __setState: function (k, v) { state[k] = v } };
    ${JSON.stringify(EXPOSED)}.forEach(function (n) {
    try { globalThis.__golden[n] = eval(n) } catch (e) {} });\n`
  const hooked = src.slice(0, end) + hook + src.slice(end)
  const sandbox = newSandbox()
  vm.runInContext(hooked, sandbox, { filename: file })
  sandbox.__golden.__window = sandbox.window
  return sandbox.__golden
}

/**
 * Kasus dengan `profile: [tipe, ukuran]` (modul yang membaca state.profile dari UI, mis. steel-beam-analysis):
 * profil library diisi ke state modul sebelum compute, dan ikut direkam sebagai argumen terakhir.
 */
function applyState(mod, c, real) {
  if (!c.profile) return real
  const prof = plain(mod.__window.SteelProfiles.get(...c.profile))
  mod.__setState('profile', prof)
  return [...real, prof]
}

// Salinan data murni (lewat JSON) — buang fungsi, NaN/Infinity jadi null seperti JSON.
const plain = (v) => JSON.parse(JSON.stringify(v))

fs.mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
for (const [id, cases] of Object.entries(CASES)) {
  if (only.length && !only.includes(id)) continue
  const mod = loadModule(id)
  const resolve = (a) => (a && a.$parse ? mod.parseCPT(...a.$parse) : a)
  const rows = cases.map((c) => {
    const { name, fn = 'compute', args, omit = [] } = c
    const real = applyState(mod, c, plain(args.map(resolve)))
    const output = plain(mod[fn](...plain(real)))
    for (const k of omit) delete output[k] // field berulang yang sudah diverifikasi kasus lain (tidak dibandingkan)
    return { name, fn, args: real, output }
  })
  // Acuan besar (mis. permukaan interaksi) ditulis ringkas, angka 12 digit signifikan (galat relatif ≤ 5e-13,
  // jauh di bawah toleransi pembanding 1e-9) agar repo tidak membengkak.
  const pretty = JSON.stringify(rows, null, 1)
  // Hanya output yang dibulatkan — argumen harus persis agar port menerima input yang sama.
  const round = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Number(x.toPrecision(12)) : x)))
  const compact = () => JSON.stringify(rows.map((row) => ({ ...row, output: round(row.output) })))
  fs.writeFileSync(path.join(OUT, `${id.replace(/^core:/, '')}.json`), (pretty.length > 500_000 ? compact() : pretty) + '\n')
  console.log(`${id}: ${rows.length} kasus`)
}
