import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DAY_SEC, FIRST_NIGHT_MERGES, FIRST_NIGHT_SEC } from '../src/game/config.ts'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { timeOfDay } from '../src/game/systems/DayNight.ts'
import { FrameClock } from './helpers/frameClock.ts'
import type { GameEvent } from '../src/game/types/events.ts'

/**
 * 첫 밤은 **시간이 아니라 사건**으로 끝난다.
 *
 * 목적이 "합성이라는 것이 있다"를 알리는 것이므로 알린 그 순간이 끝나는 지점이다.
 * 시간으로 끊으면 느린 사람은 배우기 전에 풀리고 빠른 사람은 이미 아는 것을 계속 본다 —
 * 15초로 끊었을 때 첫 합성에 닿는 판이 **73%**뿐이었다.
 */
describe('첫 밤은 합성으로 끝난다', () => {
  describe('timeOfDay — 끝나는 시각을 밖에서 받는다', () => {
    /**
     * 이 함수가 직접 세면 상태를 들게 되어 "같은 시각이면 늘 같은 답"이 깨진다.
     * 그 성질이 있어야 화면·시계·밭이 서로 다른 곳에서 물어봐도 답이 갈리지 않는다.
     */
    it('넘긴 시각까지가 첫 밤이다', () => {
      expect(timeOfDay(9.9, 10).phase).toBe('firstNight')
      expect(timeOfDay(10, 10).phase).toBe('day')
      expect(timeOfDay(10 + DAY_SEC - 0.1, 10).phase).toBe('day')
      expect(timeOfDay(10 + DAY_SEC, 10).phase).toBe('night')
    })

    it('첫 밤이 짧아지면 낮과 밤이 그만큼 앞당겨진다', () => {
      const early = timeOfDay(10 + DAY_SEC, 10)
      const late = timeOfDay(30 + DAY_SEC, 30)
      expect(early.phase).toBe('night')
      expect(late.phase).toBe('night')
      // 같은 국면의 같은 지점이라 진행도도 같다
      expect(early.progress).toBeCloseTo(late.progress, 6)
    })

    /** 넘기지 않으면 상한이 곧 길이다. 기존 호출부가 그대로 돌아야 한다 */
    it('안 넘기면 상한을 쓴다', () => {
      expect(timeOfDay(FIRST_NIGHT_SEC - 0.1).phase).toBe('firstNight')
      expect(timeOfDay(FIRST_NIGHT_SEC).phase).toBe('day')
    })

    /** 사건으로 정해지는 값이라 이론상 0이 올 수 있다. 나누기가 무너지면 안 된다 */
    it('0이 와도 무너지지 않는다', () => {
      const at = timeOfDay(5, 0)
      expect(Number.isFinite(at.progress)).toBe(true)
      expect(at.phase).not.toBe('firstNight')
    })
  })

  describe('엔진을 돌려서', () => {
    const clock = new FrameClock()
    beforeEach(() => clock.install())
    afterEach(() => clock.uninstall())

    /** 화면에 뜬 아무 단어나 치는 봇. 판이 실제로 굴러가야 합성이 일어난다 */
    async function play(seed: number, seconds: number) {
      const engine = await GameEngine.create(seed)
      let state: GameState | null = null
      let merges = 0
      /** 합성이 `FIRST_NIGHT_MERGES`번째가 된 순간 국면이 아직 첫 밤이었는가 */
      let phaseAtLastMerge: string | null = null
      engine.onStateChange((next) => {
        state = next
      })
      engine.onEvent((event: GameEvent) => {
        if (event.kind === 'merge') {
          merges += 1
          if (merges === FIRST_NIGHT_MERGES) {
            phaseAtLastMerge = (state as GameState | null)?.timeOfDay.phase ?? null
          }
        }
      })
      engine.startRun()

      let leftFirstNightAt = -1
      let elapsed = 0
      for (; elapsed < seconds; elapsed += 0.25) {
        await clock.advance(0.25)
        const now = state as GameState | null
        if (now === null) {
          continue
        }
        if (now.phase === 'over') {
          break
        }
        if (leftFirstNightAt < 0 && now.timeOfDay.phase !== 'firstNight') {
          leftFirstNightAt = elapsed
        }
        const word = now.words.find((item) => item.state === 'active')
        if (word !== undefined) {
          engine.submit(word.word)
        }
      }
      engine.dispose()
      return { merges, leftFirstNightAt, phaseAtLastMerge, elapsed }
    }

    /**
     * 합성 두 번이 일어나면 그 자리에서 첫 밤이 끝난다.
     *
     * 상한(35초)보다 **한참 앞**이어야 한다 — 상한에 걸려서 끝난 것이면 사건으로
     * 끊은 것이 아니라 시간으로 끊은 것이고, 이 변경이 아무 일도 안 한 셈이다.
     */
    it('합성 두 번이면 상한보다 훨씬 일찍 끝난다', async () => {
      const early: number[] = []
      for (const seed of [20260809, 7, 1234, 55, 909, 31]) {
        const result = await play(seed, 60)
        if (result.merges >= FIRST_NIGHT_MERGES && result.leftFirstNightAt >= 0) {
          early.push(result.leftFirstNightAt)
        }
      }
      expect(early.length, '합성 두 번에 닿은 판이 없다').toBeGreaterThan(0)
      const median = [...early].sort((a, b) => a - b)[Math.floor(early.length / 2)] ?? 0
      expect(median, `첫 밤이 끝난 시각 중앙값 ${median}초`).toBeLessThan(FIRST_NIGHT_SEC)
    }, 120_000)

    /**
     * **상한이 없으면 합성을 못 한 사람이 판 전체를 밭 둘짜리로 보낸다.**
     * 봇으로는 97%가 두 번을 해내지만 사람은 오타와 놓침이 있어 더 낮다.
     */
    it('아무것도 안 치면 상한에서 끝난다', async () => {
      const engine = await GameEngine.create(20260809)
      let state: GameState | null = null
      engine.onStateChange((next) => {
        state = next
      })
      engine.startRun()

      await clock.advance(FIRST_NIGHT_SEC - 1)
      expect((state as GameState | null)?.timeOfDay.phase, '상한 전').toBe('firstNight')

      await clock.advance(2)
      expect((state as GameState | null)?.timeOfDay.phase, '상한 뒤').not.toBe('firstNight')

      engine.dispose()
    }, 60_000)
  })
})
