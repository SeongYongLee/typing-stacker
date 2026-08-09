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

/**
 * 두 칸짜리 탑을 세우고 맨 위 칸을 돌려준다.
 *
 * 둘째 칸을 얹는 높이는 **블록 크기에서 낸다.** 예전에는 0.45를 그냥 썼는데 도시락
 * 높이가 0.76이라 겹친 채로 생겨났고, Rapier가 그 겹침을 풀며 둘을 밀어냈다 —
 * 대개는 버텼지만 그림을 다시 그려 도형이 조금 바뀌자 탑이 받침대 밖으로
 * 미끄러져 나가기 시작했다. 겹치지 않게 얹으면 밀어낼 것이 없다.
 */
function buildTower() {
  world.reset()
  world.spawnItemAt(BLOCK, 0, ARENA.platformTop + 0.4, SOLO_OWNER)
  run(2)
  const first = world.frames()[0]
  if (first === undefined) throw new Error('탑이 서지 않았다')
  world.spawnItemAt(BLOCK, first.x, first.y + BLOCK.artBounds.hh * 2 + 0.02, SOLO_OWNER)
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

  /**
   * 문턱이 0.08인 이유는 **웅크린 달팽이 하나** 때문이다. 재보면 이렇다.
   *
   * | 물건 | 흘러내린 거리(m) |
   * |---|---|
   * | 달팽이 | 0.008 |
   * | 문어소시지 | -0.009 |
   * | 고무장갑 | -0.008 |
   * | **웅크린 달팽이** | **0.053** |
   *
   * 웅크린 달팽이만 껍데기가 둥글어 **닿기 전까지 구르는 것이 의도**다
   * (`angularDamping: 0.5`, `friction: 0.5`). 붙기 직전의 그 구름이 5cm쯤 되는데,
   * 제 몸 크기(0.56)의 10분의 1이라 "매달린다"를 깨지 않는다. 그림을 다시 그리면
   * 이 값이 조금씩 움직이므로(0.05 → 0.053) 여유를 두고 끊는다.
   */
  it('받쳐주는 것이 없는 옆면에 닿아도 그 자리에 매달린다', () => {
    for (const item of allVariants().filter((v) => v.sticky)) {
      expect(dropFromContact(item), item.id).toBeLessThan(0.08)
    }
  })

  it('끈적함을 끄면 붙지 않는다 — 모양 덕이 아님을 보인다', () => {
    /*
     * 처음에는 "끄면 흘러내린다"로 잰 높이를 비교했는데, 물건이 탑 위에 얹힐지
     * 옆으로 굴러떨어질지는 우연이 크게 좌우해서 물건 하나만 늘어도 결과가 뒤집혔다.
     * 갈리는 지점은 붙었느냐 아니냐이므로 그것을 직접 본다.
     */
    for (const item of allVariants().filter((v) => v.sticky)) {
      const top = buildTower()
      world.spawnItemAt(withoutSticky(item), top.x + 0.5, top.y, SOLO_OWNER)
      run(0.6)
      expect(weldCount(), item.id).toBe(0)
    }
  })

  it('끈적하면 닿는 순간 붙는다', () => {
    for (const item of allVariants().filter((v) => v.sticky)) {
      const top = buildTower()
      world.spawnItemAt(item, top.x + 0.5, top.y, SOLO_OWNER)
      run(0.6)
      expect(weldCount(), item.id).toBeGreaterThan(0)
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

describe('stackTop — 카메라가 보는 높이', () => {
  it('낙하 중인 물건은 세지 않는다 — 세면 물건마다 화면이 출렁인다', () => {
    world.reset()
    const before = world.stackTop()
    // 방금 스폰된 물건은 스폰 높이(4.6)에 떠 있다
    world.spawnItem(BLOCK, 0, SOLO_OWNER)
    run(0.2)
    expect(world.stackTop()).toBe(before)
  })

  it('자리를 잡으면 그때 올라간다', () => {
    world.reset()
    world.spawnItem(BLOCK, 0, SOLO_OWNER)
    run(4)
    expect(world.stackTop()).toBeGreaterThan(ARENA.platformTop)
  })

  it('빈 받침대에서는 받침대 윗면이다', () => {
    world.reset()
    expect(world.stackTop()).toBe(ARENA.platformTop)
  })

  it('쌓을수록 높아진다', () => {
    world.reset()
    world.spawnItemAt(BLOCK, 0, ARENA.platformTop + 0.4, SOLO_OWNER)
    run(2.5)
    const one = world.stackTop()
    const base = world.frames()[0]
    if (base === undefined) throw new Error('받침이 남지 않았다')
    // 물건 높이만큼 확실히 띄워야 옆으로 밀려나지 않고 위에 얹힌다
    world.spawnItemAt(BLOCK, base.x, base.y + BLOCK.artBounds.hh * 2 + 0.1, SOLO_OWNER)
    run(2.5)
    expect(world.stackTop()).toBeGreaterThan(one)
  })
})

/** 물리층이 이 물건을 어떻게 분류했는지 */
function classify(item: ItemVariant): { heavy: boolean; shakes: boolean } {
  world.reset()
  world.spawnItem(item, 0, SOLO_OWNER)
  const internals = world as unknown as {
    tracked: Map<number, { heavy: boolean; shakes: boolean }>
  }
  const entry = [...internals.tracked.values()][0]
  if (entry === undefined) throw new Error('물건이 생기지 않았다')
  return { heavy: entry.heavy, shakes: entry.shakes }
}

describe('흔들림 — 무겁고 커 보이는 것만 흔든다', () => {
  it('가장 큰 물건은 흔든다 — 비행기가 조용하면 눈과 어긋난다', () => {
    expect(classify(find('airplane')).shakes).toBe(true)
  })

  it('작고 조밀한 것은 흔들지 않는다 — 무게만 보면 눈과 어긋난다', () => {
    // 도시락은 **가장 무거운** 물건이지만 그림이 작다
    expect(massOf(find('bento'))).toBeGreaterThan(massOf(find('airplane')))
    expect(classify(find('bento')).shakes).toBe(false)
    expect(classify(find('tumbler')).shakes).toBe(false)
  })

  it('작아도 무거우면 자리를 잡고 잠긴다 — 흔들림과 잠금은 다른 문제다', () => {
    expect(classify(find('bento')).heavy).toBe(true)
    expect(classify(find('tumbler')).heavy).toBe(true)
  })

  it('크기만 커서는 흔들지 못한다', () => {
    // 우산은 비행기 다음으로 크지만 가볍다
    const umbrella = find('umbrella')
    expect(umbrella.artBounds.hw * 2).toBeGreaterThan(0.78)
    expect(classify(umbrella).shakes).toBe(false)
  })

  it('가벼운 물건은 어느 쪽도 아니다', () => {
    for (const id of ['leaf', 'clover']) {
      expect(classify(find(id)), id).toEqual({ heavy: false, shakes: false })
    }
  })
})

describe('무게 — 지진은 실제 질량으로 판정한다', () => {
  it('가장 큰 물건은 무거운 축에 든다', () => {
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
