import { describe, expect, it } from 'vitest'
import { LIMITS, runLimitViolation, withinRunLimits } from '../worker/src/runLimits.ts'
import { parseProfile } from '../worker/src/profile.ts'

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

  it('마지막 물건이 정착하지 않은 완벽 콤보를 받는다', () => {
    expect(withinRunLimits(run({ stackCount: 650, maxCombo: 651 }))).toBe(true)
  })

  it('입력 낙하와 경보 반입이 겹친 정상 속도를 받는다', () => {
    expect(withinRunLimits(run({ stackCount: 100, maxCombo: 50, durationSec: 20 }))).toBe(true)
  })

  it('늘어난 상한 밖의 값과 불가능하게 빠른 기록은 계속 거절한다', () => {
    expect(withinRunLimits(run({ stackCount: LIMITS.stackCount + 1 }))).toBe(false)
    expect(withinRunLimits(run({ maxHeight: LIMITS.height + 1 }))).toBe(false)
    expect(withinRunLimits(run({ stackCount: 100, maxCombo: 20, durationSec: 10 }))).toBe(false)
    expect(withinRunLimits(run({ maxCombo: 20_000, kpm: 100, durationSec: 60 }))).toBe(false)
  })

  it('거절된 항목을 서버 응답에 쓸 수 있게 구분한다', () => {
    expect(runLimitViolation(run({ maxHeight: LIMITS.height + 1 }))).toBe('height')
    expect(runLimitViolation(run({ stackCount: 100, maxCombo: 20, durationSec: 10 })))
      .toBe('duration')
  })
})

describe('랭킹 프로필 검증', () => {
  it('유효한 이름과 아이콘을 받는다', () => {
    expect(parseProfile({ id: 'player', name: '말랑한 연필', icon: 'pencil-set' }))
      .toEqual({ id: 'player', name: '말랑한 연필', icon: 'pencil-set' })
    expect(parseProfile({ id: 'player', name: '말랑한 연필', icon: '' }))
      .toEqual({ id: 'player', name: '말랑한 연필', icon: '' })
  })

  it('비어 있거나 너무 긴 값과 잘못된 아이콘을 거절한다', () => {
    expect(parseProfile({ id: '', name: '말랑한 연필', icon: '' })).toBeNull()
    expect(parseProfile({ id: 'player', name: '가'.repeat(13), icon: '' })).toBeNull()
    expect(parseProfile({ id: 'player', name: '말랑한 연필', icon: '../bad' })).toBeNull()
  })
})
