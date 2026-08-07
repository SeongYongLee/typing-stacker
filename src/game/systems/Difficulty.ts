import { ARENA } from '../config.ts'
import type { DifficultyLevel } from '../types/game.ts'
import { CAMERA_START_TOP } from './Camera.ts'

/**
 * 난이도는 **시간이 아니라 탑 높이**를 따라간다.
 *
 * 예전에는 12초마다 한 단계씩 올랐다. 그것을 없앤 이유는 압박의 축이 겹쳤기 때문이다 —
 * 이 게임은 스택이 높아질수록 저절로 어려워지므로(무게중심이 높아지고 얹을 자리가
 * 좁아진다) 시간 압박을 더하면 두 축이 같은 방향으로 겹쳐, 실력이 늘어도 판이
 * 길어지지 않고 "언제 끝나는지"만 시간이 정해버린다.
 *
 * 그렇다고 완전히 고정하면 판을 여는 순간이 이미 최대 밀도라, 무엇이 나오는지
 * 살펴볼 틈 없이 손부터 급해진다. 그래서 **쌓은 만큼** 몰아치게 한다.
 * 잘 쌓는 사람에게 더 많은 단어가 오고, 아직 못 쌓은 사람은 여유를 갖는다.
 *
 * 기준점은 **카메라가 움직이기 시작하는 높이**다. 판이 본격적으로 시작됐다는 것을
 * 플레이어가 눈으로 아는 유일한 순간이라, 밀도가 오르는 시점과 맞아떨어진다.
 *
 * 동시 낙하 상한은 단어 풀(13개)과 레인 칸 수(4x2)에 묶인다. 활성 단어의 중복을
 * 막으므로 상한이 풀 크기에 가까우면 화면이 거의 전체 어휘로 채워져 스폰이 막힌다.
 */

/** 판을 여는 밀도. 무엇이 나오는지 보고 어디에 놓을지 정할 틈이 있다 */
const OPENING: DifficultyLevel = {
  spawnInterval: 2.4,
  fallDuration: 7.5,
  aimSpeed: 0.38,
  maxConcurrent: 3,
}

/** 카메라가 움직이기 시작할 무렵 닿는 밀도 */
const FULL: DifficultyLevel = {
  spawnInterval: 1.7,
  fallDuration: 7.5,
  aimSpeed: 0.38,
  maxConcurrent: 5,
}

/**
 * 탑 높이를 0~1 진행도로 옮긴다.
 * 받침대 윗면에서 시작해 카메라가 움직이기 시작하는 높이에서 1이 된다.
 */
function difficultyProgress(stackTop: number): number {
  const span = CAMERA_START_TOP - ARENA.platformTop
  if (span <= 0) {
    return 1
  }
  return Math.min(1, Math.max(0, (stackTop - ARENA.platformTop) / span))
}

/**
 * 진행도에 맞는 난이도. 사이 값은 이어서 넘어간다.
 *
 * 단계로 끊지 않는 이유는 화면에 표시할 것이 없기 때문이다. 예전의 단계와 게이지는
 * "무엇이 언제 바뀌었는지"를 보여주려던 장치였는데 지금은 그 표시가 없으므로,
 * 끊어봐야 툭툭 바뀌는 느낌만 남는다.
 *
 * 동시 낙하 상한만 정수라 반올림한다.
 */
function difficultyAt(progress: number): DifficultyLevel {
  const t = Math.min(1, Math.max(0, progress))
  const lerp = (from: number, to: number) => from + (to - from) * t
  return {
    spawnInterval: lerp(OPENING.spawnInterval, FULL.spawnInterval),
    fallDuration: lerp(OPENING.fallDuration, FULL.fallDuration),
    aimSpeed: lerp(OPENING.aimSpeed, FULL.aimSpeed),
    maxConcurrent: Math.round(lerp(OPENING.maxConcurrent, FULL.maxConcurrent)),
  }
}

export { OPENING, FULL, difficultyAt, difficultyProgress }
