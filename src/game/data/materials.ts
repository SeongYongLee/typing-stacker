import type { Material } from '../types/game.ts'

/**
 * 물건이 무엇으로 만들어졌는가. 소리를 위한 유일한 분류다.
 *
 * `words.ts`의 57개 블록에 흩어 두지 않고 여기 모은 이유는, **소리를 조율할 때
 * 보아야 하는 것이 물건 하나가 아니라 무리이기 때문**이다. 유리끼리 비슷하고
 * 나무끼리 비슷하되 서로는 확실히 달라야 하는데, 그 균형은 표를 통째로 볼 때만
 * 잡힌다. 물리 값(마찰·밀도)은 물건 하나를 보며 정하므로 그쪽에 남아 있다.
 *
 * ## 재질을 무엇으로 나눴나
 *
 * 실제 물질이 아니라 **부딪혔을 때 나는 소리**로 나눴다. 그래서 스테인리스
 * 텀블러와 자전거가 같은 `metal`이고, 나뭇잎과 피자 박스가 같은 `paper`다 —
 * 둘 다 마른 것이 스치는 소리를 낸다. 눈에 보이는 재료가 아니라 귀에 들리는
 * 결과가 기준이다.
 */
const MATERIALS: Readonly<Record<string, Material>> = {
  /* 자연물 — 마르고 가벼운 것이 스치는 소리 */
  clover: 'paper',
  'clover-lucky': 'paper',
  leaf: 'paper',
  'leaf-maple': 'paper',
  sunflower: 'paper',
  'pizza-box': 'paper',

  /* 살아 있는 것과 물컹한 것 */
  snail: 'squish',
  'snail-curled': 'squish',
  ladybug: 'squish',
  cricket: 'squish',
  butterfly: 'squish',
  squirrel: 'squish',
  sausage: 'squish',
  octopus: 'squish',
  'pizza-slice': 'squish',
  'fish-bread': 'squish',
  'chocolate-donut': 'squish',
  'french-fries': 'squish',
  'ice-cream-cone': 'squish',

  /* 유리와 담긴 음료 — 맑게 울린다 */
  'iced-drink': 'glass',
  cocktail: 'glass',
  beer: 'glass',
  americano: 'glass',
  'strawberry-milk': 'glass',

  /* 금속 — 배음이 어긋나게 남는다 */
  tumbler: 'metal',
  'frying-pan': 'metal',
  'electric-kettle': 'metal',
  'watering-can': 'metal',
  'alarm-clock': 'metal',
  flashlight: 'metal',
  bicycle: 'metal',
  refrigerator: 'metal',
  'washing-machine': 'metal',
  microwave: 'metal',
  'badminton-racket': 'metal',
  binoculars: 'metal',

  /* 나무 — 짧고 둔한 "톡" */
  'pine-tree': 'wood',
  'christmas-tree': 'wood',
  'toy-train': 'wood',
  cactus: 'wood',

  /* 천과 솜 — 거의 소리가 없다 */
  scarf: 'cloth',
  'wool-hat': 'cloth',
  'school-backpack': 'cloth',
  sneakers: 'cloth',

  /* 고무 — 튄다 */
  'soccer-ball': 'rubber',
  'rubber-gloves': 'rubber',

  /* 단단한 플라스틱 — 마른 "딱" */
  bento: 'plastic',
  'shampoo-bottle': 'plastic',
  'dinosaur-toy': 'plastic',
  'roller-skates': 'plastic',
  sunglasses: 'plastic',

  /* 기계 — 무겁게 내려앉고 끝에 금속이 한 번 */
  laptop: 'tech',
  'laptop-closed': 'tech',
  airplane: 'tech',
  umbrella: 'tech',
  'umbrella-folded': 'tech',

  /* 번개 — 물건이 아니다 */
  bolt: 'spark',
}

/** 표에 없으면 이것. `tests/materials.test.ts`가 빠진 물건을 잡는다 */
const DEFAULT_MATERIAL: Material = 'plastic'

function materialOf(id: string): Material {
  return MATERIALS[id] ?? DEFAULT_MATERIAL
}

/**
 * 같은 재질 안에서 개체를 가르는 값(0~1).
 *
 * 재질만으로는 유리잔과 칵테일이 똑같은 소리를 낸다. id에서 뽑은 이 값으로 음높이를
 * 몇 반음 밀어, 같은 무리에 속하면서도 **물건마다 제 소리**를 갖게 한다.
 *
 * 난수가 아니라 id의 함수인 것이 중요하다 — 같은 물건은 언제 떨어져도 같은 소리를
 * 내야 하고, 그래야 반복하는 동안 "저건 텀블러다"가 귀에 익는다.
 */
function toneOf(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 8) / 0x1000000
}

export { MATERIALS, DEFAULT_MATERIAL, materialOf, toneOf }
