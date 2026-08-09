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
 * 180종 중 60종만 여기 있다. 금속·기계·유리·플라스틱은 비워뒀다 — 다 흘리면 화면이
 * 늘 부스러기로 차서 아무 뜻이 없어진다. 색번짐을 빛나는 것으로 좁힌 것과 같은
 * 판단이고, 여기서도 기준은 **"그 물건이 움직이면 정말 뭔가 떨어지겠는가"** 하나다.
 *
 * ## 색번짐과 갈래를 나눠 둔 이유
 *
 * `sparkle`은 `glowItems.ts`와 정확히 같은 집합이다. 같은 물건이 화면을 물들이고 또
 * 반짝임을 흘리는 것이라, 규칙("빛나는 것은 다르다")이 두 번 강화된다. 그래도 표를
 * 합치지 않은 것은 **다른 갈래가 넷 더 있기** 때문이다 — 색번짐은 빛나는 것만의 일이고
 * 꼬리는 그보다 넓다.
 */
/**
 * `splash`만 성격이 다르다. 나머지 다섯은 **움직이는 동안** 흘리는 것이고 이것은
 * **부딪히는 순간** 한 번 터진다. 그래서 아래 표에 배정된 물건이 없다 — 액체가 담긴
 * 것(`droplet`)이 닿을 때 `TrailField`가 만들어낸다.
 */
type Trail = 'sparkle' | 'droplet' | 'petal' | 'fluff' | 'crumb' | 'splash' | 'steam'

const TRAILS: Readonly<Record<string, Trail>> = {
  /* 빛나는 것 — 반짝임을 흘린다. glowItems.ts와 같은 집합 */
  bolt: 'sparkle',
  'shooting-star': 'sparkle',
  stardust: 'sparkle',
  sunlight: 'sparkle',
  'crescent-moon': 'sparkle',
  'gold-star': 'sparkle',
  candle: 'sparkle',
  flashlight: 'sparkle',
  'desk-lamp': 'sparkle',
  'gooseneck-lamp': 'sparkle',
  'traffic-light': 'sparkle',
  mushroom: 'sparkle',
  'magic-wand': 'sparkle',
  'winged-wand': 'sparkle',
  'mirror-ball': 'sparkle',

  /* 액체가 담긴 것 — 방울이 튄다. 근거가 가장 분명한 갈래다 */
  'iced-drink': 'droplet',
  cocktail: 'droplet',
  beer: 'droplet',
  'beer-bottle': 'droplet',
  americano: 'droplet',
  'americano-iced': 'droplet',
  'milk-carton': 'droplet',
  'strawberry-milk': 'droplet',
  'milk-vintage-cart': 'droplet',
  'watering-can': 'droplet',
  'shampoo-bottle': 'droplet',
  'electric-kettle': 'droplet',
  'electric-kettle-gooseneck': 'droplet',
  tumbler: 'droplet',
  'kids-bottle': 'droplet',
  /* 비눗물도 액체다. 뚜껑에 고리 막대가 매달려 나온다 */
  'bubble-bottle': 'droplet',
  /* 담긴 것이 아니라 **젖은 것**. 생선이 퍼덕이면 물이 튄다 */
  'salmon-fish': 'droplet',

  /* 식물 — 잎이 흩날린다. 단풍잎은 설명이 필요 없다 */
  clover: 'petal',
  'clover-lucky': 'petal',
  leaf: 'petal',
  'leaf-maple': 'petal',
  sunflower: 'petal',
  'rice-plant': 'petal',
  cactus: 'petal',
  'cactus-mexican-character': 'petal',
  'pine-tree': 'petal',
  'christmas-tree': 'petal',

  /* 털과 솜 — 느리게 떠서 늦게 내려앉는다. 다른 갈래와 **속도로** 갈린다 */
  'quill-feather': 'fluff',
  rabbit: 'fluff',
  /* 꼬리가 굵어 흔들 때마다 털이 날린다 — 토끼와 같은 자리 */
  squirrel: 'fluff',
  'wool-hat': 'fluff',
  'wool-hat-nordic-earflap': 'fluff',
  scarf: 'fluff',


  /* 마르고 부스러지는 것 */
  broom: 'crumb',
  footprints: 'crumb',
  'footprints-dinosaur': 'crumb',
  'fart-cloud': 'crumb',
  'french-fries': 'crumb',
  'fish-bread': 'crumb',
  'chocolate-donut': 'crumb',
  macaron: 'crumb',
  'macaron-bear': 'crumb',
  biscuit: 'crumb',
  /* 김이 부스러지고 밥알이 떨어진다 */
  'triangle-gimbap': 'crumb',
}

/**
 * 얹힌 뒤 김이 오르는 물건.
 *
 * **꼬리와 겹쳐도 되는 유일한 축이다.** 나머지 갈래는 움직이는 동안 흘리고 정착하면
 * 멈추는데 김은 반대로 얹힌 **뒤에** 오른다. 시간이 겹치지 않으니 아메리카노가
 * 떨어지며 물방울을 흘리고, 얹힌 뒤에 김을 낼 수 있다.
 *
 * 예전에는 `TRAILS`에 `steam`으로 적었다. 그러면 한 물건이 갈래 하나만 갖게 되어
 * **뜨거운 것 대부분이 김을 못 냈다** — 실제로 스폰되는 것은 프라이팬과 다리미
 * 둘뿐이었고(계란 프라이와 구멍 난 셔츠는 합성 전용이라 타이핑으로 안 떨어진다),
 * 판당 0.3개라 세 판에 두 판은 김을 아예 못 봤다. 김은 "쌓인 탑이 아직 살아 있다"를
 * 말하는 배경인데 그 역할을 못 하고 있었다.
 *
 * **아이스 아메리카노는 없다.** 같은 단어의 다른 형태여도 그쪽은 차갑다 —
 * "기본형이 가지면 히든도 가진다"는 꼬리 쪽 규칙이 여기서는 통하지 않는다.
 */
const STEAMING_IDS: ReadonlySet<string> = new Set([
  /* 불 위에 있던 것 */
  'frying-pan',
  'fried-egg',
  'iron',
  /* 다리미에 탄 자국. 타고 나면 연기가 남는다 */
  'burnt-hole-shirt',
  /* 갓 만들어 나온 것 */
  'fish-bread',
  'lunchbox-bear-omelet-rice',
  /* 뜨거운 것이 담겼다 */
  'americano',
  'electric-kettle',
  'electric-kettle-gooseneck',
])

/** 얹힌 뒤 김이 오르는가. 꼬리와 따로 본다 */
function steams(id: string): boolean {
  return STEAMING_IDS.has(id)
}

/**
 * 튀는 물의 색이 **물건 색과 다른** 물건들.
 *
 * 보통은 물건 색을 그대로 쓴다 — 맥주는 노랗고 딸기우유는 분홍이라, 담긴 것이 곧
 * 물건의 색이다. 그런데 그게 맞지 않는 물건이 있다.
 *
 * **생선이 그렇다.** 물건 색은 살구빛(`#f08a6a`)이고 튀는 것은 물이다. 그대로 쓰면
 * 살점이 튀는 것처럼 보인다 — 넣으려던 것이 "물 효과"인데 물로 안 읽힌다.
 *
 * 물뿌리개(초록)와 전기주전자(빨강)도 같은 어긋남이다. 그쪽은 **통의 색**이지
 * 담긴 것의 색이 아니다. 반대로 샴푸통은 통 색이 곧 샴푸 색이라 두지 않았다.
 *
 * 물건마다 적지 않고 여기 모은 이유는 재질 표와 같다 — 어긋난 것이 몇 개인지
 * 한눈에 보여야 새 아트가 올 때 빠뜨렸는지 알 수 있다.
 */
const SPLASH_COLORS: Readonly<Record<string, string>> = {
  'salmon-fish': '#7ec8ef',
  'watering-can': '#7ec8ef',
  'electric-kettle': '#bcd6e6',
  'electric-kettle-gooseneck': '#bcd6e6',
  /* 병 유리는 갈색이고 담긴 맥주는 황금빛이다 */
  'beer-bottle': '#f2c14e',
  /* 나무 수레 색이지 우유 색이 아니다 */
  'milk-vintage-cart': '#f3efe4',
}

/**
 * 김의 색. 물건 색을 아예 쓰지 않는다.
 *
 * 김은 **어느 물건에서 나든 같은 것**이다. 물건 색을 쓰면 남색 프라이팬에서 남색
 * 김이 올라와 어두운 배경에서 보이지도 않고, 보이더라도 김이 아니라 물건이
 * 번지는 것으로 읽힌다. 튀는 물이 담긴 것의 색을 따르는 것과 정반대 이유다 —
 * 그쪽은 물건마다 다른 것이 맞고 이쪽은 같은 것이 맞다.
 */
const STEAM_COLOR = '#dfe6ee'

/** 이 물건이 흘리는 것. 없으면 null — 대부분이 그렇다 */
function trailOf(id: string): Trail | null {
  return TRAILS[id] ?? null
}

/** 튈 때의 색. 어긋나는 물건만 표에 있고 나머지는 물건 색을 그대로 쓴다 */
function splashColorOf(id: string, fallback: string): string {
  return SPLASH_COLORS[id] ?? fallback
}

export { TRAILS, STEAMING_IDS, SPLASH_COLORS, STEAM_COLOR, trailOf, steams, splashColorOf }
export type { Trail }
