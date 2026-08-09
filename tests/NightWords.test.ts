import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIRST_NIGHT_SEC, DAY_SEC } from '../src/game/config.ts'
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

  /** 지금 화면에 있는 단어들이 전부 재료인가 */
  function allIngredients(state: GameState | null): boolean {
    const words = state?.words.filter((word) => word.state === 'active') ?? []
    return words.length > 0 && words.every((word) => INGREDIENT_WORDS.has(word.word))
  }

  it('밤에는 재료만 내려온다', async () => {
    const engine = await GameEngine.create(20260809)
    let state: GameState | null = null
    engine.onStateChange((next) => {
      state = next
    })
    engine.startRun()

    /*
     * 낮이 끝날 때까지 흘려보낸다. 이미 내려오던 단어는 국면이 바뀌어도 그대로 두므로
     * (치려던 것이 손 아래에서 사라지면 안 된다) 밤이 시작되고 조금 더 기다린 뒤에 본다.
     */
    await clock.advance(FIRST_NIGHT_SEC + DAY_SEC + 3)

    expect(
      allIngredients(state),
      `밤인데 재료가 아닌 단어가 있다: ${(state as GameState | null)?.words
        .filter((word) => word.state === 'active')
        .map((word) => word.word)
        .join(', ')}`,
    ).toBe(true)

    engine.dispose()
  }, 30_000)
})
