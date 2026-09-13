import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../../src/game/core/GameEngine.ts'
import { INGREDIENT_IDS, RECIPES, type Recipe } from '../../src/game/data/recipes.ts'
import { WORDS } from '../../src/game/data/words.ts'
import { FrameClock } from '../helpers/frameClock.ts'
import { groupRecipes } from '../../src/game/systems/RecipeFlow.ts'
import type { GameEvent } from '../../src/game/types/events.ts'

/**
 * 레시피 흐름이 실제 판에서 세 가지를 함께 만족하는지 잰다.
 *
 * 1. 가까운 드롭 안에 한 레시피의 재료가 모이는가
 * 2. 그것이 실제 물리 합성으로 이어지는가
 * 3. 보조 풀의 단어와 입력 다양성이 사라지지 않는가
 *
 * 첫 번째와 두 번째를 갈라야 한다. 재료 순서가 좋아져도 접촉에 실패하면 스폰 로직의
 * 잘못이 아니고, 반대로 합성 횟수만 보면 우연히 닿은 것과 흐름이 만든 것을 구분할 수 없다.
 * 값은 아트·레시피·물리 밸런스가 바뀔 때 함께 움직이므로 통과 문턱으로 고정하지 않고
 * CLAUDE.md와 볼트의 측정 표에 누적한다.
 */

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const RUNS = Number(ENV?.MEASURE_RUNS ?? 10)
const MAX_RUN_SEC = Number(ENV?.MEASURE_MAX_SEC ?? 180)
const TICK = 0.25
const PAIR_WINDOW = 3
const SCENE_WINDOW = 8

const BASE_ID_BY_WORD = new Map(
  WORDS.map((entry) => [
    entry.word,
    entry.variants.find((variant) => !variant.hidden)?.id ?? '',
  ]),
)
const BASE_IDS = new Set(BASE_ID_BY_WORD.values())
const AMBIENT_WORDS = new Set(groupRecipes(WORDS, RECIPES).ambient.map((entry) => entry.word))
const PAIR_RECIPES = RECIPES.filter(
  (recipe) => recipe.inputs.length === 2 && recipe.inputs.every((id) => BASE_IDS.has(id)),
)
const SCENE_RECIPES = RECIPES.filter(
  (recipe) => recipe.inputs.length >= 3 && recipe.inputs.every((id) => BASE_IDS.has(id)),
)

function containsRecipe(window: readonly string[], recipe: Recipe): boolean {
  const counts = new Map<string, number>()
  for (const id of window) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const needed = new Map<string, number>()
  for (const id of recipe.inputs) {
    needed.set(id, (needed.get(id) ?? 0) + 1)
  }
  for (const [id, count] of needed) {
    if ((counts.get(id) ?? 0) < count) {
      return false
    }
  }
  return true
}

function completesAny(
  history: readonly string[],
  windowSize: number,
  recipes: readonly Recipe[],
): boolean {
  const window = history.slice(-windowSize)
  return recipes.some((recipe) => containsRecipe(window, recipe))
}

interface RunResult {
  readonly seconds: number
  readonly drops: number
  readonly inputDrops: number
  readonly merges: number
  readonly uniqueWords: number
  readonly nonIngredientDrops: number
  readonly ambientDrops: number
  readonly pairWindows: number
  readonly sceneWindows: number
  readonly capped: boolean
}

describe('레시피 중심 스폰 실측', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  const engines = new Set<GameEngine>()
  afterEach(() => { for (const engine of engines) engine.dispose(); engines.clear(); clock.uninstall() })

  async function runOne(seed: number): Promise<RunResult> {
    const engine = await GameEngine.create(seed)
    engines.add(engine)
    let state: GameState | null = null
    let drops = 0
    let inputDrops = 0
    let merges = 0
    let nonIngredientDrops = 0
    let ambientDrops = 0
    let pairWindows = 0
    let sceneWindows = 0
    const words = new Set<string>()
    const itemHistory: string[] = []
    let submittedWord: string | null = null

    engine.onStateChange((next) => {
      state = next
    })
    engine.onEvent((event: GameEvent) => {
      if (event.kind === 'drop') {
        drops += 1
        if (event.source === 'input') {
          inputDrops += 1
          if (submittedWord === null) throw new Error('입력 이벤트에 제출 단어가 없다')
          words.add(submittedWord)
          if (AMBIENT_WORDS.has(submittedWord)) ambientDrops += 1
          const id = BASE_ID_BY_WORD.get(submittedWord)
          if (id !== undefined) {
            itemHistory.push(id)
            if (!INGREDIENT_IDS.has(id)) {
              nonIngredientDrops += 1
            }
            if (completesAny(itemHistory, PAIR_WINDOW, PAIR_RECIPES)) {
              pairWindows += 1
            }
            if (completesAny(itemHistory, SCENE_WINDOW, SCENE_RECIPES)) {
              sceneWindows += 1
            }
          }
        }
      }
      if (event.kind === 'merge') {
        merges += 1
      }
    })
    engine.startRun(false)

    let seconds = 0
    for (; seconds < MAX_RUN_SEC; seconds += TICK) {
      await clock.advance(TICK)
      const now = state as GameState | null
      if (now === null) {
        continue
      }
      if (now.phase === 'over') {
        break
      }
      if (now.activeWhiteboard[0]) {
        engine.submit(now.activeWhiteboard[0])
        continue
      }
      const falling = now.words.find((word) => word.state === 'active')
      if (falling === undefined) {
        continue
      }

      submittedWord = falling.word
      engine.submit(falling.word)
      submittedWord = null
    }

    engines.delete(engine)
    engine.dispose()
    return {
      seconds,
      drops,
      inputDrops,
      merges,
      uniqueWords: words.size,
      nonIngredientDrops,
      ambientDrops,
      pairWindows,
      sceneWindows,
      capped: seconds >= MAX_RUN_SEC,
    }
  }

  it('지정한 판 수의 그룹 노출·합성·다양성을 출력한다', { timeout: 300_000 }, async () => {
    const runs: RunResult[] = []
    for (let index = 0; index < RUNS; index += 1) {
      runs.push(await runOne(20260810 + index * 7919))
    }

    const mean = (pick: (run: RunResult) => number): number =>
      runs.reduce((sum, run) => sum + pick(run), 0) / runs.length
    const share = (pick: (run: RunResult) => boolean): number =>
      runs.filter(pick).length / runs.length
    // An idle bot is a failed measurement, not a NaN percentage.
    expect(mean((run) => run.inputDrops), '봇이 단어를 못 치고 있다').toBeGreaterThan(5)
    const rows: [string, string][] = [
      ['판 길이', `${mean((run) => run.seconds).toFixed(1)}초`],
      [
        '전체 드롭 / 입력',
        `${mean((run) => run.drops).toFixed(1)} / ${mean((run) => run.inputDrops).toFixed(1)}`,
      ],
      ['보조 풀 입력', mean((run) => run.ambientDrops).toFixed(1)],
      ['고유 단어', mean((run) => run.uniqueWords).toFixed(1)],
      [
        '비레시피 물건',
        `판당 ${mean((run) => run.nonIngredientDrops).toFixed(2)}개 · 입력 드롭의 ${Math.round((mean((run) => run.nonIngredientDrops) / mean((run) => run.inputDrops)) * 100)}%`,
      ],
      ['3드롭 안의 2재료 조합', `판당 ${mean((run) => run.pairWindows).toFixed(2)}회`],
      ['8드롭 안의 3+재료 조합', `판당 ${mean((run) => run.sceneWindows).toFixed(2)}회`],
      [
        '실제 합성',
        `판당 ${mean((run) => run.merges).toFixed(2)}회 · 못 한 판 ${Math.round(share((run) => run.merges === 0) * 100)}%`,
      ],
      [
        '합성 밀도',
        `100드롭당 ${((mean((run) => run.merges) / mean((run) => run.drops)) * 100).toFixed(2)}회 · 분당 ${((mean((run) => run.merges) / mean((run) => run.seconds)) * 60).toFixed(2)}회`,
      ],
      [`${MAX_RUN_SEC}초 상한 도달`, `${Math.round(share((run) => run.capped) * 100)}%`],
    ]

    console.log(
      `\n[레시피 흐름 실측] 봇 ${RUNS}판 · 레시피 ${RECIPES.length}개 · 단어 ${WORDS.length}개\n` +
      rows.map(([key, value]) => `  | ${key} | ${value} |`).join('\n'),
    )

    expect(mean((run) => run.inputDrops), '봇이 단어를 못 치고 있다').toBeGreaterThan(5)
    expect(mean((run) => run.uniqueWords), '레시피 집중 뒤 단어 다양성이 사라졌다').toBeGreaterThan(3)
    // RecipeFlow includes chain-only ingredients in its ambient pool.
    expect(mean((run) => run.ambientDrops), '보조 풀의 단어가 전혀 나오지 않는다').toBeGreaterThan(0)
  })
})
