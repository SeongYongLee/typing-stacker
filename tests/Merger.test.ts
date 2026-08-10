import { describe, expect, it } from 'vitest'
import { RECIPES, craftKeyOf } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID, WORDS } from '../src/game/data/words.ts'
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
  hiddenResults: [],
}
const TRIO: Recipe = {
  id: 'trio',
  inputs: ['leaf', 'leaf', 'snail'],
  result: variant('leaf-maple'),
  hiddenResults: [],
}
const CROSS: Recipe = {
  id: 'cross',
  inputs: ['sunflower-seed', 'watering-can'],
  result: variant('sunflower'),
  hiddenResults: [],
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
    const match = findMerge(graph([[5, 'sunflower-seed'], [9, 'watering-can']], [[5, 9]]), [CROSS])
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

  it('같은 조합 속성의 다른 형태도 같은 재료로 본다', () => {
    const recipe = RECIPES.find((item) => item.result.id === 'travel-passport')
    expect(recipe).toBeDefined()
    const match = findMerge(
      graph(
        [
          [1, 'airplane'],
          [2, 'vintage-trunk'],
          [3, 'treasure-map'],
          [4, 'camera'],
        ],
        [
          [1, 2],
          [2, 3],
          [3, 4],
        ],
      ),
      RECIPES,
    )
    expect(match?.recipe.id).toBe(recipe!.id)
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

  it('단어 히든은 그 단어 기본형 둘로 만들 수 있다', () => {
    for (const entry of WORDS) {
      const base = entry.variants[0]
      const hidden = entry.variants.filter((item) => item.hidden)
      if (base === undefined || hidden.length === 0) {
        continue
      }
      const recipe = RECIPES.find(
        (item) => item.inputs.length === 2 && item.inputs[0] === base.id && item.inputs[1] === base.id,
      )
      expect(recipe, entry.word).toBeDefined()
      const outputs = new Set([recipe!.result.id, ...recipe!.hiddenResults.map((item) => item.id)])
      expect(outputs, entry.word).toEqual(new Set(hidden.map((item) => item.id)))
    }
  })

  it('단어 기본형과 히든은 같은 조합 속성이다', () => {
    for (const entry of WORDS) {
      const base = entry.variants[0]
      if (base === undefined) {
        continue
      }
      for (const variant of entry.variants) {
        expect(craftKeyOf(variant.id), variant.id).toBe(base.id)
      }
    }
  })

  it('합성 결과의 다른 형태는 기본 결과와 같은 조합 속성이다', () => {
    let checked = 0
    for (const item of RECIPES) {
      for (const hidden of item.hiddenResults) {
        expect(craftKeyOf(hidden.id), hidden.id).toBe(craftKeyOf(item.result.id))
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  /*
   * **"결과물은 재료보다 좁다"는 규칙은 없앴다 (2026-08-09).**
   *
   * 그 규칙은 "합성이 자리를 틔워주는 것이 보상"이라는 전제 위에 있었는데 **전제가
   * 틀렸다.** 합성해서 얻는 것은 판 안의 여유가 아니라 판 밖에 남는 것이다 —
   * 도감이 채워지고, 히든을 봤다는 사실이 남고, 프로필 사진으로 쓸 수 있다.
   *
   * 그러니 결과물이 넓어져도 합치고 싶은 마음은 사라지지 않는다. 반대로 규칙 쪽은
   * 대가를 물렸다 — 재작화에서 여행앨범이 가로형이 되자(비율 0.838 → 1.5547)
   * **아트가 정한 크기를 줄여야** 규칙을 지킬 수 있었다.
   *
   * 아래의 "조준 범위를 넘지 않는다"는 남는다. 그쪽은 취향이 아니라 즉사를 막는 것이다.
   */

  it('결과물이 조준 범위를 넘지 않는다 — 합성 때문에 받침대를 넘치면 안 된다', async () => {
    const { MAX_ITEM_HALF_WIDTH } = await import('../src/game/config.ts')
    for (const item of RECIPES) {
      for (const result of [item.result, ...item.hiddenResults]) {
        expect(result.artBounds.hw, `${item.id} → ${result.id}`).toBeLessThanOrEqual(
          MAX_ITEM_HALF_WIDTH,
        )
      }
    }
  })

  /**
   * 같은 레시피가 낮은 확률로 내놓는 **다른 형태**들.
   *
   * 도감이 `CRAFTABLE_IDS`로 "만들 수 있는 것"을 세므로, 여기 빠지면 도감에 칸은
   * 있는데 채울 길이 없는 물건이 된다.
   */
  it('다른 형태도 히든이고 도감이 셀 수 있다', async () => {
    const { CRAFTABLE_IDS } = await import('../src/game/data/recipes.ts')
    const craftable = new Set(CRAFTABLE_IDS)
    let count = 0
    for (const item of RECIPES) {
      for (const result of item.hiddenResults) {
        count += 1
        expect(result.hidden, result.id).toBe(true)
        expect(craftable.has(result.id), result.id).toBe(true)
        expect(result.id, `${item.id}: 기본형과 같은 물건이면 뽑는 뜻이 없다`).not.toBe(
          item.result.id,
        )
      }
    }
    expect(count, '다른 형태가 하나도 없으면 이 검사는 아무것도 지키지 않는다').toBeGreaterThan(0)
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

  it('같은 조합 속성의 다른 형태도 개수에 포함한다', () => {
    expect(canMergeAnything([PAIR], counts([['clover', 1], ['clover-lucky', 1]]))).toBe(true)
  })

  it('같은 재료가 둘 필요한 레시피는 개수까지 본다', () => {
    // leaf 하나 + snail 하나로는 TRIO(leaf, leaf, snail)를 이룰 수 없다
    expect(canMergeAnything([TRIO], counts([['leaf', 1], ['snail', 1]]))).toBe(false)
    expect(canMergeAnything([TRIO], counts([['leaf', 2], ['snail', 1]]))).toBe(true)
  })

  it('서로 다른 재료는 둘 다 있어야 한다', () => {
    expect(canMergeAnything([CROSS], counts([['sunflower-seed', 2]]))).toBe(false)
    expect(canMergeAnything([CROSS], counts([['sunflower-seed', 1], ['watering-can', 1]]))).toBe(true)
  })

  /**
   * 가장 중요한 성질 — **findMerge가 찾아내는 판을 거르지 않는다.**
   * 이 문이 findMerge보다 엄격해지면 합성이 사라진다.
   */
  it('findMerge가 답을 찾는 판은 절대 거르지 않는다', () => {
    const cases: ContactGraph[] = [
      graph([[1, 'clover'], [2, 'clover']], [[1, 2]]),
      graph([[1, 'leaf'], [2, 'leaf'], [3, 'snail']], [[1, 2], [2, 3]]),
      graph([[1, 'sunflower-seed'], [2, 'watering-can']], [[1, 2]]),
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
