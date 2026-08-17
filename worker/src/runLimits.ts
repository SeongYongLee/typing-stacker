const LIMITS = {
  /** 두벌식 기준 분당 키 수. 세계 기록권이 700~900타다 */
  kpm: 1500,
  /**
   * 물건 하나당 필요한 최소 판 시간(초).
   *
   * 플레이어 낙하(최대 0.3초 간격)와 경보 자동 반입(0.5초 간격)은 동시에 일어난다.
   * 둘을 더한 최대 생성률보다 느슨하게 둬 정상적인 혼잡 구간을 막지 않는다.
   */
  secondsPerItem: 0.15,
  /** 물건 하나가 벌 수 있는 점수의 상한 (기본 + 높이 + 콤보 배수 + 히든) */
  scorePerItem: 3000,
  /** 장시간 판도 받는다. 실제 속도 제한은 secondsPerItem이 별도로 검증한다. */
  stackCount: 5000,
  /** 카메라가 계속 올라가는 게임이므로 오래 버틴 정상 탑을 막지 않는 안전 상한(m) */
  height: 300,
} as const

type RunLimitViolation = 'kpm' | 'stack-count' | 'height' | 'combo' | 'score' | 'duration'

interface RunLimitInput {
  readonly score: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly maxCombo: number
  readonly kpm: number
  readonly durationSec: number
}

function runLimitViolation(run: RunLimitInput): RunLimitViolation | null {
  if (run.kpm > LIMITS.kpm) return 'kpm'
  if (run.stackCount > LIMITS.stackCount) return 'stack-count'
  if (run.maxHeight > LIMITS.height) return 'height'

  /*
   * 콤보는 입력 순간 오르고 쌓은 개수는 물건이 멎을 때 오른다. 마지막 물건이 밖으로
   * 떨어진 완벽한 판은 정상적으로 `maxCombo === stackCount + 1`일 수 있으므로 둘을 직접
   * 비교하지 않는다. 대신 타수와 판 시간으로 그동안 칠 수 있었던 키 수보다 넉넉한지만 본다.
   * KPM은 반올림된 값이고 1초 전에는 0이라, 반올림 1타와 마지막 입력 2개를 여유로 둔다.
   */
  const possibleKeys = ((run.kpm + 1) * Math.max(run.durationSec, 1)) / 60
  if (run.maxCombo > Math.ceil(possibleKeys) + 2) return 'combo'
  if (run.score > run.stackCount * LIMITS.scorePerItem) return 'score'
  if (run.durationSec < run.stackCount * LIMITS.secondsPerItem) return 'duration'
  return null
}

function withinRunLimits(run: RunLimitInput): boolean {
  return runLimitViolation(run) === null
}

export { LIMITS, runLimitViolation, withinRunLimits }
export type { RunLimitInput, RunLimitViolation }
