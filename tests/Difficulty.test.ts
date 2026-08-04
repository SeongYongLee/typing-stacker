import { describe, expect, it } from 'vitest'
import { difficultyAt, RAMP_SECONDS } from '../src/game/systems/Difficulty.ts'

describe('difficultyAt', () => {
  it('시간이 지나면 단어가 더 자주, 더 빨리 내려온다', () => {
    const start = difficultyAt(0)
    const end = difficultyAt(RAMP_SECONDS)
    expect(end.spawnInterval).toBeLessThan(start.spawnInterval)
    expect(end.fallDuration).toBeLessThan(start.fallDuration)
    expect(end.aimSpeed).toBeGreaterThan(start.aimSpeed)
    expect(end.maxConcurrent).toBeGreaterThan(start.maxConcurrent)
  })

  it('램프 구간이 끝나면 더 이상 오르지 않는다', () => {
    expect(difficultyAt(RAMP_SECONDS * 10)).toEqual(difficultyAt(RAMP_SECONDS))
  })

  it('음수 시간에도 최소 난이도로 고정된다', () => {
    expect(difficultyAt(-50)).toEqual(difficultyAt(0))
  })

  it('단조롭게 변한다', () => {
    let previous = difficultyAt(0)
    for (let t = 1; t <= RAMP_SECONDS; t += 1) {
      const current = difficultyAt(t)
      expect(current.spawnInterval).toBeLessThanOrEqual(previous.spawnInterval)
      expect(current.fallDuration).toBeLessThanOrEqual(previous.fallDuration)
      expect(current.aimSpeed).toBeGreaterThanOrEqual(previous.aimSpeed)
      previous = current
    }
  })
})
