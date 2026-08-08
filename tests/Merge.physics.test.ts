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

/**
 * 서로 다른 물건을 합치는 레시피 하나.
 *
 * 이쪽이 물리 위에서 한 번도 검사된 적이 없었다. 같은 재료 둘은 도형도 같아서
 * 접촉이 쉽게 생기는데, 서로 다른 물건은 크기와 모양이 달라 위에 얹은 것이
 * 미끄러져 내려앉을 수 있다 — 규칙만 맞고 실제로는 안 붙는 짝이 있을 수 있다.
 */
function crossRecipe() {
  const found = RECIPES.find(
    (item) => item.inputs.length === 2 && item.inputs[0] !== item.inputs[1],
  )
  if (found === undefined) throw new Error('서로 다른 재료짜리 레시피가 없다')
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

  it('서로 다른 물건도 닿으면 합성 대상으로 잡힌다', () => {
    world.reset()
    const recipe = crossRecipe()
    stackPair(world, variant(recipe.inputs[0]!), variant(recipe.inputs[1]!))

    const match = findMerge(world.contactGraph(), RECIPES)
    expect(match?.recipe.id).toBe(recipe.id)
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
