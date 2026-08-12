#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const WORDS = path.join(ROOT, 'src/game/data/words.ts')
const SPRITES = path.join(ROOT, 'src/game/data/sprites.generated.ts')
const OUTPUT = path.join(ROOT, 'src/game/data/itemCatalog.generated.ts')

function stringProperty(object, name) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : null
    if (key !== name || !ts.isStringLiteralLike(property.initializer)) continue
    return property.initializer.text
  }
  return null
}

const sourceText = fs.readFileSync(WORDS, 'utf8')
const source = ts.createSourceFile(WORDS, sourceText, ts.ScriptTarget.Latest, true)
const items = []

function visit(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === 'variant' || node.expression.text === 'hiddenVariant')
  ) {
    const input = node.arguments[0]
    if (input !== undefined && ts.isObjectLiteralExpression(input)) {
      const id = stringProperty(input, 'id')
      const label = stringProperty(input, 'label')
      const sprite = stringProperty(input, 'sprite')
      if (id !== null && label !== null && sprite !== null) items.push({ id, label, sprite })
    }
  }
  ts.forEachChild(node, visit)
}
visit(source)

const ids = new Set(items.map((item) => item.id))
if (items.length === 0 || ids.size !== items.length) {
  throw new Error(`item catalog is empty or has duplicate ids (${items.length}/${ids.size})`)
}

const extension = fs.readFileSync(SPRITES, 'utf8').match(/const SPRITE_EXT = '([^']+)'/)?.[1]
if (extension === undefined) throw new Error('SPRITE_EXT를 찾지 못했다')

const body = items
  .map(({ id, label, sprite }) => `  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(label)}, sprite: ${JSON.stringify(sprite)} },`)
  .join('\n')

fs.writeFileSync(OUTPUT, `// 이 파일은 scripts/prepare-item-catalog.cjs가 생성한다. 직접 고치지 말 것.\n\ninterface ItemCatalogEntry {\n  readonly id: string\n  readonly label: string\n  readonly sprite: string\n}\n\nconst SPRITE_EXT = ${JSON.stringify(extension)}\nconst ITEM_CATALOG = [\n${body}\n] as const satisfies readonly ItemCatalogEntry[]\nconst ITEM_BY_ID: ReadonlyMap<string, ItemCatalogEntry> = new Map(\n  ITEM_CATALOG.map((item) => [item.id, item]),\n)\nconst ITEM_LABELS = [...new Set(ITEM_CATALOG.map((item) => item.label))]\n\nfunction itemSprite(id: string): string | null {\n  const item = ITEM_BY_ID.get(id)\n  return item === undefined\n    ? null\n    : \`${'${import.meta.env.BASE_URL}'}items/${'${item.sprite}'}${'${SPRITE_EXT}'}\`\n}\n\nexport { ITEM_CATALOG, ITEM_LABELS, itemSprite }\nexport type { ItemCatalogEntry }\n`)

console.log(`item catalog: ${items.length}개 → ${path.relative(ROOT, OUTPUT)}`)
