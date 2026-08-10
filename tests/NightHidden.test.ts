import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIDDEN_CHANCE, OPENING_HIDDEN_CHANCE } from '../src/game/config.ts'
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
 * 눈으로는 거의 안 보이는 고장이다. 밤은 10초뿐이라 그 안의 드롭이 서넛이고, 원래도
 * 히든은 가끔 나오는 것이라 "이번 밤엔 안 나왔네"로 지나간다.
 *
 * **한때 이것을 확률로 쟀다.** 여덟 시드로 2,400 시뮬레이션 초를 굴려 히든이 몇 %로
 * 나오는지 세고 두 값의 중간을 넘는지 봤는데, 시험 하나가 판 전체 시간의 **절반**을
 * 먹었다. 게다가 통계라 자기 표본이 넉넉한지부터 스스로 검사해야 했다.
 *
 * 지금은 `resolveItem`에 **실제로 넘어간 값을 받아 적는다.** 세 국면을 한 판에서
 * 다 보고, 확률이 아니라 값을 그대로 확인하므로 흔들릴 자리가 없다.
 */

/** 엔진이 `resolveItem`에 넘긴 확률을 국면별로 모은다 */
const seam = vi.hoisted(() => ({ byPhase: new Map<string, Set<number>>(), phase: '' }))

vi.mock('../src/game/systems/ItemResolver.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/systems/ItemResolver.ts')>()
  return {
    ...actual,
    resolveItem: (...args: Parameters<typeof actual.resolveItem>) => {
      const seen = seam.byPhase.get(seam.phase) ?? new Set<number>()
      // 안 넘기면 기본값을 쓴다 — 그것도 구분해 적어야 "안 넘겼다"가 드러난다
      seen.add(args[2] ?? Number.NaN)
      seam.byPhase.set(seam.phase, seen)
      return actual.resolveItem(...args)
    },
  }
})

const { GameEngine } = await import('../src/game/core/GameEngine.ts')
type GameState = import('../src/game/core/GameEngine.ts').GameState

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

  describe('엔진이 국면마다 넘기는 확률', () => {
    const clock = new FrameClock()
    beforeEach(() => {
      seam.byPhase = new Map()
      seam.phase = ''
      clock.install()
    })
    afterEach(() => clock.uninstall())

    /**
     * 화면에 뜬 아무 단어나 치며 국면을 따라간다. 판이 끝나면 새로 시작한다 —
     * 밤은 판이 시작하고 한참 뒤에나 오는데 목숨 3개가 그전에 닳는 판이 있다.
     */
    async function play(seed: number, seconds: number): Promise<void> {
      const engine = await GameEngine.create(seed)
      let state: GameState | null = null
      engine.onStateChange((next) => {
        state = next
      })
      engine.startRun()

      for (let t = 0; t < seconds && seam.byPhase.size < 3; t += 0.25) {
        await clock.advance(0.25)
        const now = state as GameState | null
        if (now === null) {
          continue
        }
        if (now.phase === 'over') {
          engine.startRun()
          continue
        }
        const word = now.words.find((item) => item.state === 'active')
        if (word === undefined) {
          continue
        }
        // 제출이 곧 물건을 뽑는 순간이다. 그때의 국면으로 적히게 미리 맞춰둔다
        seam.phase = now.timeOfDay.phase
        engine.submit(word.word)
      }

      engine.dispose()
    }

    it('첫 밤에는 눌러둔 확률로, 그 뒤로는 평소 확률로 굴린다', async () => {
      await play(20260809, 150)

      expect(seam.byPhase.get('firstNight'), '첫 밤에 친 단어가 없다').toEqual(
        new Set([OPENING_HIDDEN_CHANCE]),
      )
      expect(seam.byPhase.get('day'), '낮에 친 단어가 없다').toEqual(new Set([HIDDEN_CHANCE]))
      /*
       * 이 줄이 이 파일의 이유다. `restricted`로 판단하면 여기가 첫 밤의 값이 된다.
       */
      expect(seam.byPhase.get('night'), '밤에 친 단어가 없다').toEqual(new Set([HIDDEN_CHANCE]))
    }, 60_000)
  })
})
