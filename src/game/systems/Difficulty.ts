import type { DifficultyLevel } from '../types/game.ts'

/** 이 시간이 지나면 난이도가 최대치에서 더 오르지 않는다 */
const RAMP_SECONDS = 180

const EASY: DifficultyLevel = {
  spawnInterval: 3.2,
  fallDuration: 9,
  aimSpeed: 0.42,
  maxConcurrent: 3,
}

const HARD: DifficultyLevel = {
  spawnInterval: 1.3,
  fallDuration: 4.6,
  aimSpeed: 0.74,
  maxConcurrent: 6,
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function difficultyAt(elapsedSeconds: number): DifficultyLevel {
  const t = Math.min(Math.max(elapsedSeconds / RAMP_SECONDS, 0), 1)
  return {
    spawnInterval: lerp(EASY.spawnInterval, HARD.spawnInterval, t),
    fallDuration: lerp(EASY.fallDuration, HARD.fallDuration, t),
    aimSpeed: lerp(EASY.aimSpeed, HARD.aimSpeed, t),
    maxConcurrent: Math.round(lerp(EASY.maxConcurrent, HARD.maxConcurrent, t)),
  }
}

export { difficultyAt, RAMP_SECONDS }
