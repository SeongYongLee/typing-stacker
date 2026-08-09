import type { Material } from '../types/game.ts'

/**
 * 물건이 무엇으로 만들어졌는가. 소리와 튐을 정하는 유일한 분류다.
 *
 * `words.ts`의 물건 블록에 흩어 두지 않고 여기 모은 이유는, **조율할 때 보아야 하는
 * 것이 물건 하나가 아니라 무리이기 때문**이다. 유리끼리 비슷하고 나무끼리 비슷하되
 * 서로는 확실히 달라야 하는데, 그 균형은 표를 통째로 볼 때만 잡힌다. 마찰·밀도는
 * 물건 하나를 보며 정하므로 그쪽에 남아 있다 — 튐만 이쪽인 이유는 `BOUNCE`에 있다.
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
  'map-world-map': 'paper',
  'study-book': 'paper',
  'paper-airplane': 'paper',
  'secret-diary': 'paper',
  'travel-album': 'paper',
  sketchbook: 'paper',
  'sketchbook-open': 'paper',
  'toilet-paper': 'paper',
  'tissue-box': 'paper',
  'travel-passport': 'paper',
  'space-poster': 'paper',
  'magic-book': 'paper',

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
  /* 통이 없어 밥과 계란만 닿는다 */
  'lunchbox-bear-omelet-rice': 'squish',
  'strawberry-milk': 'squish',
  egg: 'squish',
  'salmon-fish': 'squish',
  'salmon-sushi': 'squish',
  'triangle-gimbap': 'squish',
  macaron: 'squish',
  'macaron-bear': 'squish',
  mushroom: 'squish',

  /* 유리와 담긴 음료 — 맑게 울린다 */
  'iced-drink': 'glass',
  cocktail: 'glass',
  beer: 'glass',
  'beer-bottle': 'glass',
  americano: 'glass',
  'americano-iced': 'glass',
  'hand-mirror': 'glass',
  window: 'glass',
  'round-glasses': 'glass',
  /* 빛나는 것은 유리처럼 맑게 울린다. 실제 재료가 아니라 들리는 결과가 기준이다 */
  'crescent-moon': 'glass',
  sunlight: 'glass',
  'mirror-ball': 'glass',
  'glass-shards': 'glass',
  snowflake: 'glass',
  crystal: 'glass',
  'dessert-tower': 'glass',
  terrarium: 'glass',
  'snow-globe': 'glass',
  'mirror-door': 'glass',

  /* 금속 — 배음이 어긋나게 남는다 */
  tumbler: 'metal',
  'frying-pan': 'metal',
  'electric-kettle': 'metal',
  'electric-kettle-gooseneck': 'metal',
  'watering-can': 'metal',
  'alarm-clock': 'metal',
  flashlight: 'metal',
  bicycle: 'metal',
  'bicycle-folding': 'metal',
  refrigerator: 'metal',
  'washing-machine': 'metal',
  microwave: 'metal',
  'badminton-racket': 'metal',
  binoculars: 'metal',
  iron: 'metal',
  'old-key': 'metal',
  padlock: 'metal',
  telescope: 'metal',
  'telescope-spyglass': 'metal',
  compass: 'metal',
  'gold-star': 'metal',
  'gold-medal': 'metal',
  'heart-ring': 'metal',
  'traffic-light': 'metal',
  'trash-bin': 'metal',
  'fire-extinguisher': 'metal',
  wristwatch: 'metal',
  /* 갓은 천이지만 부딪히는 것은 받침과 기둥이다 */
  'desk-lamp': 'metal',
  'gooseneck-lamp': 'metal',
  /* 팬에 담긴 채로 나온다 — 닿는 것은 계란이 아니라 무쇠다 */
  'fried-egg': 'metal',
  'explorer-badge': 'metal',
  'sports-trophy': 'metal',

  /* 나무 — 짧고 둔한 "톡" */
  'pine-tree': 'wood',
  'christmas-tree': 'wood',
  'toy-train': 'wood',
  cactus: 'wood',
  'cactus-mexican-character': 'wood',
  /* 이 게임에서 가장 작은 물건. 작고 마르고 단단하다 */
  'sunflower-seed': 'wood',
  'baseball-bat': 'wood',
  broom: 'wood',
  /* 등딱지가 단단하다 */
  turtle: 'wood',
  'turtle-sea-turtle': 'wood',
  /* 우유병을 실은 나무 수레 — 닿는 것은 병이 아니라 수레다 */
  'milk-vintage-cart': 'wood',
  'treasure-chest': 'wood',
  'magic-wand': 'wood',
  'wooden-door': 'wood',
  /* 상자가 아니라 안에 든 나무 연필들이 달그락거린다 */
  'pencil-set': 'wood',
  /* 마른 과자는 부러지는 소리라 물컹한 쪽이 아니다 */
  biscuit: 'wood',
  /* 등나무와 나무 접시 — 담긴 것이 아니라 그릇이 닿는다 */
  'picnic-basket': 'wood',
  'pub-platter': 'wood',
  /* 건물이라 나무판이 부딪히는 소리다 */
  'repair-shop': 'wood',

  /* 천과 솜 — 거의 소리가 없다 */
  scarf: 'cloth',
  'wool-hat': 'cloth',
  'wool-hat-nordic-earflap': 'cloth',
  'school-backpack': 'cloth',
  sneakers: 'cloth',
  'blue-shirt': 'cloth',
  rabbit: 'cloth',
  'quill-feather': 'cloth',
  'spider-web': 'cloth',
  /* 자국은 실체가 없다. 넷 중 가장 조용한 자리가 맞다 */
  footprints: 'cloth',
  'footprints-dinosaur': 'cloth',
  'burnt-hole-shirt': 'cloth',
  'racing-flag': 'cloth',
  'graduation-cap': 'cloth',
  /* 냄새에는 실체가 없다. 발자국과 같은 자리 */
  'fart-cloud': 'cloth',
  'art-bag': 'cloth',
  'survival-kit': 'cloth',

  /* 고무 — 튄다 */
  'soccer-ball': 'rubber',
  'rubber-gloves': 'rubber',
  heart: 'rubber',

  /* 단단한 플라스틱 — 마른 "딱" */
  bento: 'plastic',
  /*
   * 같은 단어의 두 형태가 다른 무리에 앉는 경우다. 쌍종 알람시계는 금속이고
   * 디지털은 플라스틱 껍데기이며, 나무 기차와 달리 고속열차는 플라스틱 차체다.
   * 기준이 물건의 이름이 아니라 **부딪혔을 때 나는 소리**라 이렇게 갈린다.
   */
  'alarm-clock-digital': 'plastic',
  'toy-train-bullet-train': 'plastic',
  'shampoo-bottle': 'plastic',
  'dinosaur-toy': 'plastic',
  'dinosaur-toy-triceratops': 'plastic',
  'roller-skates': 'plastic',
  sunglasses: 'plastic',
  'sunglasses-black-narrow-frame': 'plastic',
  'desk-globe': 'plastic',
  /* 초는 밀랍이라 울리지 않고 둔하게 닿는다 */
  candle: 'plastic',
  'travel-suitcase': 'plastic',
  'desk-phone': 'plastic',
  headphones: 'plastic',
  'tv-remote': 'plastic',
  'crank-sharpener': 'plastic',
  'handheld-sharpener': 'plastic',
  'first-aid-kit': 'plastic',
  'laundry-basket': 'plastic',
  'clothes-hanger': 'plastic',
  'toy-car': 'plastic',
  'dump-truck': 'plastic',
  'bubble-bottle': 'plastic',
  'hand-fan': 'plastic',
  'kids-bottle': 'plastic',
  'speed-course': 'plastic',
  'lucky-flowerpot': 'plastic',
  'cleaning-set': 'plastic',

  /* 기계 — 무겁게 내려앉고 끝에 금속이 한 번 */
  laptop: 'tech',
  'laptop-closed': 'tech',
  airplane: 'tech',
  'airplane-biplane': 'tech',
  umbrella: 'tech',
  'umbrella-folded': 'tech',
  camera: 'tech',
  'digital-camera': 'tech',
  spaceship: 'tech',
  'internet-router': 'tech',
  smartphone: 'tech',
  keyboard: 'tech',
  speaker: 'tech',
  'stick-vacuum': 'tech',
  'robot-vacuum': 'tech',
  smartwatch: 'tech',

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

/**
 * 얼마나 튀는가. 물건이 아니라 **재질**이 정한다.
 *
 * 마찰·밀도와 달리 이것을 무리로 정하는 이유는, 튐이 물건 하나를 보며 고를 값이
 * 아니기 때문이다 — 고무는 전부 튀고 천은 전부 죽는다. 예전에는 107종 중 14종만
 * 값을 갖고 나머지 93종이 기본값 0.02로 **완전히 같았다.** 손끝에서 물건을 가르는
 * 가장 강한 신호인데 비어 있던 축이다.
 *
 * 값이 작은 것은 벽이 없는 받침대 때문이다. 튀면 곧 이탈이라 튐은 "얹히는 순간의
 * 성질"까지만 말하고 그 이상 가지 않는다. 물건별로 더 필요하면 `words.ts`에서
 * `restitution`을 적어 덮는다 — 축구공처럼 튐이 곧 정체인 물건이 그렇다.
 *
 * 재질 표를 함께 쓰므로 **소리 분류를 옮기면 튐도 따라 바뀐다.** 분류 기준이
 * "귀에 들리는 결과"라 물질과 어긋나는 자리가 있는데(빛나는 것이 `glass`),
 * 그것들은 애초에 실체가 없어 어느 값이든 무리가 없다.
 */
const BOUNCE: Readonly<Record<Material, number>> = {
  /* 튀는 것이 이름인 재질 */
  rubber: 0.34,
  glass: 0.14,
  metal: 0.12,
  plastic: 0.11,
  wood: 0.07,
  /* 번개는 물건이 아니라 튀어도 어색하지 않다 */
  spark: 0.16,
  /* 무겁게 내려앉는 것들 — 튀면 무게가 사라진다 */
  tech: 0.03,
  paper: 0.03,
  squish: 0.02,
  /* 푹 죽는다. 얹혔다는 것만 남는다 */
  cloth: 0.01,
}

function bounceOf(material: Material): number {
  return BOUNCE[material]
}

/**
 * id를 0~1로 흩는다. 순서를 섞는 데만 쓴다.
 *
 * 소리와 도감이 함께 쓴다 — 둘 다 "무작위처럼 보이되 언제나 같아야 하는" 순서가
 * 필요하다. 난수로 섞으면 소리는 물건마다 음높이가 매번 달라지고, 도감은 열 때마다
 * 칸이 옮겨 다녀 어제 본 것을 못 찾는다.
 */
function hashOf(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 8) / 0x1000000
}

/**
 * 재질 안에서 물건들이 앉는 자리. **한 줄이 아니라 격자다.**
 *
 * 해시값을 그대로 쓰려다 그만뒀다. 해시는 고르게 흩어지는 것처럼 보여도 **뭉치는
 * 자리가 생긴다** — 물컹한 것 13종 중 둘이 0.0016 차이로 붙어서, 음높이로 치면
 * 0.01반음이라 완전히 같은 소리였다. 물건 수가 늘수록 이런 짝이 반드시 나온다.
 * 그래서 순서만 해시로 정하고 자리는 등간격으로 나눈다.
 *
 * ## 왜 줄이 아니라 격자인가
 *
 * 등간격으로 폈어도 **한 줄에 21개를 밀어 넣으면 결국 좁다.** 금속의 음높이 폭이
 * 10반음인데 21종이 나눠 가지면 이웃끼리 0.48반음이고, 천은 폭 3반음에 13종이라
 * 0.23반음이었다 — 등간격이라는 것만 지켰지 귀에는 같은 소리다.
 *
 * 음높이를 더 벌리는 것으로는 못 푼다. 폭을 넓히면 같은 재질이 한 무리로 들리지
 * 않게 되는데, 유리끼리 비슷하고 나무끼리 비슷한 것이야말로 재질을 나눈 이유다.
 *
 * 그래서 **축을 하나 더 만든다.** 음높이와 울림의 결(길이·잡음 밝기)로 격자를 짜고
 * 물건을 칸마다 앉힌다. 21종이 5×5에 흩어지면 음높이는 다섯 칸만 쓰므로 이웃 간격이
 * 2반음으로 벌어지고, 같은 음높이인 것들은 울림이 갈라놓는다. 폭은 그대로 두고
 * 갈라지는 수만 늘린 것이다 — 축이 둘이면 필요한 칸 수가 제곱근으로 줄어든다.
 */
const PLACEMENTS: ReadonlyMap<string, readonly [tone: number, grain: number]> = (() => {
  const grouped = new Map<Material, string[]>()
  for (const [id, material] of Object.entries(MATERIALS)) {
    const list = grouped.get(material) ?? []
    list.push(id)
    grouped.set(material, list)
  }

  const placed = new Map<string, readonly [number, number]>()
  for (const list of grouped.values()) {
    // 순서를 해시로 섞는 이유는 이름순으로 두면 비슷한 이름이 붙어 앉아서다
    const ordered = [...list].sort((a, b) => hashOf(a) - hashOf(b))
    const cols = Math.ceil(Math.sqrt(ordered.length))
    const rows = Math.ceil(ordered.length / cols)
    ordered.forEach((id, index) => {
      // 양 끝에 붙지 않게 반 칸 안으로 들여놓는다
      placed.set(id, [
        ((index % cols) + 0.5) / cols,
        (Math.floor(index / cols) + 0.5) / rows,
      ])
    })
  }
  return placed
})()

/**
 * 같은 재질 안에서 개체의 **음높이**를 가르는 값(0~1).
 *
 * 재질만으로는 유리잔과 칵테일이 똑같은 소리를 낸다. 이 값으로 음높이를 몇 반음 밀어
 * 같은 무리에 속하면서도 **물건마다 제 소리**를 갖게 한다.
 *
 * 난수가 아니라 id로 정해지는 것이 중요하다 — 같은 물건은 언제 떨어져도 같은 소리를
 * 내야 하고, 그래야 반복하는 동안 "저건 텀블러다"가 귀에 익는다.
 */
function toneOf(id: string): number {
  return PLACEMENTS.get(id)?.[0] ?? hashOf(id)
}

/**
 * 같은 재질 안에서 개체의 **울림**을 가르는 값(0~1). 음높이와 짝을 이루는 두 번째 축이다.
 *
 * 높을수록 길게 울리고 잡음이 어둡다(크고 속이 빈 것), 낮을수록 짧고 밝다(작고
 * 단단한 것). 실제 물건이 그렇게 갈리므로 음높이만 다를 때보다 "다른 물건"으로 들린다 —
 * 음높이 하나만 밀면 같은 소리를 조옮김한 것으로 들릴 뿐이다.
 */
function grainOf(id: string): number {
  return PLACEMENTS.get(id)?.[1] ?? hashOf(`${id}#grain`)
}

export { MATERIALS, BOUNCE, DEFAULT_MATERIAL, materialOf, bounceOf, toneOf, grainOf, hashOf }
