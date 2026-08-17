import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { GameEngine } from '../src/game/core/GameEngine.ts'
import { WORDS } from '../src/game/data/words.ts'
import type { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import type { RecipeFlow } from '../src/game/systems/RecipeFlow.ts'
import type { WordSpawner } from '../src/game/systems/WordSpawner.ts'
import type { GamePhase, ItemVariant } from '../src/game/types/game.ts'
import { FrameClock } from './helpers/frameClock.ts'

describe('GameEngine 레시피 흐름 캐시', () => {
  const clock = new FrameClock()

  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('물건과 단어 구성이 그대로인 프레임에는 재료 개수를 다시 관찰하지 않는다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      loop: { stop(): void }
      physics: PhysicsWorld
      spawner: WordSpawner
      recipeFlow: RecipeFlow
      phase: GamePhase
      whiteboardCandidates: readonly ItemVariant[]
      update(dt: number): void
    }
    engine.startRun(false)
    internals.loop.stop()
    internals.phase = 'playing'

    const candidates = internals.whiteboardCandidates
    const observe = vi.spyOn(internals.recipeFlow, 'observe')

    internals.update(0)
    internals.update(0)
    expect(observe).not.toHaveBeenCalled()
    expect(internals.whiteboardCandidates).toBe(candidates)

    const variant = WORDS[0]?.variants[0]
    if (variant === undefined) throw new Error('단어 테이블이 비어 있다')
    internals.physics.spawnItemAt(variant, 0, ARENA.platformTop + 1, SOLO_OWNER)
    internals.update(0)
    expect(observe).toHaveBeenCalledTimes(1)

    internals.update(0)
    expect(observe).toHaveBeenCalledTimes(1)

    internals.spawner.spawnScripted(WORDS[0]!.word)
    internals.update(0)
    expect(observe).toHaveBeenCalledTimes(2)

    engine.dispose()
  })
})
