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

/**
 * 부딪혔을 때 어떤 소리가 나는가.
 *
 * 실제 물질이 아니라 **귀에 들리는 결과**로 나눈 분류다. 그래서 나뭇잎과 피자 박스가
 * 같은 `paper`이고(둘 다 마른 것이 스치는 소리), 스테인리스 텀블러와 자전거가
 * 같은 `metal`이다. 어느 물건이 무엇인지는 `data/materials.ts`의 표에 있다.
 */
type Material =
  /** 유리와 담긴 음료 — 맑게 울린다 */
  | 'glass'
  /** 금속 — 배음이 어긋나게 남는다 */
  | 'metal'
  /** 나무 — 짧고 둔한 "톡" */
  | 'wood'
  /** 마른 것 — 거의 잡음뿐인 "바스락" */
  | 'paper'
  /** 천과 솜 — 가장 조용한 "푹" */
  | 'cloth'
  /** 단단한 플라스틱 — 마른 "딱" */
  | 'plastic'
  /** 고무 — 튄다 */
  | 'rubber'
  /** 기계 — 무겁게 내려앉고 끝에 금속이 한 번 */
  | 'tech'
  /** 물컹한 것 — "퍽" */
  | 'squish'
  /** 번개. 물건이 아니다 */
  | 'spark'

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
  /**
   * 회전을 얼마나 빨리 잃는가. 낮을수록 잘 구른다.
   * 물건마다 다르게 두면 "굴러가버렸다"와 "탁 붙었다"가 갈려서, 같은 자리에
   * 떨궈도 판이 매번 달라진다.
   */
  readonly angularDamping: number
  /**
   * 끈적한 물건인가. 닿은 것을 그 자리에서 고정 관절로 묶어버린다.
   *
   * 마찰로 만들려던 시도는 실패했다 — 0.75에서 1.8로 올려도 흘러내린 거리가
   * 소수점 셋째 자리까지 같았다. 이 중력과 이 모양들에서는 애초에 미끄러져
   * 자리를 잃는 일이 드물기 때문이다. 닿는 순간 속도를 죽이는 방법도 실패했다.
   * 물건이 탑 위에 자리를 잡으려면 살짝 미끄러져야 하는데 그걸 막으니 모서리에서
   * 굴러떨어졌고, 무엇보다 받쳐주는 것이 없으면 속도를 눌러도 중력이 이긴다.
   *
   * 그래서 실제로 붙인다. 받쳐주는 것이 전혀 없는 탑 옆면에 갖다 대고 4초를
   * 돌려도 닿은 높이를 그대로 유지한다. `tests/Sticky.test.ts`가 이것을 지킨다.
   */
  readonly sticky: boolean
  readonly hidden: boolean
  readonly scoreBonus: number
  /** 부딪혔을 때 어떤 소리가 나는가. `data/materials.ts`의 표가 정한다 */
  readonly material: Material
  /**
   * 같은 재질 안에서 이 물건의 **음높이**를 가르는 값(0~1). id에서 뽑는다.
   *
   * 재질만으로는 유리잔과 칵테일이 똑같은 소리를 낸다. 이 값으로 음높이를 몇 반음
   * 밀어 물건마다 제 소리를 갖게 하되, id의 함수이므로 **같은 물건은 언제나 같은
   * 소리**를 낸다 — 그래야 반복하는 동안 "저건 텀블러다"가 귀에 익는다.
   */
  readonly tone: number
  /**
   * 같은 재질 안에서 이 물건의 **울림**을 가르는 값(0~1). `tone`과 짝을 이룬다.
   *
   * 축이 둘인 이유는 `data/materials.ts`에 있다 — 음높이 한 줄에 21종을 밀어 넣으면
   * 이웃끼리 0.48반음이라 등간격이어도 귀에는 같은 소리다.
   */
  readonly grain: number
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
/**
 * 물건을 쌓은 사람. 멀티에서 물건이 받침대를 벗어나면 **주인**의 목숨이 깎이므로,
 * 물리 층이 물건마다 이 값을 들고 있어야 한다. 싱글은 주인이 하나뿐이다.
 */
type OwnerId = string

interface BodySnapshot {
  readonly handle: number
  readonly variant: ItemVariant
  readonly owner: OwnerId
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly settled: boolean
  readonly recalled?: boolean
  /** Night Fever가 직접 떨어뜨린 물건. 별똥별 꼬리를 그리는 로컬 연출 표식이다. */
  readonly fever?: boolean
}

/** 네트워크 등 외부 권위 상태로 물리 세계를 복구하기 위한 공통 좌표. */
interface AuthorityBodyBase {
  readonly itemId: number
  readonly variantId: string
  readonly owner: OwnerId
  readonly x: number
  readonly y: number
  readonly rotation: number
}

/** 구형 클라이언트가 보내던 위치 전용 프레임. 기존 로컬 파생 상태는 보존한다. */
interface LegacyAuthorityBodyFrame extends AuthorityBodyBase {
  readonly stateVersion?: undefined
}

/** 물리의 다음 스텝과 사건 판정까지 복원하는 현재 권위 프레임. */
interface CompleteAuthorityBodyFrame extends AuthorityBodyBase {
  readonly stateVersion: 1
  readonly vx: number
  readonly vy: number
  readonly angularVelocity: number
  readonly sleeping: boolean
  readonly settled: boolean
  readonly anchored: boolean
  readonly lost: boolean
  readonly settleTimer: number
  readonly restX: number
  readonly restY: number
  readonly previousSpeed: number
  readonly dislodged: boolean
  readonly impacted: boolean
  readonly struck: boolean
}

type AuthorityBodyFrame = LegacyAuthorityBodyFrame | CompleteAuthorityBodyFrame

/** collapsing은 무너지는 장면을 잠깐 보여주는 구간 — 결과 화면이 그 위를 덮기 전에 */
type GamePhase = 'title' | 'playing' | 'paused' | 'collapsing' | 'over'

interface RunStats {
  /** 정확도 패널티까지 반영한 점수. 화면에 보이는 값이다 */
  readonly score: number
  /** 패널티를 적용하기 전 원점수. 결과 화면이 둘을 나란히 보여준다 */
  readonly rawScore: number
  /** 쌓은 개수 ÷ (쌓은 개수 + 놓친 개수) */
  readonly accuracy: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly missedWords: number
  /** 남은 목숨. 물건이 받침대를 벗어날 때마다 하나 줄어든다 */
  readonly lives: number
  readonly combo: number
  readonly maxCombo: number
  /** 분당 타수(두벌식 키 수 기준). 맞춘 단어만 세고 경과 시간으로 나눈다 */
  readonly kpm: number
  /**
   * 판이 이어진 시간(초).
   * 랭킹 서버가 "이 개수를 이 시간에 쌓는 것이 가능한가"를 보는 데 쓴다 —
   * 물리적으로 불가능한 값을 거르는 유일한 기준이다.
   */
  readonly durationSec: number
  readonly hiddenFound: readonly string[]
}

export type {
  Vec2,
  PrimitiveShape,
  ShapePart,
  ShapeDef,
  Material,
  ItemVariant,
  WordEntry,
  Side,
  FallingWord,
  DifficultyLevel,
  JudgeResult,
  OwnerId,
  BodySnapshot,
  AuthorityBodyFrame,
  GamePhase,
  RunStats,
}
