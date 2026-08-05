interface Vec2 {
  readonly x: number
  readonly y: number
}

type PrimitiveShape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'box'; readonly hw: number; readonly hh: number }
  | { readonly kind: 'capsule'; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: 'polygon'; readonly points: readonly Vec2[] }

/** 물건 하나를 이루는 조각. 망치처럼 오목한 실루엣은 조각 여러 개로 만든다. */
interface ShapePart {
  readonly shape: PrimitiveShape
  readonly offset: Vec2
  readonly rotation?: number
}

type ShapeDef =
  | PrimitiveShape
  | { readonly kind: 'compound'; readonly parts: readonly ShapePart[] }

interface ItemVariant {
  readonly id: string
  readonly label: string
  /** 스티커 이미지 경로 (public 기준) */
  readonly sprite: string
  /** 그림이 아직 로드되지 않았을 때 도형을 채우는 색 */
  readonly color: string
  readonly shape: ShapeDef
  /**
   * 그림을 그릴 크기. 보통 shape의 외접 사각형과 같지만, 스티커는 실루엣을
   * 단순화하는 과정에서 콜라이더가 살짝 안쪽으로 들어오므로 원래 그림 크기를 따로 둔다.
   */
  readonly artBounds: { readonly hw: number; readonly hh: number }
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
  /** 남은 목숨. 물건이 받침대를 벗어날 때마다 하나 줄어든다 */
  readonly lives: number
  readonly combo: number
  readonly maxCombo: number
  readonly hiddenFound: readonly string[]
}

export type {
  Vec2,
  PrimitiveShape,
  ShapePart,
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
