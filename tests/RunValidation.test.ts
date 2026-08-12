import { describe, expect, it } from 'vitest'
import { LIMITS, withinRunLimits } from '../worker/src/runLimits.ts'

function run(overrides: Partial<Parameters<typeof withinRunLimits>[0]> = {}) {
  return {
    score: 300_000,
    stackCount: 650,
    maxHeight: 52,
    maxCombo: 120,
    kpm: 220,
    durationSec: 3600,
    ...overrides,
  }
}

describe('싱글 장기 기록 검증', () => {
  it('30만점대 정상 장기 플레이를 받는다', () => {
    expect(withinRunLimits(run())).toBe(true)
  })

  it('늘어난 상한 밖의 값과 불가능하게 빠른 기록은 계속 거절한다', () => {
    expect(withinRunLimits(run({ stackCount: LIMITS.stackCount + 1 }))).toBe(false)
    expect(withinRunLimits(run({ maxHeight: LIMITS.height + 1 }))).toBe(false)
    expect(withinRunLimits(run({ durationSec: 10 }))).toBe(false)
  })
})
