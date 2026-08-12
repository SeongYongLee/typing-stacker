import { describe, expect, it } from 'vitest'
import { INGREDIENT_IDS, RECIPES } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import {
  FRESH_FOCUSES_BETWEEN_COMPLETION,
  RECIPE_PICKS_BEFORE_AMBIENT,
  RecipeFlow,
  groupRecipes,
} from '../src/game/systems/RecipeFlow.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import type { WordEntry } from '../src/game/types/game.ts'

function baseId(entry: WordEntry): string {
  return entry.variants.find((variant) => !variant.hidden)?.id ?? ''
}

function focusedRecipe(flow: RecipeFlow, recipes: readonly (typeof RECIPES)[number][]) {
  const words = new Set(flow.prepareFocusWords())
  return recipes.find((recipe) => {
    const recipeWords = new Set(
      recipe.inputs.flatMap((id) => {
        const entry = WORDS.find((candidate) => baseId(candidate) === id)
        return entry === undefined ? [] : [entry.word]
      }),
    )
    return recipeWords.size === words.size && [...recipeWords].every((word) => words.has(word))
  })
}

describe('레시피별 단어 무리', () => {
  const groups = groupRecipes(WORDS, RECIPES)

  it('바로 만들 수 있는 조합과 선행 합성이 필요한 조합을 가른다', () => {
    expect(groups.direct.length).toBeGreaterThan(30)
    expect(groups.chained.length).toBeGreaterThan(0)
  })

  it('모든 단어가 직접 레시피 재료 또는 ambient에 들어간다', () => {
    const directIds = new Set(groups.direct.flatMap((recipe) => recipe.inputs))
    const ambientIds = new Set(groups.ambient.map(baseId))
    for (const entry of WORDS) {
      const id = baseId(entry)
      expect(directIds.has(id) || ambientIds.has(id), `${entry.word} · ${id}`).toBe(true)
    }
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
  it('스폰 전에 집중 레시피를 확정하고 그 재료 단어를 공개한다', () => {
    const recipe = RECIPES.find((entry) => entry.result.id === 'sunflower')
    expect(recipe).toBeDefined()
    const flow = new RecipeFlow(createRng(3), WORDS, [recipe!])
    flow.setPhase('day')

    const focusedWords = flow.prepareFocusWords()
    const focusedIds = focusedWords.map((word) => {
      const entry = WORDS.find((candidate) => candidate.word === word)
      return entry === undefined ? '' : baseId(entry)
    })

    expect(new Set(focusedIds)).toEqual(new Set(recipe!.inputs))
    expect(flow.prepareFocusWords()).toEqual(focusedWords)
  })

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

  it('완성 가능성이 높은 레시피 사이에 새 레시피 둘을 둔다', () => {
    expect(FRESH_FOCUSES_BETWEEN_COMPLETION).toBe(2)
    const resultIds = ['sunflower', 'clover-lucky', 'leaf-maple', 'pizza-box']
    const recipes = resultIds.map((id) => {
      const recipe = RECIPES.find((candidate) => candidate.result.id === id)
      expect(recipe, id).toBeDefined()
      return recipe!
    })
    expect(recipes).toHaveLength(resultIds.length)
    const flow = new RecipeFlow(createRng(23), WORDS, recipes)
    flow.setPhase('day')
    flow.observe(new Map([['sunflower-seed', 1]]))

    const completion = focusedRecipe(flow, recipes)
    expect(completion?.result.id).toBe('sunflower')
    flow.onMerged(completion!)

    const firstFresh = focusedRecipe(flow, recipes)
    expect(firstFresh?.result.id).not.toBe('sunflower')
    flow.onMerged(firstFresh!)

    const secondFresh = focusedRecipe(flow, recipes)
    expect(secondFresh?.result.id).not.toBe('sunflower')
    expect(secondFresh?.id).not.toBe(firstFresh?.id)
    flow.onMerged(secondFresh!)

    const nextCompletion = focusedRecipe(flow, recipes)
    expect(nextCompletion?.result.id).toBe('sunflower')
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

  it('선행 합성 결과의 다른 형태도 같은 연쇄 재료로 본다', () => {
    const passport = RECIPES.find((recipe) => recipe.result.id === 'travel-passport')
    expect(passport).toBeDefined()
    const flow = new RecipeFlow(createRng(8), WORDS, [passport!])
    flow.setPhase('day')
    flow.observe(new Map([['vintage-trunk', 1]]))

    const picked = baseId(flow.pick(WORDS))
    expect(['airplane', 'treasure-map', 'camera']).toContain(picked)
  })

  it('단어 히든 결과물이 있으면 다른 레시피의 남은 재료를 집중한다', () => {
    const racing = RECIPES.find((recipe) => recipe.result.id === 'racing-flag')
    expect(racing).toBeDefined()
    const flow = new RecipeFlow(createRng(8), WORDS, [racing!])
    flow.setPhase('day')
    flow.observe(new Map([['turtle-sea-turtle', 1]]))

    expect(flow.pick(WORDS).word).toBe('토끼')
  })

  it('단어 히든 결과물은 자신을 만든 레시피의 재료로 되돌리지 않는다', () => {
    const turtle = RECIPES.find((recipe) => recipe.result.id === 'turtle-sea-turtle')
    expect(turtle).toBeDefined()
    const flow = new RecipeFlow(createRng(8), WORDS, [turtle!])
    flow.setPhase('day')
    flow.observe(new Map([['turtle-sea-turtle', 1]]))

    expect(flow.pick(WORDS).word).toBe('거북이')
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
