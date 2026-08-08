import { describe, expect, it } from 'vitest'
import { HIDDEN_CHANCE, OPENING_HIDDEN_CHANCE } from '../src/game/config.ts'
import { resolveItem } from '../src/game/systems/ItemResolver.ts'
import { PAIR_INGREDIENT_IDS, RECIPES } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import { OPENING_WORD_COUNT, openingEntries } from '../src/game/systems/Opening.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import { WordSpawner } from '../src/game/systems/WordSpawner.ts'
import { difficultyAt } from '../src/game/systems/Difficulty.ts'
import type { WordEntry } from '../src/game/types/game.ts'

/** 그 단어를 쳤을 때 나올 수 있는 기본형(히든 아닌) 변형 id들 */
function baseIdsOf(entry: WordEntry): string[] {
  return entry.variants.filter((item) => !item.hidden).map((item) => item.id)
}

describe('같은 것 둘짜리 재료', () => {
  /** 여기서 뽑는 것이 곧 앞머리 밭이라, 비면 좁히기 자체가 없던 일이 된다 */
  it('레시피에서 실제로 뽑힌다', () => {
    expect(PAIR_INGREDIENT_IDS.length).toBeGreaterThanOrEqual(OPENING_WORD_COUNT)
  })

  it('모두 같은 물건 둘짜리 레시피의 재료다', () => {
    for (const id of PAIR_INGREDIENT_IDS) {
      const recipe = RECIPES.find(
        (item) => item.inputs.length === 2 && item.inputs[0] === id && item.inputs[1] === id,
      )
      expect(recipe, id).toBeDefined()
    }
  })
})

describe('판 앞머리 밭', () => {
  it('정해진 개수만큼 뽑는다', () => {
    expect(openingEntries(createRng(1), WORDS)).toHaveLength(OPENING_WORD_COUNT)
    expect(openingEntries(createRng(1), WORDS, 2)).toHaveLength(2)
  })

  /** 겹치면 실제 밭이 좁아져 화면에 뜨는 단어가 상한보다 적어진다 */
  it('같은 단어를 두 번 뽑지 않는다', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const picked = openingEntries(createRng(seed), WORDS)
      const words = picked.map((entry) => entry.word)
      expect(new Set(words).size, `시드 ${seed}`).toBe(words.length)
    }
  })

  /**
   * 재료가 아닌 단어가 하나라도 섞이면 그 물건이 합성에 쓸모없이 받침대를 차지해,
   * 좁혀서 얻은 것을 그만큼 되돌린다.
   */
  it('전부 쉽게 합쳐지는 재료다', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      for (const entry of openingEntries(createRng(seed), WORDS)) {
        const usable = baseIdsOf(entry).some((id) => PAIR_INGREDIENT_IDS.includes(id))
        expect(usable, `시드 ${seed} · ${entry.word}`).toBe(true)
      }
    }
  })

  /**
   * 끈적한 물건은 닿은 것을 그 자리에 묶는다. 앞머리는 쌓기가 어떤 것인지 배우는
   * 구간이고 밭이 좁아 같은 물건이 되풀이되므로, 하나만 섞여도 판 전체가 굳어
   * "이 게임은 잘 안 무너진다"는 잘못된 감각을 먼저 배운다.
   *
   * **히든까지 본다.** 같은 것 둘의 결과물이 곧 그 단어의 히든이라, 히든만 끈적해도
   * 첫 합성의 보상이 붙어버리는 물건이 된다 — 소시지(→ 문어소시지)가 그렇다.
   */
  it('끈적한 물건은 기본형도 히든도 섞이지 않는다', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      for (const entry of openingEntries(createRng(seed), WORDS)) {
        for (const variant of entry.variants) {
          expect(variant.sticky, `시드 ${seed} · ${entry.word} · ${variant.label}`).toBe(false)
        }
      }
    }
  })

  it('끈적한 것을 빼도 밭을 채울 만큼 남는다', () => {
    const all = openingEntries(createRng(1), WORDS, 99)
    expect(all.length).toBeGreaterThan(OPENING_WORD_COUNT)
    expect(all.map((entry) => entry.word)).not.toContain('달팽이')
    expect(all.map((entry) => entry.word)).not.toContain('소시지')
  })

  /** 같은 시드면 같은 판이어야 한다. 앞머리 밭도 그 약속 안에 있다 */
  it('같은 시드는 같은 밭을 준다', () => {
    const first = openingEntries(createRng(7), WORDS).map((entry) => entry.word)
    const second = openingEntries(createRng(7), WORDS).map((entry) => entry.word)
    expect(second).toEqual(first)
  })

  /** 늘 같은 셋이면 두 번째 판부터 앞머리가 외운 것을 다시 치는 시간이 된다 */
  it('시드가 다르면 밭도 갈린다', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed < 40; seed += 1) {
      seen.add(
        openingEntries(createRng(seed), WORDS)
          .map((entry) => entry.word)
          .sort()
          .join(','),
      )
    }
    expect(seen.size).toBeGreaterThan(3)
  })

  /**
   * 좁힌 밭이 초반 동시 낙하 상한보다 작으면 화면이 비어 **칠 것이 없는 순간**이
   * 생긴다. 타자게임에서 손이 멈추는 것은 가장 큰 대가다.
   */
  it('초반 동시 낙하 상한만큼은 내보낸다', () => {
    expect(OPENING_WORD_COUNT).toBeGreaterThanOrEqual(difficultyAt(0).maxConcurrent)
  })

  it('후보가 개수보다 적으면 있는 것을 다 쓴다', () => {
    const many = openingEntries(createRng(1), WORDS, 999)
    expect(many.length).toBeGreaterThan(0)
    expect(many.length).toBeLessThanOrEqual(PAIR_INGREDIENT_IDS.length)
  })
})

describe('스포너가 밭을 좁힌다', () => {
  function spawnedWords(pool: readonly WordEntry[] | null, seconds = 60): Set<string> {
    const spawner = new WordSpawner(createRng(3), WORDS)
    if (pool !== null) {
      spawner.restrict(pool)
    }
    const seen = new Set<string>()
    for (let t = 0; t < seconds; t += 1 / 60) {
      spawner.update(1 / 60, difficultyAt(0))
      for (const word of spawner.words) {
        seen.add(word.word)
      }
      // 나오는 대로 치워 계속 새로 뽑게 한다
      const first = spawner.words[0]
      if (first !== undefined) {
        spawner.remove(first.id)
      }
    }
    return seen
  }

  it('좁히면 그 단어들만 나온다', () => {
    const pool = openingEntries(createRng(11), WORDS)
    const allowed = new Set(pool.map((entry) => entry.word))
    for (const word of spawnedWords(pool)) {
      expect(allowed.has(word), word).toBe(true)
    }
  })

  it('풀면 다시 넓어진다', () => {
    const spawner = new WordSpawner(createRng(3), WORDS)
    spawner.restrict(openingEntries(createRng(11), WORDS))
    expect(spawner.restricted).toBe(true)
    spawner.release()
    expect(spawner.restricted).toBe(false)
    const seen = new Set<string>()
    for (let t = 0; t < 60; t += 1 / 60) {
      spawner.update(1 / 60, difficultyAt(0))
      for (const word of spawner.words) {
        seen.add(word.word)
      }
      const first = spawner.words[0]
      if (first !== undefined) {
        spawner.remove(first.id)
      }
    }
    expect(seen.size).toBeGreaterThan(OPENING_WORD_COUNT)
  })

  /** 밭이 비면 단어가 하나도 안 나와 판이 멈춘다 */
  it('빈 밭을 주면 좁히지 않는다', () => {
    const spawner = new WordSpawner(createRng(3), WORDS)
    spawner.restrict([])
    expect(spawner.restricted).toBe(false)
  })
})

describe('앞머리 히든 밀도', () => {
  /**
   * 앞머리 밭은 히든 보유 단어만으로 이루어져 있다 — 같은 것 둘의 결과물이 곧 그 단어의
   * 히든이니 구조적으로 그렇다. 그래서 같은 확률을 쓰면 밀도가 일곱 배로 뛴다.
   * 실제로 앞머리에서만 판당 2.42개가 나왔다(전체 평소치가 0.75개다).
   */
  it('앞머리 밭은 전부 히든을 가진 단어다', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      for (const entry of openingEntries(createRng(seed), WORDS)) {
        const hasHidden = entry.variants.some((item) => item.hidden)
        expect(hasHidden, `${entry.word}`).toBe(true)
      }
    }
  })

  it('그래서 앞머리 확률이 평소보다 낮다', () => {
    expect(OPENING_HIDDEN_CHANCE).toBeLessThan(HIDDEN_CHANCE)
  })

  /** 0으로 두면 앞머리에서 "무엇이 나올까"가 통째로 사라진다 */
  it('그래도 0은 아니다', () => {
    expect(OPENING_HIDDEN_CHANCE).toBeGreaterThan(0)
  })

  it('resolveItem이 넘겨준 확률을 쓴다', () => {
    const entry = openingEntries(createRng(5), WORDS)[0]
    expect(entry).toBeDefined()
    const count = (chance: number): number => {
      const rng = createRng(99)
      let hidden = 0
      for (let i = 0; i < 4000; i += 1) {
        if (resolveItem(entry?.word ?? '', rng, chance).hidden) {
          hidden += 1
        }
      }
      return hidden / 4000
    }
    expect(count(0)).toBe(0)
    expect(count(OPENING_HIDDEN_CHANCE)).toBeCloseTo(OPENING_HIDDEN_CHANCE, 1)
    expect(count(HIDDEN_CHANCE)).toBeGreaterThan(count(OPENING_HIDDEN_CHANCE))
  })

  /** 기본값을 안 넘기면 평소 확률이어야 한다 — 대전이 그 경로로 돈다 */
  it('확률을 안 넘기면 평소 확률이다', () => {
    const rng = createRng(42)
    let hidden = 0
    for (let i = 0; i < 4000; i += 1) {
      if (resolveItem('클로버', rng).hidden) {
        hidden += 1
      }
    }
    expect(hidden / 4000).toBeCloseTo(HIDDEN_CHANCE, 1)
  })
})
