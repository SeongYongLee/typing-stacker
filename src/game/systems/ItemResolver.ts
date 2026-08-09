import { HIDDEN_CHANCE } from '../config.ts'
import { WORD_BY_TEXT } from '../data/words.ts'
import type { Recipe } from '../data/recipes.ts'
import type { ItemVariant } from '../types/game.ts'
import type { Rng } from './Rng.ts'

/**
 * 단어를 실제로 떨어질 물건으로 바꾼다.
 * 플레이어는 Enter를 누른 뒤에야 결과를 보므로, 이 롤은 판정 직후 한 번만 호출된다.
 *
 * `chance`를 밖에서 줄 수 있는 이유는 **구간마다 밀도가 달라야** 하기 때문이다.
 * 판 앞머리는 히든 보유 단어만 내보내므로 같은 확률이라도 밀도가 일곱 배로 뛴다 —
 * 그 자리에서는 낮은 값을 넘긴다(`OPENING_HIDDEN_CHANCE`).
 */
function resolveItem(word: string, rng: Rng, chance: number = HIDDEN_CHANCE): ItemVariant {
  const entry = WORD_BY_TEXT.get(word)
  if (entry === undefined) {
    throw new Error(`단어 테이블에 없는 단어: ${word}`)
  }

  const base = entry.variants[0]
  if (base === undefined) {
    throw new Error(`변형이 비어있는 단어: ${word}`)
  }

  const hidden = entry.variants.filter((item) => item.hidden)
  if (hidden.length === 0 || rng.next() >= chance) {
    return base
  }
  return rng.pick(hidden)
}

/**
 * 합성이 끝났을 때 실제로 나올 물건을 정한다.
 *
 * **`resolveItem`과 같은 일을 합성 쪽에서 한다.** 단어에 매달린 물건이 기본형과
 * 히든을 갖듯 합성 결과물도 그렇고(`Recipe.hiddenResults`), 확률도 같은 값을 쓴다 —
 * 얻는 경로가 다를 뿐 플레이어에게는 "무엇이 나올까"라는 같은 종류의 사건이다.
 *
 * 두 함수를 합치지 않은 것은 **찾는 방법이 다르기 때문**이다. 이쪽은 단어가 없어
 * 표를 뒤지지 않고 이미 정해진 레시피를 받는다. 뽑는 규칙만 같다.
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
