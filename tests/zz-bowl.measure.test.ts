import { describe, expect, it } from 'vitest'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { WORDS } from '../src/game/data/words.ts'
import { createRng } from '../src/game/systems/Rng.ts'

/**
 * 그릇 턱의 값어치는 **무너질 때** 드러난다.
 *
 * 가장자리에 한 번 떨구는 것만 재면 턱이 있으나 없으나 비슷하다 — 대부분의 물건은
 * 어디에 떨궈도 그냥 얹히기 때문이다. 턱이 하는 일은 쌓다가 옆으로 밀려난 것을
 * 받아내는 것이라, 탑을 실제로 쌓아 올리며 **몇 개가 남는지**를 봐야 한다.
 */
const POOL = WORDS.flatMap((word) => word.variants)

describe('그릇 턱 — 쌓다가 남는 개수', () => {
  it('봇으로 잰다', async () => {
    const world = await PhysicsWorld.create()
    const seeds = [1, 7, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987]
    let keptSum = 0
    let heightSum = 0

    for (const seed of seeds) {
      const rng = createRng(seed)
      world.reset()
      for (let i = 0; i < 18; i += 1) {
        // 가운데를 노리되 사람처럼 조금 어긋난다
        const x = (rng.next() - 0.5) * 1.2
        world.spawnItemAt(rng.pick(POOL), x, ARENA.spawnY, SOLO_OWNER)
        for (let t = 0; t < 1.1; t += 1 / 60) {
          world.step(1 / 60)
        }
      }
      for (let t = 0; t < 2; t += 1 / 60) {
        world.step(1 / 60)
      }
      keptSum += world.itemCount
      heightSum += Math.max(world.stackTop() - ARENA.platformTop, 0)
    }

    console.log(
      `덮개(바깥 ${ARENA.bowlFlap.outerY}m) · 18개씩 ${seeds.length}판 → ` +
        `남은 물건 ${(keptSum / seeds.length).toFixed(1)}개 · ` +
        `높이 ${(heightSum / seeds.length).toFixed(2)}m`,
    )
    expect(keptSum).toBeGreaterThan(0)
    world.dispose()
  }, 180_000)
})
