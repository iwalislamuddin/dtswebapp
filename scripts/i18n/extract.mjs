// Ekstrak teks (literal string & template) dari sumber laporan + pesan peringatan modul hitung.
// Placeholder ${...} → {0}, {1}, ...  Keluaran: JSON array unik ke stdout.
//   node scripts/i18n/extract.mjs src/tools src/calc src/report
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const roots = process.argv.slice(2)
const files = []
const walk = (p) => {
  const st = fs.statSync(p)
  if (st.isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f)))
  else if (/\.ts$/.test(p) && !/\.test\.ts$|\.d\.ts$/.test(p)) files.push(p)
}
roots.forEach(walk)

const out = new Map()
for (const f of files) {
  const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)
  const rel = path.relative(process.cwd(), f).split(path.sep).join('/')
  const inWarn = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'push' && /warn|^w$|notes?$/i.test(p.expression.expression.getText())) return true
      if ((ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && /warn/i.test(p.name.getText())) return true
      if (ts.isFunctionLike(p)) return false
    }
    return false
  }
  const add = (s, n) => {
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(s.replace(/\{\d+\}/g, ''))) return
    if (!out.has(s)) out.set(s, { files: new Set(), warn: false, lab: false })
    const e = out.get(s)
    e.files.add(rel)
    if (inWarn(n)) e.warn = true
    const q = n.parent
    if ((ts.isPropertyAssignment(q) && /^(label|name|title|desc|group|note|text)$/.test(q.name.getText())) || ts.isCallExpression(q) || ts.isArrayLiteralExpression(q)) e.lab = true
  }
  // Rantai "a" + x + "b" (dan templat di dalamnya) diratakan jadi satu templat: "a{0}b".
  const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)
  const isConcat = (n) => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken
  const chainHasStr = (n) => (isConcat(n) ? chainHasStr(n.left) || chainHasStr(n.right) : isStr(n))
  const flat = (n, holes) => {
    if (isConcat(n)) return flat(n.left, holes) + flat(n.right, holes)
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
    if (ts.isTemplateExpression(n)) {
      let t = n.head.text
      n.templateSpans.forEach((sp) => {
        holes.push(sp.expression)
        t += '\u0000' + sp.literal.text
      })
      return t
    }
    holes.push(n)
    return '\u0000'
  }
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isLiteralTypeNode(n)) return
    if ((isConcat(n) && chainHasStr(n) && !isConcat(n.parent)) || ts.isTemplateExpression(n)) {
      const holes = []
      let i = 0
      const t = flat(n, holes).replace(/\u0000/g, () => `{${i++}}`)
      add(t, n)
      holes.forEach(visit)
      return
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent
      if (ts.isPropertyAssignment(p) && p.name === n) return
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && /^(k|t|c|align|unit)$/.test(p.name.text)) return
      if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return
      if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText())) return
      add(n.text, n)
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
}
console.log(JSON.stringify([...out].map(([s, e]) => ({ s, files: [...e.files], warn: e.warn, lab: e.lab })), null, 1))
