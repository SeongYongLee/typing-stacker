/**
 * 움직일 때 뒤에 무엇을 흘리는가.
 *
 * 재질 표(`materials.ts`)와 같은 모양이다 — 물건 하나씩 정하지 않고 표로 모은다.
 * 이유도 같다: 조율할 때 보아야 하는 것이 물건 하나가 아니라 **무리**다. 반짝이는 것끼리
 * 비슷하고 흩날리는 것끼리 비슷하되 서로는 확실히 달라야 하는데, 그 균형은 표를
 * 통째로 볼 때만 잡힌다.
 *
 * ## 대부분의 물건은 아무것도 흘리지 않는다
 *
 * 107종 중 38종만 여기 있다. 금속·기계·유리·플라스틱은 비워뒀다 — 다 흘리면 화면이
 * 늘 부스러기로 차서 아무 뜻이 없어진다. 색번짐을 빛나는 10종으로 좁힌 것과 같은
 * 판단이고, 여기서도 기준은 **"그 물건이 움직이면 정말 뭔가 떨어지겠는가"** 하나다.
 *
 * ## 색번짐과 갈래를 나눠 둔 이유
 *
 * `sparkle`은 `glowItems.ts`의 10종과 정확히 같다. 같은 물건이 화면을 물들이고 또
 * 반짝임을 흘리는 것이라, 규칙("빛나는 것은 다르다")이 두 번 강화된다. 그래도 표를
 * 합치지 않은 것은 **다른 갈래가 넷 더 있기** 때문이다 — 색번짐은 빛나는 것만의 일이고
 * 꼬리는 그보다 넓다.
 */
/**
 * `splash`만 성격이 다르다. 나머지 다섯은 **움직이는 동안** 흘리는 것이고 이것은
 * **부딪히는 순간** 한 번 터진다. 그래서 아래 표에 배정된 물건이 없다 — 액체가 담긴
 * 것(`droplet`)이 닿을 때 `TrailField`가 만들어낸다.
 */
type Trail = 'sparkle' | 'droplet' | 'petal' | 'fluff' | 'crumb' | 'splash'

const TRAILS: Readonly<Record<string, Trail>> = {
  /* 빛나는 것 — 반짝임을 흘린다. glowItems.ts와 같은 열 종 */
  bolt: 'sparkle',
  'shooting-star': 'sparkle',
  stardust: 'sparkle',
  sunlight: 'sparkle',
  'crescent-moon': 'sparkle',
  'gold-star': 'sparkle',
  candle: 'sparkle',
  flashlight: 'sparkle',
  'magic-wand': 'sparkle',
  'mirror-ball': 'sparkle',

  /* 액체가 담긴 것 — 방울이 튄다. 근거가 가장 분명한 갈래다 */
  'iced-drink': 'droplet',
  cocktail: 'droplet',
  beer: 'droplet',
  americano: 'droplet',
  'milk-carton': 'droplet',
  'strawberry-milk': 'droplet',
  'watering-can': 'droplet',
  'shampoo-bottle': 'droplet',
  'electric-kettle': 'droplet',
  tumbler: 'droplet',

  /* 식물 — 잎이 흩날린다. 단풍잎은 설명이 필요 없다 */
  clover: 'petal',
  'clover-lucky': 'petal',
  leaf: 'petal',
  'leaf-maple': 'petal',
  sunflower: 'petal',
  'rice-plant': 'petal',
  cactus: 'petal',
  'pine-tree': 'petal',
  'christmas-tree': 'petal',

  /* 털과 솜 — 느리게 떠서 늦게 내려앉는다. 다른 갈래와 **속도로** 갈린다 */
  'quill-feather': 'fluff',
  rabbit: 'fluff',
  'wool-hat': 'fluff',
  scarf: 'fluff',

  /* 마르고 부스러지는 것 */
  broom: 'crumb',
  footprints: 'crumb',
  'fart-cloud': 'crumb',
  'french-fries': 'crumb',
  'fish-bread': 'crumb',
  'chocolate-donut': 'crumb',
}

/** 이 물건이 흘리는 것. 없으면 null — 대부분이 그렇다 */
function trailOf(id: string): Trail | null {
  return TRAILS[id] ?? null
}

export { TRAILS, trailOf }
export type { Trail }
