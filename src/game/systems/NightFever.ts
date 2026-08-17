import { ARENA, NIGHT_FEVER, NIGHT_SEC } from '../config.ts'
import type { Recipe } from '../data/recipes.ts'
import type { ItemVariant } from '../types/game.ts'
import type { Rng } from './Rng.ts'

/** Night Fever가 완성 재료를 찾을 때 필요한 현재 스택 정보. */
interface FeverStackItem {
  readonly handle: number
  readonly variant: ItemVariant
  readonly x: number
  readonly y: number
  readonly settled: boolean
  readonly recalled?: boolean
}

interface FeverDrop {
  readonly variant: ItemVariant
  readonly x: number
  readonly recipeId: string
  /** 이번 밤에서 몇 번째 6개 묶음인가. */
  readonly setIndex: number
  /** 기존 스택의 이 물건을 완성하려고 고른 재료면 그 핸들. 대체 묶음이면 null. */
  readonly targetHandle: number | null
}

interface ScheduledDrop extends FeverDrop {
  readonly at: number
}

interface Completion {
  readonly target: FeverStackItem
  readonly recipe: Recipe
  readonly missingId: string
}

/**
 * 여섯 개를 0.3초 간격으로 내리고, 마지막 물건 뒤 3초를 쉰 다음 반복한다.
 *
 * 가장 위에 자리 잡은 물건 중 2재료 레시피의 한쪽이 될 수 있는 것을 찾고, 나머지
 * 재료를 그 주변에 떨어뜨린다. 완성 재료가 전혀 없는 스택이면 2재료 레시피 세 개를
 * 통째로 내린다. 어느 경우든 한 묶음은 정확히 여섯 개이고 각 물건은 0.3초 간격이다.
 *
 * 레시피·위치 난수는 단어·히든 RNG와 분리한다. Fever 연출이나 묶음 수를 바꿔도 같은
 * 시드의 타자 단어와 히든 결과가 달라지면 안 된다.
 */
class NightFever {
  private readonly rng: Rng
  private readonly variantById: ReadonlyMap<string, ItemVariant>
  private readonly twoItemRecipes: readonly Recipe[]
  private active = false
  private elapsed = 0
  private nextSetAt = 0
  private nextSetIndex = 0
  private queue: ScheduledDrop[] = []
  private revision = 0

  constructor(
    rng: Rng,
    recipes: readonly Recipe[],
    variantById: ReadonlyMap<string, ItemVariant>,
  ) {
    this.rng = rng
    this.variantById = variantById
    this.twoItemRecipes = recipes.filter((recipe) => recipe.inputs.length === 2)
    if (this.twoItemRecipes.length === 0) {
      throw new Error('Night Fever에 쓸 2재료 레시피가 없다')
    }
  }

  start(): void {
    const hadPending = this.queue.length > 0
    this.active = true
    this.elapsed = 0
    this.nextSetAt = 0
    this.nextSetIndex = 0
    this.queue = []
    if (hadPending) this.revision += 1
  }

  stop(): void {
    const hadPending = this.queue.length > 0
    this.active = false
    this.queue = []
    if (hadPending) this.revision += 1
  }

  /** 아직 떨어지지 않은 재료. RecipeFlow가 이미 올 재료를 다시 부르지 않게 센다. */
  get pending(): readonly FeverDrop[] {
    return this.queue
  }

  /** 예약된 재료 구성이 바뀔 때만 증가한다. */
  get version(): number {
    return this.revision
  }

  get remaining(): number {
    return this.queue.length
  }

  /**
   * 시간을 흘리고 지금 떨어질 물건 하나를 돌려준다.
   *
   * 묶음은 물리 쿨다운과 무관하게 예약한다. Fever와 입력이 같은 0.3초 문턱을 함께
   * 쓰면 플레이어 입력이 Fever 시계를 밀 수 있으므로 서로 독립시킨다.
   */
  update(dt: number, stack: readonly FeverStackItem[]): FeverDrop | null {
    if (!this.active) {
      return null
    }
    this.elapsed += Math.max(0, dt)

    while (
      this.nextSetAt +
        NIGHT_FEVER.firstDropSec +
        (NIGHT_FEVER.itemsPerSet - 1) * NIGHT_FEVER.itemGapSec <
        NIGHT_SEC &&
      this.nextSetAt <= this.elapsed
    ) {
      this.enqueueSet(stack, this.nextSetAt, this.nextSetIndex)
      this.nextSetAt +=
        NIGHT_FEVER.firstDropSec +
        (NIGHT_FEVER.itemsPerSet - 1) * NIGHT_FEVER.itemGapSec +
        NIGHT_FEVER.restSec
      this.nextSetIndex += 1
    }

    const next = this.queue[0]
    if (next === undefined || next.at > this.elapsed) {
      return null
    }
    this.queue.shift()
    this.revision += 1
    return next
  }

  private enqueueSet(
    stack: readonly FeverStackItem[],
    setAt: number,
    setIndex: number,
  ): void {
    const completions = this.completionsFromTop(stack)
    const items =
      completions.length > 0
        ? this.completeTopItems(completions, setIndex)
        : this.fallbackRecipePairs(setIndex)

    for (let index = 0; index < items.length; index += 1) {
      this.queue.push({
        ...items[index]!,
        at: setAt + NIGHT_FEVER.firstDropSec + index * NIGHT_FEVER.itemGapSec,
      })
    }
    this.revision += 1
  }

  /** 스택 꼭대기 띠 안에서 2재료 레시피의 나머지 한쪽을 찾는다. */
  private completionsFromTop(stack: readonly FeverStackItem[]): Completion[] {
    const settled = stack.filter((item) => item.settled && item.recalled !== true)
    if (settled.length === 0) {
      return []
    }
    const highest = Math.max(
      ...settled.map((item) => item.y + item.variant.artBounds.hh),
    )
    const top = settled.filter(
      (item) => item.y + item.variant.artBounds.hh >= highest - NIGHT_FEVER.topBandHeight,
    )

    const completions: Completion[] = []
    for (const target of top) {
      const seen = new Set<string>()
      for (const recipe of this.twoItemRecipes) {
        const [left, right] = recipe.inputs
        const missingId = left === target.variant.id ? right : right === target.variant.id ? left : null
        if (missingId === null || missingId === undefined || seen.has(`${recipe.id}:${missingId}`)) {
          continue
        }
        if (!this.variantById.has(missingId)) {
          continue
        }
        seen.add(`${recipe.id}:${missingId}`)
        completions.push({ target, recipe, missingId })
      }
    }
    return completions
  }

  /**
   * 위쪽 물건마다 한 번만 나머지 재료를 붙인다. 같은 표적을 여섯 번 고르면 첫 합성 뒤
   * 나머지 다섯은 더는 보장된 재료가 아니므로 중복하지 않는다. 남는 짝수 칸은 레시피
   * 두 재료를 함께 내려 채운다. 정확히 여섯 칸을 만들기 위해 표적 수는 짝수로 고른다.
   */
  private completeTopItems(completions: readonly Completion[], setIndex: number): FeverDrop[] {
    const byTarget = new Map<number, Completion[]>()
    for (const completion of completions) {
      const choices = byTarget.get(completion.target.handle) ?? []
      choices.push(completion)
      byTarget.set(completion.target.handle, choices)
    }

    let targetCount = Math.min(NIGHT_FEVER.itemsPerSet, byTarget.size)
    targetCount -= targetCount % 2
    const selectedTargets = this.pickDistinct([...byTarget.values()], targetCount)
    const result: FeverDrop[] = []
    for (const choices of selectedTargets) {
      const picked = this.rng.pick(choices)
      const variant = this.variant(picked.missingId)
      result.push({
        variant,
        x: this.xNear(picked.target, variant, result.at(-1)?.x),
        recipeId: picked.recipe.id,
        setIndex,
        targetHandle: picked.target.handle,
      })
    }

    const pairCount = (NIGHT_FEVER.itemsPerSet - result.length) / 2
    result.push(...this.fallbackRecipePairs(setIndex, pairCount))
    return this.shuffle(result)
  }

  /** 완성할 위쪽 물건이 없을 때도 Fever가 비지 않도록 2재료 레시피를 통째로 내린다. */
  private fallbackRecipePairs(
    setIndex: number,
    pairCount = NIGHT_FEVER.itemsPerSet / 2,
  ): FeverDrop[] {
    const recipes = this.pickDistinct(this.twoItemRecipes, pairCount)
    const result: FeverDrop[] = []
    for (const recipe of recipes) {
      const anchor = this.randomSafeX()
      const variants = recipe.inputs.map((id) => this.variant(id))
      const pairReach = variants[0]!.artBounds.hw + variants[1]!.artBounds.hw
      // 두 중심의 최대 차이가 합친 반폭보다 작아, 흔들어도 가로 실루엣은 겹친다.
      const jitter = Math.max(0.05, Math.min(0.18, pairReach * 0.32))
      for (const variant of variants) {
        result.push({
          variant,
          x: this.jitteredSafeX(anchor, variant, jitter, result.at(-1)?.x),
          recipeId: recipe.id,
          setIndex,
          targetHandle: null,
        })
      }
    }
    return result
  }

  private xNear(target: FeverStackItem, variant: ItemVariant, previous?: number): number {
    const reach = Math.max(0.16, (target.variant.artBounds.hw + variant.artBounds.hw) * 0.65)
    const candidate = target.x + (this.rng.next() * 2 - 1) * reach
    return this.avoidRepeat(this.clampSafe(candidate, variant), target.x, variant, previous)
  }

  private randomSafeX(): number {
    const halfRange = ARENA.platformHalfWidth - Math.max(...[...this.variantById.values()].map((item) => item.artBounds.hw))
    return (this.rng.next() * 2 - 1) * Math.max(0, halfRange)
  }

  private jitteredSafeX(
    anchor: number,
    variant: ItemVariant,
    jitter: number,
    previous?: number,
  ): number {
    const candidate = anchor + (this.rng.next() * 2 - 1) * jitter
    return this.avoidRepeat(this.clampSafe(candidate, variant), anchor, variant, previous)
  }

  private avoidRepeat(x: number, center: number, variant: ItemVariant, previous?: number): number {
    if (previous === undefined || Math.abs(x - previous) >= NIGHT_FEVER.minXGap) {
      return x
    }
    const direction = x >= center ? 1 : -1
    return this.clampSafe(center - direction * NIGHT_FEVER.minXGap, variant)
  }

  private clampSafe(x: number, variant: ItemVariant): number {
    const halfRange = Math.max(0, ARENA.platformHalfWidth - variant.artBounds.hw)
    return Math.max(-halfRange, Math.min(halfRange, x))
  }

  private variant(id: string): ItemVariant {
    const variant = this.variantById.get(id)
    if (variant === undefined) {
      throw new Error(`Night Fever 재료가 없다: ${id}`)
    }
    return variant
  }

  private pickDistinct<T>(items: readonly T[], count: number): T[] {
    const pool = [...items]
    const selected: T[] = []
    while (selected.length < count && pool.length > 0) {
      selected.push(pool.splice(this.rng.int(pool.length), 1)[0]!)
    }
    return selected
  }

  private shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = this.rng.int(index + 1)
      const value = shuffled[index]!
      shuffled[index] = shuffled[other]!
      shuffled[other] = value
    }
    return shuffled
  }
}

function isLifeProtected(phase: 'day' | 'night', invulnerableLeft: number): boolean {
  return phase === 'night' || invulnerableLeft > 0
}

export { NightFever, isLifeProtected }
export type { FeverDrop, FeverStackItem }
