import type { Recipe } from '../data/recipes.ts'
import type { WordEntry } from '../types/game.ts'
import type { Phase } from './DayNight.ts'
import type { Rng } from './Rng.ts'

/** 낮에는 재료 둘 뒤, 밤에는 셋 뒤에 다른 무리의 단어를 섞는다. */
const RECIPE_PICKS_BEFORE_AMBIENT: Readonly<Record<Phase, number>> = {
  firstNight: 2,
  day: 2,
  night: 3,
}

/** 히든이나 이탈로 재료가 사라져도 영원히 같은 조합에 갇히지 않게 하는 여유다. */
const EXTRA_RECIPE_OFFERS = 2

/** 완성 가능성이 높은 레시피 사이에 새 레시피를 이만큼 둔다. */
const FRESH_FOCUSES_BETWEEN_COMPLETION = 2

interface RecipeGroups {
  /** 단어만 쳐서 바로 만들 수 있는 조합 */
  readonly direct: readonly Recipe[]
  /** 다른 합성 결과물이 먼저 필요한 조합 */
  readonly chained: readonly Recipe[]
  /** 직접 조합의 재료가 아닌 단어. 일반 물건과 연쇄 조합 전용 재료가 함께 들어간다. */
  readonly ambient: readonly WordEntry[]
  readonly baseEntryById: ReadonlyMap<string, WordEntry>
}

/**
 * 단어를 레시피 무리와 그 밖의 무리로 나눈다.
 *
 * `ambient`를 "어느 레시피에도 없는 것"으로만 만들지 않는다. 연쇄 레시피의 비행기나
 * 장난감 자동차처럼, 선행 합성 결과물이 없으면 당장 조합을 완성할 수 없는 재료도
 * 여기에 있어야 모든 단어가 평소 흐름에서 계속 나올 수 있다.
 */
function groupRecipes(
  entries: readonly WordEntry[],
  recipes: readonly Recipe[],
): RecipeGroups {
  const baseEntryById = new Map<string, WordEntry>()
  for (const entry of entries) {
    const base = entry.variants.find((variant) => !variant.hidden)
    if (base !== undefined) {
      baseEntryById.set(base.id, entry)
    }
  }

  const direct: Recipe[] = []
  const chained: Recipe[] = []
  for (const recipe of recipes) {
    if (recipe.inputs.every((id) => baseEntryById.has(id))) {
      direct.push(recipe)
    } else {
      chained.push(recipe)
    }
  }

  const directInputIds = new Set(direct.flatMap((recipe) => recipe.inputs))
  const ambient = entries.filter((entry) => {
    const base = entry.variants.find((variant) => !variant.hidden)
    return base === undefined || !directInputIds.has(base.id)
  })

  return { direct, chained, ambient, baseEntryById }
}

/**
 * 전체 랜덤 대신 한 레시피의 부족한 재료를 가까운 시점에 내보낸다.
 *
 * 물리 세계를 직접 알지 않고 `variant id → 현재 개수`만 받는다. 개수에는 받침대,
 * 낙하 중인 물건, 화면의 단어를 호출부가 합쳐 넣는다. 같은 시드와 같은 개수 흐름이면
 * 같은 단어를 고르므로 서버 검증과 측정에서도 그대로 쓸 수 있다.
 */
class RecipeFlow {
  private readonly rng: Rng
  private readonly groups: RecipeGroups
  private phase: Phase = 'firstNight'
  private available: ReadonlyMap<string, number> = EMPTY_COUNTS
  private focus: Recipe | null = null
  private focusOffers = 0
  private recipePicksSinceAmbient = 0
  private lastWord: string | null = null
  private directBag: Recipe[] = []
  private openingEasyBag: Recipe[] = []
  private openingVariedBag: Recipe[] = []
  private openingFocusCount = 0
  private ambientBag: WordEntry[] = []
  private freshFocusesRemaining = 0
  private recentFocuses: Recipe[] = []
  private readonly attemptedChains = new Set<string>()

  constructor(rng: Rng, entries: readonly WordEntry[], recipes: readonly Recipe[]) {
    this.rng = rng
    this.groups = groupRecipes(entries, recipes)
  }

  setPhase(phase: Phase): void {
    if (phase === this.phase) {
      return
    }
    this.phase = phase
    this.focus = null
    this.focusOffers = 0
    this.recipePicksSinceAmbient = 0
  }

  /** 지금 판에 존재하거나 곧 떨어질 재료 개수다. 호출부가 매 프레임 갱신한다. */
  observe(available: ReadonlyMap<string, number>): void {
    this.available = available
  }

  /**
   * 다음 스폰보다 먼저 집중 레시피를 확정하고, 그 레시피에서 단어로 낼 수 있는 재료를 돌려준다.
   *
   * 화이트보드는 이 목록을 후보에서 뺀 뒤 자기 단어를 고른다. `pick()` 안에서 처음
   * 레시피를 정하면 보드가 먼저 뽑혀 같은 재료를 회수 대상으로 잡을 수 있으므로,
   * 선택 순서를 공개 계약으로 둔다.
   */
  prepareFocusWords(): readonly string[] {
    const focus = this.ensureFocus()
    if (focus === null) {
      return []
    }
    const words = new Set<string>()
    for (const id of focus.inputs) {
      const entry = this.groups.baseEntryById.get(id)
      if (entry !== undefined) {
        words.add(entry.word)
      }
    }
    return [...words]
  }

  /** WordSpawner가 실제로 새 단어를 만들 때 한 번 부른다. */
  pick(candidates: readonly WordEntry[]): WordEntry {
    if (candidates.length === 0) {
      throw new Error('빈 단어 목록에서 뽑을 수 없다')
    }

    const focus = this.ensureFocus()
    const quota = RECIPE_PICKS_BEFORE_AMBIENT[this.phase]
    if (this.recipePicksSinceAmbient >= quota) {
      const ambient = this.pickAmbient(candidates)
      if (ambient !== null) {
        return this.rememberAmbient(ambient)
      }
    }

    if (focus !== null) {
      const missing = this.missingEntries(focus)
      const allowed = new Set(candidates.map((entry) => entry.word))
      const possible = missing.filter((entry) => allowed.has(entry.word))
      if (possible.length === 0) {
        const ambient = this.pickAmbient(candidates)
        if (ambient !== null) {
          return this.rememberAmbient(ambient)
        }
      } else {
        const chosen = this.rng.pick(possible)
        /* 같은 것 둘 레시피도 `클로버 → 일반 물건 → 클로버`로 보이게 한다. */
        if (chosen.word === this.lastWord) {
          const ambient = this.pickAmbient(candidates)
          if (ambient !== null) {
            return this.rememberAmbient(ambient)
          }
        }
        return this.rememberRecipe(chosen)
      }
    }

    const fallback = this.rng.pick(candidates)
    this.lastWord = fallback.word
    return fallback
  }

  /** 합성이 성공했으면 같은 조합을 더 내보내지 않고 다음 무리로 넘어간다. */
  onMerged(recipe: Recipe): void {
    if (this.focus?.id === recipe.id) {
      this.focus = null
      this.focusOffers = 0
    }
  }

  private ensureFocus(): Recipe | null {
    for (let turn = 0; turn < 3; turn += 1) {
      const focus = this.focus ?? this.nextFocus()
      if (focus === null) {
        return null
      }
      this.focus = focus

      const missing = this.missingEntries(focus)
      const limit = this.spawnableInputCount(focus) + EXTRA_RECIPE_OFFERS
      if (missing.length > 0 && this.focusOffers < limit) {
        return focus
      }
      this.focus = null
      this.focusOffers = 0
    }
    return null
  }

  private nextFocus(): Recipe | null {
    if (this.phase === 'firstNight') {
      return this.takeOpeningRecipe()
    }

    const completion = this.completionCandidates()
    if (this.freshFocusesRemaining === 0) {
      const picked = this.pickCompletionRecipe(completion)
      if (picked !== null) {
        this.freshFocusesRemaining = FRESH_FOCUSES_BETWEEN_COMPLETION
        return this.rememberFocus(picked)
      }
    }

    const fresh = this.takeDirectRecipe(new Set(completion.map((recipe) => recipe.id)))
    if (fresh !== null) {
      this.freshFocusesRemaining = Math.max(this.freshFocusesRemaining - 1, 0)
      return this.rememberFocus(fresh)
    }

    const fallback = this.pickCompletionRecipe(completion)
    return fallback === null ? null : this.rememberFocus(fallback)
  }

  private takeOpeningRecipe(): Recipe | null {
    const pairs = this.groups.direct.filter((recipe) => recipe.inputs.length === 2)
    const easy = pairs.filter((recipe) => recipe.inputs[0] === recipe.inputs[1])
    const varied = pairs.filter((recipe) => recipe.inputs[0] !== recipe.inputs[1])
    const useEasy = this.openingFocusCount % 2 === 0
    this.openingFocusCount += 1

    if (useEasy && easy.length > 0) {
      if (this.openingEasyBag.length === 0) {
        this.openingEasyBag = shuffled(easy, this.rng)
      }
      return this.openingEasyBag.pop() ?? null
    }
    if (varied.length > 0) {
      if (this.openingVariedBag.length === 0) {
        this.openingVariedBag = shuffled(varied, this.rng)
      }
      return this.openingVariedBag.pop() ?? null
    }
    return this.takeDirectRecipe()
  }

  private takeDirectRecipe(blockedIds: ReadonlySet<string> = EMPTY_IDS): Recipe | null {
    const recentIds = new Set(this.recentFocuses.map((recipe) => recipe.id))
    const recentInputs = new Set(this.recentFocuses.flatMap((recipe) => recipe.inputs))
    const eligible = (recipe: Recipe): boolean =>
      !blockedIds.has(recipe.id) &&
      !recentIds.has(recipe.id) &&
      this.missingEntries(recipe).length > 0

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (this.directBag.length === 0 || attempt > 0) {
        this.directBag = shuffled(this.groups.direct, this.rng)
      }
      const preferredIndex = this.directBag.findLastIndex(
        (recipe) => eligible(recipe) && recipe.inputs.every((id) => !recentInputs.has(id)),
      )
      const relaxedIndex = this.directBag.findLastIndex(eligible)
      const index = preferredIndex >= 0 ? preferredIndex : relaxedIndex
      if (index >= 0) {
        return this.directBag.splice(index, 1)[0] ?? null
      }
    }
    return null
  }

  /** 이미 있는 재료를 가장 많이 활용해 완성에 가까운 레시피들이다. */
  private completionCandidates(): Recipe[] {
    const chained = this.groups.chained.filter(
      (recipe) => !this.attemptedChains.has(recipe.id) && this.canSupplyChain(recipe),
    )
    return [...this.groups.direct, ...chained].filter((recipe) => {
      const missing = this.missingEntries(recipe).length
      return missing > 0 && missing < recipe.inputs.length
    })
  }

  private pickCompletionRecipe(candidates: readonly Recipe[]): Recipe | null {
    if (candidates.length === 0) {
      return null
    }
    const recentIds = new Set(this.recentFocuses.map((recipe) => recipe.id))
    const recentInputs = new Set(this.recentFocuses.flatMap((recipe) => recipe.inputs))
    const notRecent = candidates.filter((recipe) => !recentIds.has(recipe.id))
    const distinct = notRecent.filter((recipe) =>
      recipe.inputs.every((id) => !recentInputs.has(id)),
    )
    const pool = distinct.length > 0 ? distinct : notRecent.length > 0 ? notRecent : candidates
    const bestRatio = Math.max(
      ...pool.map((recipe) =>
        (recipe.inputs.length - this.missingEntries(recipe).length) / recipe.inputs.length,
      ),
    )
    const best = pool.filter(
      (recipe) =>
        (recipe.inputs.length - this.missingEntries(recipe).length) / recipe.inputs.length ===
        bestRatio,
    )
    const picked = this.rng.pick(best)
    if (this.groups.chained.includes(picked)) {
      this.attemptedChains.add(picked.id)
    }
    return picked
  }

  private rememberFocus(recipe: Recipe): Recipe {
    this.recentFocuses = [...this.recentFocuses.slice(-1), recipe]
    return recipe
  }

  /** 합성 전용 재료가 이미 판에 있을 때만 그 뒤 레시피를 집중한다. */
  private canSupplyChain(recipe: Recipe): boolean {
    const used = new Map<string, number>()
    for (const id of recipe.inputs) {
      if (this.groups.baseEntryById.has(id)) {
        continue
      }
      const need = (used.get(id) ?? 0) + 1
      used.set(id, need)
      if ((this.available.get(id) ?? 0) < need) {
        return false
      }
    }
    return true
  }

  private missingEntries(recipe: Recipe): WordEntry[] {
    const remaining = new Map(this.available)
    const missing: WordEntry[] = []
    for (const id of recipe.inputs) {
      const entry = this.groups.baseEntryById.get(id)
      if (entry === undefined) {
        continue
      }
      const count = remaining.get(id) ?? 0
      if (count > 0) {
        remaining.set(id, count - 1)
      } else {
        missing.push(entry)
      }
    }
    return missing
  }

  private spawnableInputCount(recipe: Recipe): number {
    return recipe.inputs.filter((id) => this.groups.baseEntryById.has(id)).length
  }

  private pickAmbient(candidates: readonly WordEntry[]): WordEntry | null {
    if (this.groups.ambient.length === 0) {
      return null
    }
    if (this.ambientBag.length === 0) {
      this.ambientBag = shuffled(this.groups.ambient, this.rng)
    }

    const allowed = new Set(candidates.map((entry) => entry.word))
    for (let index = this.ambientBag.length - 1; index >= 0; index -= 1) {
      const entry = this.ambientBag[index]
      if (entry !== undefined && allowed.has(entry.word)) {
        this.ambientBag.splice(index, 1)
        return entry
      }
    }

    /* 화면에 ambient 단어가 모두 떠 있으면 새 백을 열어도 고를 수 없으므로 기다린다. */
    return null
  }

  private rememberRecipe(entry: WordEntry): WordEntry {
    this.lastWord = entry.word
    this.focusOffers += 1
    this.recipePicksSinceAmbient += 1
    return entry
  }

  private rememberAmbient(entry: WordEntry): WordEntry {
    this.lastWord = entry.word
    this.recipePicksSinceAmbient = 0
    return entry
  }
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = rng.int(index + 1)
    const held = result[index]
    const moved = result[target]
    if (held === undefined || moved === undefined) {
      continue
    }
    result[index] = moved
    result[target] = held
  }
  return result
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map()
const EMPTY_IDS: ReadonlySet<string> = new Set()

export {
  FRESH_FOCUSES_BETWEEN_COMPLETION,
  RecipeFlow,
  groupRecipes,
  RECIPE_PICKS_BEFORE_AMBIENT,
}
export type { RecipeGroups }
