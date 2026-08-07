import type { DifficultyLevel } from '../types/game.ts'

/**
 * 난이도는 **단계로** 오른다. 프레임마다 잠자도 오르는 연속 보간이 아니다.
 *
 * 연속 보간은 화면에 정직하게 표시할 방법이 없다 — 숫자가 늘 조금씩 움직이면
 * 플레이어는 무엇이 언제 바뀌었는지 알 수 없다. 단계로 끊으면 상단에 "몇 단계"와
 * "다음 단계까지"를 보여줄 수 있고, 올라가는 순간이 반응할 수 있는 사건이 된다.
 *
 * 한 단계는 12초다. 판이 대개 12~20초에 끝나므로 이 길이여야 한 판에서 2~3단계를
 * 실제로 겪는다. 이전에는 180초에 걸쳐 오르게 두어서 아무도 최대 난이도를 보지 못했다.
 */
const STAGE_SECONDS = 12

/**
 * 낙하 시간은 단어를 치는 데 걸리는 시간에 맞춰 잡았다.
 * 단어 평균이 6.3타이므로 사람 속도(300~350타/분)로 1.1~1.5초다.
 * 1단계는 여유 4배로 시작해 5단계에서 2배까지 좁아진다.
 *
 * 동시 낙하 상한은 단어 풀(13개)에 묶인다. 활성 단어의 중복을 막으므로
 * 상한이 풀 크기에 가까우면 화면이 거의 전체 어휘로 채워져 스폰이 막힌다.
 *
 * 화살표 속도는 왕복 시간으로 읽는 게 맞다(`2 / aimSpeed`초).
 * 1단계 4.2초에서 5단계 2.4초까지 좁아진다. 여기서 더 빠르면 조준이 운에 가까워지고,
 * 더 느리면 원하는 자리를 기다리는 동안 단어가 바닥선에 닿는 긴장이 사라진다.
 */
const STAGES: readonly DifficultyLevel[] = [
  { spawnInterval: 1.6, fallDuration: 6.5, aimSpeed: 0.48, maxConcurrent: 5 },
  { spawnInterval: 1.38, fallDuration: 5.6, aimSpeed: 0.57, maxConcurrent: 5 },
  { spawnInterval: 1.17, fallDuration: 4.65, aimSpeed: 0.66, maxConcurrent: 6 },
  { spawnInterval: 0.96, fallDuration: 3.7, aimSpeed: 0.75, maxConcurrent: 6 },
  { spawnInterval: 0.75, fallDuration: 2.8, aimSpeed: 0.85, maxConcurrent: 7 },
]

const STAGE_COUNT = STAGES.length

/** 최대 단계에 닿는 시각. 그 뒤로는 더 오르지 않는다 */
const RAMP_SECONDS = STAGE_SECONDS * (STAGE_COUNT - 1)

/** 0부터 시작하는 단계 번호 */
function stageIndexAt(elapsedSeconds: number): number {
  const raw = Math.floor(Math.max(elapsedSeconds, 0) / STAGE_SECONDS)
  return Math.min(raw, STAGE_COUNT - 1)
}

function difficultyAt(elapsedSeconds: number): DifficultyLevel {
  return STAGES[stageIndexAt(elapsedSeconds)]!
}

/**
 * 지금 단계가 얼마나 찼는지 (0~1). 게이지바가 이 값을 그린다.
 * 최대 단계에서는 더 오를 곳이 없으므로 꽉 찬 채로 둔다 — 게이지가 다시 비면
 * 아직 오를 것이 남았다고 잘못 읽힌다.
 */
function stageProgressAt(elapsedSeconds: number): number {
  if (stageIndexAt(elapsedSeconds) >= STAGE_COUNT - 1) {
    return 1
  }
  const within = (Math.max(elapsedSeconds, 0) % STAGE_SECONDS) / STAGE_SECONDS
  return Math.min(Math.max(within, 0), 1)
}

export {
  difficultyAt,
  stageIndexAt,
  stageProgressAt,
  RAMP_SECONDS,
  STAGE_COUNT,
  STAGE_SECONDS,
}
