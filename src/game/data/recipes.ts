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
 * ## 합성의 보상은 자리가 아니라 수집이다
 *
 * 예전에는 **결과물이 재료보다 좁아야 한다**는 규칙이 있었다. 받침대에 벽이 없으니
 * 폭이 곧 위험이고, 합성이 자리를 틔워주면 그것이 보상이 된다는 생각이었다.
 *
 * **전제가 틀렸다.** 합성해서 얻는 것은 판 안의 여유가 아니라 판 밖에 남는 것이다 —
 * 도감의 빈 칸이 채워지고, 그 히든을 봤다는 사실이 남고, **프로필 사진으로 쓸 수 있다**
 * (아이콘은 도감에서 모은 물건 중에서만 고를 수 있다. `IconPicker`).
 *
 * 그러니 결과물이 넓어져도 "합쳐보고 싶다"는 사라지지 않는다. 오히려 규칙 쪽이
 * 대가를 물렸다 — 2026-08-09 재작화에서 여행앨범이 세로형에서 가로형으로 다시 그려져
 * 폭이 0.461에서 0.855가 되자, 규칙을 지키려면 **아트가 정한 크기를 줄여야** 했다.
 * 물건마다 크기가 다른 것이 이 게임의 컨셉이므로 규칙을 버렸다.
 *
 * 남아 있는 제약은 하나다: **결과물도 조준 범위를 넘지 않아야 한다**
 * (`MAX_ITEM_HALF_WIDTH`). 그쪽은 취향이 아니라 즉사를 막는 것이다.
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
  /** 대개 나오는 것 */
  readonly result: ItemVariant
  /**
   * 같은 레시피가 낮은 확률로 대신 내놓는 **다른 형태**들. 대개는 비어 있다.
   *
   * 단어에 매달린 물건이 기본형과 히든을 갖는 것과 같은 구조다(`WordEntry.variants`).
   * 합성 결과물은 단어가 없어 그 목록을 가질 수 없었는데, 아트는 처음부터 그것들의
   * 다른 형태를 그려 보내고 있었다 — 우주선의 비행접시, 여행가방의 빈티지 트렁크,
   * 마법봉의 날개 마법봉, 테라리움의 행잉형, 하트반지의 다이아반지.
   *
   * **재료를 맞췄어도 무엇이 나올지는 여전히 모른다.** 확률은 히든과 같은 값을 쓴다
   * (`HIDDEN_CHANCE`) — 얻는 경로가 다를 뿐 플레이어에게는 같은 종류의 사건이다.
   * 뽑는 것은 `resolveCrafted`이고, 판의 난수를 쓰므로 같은 시드면 같은 결과다.
   */
  readonly hiddenResults: readonly ItemVariant[]
}

function recipe(
  inputs: readonly string[],
  resultId: string,
  hiddenIds: readonly string[] = [],
): Recipe {
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
  const hiddenResults = hiddenIds.map((id) => {
    const variant = VARIANT_BY_ID.get(id)
    if (variant === undefined) {
      throw new Error(`레시피의 다른 결과물이 없다: ${id}`)
    }
    return variant
  })
  return { id: `${[...inputs].sort().join('+')}=${resultId}`, inputs, result, hiddenResults }
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
  recipe(['heart', 'candle'], 'heart-ring', ['diamond-ring']),
  recipe(['milk-carton', 'school-backpack'], 'fart-cloud'),
  recipe(['old-key', 'treasure-map'], 'treasure-chest'),
  recipe(['padlock', 'quill-feather'], 'secret-diary'),
  recipe(['telescope', 'shooting-star'], 'spaceship', ['spaceship-saucer']),
  recipe(['camera', 'footprints'], 'travel-album'),
  recipe(['round-glasses', 'study-book'], 'graduation-cap'),
  recipe(['broom', 'stardust'], 'magic-wand', ['winged-wand']),
  recipe(['compass', 'paper-airplane'], 'travel-suitcase', ['vintage-trunk']),

  /* 말장난 — 거울 달린 지구본이 미러볼이고, 지구를 잇는 거미줄이 공유기다 */
  recipe(['hand-mirror', 'desk-globe'], 'mirror-ball'),
  recipe(['desk-globe', 'spider-web'], 'internet-router'),

  /*
   * 재료 셋 이상 — 한 장면을 이루는 물건들이 모여 그 장면이 된다.
   *
   * **여덟은 재료에 다른 합성 결과물이 들어간다**(여행가방·레이싱 깃발·우주선·
   * 계란 프라이·구멍 난 셔츠·햇빛·금메달·마법봉). 그것부터 만들어야 하므로 사슬이
   * 두 단이고, 도감에서 읽으면 그 층이 보인다.
   *
   * **지금 이것들은 사실상 도달 불가능하다.** 재료가 받침대에 동시에 살아 있어야
   * 하는데 단어가 107개라 특정 단어 하나가 한 판에 나올 확률이 15% 남짓이다 —
   * 넷을 모을 확률이 0.06%이고 여섯은 0.0014%다. 그 위에 "서로 닿아야 한다"가
   * 또 걸린다(둘이 닿는 것도 30%다).
   *
   * 그럼에도 지금 넣는 이유는 **레시피가 있어야 도달률을 잴 수 있기 때문**이다.
   * 없는 것은 재지 못하고, 재지 못하면 어떤 장치가 얼마나 필요한지도 모른다.
   * 푸는 순서는 `04_Backlog`에 있다 — 재료를 화면에 알리고, 짝 옆을 노리는 봇으로
   * 접촉률을 다시 재고, 그다음 밭을 좁힌다. 확률을 만져서 메울 간격이 아니다.
   */
  recipe(['airplane', 'travel-suitcase', 'treasure-map', 'camera'], 'travel-passport'),
  recipe(['racing-flag', 'toy-car', 'toy-train'], 'speed-course'),
  recipe(['spaceship', 'telescope', 'shooting-star', 'desk-globe'], 'space-poster'),
  recipe(['footprints', 'compass', 'binoculars', 'flashlight'], 'explorer-badge'),
  recipe(['bento', 'triangle-gimbap', 'octopus', 'fried-egg'], 'picnic-basket'),
  recipe(['pizza-slice', 'french-fries', 'beer', 'iced-drink'], 'pub-platter'),
  recipe(['macaron', 'chocolate-donut', 'ice-cream-cone', 'biscuit'], 'dessert-tower'),
  recipe(['clover', 'sunflower-seed', 'sunflower', 'watering-can'], 'lucky-flowerpot'),
  recipe(
    ['mushroom', 'snail', 'leaf', 'butterfly', 'crystal', 'ladybug'],
    'terrarium',
    ['hanging-terrarium'],
  ),
  recipe(['snowflake', 'christmas-tree', 'gold-star', 'candle'], 'snow-globe'),
  recipe(['burnt-hole-shirt', 'iron', 'washing-machine', 'clothes-hanger'], 'repair-shop'),
  recipe(['school-backpack', 'sketchbook', 'pencil-set', 'crank-sharpener'], 'art-bag'),
  recipe(['rubber-gloves', 'shampoo-bottle', 'toilet-paper', 'bubble-bottle'], 'cleaning-set'),
  recipe(['hand-fan', 'kids-bottle', 'cactus', 'sunlight'], 'survival-kit'),
  recipe(['soccer-ball', 'badminton-racket', 'gold-medal'], 'sports-trophy'),
  recipe(['padlock', 'study-book', 'stardust', 'quill-feather'], 'magic-book'),
  recipe(['hand-mirror', 'stardust', 'wooden-door', 'magic-wand', 'crescent-moon'], 'mirror-door'),
]

/** 합성으로 만들 수 있는 물건들. 도감이 "아직 못 만든 것"을 세는 데 쓴다 */
const CRAFTABLE_IDS: readonly string[] = [
  ...new Set(RECIPES.flatMap((r) => [r.result.id, ...r.hiddenResults.map((v) => v.id)])),
]

/** 재료로 쓰이는 물건인지. 화면이 "이건 합칠 수 있다"고 귀띔하는 데 쓴다 */
const INGREDIENT_IDS: ReadonlySet<string> = new Set(RECIPES.flatMap((r) => r.inputs))

/**
 * **같은 물건 둘**로 이루어진 레시피의 재료들.
 *
 * 이것들만 따로 뽑아두는 이유는 **가장 쉽게 합쳐지는 짝**이기 때문이다. 재료가 같으니
 * 한 단어를 두 번 치면 갖춰지고, 도형까지 같아서 위에 얹으면 대체로 닿는다 —
 * 서로 다른 물건을 합치는 쪽은 크기와 모양이 달라 열에 일곱이 미끄러진다.
 *
 * 판이 시작될 때 이 중 몇 개만 내보내 첫 합성을 앞당기는 데 쓴다(`systems/Opening.ts`).
 */
const PAIR_INGREDIENT_IDS: readonly string[] = [
  ...new Set(
    RECIPES.filter(
      (item) => item.inputs.length === 2 && item.inputs[0] === item.inputs[1],
    ).map((item) => item.inputs[0] ?? ''),
  ),
].filter((id) => id !== '')

export { RECIPES, CRAFTABLE_IDS, INGREDIENT_IDS, PAIR_INGREDIENT_IDS }
export type { Recipe }
