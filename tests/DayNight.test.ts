import { describe, expect, it } from 'vitest'
import { DAY_SEC, NIGHT_SEC } from '../src/game/config.ts'
import { cycleOf, timeOfDay, TWILIGHT_SEC } from '../src/game/systems/DayNight.ts'

describe('timeOfDay', () => {
  it('낮에서 시작해 20초 낮과 10초 밤을 반복한다', () => {
    expect(timeOfDay(0).phase).toBe('day')
    expect(timeOfDay(DAY_SEC - 0.1).phase).toBe('day')
    expect(timeOfDay(DAY_SEC).phase).toBe('night')
    expect(timeOfDay(DAY_SEC + NIGHT_SEC - 0.1).phase).toBe('night')
    expect(timeOfDay(DAY_SEC + NIGHT_SEC).phase).toBe('day')
    expect(timeOfDay((DAY_SEC + NIGHT_SEC) * 3 + DAY_SEC).phase).toBe('night')
  })

  it('한 바퀴가 30초이고 바늘은 시작부터 등속으로 돈다', () => {
    const cycle = DAY_SEC + NIGHT_SEC
    expect(cycleOf(timeOfDay(0))).toBeCloseTo(0)
    expect(cycleOf(timeOfDay(5))).toBeCloseTo(5 / cycle)
    expect(cycleOf(timeOfDay(DAY_SEC))).toBeCloseTo(DAY_SEC / cycle)
    expect(cycleOf(timeOfDay(cycle - 0.01))).toBeCloseTo(1, 2)
    expect(cycleOf(timeOfDay(cycle))).toBeCloseTo(0)
  })

  it('각 국면의 진행도는 0에서 1로 간다', () => {
    expect(timeOfDay(0).progress).toBe(0)
    expect(timeOfDay(DAY_SEC - 0.001).progress).toBeCloseTo(1, 2)
    expect(timeOfDay(DAY_SEC).progress).toBe(0)
    expect(timeOfDay(DAY_SEC + NIGHT_SEC - 0.001).progress).toBeCloseTo(1, 2)
  })

  it('해는 순간이 아니라 2.5초에 걸쳐 지고 뜬다', () => {
    expect(timeOfDay(DAY_SEC / 2).nightfall).toBe(0)

    const dusk = timeOfDay(DAY_SEC - TWILIGHT_SEC / 2).nightfall
    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(1)

    expect(timeOfDay(DAY_SEC + NIGHT_SEC / 2).nightfall).toBe(1)

    const dawn = timeOfDay(DAY_SEC + NIGHT_SEC - TWILIGHT_SEC / 2).nightfall
    expect(dawn).toBeGreaterThan(0)
    expect(dawn).toBeLessThan(1)
  })

  it('경계에서 밝기가 튀지 않는다', () => {
    let worst = 0
    for (let t = 0; t < (DAY_SEC + NIGHT_SEC) * 3; t += 0.1) {
      const jump = Math.abs(timeOfDay(t + 0.1).nightfall - timeOfDay(t).nightfall)
      worst = Math.max(worst, jump)
    }
    expect(worst, `가장 큰 변화 ${worst.toFixed(3)}`).toBeLessThan(0.1)
  })
})
