import { RECIPES, craftKeyOf } from '../../src/game/data/recipes.ts'
import type { ItemVariant } from '../../src/game/types/game.ts'

/** Experimental: only promise a primary result when every ingredient is physically present. */
export function physicalRecipeRequest(counts:ReadonlyMap<string,number>, requests:readonly ItemVariant[]):ItemVariant|null {
  const available=new Map<string,number>()
  for(const [id,count] of counts)available.set(craftKeyOf(id),(available.get(craftKeyOf(id))??0)+count)
  for(const recipe of RECIPES) {
    if(requests.some(item=>item.id===recipe.result.id))continue
    const required=new Map<string,number>()
    for(const id of recipe.inputs)required.set(craftKeyOf(id),(required.get(craftKeyOf(id))??0)+1)
    if([...required].every(([key,count])=>(available.get(key)??0)>=count))return recipe.result
  }
  return null
}
