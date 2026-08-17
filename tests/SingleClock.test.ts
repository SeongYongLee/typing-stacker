import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { FrameClock } from './helpers/frameClock.ts'

describe('싱글 시계 연출', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('긴 주기로 낮과 밤 배경만 순환하며 점수와 무관하다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      loop: { stop(): void }
      elapsed: number
      emit(): void
    }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(false)
    internals.loop.stop()

    internals.elapsed = 0
    internals.emit()
    let current = state as unknown as GameState
    expect(current.timeOfDay.phase).toBe('day')
    expect(current.timeOfDay.nightfall).toBe(0)

    internals.elapsed = 120
    internals.emit()
    current = state as unknown as GameState
    expect(current.timeOfDay.phase).toBe('night')
    expect(current.timeOfDay.nightfall).toBe(1)

    internals.elapsed = 180
    internals.emit()
    current = state as unknown as GameState
    expect(current.timeOfDay.phase).toBe('day')
    expect(current.stats.score).toBe(0)
    engine.dispose()
  })
})
