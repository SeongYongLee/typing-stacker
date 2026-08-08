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
 * ## 결과물이 사는 곳은 둘이다
 *
 * 같은 물건 둘을 합친 결과는 **그 물건의 히든**이다(피자 조각 둘 → 피자 한 판).
 * 운으로도 만날 수 있고 손으로도 만들 수 있는, 얻는 길이 둘인 물건이다.
 *
 * 서로 다른 물건을 합친 결과는 재료 어느 쪽의 다른 형태도 아니라서 어느 단어에도
 * 매달 수 없다. 그래서 `words.ts`의 `CRAFTED`에 따로 산다 — 타이핑으로는 절대
 * 떨어지지 않고 합성으로만 나온다.
 *
 * ## 히든이라고 전부 레시피가 있는 것은 아니다
 *
 * 접힌 우산은 여기에 없다 — 운으로만 만난다. 도감은 레시피가 없는 물건을
 * 그렇게 표시하므로(`recipeFor`가 null), 빠진 줄이 화면에서 그대로 드러난다.
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
  /* 같은 것 둘 — 결과가 그 물건의 히든이다 */
  recipe(['clover', 'clover'], 'clover-lucky'),
  recipe(['leaf', 'leaf'], 'leaf-maple'),
  recipe(['snail', 'snail'], 'snail-curled'),
  recipe(['iced-drink', 'iced-drink'], 'cocktail'),
  recipe(['pizza-slice', 'pizza-slice'], 'pizza-box'),
  recipe(['laptop', 'laptop'], 'laptop-closed'),
  recipe(['sausage', 'sausage'], 'octopus'),

  /* 보이는 대로 — 재료를 보면 결과가 짐작된다 */
  recipe(['sunflower-seed', 'watering-can'], 'sunflower'),
  recipe(['iron', 'blue-shirt'], 'burnt-hole-shirt'),
  recipe(['egg', 'frying-pan'], 'fried-egg'),
  recipe(['window', 'baseball-bat'], 'glass-shards'),

  /* 뜻이 겹쳐서 — 두 물건이 같은 이야기를 가리킨다 */
  recipe(['pine-tree', 'gold-star'], 'christmas-tree'),
  recipe(['rice-plant', 'salmon-fish'], 'salmon-sushi'),
  recipe(['crescent-moon', 'alarm-clock'], 'sunlight'),
  recipe(['rabbit', 'turtle'], 'racing-flag'),
  recipe(['bolt', 'sneakers'], 'gold-medal'),
  recipe(['heart', 'candle'], 'heart-ring'),
  recipe(['milk-carton', 'school-backpack'], 'fart-cloud'),
  recipe(['old-key', 'treasure-map'], 'treasure-chest'),
  recipe(['padlock', 'quill-feather'], 'secret-diary'),
  recipe(['telescope', 'shooting-star'], 'spaceship'),
  recipe(['camera', 'footprints'], 'travel-album'),
  recipe(['round-glasses', 'study-book'], 'graduation-cap'),
  recipe(['broom', 'stardust'], 'magic-wand'),
  recipe(['compass', 'paper-airplane'], 'travel-suitcase'),

  /* 말장난 — 거울 달린 지구본이 미러볼이고, 지구를 잇는 거미줄이 공유기다 */
  recipe(['hand-mirror', 'desk-globe'], 'mirror-ball'),
  recipe(['desk-globe', 'spider-web'], 'internet-router'),
]

/** 합성으로 만들 수 있는 물건들. 도감이 "아직 못 만든 것"을 세는 데 쓴다 */
const CRAFTABLE_IDS: readonly string[] = [...new Set(RECIPES.map((r) => r.result.id))]

/** 재료로 쓰이는 물건인지. 화면이 "이건 합칠 수 있다"고 귀띔하는 데 쓴다 */
const INGREDIENT_IDS: ReadonlySet<string> = new Set(RECIPES.flatMap((r) => r.inputs))

export { RECIPES, CRAFTABLE_IDS, INGREDIENT_IDS }
export type { Recipe }
