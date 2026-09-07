import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { FrameClock } from './helpers/frameClock.ts'
import { soloStage } from '../src/game/data/soloStages.ts'
import type { GameEvent } from '../src/game/types/events.ts'

/**
 * 놓친 단어가 실제로 콤보를 끊는가 — **엔진을 돌려서** 확인한다.
 *
 * `ScoreManager` 단위 테스트는 `onWordMissed()`를 부르면 0이 된다는 것까지만 말한다.
 * 정작 끊어지지 않는 고장은 그 아래가 아니라 **부르는 쪽**에서 난다 — 스포너가
 * 돌려주는 "방금 놓친 것"을 엔진이 흘려버리면 점수 계산은 멀쩡한데 콤보만 안 끊긴다.
 * 그건 눈으로도 잘 안 보인다(콤보는 원래 잘 오르니까).
 */
describe('싱글 — 단어를 놓치면 콤보가 끊긴다', () => {
  const clock = new FrameClock()

  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('맞춰서 올린 콤보가 하나를 놓치는 순간 0이 된다', async () => {
    const engine = await GameEngine.create(20260809)
    let state: GameState | null = null
    engine.onStateChange((next) => {
      state = next
    })

    engine.startRun(false)
    // 시작 안내가 끝난 뒤 첫 단어의 생성 간격만큼 기다린다.
    await clock.advance(2 + soloStage(1).difficulty.spawnInterval)

    const word = (state as GameState | null)?.words[0]
    if (word === undefined) {
      throw new Error('낙하 중인 단어가 없다')
    }
    engine.submit(word.word)
    expect((state as GameState | null)?.stats.combo).toBe(1)

    /*
     * 아무것도 치지 않고 둔다. 낙하 시간이 지나면 화면에 있던 단어가 바닥에 닿는다 —
     * 그 순간이 이 테스트가 보는 자리다.
     */
    const before = (state as GameState | null)?.stats.missedWords ?? 0
    const difficulty = soloStage(1).difficulty
    await clock.advance(difficulty.spawnInterval + difficulty.fallDuration + 0.5)

    const after = state as GameState | null
    expect(after?.stats.missedWords, '단어를 놓친 적이 있어야 한다').toBeGreaterThan(before)
    expect(after?.stats.combo, '놓쳤으면 콤보는 0이다').toBe(0)
    // 최고 기록은 남는다 — 끊긴 것이지 없던 일이 되는 것은 아니다
    expect(after?.stats.maxCombo).toBeGreaterThanOrEqual(1)

    engine.dispose()
  })

  it('맞춰서 올린 콤보가 오타를 제출하는 순간 0이 된다', async () => {
    const engine = await GameEngine.create(20260812)
    let state: GameState | null = null
    engine.onStateChange((next) => {
      state = next
    })

    engine.startRun(false)
    // 시작 안내가 끝난 뒤 첫 단어의 생성 간격만큼 기다린다.
    await clock.advance(2 + soloStage(1).difficulty.spawnInterval)
    const word = (state as GameState | null)?.words[0]
    if (word === undefined) throw new Error('낙하 중인 단어가 없다')

    engine.submit(word.word)
    expect((state as GameState | null)?.stats.combo).toBe(1)
    engine.submit('존재하지않는오타')
    expect((state as GameState | null)?.stage.congestion).toBe(5)
    expect((state as GameState | null)?.stats.combo).toBe(0)
    expect((state as GameState | null)?.stats.maxCombo).toBe(1)

    engine.dispose()
  })

  it.each(['오타', '단어 만료'] as const)('%s로 경보가 100에 도달하면 실제 물건 반입이 시작된다', async (trigger) => {
    const engine = await GameEngine.create(20260907)
    const events: GameEvent[] = []
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.onEvent((event) => { events.push(event) })

    try {
      engine.startRun(false)
      const difficulty = soloStage(1).difficulty
      await clock.advance(2 + difficulty.spawnInterval)
      for (let index = 0; index < 19; index += 1) {
        engine.submit('존재하지않는오타')
      }
      expect((state as GameState | null)?.stage.congestion).toBe(95)
      expect((state as GameState | null)?.stage.congestionRush).toBe(false)

      if (trigger === '오타') {
        engine.submit('존재하지않는오타')
        await clock.advance(0.1)
      } else {
        await clock.advance(difficulty.fallDuration)
      }

      expect((state as GameState | null)?.stage.congestion).toBe(0)
      expect((state as GameState | null)?.stage.congestionRush).toBe(true)
      expect(events.some((event) => event.kind === 'drop' && event.source === 'congestion')).toBe(true)
    } finally {
      engine.dispose()
    }
  })
})
