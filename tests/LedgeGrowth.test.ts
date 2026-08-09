import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { LEDGE } from '../src/game/config.ts'
import type { GameEvent } from '../src/game/types/events.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 합성하면 통나무가 실제로 서는가.
 *
 * 규칙(`tests/Ledge.test.ts`)과 따로 두는 이유는 **이어져 있는지**가 따로 깨지기
 * 때문이다. 실제로 그랬다 — 규칙 테스트는 다 통과하는데 판에서는 판 중반부터
 * 통나무가 서지 않았다. 자리를 한 높이에서만 찾아서, 탑이 자라면 평균 높이가 곧
 * 탑의 허리라 통나무 안쪽 끝이 늘 탑에 닿았다.
 */
describe('합성하면 통나무가 선다', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('첫 합성에 하나가 서고, 연출이 끝난 뒤에 선다', async () => {
    const engine = await GameEngine.create(7919)
    const events: GameEvent[] = []
    let state: GameState | null = null
    engine.onEvent((event) => events.push(event))
    engine.onStateChange((next) => {
      state = next
    })
    engine.startRun()

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
    // 뭉쳐지는 동안에는 아직 없다 — 보이지 않는 통나무가 물건을 받으면 안 된다
    expect(engine.debugLedges()).toHaveLength(0)

    for (let t = 0; t < LEDGE.formSec + 0.3; t += STEP) {
      await clock.advance(STEP)
    }
    const ledges = engine.debugLedges()
    expect(ledges).toHaveLength(1)
    expect(ledges[0]!.halfWidth).toBeGreaterThanOrEqual(LEDGE.minHalfWidth)

    engine.dispose()
  }, 120_000)
})
