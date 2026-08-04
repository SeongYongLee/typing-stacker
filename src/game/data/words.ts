import type { ItemVariant, ShapeDef, WordEntry } from '../types/game.ts'

interface VariantInput {
  id: string
  label: string
  emoji: string
  color: string
  shape: ShapeDef
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
    emoji: input.emoji,
    color: input.color,
    shape: input.shape,
    friction: input.friction ?? 0.55,
    restitution: input.restitution ?? 0.04,
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
    word: '사과',
    variants: [
      variant({
        id: 'apple',
        label: '사과',
        emoji: '🍎',
        color: '#e05561',
        shape: { kind: 'circle', radius: 0.3 },
      }),
      hiddenVariant({
        id: 'apple-half',
        label: '반쪽 사과',
        emoji: '🍎',
        color: '#f0868f',
        // 밑면이 평평해 굴러가지 않는다 — 히든이 유리한 경우
        shape: { kind: 'box', hw: 0.3, hh: 0.16 },
        friction: 0.7,
      }),
    ],
  },
  {
    word: '망치',
    variants: [
      variant({
        id: 'hammer',
        label: '망치',
        emoji: '🔨',
        color: '#8d93a8',
        shape: { kind: 'capsule', halfHeight: 0.36, radius: 0.1 },
        density: 1.6,
      }),
      hiddenVariant({
        id: 'hammer-stubby',
        label: '몽둥망치',
        emoji: '🔨',
        color: '#a9afc4',
        shape: { kind: 'box', hw: 0.24, hh: 0.2 },
        density: 2.2,
        friction: 0.75,
      }),
    ],
  },
  {
    word: '우산',
    variants: [
      variant({
        id: 'umbrella',
        label: '우산',
        emoji: '☂️',
        color: '#5b8dd9',
        // 길고 가늘어 세로로 서면 무너지기 쉽다
        shape: { kind: 'capsule', halfHeight: 0.46, radius: 0.08 },
      }),
      hiddenVariant({
        id: 'umbrella-folded',
        label: '접힌 우산',
        emoji: '🌂',
        color: '#7ba7e8',
        shape: { kind: 'box', hw: 0.14, hh: 0.34 },
      }),
    ],
  },
  {
    word: '수박',
    variants: [
      variant({
        id: 'melon',
        label: '수박',
        emoji: '🍉',
        color: '#3fa15a',
        shape: { kind: 'circle', radius: 0.44 },
        density: 1.4,
      }),
      hiddenVariant({
        id: 'melon-slice',
        label: '수박 조각',
        emoji: '🍉',
        color: '#59c777',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.4, y: -0.18 },
            { x: 0.4, y: -0.18 },
            { x: 0, y: 0.34 },
          ],
        },
      }),
    ],
  },
  {
    word: '벽돌',
    variants: [
      variant({
        id: 'brick',
        label: '벽돌',
        emoji: '🧱',
        color: '#b5603f',
        // 가장 쌓기 쉬운 물건
        shape: { kind: 'box', hw: 0.38, hh: 0.17 },
        friction: 0.8,
        density: 1.8,
      }),
      hiddenVariant({
        id: 'brick-broken',
        label: '깨진 벽돌',
        emoji: '🧱',
        color: '#cf7a56',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.36, y: -0.16 },
            { x: 0.3, y: -0.16 },
            { x: 0.36, y: 0.1 },
            { x: -0.16, y: 0.18 },
          ],
        },
        friction: 0.7,
      }),
    ],
  },
  {
    word: '계란',
    variants: [
      variant({
        id: 'egg',
        label: '계란',
        emoji: '🥚',
        color: '#e8dfc8',
        shape: { kind: 'circle', radius: 0.2 },
        friction: 0.35,
        density: 0.7,
      }),
      hiddenVariant({
        id: 'egg-boiled',
        label: '삶은 계란',
        emoji: '🥚',
        color: '#f5efe0',
        shape: { kind: 'capsule', halfHeight: 0.12, radius: 0.17 },
        friction: 0.5,
      }),
    ],
  },
  {
    word: '책',
    variants: [
      variant({
        id: 'book',
        label: '책',
        emoji: '📕',
        color: '#c2504e',
        shape: { kind: 'box', hw: 0.42, hh: 0.09 },
        friction: 0.85,
      }),
      hiddenVariant({
        id: 'book-thick',
        label: '두꺼운 책',
        emoji: '📚',
        color: '#d97370',
        shape: { kind: 'box', hw: 0.3, hh: 0.24 },
        friction: 0.85,
        density: 1.5,
      }),
    ],
  },
  {
    word: '컵',
    variants: [
      variant({
        id: 'cup',
        label: '컵',
        emoji: '🥤',
        color: '#d94f6e',
        shape: { kind: 'box', hw: 0.19, hh: 0.28 },
        density: 0.6,
      }),
      hiddenVariant({
        id: 'cup-upside',
        label: '뒤집힌 컵',
        emoji: '🥤',
        color: '#e8778f',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.22, y: -0.26 },
            { x: 0.22, y: -0.26 },
            { x: 0.15, y: 0.26 },
            { x: -0.15, y: 0.26 },
          ],
        },
        density: 0.6,
        friction: 0.7,
      }),
    ],
  },
  {
    word: '감자',
    variants: [
      variant({
        id: 'potato',
        label: '감자',
        emoji: '🥔',
        color: '#b08a55',
        shape: { kind: 'circle', radius: 0.25 },
        friction: 0.6,
      }),
      hiddenVariant({
        id: 'potato-giant',
        label: '왕감자',
        emoji: '🥔',
        color: '#c9a26c',
        shape: { kind: 'circle', radius: 0.4 },
        density: 1.5,
      }),
    ],
  },
  {
    word: '도넛',
    variants: [
      variant({
        id: 'donut',
        label: '도넛',
        emoji: '🍩',
        color: '#d98cb3',
        shape: { kind: 'circle', radius: 0.31 },
        friction: 0.4,
        density: 0.5,
      }),
      hiddenVariant({
        id: 'donut-square',
        label: '네모 도넛',
        emoji: '🍩',
        color: '#eba7c9',
        shape: { kind: 'box', hw: 0.29, hh: 0.29 },
        friction: 0.75,
        density: 0.5,
      }),
    ],
  },
  {
    word: '연필',
    variants: [
      variant({
        id: 'pencil',
        label: '연필',
        emoji: '✏️',
        color: '#e0b23c',
        // 가장 다루기 어려운 물건
        shape: { kind: 'capsule', halfHeight: 0.5, radius: 0.06 },
        density: 0.5,
      }),
      hiddenVariant({
        id: 'pencil-stub',
        label: '몽당연필',
        emoji: '✏️',
        color: '#f0c95f',
        shape: { kind: 'capsule', halfHeight: 0.14, radius: 0.07 },
        density: 0.5,
      }),
    ],
  },
  {
    word: '항아리',
    variants: [
      variant({
        id: 'jar',
        label: '항아리',
        emoji: '🏺',
        color: '#9a6b45',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.22, y: -0.36 },
            { x: 0.22, y: -0.36 },
            { x: 0.34, y: 0.1 },
            { x: 0.16, y: 0.38 },
            { x: -0.16, y: 0.38 },
            { x: -0.34, y: 0.1 },
          ],
        },
        density: 1.3,
      }),
      hiddenVariant({
        id: 'jar-wide',
        label: '넓적 항아리',
        emoji: '🏺',
        color: '#b8815a',
        shape: { kind: 'box', hw: 0.42, hh: 0.22 },
        friction: 0.8,
        density: 1.3,
      }),
    ],
  },
  {
    word: '바위',
    variants: [
      variant({
        id: 'rock',
        label: '바위',
        emoji: '🪨',
        color: '#78798c',
        shape: {
          kind: 'polygon',
          points: [
            { x: -0.34, y: -0.2 },
            { x: 0.1, y: -0.3 },
            { x: 0.36, y: -0.02 },
            { x: 0.2, y: 0.28 },
            { x: -0.22, y: 0.24 },
          ],
        },
        friction: 0.75,
        density: 2.4,
      }),
      hiddenVariant({
        id: 'rock-round',
        label: '둥근 바위',
        emoji: '🪨',
        color: '#8f90a5',
        shape: { kind: 'circle', radius: 0.33 },
        friction: 0.3,
        density: 2.4,
      }),
    ],
  },
  {
    word: '대포',
    variants: [
      variant({
        id: 'cannon',
        label: '대포',
        emoji: '💣',
        color: '#4a4d63',
        shape: { kind: 'circle', radius: 0.36 },
        friction: 0.25,
        density: 3.2,
      }),
      hiddenVariant({
        id: 'cannon-block',
        label: '각진 대포',
        emoji: '💣',
        color: '#5f6280',
        shape: { kind: 'box', hw: 0.33, hh: 0.33 },
        friction: 0.8,
        density: 3.2,
      }),
    ],
  },
]

const WORD_BY_TEXT = new Map(WORDS.map((entry) => [entry.word, entry]))

export { WORDS, WORD_BY_TEXT }
