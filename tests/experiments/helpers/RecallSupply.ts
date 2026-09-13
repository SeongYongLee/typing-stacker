import { RECIPES, craftKeyOf } from '../../../src/game/data/recipes.ts'
import { WORDS } from '../../../src/game/data/words.ts'
import type { ItemVariant, WordEntry } from '../../../src/game/types/game.ts'

const baseEntries = new Map(WORDS.flatMap(entry => entry.variants.filter(v => !v.hidden).map(v => [craftKeyOf(v.id), entry] as const)))
const recipes = new Map(RECIPES.map(recipe => [recipe.result.id, recipe]))

/** Required requests use base drops and craftable primary results, excluding luck-only variants. */
export function reachableRecallIds(entries: readonly WordEntry[]): ReadonlySet<string> {
  const ids = new Set(entries.flatMap(entry => entry.variants.filter(v => !v.hidden).map(v => v.id)))
  let changed = true
  while (changed) {
    changed = false
    const keys = new Set([...ids].map(craftKeyOf))
    for (const recipe of RECIPES) {
      if (!ids.has(recipe.result.id) && recipe.inputs.every(id => keys.has(craftKeyOf(id)))) {
        ids.add(recipe.result.id)
        changed = true
      }
    }
  }
  return ids
}

/** Resolve missing ingredients against items, pending drops and already-visible words. */
export function recallIngredient(targets: readonly ItemVariant[], available: ReadonlyMap<string, number>, candidates: readonly WordEntry[]): WordEntry | null {
  const allowed = new Map(candidates.map(entry => [entry.word, entry]))
  for (const target of targets) {
    const counts = new Map<string,number>()
    for(const [id,n] of available) counts.set(craftKeyOf(id),(counts.get(craftKeyOf(id))??0)+n)
    const visiting = new Set<string>()
    const find = (id:string): WordEntry|null => {
      const key=craftKeyOf(id), count=counts.get(key)??0
      if(count>0){counts.set(key,count-1);return null}
      const entry=baseEntries.get(key)
      if(entry)return allowed.get(entry.word)??null
      if(visiting.has(id))return null
      visiting.add(id)
      const recipe=recipes.get(id)
      for(const ingredient of recipe?.inputs??[]) {
        const missing=find(ingredient)
        if(missing)return missing
      }
      visiting.delete(id)
      return null
    }
    const missing=find(target.id)
    if(missing)return missing
  }
  return null
}
