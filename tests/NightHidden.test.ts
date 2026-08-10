import { describe, expect, it } from 'vitest'
import { HIDDEN_CHANCE, OPENING_HIDDEN_CHANCE } from '../src/game/config.ts'
import { hiddenChanceForPhase } from '../src/game/core/GameEngine.ts'

/**
 * 첫 밤의 계획한 재료는 히든으로 바뀌는 빈도를 낮추되, 낮과 밤은 같은 평소 확률을 쓴다.
 *
 * 밤이 레시피 재료만 내보내던 때에는 좁힌 밭 여부를 기준으로 삼아 밤까지 확률이
 * 낮아진 회귀가 있었다. 지금은 모든 국면이 전체 단어를 열어두므로 국면을 직접 보는
 * 규칙만 남긴다.
 */
describe('국면별 히든 확률', () => {
  it('첫 밤에는 계획한 재료를 지키기 위해 낮춘 확률을 쓴다', () => {
    expect(hiddenChanceForPhase('firstNight')).toBe(OPENING_HIDDEN_CHANCE)
    expect(OPENING_HIDDEN_CHANCE).toBeLessThan(HIDDEN_CHANCE)
  })

  it('낮과 밤에는 같은 평소 확률을 쓴다', () => {
    expect(hiddenChanceForPhase('day')).toBe(HIDDEN_CHANCE)
    expect(hiddenChanceForPhase('night')).toBe(HIDDEN_CHANCE)
  })
})
