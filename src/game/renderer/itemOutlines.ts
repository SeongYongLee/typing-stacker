import type { ItemVariant } from '../types/game.ts'
import { SPRITES, type SpriteMeta, type SpriteName } from '../data/sprites.generated.ts'
type Point = readonly [number, number]
const outlineCache = new WeakMap<ItemVariant, readonly (readonly Point[])[]>()

function itemOutlines(variant: ItemVariant): readonly (readonly Point[])[] {
  const cached = outlineCache.get(variant)
  if (cached !== undefined) return cached
  const name = variant.sprite.split('/').pop()?.replace(/\.webp$/, '') as SpriteName
  const meta: SpriteMeta | undefined = SPRITES[name]
  if (meta === undefined) throw new Error(`Missing outline for ${variant.id}`)
  const outlines = meta.outlines.map((outline) => outline.map(([x, y]) => [x * variant.artBounds.hw, y * variant.artBounds.hh] as const))
  outlineCache.set(variant, outlines)
  return outlines
}

export { itemOutlines }
