import { describe, expect, it } from 'vitest'
import {
  difficultyAt,
  stageIndexAt,
  stageProgressAt,
  RAMP_SECONDS,
  STAGE_COUNT,
  STAGE_SECONDS,
} from '../src/game/systems/Difficulty.ts'

describe('difficultyAt', () => {
  it('단계가 오르면 단어가 더 자주, 더 빨리 내려온다', () => {
    const start = difficultyAt(0)
    const end = difficultyAt(RAMP_SECONDS)
    expect(end.spawnInterval).toBeLessThan(start.spawnInterval)
    expect(end.fallDuration).toBeLessThan(start.fallDuration)
    expect(end.aimSpeed).toBeGreaterThan(start.aimSpeed)
    expect(end.maxConcurrent).toBeGreaterThan(start.maxConcurrent)
  })

  it('한 단계 안에서는 값이 변하지 않는다', () => {
    expect(difficultyAt(0)).toEqual(difficultyAt(STAGE_SECONDS - 0.01))
    expect(difficultyAt(STAGE_SECONDS)).not.toEqual(difficultyAt(STAGE_SECONDS - 0.01))
  })

  it('마지막 단계에 닿으면 더 이상 오르지 않는다', () => {
    expect(difficultyAt(RAMP_SECONDS * 10)).toEqual(difficultyAt(RAMP_SECONDS))
  })

  it('음수 시간에도 첫 단계로 고정된다', () => {
    expect(difficultyAt(-50)).toEqual(difficultyAt(0))
  })

  it('단조롭게 변한다', () => {
    let previous = difficultyAt(0)
    for (let t = 1; t <= RAMP_SECONDS + STAGE_SECONDS; t += 1) {
      const current = difficultyAt(t)
      expect(current.spawnInterval).toBeLessThanOrEqual(previous.spawnInterval)
      expect(current.fallDuration).toBeLessThanOrEqual(previous.fallDuration)
      expect(current.aimSpeed).toBeGreaterThanOrEqual(previous.aimSpeed)
      expect(current.maxConcurrent).toBeGreaterThanOrEqual(previous.maxConcurrent)
      previous = current
    }
  })
})

describe('stageIndexAt', () => {
  it('STAGE_SECONDS마다 한 단계 오른다', () => {
    expect(stageIndexAt(0)).toBe(0)
    expect(stageIndexAt(STAGE_SECONDS - 0.01)).toBe(0)
    expect(stageIndexAt(STAGE_SECONDS)).toBe(1)
    expect(stageIndexAt(STAGE_SECONDS * 3)).toBe(3)
  })

  it('마지막 단계에서 멈춘다', () => {
    expect(stageIndexAt(STAGE_SECONDS * 100)).toBe(STAGE_COUNT - 1)
  })
})

describe('stageProgressAt', () => {
  it('단계 안에서 0에서 1로 찬다', () => {
    expect(stageProgressAt(0)).toBe(0)
    expect(stageProgressAt(STAGE_SECONDS / 2)).toBeCloseTo(0.5)
    expect(stageProgressAt(STAGE_SECONDS - 0.001)).toBeGreaterThan(0.99)
  })

  it('단계가 오르면 다시 0에서 시작한다', () => {
    expect(stageProgressAt(STAGE_SECONDS)).toBe(0)
  })

  // 최대 단계에서 게이지가 비면 "아직 오를 것이 남았다"로 잘못 읽힌다
  it('마지막 단계에서는 꽉 찬 채로 남는다', () => {
    expect(stageProgressAt(RAMP_SECONDS)).toBe(1)
    expect(stageProgressAt(RAMP_SECONDS + 500)).toBe(1)
  })
})
