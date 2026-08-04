import { describe, expect, it } from 'vitest'
import { createRng } from '../src/game/systems/Rng.ts'

describe('createRng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('0 이상 1 미만을 낸다', () => {
    const rng = createRng(99)
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('int는 범위 안에 머문다', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i += 1) {
      const value = rng.int(5)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(5)
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('pick은 빈 배열에서 던진다', () => {
    const rng = createRng(1)
    expect(() => rng.pick([])).toThrow()
  })
})
