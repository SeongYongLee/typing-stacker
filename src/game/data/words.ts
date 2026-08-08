import { spriteBounds, spriteShape } from '../shapes.ts'
import { materialOf, toneOf } from './materials.ts'
import { SPRITE_EXT, type SpriteName } from './sprites.generated.ts'
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
  angularDamping?: number
  sticky?: boolean
  hidden?: boolean
  scoreBonus?: number
}

function variant(input: VariantInput): ItemVariant {
  return {
    id: input.id,
    label: input.label,
    // GitHub Pages는 저장소 이름을 경로로 붙이므로 루트 절대 경로로 두면 404가 된다.
    // 확장자는 파이프라인이 정한 것을 따른다 — 형식을 바꿀 때 여기를 잊으면 전부 404다
    sprite: `${import.meta.env.BASE_URL}items/${input.sprite}${SPRITE_EXT}`,
    color: input.color,
    shape: spriteShape(input.sprite, input.size),
    artBounds: spriteBounds(input.sprite, input.size),
    // 벽이 없는 받침대라 미끄러짐이 곧 이탈이다. 기본 마찰을 넉넉히 두고
    // 물건별로 낮춰서 "잘 미끄러지는 물건"의 개성을 만든다.
    friction: input.friction ?? 0.75,
    restitution: input.restitution ?? 0.02,
    density: input.density ?? 1,
    // 기본값은 웬만해선 구르지 않는 값이다. 굴리고 싶은 물건만 낮춰 잡는다
    angularDamping: input.angularDamping ?? 2.4,
    sticky: input.sticky ?? false,
    hidden: input.hidden ?? false,
    scoreBonus: input.scoreBonus ?? 0,
    // 소리에 쓰는 값은 물건마다 적지 않고 표에서 끌어온다 — 이유는 materials.ts에
    material: materialOf(input.id),
    tone: toneOf(input.id),
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
        // 가볍고 잘 튄다. 위에서 떨어지는 것에 쉽게 밀려난다
        restitution: 0.25,
        angularDamping: 1.1,
        label: '세잎클로버',
        sprite: 'three-leaf-clover',
        size: { height: 0.42 },
        color: '#7cc45a',
        density: 0.3,
      }),
      hiddenVariant({
        // 이 게임에서 가장 반가운 히든이라 보너스를 크게 준다
        id: 'clover-lucky',
        restitution: 0.22,
        angularDamping: 1.1,
        label: '네잎클로버',
        sprite: 'four-leaf-clover',
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
        // 나뭇잎은 얇아서 잘 눕는다. 구르지는 않지만 어디에 눕는지가 매번 다르다
        angularDamping: 1.6,
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
        angularDamping: 1.6,
        label: '단풍잎',
        sprite: 'maple-leaf',
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
        // 기어가서 달라붙는다. 얹히면 그 자리에 눌러앉아 그 위로 다시 쌓을 수 있다
        sticky: true,
        label: '달팽이',
        sprite: 'snail-out',
        size: { width: 0.7 },
        color: '#c89a6a',
        // 길고 납작해서 스택을 넓게 받쳐준다
        density: 0.8,
      }),
      hiddenVariant({
        id: 'snail-curled',
        // 달팽이는 웅크려도 달팽이다. 다만 껍데기가 둥글어 무언가에 닿기 전까지는
        // 데구르르 굴러간다 — 어디에 가서 붙을지 알 수 없다
        sticky: true,
        angularDamping: 0.5,
        restitution: 0.12,
        label: '웅크린 달팽이',
        sprite: 'snail-tucked-in',
        size: { width: 0.56 },
        color: '#b5773f',
        // 껍데기가 둥글어 잘 구른다 — 히든이 불리한 경우
        density: 0.9,
        friction: 0.5,
      }),
    ],
  },
  {
    word: '소시지',
    variants: [
      variant({
        id: 'sausage',
        // 원통이라 잘 구르고 마찰도 낮다. 얹으면 미끄러져 내려가는 물건
        angularDamping: 0.45,
        label: '소시지',
        sprite: 'sausage',
        size: { width: 0.66 },
        color: '#e0714a',
        // 매끈한 원통이라 눕히면 굴러간다
        density: 0.9,
        friction: 0.35,
      }),
      hiddenVariant({
        /*
         * 소시지에 칼집을 낸 것이 문어 소시지다. 아트도 `이미지 2탄`에서
         * sausage / octopus-sausage 한 쌍으로 왔다.
         *
         * 기본형이 이 게임에서 가장 잘 미끄러지는 물건인데 히든은 가장 잘 붙는
         * 물건이라, 같은 단어를 쳤을 때 결과가 정반대로 갈린다.
         */
        id: 'octopus',
        sticky: true,
        restitution: 0,
        angularDamping: 3.2,
        label: '문어소시지',
        sprite: 'octopus-sausage',
        size: { width: 0.58 },
        color: '#e0714a',
        // 빨판이 있어 어디에 놓아도 잘 붙는다. 가장 마찰이 큰 물건
        density: 0.9,
        friction: 0.95,
      }),
    ],
  },
  {
    word: '칵테일',
    variants: [
      variant({
        id: 'iced-drink',
        restitution: 0.14,
        label: '칵테일',
        sprite: 'highball-cocktail',
        size: { height: 0.58 },
        color: '#5ec8bd',
        density: 0.6,
      }),
      hiddenVariant({
        id: 'cocktail',
        // 잔이 위로 벌어져 무게중심이 높다. 잘 넘어진다
        restitution: 0.1,
        angularDamping: 0.9,
        label: '마티니 칵테일',
        sprite: 'martini-cocktail',
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
        // 무겁고 안 튄다. 서 있으면 든든하지만 한번 누우면 원통이라 굴러간다
        restitution: 0,
        angularDamping: 1.2,
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
        // 넓고 평평해서 그 위로 다시 쌓기 좋다. 붙지 않아도 받침이 되어준다
        angularDamping: 4,
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
        // 지그재그라 어디로 튈지 모른다. 가장 예측하기 어려운 물건
        angularDamping: 0.7,
        restitution: 0.3,
        label: '번개',
        sprite: 'lightning',
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
        // 네모나고 무겁다. 얹히면 그대로 눌러앉는다
        restitution: 0,
        angularDamping: 4,
        label: '도시락',
        sprite: 'lunchbox',
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
        sprite: 'open-laptop',
        size: { width: 0.88 },
        color: '#c9ccd6',
        // 펼친 노트북은 쐐기 모양이라 위에 뭘 올리기 까다롭다
        density: 1.5,
      }),
      hiddenVariant({
        id: 'laptop-closed',
        label: '접힌 노트북',
        sprite: 'closed-laptop',
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
        sprite: 'open-umbrella',
        size: { height: 0.9 },
        color: '#e8465c',
        // 펼친 우산. 위가 넓고 캐노피가 둥글어 무게중심이 높다
        density: 0.55,
      }),
      hiddenVariant({
        id: 'umbrella-folded',
        label: '접힌 우산',
        sprite: 'folded-umbrella',
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

  {
    word: '무당벌레',
    variants: [
      variant({
        // 단단한 등껍질이 둥글다. 툭 치면 데구르르 굴러간다
        id: 'ladybug',
        label: '무당벌레',
        sprite: 'ladybug',
        size: { height: 0.44 },
        color: '#e34b4b',
        density: 0.25,
        restitution: 0.2,
        angularDamping: 0.7,
      }),
    ],
  },
  {
    word: '귀뚜라미',
    variants: [
      variant({
        // 다리가 걸려 잘 구르지는 않지만 아주 가벼워 쉽게 밀린다
        id: 'cricket',
        label: '귀뚜라미',
        sprite: 'cricket',
        size: { width: 0.52 },
        color: '#7cc45a',
        density: 0.2,
        angularDamping: 1.4,
      }),
    ],
  },
  {
    word: '호랑나비',
    variants: [
      variant({
        // 날개가 넓고 얇다. 가장 가벼워 위에 무엇이 오든 눌린다
        id: 'butterfly',
        label: '호랑나비',
        sprite: 'tiger-swallowtail',
        size: { width: 0.6 },
        color: '#e8d05a',
        density: 0.18,
        friction: 0.85,
        angularDamping: 3.2,
      }),
    ],
  },
  {
    word: '선글라스',
    variants: [
      variant({
        // 매끈해서 잘 미끄러진다
        id: 'sunglasses',
        label: '선글라스',
        sprite: 'sunglasses',
        size: { width: 0.58 },
        color: '#3a3f52',
        density: 0.35,
        friction: 0.5,
        angularDamping: 1.6,
      }),
    ],
  },
  {
    word: '초코도넛',
    variants: [
      variant({
        // 가운데가 뚫린 원반. 세워지면 굴러간다
        id: 'chocolate-donut',
        label: '초코도넛',
        sprite: 'chocolate-donut',
        size: { width: 0.58 },
        color: '#7a4a2b',
        density: 0.4,
        restitution: 0.18,
        angularDamping: 0.5,
      }),
    ],
  },
  {
    word: '붕어빵',
    variants: [
      variant({
        // 납작하고 마찰이 커서 그 위에 다시 쌓기 좋다
        id: 'fish-bread',
        label: '붕어빵',
        sprite: 'fish-bread',
        size: { width: 0.6 },
        color: '#e8a33c',
        density: 0.5,
        friction: 0.8,
      }),
    ],
  },
  {
    word: '아메리카노',
    variants: [
      variant({
        // 잔이 위로 벌어져 무게중심이 높다
        id: 'americano',
        label: '아메리카노',
        sprite: 'americano',
        size: { height: 0.54 },
        color: '#e8e2d6',
        density: 0.7,
        friction: 0.6,
      }),
    ],
  },
  {
    word: '우유',
    variants: [
      variant({
        // 네모난 우유갑. 서 있으면 안정적이다
        id: 'milk-carton',
        label: '우유',
        sprite: 'milk-carton',
        size: { height: 0.58 },
        color: '#eef2f6',
        density: 0.9,
        friction: 0.75,
        angularDamping: 3.0,
      }),
      hiddenVariant({
        // 같은 우유갑인데 안에 든 것이 다르다. 크기와 무게가 같아 쌓기는 안 바뀐다
        id: 'strawberry-milk',
        label: '딸기우유',
        sprite: 'strawberry-milk',
        size: { height: 0.58 },
        color: '#f3b9c8',
        density: 0.9,
        friction: 0.75,
        angularDamping: 3.0,
      }),
    ],
  },
  {
    word: '손전등',
    variants: [
      variant({
        // 원통이라 옆으로 누우면 굴러간다
        id: 'flashlight',
        label: '손전등',
        sprite: 'flashlight',
        size: { width: 0.62 },
        color: '#f0c93c',
        density: 0.8,
        angularDamping: 0.6,
      }),
    ],
  },
  {
    word: '알람시계',
    variants: [
      variant({
        // 몸통이 둥글어 잘 넘어진다
        id: 'alarm-clock',
        label: '알람시계',
        sprite: 'alarm-clock',
        size: { height: 0.58 },
        color: '#4ab3d1',
        density: 0.8,
        angularDamping: 0.9,
      }),
    ],
  },
  {
    word: '맥주',
    variants: [
      variant({
        // 가득 찬 잔. 무겁지만 위가 넓어 흔들린다
        id: 'beer',
        label: '맥주',
        sprite: 'beer',
        size: { height: 0.62 },
        color: '#f0b93c',
        density: 1.0,
        friction: 0.6,
      }),
    ],
  },
  {
    word: '감자튀김',
    variants: [
      variant({
        // 봉지 위로 삐죽 솟아 있어 그 위에 얹기 어렵다
        id: 'french-fries',
        label: '감자튀김',
        sprite: 'french-fries',
        size: { height: 0.62 },
        color: '#e8443c',
        density: 0.45,
        friction: 0.7,
      }),
    ],
  },
  {
    word: '아이스크림',
    variants: [
      variant({
        // 뾰족한 콘 위에 둥근 덩어리. 무게중심이 높아 잘 넘어진다
        id: 'ice-cream-cone',
        label: '아이스크림',
        sprite: 'ice-cream-cone',
        size: { height: 0.66 },
        color: '#f2b6c6',
        density: 0.4,
        angularDamping: 1.0,
      }),
    ],
  },
  {
    word: '샴푸통',
    variants: [
      variant({
        // 바닥이 평평하고 아래가 무겁다
        id: 'shampoo-bottle',
        label: '샴푸통',
        sprite: 'shampoo-bottle',
        size: { height: 0.66 },
        color: '#d9a8e0',
        density: 1.2,
        friction: 0.7,
        angularDamping: 2.8,
      }),
    ],
  },
  {
    word: '다람쥐',
    variants: [
      variant({
        // 꼬리가 커서 자리를 먹지만 가볍다
        id: 'squirrel',
        label: '다람쥐',
        sprite: 'squirrel',
        size: { width: 0.64 },
        color: '#c9793c',
        density: 0.35,
        friction: 0.85,
      }),
    ],
  },
  {
    word: '털모자',
    variants: [
      variant({
        // 천이라 마찰이 크고 거의 구르지 않는다. 가벼워서 잘 밀린다
        id: 'wool-hat',
        label: '털모자',
        sprite: 'wool-hat',
        size: { height: 0.62 },
        color: '#e07aa8',
        density: 0.25,
        friction: 0.95,
        angularDamping: 3.5,
      }),
    ],
  },
  {
    word: '축구공',
    variants: [
      variant({
        // 완전한 구. 이 게임에서 가장 잘 구르고 가장 잘 튄다 — 얹는 순간이 도박이다
        id: 'soccer-ball',
        label: '축구공',
        sprite: 'soccer-ball',
        size: { width: 0.64 },
        color: '#f2f2f2',
        density: 0.5,
        restitution: 0.4,
        angularDamping: 0.3,
      }),
    ],
  },
  {
    word: '선인장',
    variants: [
      variant({
        // 화분이 아래를 눌러줘서 좀처럼 넘어지지 않는다
        id: 'cactus',
        label: '선인장',
        sprite: 'cactus',
        size: { height: 0.7 },
        color: '#5aa85a',
        density: 1.3,
        friction: 0.8,
        angularDamping: 3.2,
      }),
    ],
  },
  {
    word: '쌍안경',
    variants: [
      variant({
        // 두 통이 붙어 있어 바닥이 넓다
        id: 'binoculars',
        label: '쌍안경',
        sprite: 'binoculars',
        size: { width: 0.68 },
        color: '#3c6b4a',
        density: 1.1,
        friction: 0.7,
      }),
    ],
  },
  {
    word: '목도리',
    variants: [
      variant({
        // 천이라 어디에 걸쳐도 미끄러지지 않는다
        id: 'scarf',
        label: '목도리',
        sprite: 'scarf',
        size: { height: 0.68 },
        color: '#e8622c',
        density: 0.3,
        friction: 0.95,
        angularDamping: 3.5,
      }),
    ],
  },
  {
    word: '고무장갑',
    variants: [
      variant({
        // 고무라 닿는 것에 들러붙는다
        id: 'rubber-gloves',
        label: '고무장갑',
        sprite: 'rubber-gloves',
        size: { height: 0.72 },
        color: '#f0c022',
        density: 0.4,
        sticky: true,
      }),
    ],
  },
  {
    word: '운동화',
    variants: [
      variant({
        // 밑창이 넓어 잘 버틴다
        id: 'sneakers',
        label: '운동화',
        sprite: 'sneakers',
        size: { width: 0.74 },
        color: '#dfe4ee',
        density: 0.6,
        friction: 0.85,
      }),
    ],
  },
  {
    word: '물뿌리개',
    variants: [
      variant({
        // 주둥이가 길게 튀어나와 얹을 자리를 흐트러뜨린다
        id: 'watering-can',
        label: '물뿌리개',
        sprite: 'watering-can',
        size: { width: 0.74 },
        color: '#7cc45a',
        density: 0.9,
        friction: 0.7,
      }),
    ],
  },
  {
    word: '전기주전자',
    variants: [
      variant({
        // 바닥이 평평하고 묵직하다
        id: 'electric-kettle',
        label: '전기주전자',
        sprite: 'electric-kettle',
        size: { height: 0.72 },
        color: '#e8564e',
        density: 1.4,
        friction: 0.7,
        angularDamping: 3.0,
      }),
    ],
  },
  {
    word: '공룡인형',
    variants: [
      variant({
        // 꼬리와 머리가 길어 자리를 많이 먹는다
        id: 'dinosaur-toy',
        label: '공룡인형',
        sprite: 'dinosaur-toy',
        size: { width: 0.78 },
        color: '#5aa85a',
        density: 0.5,
        friction: 0.8,
      }),
    ],
  },
  {
    word: '롤러스케이트',
    variants: [
      variant({
        // 바퀴가 달려 있다. 얹으면 굴러 내려간다
        id: 'roller-skates',
        label: '롤러스케이트',
        sprite: 'roller-skates',
        size: { width: 0.78 },
        color: '#f0a8c0',
        density: 0.7,
        angularDamping: 0.7,
      }),
    ],
  },
  {
    word: '씨앗',
    variants: [
      variant({
        // 이 게임에서 가장 작은 물건. 어디에 얹어도 자리를 거의 안 먹는다
        id: 'sunflower-seed',
        label: '씨앗',
        sprite: 'sunflower-seed',
        size: { height: 0.4 },
        color: '#4a3a2a',
        density: 0.3,
        friction: 0.7,
        angularDamping: 1.2,
      }),
      hiddenVariant({
        // 씨앗이 자란 모습. 줄기가 가늘고 꽃이 무거워 위가 무거우면 넘어진다.
        // 가장 작은 물건을 쳤는데 두 배 넘게 큰 것이 떨어지는, 불리한 쪽 히든이다
        id: 'sunflower',
        label: '해바라기',
        sprite: 'sunflower',
        size: { height: 0.82 },
        color: '#f0c93c',
        density: 0.3,
        friction: 0.8,
        angularDamping: 1.2,
      }),
    ],
  },
  {
    word: '장난감기차',
    variants: [
      variant({
        // 길고 낮아 받침으로 쓸 만하다
        id: 'toy-train',
        label: '장난감기차',
        sprite: 'toy-train',
        size: { width: 0.8 },
        color: '#e8564e',
        density: 1.0,
        friction: 0.75,
      }),
    ],
  },
  {
    word: '책가방',
    variants: [
      variant({
        // 큼직하고 마찰이 커서 든든한 받침이 된다
        id: 'school-backpack',
        label: '책가방',
        sprite: 'school-backpack',
        size: { height: 0.8 },
        color: '#3c5aa8',
        density: 1.0,
        friction: 0.9,
      }),
    ],
  },
  {
    word: '프라이팬',
    variants: [
      variant({
        // 무쇠라 가장 무겁다. 손잡이만 빼면 완전히 평평해 최고의 받침이다
        id: 'frying-pan',
        label: '프라이팬',
        sprite: 'frying-pan',
        size: { width: 0.86 },
        color: '#3a3f52',
        density: 2.4,
        friction: 0.85,
        angularDamping: 4.0,
      }),
    ],
  },
  {
    word: '배드민턴채',
    variants: [
      variant({
        // 길고 얇다. 눕히면 넓지만 세우면 곧 쓰러진다
        id: 'badminton-racket',
        label: '배드민턴채',
        sprite: 'badminton-racket',
        size: { height: 0.92 },
        color: '#7ec8e0',
        density: 0.35,
        angularDamping: 0.6,
      }),
    ],
  },
  {
    word: '전자레인지',
    variants: [
      variant({
        // 네모나고 무겁다. 얹히면 그대로 눌러앉는다
        id: 'microwave',
        label: '전자레인지',
        sprite: 'microwave',
        size: { width: 0.88 },
        color: '#f0d98c',
        density: 1.9,
        friction: 0.85,
        angularDamping: 4.0,
      }),
    ],
  },
  {
    word: '소나무',
    variants: [
      variant({
        // 위가 무성하고 아래가 좁다
        id: 'pine-tree',
        label: '소나무',
        sprite: 'pine-tree',
        size: { height: 0.92 },
        color: '#3c7a4a',
        density: 0.8,
        friction: 0.8,
        angularDamping: 1.2,
      }),
      hiddenVariant({
        // 삼각형이라 그 위에 무엇을 얹기 어렵다. 꾸며진 대신 불리한 히든이다
        id: 'christmas-tree',
        label: '크리스마스트리',
        sprite: 'christmas-tree',
        size: { height: 0.96 },
        color: '#3c7a4a',
        density: 0.7,
        friction: 0.75,
        angularDamping: 1.0,
      }),
    ],
  },
  {
    word: '세탁기',
    variants: [
      variant({
        // 무겁고 네모나다. 아래에 깔면 탑이 흔들리지 않는다
        id: 'washing-machine',
        label: '세탁기',
        sprite: 'washing-machine',
        size: { height: 0.94 },
        color: '#e6e9ee',
        density: 2.2,
        friction: 0.85,
        angularDamping: 4.0,
      }),
    ],
  },
  {
    word: '냉장고',
    variants: [
      variant({
        // 가장 무거운 축. 아래에 깔면 든든하지만 위에 얹으면 다 무너진다
        id: 'refrigerator',
        label: '냉장고',
        sprite: 'refrigerator',
        size: { height: 1.04 },
        color: '#bfe3d8',
        density: 2.2,
        friction: 0.85,
        angularDamping: 4.0,
      }),
    ],
  },
  {
    word: '자전거',
    variants: [
      variant({
        // 가장 넓다. 받침대를 거의 다 덮어버린다
        id: 'bicycle',
        label: '자전거',
        sprite: 'bicycle',
        size: { width: 1.06 },
        color: '#4aa3d1',
        density: 0.6,
        friction: 0.7,
      }),
    ],
  },

  /*
   * 여기부터는 합성 재료로 들어온 물건들이다.
   *
   * 재료도 그냥 떨어지는 물건이라 다른 단어와 다를 것이 없다 — 쌓기만 해도 되고,
   * 짝을 맞춰 붙이면 다른 것이 된다. 그래서 재료라고 따로 두지 않고 여기 함께 둔다.
   * 무엇과 무엇이 짝인지는 `recipes.ts`가 안다.
   *
   * 크기는 아트가 온 표의 등급을 그대로 옮겼다:
   * 아주작음 0.40 · 작음 0.55 · 보통 0.70 · 큼 0.85 · 아주큼 1.00.
   */
  {
    word: '다리미',
    variants: [
      variant({
        // 밑판이 넓고 평평하다. 무거운데 안 흔들리는 쪽
        id: 'iron',
        label: '다리미',
        sprite: 'iron',
        size: { width: 0.55 },
        color: '#d94f3d',
        density: 1.8,
        friction: 0.8,
        angularDamping: 3.0,
      }),
    ],
  },
  {
    word: '셔츠',
    variants: [
      variant({
        // 천이라 가볍고 잘 붙잡는다. 미끄러운 것 위에 깔면 도움이 된다
        id: 'blue-shirt',
        label: '셔츠',
        sprite: 'blue-shirt',
        size: { width: 0.7 },
        color: '#7fc4e8',
        density: 0.35,
        friction: 0.9,
        angularDamping: 3.2,
      }),
    ],
  },
  {
    word: '계란',
    variants: [
      variant({
        // 타원이라 구른다. 작은 대신 어디에 눕는지가 매번 다르다
        id: 'egg',
        label: '계란',
        sprite: 'egg',
        size: { height: 0.4 },
        color: '#f3e3bd',
        density: 0.6,
        friction: 0.3,
        restitution: 0.1,
        angularDamping: 0.5,
      }),
    ],
  },
  {
    word: '별',
    variants: [
      variant({
        // 다섯 갈래가 걸려서 구르지 않는다. 위가 울퉁불퉁한 것이 흠
        id: 'gold-star',
        label: '별',
        sprite: 'gold-star',
        size: { width: 0.4 },
        color: '#f5c33b',
        density: 0.5,
        friction: 0.8,
        angularDamping: 2.0,
      }),
    ],
  },
  {
    word: '달',
    variants: [
      variant({
        // 초승달은 안쪽이 파인 활 모양이라 어느 쪽으로 눕느냐로 자리가 크게 갈린다
        id: 'crescent-moon',
        label: '달',
        sprite: 'crescent-moon',
        size: { height: 1 },
        color: '#f6e58d',
        density: 0.5,
        friction: 0.75,
        angularDamping: 1,
      }),
    ],
  },
  {
    word: '벼',
    variants: [
      variant({
        // 잎이 넓고 가벼워 위에 무거운 것이 오면 그대로 눌린다
        id: 'rice-plant',
        label: '벼',
        sprite: 'rice-plant',
        size: { height: 0.85 },
        color: '#e8c249',
        density: 0.3,
        friction: 0.85,
        angularDamping: 1.8,
      }),
    ],
  },
  {
    word: '생선',
    variants: [
      variant({
        // 길고 미끈하다. 이 게임에서 가장 잘 미끄러지는 축
        id: 'salmon-fish',
        label: '생선',
        sprite: 'salmon-fish',
        size: { width: 0.85 },
        color: '#f08a6a',
        density: 0.8,
        friction: 0.3,
        angularDamping: 1.5,
      }),
    ],
  },
  {
    word: '거울',
    variants: [
      variant({
        id: 'hand-mirror',
        label: '거울',
        sprite: 'hand-mirror',
        size: { height: 0.55 },
        color: '#bcd6e6',
        density: 0.9,
        friction: 0.5,
        angularDamping: 1.4,
      }),
    ],
  },
  {
    word: '지구본',
    variants: [
      variant({
        // 공이 달렸는데 받침이 받쳐줘서 구르지는 않는다
        id: 'desk-globe',
        label: '지구본',
        sprite: 'desk-globe',
        size: { height: 0.7 },
        color: '#5aa9dd',
        density: 0.8,
        friction: 0.8,
        angularDamping: 2.6,
      }),
    ],
  },
  {
    word: '창문',
    variants: [
      variant({
        // 네모나고 평평하다. 밑에 깔면 그 위가 넓어진다
        id: 'window',
        label: '창문',
        sprite: 'window',
        size: { height: 0.85 },
        color: '#a9d8ef',
        density: 1.2,
        friction: 0.85,
        angularDamping: 4,
      }),
    ],
  },
  {
    word: '야구배트',
    variants: [
      variant({
        // 원통이라 눕히면 굴러간다
        id: 'baseball-bat',
        label: '야구 배트',
        sprite: 'baseball-bat',
        size: { height: 0.85 },
        color: '#c08a4a',
        density: 1,
        friction: 0.4,
        angularDamping: 0.6,
      }),
    ],
  },
  {
    word: '하트',
    variants: [
      variant({
        id: 'heart',
        label: '하트',
        sprite: 'heart',
        size: { width: 0.4 },
        color: '#e34b4b',
        density: 0.5,
        friction: 0.7,
        restitution: 0.15,
        angularDamping: 1.2,
      }),
    ],
  },
  {
    word: '촛불',
    variants: [
      variant({
        // 서 있는 원기둥. 눕기 전까지는 자리를 적게 쓴다
        id: 'candle',
        label: '촛불',
        sprite: 'candle',
        size: { height: 0.55 },
        color: '#f2d9a0',
        density: 0.7,
        friction: 0.7,
        angularDamping: 1.6,
      }),
    ],
  },
  {
    word: '토끼',
    variants: [
      variant({
        id: 'rabbit',
        label: '토끼',
        sprite: 'rabbit',
        size: { width: 0.7 },
        color: '#f0ece6',
        density: 0.6,
        friction: 0.75,
      }),
    ],
  },
  {
    word: '거북이',
    variants: [
      variant({
        // 등딱지가 둥글어서 그 위에 무엇을 얹기 어렵다
        id: 'turtle',
        label: '거북이',
        sprite: 'turtle',
        size: { width: 0.7 },
        color: '#6aa84f',
        density: 0.9,
        friction: 0.7,
        angularDamping: 2.2,
      }),
    ],
  },
  {
    word: '열쇠',
    variants: [
      variant({
        // 작고 납작하고 무겁다. 틈에 끼워 넣기 좋다
        id: 'old-key',
        label: '열쇠',
        sprite: 'old-key',
        size: { width: 0.4 },
        color: '#c9a227',
        density: 1.2,
        friction: 0.5,
      }),
    ],
  },
  {
    word: '지도',
    variants: [
      variant({
        // 종이라 가볍고 평평하다
        id: 'treasure-map',
        label: '지도',
        sprite: 'treasure-map',
        size: { width: 0.55 },
        color: '#e0c890',
        density: 0.3,
        friction: 0.9,
        angularDamping: 3,
      }),
    ],
  },
  {
    word: '자물쇠',
    variants: [
      variant({
        // 작은데 가장 무거운 축. 얹으면 아래가 눌린다
        id: 'padlock',
        label: '자물쇠',
        sprite: 'padlock',
        size: { height: 0.4 },
        color: '#b0a8a0',
        density: 1.6,
        friction: 0.7,
        angularDamping: 3,
      }),
    ],
  },
  {
    word: '깃털',
    variants: [
      variant({
        // 이 게임에서 가장 가볍다. 무엇을 얹어도 버티지 못한다
        id: 'quill-feather',
        label: '깃털',
        sprite: 'quill-feather',
        size: { height: 0.55 },
        color: '#e8e2d6',
        density: 0.2,
        friction: 0.85,
        angularDamping: 2,
      }),
    ],
  },
  {
    word: '망원경',
    variants: [
      variant({
        // 삼각대가 벌어져 있어 아래는 넓고 위는 좁다
        id: 'telescope',
        label: '망원경',
        sprite: 'telescope',
        size: { height: 0.85 },
        color: '#8896a8',
        density: 0.9,
        friction: 0.8,
        angularDamping: 2.4,
      }),
    ],
  },
  {
    word: '별똥별',
    variants: [
      variant({
        // 꼬리가 길어 폭을 많이 먹는다. 가벼워서 밀리기도 쉽다
        id: 'shooting-star',
        label: '별똥별',
        sprite: 'shooting-star',
        size: { width: 1 },
        color: '#ffd95e',
        density: 0.4,
        friction: 0.7,
        angularDamping: 1.4,
      }),
    ],
  },
  {
    word: '카메라',
    variants: [
      variant({
        // 작은 상자. 무겁고 잘 안 흔들린다
        id: 'camera',
        label: '카메라',
        sprite: 'camera',
        size: { width: 0.55 },
        color: '#5b6470',
        density: 1.3,
        friction: 0.8,
        angularDamping: 3.4,
      }),
    ],
  },
  {
    word: '발자국',
    variants: [
      variant({
        /*
         * 이 게임에서 유일하게 **여덟 덩이로 흩어진** 물건이다. 콜라이더는 한 몸에
         * 붙은 조각 묶음이라 흩어져 있어도 함께 움직인다 — 떨어져 있는 만큼
         * 아래를 넓게 짚어서, 좁은 자리에 얹으면 허공에 걸린 것처럼 보인다.
         */
        id: 'footprints',
        label: '발자국',
        sprite: 'footprints',
        size: { height: 0.55 },
        color: '#8a6242',
        density: 0.5,
        friction: 0.9,
        angularDamping: 3,
      }),
    ],
  },
  {
    word: '안경',
    variants: [
      variant({
        // 가장 납작하다. 위가 평평해서 다음 것을 받아준다
        id: 'round-glasses',
        label: '안경',
        sprite: 'round-glasses',
        size: { width: 0.55 },
        color: '#7a6a58',
        density: 0.4,
        friction: 0.6,
      }),
    ],
  },
  {
    word: '책',
    variants: [
      variant({
        // 두껍고 네모나다. 밑에 깔기 가장 좋은 물건
        id: 'study-book',
        label: '책',
        sprite: 'study-book',
        size: { width: 0.55 },
        color: '#3f7ac0',
        density: 1.4,
        friction: 0.85,
        angularDamping: 4,
      }),
    ],
  },
  {
    word: '빗자루',
    variants: [
      variant({
        // 비스듬히 누운 막대. 자루 쪽이 가늘어 그 위에는 아무것도 못 얹는다
        id: 'broom',
        label: '빗자루',
        sprite: 'broom',
        size: { height: 0.85 },
        color: '#a97a45',
        density: 0.5,
        friction: 0.7,
        angularDamping: 1.6,
      }),
    ],
  },
  {
    word: '별가루',
    variants: [
      variant({
        // 병에 담겨 있어 서 있다
        id: 'stardust',
        label: '별가루',
        sprite: 'stardust',
        size: { height: 0.55 },
        color: '#c9a7f0',
        density: 0.8,
        friction: 0.7,
        angularDamping: 2,
      }),
    ],
  },
  {
    word: '거미줄',
    variants: [
      variant({
        // 가볍고 잘 붙잡는다. 다만 그림의 구멍은 메워져 있어 보이는 것보다 넓게 부딪힌다
        id: 'spider-web',
        label: '거미줄',
        sprite: 'spider-web',
        size: { height: 0.7 },
        color: '#e3ecf2',
        density: 0.25,
        friction: 0.9,
        angularDamping: 2.6,
      }),
    ],
  },
  {
    word: '나침반',
    variants: [
      variant({
        // 둥글고 납작하고 묵직하다
        id: 'compass',
        label: '나침반',
        sprite: 'compass',
        size: { width: 0.4 },
        color: '#c9a227',
        density: 1.1,
        friction: 0.6,
        angularDamping: 1.8,
      }),
    ],
  },
  {
    word: '종이비행기',
    variants: [
      variant({
        // 종이라 거의 무게가 없다. 비행기와 이름만 닮았지 성격은 정반대다
        id: 'paper-airplane',
        label: '종이비행기',
        sprite: 'paper-airplane',
        size: { width: 0.55 },
        color: '#eef2f6',
        density: 0.25,
        friction: 0.6,
        angularDamping: 1.8,
      }),
    ],
  },
]

/**
 * 합성으로만 나오는 물건들.
 *
 * 이 게임의 물건은 원래 전부 어떤 단어에 속했고, 히든도 그 단어의 **다른 형태**였다 —
 * 피자를 치면 가끔 피자 한 판이 나오는 식이다. 그런데 서로 다른 물건을 합친 결과는
 * 재료 어느 쪽의 다른 형태도 아니다. 계란 프라이는 계란의 다른 형태가 아니고
 * 금메달은 번개의 다른 형태가 아니다. 어느 단어에 매달아도 거짓말이 된다.
 *
 * 그래서 단어에 매달지 않는다. 이것들은 **타이핑으로는 절대 떨어지지 않는다.**
 * `resolveItem`은 `WORDS`만 보므로 여기 있는 물건이 손을 거치지 않고 나올 길이 없고,
 * 도감에서 이 칸들은 "운으로는 못 채우는 칸"이 된다.
 *
 * 크기는 재료 둘이 차지하던 폭보다 좁아야 한다. 합성은 자리를 되찾아주는 보상이고,
 * 합쳐서 넓어지면 위태로울 때 합성을 피하게 된다. `tests/Merger.test.ts`가 지킨다.
 */
const CRAFTED: readonly ItemVariant[] = [
  hiddenVariant({
    // 다리미 밑판 모양 그대로 탄 자국이 남았다. 셔츠와 크기·무게가 같다
    id: 'burnt-hole-shirt',
    label: '구멍 난 셔츠',
    sprite: 'burnt-hole-shirt',
    size: { width: 0.7 },
    color: '#7fc4e8',
    density: 0.35,
    friction: 0.9,
    angularDamping: 3.2,
  }),
  hiddenVariant({
    // 팬에 담긴 채로 나온다. 위가 평평해서 다음 것을 받아준다
    id: 'fried-egg',
    label: '계란 프라이',
    sprite: 'fried-egg',
    size: { width: 0.7 },
    color: '#f7d34a',
    density: 1.1,
    friction: 0.8,
    angularDamping: 3,
  }),
  hiddenVariant({
    // 구름이라 거의 무게가 없다. 얹으면 위가 넓어지지만 아무것도 못 버틴다
    id: 'fart-cloud',
    label: '방귀 냄새',
    sprite: 'fart-cloud',
    size: { width: 0.55 },
    color: '#b7d68a',
    density: 0.15,
    friction: 0.85,
    angularDamping: 2.2,
    scoreBonus: 200,
  }),
  hiddenVariant({
    /*
     * 광선 여덟 개가 원과 떨어져 있다. 발자국과 함께 이 게임에서 흩어진 물건이고,
     * 그래서 실제로 짚는 자리가 그림보다 넓다 — 가장 크기도 하다.
     */
    id: 'sunlight',
    label: '햇빛',
    sprite: 'sunlight',
    size: { width: 1 },
    color: '#ffd233',
    density: 0.35,
    friction: 0.75,
    angularDamping: 2,
    scoreBonus: 250,
  }),
  hiddenVariant({
    // 큰 재료 둘이 손바닥만 한 것 하나가 된다. 자리를 가장 많이 되찾아주는 합성
    id: 'salmon-sushi',
    label: '초밥',
    sprite: 'salmon-sushi',
    size: { width: 0.4 },
    color: '#f2a07d',
    density: 0.9,
    friction: 0.8,
    angularDamping: 2.6,
    scoreBonus: 250,
  }),
  hiddenVariant({
    // 매달린 공. 둥글어서 그 위에는 아무것도 못 얹는다
    id: 'mirror-ball',
    label: '미러볼',
    sprite: 'mirror-ball',
    size: { height: 0.85 },
    color: '#cfe0ec',
    density: 1,
    friction: 0.55,
    angularDamping: 1.6,
  }),
  hiddenVariant({
    // 다섯 조각이 흩어져 있다. 낮고 넓게 깔려서 밑받침으로 쓸 만하다
    id: 'glass-shards',
    label: '유리조각',
    sprite: 'glass-shards',
    size: { width: 0.55 },
    color: '#7ec8ef',
    density: 1.2,
    friction: 0.6,
    angularDamping: 2.4,
  }),
  hiddenVariant({
    // 가장 작은 결과물. 자리를 거의 안 먹는다
    id: 'heart-ring',
    label: '반지',
    sprite: 'heart-ring',
    size: { width: 0.4 },
    color: '#e8b93c',
    density: 1.3,
    friction: 0.6,
    angularDamping: 2,
    scoreBonus: 300,
  }),
  hiddenVariant({
    // 깃대가 서 있어 위가 좁다
    id: 'racing-flag',
    label: '레이싱 깃발',
    sprite: 'racing-flag',
    size: { height: 0.85 },
    color: '#e8e8e8',
    density: 0.5,
    friction: 0.8,
    angularDamping: 1.8,
  }),
  hiddenVariant({
    // 작고 무겁고 둥글다. 얹으면 아래를 누르고 저는 잘 미끄러진다
    id: 'gold-medal',
    label: '금메달',
    sprite: 'gold-medal',
    size: { height: 0.4 },
    color: '#f2c230',
    density: 1.6,
    friction: 0.5,
    angularDamping: 1.4,
    scoreBonus: 300,
  }),
  hiddenVariant({
    // 뚜껑이 둥글어 그 위가 불안하다. 대신 넓고 무거워 밑에 깔면 든든하다
    id: 'treasure-chest',
    label: '보물상자',
    sprite: 'treasure-chest',
    size: { width: 0.85 },
    color: '#a9762f',
    density: 1.5,
    friction: 0.85,
    angularDamping: 3.4,
    scoreBonus: 250,
  }),
  hiddenVariant({
    id: 'secret-diary',
    label: '비밀일기',
    sprite: 'secret-diary',
    size: { height: 0.55 },
    color: '#c46a86',
    density: 1.1,
    friction: 0.85,
    angularDamping: 3.4,
  }),
  hiddenVariant({
    // 가장 큰 결과물. 재료 둘이 워낙 커서 그래도 자리는 줄어든다
    id: 'spaceship',
    label: '우주선',
    sprite: 'spaceship',
    size: { width: 1 },
    color: '#dbe4ee',
    density: 1.2,
    friction: 0.7,
    angularDamping: 2.6,
    scoreBonus: 300,
  }),
  hiddenVariant({
    id: 'travel-album',
    label: '여행앨범',
    sprite: 'travel-album',
    size: { height: 0.55 },
    color: '#c98a5a',
    density: 1.1,
    friction: 0.85,
    angularDamping: 3.4,
  }),
  hiddenVariant({
    // 넓고 평평한 판에 술이 달렸다. 위가 평평해서 받아주기 좋다
    id: 'graduation-cap',
    label: '졸업모자',
    sprite: 'graduation-cap',
    size: { width: 0.7 },
    color: '#2f3542',
    density: 0.6,
    friction: 0.85,
    angularDamping: 3,
  }),
  hiddenVariant({
    // 가느다란 막대. 눕히면 구르고 그 위에는 아무것도 못 얹는다
    id: 'magic-wand',
    label: '마법봉',
    sprite: 'magic-wand',
    size: { height: 0.55 },
    color: '#8e6fd0',
    density: 0.6,
    friction: 0.55,
    angularDamping: 1.2,
    scoreBonus: 250,
  }),
  hiddenVariant({
    // 안테나가 위로 솟아 있다. 낮고 무거워 밑에 깔기 좋다
    id: 'internet-router',
    label: '인터넷 공유기',
    sprite: 'internet-router',
    size: { width: 0.55 },
    color: '#4b5563',
    density: 1.4,
    friction: 0.8,
    angularDamping: 3.4,
  }),
  hiddenVariant({
    // 네모난 상자. 이 판에서 가장 쌓기 좋은 결과물이다
    id: 'travel-suitcase',
    label: '여행가방',
    sprite: 'travel-suitcase',
    size: { height: 0.85 },
    color: '#b06a3c',
    density: 1.3,
    friction: 0.85,
    angularDamping: 4,
    scoreBonus: 250,
  }),
]

/**
 * 이 게임에 있는 물건 전부. 단어에 매달린 것과 합성으로만 나오는 것을 합친 것이다.
 *
 * 도감·스프라이트 미리받기·재질 표처럼 **"물건이면 다"**를 뜻하는 자리는 이것을 쓴다.
 * `WORDS`만 훑으면 합성 결과물이 조용히 빠지는데, 그 실패는 도감에 칸이 안 생기거나
 * 합성한 순간 그림이 없는 것으로 나타나 한참 뒤에야 드러난다.
 */
const ALL_VARIANTS: readonly ItemVariant[] = [
  ...WORDS.flatMap((entry) => entry.variants),
  ...CRAFTED,
]

const WORD_BY_TEXT = new Map(WORDS.map((entry) => [entry.word, entry]))

/**
 * id로 변형을 찾는 길.
 * 멀티에서 히든 롤은 방장만 굴리고 결과를 id로 보낸다 — 양쪽이 각자 굴리면
 * 난수 소비 순서가 어긋나는 순간 서로 다른 물건을 쌓게 된다.
 */
const VARIANT_BY_ID = new Map(
  ALL_VARIANTS.map((item) => [item.id, item] as const),
)

export { WORDS, CRAFTED, ALL_VARIANTS, WORD_BY_TEXT, VARIANT_BY_ID }
