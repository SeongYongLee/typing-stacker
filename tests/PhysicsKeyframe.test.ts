import { beforeEach, describe, expect, it } from 'vitest'
import { ARENA } from '../src/game/config.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { VARIANT_BY_ID, WORDS } from '../src/game/data/words.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 권위 키프레임이 **무엇까지 되돌리는가**.
 *
 * 대전은 양쪽이 각자 물리를 돌리고, 턴이 끝날 때 방장이 보낸 키프레임으로 맞춘다.
 * 자리와 회전만 맞추면 되는 줄 알았는데 그렇지 않다 — 끈적한 물건이 만드는 **관절은
 * 구조**라서, 한쪽에만 생기면 자리를 아무리 맞춰도 다음 스텝부터 다시 갈린다.
 */

function stickyVariant(): ItemVariant {
  for (const entry of WORDS) {
    for (const variant of entry.variants) {
      if (variant.sticky === true) {
        return variant
      }
    }
  }
  throw new Error('끈적한 물건이 없다')
}

function anyVariant(): ItemVariant {
  const found = WORDS[0]?.variants[0]
  if (found === undefined) {
    throw new Error('물건이 없다')
  }
  return found
}

let host: PhysicsWorld
let guest: PhysicsWorld

beforeEach(async () => {
  host = await PhysicsWorld.create()
  guest = await PhysicsWorld.create()
})

describe('권위 키프레임', () => {
  it('방장에게 없는 물건은 참가자 쪽에서 사라진다', () => {
    const variant = anyVariant()
    guest.spawnItemAt(variant, 0, ARENA.platformTop + 1, 'p1', 1)
    guest.spawnItemAt(variant, 0.5, ARENA.platformTop + 2, 'p1', 2)
    host.spawnItemAt(variant, 0, ARENA.platformTop + 1, 'p1', 1)

    guest.applyFrames(host.frames(), (id) => VARIANT_BY_ID.get(id))
    expect(guest.frames().map((f) => f.itemId)).toEqual([1])
  })

  it('위치뿐 아니라 속도·잠듦·정착·앵커·이탈 상태를 복원한다', () => {
    const variant = anyVariant()
    const frame = {
      itemId: 9,
      variantId: variant.id,
      owner: 'p1',
      x: 0.2,
      y: ARENA.platformTop + 2,
      rotation: 0.3,
      stateVersion: 1 as const,
      vx: 1.25,
      vy: -0.5,
      angularVelocity: 0.75,
      sleeping: false,
      settled: true,
      anchored: true,
      lost: true,
      settleTimer: 0.31,
      restX: 0.18,
      restY: ARENA.platformTop + 1.9,
      previousSpeed: 1.4,
      dislodged: true,
      impacted: false,
      struck: true,
    }
    guest.applyFrames([frame], (id) => VARIANT_BY_ID.get(id))
    const restored = guest.frames()[0]!
    expect(restored.stateVersion).toBe(1)
    if (restored.stateVersion !== 1) throw new Error('현재 권위 상태가 아니다')
    expect(restored).toMatchObject({
      itemId: frame.itemId, variantId: frame.variantId, owner: frame.owner,
      vx: frame.vx, vy: frame.vy, angularVelocity: frame.angularVelocity,
      sleeping: false, settled: true, anchored: true, lost: true,
      settleTimer: frame.settleTimer,
      restX: frame.restX,
      restY: frame.restY,
      previousSpeed: frame.previousSpeed,
      dislodged: true,
      impacted: false,
      struck: true,
    })
    expect(restored.x).toBeCloseTo(frame.x, 5)
    expect(restored.y).toBeCloseTo(frame.y, 5)
    expect(restored.rotation).toBeCloseTo(frame.rotation, 5)
    expect(guest.snapshots()[0]?.settled).toBe(true)

    const sleeping = { ...frame, sleeping: true, vx: 0, vy: 0, angularVelocity: 0 }
    guest.applyFrames([sleeping], (id) => VARIANT_BY_ID.get(id))
    const asleep = guest.frames()[0]
    expect(asleep?.stateVersion).toBe(1)
    expect(asleep?.stateVersion === 1 && asleep.sleeping).toBe(true)
  })

  it('구형 위치 프레임은 기존 정착·앵커·잠듦 상태를 지우지 않는다', () => {
    const variant = anyVariant()
    host.spawnItemAt(variant, 0, ARENA.platformTop + 0.2, 'p1', 1)
    for (let i = 0; i < 300; i += 1) host.step(1 / 60)
    guest.applyFrames(host.frames(), (id) => VARIANT_BY_ID.get(id))
    const before = guest.frames()[0]!

    guest.applyFrames([{
      itemId: before.itemId,
      variantId: before.variantId,
      owner: before.owner,
      x: before.x + 0.01,
      y: before.y,
      rotation: before.rotation,
    }], (id) => VARIANT_BY_ID.get(id))

    const after = guest.frames()[0]!
    expect(after.stateVersion).toBe(1)
    if (before.stateVersion !== 1 || after.stateVersion !== 1) {
      throw new Error('현재 권위 상태가 아니다')
    }
    expect(after.settled).toBe(before.settled)
    expect(after.anchored).toBe(before.anchored)
    expect(after.sleeping).toBe(before.sleeping)
  })

  it('권위 교정 직후 한 스텝은 가짜 impact를 만들지 않는다', () => {
    const variant = anyVariant()
    guest.spawnItemAt(variant, 0, ARENA.platformTop + 3, 'p1', 1)
    const frame = { ...guest.frames()[0]!, vx: 5, vy: 0, sleeping: false }
    guest.applyFrames([frame], (id) => VARIANT_BY_ID.get(id))
    expect(guest.step(1 / 60).impacts).toHaveLength(0)
  })

  it('방장에게만 있는 물건은 참가자 쪽에 생긴다', () => {
    const variant = anyVariant()
    host.spawnItemAt(variant, 0.3, ARENA.platformTop + 1, 'p1', 7)

    guest.applyFrames(host.frames(), (id) => VARIANT_BY_ID.get(id))
    const made = guest.frames()[0]
    expect(made?.itemId).toBe(7)
    expect(made?.x).toBeCloseTo(0.3, 3)
  })

  /*
   * 여기가 비어 있었다.
   *
   * 끈적함은 매 프레임 접촉을 보고 양쪽이 **각자** 결정한다. 접촉이 잡히는 순간이
   * 한 프레임만 어긋나도 한쪽에만 관절이 생기고, 관절은 한 번 생기면 영구적이다.
   * 자리를 맞춰도 구조가 다르면 다음 스텝부터 탑이 다르게 움직인다 —
   * 사람 눈에는 "블럭 상황이 다르다"로 보인다.
   */
  it('방장에게 없는 관절은 참가자 쪽에서 풀린다', () => {
    const sticky = stickyVariant()
    const other = anyVariant()

    for (const world of [host, guest]) {
      world.spawnItemAt(sticky, 0, ARENA.platformTop + 0.3, 'p1', 1)
      world.spawnItemAt(other, 0, ARENA.platformTop + 0.9, 'p2', 2)
    }

    // 참가자 쪽만 오래 돌려 관절이 생기게 한다
    for (let i = 0; i < 240; i += 1) {
      guest.step(1 / 60)
    }
    expect(guest.debugWeldPairs().length).toBeGreaterThan(0)
    expect(host.debugWeldPairs()).toHaveLength(0)

    guest.applyFrames(host.frames(), (id) => VARIANT_BY_ID.get(id), host.weldPairs())
    expect(guest.debugWeldPairs()).toHaveLength(0)
  })

  it('방장에게 있는 관절은 참가자 쪽에 생긴다', () => {
    const sticky = stickyVariant()
    const other = anyVariant()

    for (const world of [host, guest]) {
      world.spawnItemAt(sticky, 0, ARENA.platformTop + 0.3, 'p1', 1)
      world.spawnItemAt(other, 0, ARENA.platformTop + 0.9, 'p2', 2)
    }
    for (let i = 0; i < 240; i += 1) {
      host.step(1 / 60)
    }
    expect(host.debugWeldPairs().length).toBeGreaterThan(0)

    guest.applyFrames(host.frames(), (id) => VARIANT_BY_ID.get(id), host.weldPairs())
    expect(guest.debugWeldPairs()).toEqual(host.debugWeldPairs())
  })
})
