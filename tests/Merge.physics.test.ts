import { beforeAll, describe, expect, it } from 'vitest'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { findMerge } from '../src/game/systems/Merger.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 합성을 물리와 함께 확인한다.
 *
 * 순수 로직(tests/Merger.test.ts)은 "이 그래프면 합쳐야 한다"까지만 말한다.
 * 실제로 닿았을 때 그 그래프가 만들어지는지, 합친 뒤 세계가 멀쩡한지는
 * Rapier를 돌려봐야 알 수 있다.
 */

function variant(id: string): ItemVariant {
  const found = VARIANT_BY_ID.get(id)
  if (found === undefined) throw new Error(`없는 변형: ${id}`)
  return found
}

/** 재료 둘짜리 레시피 하나 — 아트가 바뀌어도 이름에 매이지 않는다 */
function pairRecipe() {
  const found = RECIPES.find(
    (item) => item.inputs.length === 2 && item.inputs[0] === item.inputs[1],
  )
  if (found === undefined) throw new Error('같은 재료 둘짜리 레시피가 없다')
  return found
}

/** 서로 다른 물건을 합치는 레시피들 */
function crossRecipes() {
  const found = RECIPES.filter(
    (item) => item.inputs.length === 2 && item.inputs[0] !== item.inputs[1],
  )
  if (found.length === 0) throw new Error('서로 다른 재료짜리 레시피가 없다')
  return found
}

function settle(world: PhysicsWorld, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) {
    world.step(1 / 60)
  }
}

/**
 * 재료 둘을 확실히 맞닿게 놓는다.
 *
 * 낙하 지점에서 그냥 떨구면 서로 미끄러져 나란히 앉는 일이 흔하다 — 실제로
 * 클로버 둘을 같은 x에 떨궈보면 0.45만큼 벌어져 닿지 않는다. 그 흔들림이
 * 이 게임의 재미이지만, 합성 규칙을 검사하려면 접촉 자체는 확정되어 있어야 한다.
 *
 * 0.35는 **일부러 겹치게 놓는 값이다.** 두 물건의 크기를 재서 정확히 위에 얹어보는
 * 쪽으로 바꿨다가 되돌렸다 — 클로버처럼 서로 잘 미끄러지는 것은 얹어놓으면 1.5초
 * 안에 흘러내려 닿지 않는다. 겹쳐서 시작하면 접촉이 처음부터 있다.
 */
function stackPair(world: PhysicsWorld, item: ItemVariant, second = item): void {
  world.spawnItemAt(item, 0, ARENA.platformTop + 0.5, SOLO_OWNER)
  settle(world, 1.5)
  const first = world.frames()[0]
  if (first === undefined) throw new Error('첫 재료가 받침대에 남지 않았다')
  world.spawnItemAt(second, first.x, first.y + 0.35, SOLO_OWNER)
  settle(world, 1.5)
}

let world: PhysicsWorld

beforeAll(async () => {
  world = await PhysicsWorld.create()
})

describe('합성 — 물리와 함께', () => {
  it('닿아서 쌓인 재료가 접촉 그래프에 이어져 나온다', () => {
    world.reset()
    const item = variant(pairRecipe().inputs[0]!)
    stackPair(world, item)

    const graph = world.contactGraph()
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges.length).toBeGreaterThan(0)
  })

  it('닿은 재료가 레시피를 이루면 합성 대상으로 잡힌다', () => {
    world.reset()
    const recipe = pairRecipe()
    const item = variant(recipe.inputs[0]!)
    stackPair(world, item)

    const match = findMerge(world.contactGraph(), RECIPES)
    expect(match?.recipe.id).toBe(recipe.id)
  })

  /*
   * 같은 재료 둘은 도형이 같아서 위에 얹으면 대체로 닿는다. 서로 다른 물건은
   * 크기와 모양이 달라 얹은 것이 미끄러져 내려앉는 일이 흔하다 — 실제로 재보니
   * **재료가 갖춰져도 열에 일곱은 닿지 않는다**(120판 실측). 그래서 짝 하나를
   * 집어 "이건 닿는다"고 못 박을 수 없다. 씨앗 + 물뿌리개가 정확히 그랬다.
   *
   * 여기서 지키려는 것은 물리가 아니라 **길이 이어져 있다는 것**이다 — 교차 레시피가
   * 접촉 그래프를 타고 `findMerge`까지 닿는지. 그래서 닿는 짝이 하나라도 있으면 된다.
   */
  it('서로 다른 물건도 닿으면 합성 대상으로 잡힌다', () => {
    const tried: string[] = []
    for (const recipe of crossRecipes()) {
      world.reset()
      stackPair(world, variant(recipe.inputs[0]!), variant(recipe.inputs[1]!))
      const match = findMerge(world.contactGraph(), RECIPES)
      if (match?.recipe.id === recipe.id) return
      tried.push(recipe.id)
    }
    throw new Error(`교차 레시피가 하나도 접촉으로 잡히지 않았다: ${tried.join(', ')}`)
  })

  it('합치면 재료가 사라지고 결과물 하나만 남는다', () => {
    world.reset()
    const recipe = pairRecipe()
    const item = variant(recipe.inputs[0]!)
    stackPair(world, item)

    const match = findMerge(world.contactGraph(), RECIPES)
    expect(match).not.toBeNull()
    const created = world.mergeItems(match!.itemIds, match!.recipe.result, SOLO_OWNER)
    expect(created).not.toBeNull()

    const graph = world.contactGraph()
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]?.variantId).toBe(recipe.result.id)
  })

  it('결과물은 재료들이 있던 자리에 태어난다 — 허공이나 바닥이 아니다', () => {
    world.reset()
    const recipe = pairRecipe()
    const item = variant(recipe.inputs[0]!)
    stackPair(world, item)

    const before = world.frames().map((frame) => frame.y)
    const low = Math.min(...before)
    const high = Math.max(...before)

    const match = findMerge(world.contactGraph(), RECIPES)
    world.mergeItems(match!.itemIds, match!.recipe.result, SOLO_OWNER)
    const after = world.frames()[0]
    expect(after).toBeDefined()
    expect(after!.y).toBeGreaterThanOrEqual(low - 0.01)
    expect(after!.y).toBeLessThanOrEqual(high + 0.01)
  })

  it('합친 뒤에도 결과물이 받침대 위에 머문다 — 합성이 목숨을 앗아가면 안 된다', () => {
    world.reset()
    const recipe = pairRecipe()
    const item = variant(recipe.inputs[0]!)
    stackPair(world, item)

    const match = findMerge(world.contactGraph(), RECIPES)
    world.mergeItems(match!.itemIds, match!.recipe.result, SOLO_OWNER)

    let escaped = 0
    for (let t = 0; t < 4; t += 1 / 60) {
      escaped += world.step(1 / 60).escaped.length
    }
    expect(escaped).toBe(0)
    const rest = world.frames()[0]
    expect(rest).toBeDefined()
    expect(Math.abs(rest!.x)).toBeLessThanOrEqual(ARENA.halfWidth)
  })

  it('없는 물건을 합치라고 하면 아무 일도 하지 않는다', () => {
    world.reset()
    expect(world.mergeItems([999, 1000], pairRecipe().result, SOLO_OWNER)).toBeNull()
  })

  it('모든 레시피의 결과물이 빈 받침대에서 저절로 떨어지지 않는다', () => {
    for (const recipe of RECIPES) {
      world.reset()
      world.spawnItem(recipe.result, 0, SOLO_OWNER)
      let escaped = 0
      for (let t = 0; t < 5; t += 1 / 60) {
        escaped += world.step(1 / 60).escaped.length
      }
      expect(escaped, recipe.result.id).toBe(0)
    }
  })
})
