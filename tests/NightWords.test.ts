import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIRST_NIGHT_SEC, DAY_SEC, NIGHT_SEC } from '../src/game/config.ts'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { INGREDIENT_IDS } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import { nightEntries } from '../src/game/systems/NightWords.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 시간이 정하는 것은 **어떤 단어가 내려오는가** 하나뿐이다.
 * 순수 함수(`DayNight.ts`)가 국면을 맞게 돌려주는 것과, 엔진이 그 국면대로 밭을
 * 갈아끼우는 것은 서로 다른 일이라 여기서 따로 확인한다.
 */
const INGREDIENT_WORDS = new Set(nightEntries(WORDS).map((entry) => entry.word))

describe('nightEntries', () => {
  it('재료가 되는 단어만 남는다', () => {
    const night = nightEntries(WORDS)
    expect(night.length).toBeGreaterThan(0)
    expect(night.length).toBeLessThan(WORDS.length)
    for (const entry of night) {
      const ok = entry.variants.some(
        (variant) => !variant.hidden && INGREDIENT_IDS.has(variant.id),
      )
      expect(ok, entry.word).toBe(true)
    }
  })

  it('밤에도 칠 것이 넉넉하다', () => {
    // 밭이 좁으면 같은 단어만 되풀이되어 몰아치는 맛이 없다
    expect(nightEntries(WORDS).length).toBeGreaterThan(10)
  })
})

describe('판이 국면을 따라간다', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  /**
   * 방금 뜬 단어들. `y`는 0(레인 최상단)에서 1(바닥선)로 가므로 작을수록 새것이다.
   *
   * **화면 전체를 보면 안 된다.** 국면이 바뀌어도 이미 내려오던 단어는 그대로 두는데
   * (치려던 것이 손 아래에서 사라지면 안 된다) **낙하가 10초라 밤보다 길다.** 그래서
   * 밤 내내 낮에 뜬 단어가 화면에 남아 있고, 그것은 고장이 아니라 설계다.
   *
   * 밤이 정하는 것은 **다음에 무엇을 뽑는가**이므로, 갓 뜬 것만 보는 것이 맞다.
   */
  function freshWords(state: GameState | null): string[] {
    return (state?.words ?? [])
      .filter((word) => word.state === 'active' && word.y < 0.25)
      .map((word) => word.word)
  }

  it('밤에는 재료만 내려온다', async () => {
    const engine = await GameEngine.create(20260809)
    let state: GameState | null = null
    engine.onStateChange((next) => {
      state = next
    })
    engine.startRun()

    /*
     * 밤이 시작되고 **`y`가 0.25에 닿는 만큼** 더 기다린다. 낙하가 10초이므로 2.5초다 —
     * 그 전에는 낮 끝에 뜬 단어도 아직 y가 작아서 "갓 뜬 것"에 섞인다.
     */
    await clock.advance(FIRST_NIGHT_SEC + DAY_SEC + 2.6)

    /*
     * 밤 동안 갓 뜬 단어를 모은다. 한 시점만 보면 마침 그 순간에 새로 뜬 것이
     * 없을 수 있어서, 밤이 끝날 때까지 훑는다.
     */
    const seen = new Set<string>()
    for (let t = 0; t < NIGHT_SEC - 3.6; t += 0.25) {
      await clock.advance(0.25)
      for (const word of freshWords(state)) {
        seen.add(word)
      }
    }

    const strangers = [...seen].filter((word) => !INGREDIENT_WORDS.has(word))
    expect(seen.size, '밤인데 새로 뜬 단어가 하나도 없다').toBeGreaterThan(0)
    expect(strangers, `밤인데 재료가 아닌 단어가 떴다: ${strangers.join(', ')}`).toEqual([])

    engine.dispose()
  }, 30_000)
})
