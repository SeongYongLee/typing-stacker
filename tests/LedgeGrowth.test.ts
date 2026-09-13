import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/core/GameEngine.ts'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import type { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import type { GameEvent } from '../src/game/types/events.ts'
import { FrameClock } from './helpers/frameClock.ts'

describe('싱글 합성 보상', () => {
  const clock = new FrameClock()
  let engine: GameEngine | undefined
  beforeEach(() => clock.install())
  afterEach(() => { engine?.dispose(); engine = undefined; clock.uninstall() })

  it('실제 재료를 합성해도 추가 발판을 만들지 않는다', async () => {
    engine = await GameEngine.create(1)
    const events: GameEvent[] = []
    engine.onEvent((event) => events.push(event))
    engine.startRun(false)
    // Fix only the initial materials; the normal engine loop performs the merge.
    const { physics } = engine as unknown as { physics: PhysicsWorld }
    const recipe = RECIPES.find((item) => item.inputs.length === 2 && item.inputs[0] === item.inputs[1])!
    const material = VARIANT_BY_ID.get(recipe.inputs[0]!)!
    physics.spawnItemAt(material, 0, ARENA.platformTop + 0.5, SOLO_OWNER)
    await clock.advance(1.5)
    const first = physics.snapshots()[0]!
    physics.spawnItemAt(material, first.x, first.y + 0.35, SOLO_OWNER)
    for (let step = 0; step < 120 && !events.some((event) => event.kind === 'merge'); step++) {
      await clock.advance(1 / 60)
    }
    expect(events.some((event) => event.kind === 'merge'), '실제 합성이 일어나야 한다').toBe(true)
    expect(physics.snapshots().some((body) => body.variant.hidden)).toBe(true)
    expect(physics.ledges()).toHaveLength(0)
  })
})
