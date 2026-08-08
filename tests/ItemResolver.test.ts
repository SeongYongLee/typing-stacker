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
    const withHidden = WORDS.find((entry) => entry.variants.some((v) => v.hidden))
    expect(withHidden).toBeDefined()
    const results = Array.from({ length: 600 }, () =>
      resolveItem(withHidden!.word, rng),
    )
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

/**
 * 히든이 얼마나 자주 보이는지.
 *
 * HIDDEN_CHANCE만 보면 알 수 없다. 실제 빈도는 히든을 가진 단어의 비율이 함께
 * 정한다. 물건을 20종에서 57종으로 늘렸을 때 단어만 늘고 히든은 그대로여서
 * 판당 기대 히든이 1.5개에서 0.41개로 떨어졌고, 대부분의 판에서 하나도 안 나왔다.
 * 그 일이 다시 나면 여기서 잡힌다.
 */
describe('히든 체감 빈도', () => {
  /*
   * 한 판에 몇 번 떨구는가. 20으로 어림잡아 두었던 값을 **실측으로 바꿨다** —
   * 중앙 조준 봇으로 60판을 목숨 3개 소진까지 돌려 판당 34.9초 / 드롭 17.9개
   * / 안착 13.6개가 나왔다(2026-08-08).
   *
   * 드롭과 안착을 헷갈리지 말 것. `CLAUDE.md`에 적힌 "15개"는 **쌓인 개수**이고
   * 이 값이 세는 것은 **떨군 횟수**다. 목숨 3개를 잃는 동안 이탈한 것까지 세므로
   * 떨군 쪽이 늘 많다. 15로 잡으면 기준이 실제보다 빡빡해진다.
   */
  const DROPS_PER_RUN = 18

  function expectedPerRun(): number {
    const rng = createRng(20260808)
    let hidden = 0
    const samples = 20000
    for (let i = 0; i < samples; i += 1) {
      if (resolveItem(rng.pick(WORDS).word, rng).hidden) {
        hidden += 1
      }
    }
    return (hidden / samples) * DROPS_PER_RUN
  }

  it('한 판에 히든을 한 번은 만난다', () => {
    /*
     * 아래로 떨어지면 히든이 있다는 사실 자체를 모르게 된다.
     *
     * 이 계산은 단어를 고르게 뽑는다고 보므로 실제보다 조금 후하다 — 같은 조건에서
     * 엔진을 실제로 돌리면 판당 0.75개였고 여기서는 0.86이 나온다. 값이 하한에
     * 가까워지면 이미 실기에서는 절반의 판이 히든 없이 끝나고 있다는 뜻이다.
     */
    expect(expectedPerRun()).toBeGreaterThan(0.7)
  })

  it('그렇다고 흔하지는 않다', () => {
    // 판마다 여럿 나오면 "가끔 나오는 다른 형태"라는 의미가 사라진다
    expect(expectedPerRun()).toBeLessThan(2.5)
  })
})
