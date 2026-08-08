import { describe, expect, it } from 'vitest'
import { RECIPES } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import { canMergeAnything, findMerge, type ContactGraph } from '../src/game/systems/Merger.ts'
import type { Recipe } from '../src/game/data/recipes.ts'

function variant(id: string) {
  const found = VARIANT_BY_ID.get(id)
  if (found === undefined) throw new Error(`없는 변형: ${id}`)
  return found
}

/** 테스트용 레시피 — 실제 데이터가 바뀌어도 규칙 검사는 흔들리지 않게 */
const PAIR: Recipe = {
  id: 'pair',
  inputs: ['clover', 'clover'],
  result: variant('clover-lucky'),
}
const TRIO: Recipe = {
  id: 'trio',
  inputs: ['leaf', 'leaf', 'snail'],
  result: variant('leaf-maple'),
}
const CROSS: Recipe = {
  id: 'cross',
  inputs: ['octopus', 'sausage'],
  result: variant('cocktail'),
}

function graph(
  nodes: [number, string][],
  edges: [number, number][],
): ContactGraph {
  return {
    nodes: nodes.map(([itemId, variantId]) => ({ itemId, variantId })),
    edges,
  }
}

describe('findMerge — 닿아 있는 재료만 합쳐진다', () => {
  it('닿은 같은 물건 둘을 찾는다', () => {
    const match = findMerge(graph([[1, 'clover'], [2, 'clover']], [[1, 2]]), [PAIR])
    expect(match?.recipe.id).toBe('pair')
    expect(match?.itemIds).toEqual([1, 2])
  })

  it('닿지 않았으면 합쳐지지 않는다', () => {
    expect(findMerge(graph([[1, 'clover'], [2, 'clover']], []), [PAIR])).toBeNull()
  })

  it('탑을 통해 멀리 이어진 둘은 합쳐지지 않는다', () => {
    // 1 - 3(무관한 물건) - 2 로만 이어져 있다. 눈에는 붙어 보이지 않는 두 개다
    const stack = graph(
      [
        [1, 'clover'],
        [3, 'bento'],
        [2, 'clover'],
      ],
      [
        [1, 3],
        [3, 2],
      ],
    )
    expect(findMerge(stack, [PAIR])).toBeNull()
  })

  it('서로 다른 물건 조합도 찾는다', () => {
    const match = findMerge(graph([[5, 'octopus'], [9, 'sausage']], [[5, 9]]), [CROSS])
    expect(match?.recipe.id).toBe('cross')
    expect(match?.itemIds).toEqual([5, 9])
  })

  it('재료 셋짜리도 찾는다 — 사슬로 이어져 있으면 된다', () => {
    const chain = graph(
      [
        [1, 'leaf'],
        [2, 'snail'],
        [3, 'leaf'],
      ],
      [
        [1, 2],
        [2, 3],
      ],
    )
    const match = findMerge(chain, [TRIO])
    expect(match?.recipe.id).toBe('trio')
    expect(match?.itemIds).toEqual([1, 2, 3])
  })

  it('셋 중 하나가 떨어져 있으면 합쳐지지 않는다', () => {
    const broken = graph(
      [
        [1, 'leaf'],
        [2, 'snail'],
        [3, 'leaf'],
      ],
      [[1, 2]],
    )
    expect(findMerge(broken, [TRIO])).toBeNull()
  })

  it('재료가 모자라면 합쳐지지 않는다', () => {
    expect(findMerge(graph([[1, 'clover'], [2, 'leaf']], [[1, 2]]), [PAIR])).toBeNull()
  })

  it('재료가 적은 레시피를 먼저 본다 — 둘이 이미 맞으면 셋을 기다리지 않는다', () => {
    const both = graph(
      [
        [1, 'clover'],
        [2, 'clover'],
        [3, 'leaf'],
        [4, 'leaf'],
        [5, 'snail'],
      ],
      [
        [1, 2],
        [3, 5],
        [5, 4],
      ],
    )
    expect(findMerge(both, [TRIO, PAIR])?.recipe.id).toBe('pair')
  })

  it('같은 그래프면 언제나 같은 답이다 — 재현되어야 멀티에서 어긋나지 않는다', () => {
    const three = graph(
      [
        [7, 'clover'],
        [3, 'clover'],
        [5, 'clover'],
      ],
      [
        [7, 3],
        [3, 5],
        [7, 5],
      ],
    )
    const first = findMerge(three, [PAIR])
    for (let i = 0; i < 20; i += 1) {
      expect(findMerge(three, [PAIR])?.itemIds).toEqual(first?.itemIds)
    }
  })

  it('물건이 하나뿐이면 아무것도 하지 않는다', () => {
    expect(findMerge(graph([[1, 'clover']], []), [PAIR])).toBeNull()
  })

  it('레시피가 없으면 아무것도 하지 않는다', () => {
    expect(findMerge(graph([[1, 'clover'], [2, 'clover']], [[1, 2]]), [])).toBeNull()
  })
})

describe('RECIPES — 실제 데이터', () => {
  it('결과물은 전부 히든이다 — 합성은 도감을 채우는 길이다', () => {
    for (const item of RECIPES) {
      expect(item.result.hidden, item.result.id).toBe(true)
    }
  })

  it('재료는 둘 이상이다', () => {
    for (const item of RECIPES) {
      expect(item.inputs.length, item.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('같은 재료 조합에 결과가 둘일 수는 없다 — 무엇이 나올지 정해져 있어야 한다', () => {
    const keys = RECIPES.map((item) => [...item.inputs].sort().join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('합치면 자리가 넓어진다 — 결과물은 재료들이 차지하던 폭보다 좁다', () => {
    for (const item of RECIPES) {
      const inputWidth = item.inputs.reduce((sum, id) => {
        const found = VARIANT_BY_ID.get(id)
        return sum + (found?.artBounds.hw ?? 0) * 2
      }, 0)
      const resultWidth = item.result.artBounds.hw * 2
      expect(resultWidth, item.id).toBeLessThan(inputWidth)
    }
  })

  it('결과물이 조준 범위를 넘지 않는다 — 합성 때문에 받침대를 넘치면 안 된다', async () => {
    const { MAX_ITEM_HALF_WIDTH } = await import('../src/game/config.ts')
    for (const item of RECIPES) {
      expect(item.result.artBounds.hw, item.id).toBeLessThanOrEqual(MAX_ITEM_HALF_WIDTH)
    }
  })
})

describe('canMergeAnything — 접촉을 보기 전에 거르는 문', () => {
  /*
   * 이 문이 하는 일은 성능이지만, 규칙을 어기면 합성이 조용히 사라진다 —
   * false를 잘못 내면 재료가 붙어 있어도 합쳐지지 않고 아무 신호도 남지 않는다.
   * 그래서 "덜 걸러도 되지만 더 걸러선 안 된다"를 여기서 지킨다.
   */
  const counts = (entries: [string, number][]) => new Map(entries)

  it('재료가 아예 없으면 거른다', () => {
    expect(canMergeAnything([PAIR, TRIO, CROSS], counts([['bento', 3]]))).toBe(false)
  })

  it('재료가 하나뿐이면 거른다 — 쌍이 되어야 한다', () => {
    expect(canMergeAnything([PAIR], counts([['clover', 1]]))).toBe(false)
  })

  it('개수가 갖춰지면 통과시킨다', () => {
    expect(canMergeAnything([PAIR], counts([['clover', 2]]))).toBe(true)
  })

  it('같은 재료가 둘 필요한 레시피는 개수까지 본다', () => {
    // leaf 하나 + snail 하나로는 TRIO(leaf, leaf, snail)를 이룰 수 없다
    expect(canMergeAnything([TRIO], counts([['leaf', 1], ['snail', 1]]))).toBe(false)
    expect(canMergeAnything([TRIO], counts([['leaf', 2], ['snail', 1]]))).toBe(true)
  })

  it('서로 다른 재료는 둘 다 있어야 한다', () => {
    expect(canMergeAnything([CROSS], counts([['octopus', 2]]))).toBe(false)
    expect(canMergeAnything([CROSS], counts([['octopus', 1], ['sausage', 1]]))).toBe(true)
  })

  /**
   * 가장 중요한 성질 — **findMerge가 찾아내는 판을 거르지 않는다.**
   * 이 문이 findMerge보다 엄격해지면 합성이 사라진다.
   */
  it('findMerge가 답을 찾는 판은 절대 거르지 않는다', () => {
    const cases: ContactGraph[] = [
      graph([[1, 'clover'], [2, 'clover']], [[1, 2]]),
      graph([[1, 'leaf'], [2, 'leaf'], [3, 'snail']], [[1, 2], [2, 3]]),
      graph([[1, 'octopus'], [2, 'sausage']], [[1, 2]]),
      graph([[1, 'bento'], [2, 'clover'], [3, 'clover']], [[1, 2], [2, 3]]),
    ]
    const recipes = [PAIR, TRIO, CROSS]
    for (const g of cases) {
      expect(findMerge(g, recipes), JSON.stringify(g.nodes)).not.toBeNull()
      const present = new Map<string, number>()
      for (const node of g.nodes) {
        present.set(node.variantId, (present.get(node.variantId) ?? 0) + 1)
      }
      expect(canMergeAnything(recipes, present), JSON.stringify(g.nodes)).toBe(true)
    }
  })
})
