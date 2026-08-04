import { describe, expect, it } from 'vitest'
import { resolveItem } from '../src/game/systems/ItemResolver.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import { WORDS } from '../src/game/data/words.ts'

describe('resolveItem', () => {
  it('모든 단어를 해석할 수 있다', () => {
    const rng = createRng(1)
    for (const entry of WORDS) {
      const item = resolveItem(entry.word, rng)
      expect(entry.variants).toContain(item)
    }
  })

  it('테이블에 없는 단어는 던진다', () => {
    expect(() => resolveItem('없는단어', createRng(1))).toThrow()
  })

  it('같은 시드는 같은 결과를 낸다', () => {
    const a = createRng(777)
    const b = createRng(777)
    for (const entry of WORDS) {
      expect(resolveItem(entry.word, a).id).toBe(resolveItem(entry.word, b).id)
    }
  })

  it('히든이 나오기도 하고 안 나오기도 한다', () => {
    const rng = createRng(2024)
    const results = Array.from({ length: 600 }, () => resolveItem('사과', rng))
    const hiddenCount = results.filter((item) => item.hidden).length
    expect(hiddenCount).toBeGreaterThan(0)
    expect(hiddenCount).toBeLessThan(results.length)
  })

  it('히든은 기본 변형과 도형이 다르다 — 쌓기 난이도가 실제로 바뀐다', () => {
    for (const entry of WORDS) {
      const base = entry.variants[0]
      expect(base).toBeDefined()
      const hidden = entry.variants.filter((item) => item.hidden)
      expect(hidden.length).toBeGreaterThan(0)
      for (const item of hidden) {
        expect(JSON.stringify(item.shape)).not.toBe(JSON.stringify(base!.shape))
      }
    }
  })

  it('기본 변형은 hidden이 아니고 히든은 점수 보너스를 가진다', () => {
    for (const entry of WORDS) {
      expect(entry.variants[0]?.hidden).toBe(false)
      for (const item of entry.variants.filter((v) => v.hidden)) {
        expect(item.scoreBonus).toBeGreaterThan(0)
      }
    }
  })
})
