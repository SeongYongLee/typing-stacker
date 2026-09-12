import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import type { GamePhase } from '../src/game/types/game.ts'
import { FrameClock } from './helpers/frameClock.ts'

describe('싱글 콤보 경보 회복', () => {
  const clock = new FrameClock()
  let engine: GameEngine
  let state: GameState

  beforeEach(async () => {
    clock.install()
    engine = await GameEngine.create(20260907)
    engine.onStateChange((next) => { state = next })
    engine.startRun(false)
  })
  afterEach(() => {
    engine.dispose()
    clock.uninstall()
  })

  function prepare(combo: number, congestion: number) {
    const internals = engine as unknown as {
      loop: { stop(): void }
      phase: GamePhase
      congestion: number
      score: { onWordMatched(word: string): void }
      spawner: { spawnScripted(word: string): void }
    }
    internals.loop.stop()
    internals.phase = 'playing'
    internals.congestion = congestion
    for (let index = 0; index < combo; index += 1) internals.score.onWordMatched('책')
    internals.spawner.spawnScripted('책')
    return internals
  }

  it.each([
    [0, 2], [3, 2], [4, 3], [8, 3], [9, 4], [99, 4],
  ])('%i콤보에서 다음 성공은 경보를 %i만큼 낮춘다', (previousCombo, recovery) => {
    prepare(previousCombo, 40)
    engine.submit('책')
    expect(state.stats.combo).toBe(previousCombo + 1)
    expect(state.stage.congestion).toBe(40 - recovery)
    expect(state.stage.congestionRecovery).toEqual({ amount: recovery, combo: previousCombo + 1 >= 5 })
    expect(state.stage.congestionRecoverySeq).toBe(1)
  })

  it('고콤보라도 오타가 나면 다음 정상 입력은 기본 회복량으로 돌아간다', () => {
    prepare(20, 40)
    engine.submit('존재하지않는오타')
    expect(state.stats.combo).toBe(0)
    expect(state.stage.congestion).toBe(45)
    engine.submit('책')
    expect(state.stats.combo).toBe(1)
    expect(state.stage.congestion).toBe(43)
    expect(state.stage.congestionRecovery).toEqual({ amount: 2, combo: false })
  })

  it('남은 경보만 회복하고 초과 회복량은 다음 실수에 이월하지 않는다', () => {
    prepare(9, 1)
    engine.submit('책')
    expect(state.stage.congestion).toBe(0)
    expect(state.stage.congestionRecovery).toEqual({ amount: 1, combo: true })
    engine.submit('존재하지않는오타')
    expect(state.stage.congestion).toBe(5)
    expect(state.stage.congestionRecovery).toBeNull()
  })

  it('경보가 이미 0이면 고콤보 성공에도 회복 연출을 만들지 않는다', () => {
    prepare(20, 0)
    engine.submit('책')
    expect(state.stage.congestion).toBe(0)
    expect(state.stage.congestionRecoverySeq).toBe(0)
    expect(state.stage.congestionRecovery).toBeNull()
  })
})
