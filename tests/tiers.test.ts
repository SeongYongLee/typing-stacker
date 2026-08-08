import { describe, expect, it } from 'vitest'
import { START_RATING, TIERS, tierOf, tierProgress } from '../src/rank/tiers.ts'

describe('티어', () => {
  it('레이팅이 오를수록 등급이 올라간다', () => {
    expect(tierOf(0).name).toBe('브론즈')
    expect(tierOf(START_RATING).name).toBe('실버')
    expect(tierOf(1200).name).toBe('골드')
    expect(tierOf(9999).name).toBe(TIERS[TIERS.length - 1]?.name)
  })

  /*
   * 등급만 보여주면 그 안에서 오르내리는 것이 보이지 않아 한 판이 무의미해 보인다.
   * 마지막 등급은 위가 없으므로 항상 가득 찬다.
   */
  it('구간 안의 진행도를 0~1로 알려준다', () => {
    expect(tierProgress(900)).toBe(0)
    expect(tierProgress(1000)).toBeCloseTo(0.5, 5)
    expect(tierProgress(1099)).toBeCloseTo(0.995, 2)
    expect(tierProgress(9999)).toBe(1)
  })

  it('음수 레이팅도 가장 낮은 등급으로 떨어질 뿐 깨지지 않는다', () => {
    expect(tierOf(-500).name).toBe('브론즈')
    expect(tierProgress(-500)).toBe(0)
  })
})
