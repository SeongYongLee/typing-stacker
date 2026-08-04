import { shapeBounds, spriteBounds, spriteShape, type SpriteSize } from '../shapes.ts'
import type { SpriteName } from './sprites.generated.ts'
import type { ItemArt, ItemVariant, ShapeDef, WordEntry } from '../types/game.ts'

/**
 * 크기 체계
 *
 * 받침대 폭이 3.0이니까 물건은 큰 쪽 길이가 0.3~1.05 사이에 들어와야 3~6개가 얹힌다.
 * 그 안에서 실제 물건끼리의 크기 순서를 지켰다:
 *   계란 < 사과 < 클로버 < 감자 < 도넛 < 폭탄 < 컵 < 바위 < 달팽이 < 도시락 < 벽돌 <
 *   번개 < 망치 < 항아리 < 책 < 노트북 < 수박 < 연필 < 우산 < 비행기
 * 실제 센티미터를 그대로 쓰면 우산이 받침대보다 넓어지고 연필은 시뮬레이션이 안 될 만큼
 * 얇아지므로, 비율만 지키고 절대 크기는 플레이 가능한 범위로 눌렀다.
 *
 * 도형은 그림의 실루엣을 따라간다.
 * - 스티커 물건은 scripts/prepare-sprites.cjs가 알파 마스크의 실루엣을 볼록 조각들로
 *   나눠둔 것을 그대로 쓴다. 껍질 하나로 감싸면 비행기 날개 사이처럼 빈 공간에서 부딪힌다
 * - 이모지 물건은 손으로 맞췄고, 오목한 실루엣(망치, 연필)은 compound로 조각을 나눈다
 * 렌더러가 artBounds에 그림을 꽉 채우므로 보이는 것과 부딪히는 것이 일치한다.
 */

function emojiArt(char: string): ItemArt {
  return { kind: 'emoji', char }
}

function spriteArt(name: SpriteName): ItemArt {
  return { kind: 'sprite', src: `/items/${name}.png` }
}

/** 스티커 물건 하나 — 충돌 도형과 그림 크기를 한 번에 만든다 */
function spriteBody(name: SpriteName, size: SpriteSize) {
  return {
    art: spriteArt(name),
    shape: spriteShape(name, size),
    artBounds: spriteBounds(name, size),
  }
}

interface VariantInput {
  id: string
  label: string
  art: ItemArt
  color: string
  shape: ShapeDef
  artBounds?: { hw: number; hh: number }
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
    art: input.art,
    color: input.color,
    shape: input.shape,
    artBounds: input.artBounds ?? shapeBounds(input.shape),
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
    word: '계란',
    variants: [
      variant({
        id: 'egg',
        label: '계란',
        art: emojiArt('🥚'),
        color: '#e8dfc8',
        // 가장 작은 물건. 둥글어서 잘 구른다
        shape: { kind: 'capsule', halfHeight: 0.07, radius: 0.11 },
        friction: 0.3,
        density: 0.7,
      }),
      hiddenVariant({
        id: 'egg-twin',
        label: '쌍둥이 계란',
        art: emojiArt('🥚'),
        color: '#f5efe0',
        shape: { kind: 'capsule', halfHeight: 0.14, radius: 0.15 },
        friction: 0.45,
        density: 0.8,
      }),
    ],
  },
  {
    word: '사과',
    variants: [
      variant({
        id: 'apple',
        label: '사과',
        art: emojiArt('🍎'),
        color: '#e05561',
        shape: { kind: 'circle', radius: 0.18 },
        density: 0.9,
      }),
      hiddenVariant({
        id: 'apple-half',
        label: '반쪽 사과',
        art: emojiArt('🍎'),
        color: '#f0868f',
        // 자른 면이 바닥으로 가서 구르지 않는다 — 히든이 유리한 경우
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.18, y: -0.1 },
            { x: 0.18, y: -0.1 },
            { x: 0.15, y: 0.11 },
            { x: -0.15, y: 0.11 },
          ],
        },
        friction: 0.75,
        density: 0.9,
      }),
    ],
  },
  {
    word: '감자',
    variants: [
      variant({
        id: 'potato',
        label: '감자',
        art: emojiArt('🥔'),
        color: '#b08a55',
        // 울퉁불퉁한 덩어리 — 어디로 굴러갈지 예측이 어렵다
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.2, y: -0.06 },
            { x: -0.09, y: -0.16 },
            { x: 0.12, y: -0.15 },
            { x: 0.2, y: 0.02 },
            { x: 0.1, y: 0.16 },
            { x: -0.11, y: 0.14 },
          ],
        },
        friction: 0.65,
      }),
      hiddenVariant({
        id: 'potato-giant',
        label: '왕감자',
        art: emojiArt('🥔'),
        color: '#c9a26c',
        shape: { kind: 'circle', radius: 0.28 },
        friction: 0.5,
        density: 1.3,
      }),
    ],
  },
  {
    word: '도넛',
    variants: [
      variant({
        id: 'donut',
        label: '도넛',
        art: emojiArt('🍩'),
        color: '#d98cb3',
        shape: { kind: 'circle', radius: 0.22 },
        friction: 0.4,
        density: 0.45,
      }),
      hiddenVariant({
        id: 'donut-square',
        label: '네모 도넛',
        art: emojiArt('🍩'),
        color: '#eba7c9',
        shape: { kind: 'box', hw: 0.2, hh: 0.2 },
        friction: 0.75,
        density: 0.45,
      }),
    ],
  },
  {
    word: '대포',
    variants: [
      variant({
        id: 'cannon',
        label: '대포알',
        art: emojiArt('💣'),
        color: '#4a4d63',
        // 제일 무거운 물건. 잘못 놓으면 스택이 그대로 주저앉는다
        shape: { kind: 'circle', radius: 0.23 },
        friction: 0.25,
        density: 3.4,
      }),
      hiddenVariant({
        id: 'cannon-block',
        label: '각진 대포알',
        art: emojiArt('💣'),
        color: '#5f6280',
        shape: { kind: 'box', hw: 0.21, hh: 0.21 },
        friction: 0.85,
        density: 3.4,
      }),
    ],
  },
  {
    word: '컵',
    variants: [
      variant({
        id: 'cup',
        label: '컵',
        art: emojiArt('🥤'),
        color: '#d94f6e',
        // 위가 넓고 아래가 좁다 — 바닥이 좁아 흔들린다
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.11, y: -0.26 },
            { x: 0.11, y: -0.26 },
            { x: 0.16, y: 0.26 },
            { x: -0.16, y: 0.26 },
          ],
        },
        density: 0.55,
      }),
      hiddenVariant({
        id: 'cup-upside',
        label: '뒤집힌 컵',
        art: emojiArt('🥤'),
        color: '#e8778f',
        // 넓은 면이 바닥으로 가서 훨씬 안정적이다
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.16, y: -0.26 },
            { x: 0.16, y: -0.26 },
            { x: 0.11, y: 0.26 },
            { x: -0.11, y: 0.26 },
          ],
        },
        density: 0.55,
        friction: 0.7,
      }),
    ],
  },
  {
    word: '바위',
    variants: [
      variant({
        id: 'rock',
        label: '바위',
        art: emojiArt('🪨'),
        color: '#78798c',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.28, y: -0.16 },
            { x: 0.08, y: -0.22 },
            { x: 0.29, y: -0.02 },
            { x: 0.16, y: 0.21 },
            { x: -0.18, y: 0.18 },
          ],
        },
        friction: 0.8,
        density: 2.6,
      }),
      hiddenVariant({
        id: 'rock-round',
        label: '둥근 바위',
        art: emojiArt('🪨'),
        color: '#8f90a5',
        // 매끈해서 자꾸 미끄러진다 — 히든이 불리한 경우
        shape: { kind: 'circle', radius: 0.26 },
        friction: 0.22,
        density: 2.6,
      }),
    ],
  },
  {
    word: '벽돌',
    variants: [
      variant({
        id: 'brick',
        label: '벽돌',
        art: emojiArt('🧱'),
        color: '#b5603f',
        // 가장 쌓기 쉬운 물건
        shape: { kind: 'box', hw: 0.36, hh: 0.16 },
        friction: 0.85,
        density: 1.9,
      }),
      hiddenVariant({
        id: 'brick-broken',
        label: '깨진 벽돌',
        art: emojiArt('🧱'),
        color: '#cf7a56',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.34, y: -0.15 },
            { x: 0.28, y: -0.15 },
            { x: 0.34, y: 0.08 },
            { x: -0.14, y: 0.17 },
          ],
        },
        friction: 0.7,
        density: 1.9,
      }),
    ],
  },
  {
    word: '망치',
    variants: [
      variant({
        id: 'hammer',
        label: '망치',
        art: emojiArt('🔨'),
        color: '#8d93a8',
        // 손잡이 + 머리. 머리가 위에 있어 무게중심이 높다
        shape: {
          kind: 'compound',
          parts: [
            { shape: { kind: 'box', hw: 0.05, hh: 0.26 }, offset: { x: 0, y: -0.13 } },
            { shape: { kind: 'box', hw: 0.19, hh: 0.1 }, offset: { x: 0, y: 0.29 } },
          ],
        },
        density: 1.7,
      }),
      hiddenVariant({
        id: 'hammer-stubby',
        label: '몽둥망치',
        art: emojiArt('🔨'),
        color: '#a9afc4',
        // 머리만 남아 무게중심이 낮다
        shape: { kind: 'box', hw: 0.21, hh: 0.17 },
        density: 2.4,
        friction: 0.8,
      }),
    ],
  },
  {
    word: '항아리',
    variants: [
      variant({
        id: 'jar',
        label: '항아리',
        art: emojiArt('🏺'),
        color: '#9a6b45',
        // 목이 좁고 배가 부른 실루엣
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.15, y: -0.4 },
            { x: 0.15, y: -0.4 },
            { x: 0.28, y: -0.05 },
            { x: 0.21, y: 0.28 },
            { x: 0.11, y: 0.4 },
            { x: -0.11, y: 0.4 },
            { x: -0.21, y: 0.28 },
            { x: -0.28, y: -0.05 },
          ],
        },
        density: 1.3,
      }),
      hiddenVariant({
        id: 'jar-wide',
        label: '넓적 항아리',
        art: emojiArt('🏺'),
        color: '#b8815a',
        shape: { kind: 'box', hw: 0.38, hh: 0.2 },
        friction: 0.8,
        density: 1.3,
      }),
    ],
  },
  {
    word: '책',
    variants: [
      variant({
        id: 'book',
        label: '책',
        art: emojiArt('📕'),
        color: '#c2504e',
        // 넓고 얇다. 스택을 넓게 받쳐주는 다리 역할
        shape: { kind: 'box', hw: 0.43, hh: 0.075 },
        friction: 0.9,
        density: 1.1,
      }),
      hiddenVariant({
        id: 'book-stack',
        label: '책 세 권',
        art: emojiArt('📚'),
        color: '#d97370',
        shape: { kind: 'box', hw: 0.34, hh: 0.22 },
        friction: 0.9,
        density: 1.4,
      }),
    ],
  },
  {
    word: '수박',
    variants: [
      // 🍉는 통수박이 아니라 자른 조각 그림이라 도형도 조각으로 둔다
      variant({
        id: 'melon',
        label: '수박',
        art: emojiArt('🍉'),
        color: '#3fa15a',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.46, y: -0.28 },
            { x: 0.46, y: -0.28 },
            { x: 0, y: 0.28 },
          ],
        },
        density: 1.4,
      }),
      hiddenVariant({
        id: 'melon-square',
        label: '네모 수박',
        art: emojiArt('🍉'),
        color: '#59c777',
        // 네모난 수박은 실제로 파는 물건이다. 그리고 훨씬 잘 쌓인다
        shape: { kind: 'box', hw: 0.32, hh: 0.32 },
        friction: 0.8,
        density: 1.4,
      }),
    ],
  },
  {
    word: '연필',
    variants: [
      variant({
        id: 'pencil',
        label: '연필',
        art: emojiArt('✏️'),
        color: '#e0b23c',
        // 몸통 + 깎인 심. 가장 길고 가늘어 다루기 어렵다
        shape: {
          kind: 'compound',
          parts: [
            { shape: { kind: 'box', hw: 0.05, hh: 0.4 }, offset: { x: 0, y: 0.1 } },
            {
              shape: {
                kind: 'polygon',
                points: [
                  { x: -0.05, y: 0.1 },
                  { x: 0.05, y: 0.1 },
                  { x: 0, y: -0.1 },
                ],
              },
              offset: { x: 0, y: -0.4 },
            },
          ],
        },
        density: 0.5,
      }),
      hiddenVariant({
        id: 'pencil-stub',
        label: '몽당연필',
        art: emojiArt('✏️'),
        color: '#f0c95f',
        shape: { kind: 'box', hw: 0.06, hh: 0.13 },
        density: 0.5,
      }),
    ],
  },
  {
    word: '클로버',
    variants: [
      variant({
        id: 'clover',
        label: '세잎클로버',
        color: '#7cc45a',
        ...spriteBody('clover-three', { height: 0.44 }),
        friction: 0.7,
        density: 0.4,
      }),
      hiddenVariant({
        // 네잎클로버는 이 게임에서 가장 반가운 히든이라 보너스를 크게 준다
        id: 'clover-lucky',
        label: '네잎클로버',
        color: '#9ad86f',
        ...spriteBody('clover-four', { height: 0.46 }),
        friction: 0.7,
        density: 0.4,
        scoreBonus: 400,
      }),
    ],
  },
  {
    word: '달팽이',
    variants: [
      variant({
        id: 'snail',
        label: '달팽이',
        color: '#c89a6a',
        // 길고 납작해서 스택을 넓게 받쳐준다
        ...spriteBody('snail', { width: 0.68 }),
        friction: 0.75,
        density: 0.8,
      }),
      hiddenVariant({
        id: 'snail-curled',
        label: '웅크린 달팽이',
        color: '#d8ab7c',
        ...spriteBody('snail-curled', { width: 0.54 }),
        friction: 0.6,
        density: 0.9,
      }),
    ],
  },
  {
    word: '우산',
    variants: [
      variant({
        id: 'umbrella',
        label: '우산',
        color: '#e8607f',
        // 펼친 우산. 위가 넓어 무게중심이 높다
        ...spriteBody('umbrella', { height: 0.92 }),
        density: 0.55,
      }),
      hiddenVariant({
        id: 'umbrella-folded',
        label: '접힌 우산',
        color: '#f2879f',
        // 접으면 훨씬 다루기 쉽다 — 히든이 유리한 경우
        ...spriteBody('umbrella-folded', { height: 0.76 }),
        friction: 0.65,
        density: 0.55,
      }),
    ],
  },
  {
    word: '번개',
    variants: [
      variant({
        id: 'bolt',
        label: '번개',
        color: '#f2d43c',
        // 비스듬한 실루엣이라 어느 쪽으로 기울지 감이 안 온다
        ...spriteBody('bolt', { height: 0.78 }),
        friction: 0.5,
        density: 0.7,
      }),
    ],
  },
  {
    word: '도시락',
    variants: [
      variant({
        id: 'bento',
        label: '도시락',
        color: '#d8d4c8',
        // 뚜껑이 열려 있어 위가 평평하지 않다
        ...spriteBody('bento', { width: 0.72 }),
        friction: 0.8,
        density: 1.2,
      }),
    ],
  },
  {
    word: '노트북',
    variants: [
      variant({
        id: 'laptop',
        label: '노트북',
        color: '#c9ccd6',
        // 펼친 노트북은 쐐기 모양이라 위에 뭘 올리기 까다롭다
        ...spriteBody('laptop', { width: 0.86 }),
        friction: 0.75,
        density: 1.5,
      }),
    ],
  },
  {
    word: '비행기',
    variants: [
      variant({
        id: 'airplane',
        label: '비행기',
        color: '#8fd0ea',
        // 가장 큰 물건. 날개가 넓어 잘 받쳐주지만 자리를 많이 먹는다
        ...spriteBody('airplane', { width: 1.06 }),
        friction: 0.7,
        density: 1.1,
      }),
    ],
  },
]

const WORD_BY_TEXT = new Map(WORDS.map((entry) => [entry.word, entry]))

export { WORDS, WORD_BY_TEXT }
