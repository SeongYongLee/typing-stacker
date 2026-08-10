import type { DifficultyLevel } from '../game/types/game.ts'

/** 경쟁 모드는 방 하나에 여섯 명까지만 받는다. 공유 물리 부하를 먼저 재기 위한 상한이다. */
const COMPETITION_MAX_PLAYERS = 6

/** 물건을 연달아 쏟는 것만 막는다. 단어 공급보다 짧아 손을 기다리게 하지는 않는다. */
const COMPETITION_DROP_INTERVAL_SEC = 0.45

/** 중계 전송로의 마지막 재접속 시도(18초)보다 조금 길게 기다린다. */
const COMPETITION_RECONNECT_GRACE_SEC = 20

/** 현재 권위 키프레임이 안전하게 실을 수 있는 공유 물건 수. */
const COMPETITION_MAX_BODIES = 128

/** 참가자별 단어 흐름. 여섯 명이면 기존 턴제보다 한 사람의 입력 기회가 약 네 배 잦다. */
const COMPETITION_OPENING: DifficultyLevel = {
  spawnInterval: 1.8,
  fallDuration: 9,
  aimSpeed: 0.38,
  maxConcurrent: 5,
}

const COMPETITION_FULL: DifficultyLevel = {
  spawnInterval: 1.4,
  fallDuration: 9,
  aimSpeed: 0.38,
  maxConcurrent: 6,
}

function competitionDifficulty(progress: number): DifficultyLevel {
  const t = Math.min(1, Math.max(0, progress))
  const lerp = (from: number, to: number): number => from + (to - from) * t
  return {
    spawnInterval: lerp(COMPETITION_OPENING.spawnInterval, COMPETITION_FULL.spawnInterval),
    fallDuration: lerp(COMPETITION_OPENING.fallDuration, COMPETITION_FULL.fallDuration),
    aimSpeed: lerp(COMPETITION_OPENING.aimSpeed, COMPETITION_FULL.aimSpeed),
    maxConcurrent: Math.round(
      lerp(COMPETITION_OPENING.maxConcurrent, COMPETITION_FULL.maxConcurrent),
    ),
  }
}

export {
  COMPETITION_MAX_PLAYERS,
  COMPETITION_DROP_INTERVAL_SEC,
  COMPETITION_RECONNECT_GRACE_SEC,
  COMPETITION_MAX_BODIES,
  COMPETITION_OPENING,
  COMPETITION_FULL,
  competitionDifficulty,
}
