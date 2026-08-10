import { describe, expect, it } from 'vitest'
import { INGREDIENT_IDS, RECIPES } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import {
  RECIPE_PICKS_BEFORE_AMBIENT,
  RecipeFlow,
  groupRecipes,
} from '../src/game/systems/RecipeFlow.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import type { WordEntry } from '../src/game/types/game.ts'

function baseId(entry: WordEntry): string {
  return entry.variants.find((variant) => !variant.hidden)?.id ?? ''
}

describe('레시피별 단어 무리', () => {
  const groups = groupRecipes(WORDS, RECIPES)

  it('바로 만들 수 있는 34개와 선행 합성이 필요한 10개를 가른다', () => {
    expect(groups.direct).toHaveLength(34)
    expect(groups.chained).toHaveLength(10)
  })

  it('모든 단어가 직접 레시피 재료 또는 ambient에 들어간다', () => {
    const directIds = new Set(groups.direct.flatMap((recipe) => recipe.inputs))
    const ambientIds = new Set(groups.ambient.map(baseId))
    for (const entry of WORDS) {
      const id = baseId(entry)
      expect(directIds.has(id) || ambientIds.has(id), `${entry.word} · ${id}`).toBe(true)
    }
    expect(directIds.size + ambientIds.size).toBe(WORDS.length)
  })

  it('레시피에 전혀 쓰이지 않는 물건도 모두 ambient에 남는다', () => {
    const ambientIds = new Set(groups.ambient.map(baseId))
    for (const entry of WORDS) {
      const id = baseId(entry)
      if (!INGREDIENT_IDS.has(id)) {
        expect(ambientIds.has(id), `${entry.word} · ${id}`).toBe(true)
      }
    }
  })
})

describe('레시피 흐름', () => {
  it('같은 재료 둘도 사이에 다른 단어를 끼운다', () => {
    const cloverRecipe = RECIPES.find((recipe) => recipe.result.id === 'clover-lucky')
    expect(cloverRecipe).toBeDefined()
    const flow = new RecipeFlow(createRng(1), WORDS, [cloverRecipe!])

    const first = flow.pick(WORDS)
    expect(first.word).toBe('클로버')

    flow.observe(new Map([['clover', 1]]))
    const between = flow.pick(WORDS)
    expect(between.word).not.toBe('클로버')

    const second = flow.pick(WORDS)
    expect(second.word).toBe('클로버')
  })

  it('낮에는 재료 둘보다 긴 연속 뒤에 ambient가 반드시 나온다', () => {
    const groups = groupRecipes(WORDS, RECIPES)
    const ambientWords = new Set(groups.ambient.map((entry) => entry.word))
    const flow = new RecipeFlow(createRng(17), WORDS, RECIPES)
    flow.setPhase('day')

    let consecutiveRecipe = 0
    let longest = 0
    for (let index = 0; index < 120; index += 1) {
      const picked = flow.pick(WORDS)
      if (ambientWords.has(picked.word)) {
        consecutiveRecipe = 0
      } else {
        consecutiveRecipe += 1
        longest = Math.max(longest, consecutiveRecipe)
      }
    }

    expect(longest).toBeLessThanOrEqual(RECIPE_PICKS_BEFORE_AMBIENT.day)
  })

  it('선행 합성 결과물이 있으면 연쇄 레시피의 나머지 재료를 집중한다', () => {
    const passport = RECIPES.find((recipe) => recipe.result.id === 'travel-passport')
    expect(passport).toBeDefined()
    const flow = new RecipeFlow(createRng(8), WORDS, [passport!])
    flow.setPhase('day')
    flow.observe(new Map([['travel-suitcase', 1]]))

    const picked = baseId(flow.pick(WORDS))
    expect(['airplane', 'treasure-map', 'camera']).toContain(picked)
  })

  it('같은 시드와 관측값이면 같은 순서를 낸다', () => {
    const sequence = (seed: number): string[] => {
      const flow = new RecipeFlow(createRng(seed), WORDS, RECIPES)
      flow.setPhase('day')
      const result: string[] = []
      for (let index = 0; index < 80; index += 1) {
        result.push(flow.pick(WORDS).word)
      }
      return result
    }

    expect(sequence(991)).toEqual(sequence(991))
    expect(sequence(991)).not.toEqual(sequence(992))
  })
})
