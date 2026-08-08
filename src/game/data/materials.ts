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
  'rice-plant': 'paper',
  'treasure-map': 'paper',
  'study-book': 'paper',
  'paper-airplane': 'paper',
  'secret-diary': 'paper',
  'travel-album': 'paper',

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
  /* 액체가 든 종이팩. 마른 종이처럼 바스락거리지 않고 둔하게 내려앉는다 */
  'milk-carton': 'squish',
  'strawberry-milk': 'squish',
  egg: 'squish',
  'salmon-fish': 'squish',
  'salmon-sushi': 'squish',

  /* 유리와 담긴 음료 — 맑게 울린다 */
  'iced-drink': 'glass',
  cocktail: 'glass',
  beer: 'glass',
  americano: 'glass',
  'hand-mirror': 'glass',
  window: 'glass',
  'round-glasses': 'glass',
  /* 빛나는 것은 유리처럼 맑게 울린다. 실제 재료가 아니라 들리는 결과가 기준이다 */
  'crescent-moon': 'glass',
  sunlight: 'glass',
  'mirror-ball': 'glass',
  'glass-shards': 'glass',

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
  iron: 'metal',
  'old-key': 'metal',
  padlock: 'metal',
  telescope: 'metal',
  compass: 'metal',
  'gold-star': 'metal',
  'gold-medal': 'metal',
  'heart-ring': 'metal',
  /* 팬에 담긴 채로 나온다 — 닿는 것은 계란이 아니라 무쇠다 */
  'fried-egg': 'metal',

  /* 나무 — 짧고 둔한 "톡" */
  'pine-tree': 'wood',
  'christmas-tree': 'wood',
  'toy-train': 'wood',
  cactus: 'wood',
  /* 이 게임에서 가장 작은 물건. 작고 마르고 단단하다 */
  'sunflower-seed': 'wood',
  'baseball-bat': 'wood',
  broom: 'wood',
  /* 등딱지가 단단하다 */
  turtle: 'wood',
  'treasure-chest': 'wood',
  'magic-wand': 'wood',

  /* 천과 솜 — 거의 소리가 없다 */
  scarf: 'cloth',
  'wool-hat': 'cloth',
  'school-backpack': 'cloth',
  sneakers: 'cloth',
  'blue-shirt': 'cloth',
  rabbit: 'cloth',
  'quill-feather': 'cloth',
  'spider-web': 'cloth',
  /* 자국은 실체가 없다. 넷 중 가장 조용한 자리가 맞다 */
  footprints: 'cloth',
  'burnt-hole-shirt': 'cloth',
  'racing-flag': 'cloth',
  'graduation-cap': 'cloth',
  /* 냄새에는 실체가 없다. 발자국과 같은 자리 */
  'fart-cloud': 'cloth',

  /* 고무 — 튄다 */
  'soccer-ball': 'rubber',
  'rubber-gloves': 'rubber',
  heart: 'rubber',

  /* 단단한 플라스틱 — 마른 "딱" */
  bento: 'plastic',
  'shampoo-bottle': 'plastic',
  'dinosaur-toy': 'plastic',
  'roller-skates': 'plastic',
  sunglasses: 'plastic',
  'desk-globe': 'plastic',
  /* 초는 밀랍이라 울리지 않고 둔하게 닿는다 */
  candle: 'plastic',
  'travel-suitcase': 'plastic',

  /* 기계 — 무겁게 내려앉고 끝에 금속이 한 번 */
  laptop: 'tech',
  'laptop-closed': 'tech',
  airplane: 'tech',
  umbrella: 'tech',
  'umbrella-folded': 'tech',
  camera: 'tech',
  spaceship: 'tech',
  'internet-router': 'tech',

  /* 번개 — 물건이 아니다 */
  bolt: 'spark',
  'shooting-star': 'spark',
  stardust: 'spark',
}

/** 표에 없으면 이것. `tests/materials.test.ts`가 빠진 물건을 잡는다 */
const DEFAULT_MATERIAL: Material = 'plastic'

function materialOf(id: string): Material {
  return MATERIALS[id] ?? DEFAULT_MATERIAL
}

/** id를 0~1로 흩는다. 순서를 섞는 데만 쓴다 */
function hashOf(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 8) / 0x1000000
}

/**
 * 재질 안에서 물건들을 0~1에 고르게 펴둔 표.
 *
 * 해시값을 그대로 개체값으로 쓰려다 그만뒀다. 해시는 고르게 흩어지는 것처럼 보여도
 * **뭉치는 자리가 생긴다** — 실제로 물컹한 것 13종 중 둘이 0.0016 차이로 붙어서,
 * 음높이로 치면 0.01반음이라 완전히 같은 소리였다. 물건 수가 늘수록 이런 짝이
 * 반드시 나온다(생일 문제).
 *
 * 그래서 순서만 해시로 정하고 **자리는 등간격으로 나눠준다.** 13종이면 1/13씩
 * 벌어지므로 가장 가까운 둘도 확실히 갈린다. 순서를 해시로 섞는 이유는 이름순으로
 * 두면 비슷한 이름이 비슷한 음높이를 갖게 되어서다.
 */
const TONES: ReadonlyMap<string, number> = (() => {
  const grouped = new Map<Material, string[]>()
  for (const [id, material] of Object.entries(MATERIALS)) {
    const list = grouped.get(material) ?? []
    list.push(id)
    grouped.set(material, list)
  }

  const tones = new Map<string, number>()
  for (const list of grouped.values()) {
    const ordered = [...list].sort((a, b) => hashOf(a) - hashOf(b))
    ordered.forEach((id, index) => {
      // 양 끝에 붙지 않게 반 칸 안으로 들여놓는다
      tones.set(id, (index + 0.5) / ordered.length)
    })
  }
  return tones
})()

/**
 * 같은 재질 안에서 개체를 가르는 값(0~1).
 *
 * 재질만으로는 유리잔과 칵테일이 똑같은 소리를 낸다. 이 값으로 음높이를 몇 반음 밀어
 * 같은 무리에 속하면서도 **물건마다 제 소리**를 갖게 한다.
 *
 * 난수가 아니라 id로 정해지는 것이 중요하다 — 같은 물건은 언제 떨어져도 같은 소리를
 * 내야 하고, 그래야 반복하는 동안 "저건 텀블러다"가 귀에 익는다.
 */
function toneOf(id: string): number {
  return TONES.get(id) ?? hashOf(id)
}

export { MATERIALS, DEFAULT_MATERIAL, materialOf, toneOf }
