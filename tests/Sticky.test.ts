import { beforeAll, describe, expect, it } from 'vitest'
import { ARENA, HEAVY_MASS, SOLO_OWNER } from '../src/game/config.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { findMerge } from '../src/game/systems/Merger.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 끈적함과 무게가 실제로 다르게 움직이는지 잰다.
 *
 * 값을 바꿔놓고 "성격을 줬다"고 말하기는 쉽다. 여기서 보는 것은 숫자가 아니라
 * **결과**다. 실제로 이 시험들이 두 번의 실패를 잡아냈다 — 마찰만 올리는 방식은
 * 흘러내린 거리가 소수점 셋째 자리까지 같았고, 닿는 순간 속도를 죽이는 방식은
 * 물건이 자리를 찾을 여지를 없애 오히려 더 낮은 곳에 앉혔다.
 */

function allVariants(): readonly ItemVariant[] {
  return WORDS.flatMap((entry) => entry.variants)
}

function find(id: string): ItemVariant {
  const found = allVariants().find((item) => item.id === id)
  if (found === undefined) throw new Error(`없는 변형: ${id}`)
  return found
}

const BLOCK = find('bento')

let world: PhysicsWorld

beforeAll(async () => {
  world = await PhysicsWorld.create()
})

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) {
    world.step(1 / 60)
  }
}

function frameOf(item: ItemVariant) {
  return world.frames().find((frame) => frame.variantId === item.id)
}

function weldCount(): number {
  return (world as unknown as { welds: Map<string, unknown> }).welds.size
}

/** 두 칸짜리 탑을 세우고 맨 위 칸을 돌려준다 */
function buildTower() {
  world.reset()
  world.spawnItemAt(BLOCK, 0, ARENA.platformTop + 0.4, SOLO_OWNER)
  run(2)
  const first = world.frames()[0]
  if (first === undefined) throw new Error('탑이 서지 않았다')
  world.spawnItemAt(BLOCK, first.x, first.y + 0.45, SOLO_OWNER)
  run(2)
  return world.frames().reduce((best, frame) => (frame.y > best.y ? frame : best))
}

/**
 * 탑 옆면에 갖다 댄 뒤 닿은 높이에서 얼마나 내려갔는지.
 * 0에 가까우면 그 자리에 매달린 것이고, 크면 흘러내린 것이다.
 * 받쳐주는 것이 없는 옆면이라 붙지 않으면 반드시 내려간다.
 */
function dropFromContact(item: ItemVariant): number {
  const top = buildTower()
  world.spawnItemAt(item, top.x + 0.5, top.y, SOLO_OWNER)
  run(0.4)
  const touched = frameOf(item)
  if (touched === undefined) return Infinity
  run(4)
  const rest = frameOf(item)
  if (rest === undefined) return Infinity
  return touched.y - rest.y
}

/** 같은 물건에서 끈적함만 끈 사본. 모양이 변수가 되지 않게 한다 */
function withoutSticky(item: ItemVariant): ItemVariant {
  return { ...item, id: `${item.id}-plain`, sticky: false }
}

function massOf(item: ItemVariant): number {
  world.reset()
  world.spawnItem(item, 0, SOLO_OWNER)
  const internals = world as unknown as {
    tracked: Map<number, { body: { mass(): number } }>
  }
  const entry = [...internals.tracked.values()][0]
  if (entry === undefined) throw new Error('물건이 생기지 않았다')
  return entry.body.mass()
}

describe('끈적함 — 닿으면 붙는다', () => {
  it('끈적한 물건이 하나 이상 있다', () => {
    expect(allVariants().filter((item) => item.sticky).length).toBeGreaterThan(0)
  })

  it('받쳐주는 것이 없는 옆면에 닿아도 그 자리에 매달린다', () => {
    for (const item of allVariants().filter((v) => v.sticky)) {
      expect(dropFromContact(item), item.id).toBeLessThan(0.05)
    }
  })

  it('끈적함을 끄면 같은 물건이 흘러내린다 — 모양 덕이 아님을 보인다', () => {
    for (const item of allVariants().filter((v) => v.sticky)) {
      expect(dropFromContact(withoutSticky(item)), item.id).toBeGreaterThan(0.1)
    }
  })

  it('붙은 뒤에는 상대 위치가 그대로 유지된다', () => {
    const item = find('octopus')
    const top = buildTower()
    world.spawnItemAt(item, top.x + 0.5, top.y, SOLO_OWNER)
    run(0.6)

    const gap = () => {
      const mine = frameOf(item)
      const block = world.frames().find((frame) => frame.variantId === BLOCK.id)
      if (mine === undefined || block === undefined) return null
      return { dx: mine.x - block.x, dy: mine.y - block.y }
    }
    const before = gap()
    run(3)
    const after = gap()

    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(after!.dx).toBeCloseTo(before!.dx, 1)
    expect(after!.dy).toBeCloseTo(before!.dy, 1)
  })

  it('끈적한 것이 없으면 아무것도 붙지 않는다 — 탑 전체가 한 덩어리가 되면 안 된다', () => {
    buildTower()
    expect(weldCount()).toBe(0)
  })

  it('붙어 있어도 빈 받침대 중앙에서는 저절로 떨어지지 않는다', () => {
    for (const item of allVariants().filter((v) => v.sticky)) {
      world.reset()
      world.spawnItem(item, 0, SOLO_OWNER)
      let escaped = 0
      for (let t = 0; t < 5; t += 1 / 60) {
        escaped += world.step(1 / 60).escaped.length
      }
      expect(escaped, item.id).toBe(0)
    }
  })

  it('붙은 재료가 합성으로 사라지면 관절 기록도 사라진다', () => {
    /*
     * 관절 자체는 Rapier가 바디와 함께 걷어내지만, 장부를 지우지 않으면 그 짝이
     * 영원히 "이미 붙었다"로 남는다. 핸들은 재사용되므로 나중에 온 물건이
     * 그 자리를 물려받으면 붙어야 할 때 붙지 않는다.
     */
    const recipe = RECIPES.find((item) => {
      const [first, second] = item.inputs
      return first === second && find(first!).sticky
    })
    if (recipe === undefined) throw new Error('끈적한 재료로 만드는 레시피가 없다')

    world.reset()
    const material = find(recipe.inputs[0]!)
    world.spawnItemAt(material, 0, ARENA.platformTop + 0.5, SOLO_OWNER)
    run(1.5)
    const base = world.frames()[0]
    if (base === undefined) throw new Error('재료가 남지 않았다')
    world.spawnItemAt(material, base.x, base.y + 0.35, SOLO_OWNER)
    run(1.5)
    expect(weldCount()).toBeGreaterThan(0)

    const match = findMerge(world.contactGraph(), RECIPES)
    expect(match).not.toBeNull()
    world.mergeItems(match!.itemIds, match!.recipe.result, SOLO_OWNER)
    expect(weldCount()).toBe(0)
  })
})

describe('무게 — 지진은 실제 질량으로 판정한다', () => {
  it('가장 큰 물건은 무거운 축에 든다 — 비행기가 조용하면 눈과 어긋난다', () => {
    expect(massOf(find('airplane'))).toBeGreaterThanOrEqual(HEAVY_MASS)
  })

  it('가장 가벼운 물건은 무거운 축이 아니다', () => {
    expect(massOf(find('leaf'))).toBeLessThan(HEAVY_MASS)
    expect(massOf(find('clover'))).toBeLessThan(HEAVY_MASS)
  })

  it('밀도가 아니라 질량이 순서를 정한다', () => {
    const laptop = find('laptop')
    const tumbler = find('tumbler')
    // 텀블러가 밀도는 훨씬 높지만
    expect(tumbler.density).toBeGreaterThan(laptop.density)
    // 실제로는 노트북이 더 무겁다. 지진 판정도 이쪽을 따라야 한다
    expect(massOf(laptop)).toBeGreaterThan(massOf(tumbler))
    expect(massOf(laptop)).toBeGreaterThanOrEqual(HEAVY_MASS)
  })
})
