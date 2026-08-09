import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HIDDEN_CHANCE, OPENING_HIDDEN_CHANCE } from '../src/game/config.ts'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { WORDS } from '../src/game/data/words.ts'
import { nightEntries } from '../src/game/systems/NightWords.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 밤에는 히든이 마르지 않는다.
 *
 * 국면을 넣기 전에는 밭이 좁혀져 있다는 것이 곧 첫 밤이라는 뜻이었고, 엔진이
 * `spawner.restricted`를 그대로 히든 확률의 기준으로 썼다. 밤에도 밭을 좁히게 되면서
 * (`NightWords.ts`) 그 플래그가 **첫 밤과 밤 둘 다에서 참**이 됐고, 몰아치라고 만든
 * 밤이 오히려 히든이 가장 마르는 구간이 됐다 — 0.34가 0.05로 떨어진다.
 *
 * 눈으로는 거의 안 보이는 고장이다. 밤은 15초뿐이라 그 안의 드롭이 서넛이고, 원래도
 * 히든은 가끔 나오는 것이라 "이번 밤엔 안 나왔네"로 지나간다.
 */
describe('밤의 히든 확률', () => {
  /**
   * 눌러야 할 근거는 "밭이 좁다"가 아니라 **"밭이 전부 히든 보유 단어다"**이다.
   * 첫 밤의 밭은 구조적으로 100%지만(같은 것 둘의 결과물이 곧 그 단어의 히든이다),
   * 밤의 밭은 낮과 다를 것이 없다. 이 전제가 무너지면 위의 판단 자체가 무의미해진다.
   */
  it('밤의 밭은 첫 밤과 달리 히든 보유 단어로만 이루어져 있지 않다', () => {
    const night = nightEntries(WORDS)
    const withHidden = night.filter((entry) => entry.variants.some((v) => v.hidden)).length
    const all = WORDS.filter((entry) => entry.variants.some((v) => v.hidden)).length

    // 밤(26/79)과 낮(37/107)이 거의 같다. 몇 배로 뛰는 것은 첫 밤뿐이다
    expect(withHidden / night.length).toBeLessThan((all / WORDS.length) * 1.5)
  })

  describe('엔진을 돌려서', () => {
    const clock = new FrameClock()
    beforeEach(() => clock.install())
    afterEach(() => clock.uninstall())

    /**
     * 국면마다 히든이 몇 번 나왔는지 센다. 제출 결과(`feedback.hidden`)가 곧 그 드롭의
     * 롤 결과라, 엔진 안쪽을 들추지 않고 밖에서 볼 수 있는 유일한 값이다.
     *
     * 판이 끝나면 새로 시작한다 — 밤은 45초 뒤에나 오는데 목숨 3개가 그전에 닳는 판이
     * 많아서, 한 판만 돌리면 표본이 거의 안 모인다.
     */
    async function rollsInNight(seed: number, seconds: number): Promise<[number, number]> {
      const engine = await GameEngine.create(seed)
      let state: GameState | null = null
      engine.onStateChange((next) => {
        state = next
      })
      engine.startRun()

      let drops = 0
      let hidden = 0
      let seenSeq = -1

      for (let t = 0; t < seconds; t += 0.25) {
        await clock.advance(0.25)
        const now = state as GameState | null
        if (now === null) {
          continue
        }
        if (now.phase === 'over') {
          engine.startRun()
          continue
        }
        if (now.timeOfDay.phase !== 'night') {
          continue
        }
        const word = now.words.find((item) => item.state === 'active')
        if (word !== undefined) {
          engine.submit(word.word)
        }
        const after = state as GameState | null
        const feedback = after?.feedback ?? null
        if (feedback !== null && feedback.ok && feedback.seq !== seenSeq) {
          seenSeq = feedback.seq
          drops += 1
          if (feedback.hidden) {
            hidden += 1
          }
        }
      }

      engine.dispose()
      return [drops, hidden]
    }

    /**
     * **눈에 보이는 히든 비율은 확률 그대로가 아니다.** 히든이 없는 단어를 쳤으면
     * 롤에 걸려도 나올 것이 없으므로, 관측되는 값은 `확률 × 히든 보유 단어 비율`이다.
     * 밤의 밭은 그 비율이 33%라 0.34로 굴려도 11%쯤으로 보인다 — 기대값을 확률에서
     * 그대로 가져오면 고쳐놔도 실패한다(한 번 그렇게 속았다).
     */
    function expectedRate(chance: number): number {
      const night = nightEntries(WORDS)
      const share = night.filter((e) => e.variants.some((v) => v.hidden)).length / night.length
      return chance * share
    }

    it('첫 밤이 아닌 밤에는 평소 확률로 굴린다', async () => {
      let drops = 0
      let hidden = 0
      for (const seed of [20260809, 7, 1234, 55, 909, 31, 4242, 8]) {
        const [d, h] = await rollsInNight(seed, 300)
        drops += d
        hidden += h
      }

      /*
       * 확률을 재는 것이라 표본이 적으면 흔들린다. 가르려는 두 값이 일곱 배 벌어져
       * 있어도, 낮은 쪽이 2%대라 수십 개로는 우연히 넘길 수 있다.
       */
      expect(drops, '밤에 친 단어가 넉넉해야 잴 수 있다').toBeGreaterThan(200)

      const rate = hidden / drops
      const ifBug = expectedRate(OPENING_HIDDEN_CHANCE)
      const ifOk = expectedRate(HIDDEN_CHANCE)
      expect(
        rate,
        `밤 ${drops}드롭 중 히든 ${hidden}개(${(rate * 100).toFixed(1)}%). ` +
          `평소 확률이면 ${(ifOk * 100).toFixed(1)}%, ` +
          `첫 밤의 확률이 새어 들어왔으면 ${(ifBug * 100).toFixed(1)}%다`,
      ).toBeGreaterThan((ifBug + ifOk) / 2)
    }, 120_000)
  })
})
