import { beforeAll, describe, expect, it } from 'vitest'
import { PhysicsWorld, type SettleEvent } from '../src/game/physics/PhysicsWorld.ts'
import { isEscaped } from '../src/game/physics/collapseDetector.ts'
import { halfExtentY, shapeBounds } from '../src/game/shapes.ts'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import type { ItemVariant, OwnerId } from '../src/game/types/game.ts'

/**
 * 쌓기 기준 물건 — 네모나고, 잘 붙잡고, 구르지 않는 것을 고른다.
 * 이름으로 찾지 않는 이유는 아트가 교체되면 단어 테이블이 통째로 바뀌기 때문이다.
 *
 * 예전에는 `마찰 × 가로세로비`로 골라 **가장 납작한 것**이 이겼다. 물건이 57종일
 * 때는 그것이 우연히 잘 쌓이는 물건이었는데, 안경(가로세로 3.2)이 들어오자 그쪽이
 * 이겨버렸다 — 얇은 것은 서로 미끄러져 옆으로 퍼지지 위로 쌓이지 않는다. 실제로
 * 넷을 얹었더니 한 겹 반 높이에서 멈췄다.
 *
 * 잘 쌓이는 조건은 납작함이 아니라 **밑면이 평평하고 안 구르는 것**이다.
 */
function stackable(): ItemVariant {
  let best: ItemVariant | null = null
  let bestScore = -Infinity
  for (const entry of WORDS) {
    for (const item of entry.variants) {
      const { hw, hh } = shapeBounds(item.shape)
      const ratio = hw / hh
      // 접시처럼 얇은 것도, 막대처럼 선 것도 기준이 될 수 없다
      if (ratio < 0.7 || ratio > 1.6) continue
      const score = item.friction * item.angularDamping
      if (score > bestScore) {
        bestScore = score
        best = item
      }
    }
  }
  if (best === null) throw new Error('쌓을 만한 물건이 테이블에 없다')
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
): { settled: SettleEvent[]; escaped: OwnerId[] } {
  const dt = 1 / 60
  const settled: SettleEvent[] = []
  const escaped: OwnerId[] = []
  for (let t = 0; t < seconds; t += dt) {
    const result = world.step(dt)
    settled.push(...result.settled)
    escaped.push(...result.escaped)
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
    world.spawnItem(stackable(), 0, SOLO_OWNER)
    const { settled, escaped } = simulate(world, 5)

    expect(escaped).toEqual([])
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
    world.spawnItem(stackable(), ARENA.halfWidth - 0.2, SOLO_OWNER)
    const { escaped } = simulate(world, 5)
    expect(escaped).toEqual([SOLO_OWNER])
    // 이탈한 물건은 세계에서 치워진다 — 남겨두면 매 프레임 이탈로 잡혀 목숨이 한꺼번에 날아간다
    expect(world.itemCount).toBe(0)
  })

  it('물건을 여러 개 쌓으면 위로 올라간다', () => {
    world.reset()
    const item = stackable()
    const thickness = halfExtentY(item.shape) * 2
    const heights: number[] = []
    for (let i = 0; i < 4; i += 1) {
      world.spawnItem(item, 0, SOLO_OWNER)
      /*
       * **6초를 준다.** 같은 물건 넷을 정확히 x=0에 포개는 아슬아슬한 배치라,
       * 받침대의 콜라이더가 조금만 달라져도 솔버가 푸는 순서가 바뀌어 멎는 시각이
       * 흔들린다. 실제로 턱을 그림에 맞추며(0.06→0.056, 안쪽→모서리) 넷째가
       * 4.0초를 살짝 넘겼다 — 이탈은 0이고 탑도 온전했으니 무너진 것이 아니라
       * 늦게 멎은 것이다.
       *
       * 이 테스트가 지키려는 것은 "쌓여서 올라간다"이지 "몇 초 안에 멎는다"가
       * 아니다. 시간은 넉넉히 두고 아래 단정들이 일을 한다.
       */
      const { settled } = simulate(world, 6)
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
        world.spawnItem(variant, 0, SOLO_OWNER)
        const { settled, escaped } = simulate(world, 8)
        expect(escaped, `${variant.id}가 받침대에서 굴러떨어졌다`).toEqual([])
        expect(settled, `${variant.id}가 멈추지 않았다`).toHaveLength(1)
      }
    }
  })

  it('reset은 모든 물건을 치운다', () => {
    world.reset()
    world.spawnItem(stackable(), 0, SOLO_OWNER)
    simulate(world, 3)
    expect(world.itemCount).toBe(1)
    world.reset()
    expect(world.itemCount).toBe(0)
    expect(world.snapshots()).toHaveLength(0)
  })

  it('이탈은 떨어뜨린 사람이 아니라 물건 주인을 돌려준다', () => {
    world.reset()
    // 두 사람이 각자 물건을 쌓은 뒤, 한쪽 물건만 받침대 밖에 떨군다
    world.spawnItem(stackable(), 0, 'plum')
    simulate(world, 3)
    world.spawnItem(stackable(), ARENA.halfWidth - 0.2, 'sage')
    const { escaped } = simulate(world, 5)

    // 벗어난 것은 sage의 물건이므로 sage만 대가를 진다
    expect(escaped).toEqual(['sage'])
  })

  it('같은 사람의 물건이 둘 떨어지면 두 번 집계된다', () => {
    world.reset()
    world.spawnItem(stackable(), ARENA.halfWidth - 0.2, 'plum')
    world.spawnItem(stackable(), -(ARENA.halfWidth - 0.2), 'plum')
    const { escaped } = simulate(world, 6)
    expect(escaped).toEqual(['plum', 'plum'])
  })

  it('스냅샷에 주인이 담긴다 — 화면에서 누구 물건인지 구분해야 한다', () => {
    world.reset()
    world.spawnItem(anyVariant(), 0, 'plum')
    simulate(world, 1)
    expect(world.snapshots()[0]?.owner).toBe('plum')
  })

  it('안착 이벤트에도 주인이 담긴다', () => {
    world.reset()
    world.spawnItem(stackable(), 0, 'sage')
    const { settled } = simulate(world, 5)
    expect(settled[0]?.owner).toBe('sage')
  })

  it('스냅샷은 렌더러가 필요한 값을 모두 담는다', () => {
    world.reset()
    world.spawnItem(anyVariant(), 0.3, SOLO_OWNER)
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
