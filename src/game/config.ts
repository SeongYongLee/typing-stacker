/**
 * 아레나 좌표계: 원점은 받침대 중앙, x는 오른쪽 +, y는 위쪽 + (단위: 미터).
 * Rapier는 수 미터 규모에서 가장 안정적이라 픽셀이 아니라 미터로 시뮬레이션하고,
 * 렌더러가 px로 환산한다.
 */
const ARENA = {
  halfWidth: 3.2,
  height: 7,
  /** 받침대 윗면 높이 */
  platformTop: 0.8,
  platformHalfWidth: 1.2,
  platformHalfHeight: 0.25,
  /** 물건이 생성되는 높이 */
  spawnY: 6.2,
  /** 이 높이보다 아래로 내려간 물건은 이탈로 본다 */
  killY: -0.8,
  gravity: -9.81,
} as const

/** 화살표가 훑는 범위. 받침대보다 살짝 넓어서 과감한 조준은 빗나갈 수 있다. */
const AIM_HALF_RANGE = ARENA.platformHalfWidth * 1.15

/** 물건을 연달아 쏟아내 물리를 망가뜨리는 것만 막는 최소 간격 */
const DROP_COOLDOWN_MS = 300

const HIDDEN_CHANCE = 0.14

/** 안정화 판정: 이 속도 아래로 이만큼 유지되면 착지 완료로 본다 */
const SETTLE_SPEED = 0.35
const SETTLE_HOLD_SEC = 0.35

const SCORE = {
  perItem: 100,
  perHeightMeter: 220,
} as const

const WORD = {
  slotsPerSide: 3,
} as const

export {
  ARENA,
  AIM_HALF_RANGE,
  DROP_COOLDOWN_MS,
  HIDDEN_CHANCE,
  SETTLE_SPEED,
  SETTLE_HOLD_SEC,
  SCORE,
  WORD,
}
