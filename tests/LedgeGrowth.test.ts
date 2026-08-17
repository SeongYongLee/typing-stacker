import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import type { GameEvent } from '../src/game/types/events.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 싱글 합성은 점수와 도감 보상만 준다. 추가 발판은 대전 전용 규칙이다.
 */
describe('싱글 합성 보상', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('합성해도 추가 발판을 만들지 않는다', async () => {
    const engine = await GameEngine.create(1)
    const events: GameEvent[] = []
    let state: GameState | null = null
    engine.onEvent((event) => events.push(event))
    engine.onStateChange((next) => {
      state = next
    })
    engine.startRun()
    // 합성 자체는 튜토리얼을 지난 정식 스테이지에서 확인한다.
    const internals = engine as unknown as {
      stageId: number
      physics: { reset(): void; ledges(): readonly unknown[] }
      spawner: { reset(): void }
      configureStage(): void
    }
    internals.stageId = 1
    internals.physics.reset()
    internals.spawner.reset()
    internals.configureStage()

    const STEP = 1 / 30
    let merged = false
    for (let t = 0; t < 120 && !merged; t += STEP) {
      await clock.advance(STEP)
      const now = state as GameState | null
      if (now === null || now.phase === 'over') break
      merged = events.some((event) => event.kind === 'merge')
      if (merged) break
      if (Math.abs(now.aimNormalized) > 0.08) continue
      const target = now.words.find((word) => word.state === 'active')
      if (target !== undefined) engine.submit(target.word)
    }

    expect(merged, '판 안에 합성이 한 번은 일어나야 한다').toBe(true)
    expect(internals.physics.ledges()).toHaveLength(0)

    engine.dispose()
  }, 120_000)
})
