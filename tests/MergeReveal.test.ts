import { describe, expect, it } from 'vitest'
import { RECIPES } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'

/**
 * 합성 연출은 결과물과 함께 **재료 그림**을 받아 모이는 장면을 그린다
 * (`GameEngine.tryMerge` → `ArenaRenderer.drawGathering`).
 *
 * 재료를 찾는 길은 `recipes.ts`의 id 문자열 → `VARIANT_BY_ID`뿐이라, 물건 이름을 바꾸거나
 * 아트를 갈아끼우다 한쪽만 고치면 그 줄이 조용히 빈다. 그러면 화면은 멀쩡하다 —
 * 결과물과 이름은 그대로 뜨고 모이는 장면만 사라진다. 합성은 판당 0.27회라
 * 실기로는 한참 뒤에야 눈치챈다.
 */
describe('합성 연출이 재료를 찾을 수 있다', () => {
  it('모든 레시피의 재료가 변형 표에 있다', () => {
    const missing = [
      ...new Set(RECIPES.flatMap((item) => item.inputs).filter((id) => !VARIANT_BY_ID.has(id))),
    ]
    expect(missing, `표에 없는 재료: ${missing.join(', ')}`).toEqual([])
  })

  it('재료마다 그릴 그림이 있다', () => {
    for (const recipe of RECIPES) {
      for (const id of recipe.inputs) {
        expect(VARIANT_BY_ID.get(id)?.sprite, id).toBeTruthy()
      }
    }
  })

  it('재료가 출발 방향보다 많지 않다', () => {
    /*
     * 방향이 모자라면 재료 둘이 같은 자리에서 출발해 하나로 보인다.
     * `ArenaRenderer`의 `GATHER_FROM` 길이와 같아야 한다 — 그쪽을 여기서 읽지 않는
     * 이유는 렌더러가 canvas를 아는 모듈이고 이 검사는 node에서 도는 자리이기 때문이다.
     */
    const GATHER_DIRECTIONS = 6
    for (const recipe of RECIPES) {
      expect(recipe.inputs.length, recipe.id).toBeLessThanOrEqual(GATHER_DIRECTIONS)
    }
  })
})
