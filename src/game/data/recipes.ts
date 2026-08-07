import { VARIANT_BY_ID } from './words.ts'
import type { ItemVariant } from '../types/game.ts'

/**
 * 합성 레시피.
 *
 * 재료가 서로 닿으면 합쳐져 새 물건이 된다. 재료는 같은 물건 둘일 수도 있고
 * 서로 다른 물건일 수도 있으며, 개수도 둘로 고정되지 않는다 — 그래서 `inputs`는
 * 변형 id의 **다중집합**이다. 순서는 의미가 없다.
 *
 * 합성 결과는 언제나 히든이다. 이 게임에서 기대하는 재미가 "무엇이 나올까"이고,
 * 운으로만 만나던 히든을 손으로 만들어낼 수 있게 하는 것이 합성의 목적이다.
 * 운으로 나오는 히든은 그대로 유효하다 — 얻는 길이 둘로 늘어난 것이다.
 *
 * ## 결과물은 재료보다 작다
 *
 * 받침대에는 벽이 없어서 폭이 곧 위험이다. 재료 셋이 차지하던 자리를 하나가
 * 대신하므로 합성은 숨통을 틔워주는 **보상**이 된다. 합쳐서 커지면 위태로운
 * 순간에 합성을 피하게 되고, 그러면 "합쳐보고 싶다"는 마음이 사라진다.
 * `tests/recipes.test.ts`가 이 관계를 지킨다.
 *
 * ## 지금은 같은 물건끼리만이다
 *
 * 서로 다른 물건을 합친 결과에는 그것을 그린 새 스티커가 필요한데(이 프로젝트는
 * 아트 없는 물건을 만들 수 없다), 아직 없다. 그래서 시작 세트는 이미 있는
 * 히든 아트를 결과로 쓰는 같은 물건 조합뿐이다. 규칙과 코드는 재료 수와 종류를
 * 가리지 않으므로, 새 아트가 오면 이 배열에 줄을 더하는 것으로 끝난다.
 */
interface Recipe {
  readonly id: string
  /** 재료 변형 id의 다중집합. 순서는 상관없다 */
  readonly inputs: readonly string[]
  readonly result: ItemVariant
}

function recipe(inputs: readonly string[], resultId: string): Recipe {
  const result = VARIANT_BY_ID.get(resultId)
  if (result === undefined) {
    throw new Error(`레시피 결과물이 없다: ${resultId}`)
  }
  for (const input of inputs) {
    if (!VARIANT_BY_ID.has(input)) {
      throw new Error(`레시피 재료가 없다: ${input}`)
    }
  }
  if (inputs.length < 2) {
    throw new Error(`재료가 둘은 되어야 한다: ${resultId}`)
  }
  return { id: `${[...inputs].sort().join('+')}=${resultId}`, inputs, result }
}

const RECIPES: readonly Recipe[] = [
  recipe(['clover', 'clover'], 'clover-lucky'),
  recipe(['leaf', 'leaf'], 'leaf-maple'),
  recipe(['snail', 'snail'], 'snail-curled'),
  recipe(['iced-drink', 'iced-drink'], 'cocktail'),
  recipe(['pizza-slice', 'pizza-slice'], 'pizza-box'),
  recipe(['laptop', 'laptop'], 'laptop-closed'),
  recipe(['umbrella', 'umbrella'], 'umbrella-folded'),
]

/** 합성으로 만들 수 있는 물건들. 도감이 "아직 못 만든 것"을 세는 데 쓴다 */
const CRAFTABLE_IDS: readonly string[] = [...new Set(RECIPES.map((r) => r.result.id))]

/** 재료로 쓰이는 물건인지. 화면이 "이건 합칠 수 있다"고 귀띔하는 데 쓴다 */
const INGREDIENT_IDS: ReadonlySet<string> = new Set(RECIPES.flatMap((r) => r.inputs))

export { RECIPES, CRAFTABLE_IDS, INGREDIENT_IDS }
export type { Recipe }
