import { INGREDIENT_IDS } from '../data/recipes.ts'
import type { WordEntry } from '../types/game.ts'

/**
 * 밤에 내보낼 단어 — **재료가 되는 것만.**
 *
 * 다른 게임의 피버타임 자리다. 낮에는 재료가 단어 78개에 흩어져 있어 짝이 좀처럼
 * 갖춰지지 않는데, 밤에는 내려오는 것이 전부 재료라 치는 족족 짝이 된다.
 *
 * ## 첫 밤과 무엇이 다른가
 *
 * 첫 밤(`Opening.ts`)은 **같은 물건 둘짜리** 재료 둘로 더 좁힌다. 한 단어를 두 번
 * 치면 갖춰지므로 합성이 무엇인지 배우기에 좋다. 그 뒤의 밤은 배우는 구간이 아니라
 * 몰아치는 구간이라 **모든 재료**를 연다 — 좁으면 아는 짝만 되풀이되어 몰아치는
 * 맛이 없다.
 *
 * ## 끈적한 것을 빼지 않는 이유
 *
 * 첫 밤은 쌓기를 배우는 구간이라 닿는 것을 붙여버리는 물건을 뺐다. 밤은 이미 쌓기를
 * 아는 사람이 맞는 구간이고, 붙는 물건이 오히려 짝을 그 자리에 잡아둬 합성에 보탬이 된다.
 *
 * 브라우저도 물리도 모르는 순수 함수라 node에서 그대로 시험한다.
 */
function nightEntries(entries: readonly WordEntry[]): readonly WordEntry[] {
  const found = entries.filter((entry) =>
    entry.variants.some((variant) => !variant.hidden && INGREDIENT_IDS.has(variant.id)),
  )
  /*
   * 하나도 없으면 전체를 돌려준다. 빈 밭을 넘기면 스포너가 아무것도 못 내보내고
   * 밤 내내 손이 멈춘다 — 레시피를 손보다 재료가 사라져도 판은 굴러가야 한다.
   */
  return found.length > 0 ? found : entries
}

export { nightEntries }
