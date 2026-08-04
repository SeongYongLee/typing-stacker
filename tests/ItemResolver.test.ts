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

  it('히든 변형이 없는 단어는 항상 기본 변형만 나온다', () => {
    const noHidden = WORDS.filter((entry) => !entry.variants.some((v) => v.hidden))
    expect(noHidden.length).toBeGreaterThan(0)
    const rng = createRng(31)
    for (const entry of noHidden) {
      for (let i = 0; i < 60; i += 1) {
        expect(resolveItem(entry.word, rng).hidden).toBe(false)
      }
    }
  })

  it('히든은 기본 변형과 도형이 다르다 — 쌓기 난이도가 실제로 바뀐다', () => {
    let checked = 0
    for (const entry of WORDS) {
      const base = entry.variants[0]
      expect(base).toBeDefined()
      for (const item of entry.variants.filter((v) => v.hidden)) {
        expect(
          JSON.stringify(item.shape),
          `${item.id}의 도형이 기본과 같다`,
        ).not.toBe(JSON.stringify(base!.shape))
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('기본 변형은 hidden이 아니고 히든은 점수 보너스를 가진다', () => {
    for (const entry of WORDS) {
      expect(entry.variants[0]?.hidden).toBe(false)
      for (const item of entry.variants.filter((v) => v.hidden)) {
        expect(item.scoreBonus).toBeGreaterThan(0)
      }
    }
  })

  it('단어 풀이 동시 낙하 상한보다 넉넉하다 — 중복 없이 스폰할 수 있어야 한다', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(12)
  })
})
