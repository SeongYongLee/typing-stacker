import { describe, expect, it } from 'vitest'
import { OPENING, FULL } from '../src/game/systems/Difficulty.ts'
import {
  COMPETITION_FULL,
  COMPETITION_OPENING,
  competitionDifficulty,
} from '../src/competition/config.ts'

describe('경쟁 모드 단어 밀도', () => {
  it('기존 함께 하기에서 한 사람에게 돌아오던 차례보다 입력 기회가 빠르다', () => {
    // 여섯 명 턴제는 같은 사람이 다시 치기까지 최소 0.9초 × 6명이 걸린다.
    expect(COMPETITION_OPENING.spawnInterval).toBeLessThan(0.9 * 6)
    expect(COMPETITION_FULL.spawnInterval).toBeLessThan(0.9 * 6)
  })

  it('싱글보다 빠르되 화면을 단어로 가득 채우지는 않는다', () => {
    expect(COMPETITION_OPENING.spawnInterval).toBeLessThan(OPENING.spawnInterval)
    expect(COMPETITION_FULL.spawnInterval).toBeLessThan(FULL.spawnInterval)
    expect(COMPETITION_OPENING.maxConcurrent).toBeLessThanOrEqual(6)
    expect(COMPETITION_FULL.maxConcurrent).toBeLessThanOrEqual(6)
  })

  it('탑이 높아질수록 부드럽게 더 자주 나온다', () => {
    expect(competitionDifficulty(0)).toEqual(COMPETITION_OPENING)
    expect(competitionDifficulty(1)).toEqual(COMPETITION_FULL)
    expect(competitionDifficulty(0.5).spawnInterval).toBeCloseTo(1.6)
  })
})
