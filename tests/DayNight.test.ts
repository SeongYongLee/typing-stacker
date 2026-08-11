import { describe, expect, it } from 'vitest'
import {
  cycleOf,
  DAWN_PROGRESS,
  DAY_CLOCK_SHARE,
  DUSK_PROGRESS,
  timeOfDay,
} from '../src/game/systems/DayNight.ts'

describe('timeOfDay', () => {
  it('엔진이 정한 낮과 밤 국면을 그대로 보여준다', () => {
    expect(timeOfDay('day', 0).phase).toBe('day')
    expect(timeOfDay('day', 1).phase).toBe('day')
    expect(timeOfDay('night', 0).phase).toBe('night')
    expect(timeOfDay('night', 1).phase).toBe('night')
  })

  it('낮 점수와 밤 시간 진행도를 0에서 1 사이로 제한한다', () => {
    expect(timeOfDay('day', -1).progress).toBe(0)
    expect(timeOfDay('day', 0.5).progress).toBe(0.5)
    expect(timeOfDay('night', 2).progress).toBe(1)
  })

  it('시계는 낮 점수 구간과 밤 시간 구간을 이어 한 바퀴 돈다', () => {
    expect(cycleOf(timeOfDay('day', 0))).toBe(0)
    expect(cycleOf(timeOfDay('day', 0.5))).toBeCloseTo(DAY_CLOCK_SHARE / 2)
    expect(cycleOf(timeOfDay('day', 1))).toBeCloseTo(DAY_CLOCK_SHARE)
    expect(cycleOf(timeOfDay('night', 0))).toBeCloseTo(DAY_CLOCK_SHARE)
    expect(cycleOf(timeOfDay('night', 1))).toBe(1)
  })

  it('낮 점수의 끝자락에서 해가 지고 밤의 끝자락에서 뜬다', () => {
    expect(timeOfDay('day', 1 - DUSK_PROGRESS).nightfall).toBe(0)
    expect(timeOfDay('day', 1 - DUSK_PROGRESS / 2).nightfall).toBeCloseTo(0.5)
    expect(timeOfDay('day', 1).nightfall).toBe(1)

    expect(timeOfDay('night', 0).nightfall).toBe(1)
    expect(timeOfDay('night', 1 - DAWN_PROGRESS / 2).nightfall).toBeCloseTo(0.5)
    expect(timeOfDay('night', 1).nightfall).toBe(0)
  })

  it('낮과 밤 경계에서 밝기가 튀지 않는다', () => {
    expect(timeOfDay('day', 1).nightfall).toBe(timeOfDay('night', 0).nightfall)
    expect(timeOfDay('night', 1).nightfall).toBe(timeOfDay('day', 0).nightfall)
  })
})
