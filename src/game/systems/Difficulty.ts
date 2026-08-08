import { ARENA, DIFFICULTY_FULL_HEIGHT, WORD } from '../config.ts'
import type { DifficultyLevel } from '../types/game.ts'

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
 * 어디서 최대치에 닿는지는 `DIFFICULTY_FULL_HEIGHT`가 정한다. 한때 카메라가 움직이기
 * 시작하는 높이를 그대로 썼는데, 재보니 그 지점이 **판의 절반**이라 나머지 절반을 내내
 * 최대 밀도로 보내고 있었다 — 실측과 근거는 그 상수에.
 *
 * 동시 낙하 상한은 단어 풀과 레인 칸 수(5x2)에 묶인다. 활성 단어의 중복을 막으므로
 * 상한이 풀 크기에 가까우면 화면이 거의 전체 어휘로 채워져 스폰이 막힌다.
 */

/**
 * 단어가 바닥선까지 내려오는 데 걸리는 시간. 처음부터 끝까지 같다.
 *
 * 7.5초에서 늘렸다. 물건이 78개로 늘면서 단어도 길어졌는데(평균 7.6타, 최장 13타)
 * 낙하 시간은 그대로여서 느린 손이 걸렸다 — 100타/분이면 가장 긴 단어에 7.8초가
 * 드는데 낙하가 7.5초라 **읽기도 전에 지나간다.** 10초면 같은 손에도 1.2초가 남고,
 * 버거운 단어가 39개에서 9개로 준다.
 *
 * 빠른 손에는 아무 변화가 없다. 200타/분은 지금도 놓치는 단어가 없다 —
 * 이 값은 못 치는 쪽만 골라서 돕는다.
 *
 * 늘려도 쌓기는 쉬워지지 않는다. 천천히 내려오는 것은 **글자**이지 물건이 아니다.
 */
const FALL_DURATION = 10

/** 판을 여는 밀도. 무엇이 나오는지 보고 어디에 놓을지 정할 틈이 있다 */
const OPENING: DifficultyLevel = {
  /*
   * 판을 여는 간격. 여기서 급하면 뒤가 아무리 여유로워도 게임 전체가 급해 보인다.
   * 무엇이 나오는지 보고 어디에 놓을지 정하는 데 한 번은 쉴 틈이 있어야 한다.
   */
  spawnInterval: 3.6,
  fallDuration: FALL_DURATION,
  aimSpeed: 0.38,
  maxConcurrent: 3,
}

/**
 * 다 쌓아 올렸을 때의 밀도. 실측으로 판의 3분의 2쯤 지나 닿는다.
 *
 * 동시에 뜨는 수를 5에서 4로 줄였다. 다섯이 한꺼번에 떠 있으면 어느 것을 칠지
 * 고르는 데만 시간이 가고, 고르는 사이에 아래쪽이 지나간다. 넷이면 눈이 한 번에 담긴다.
 */
const FULL: DifficultyLevel = {
  spawnInterval: 2,
  fallDuration: FALL_DURATION,
  aimSpeed: 0.38,
  maxConcurrent: 4,
}

/**
 * 탑 높이를 0~1 진행도로 옮긴다.
 * 받침대 윗면에서 시작해 `DIFFICULTY_FULL_HEIGHT`만큼 쌓으면 1이 된다.
 */
function difficultyProgress(stackTop: number): number {
  if (DIFFICULTY_FULL_HEIGHT <= 0) {
    return 1
  }
  const climbed = stackTop - ARENA.platformTop
  return Math.min(1, Math.max(0, climbed / DIFFICULTY_FULL_HEIGHT))
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

/**
 * 레인이 담을 수 있는 단어 수. 좌우 각 slotsPerSide칸이다.
 * 이보다 많이 내보내면 자리가 없어 스포너가 조용히 거른다.
 */
const MAX_ON_SCREEN = WORD.slotsPerSide * 2

/**
 * 인원에 **비례해** 단어 밭을 넓힌다. 대전에서만 부른다.
 *
 * 대전은 차례가 돌아가고, **기다리는 사람은 덫을 걸며 손을 놀린다.** 그런데 덫은
 * 단어를 없애지 않고 표시만 하므로 걸 수 있는 단어가 곧 바닥난다 — 여덟이 붙으면
 * 일곱이 같은 서너 개를 두고 달려들어 1초면 다 걸린다. 그때부터 기다리는 사람은
 * 칠 것이 없다.
 *
 * 그래서 둘일 때를 기준으로 **인원 배수만큼** 늘린다. 넷이면 두 배, 여덟이면 네 배다.
 * 동시에 뜨는 수와 나오는 빈도를 함께 올려야 한다 — 상한만 올리면 자리는 있는데
 * 채워지지 않고, 빈도만 올리면 상한에 막혀 나오다 만다.
 *
 * 다만 **레인 칸이 진짜 상한**이라 배수대로 다 늘어나지는 않는다. 여덟이면 스무 개를
 * 원하지만 자리가 열 개뿐이다. 그 위로는 레이아웃을 바꿔야 한다.
 */
function forPlayers(level: DifficultyLevel, players: number): DifficultyLevel {
  const scale = Math.max(1, players / 2)
  if (scale === 1) {
    return level
  }
  return {
    ...level,
    maxConcurrent: Math.min(Math.round(level.maxConcurrent * scale), MAX_ON_SCREEN),
    spawnInterval: Math.max(level.spawnInterval / scale, MIN_SPAWN_INTERVAL),
  }
}

/** 아무리 사람이 많아도 이보다 자주 내보내지는 않는다 */
const MIN_SPAWN_INTERVAL = 0.55

export { OPENING, FULL, MAX_ON_SCREEN, difficultyAt, difficultyProgress, forPlayers }
