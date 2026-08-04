import { describe, expect, it } from 'vitest'
import { Aimer } from '../src/game/systems/Aimer.ts'

describe('Aimer', () => {
  it('시작 위치는 왼쪽 끝이다', () => {
    const aimer = new Aimer(1.5)
    expect(aimer.normalized).toBeCloseTo(-1)
    expect(aimer.worldX).toBeCloseTo(-1.5)
  })

  it('반주기 뒤에 오른쪽 끝에 닿는다', () => {
    const aimer = new Aimer(1.5)
    aimer.update(1, 1)
    expect(aimer.normalized).toBeCloseTo(1)
    expect(aimer.worldX).toBeCloseTo(1.5)
  })

  it('한 주기 뒤에 다시 왼쪽 끝으로 돌아온다', () => {
    const aimer = new Aimer(1.5)
    aimer.update(2, 1)
    expect(aimer.normalized).toBeCloseTo(-1)
  })

  it('항상 -1 이상 1 이하다', () => {
    const aimer = new Aimer(2)
    for (let i = 0; i < 1000; i += 1) {
      aimer.update(1 / 60, 0.73)
      expect(aimer.normalized).toBeGreaterThanOrEqual(-1)
      expect(aimer.normalized).toBeLessThanOrEqual(1)
    }
  })

  it('등속이다 — 같은 dt면 같은 거리를 움직인다', () => {
    const aimer = new Aimer(1, 0)
    const step = 0.1
    aimer.update(step, 1)
    const first = aimer.normalized - -1
    aimer.update(step, 1)
    const second = aimer.normalized - (first - 1)
    expect(second).toBeCloseTo(first)
  })
})
