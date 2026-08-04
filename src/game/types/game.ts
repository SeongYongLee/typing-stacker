interface Vec2 {
  readonly x: number
  readonly y: number
}

type ShapeDef =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'box'; readonly hw: number; readonly hh: number }
  | { readonly kind: 'capsule'; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: 'polygon'; readonly points: readonly Vec2[] }

interface ItemVariant {
  readonly id: string
  readonly label: string
  readonly emoji: string
  readonly color: string
  readonly shape: ShapeDef
  readonly friction: number
  readonly restitution: number
  readonly density: number
  readonly hidden: boolean
  readonly scoreBonus: number
}

interface WordEntry {
  readonly word: string
  /** [0]은 항상 기본 변형, 그 뒤는 히든 변형 */
  readonly variants: readonly ItemVariant[]
}

type Side = 'left' | 'right'

interface FallingWord {
  readonly id: number
  readonly word: string
  readonly side: Side
  readonly slot: number
  /** 0 = 레인 최상단, 1 = 바닥선 */
  y: number
  state: 'active' | 'missed'
  /** missed 이후 1 → 0으로 감소, 0이 되면 제거 */
  fade: number
}

interface DifficultyLevel {
  readonly spawnInterval: number
  readonly fallDuration: number
  readonly aimSpeed: number
  readonly maxConcurrent: number
}

type JudgeResult =
  | { readonly kind: 'hit'; readonly word: FallingWord }
  | { readonly kind: 'miss'; readonly input: string }

/** 물리 바디 하나를 렌더러에 넘기기 위한 스냅샷 */
interface BodySnapshot {
  readonly handle: number
  readonly variant: ItemVariant
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly settled: boolean
}

/** collapsing은 무너지는 장면을 잠깐 보여주는 구간 — 결과 화면이 그 위를 덮기 전에 */
type GamePhase = 'title' | 'playing' | 'collapsing' | 'over'

interface RunStats {
  readonly score: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly missedWords: number
  readonly hiddenFound: readonly string[]
}

export type {
  Vec2,
  ShapeDef,
  ItemVariant,
  WordEntry,
  Side,
  FallingWord,
  DifficultyLevel,
  JudgeResult,
  BodySnapshot,
  GamePhase,
  RunStats,
}
