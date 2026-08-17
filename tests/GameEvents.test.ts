import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import type { GameEvent } from '../src/game/types/events.ts'
import type { ItemVariant } from '../src/game/types/game.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 소리는 귀로만 확인할 수 있지만, **소리가 날 자리에 사건이 오는지**는 잴 수 있다.
 * 여기서 지키는 것은 엔진이 사건을 내놓는다는 것 하나다 — 그것이 끊기면 화면은
 * 멀쩡한데 소리만 조용히 사라지고, 그런 종류의 고장은 눈에 띄지 않는다.
 */
function kinds(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.kind)
}

function anyVariant(): ItemVariant {
  const found = WORDS[0]?.variants[0]
  if (found === undefined) {
    throw new Error('단어 테이블이 비어있다')
  }
  return found
}

describe('물리 층이 부딪힘을 알린다', () => {
  it('받침대에 떨어진 물건이 impact를 낸다', async () => {
    const world = await PhysicsWorld.create()
    world.spawnItemAt(anyVariant(), 0, ARENA.spawnY, SOLO_OWNER)

    const impacts: number[] = []
    for (let t = 0; t < 3; t += 1 / 60) {
      for (const hit of world.step(1 / 60).impacts) {
        impacts.push(hit.impact)
      }
    }

    expect(impacts.length).toBeGreaterThan(0)
    // 세기가 실려 있어야 소리가 세기를 따라갈 수 있다
    expect(impacts[0]).toBeGreaterThan(0)
    world.dispose()
  })

  /**
   * quake는 크고 무거운 물건만 잡는다(entry.shakes). 착지음까지 그 조건에 걸어두면
   * 대부분의 물건이 소리 없이 얹힌다 — 이 테스트가 그 회귀를 막는다.
   */
  it('지진을 일으키지 않는 가벼운 물건도 부딪힘은 알린다', async () => {
    const world = await PhysicsWorld.create()
    let lightest: ItemVariant | null = null
    for (const entry of WORDS) {
      for (const item of entry.variants) {
        const size = Math.max(item.artBounds.hw, item.artBounds.hh) * 2
        const current = lightest
        if (current === null || size < Math.max(current.artBounds.hw, current.artBounds.hh) * 2) {
          lightest = item
        }
      }
    }
    if (lightest === null) {
      throw new Error('단어 테이블이 비어있다')
    }

    world.spawnItemAt(lightest, 0, ARENA.spawnY, SOLO_OWNER)
    let sawImpact = false
    let sawQuake = false
    for (let t = 0; t < 3; t += 1 / 60) {
      const result = world.step(1 / 60)
      sawImpact ||= result.impacts.length > 0
      sawQuake ||= result.quake > 0
    }

    expect(sawImpact).toBe(true)
    expect(sawQuake).toBe(false)
    world.dispose()
  })
})

describe('GameEngine이 사건을 흘린다', () => {
  const clock = new FrameClock()

  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('판을 시작하고 단어를 맞추고 놓치는 흐름에서 사건이 나온다', async () => {
    const engine = await GameEngine.create(20260808)
    const events: GameEvent[] = []
    let state: GameState | null = null

    engine.onEvent((event) => events.push(event))
    engine.onStateChange((next) => {
      state = next
    })

    engine.startRun(false)
    expect(kinds(events)).toContain('runStart')

    // 단어가 내려올 때까지 돌린다
    await clock.advance(4.2)
    const words = state === null ? [] : (state as GameState).words
    expect(words.length).toBeGreaterThan(0)

    events.length = 0
    engine.submit('이런단어는없다')
    expect(kinds(events)).toEqual(['wordMiss'])

    events.length = 0
    const target = words[0]
    if (target === undefined) {
      throw new Error('낙하 중인 단어가 없다')
    }
    engine.submit(target.word)

    // 맞추면 콤보가 실린 사건과 낙하가 함께 나온다
    expect(kinds(events)).toContain('wordHit')
    expect(kinds(events)).toContain('drop')
    const hit = events.find((event) => event.kind === 'wordHit')
    expect(hit?.kind === 'wordHit' && hit.combo).toBe(1)

    // 떨어진 물건이 받침대에 닿으면 부딪힘이 온다
    events.length = 0
    await clock.advance(3)
    const impacts = events.filter((event) => event.kind === 'impact')
    expect(impacts.length).toBeGreaterThan(0)
    for (const impact of impacts) {
      if (impact.kind !== 'impact') {
        continue
      }
      // 세기는 0~1로 눌러서 나온다 — 받는 쪽이 물리 단위를 몰라도 되게
      expect(impact.strength).toBeGreaterThan(0)
      expect(impact.strength).toBeLessThanOrEqual(1)
      // 실제 질량이 있어야 사뿐·풀썩·척·쿵을 물건 크기가 아니라 무게로 가를 수 있다
      expect(impact.mass).toBeGreaterThan(0)
      expect(impact.size).toBeGreaterThan(0)
    }

    engine.dispose()
  })

  it('사건을 받아가지 않아도 판은 그대로 돈다', async () => {
    const engine = await GameEngine.create(7)
    let state: GameState | null = null
    engine.onStateChange((next) => {
      state = next
    })

    engine.startRun()
    await clock.advance(2)

    expect(state).not.toBeNull()
    expect((state as unknown as GameState).phase).toBe('playing')
    engine.dispose()
  })
})
