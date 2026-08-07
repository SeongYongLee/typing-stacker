import { beforeAll, describe, expect, it } from 'vitest'
import { ARENA, HEAVY_MASS, SOLO_OWNER } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 끈적함과 무게가 실제로 다르게 움직이는지 잰다.
 *
 * 값을 바꿔놓고 "성격을 줬다"고 말하기는 쉽다. 그러나 마찰만 올리면 물리 엔진이
 * 두 물건의 마찰을 평균내면서 희석돼 실제로는 거의 달라지지 않는다.
 * 그래서 숫자가 아니라 **결과**를 본다.
 */

function allVariants(): readonly ItemVariant[] {
  return WORDS.flatMap((entry) => entry.variants)
}

function find(id: string): ItemVariant {
  const found = allVariants().find((item) => item.id === id)
  if (found === undefined) throw new Error(`없는 변형: ${id}`)
  return found
}

/** 부딪히는 쪽으로 쓸 무거운 물건 */
const HEAVY = find('bento')

let world: PhysicsWorld

beforeAll(async () => {
  world = await PhysicsWorld.create()
})

/**
 * 자리를 잡은 뒤 무거운 것에 부딪혔을 때 얼마나 밀려나는가.
 *
 * 처음에는 비탈에서 흘러내린 거리를 쟀는데 끈적한 쪽과 보통 쪽이 소수점 셋째 자리까지
 * 같았다. 이 중력과 이 모양들에서는 애초에 미끄러져 자리를 잃는 일이 드물기 때문이다.
 * 실제로 물건을 자리에서 떼어내는 것은 부딪힘이고, 끈적함이 막는 것도 그쪽이다.
 */
function knockDistance(item: ItemVariant): number {
  world.reset()
  world.spawnItemAt(item, 0, ARENA.platformTop + 0.4, SOLO_OWNER)
  for (let t = 0; t < 3; t += 1 / 60) world.step(1 / 60)

  const before = world.frames().find((frame) => frame.variantId === item.id)
  if (before === undefined) throw new Error(`${item.id}가 받침대에 남지 않았다`)

  // 무거운 것을 옆에서 떨어뜨려 친다
  world.spawnItem(HEAVY, before.x + 0.35, SOLO_OWNER)
  for (let t = 0; t < 4; t += 1 / 60) world.step(1 / 60)

  const after = world.frames().find((frame) => frame.variantId === item.id)
  // 아예 밀려나 사라졌으면 가장 크게 밀린 것으로 친다
  if (after === undefined) return Infinity
  return Math.hypot(after.x - before.x, after.y - before.y)
}

/** 콜라이더를 붙인 뒤라야 실제 질량이 나온다 */
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

/** 같은 물건에서 끈적함만 끈 사본. 모양이 변수가 되지 않게 한다 */
function withoutSticky(item: ItemVariant): ItemVariant {
  return { ...item, id: `${item.id}-plain`, sticky: false, friction: 0.75 }
}

describe('끈적함', () => {
  it('끈적한 물건이 하나 이상 있다', () => {
    expect(allVariants().filter((item) => item.sticky).length).toBeGreaterThan(0)
  })

  it('끈적한 물건은 마찰 바닥값을 보장받는다 — 말과 동작이 어긋나면 안 된다', () => {
    for (const item of allVariants().filter((v) => v.sticky)) {
      expect(item.friction, item.id).toBeGreaterThanOrEqual(1.8)
    }
  })

  it('부딪혀도 끈적한 쪽이 훨씬 덜 밀린다', () => {
    /*
     * 이 게임에서 물건이 자리를 잃는 것은 미끄러져서가 아니라 부딪혀서다.
     * 그래서 흘러내린 거리가 아니라 **밀려난 거리**를 잰다. 같은 물건에서
     * 끈적함만 껐다 켜므로 모양이 결과를 가르지 않는다.
     *
     * 이미 무거운 물건은 끈적하지 않아도 잠기므로 여기서 빠진다 —
     * 피자 한판이 그렇다(질량 0.526 >= HEAVY_MASS).
     */
    const light = allVariants().filter((v) => v.sticky && massOf(v) < HEAVY_MASS)
    expect(light.length).toBeGreaterThan(0)

    for (const item of light) {
      const stuck = knockDistance(item)
      const loose = knockDistance(withoutSticky(item))
      expect(loose / stuck, item.id).toBeGreaterThan(2)
    }
  })

  it('끈적해도 빈 받침대 중앙에서 저절로 떨어지지 않는다', () => {
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
