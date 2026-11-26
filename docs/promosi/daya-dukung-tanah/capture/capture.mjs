#!/usr/bin/env node
// Capture screenshot untuk tutorial video bagian 2: login → tab Detail → Cetak PDF → Simpan/Buka Pekerjaan (cloud).
// Dijalankan DI LAPTOP Anda. Skrip TIDAK meminta atau menyimpan email/sandi: login dilakukan sendiri oleh Anda di
// jendela browser yang terbuka. Email akun disamarkan di semua screenshot (jadi "nama@email.com").
//
//   npm install && npx playwright install chromium
//   node capture.mjs                      # desktop + mobile
//   node capture.mjs --only=desktop       # atau --only=mobile
//
// Variabel lingkungan (opsional):
//   BASE_URL=https://tools.edifisia.com   OUT=out   CHANNEL=chrome (pakai Google Chrome terpasang)
//   HEADLESS=1 (tanpa jendela; hanya untuk uji tanpa login)   CHROMIUM_PATH=/path/ke/chromium
// Opsi: --skip-login (lewati tunggu login; untuk uji lokal)
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const BASE = (process.env.BASE_URL || 'https://tools.edifisia.com').replace(/\/$/, '')
const TOOL = `${BASE}/bearing-capacity`
const OUT = path.resolve(process.env.OUT || 'out')
const STATE = path.resolve('.state/session.json')
const HEADLESS = process.env.HEADLESS === '1'
const ARGS = process.argv.slice(2)
const SKIP_LOGIN = ARGS.includes('--skip-login')
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').split('=')[1] || ''
const MASK = 'nama@email.com'
const WORK_DESKTOP = 'Pondasi gedung A'
const WORK_MOBILE = 'Pondasi gedung B'
const PDF_DESC = 'Pondasi telapak gedung A'

mkdirSync(OUT, { recursive: true })
const LOG = []
const log = (...a) => { const s = a.join(' '); console.log(s); LOG.push(s) }
const results = []
async function step(name, fn) {
  try { await fn(); results.push([name, 'ok']); log('✓', name) }
  catch (e) { results.push([name, 'GAGAL']); log('✗', name, '-', String(e.message).split('\n')[0]) }
}

// ------------------------------------------------------------------ browser
const launchOpts = {
  headless: HEADLESS,
  channel: process.env.CHANNEL || undefined,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.env.CHROMIUM_PATH ? ['--no-sandbox'] : [],
}
const browser = await chromium.launch(launchOpts)
const common = { locale: 'id-ID', timezoneId: 'Asia/Jakarta', colorScheme: 'light', acceptDownloads: true }
const DESKTOP = { ...common, viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.8 }
const MOBILE = { ...common, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

// ------------------------------------------------------------------ penyamaran email
function maskInit({ email, mask }) {
  if (!email) return
  const fix = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) if (n.nodeValue.includes(email)) n.nodeValue = n.nodeValue.split(email).join(mask)
    root.querySelectorAll('[title],[aria-label]').forEach((e) => {
      for (const a of ['title', 'aria-label']) {
        const v = e.getAttribute(a)
        if (v && v.includes(email)) e.setAttribute(a, v.split(email).join(mask))
      }
    })
  }
  const start = () => {
    fix(document.body)
    new MutationObserver(() => fix(document.body)).observe(document.body, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'],
    })
  }
  if (document.body) start(); else addEventListener('DOMContentLoaded', start)
}
let EMAIL = ''
async function installMask(ctx, page) {
  if (!EMAIL) return
  await ctx.addInitScript(maskInit, { email: EMAIL, mask: MASK })
  if (page) await page.evaluate(maskInit, { email: EMAIL, mask: MASK })
}

// ------------------------------------------------------------------ screenshot + koordinat
const boxes = { desktop: {}, mobile: {} }
async function bb(loc) {
  try {
    if (!(await loc.count())) return null
    const r = await loc.first().boundingBox()
    return r && [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1))
  } catch { return null }
}
const BASE_BOXES = (p) => ({
  menubar: p.locator('header.menubar'), file: p.locator('button[data-menu="file"]'), account: p.locator('.mb-account'),
  badge: p.locator('.mb-badge-bar'), tabs: p.locator('.tool-tabs'), tabInput: p.getByRole('tab', { name: 'Input' }),
  tabDetail: p.getByRole('tab', { name: /Detail/ }), pdfBtn: p.locator('.pdf-btn'), body: p.locator('.tool-body'),
  popup: p.locator('.mb-popup').first(), dialog: p.locator('dialog.dlg[open]'), toast: p.locator('.toast'),
})
async function shot(ctxName, page, name, extra = {}) {
  await page.waitForTimeout(700)
  const dir = path.join(OUT, ctxName)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`) })
  const rec = {}
  for (const [k, loc] of Object.entries({ ...BASE_BOXES(page), ...extra })) { const b = await bb(loc); if (b) rec[k] = b }
  rec._scrollTop = await page.evaluate(() => document.querySelector('.tool-body')?.scrollTop ?? null).catch(() => null)
  boxes[ctxName][name] = rec
  log('   foto', `${ctxName}/${name}`)
}

// ------------------------------------------------------------------ pembantu aplikasi
async function openTool(page) {
  await page.goto(TOOL)
  await page.waitForSelector('.tool-tabs', { timeout: 60000 })
  await page.waitForTimeout(1500)
}
async function fillExample(page) {
  const fld = (l) => page.locator(`.fld:has(.fld-label:has-text("${l}"))`).first()
  const set = async (l, v) => { await fld(l).locator('input').first().fill(String(v)); await page.waitForTimeout(250) }
  await set('B — lebar', 2.5); await set('Df — kedalaman', 1.5); await set('c — kohesi', 10); await set('φ — sudut', 30)
  await set('γ — berat isi lembab', 18); await set('Dw — kedalaman', 99); await set('FS — faktor', 3); await set('q — tekanan', 250)
  await page.locator('select').nth(1).selectOption('meyerhof')
  await page.waitForTimeout(600)
}
const openFile = async (page) => { await page.locator('button[data-menu="file"]').click(); await page.waitForTimeout(300) }
const menuItem = (page, re) => page.getByRole('menuitem', { name: re })
const dlg = (page) => page.locator('dialog.dlg[open]')
const tab = (page, re) => page.getByRole('tab', { name: re })

async function waitForLogin(page) {
  log('\n>>> SILAKAN MASUK di jendela browser yang terbuka (ketik email & sandi sendiri; skrip tidak membacanya).')
  log('    Setelah masuk Anda kembali ke Civil Tools. Jika tidak, ketik di tab itu:', TOOL)
  const t0 = Date.now()
  while (Date.now() - t0 < 10 * 60 * 1000) {
    try {
      const loc = page.locator('.mb-account.user span')
      if (await loc.count()) { const e = (await loc.first().textContent())?.trim(); if (e) return e }
    } catch { /* halaman sedang berpindah */ }
    await page.waitForTimeout(1500)
  }
  throw new Error('Waktu tunggu login habis (10 menit)')
}

/** Berhenti lebih awal bila akun yang login tidak punya Premium/trial aktif (Detail, PDF, simpan cloud terkunci). */
async function checkPremium(page) {
  const badge = page.locator('.mb-badge-bar').first()
  const text = await badge.waitFor({ timeout: 12000 }).then(() => badge.textContent()).catch(() => null)
  log('   status akun:', text ? text.trim() : '(label tidak terbaca)')
  if (text && /berakhir|belum/i.test(text) && !ARGS.includes('--allow-no-premium')) {
    log('\n!!! Akun ini TIDAK punya Premium/trial aktif, jadi Detail, PDF, dan simpan ke cloud terkunci.')
    log('    Hentikan, lalu jalankan ulang dan login dengan akun yang Premium-nya aktif.')
    log('    (Tambahkan --allow-no-premium bila tetap ingin lanjut.)')
    writeFileSync(path.join(OUT, 'log.txt'), LOG.join('\n') + '\n')
    await browser.close()
    process.exit(2)
  }
}

/** Tangkap tab yang sedang tampil dalam irisan setinggi layar (desktop) atau viewport tinggi (mobile). */
async function slices(ctxName, page, base, { tall = 0, step = 0.8, max = 8 } = {}) {
  const orig = page.viewportSize()
  if (tall) { await page.setViewportSize({ width: orig.width, height: tall }); await page.waitForTimeout(900) }
  const info = await page.evaluate(() => {
    const b = document.querySelector('.tool-body')
    const top = b.getBoundingClientRect().top
    const heads = [...document.querySelectorAll('.tool-body h2, .tool-body h3, .tool-body h4')].map((h) => ({ t: h.textContent.trim().slice(0, 60), y: +(h.getBoundingClientRect().top - top + b.scrollTop).toFixed(1) }))
    // tinggi isi sebenarnya (viewport tinggi membuat scrollHeight = clientHeight)
    const contentHeight = Math.max(0, ...[...b.children].map((c) => c.getBoundingClientRect().bottom - top + b.scrollTop))
    return { scrollHeight: b.scrollHeight, clientHeight: b.clientHeight, contentHeight: +contentHeight.toFixed(1), bodyTop: +top.toFixed(1), heads }
  })
  boxes[ctxName][`${base}-info`] = info
  const stepPx = Math.max(200, Math.round(info.clientHeight * step))
  for (let i = 0, st = 0; i < max; i++, st += stepPx) {
    const s = Math.min(st, Math.max(0, info.scrollHeight - info.clientHeight))
    await page.evaluate((v) => { document.querySelector('.tool-body').scrollTop = v }, s)
    await shot(ctxName, page, `${base}-${i}`)
    if (s >= info.scrollHeight - info.clientHeight) break
  }
  await page.evaluate(() => { document.querySelector('.tool-body').scrollTop = 0 })
  if (tall) { await page.setViewportSize(orig); await page.waitForTimeout(600) }
}
async function pdfToPng(pdf, prefix) {
  try { await run('pdftoppm', ['-png', '-r', '120', '-f', '1', '-l', '3', pdf, prefix]); log('   PDF → PNG ok') }
  catch { log('   (pdftoppm tidak ada — tidak apa-apa, kirim saja file PDF-nya)') }
}

/** Alur layar yang sama untuk desktop & mobile setelah login. */
async function loggedFlow(ctxName, ctx, page, { mobile, workName }) {
  await step(`${ctxName}: buka tool & isi contoh`, async () => {
    await openTool(page); await fillExample(page)
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}20-masuk-akun`)
  })
  await step(`${ctxName}: menu akun & status Premium`, async () => {
    await page.locator('.mb-account.user').click(); await page.waitForTimeout(400)
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}21-menu-akun`, { acct: page.locator('.mb-acct') })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  })
  await step(`${ctxName}: tab Detail`, async () => {
    await tab(page, /Detail/).click(); await page.waitForTimeout(1200)
    const locked = await page.locator('.tool-body:has-text("fitur Premium")').count()
    if (locked) log('   ! PERHATIAN: Detail masih terkunci — akun ini tidak Premium/trial aktif.')
    await slices(ctxName, page, `${mobile ? 'm' : 'd'}30-detail`, mobile ? { tall: 4000, step: 1.0, max: 4 } : { step: 0.8, max: 7 })
    await tab(page, 'Input').click(); await page.waitForTimeout(600)
  })
  await step(`${ctxName}: menu File & dialog Cetak PDF`, async () => {
    await openFile(page)
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}41-menu-file`, { itemPdf: menuItem(page, /Download Report/), itemSave: menuItem(page, /Simpan Pekerjaan/), itemOpen: menuItem(page, /Buka Pekerjaan/) })
    await menuItem(page, /Download Report/).click()
    await dlg(page).waitFor()
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}42-dialog-pdf`, { desc: page.locator('#pdf-desc'), langSeg: dlg(page).locator('.seg'), submit: dlg(page).getByRole('button', { name: 'Cetak PDF' }) })
    await page.locator('#pdf-desc').fill(PDF_DESC)
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}43-dialog-pdf-terisi`, { desc: page.locator('#pdf-desc'), submit: dlg(page).getByRole('button', { name: 'Cetak PDF' }) })
    if (!mobile) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), dlg(page).getByRole('button', { name: 'Cetak PDF' }).click()])
      mkdirSync(path.join(OUT, 'pdf'), { recursive: true })
      const pdf = path.join(OUT, 'pdf', 'laporan.pdf')
      await dl.saveAs(pdf)
      await page.waitForTimeout(800)
      await shot(ctxName, page, 'd44-setelah-cetak')
      await pdfToPng(pdf, path.join(OUT, 'pdf', 'laporan'))
    } else {
      await dlg(page).getByRole('button', { name: 'Batal' }).click()
    }
  })
  await step(`${ctxName}: Simpan Pekerjaan ke cloud`, async () => {
    await openFile(page); await menuItem(page, /Simpan Pekerjaan/).click(); await dlg(page).waitFor()
    await page.waitForTimeout(800)
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}50-dialog-simpan`, { name: page.locator('#work-name'), dest: dlg(page).locator('.seg'), submit: dlg(page).locator('button[type=submit]') })
    const cloud = dlg(page).getByRole('radio', { name: /Cloud/ })
    if (await cloud.count()) await cloud.click()
    else log('   ! Pilihan "Cloud (akun)" tidak muncul — apakah sudah login?')
    await page.locator('#work-name').fill(workName)
    await page.waitForTimeout(600)
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}51-dialog-simpan-terisi`, { name: page.locator('#work-name'), dest: dlg(page).locator('.seg'), submit: dlg(page).locator('button[type=submit]') })
    await dlg(page).locator('button[type=submit]').click()
    await page.locator('.toast').waitFor({ timeout: 15000 })
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}52-tersimpan`)
  })
  await step(`${ctxName}: Buka Pekerjaan (daftar cloud)`, async () => {
    await page.waitForTimeout(3500) // biarkan toast hilang
    await openFile(page); await menuItem(page, /Buka Pekerjaan/).click(); await dlg(page).waitFor()
    await page.locator('ul.works-list').waitFor({ timeout: 15000 })
    await shot(ctxName, page, `${mobile ? 'm' : 'd'}60-dialog-buka`, { list: page.locator('ul.works-list'), item: page.locator('ul.works-list li').first() })
    await page.keyboard.press('Escape')
  })
}

// ================================================================== DESKTOP
let stateSaved = existsSync(STATE) && ARGS.includes('--reuse-session')
if (!ONLY || ONLY === 'desktop') {
  const ctx = await browser.newContext(stateSaved ? { ...DESKTOP, storageState: STATE } : DESKTOP)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log('   pageerror:', e.message))
  if (!stateSaved) {
    await step('desktop: tool sebagai tamu', async () => { await openTool(page); await shot('desktop', page, 'd10-tamu') })
    await step('desktop: klik Masuk', async () => {
      await page.locator('button.mb-account').click()
      await page.waitForTimeout(3000)
      const u = new URL(page.url()); log('   alamat setelah Masuk:', u.origin + u.pathname)
      await shot('desktop', page, 'd12-halaman-masuk')
    })
    if (!SKIP_LOGIN) {
      await step('desktop: menunggu Anda login', async () => {
        EMAIL = await waitForLogin(page)
        log('   login terdeteksi')
        await checkPremium(page)
        mkdirSync(path.dirname(STATE), { recursive: true })
        await ctx.storageState({ path: STATE })
        stateSaved = true
        await installMask(ctx, page)
      })
    }
  } else {
    await openTool(page)
    EMAIL = (await page.locator('.mb-account.user span').first().textContent().catch(() => ''))?.trim() || ''
    await installMask(ctx, page)
  }
  await loggedFlow('desktop', ctx, page, { mobile: false, workName: WORK_DESKTOP })
  await ctx.close()
}

// ================================================================== MOBILE
if (!ONLY || ONLY === 'mobile') {
  // 1) tamu: tombol Masuk + halaman masuk
  const g = await browser.newContext(MOBILE)
  const gp = await g.newPage()
  await step('mobile: tool sebagai tamu', async () => { await openTool(gp); await shot('mobile', gp, 'm10-tamu') })
  await step('mobile: ketuk Masuk', async () => {
    await gp.locator('button.mb-account').click(); await gp.waitForTimeout(3000)
    await shot('mobile', gp, 'm12-halaman-masuk')
  })
  await g.close()
  // 2) sudah login (sesi dari desktop)
  if (stateSaved || SKIP_LOGIN) {
    const ctx = await browser.newContext(stateSaved ? { ...MOBILE, storageState: STATE } : MOBILE)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => log('   pageerror:', e.message))
    if (EMAIL) await installMask(ctx, null)
    await loggedFlow('mobile', ctx, page, { mobile: true, workName: WORK_MOBILE })
    await ctx.close()
  } else {
    log('! Mobile setelah login dilewati: belum ada sesi (jalankan desktop dulu, atau tambahkan --reuse-session).')
  }
}

await browser.close()
writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(boxes, null, 1))
writeFileSync(path.join(OUT, 'log.txt'), LOG.join('\n') + '\n')
const bad = results.filter((r) => r[1] !== 'ok')
log(`\nSelesai. ${results.length - bad.length}/${results.length} langkah berhasil. Hasil ada di: ${OUT}`)
if (bad.length) log('Langkah GAGAL:', bad.map((b) => b[0]).join(' | '), '\nKirim isi out/log.txt bila perlu — langkah yang gagal bisa diulang terpisah.')
log('Catatan: pekerjaan yang tersimpan di cloud ("' + WORK_DESKTOP + '" / "' + WORK_MOBILE + '") dapat dihapus lewat File › Buka Pekerjaan.')
