import { beforeAll, describe, expect, it } from 'vitest'
import { PhysicsWorld, type SettleEvent } from '../src/game/physics/PhysicsWorld.ts'
import { isEscaped } from '../src/game/physics/collapseDetector.ts'
import { halfExtentY, shapeBounds } from '../src/game/shapes.ts'
import { ARENA } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 쌓기 기준 물건 — 넓고 납작하며 마찰이 큰 것을 고른다.
 * 이름으로 찾지 않는 이유는 아트가 교체되면 단어 테이블이 통째로 바뀌기 때문이다.
 */
function stackable(): ItemVariant {
  let best: ItemVariant | null = null
  let bestScore = -Infinity
  for (const entry of WORDS) {
    for (const item of entry.variants) {
      const { hw, hh } = shapeBounds(item.shape)
      const score = item.friction * (hw / hh)
      if (score > bestScore) {
        bestScore = score
        best = item
      }
    }
  }
  if (best === null) throw new Error('단어 테이블이 비어있다')
  return best
}

/** 정체가 상관없을 때 쓰는 아무 물건 */
function anyVariant(): ItemVariant {
  const found = WORDS[0]?.variants[0]
  if (found === undefined) throw new Error('단어 테이블이 비어있다')
  return found
}

/** 프레임 단위로 시뮬레이션을 굴리며 이벤트를 모은다 */
function simulate(
  world: PhysicsWorld,
  seconds: number,
): { settled: SettleEvent[]; escaped: number } {
  const dt = 1 / 60
  const settled: SettleEvent[] = []
  let escaped = 0
  for (let t = 0; t < seconds; t += dt) {
    const result = world.step(dt)
    settled.push(...result.settled)
    escaped += result.escaped
  }
  return { settled, escaped }
}

describe('PhysicsWorld', () => {
  let world: PhysicsWorld

  beforeAll(async () => {
    world = await PhysicsWorld.create()
  })

  it('받침대 가운데로 떨어진 물건은 안정적으로 멈춘다', () => {
    world.reset()
    world.spawnItem(stackable(), 0)
    const { settled, escaped } = simulate(world, 5)

    expect(escaped).toBe(0)
    expect(settled).toHaveLength(1)
    // 받침대 윗면 위에 자기 두께만큼 얹혀 있어야 한다
    const item = stackable()
    const expectedTop = ARENA.platformTop + halfExtentY(item.shape) * 2
    expect(settled[0]!.topY).toBeGreaterThan(ARENA.platformTop)
    expect(settled[0]!.topY).toBeLessThan(expectedTop + 0.2)
  })

  it('받침대 밖으로 떨어진 물건은 이탈로 잡힌다', () => {
    world.reset()
    // 받침대 반폭을 훨씬 넘는 지점
    world.spawnItem(stackable(), ARENA.halfWidth - 0.2)
    const { escaped } = simulate(world, 5)
    expect(escaped).toBe(1)
    // 이탈한 물건은 세계에서 치워진다 — 남겨두면 매 프레임 이탈로 잡혀 목숨이 한꺼번에 날아간다
    expect(world.itemCount).toBe(0)
  })

  it('물건을 여러 개 쌓으면 위로 올라간다', () => {
    world.reset()
    const item = stackable()
    const thickness = halfExtentY(item.shape) * 2
    const heights: number[] = []
    for (let i = 0; i < 4; i += 1) {
      world.spawnItem(item, 0)
      const { settled } = simulate(world, 4)
      expect(settled).toHaveLength(1)
      heights.push(settled[0]!.topY)
    }

    // 매번 더 높아진다고 단정하지 않는다 — 위에서 떨어진 물건이 탑에서 미끄러져
    // 옆에 앉는 것은 정상적인 물리다. 확인할 것은 "쌓여서 올라갔다"는 사실뿐이다.
    expect(world.itemCount).toBe(4)
    expect(Math.max(...heights)).toBeGreaterThan(ARENA.platformTop + thickness * 2)
    for (const height of heights) {
      expect(height).toBeGreaterThan(ARENA.platformTop)
    }
  })

  it('모든 단어의 모든 변형이 실제로 생성되고 멈춘다', () => {
    for (const entry of WORDS) {
      for (const variant of entry.variants) {
        world.reset()
        world.spawnItem(variant, 0)
        const { settled, escaped } = simulate(world, 8)
        expect(escaped, `${variant.id}가 받침대에서 굴러떨어졌다`).toBe(0)
        expect(settled, `${variant.id}가 멈추지 않았다`).toHaveLength(1)
      }
    }
  })

  it('reset은 모든 물건을 치운다', () => {
    world.reset()
    world.spawnItem(stackable(), 0)
    simulate(world, 3)
    expect(world.itemCount).toBe(1)
    world.reset()
    expect(world.itemCount).toBe(0)
    expect(world.snapshots()).toHaveLength(0)
  })

  it('스냅샷은 렌더러가 필요한 값을 모두 담는다', () => {
    world.reset()
    world.spawnItem(anyVariant(), 0.3)
    simulate(world, 1)
    const snapshots = world.snapshots()
    expect(snapshots).toHaveLength(1)
    const snapshot = snapshots[0]!
    expect(snapshot.variant.id).toBe(anyVariant().id)
    expect(Number.isFinite(snapshot.x)).toBe(true)
    expect(Number.isFinite(snapshot.y)).toBe(true)
    expect(Number.isFinite(snapshot.rotation)).toBe(true)
  })
})

describe('isEscaped', () => {
  it('받침대 위 정상 위치는 이탈이 아니다', () => {
    expect(isEscaped(0, ARENA.platformTop + 1)).toBe(false)
  })

  it('이탈선 아래로 내려가면 이탈이다', () => {
    expect(isEscaped(0, ARENA.killY - 0.01)).toBe(true)
  })

  it('좌우 경계를 넘어가면 이탈이다', () => {
    expect(isEscaped(ARENA.halfWidth + 0.01, 3)).toBe(true)
    expect(isEscaped(-ARENA.halfWidth - 0.01, 3)).toBe(true)
  })
})

describe('halfExtentY', () => {
  it('도형별로 중심에서 위쪽 끝까지의 거리를 낸다', () => {
    expect(halfExtentY({ kind: 'circle', radius: 0.3 })).toBe(0.3)
    expect(halfExtentY({ kind: 'box', hw: 0.4, hh: 0.15 })).toBe(0.15)
    expect(halfExtentY({ kind: 'capsule', halfHeight: 0.3, radius: 0.1 })).toBeCloseTo(0.4)
    expect(
      halfExtentY({
        kind: 'polygon',
        points: [
          { x: -0.2, y: -0.1 },
          { x: 0.2, y: -0.1 },
          { x: 0, y: 0.35 },
        ],
      }),
    ).toBeCloseTo(0.35)
  })
})
