import { describe, expect, it } from 'vitest'
import { ITEM_CATALOG } from '../src/game/data/itemCatalog.generated.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'

describe('lightweight item catalog', () => {
  it('matches every game variant without loading shape metadata in the title bundle', () => {
    expect(ITEM_CATALOG.map(({ id, label, sprite }) => ({ id, label, sprite }))).toEqual(
      ALL_VARIANTS.map(({ id, label, sprite }) => ({
        id,
        label,
        sprite: sprite.split('/').at(-1)?.replace(/\.webp$/, ''),
      })),
    )
  })
})
