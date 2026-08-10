import { HIDDEN_CHANCE } from '../config.ts'
import { WORD_BY_TEXT } from '../data/words.ts'
import type { Recipe } from '../data/recipes.ts'
import type { ItemVariant } from '../types/game.ts'
import type { Rng } from './Rng.ts'

/**
 * 단어를 실제로 떨어질 물건으로 바꾼다.
 * 플레이어는 Enter를 누른 뒤에야 결과를 보므로, 이 롤은 판정 직후 한 번만 호출된다.
 */
function resolveItem(word: string): ItemVariant {
  const entry = WORD_BY_TEXT.get(word)
  if (entry === undefined) {
    throw new Error(`단어 테이블에 없는 단어: ${word}`)
  }

  const base = entry.variants[0]
  if (base === undefined) {
    throw new Error(`변형이 비어있는 단어: ${word}`)
  }

  return base
}

/**
 * 합성이 끝났을 때 실제로 나올 물건을 정한다.
 *
 * 단어 입력은 항상 기본 물건을 떨어뜨리고, 히든은 합성 결과로만 만난다. 어떤 레시피는
 * 기본 결과와 같은 속성의 다른 형태를 낮은 확률로 내놓는다.
 *
 * 판의 난수를 쓰므로 같은 시드면 같은 결과가 나온다.
 */
function resolveCrafted(recipe: Recipe, rng: Rng, chance: number = HIDDEN_CHANCE): ItemVariant {
  if (recipe.hiddenResults.length === 0 || rng.next() >= chance) {
    return recipe.result
  }
  return rng.pick(recipe.hiddenResults)
}

export { resolveItem, resolveCrafted }
