import type { Recipe } from '../data/recipes.ts'
import type { WordEntry } from '../types/game.ts'

const baseWordCache = new WeakMap<readonly WordEntry[], ReadonlyMap<string, string>>()
const neededCache = new WeakMap<Recipe, ReadonlyMap<string, number>>()

function baseWordsByVariant(entries: readonly WordEntry[]): ReadonlyMap<string, string> {
  const cached = baseWordCache.get(entries)
  if (cached !== undefined) {
    return cached
  }
  const words = new Map<string, string>()
  for (const entry of entries) {
    const base = entry.variants[0]
    if (base !== undefined) {
      words.set(base.id, entry.word)
    }
  }
  baseWordCache.set(entries, words)
  return words
}

function neededCounts(recipe: Recipe): ReadonlyMap<string, number> {
  const cached = neededCache.get(recipe)
  if (cached !== undefined) {
    return cached
  }
  const counts = new Map<string, number>()
  for (const id of recipe.inputs) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  neededCache.set(recipe, counts)
  return counts
}

/**
 * 지금 보이거나 쌓인 재료가 있으면, 그 레시피를 완성하는 데 부족한 재료 단어를 돌려준다.
 */
function craftPartnerWords(
  available: ReadonlyMap<string, number>,
  recipes: readonly Recipe[],
  entries: readonly WordEntry[],
): readonly string[] {
  const byVariant = baseWordsByVariant(entries)
  const words = new Set<string>()

  for (const recipe of recipes) {
    const needs = neededCounts(recipe)
    let hasAny = false
    let complete = true

    for (const [id, need] of needs) {
      const have = available.get(id) ?? 0
      hasAny ||= have > 0
      complete &&= have >= need
    }

    if (!hasAny || complete) {
      continue
    }

    for (const [id, need] of needs) {
      if ((available.get(id) ?? 0) >= need) {
        continue
      }
      const word = byVariant.get(id)
      if (word !== undefined) {
        words.add(word)
      }
    }
  }

  return [...words]
}

export { craftPartnerWords }
