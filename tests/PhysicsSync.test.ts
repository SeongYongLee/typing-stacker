import { beforeAll, describe, expect, it } from 'vitest'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { VARIANT_BY_ID, WORDS } from '../src/game/data/words.ts'
import { SOLO_OWNER } from '../src/game/config.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

function anyVariant(): ItemVariant {
  const found = WORDS[0]?.variants[0]
  if (found === undefined) throw new Error('단어 테이블이 비어있다')
  return found
}

function lookup(id: string): ItemVariant | undefined {
  return VARIANT_BY_ID.get(id)
}

function run(world: PhysicsWorld, seconds: number): void {
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    world.step(dt)
  }
}

/**
 * 방장이 턴 끝에 보내는 권위 키프레임이 게스트에서 그대로 재현되는지.
 * 여기가 어긋나면 두 사람이 서로 다른 스택을 보게 되고 승패 판정이 갈린다.
 */
describe('권위 키프레임', () => {
  let host: PhysicsWorld
  let guest: PhysicsWorld

  beforeAll(async () => {
    host = await PhysicsWorld.create()
    guest = await PhysicsWorld.create()
  })

  it('게스트에 없던 물건이 키프레임으로 생긴다', () => {
    host.reset()
    guest.reset()
    host.spawnItem(anyVariant(), 0, 'plum', 1)
    run(host, 3)

    expect(guest.itemCount).toBe(0)
    guest.applyFrames(host.frames(), lookup)
    expect(guest.itemCount).toBe(1)

    const [hostBody] = host.snapshots()
    const [guestBody] = guest.snapshots()
    expect(guestBody?.owner).toBe('plum')
    expect(guestBody?.variant.id).toBe(hostBody?.variant.id)
    expect(guestBody?.x).toBeCloseTo(hostBody!.x, 5)
    expect(guestBody?.y).toBeCloseTo(hostBody!.y, 5)
    expect(guestBody?.rotation).toBeCloseTo(hostBody!.rotation, 5)
  })

  it('두 번 맞춰도 물건이 늘어나지 않는다 — 같은 핸들은 같은 물건이다', () => {
    host.reset()
    guest.reset()
    host.spawnItem(anyVariant(), 0, 'plum', 1)
    run(host, 2)

    guest.applyFrames(host.frames(), lookup)
    run(host, 2)
    guest.applyFrames(host.frames(), lookup)

    expect(guest.itemCount).toBe(1)
  })

  it('방장에게 없는 물건은 게스트에서도 사라진다 — 방장이 본 것이 사실이다', () => {
    host.reset()
    guest.reset()
    host.spawnItem(anyVariant(), 0, 'plum', 1)
    run(host, 2)
    guest.applyFrames(host.frames(), lookup)
    expect(guest.itemCount).toBe(1)

    // 방장 쪽에서 물건이 사라진 상황(이탈해 화면 밖으로 나감)을 흉내낸다
    host.reset()
    guest.applyFrames(host.frames(), lookup)
    expect(guest.itemCount).toBe(0)
  })

  it('어긋난 상태를 키프레임이 되돌린다', () => {
    host.reset()
    guest.reset()
    const item = anyVariant()
    host.spawnItem(item, 0.4, 'plum', 1)
    guest.spawnItem(item, -0.4, 'plum', 1)
    run(host, 2)
    run(guest, 2)

    const before = guest.snapshots()[0]!
    expect(Math.abs(before.x - host.snapshots()[0]!.x)).toBeGreaterThan(0.1)

    guest.applyFrames(host.frames(), lookup)

    // 같은 itemId이므로 새로 만들지 않고 그 물건을 제자리로 옮긴다
    expect(guest.itemCount).toBe(1)
    expect(guest.snapshots()[0]!.x).toBeCloseTo(host.snapshots()[0]!.x, 5)
  })

  it('모르는 물건 id는 조용히 건너뛴다', () => {
    host.reset()
    guest.reset()
    guest.applyFrames(
      [{
        itemId: 1, variantId: '없는물건', owner: 'plum', x: 0, y: 1, rotation: 0,
      }],
      lookup,
    )
    expect(guest.itemCount).toBe(0)
  })
})

describe('isQuiet — 턴을 넘길 시점', () => {
  let world: PhysicsWorld

  beforeAll(async () => {
    world = await PhysicsWorld.create()
  })

  it('빈 아레나는 조용하다', () => {
    world.reset()
    expect(world.isQuiet()).toBe(true)
  })

  it('떨어지는 중에는 조용하지 않고, 자리를 잡으면 조용해진다', () => {
    world.reset()
    world.spawnItem(anyVariant(), 0, SOLO_OWNER, 1)
    world.step(1 / 60)
    run(world, 0.4)
    expect(world.isQuiet()).toBe(false)

    run(world, 5)
    expect(world.isQuiet()).toBe(true)
  })
})
