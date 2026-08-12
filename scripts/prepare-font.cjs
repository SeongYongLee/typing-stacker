#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'assets-src/fonts/griun-x-hangeul-a-foreign-hand-regular.woff2')
const OUTPUT = path.join(ROOT, 'src/assets/fonts/griun-x-hangeul-a-foreign-hand-regular.woff2')
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [target] : []
  })
}

const characters = new Set(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz{}~')
for (const file of sourceFiles(path.join(ROOT, 'src'))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
      for (const character of node.text) characters.add(character)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
const textFile = path.join(os.tmpdir(), `typing-stacker-font-${process.pid}.txt`)
fs.writeFileSync(textFile, [...characters].join(''))

const command = process.env.PYFTSUBSET || 'pyftsubset'
const result = spawnSync(command, [
  SOURCE,
  `--output-file=${OUTPUT}`,
  '--flavor=woff2',
  `--text-file=${textFile}`,
  '--layout-features=*',
  '--no-hinting',
], { stdio: 'inherit' })
fs.rmSync(textFile, { force: true })

if (result.error !== undefined) {
  throw new Error(`pyftsubset 실행 실패: ${result.error.message}\nfonttools를 설치하거나 PYFTSUBSET 경로를 지정하세요.`)
}
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`font subset: ${characters.size}자 → ${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KiB`)
