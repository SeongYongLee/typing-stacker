const LIMITS = {
  /** 두벌식 기준 분당 키 수. 세계 기록권이 700~900타다 */
  kpm: 1500,
  /** 물건 하나를 떨궈 자리 잡기까지 최소로 걸리는 시간(초) */
  secondsPerItem: 0.8,
  /** 물건 하나가 벌 수 있는 점수의 상한 (기본 + 높이 + 콤보 배수 + 히든) */
  scorePerItem: 3000,
  /** 장시간 판도 받는다. 실제 속도 제한은 secondsPerItem이 별도로 검증한다. */
  stackCount: 5000,
  /** 카메라가 계속 올라가는 게임이므로 오래 버틴 정상 탑을 막지 않는 안전 상한(m) */
  height: 300,
} as const

interface RunLimitInput {
  readonly score: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly maxCombo: number
  readonly kpm: number
  readonly durationSec: number
}

function withinRunLimits(run: RunLimitInput): boolean {
  return (
    run.kpm <= LIMITS.kpm &&
    run.stackCount <= LIMITS.stackCount &&
    run.maxHeight <= LIMITS.height &&
    run.maxCombo <= run.stackCount &&
    run.score <= run.stackCount * LIMITS.scorePerItem &&
    run.durationSec >= run.stackCount * LIMITS.secondsPerItem
  )
}

export { LIMITS, withinRunLimits }
export type { RunLimitInput }
