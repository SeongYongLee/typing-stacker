import { describe, expect, it } from 'vitest'
import { resolveCrafted, resolveItem } from '../src/game/systems/ItemResolver.ts'
import { RECIPES, type Recipe } from '../src/game/data/recipes.ts'
import { HIDDEN_CHANCE } from '../src/game/config.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import { WORDS } from '../src/game/data/words.ts'

describe('resolveItem', () => {
  it('모든 단어를 해석할 수 있다', () => {
    for (const entry of WORDS) {
      const item = resolveItem(entry.word)
      expect(entry.variants).toContain(item)
    }
  })

  it('테이블에 없는 단어는 던진다', () => {
    expect(() => resolveItem('없는단어')).toThrow()
  })

  it('같은 단어는 언제나 같은 기본 변형을 낸다', () => {
    for (const entry of WORDS) {
      expect(resolveItem(entry.word)).toBe(entry.variants[0])
    }
  })

  it('히든 보유 단어도 입력하면 항상 기본 변형만 나온다', () => {
    const withHidden = WORDS.find((entry) => entry.variants.some((v) => v.hidden))
    expect(withHidden).toBeDefined()
    for (let i = 0; i < 600; i += 1) {
      expect(resolveItem(withHidden!.word)).toBe(withHidden!.variants[0])
    }
  })

  it('히든 변형이 없는 단어는 항상 기본 변형만 나온다', () => {
    const noHidden = WORDS.filter((entry) => !entry.variants.some((v) => v.hidden))
    expect(noHidden.length).toBeGreaterThan(0)
    for (const entry of noHidden) {
      for (let i = 0; i < 60; i += 1) {
        expect(resolveItem(entry.word).hidden).toBe(false)
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

describe('resolveCrafted — 합성해도 무엇이 나올지 모른다', () => {
  /** 다른 형태를 가진 레시피 하나. 실제 데이터가 바뀌어도 검사가 흔들리지 않게 찾아 쓴다 */
  function withHidden(): Recipe {
    const found = RECIPES.find((item) => item.hiddenResults.length > 0)
    if (found === undefined) {
      throw new Error('다른 형태를 가진 레시피가 없다')
    }
    return found
  }

  it('다른 형태가 없으면 언제나 기본 결과물이다', () => {
    const plain = RECIPES.find((item) => item.hiddenResults.length === 0)
    expect(plain, '다른 형태가 없는 레시피가 있어야 한다').toBeDefined()
    const rng = createRng(3)
    for (let i = 0; i < 50; i += 1) {
      expect(resolveCrafted(plain!, rng)).toBe(plain!.result)
    }
  })

  it('확률이 0이면 기본 결과물만 나온다', () => {
    const item = withHidden()
    const rng = createRng(5)
    for (let i = 0; i < 50; i += 1) {
      expect(resolveCrafted(item, rng, 0)).toBe(item.result)
    }
  })

  it('확률이 1이면 다른 형태만 나온다', () => {
    const item = withHidden()
    const rng = createRng(5)
    for (let i = 0; i < 50; i += 1) {
      expect(item.hiddenResults).toContain(resolveCrafted(item, rng, 1))
    }
  })

  /** 같은 시드가 같은 판을 만들어야 한다는 것은 이 게임의 전제다 */
  it('같은 시드는 같은 결과를 낸다', () => {
    const item = withHidden()
    const a = createRng(41)
    const b = createRng(41)
    for (let i = 0; i < 30; i += 1) {
      expect(resolveCrafted(item, a).id).toBe(resolveCrafted(item, b).id)
    }
  })

  /** 운으로 만나는 히든과 같은 종류의 사건이므로 확률도 같아야 한다 */
  it('기본 확률은 히든과 같다', () => {
    const item = withHidden()
    let hidden = 0
    const rng = createRng(9)
    const runs = 4000
    for (let i = 0; i < runs; i += 1) {
      if (item.hiddenResults.includes(resolveCrafted(item, rng))) {
        hidden += 1
      }
    }
    expect(hidden / runs).toBeCloseTo(HIDDEN_CHANCE, 1)
  })
})
