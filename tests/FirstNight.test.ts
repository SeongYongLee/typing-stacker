import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DAY_SEC, FIRST_NIGHT_MERGES, FIRST_NIGHT_SEC } from '../src/game/config.ts'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { cycleOf, timeOfDay } from '../src/game/systems/DayNight.ts'
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

    /**
     * **첫 밤에는 벽시계 바늘이 서 있는다.**
     *
     * 길이가 사건으로 정해져 판마다 다른 구간이라, 훑으면 바늘 속도가 판마다 달라져
     * 시계가 시간이 아니라 진행도를 말하는 막대가 된다.
     */
    it('첫 밤에는 시계가 돌지 않는다', () => {
      const at = (elapsed: number) => cycleOf(timeOfDay(elapsed, 20))
      expect(at(0)).toBe(at(5))
      expect(at(5)).toBe(at(19.9))
    })

    /**
     * 세우는 자리는 밤 구간의 끝(해 뜨기 직전)이다. 눈금판이 원이라 1과 0이 같은
     * 자리이므로, 낮이 열려도 바늘이 **튀지 않고** 서 있던 자리에서 이어서 돈다.
     */
    it('낮이 열려도 바늘이 튀지 않는다', () => {
      const before = cycleOf(timeOfDay(19.99, 20))
      const after = cycleOf(timeOfDay(20.01, 20))
      // 1과 0은 같은 각이다 — 원을 한 바퀴 돈 값
      expect(before % 1).toBeCloseTo(after % 1, 2)
    })

    /** 낮과 밤은 시간으로 도므로 그대로 움직인다 */
    it('첫 밤이 끝나면 다시 돈다', () => {
      const day1 = cycleOf(timeOfDay(21, 20))
      const day2 = cycleOf(timeOfDay(26, 20))
      expect(day2).toBeGreaterThan(day1)
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
      let firstNightMerges = 0
      /** 합성이 `FIRST_NIGHT_MERGES`번째가 된 순간 국면이 아직 첫 밤이었는가 */
      let phaseAtLastMerge: string | null = null
      engine.onStateChange((next) => {
        state = next
      })
      engine.onEvent((event: GameEvent) => {
        if (event.kind === 'merge') {
          merges += 1
          if ((state as GameState | null)?.timeOfDay.phase === 'firstNight') {
            firstNightMerges += 1
          }
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
      return { merges, firstNightMerges, leftFirstNightAt, phaseAtLastMerge, elapsed }
    }

    /**
     * 모든 2재료 레시피를 여는 지금은 같은 물건 둘만 내보내던 때처럼 합성 두 번을
     * 통계적으로 보장하지 않는다. 대신 첫 밤 안에 실제 합성 기회가 있고, 두 번에 닿은
     * 판에서는 두 번째 사건이 첫 밤 안에서 일어났는지만 확인한다.
     */
    it('첫 밤 안에 합성 기회를 만든다', async () => {
      const runs = []
      for (const seed of [20260809, 7, 1234, 55, 909, 31]) {
        runs.push(await play(seed, 60))
      }
      expect(runs.some((run) => run.firstNightMerges > 0), '첫 밤에 합성이 한 번도 없다').toBe(true)
      for (const run of runs.filter((item) => item.merges >= FIRST_NIGHT_MERGES)) {
        expect(run.phaseAtLastMerge).toBe('firstNight')
        expect(run.leftFirstNightAt).toBeLessThan(FIRST_NIGHT_SEC)
      }
    }, 120_000)

    /**
     * **상한이 없으면 합성을 못 한 사람이 판 전체를 첫 밤 집중 흐름으로 보낸다.**
     * 모든 조합을 여는 흐름은 같은 물건 둘만 내보내던 방식보다 두 번째 합성이 늦다.
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
