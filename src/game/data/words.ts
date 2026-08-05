import { spriteBounds, spriteShape } from '../shapes.ts'
import type { SpriteName } from './sprites.generated.ts'
import type { ItemVariant, WordEntry } from '../types/game.ts'

/**
 * 물건은 전부 스티커 아트다. 도형은 손으로 그리지 않고
 * scripts/prepare-sprites.cjs가 알파 마스크의 실루엣을 볼록 조각으로 나눠둔 것을 쓴다.
 * 그래서 화면에 보이는 그림과 실제로 부딪히는 도형이 어긋날 수 없다.
 *
 * 크기 체계
 *
 * 받침대 폭이 4.0이니 물건은 큰 쪽 길이가 0.4~1.1 사이에 들어와야 서너 개가 얹힌다.
 * 그 안에서 실제 물건끼리의 크기 순서를 지켰다:
 *   클로버 < 나뭇잎 < 달팽이 < 문어 < 소시지 < 음료 < 텀블러 < 피자 < 번개 <
 *   도시락 < 노트북 < 우산 < 피자 박스 < 비행기
 * 실제 센티미터를 그대로 쓰면 비행기가 받침대보다 넓어지므로 비율만 지키고 절대 크기는 눌렀다.
 * 가장 큰 물건의 반폭은 config의 MAX_ITEM_HALF_WIDTH를 넘을 수 없다 — 조준 범위가
 * 그 값에서 계산되고, tests/shapes.test.ts가 관계를 지킨다.
 *
 * 크기는 큰 변 하나만 정하면 나머지는 원본 그림의 비율을 따라간다.
 */

interface VariantInput {
  id: string
  label: string
  sprite: SpriteName
  size: { width: number } | { height: number }
  color: string
  friction?: number
  restitution?: number
  density?: number
  hidden?: boolean
  scoreBonus?: number
}

function variant(input: VariantInput): ItemVariant {
  return {
    id: input.id,
    label: input.label,
    // GitHub Pages는 저장소 이름을 경로로 붙이므로 루트 절대 경로로 두면 404가 된다
    sprite: `${import.meta.env.BASE_URL}items/${input.sprite}.png`,
    color: input.color,
    shape: spriteShape(input.sprite, input.size),
    artBounds: spriteBounds(input.sprite, input.size),
    // 벽이 없는 받침대라 미끄러짐이 곧 이탈이다. 기본 마찰을 넉넉히 두고
    // 물건별로 낮춰서 "잘 미끄러지는 물건"의 개성을 만든다.
    friction: input.friction ?? 0.75,
    restitution: input.restitution ?? 0.02,
    density: input.density ?? 1,
    hidden: input.hidden ?? false,
    scoreBonus: input.scoreBonus ?? 0,
  }
}

function hiddenVariant(input: VariantInput): ItemVariant {
  return variant({ ...input, hidden: true, scoreBonus: input.scoreBonus ?? 150 })
}

const WORDS: readonly WordEntry[] = [
  {
    word: '클로버',
    variants: [
      variant({
        id: 'clover',
        label: '세잎클로버',
        sprite: 'clover-three',
        size: { height: 0.42 },
        color: '#7cc45a',
        density: 0.3,
      }),
      hiddenVariant({
        // 이 게임에서 가장 반가운 히든이라 보너스를 크게 준다
        id: 'clover-lucky',
        label: '네잎클로버',
        sprite: 'clover-four',
        size: { height: 0.44 },
        color: '#9ad86f',
        density: 0.3,
        scoreBonus: 400,
      }),
    ],
  },
  {
    word: '나뭇잎',
    variants: [
      variant({
        id: 'leaf',
        label: '나뭇잎',
        sprite: 'leaf',
        size: { height: 0.46 },
        color: '#8ed24a',
        // 가장 가벼운 물건. 위에 무거운 걸 올리면 그대로 눌린다
        density: 0.25,
        friction: 0.8,
      }),
      hiddenVariant({
        id: 'leaf-maple',
        label: '단풍잎',
        sprite: 'leaf-maple',
        size: { height: 0.5 },
        color: '#f07d2a',
        // 갈래가 많아 위가 울퉁불퉁하다
        density: 0.25,
        friction: 0.8,
      }),
    ],
  },
  {
    word: '달팽이',
    variants: [
      variant({
        id: 'snail',
        label: '달팽이',
        sprite: 'snail',
        size: { width: 0.7 },
        color: '#c89a6a',
        // 길고 납작해서 스택을 넓게 받쳐준다
        density: 0.8,
      }),
      hiddenVariant({
        id: 'snail-curled',
        label: '웅크린 달팽이',
        sprite: 'snail-curled',
        size: { width: 0.56 },
        color: '#b5773f',
        // 껍데기가 둥글어 잘 구른다 — 히든이 불리한 경우
        density: 0.9,
        friction: 0.5,
      }),
    ],
  },
  {
    word: '문어',
    variants: [
      variant({
        id: 'octopus',
        label: '문어',
        sprite: 'octopus',
        size: { width: 0.58 },
        color: '#e0714a',
        // 빨판이 있어 어디에 놓아도 잘 붙는다. 가장 마찰이 큰 물건
        density: 0.9,
        friction: 0.95,
      }),
    ],
  },
  {
    word: '소시지',
    variants: [
      variant({
        id: 'sausage',
        label: '소시지',
        sprite: 'sausage',
        size: { width: 0.66 },
        color: '#e0714a',
        // 매끈한 원통이라 눕히면 굴러간다
        density: 0.9,
        friction: 0.35,
      }),
    ],
  },
  {
    word: '음료',
    variants: [
      variant({
        id: 'iced-drink',
        label: '아이스 음료',
        sprite: 'iced-drink',
        size: { height: 0.58 },
        color: '#5ec8bd',
        density: 0.6,
      }),
      hiddenVariant({
        id: 'cocktail',
        label: '칵테일',
        sprite: 'cocktail',
        size: { height: 0.62 },
        color: '#c9d99a',
        // 역삼각형 잔에 얇은 다리. 이 게임에서 가장 쌓기 어려운 물건이다
        density: 0.5,
        friction: 0.3,
      }),
    ],
  },
  {
    word: '텀블러',
    variants: [
      variant({
        id: 'tumbler',
        label: '텀블러',
        sprite: 'tumbler',
        size: { height: 0.7 },
        color: '#3fb0a8',
        // 스테인리스라 무겁다. 세우면 흔들리지만 자리를 잡으면 스택을 잠근다
        density: 2.2,
        friction: 0.6,
      }),
    ],
  },
  {
    word: '피자',
    variants: [
      variant({
        id: 'pizza-slice',
        label: '피자 조각',
        sprite: 'pizza-slice',
        size: { width: 0.72 },
        color: '#e8c65c',
        density: 0.6,
        friction: 0.7,
      }),
      hiddenVariant({
        // 한 조각 시켰는데 한 판이 왔다. 넓고 평평해서 훨씬 잘 받쳐준다
        id: 'pizza-box',
        label: '피자 한 판',
        sprite: 'pizza-box',
        size: { width: 0.98 },
        color: '#e8e0cc',
        density: 0.9,
        friction: 0.85,
      }),
    ],
  },
  {
    word: '번개',
    variants: [
      variant({
        id: 'bolt',
        label: '번개',
        sprite: 'bolt',
        size: { height: 0.8 },
        color: '#f2d43c',
        // 비스듬한 실루엣이라 어느 쪽으로 기울지 감이 안 온다
        density: 0.7,
        friction: 0.45,
      }),
    ],
  },
  {
    word: '도시락',
    variants: [
      variant({
        id: 'bento',
        label: '도시락',
        sprite: 'bento',
        size: { width: 0.74 },
        color: '#f2df8a',
        // 꽉 찬 도시락. 뚜껑이 열려 있어 위가 평평하지 않다
        density: 1.9,
        friction: 0.8,
      }),
    ],
  },
  {
    word: '노트북',
    variants: [
      variant({
        id: 'laptop',
        label: '노트북',
        sprite: 'laptop',
        size: { width: 0.88 },
        color: '#c9ccd6',
        // 펼친 노트북은 쐐기 모양이라 위에 뭘 올리기 까다롭다
        density: 1.5,
      }),
      hiddenVariant({
        id: 'laptop-closed',
        label: '접힌 노트북',
        sprite: 'laptop-closed',
        size: { width: 0.8 },
        color: '#d8dae2',
        // 접으면 납작한 판이 된다. 무겁고 넓어서 스택을 잠그는 데 최고 — 유리한 히든
        density: 2.0,
        friction: 0.85,
      }),
    ],
  },
  {
    word: '우산',
    variants: [
      variant({
        id: 'umbrella',
        label: '우산',
        sprite: 'umbrella',
        size: { height: 0.9 },
        color: '#e8465c',
        // 펼친 우산. 위가 넓고 캐노피가 둥글어 무게중심이 높다
        density: 0.55,
      }),
      hiddenVariant({
        id: 'umbrella-folded',
        label: '접힌 우산',
        sprite: 'umbrella-folded',
        size: { height: 0.8 },
        color: '#f2879f',
        // 접으면 훨씬 다루기 쉽다 — 유리한 히든
        density: 0.55,
        friction: 0.7,
      }),
    ],
  },
  {
    word: '비행기',
    variants: [
      variant({
        id: 'airplane',
        label: '비행기',
        sprite: 'airplane',
        size: { width: 1.06 },
        color: '#8fd0ea',
        // 가장 큰 물건. 날개가 넓어 잘 받쳐주지만 자리를 많이 먹는다
        density: 1.1,
        friction: 0.7,
      }),
    ],
  },
]

const WORD_BY_TEXT = new Map(WORDS.map((entry) => [entry.word, entry]))

/**
 * id로 변형을 찾는 길.
 * 멀티에서 히든 롤은 방장만 굴리고 결과를 id로 보낸다 — 양쪽이 각자 굴리면
 * 난수 소비 순서가 어긋나는 순간 서로 다른 물건을 쌓게 된다.
 */
const VARIANT_BY_ID = new Map(
  WORDS.flatMap((entry) => entry.variants.map((item) => [item.id, item] as const)),
)

export { WORDS, WORD_BY_TEXT, VARIANT_BY_ID }
