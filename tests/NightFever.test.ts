import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARENA,
  NIGHT_FEVER,
  NIGHT_SCORE_INTERVAL,
  NIGHT_SEC,
  SCORE,
  SOLO_LIVES,
  SOLO_OWNER,
} from '../src/game/config.ts'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import {
  NightFever,
  isLifeProtected,
  type FeverDrop,
  type FeverStackItem,
} from '../src/game/systems/NightFever.ts'
import { nightScoreTargetAt } from '../src/game/systems/DayNight.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import type { GameEvent } from '../src/game/types/events.ts'
import { FrameClock } from './helpers/frameClock.ts'

function variant(id: string) {
  const found = VARIANT_BY_ID.get(id)
  if (found === undefined) throw new Error(`없는 물건: ${id}`)
  return found
}

function grantDayScore(engine: GameEngine, points = NIGHT_SCORE_INTERVAL): void {
  const internals = engine as unknown as {
    score: { onCrafted(item: ReturnType<typeof variant>): void }
  }
  internals.score.onCrafted({
    ...variant('egg'),
    scoreBonus: points - SCORE.craftBonus,
  })
}

function stackItem(id: string, handle: number, x: number, y: number): FeverStackItem {
  return { handle, variant: variant(id), x, y, settled: true }
}

function collect(
  seed: number,
  stack: readonly FeverStackItem[] = [],
): { readonly at: number; readonly drop: FeverDrop }[] {
  const fever = new NightFever(createRng(seed), RECIPES, VARIANT_BY_ID)
  fever.start()
  const drops: { at: number; drop: FeverDrop }[] = []
  let elapsed = 0
  const step = 0.01
  for (; elapsed < NIGHT_SEC; elapsed += step) {
    const drop = fever.update(step, stack)
    if (drop !== null) {
      drops.push({ at: elapsed + step, drop })
    }
  }
  return drops
}

const SET_DROP_SEC =
  NIGHT_FEVER.firstDropSec + (NIGHT_FEVER.itemsPerSet - 1) * NIGHT_FEVER.itemGapSec
const SET_CYCLE_SEC = SET_DROP_SEC + NIGHT_FEVER.restSec
const EXPECTED_SETS = Math.ceil((NIGHT_SEC - SET_DROP_SEC) / SET_CYCLE_SEC)

function grouped(drops: readonly { readonly at: number; readonly drop: FeverDrop }[]) {
  const result = new Map<number, { readonly at: number; readonly drop: FeverDrop }[]>()
  for (const item of drops) {
    const set = result.get(item.drop.setIndex) ?? []
    set.push(item)
    result.set(item.drop.setIndex, set)
  }
  return result
}

describe('NightFever', () => {
  it('여섯 개를 0.3초 간격으로 내리고 3초 쉰 뒤 다음 묶음을 연다', () => {
    const drops = collect(20260810)
    const sets = grouped(drops)
    expect(sets.size).toBe(EXPECTED_SETS)
    expect(drops).toHaveLength(sets.size * NIGHT_FEVER.itemsPerSet)

    for (const [setIndex, items] of sets) {
      expect(items).toHaveLength(NIGHT_FEVER.itemsPerSet)
      const expectedFirst = setIndex * SET_CYCLE_SEC + NIGHT_FEVER.firstDropSec
      expect(Math.abs(items![0]!.at - expectedFirst)).toBeLessThanOrEqual(0.011)
      for (let index = 1; index < items!.length; index += 1) {
        expect(
          Math.abs(items![index]!.at - items![index - 1]!.at - NIGHT_FEVER.itemGapSec),
        ).toBeLessThanOrEqual(0.011)
      }
    }
  })

  it('상단 아이템을 완성하는 나머지 레시피 재료를 고른다', () => {
    const stack = [
      stackItem('egg', 11, 0.35, 4.8),
      stackItem('old-key', 33, -0.2, 4.7),
      // 낮은 물건은 꼭대기 띠 밖이라 후보가 되지 않는다
      stackItem('leaf', 22, -0.4, 1.2),
    ]
    const sets = grouped(collect(77, stack))

    for (const items of sets.values()) {
      const targeted = items.filter(({ drop }) => drop.targetHandle !== null)
      expect(targeted).toHaveLength(2)
      expect(
        targeted.map(({ drop }) => [drop.targetHandle, drop.variant.id]).sort(),
      ).toEqual([
        [11, 'frying-pan'],
        [33, 'treasure-map'],
      ])
      expect(new Set(targeted.map(({ drop }) => drop.targetHandle)).size).toBe(2)
      for (const { drop } of targeted) {
        const target = stack.find((item) => item.handle === drop.targetHandle)!
        expect(Math.abs(drop.x - target.x)).toBeLessThan(
          drop.variant.artBounds.hw + target.variant.artBounds.hw,
        )
      }
    }
  })

  it('완성 후보가 없으면 세 개의 2재료 레시피를 통째로 내린다', () => {
    const firstSet = grouped(collect(13)).get(0) ?? []
    expect(firstSet).toHaveLength(NIGHT_FEVER.itemsPerSet)
    expect(firstSet.every(({ drop }) => drop.targetHandle === null)).toBe(true)

    for (let index = 0; index < firstSet.length; index += 2) {
      const pair = firstSet.slice(index, index + 2)
      const recipe = RECIPES.find((candidate) => candidate.id === pair[0]?.drop.recipeId)
      expect(pair.map(({ drop }) => drop.variant.id)).toEqual(recipe?.inputs)
      expect(Math.abs(pair[0]!.drop.x - pair[1]!.drop.x)).toBeLessThan(
        pair[0]!.drop.variant.artBounds.hw + pair[1]!.drop.variant.artBounds.hw,
      )
    }
  })

  it('위치는 물건마다 달라지면서 각 물건이 받침대 안에 남는다', () => {
    const drops = collect(7, [stackItem('egg', 1, 0, 5)])
    const uniqueX = new Set(drops.map(({ drop }) => drop.x.toFixed(4)))
    expect(uniqueX.size).toBeGreaterThan(drops.length / 2)

    for (const { at, drop } of drops) {
      expect(Math.abs(drop.x) + drop.variant.artBounds.hw).toBeLessThanOrEqual(
        ARENA.platformHalfWidth + 1e-9,
      )
      expect(at).toBeLessThan(NIGHT_SEC)
    }
  })

  it('같은 시드는 순서·위치·시각이 같고 다른 시드는 달라진다', () => {
    const stack = [stackItem('egg', 1, 0.1, 4)]
    expect(collect(1234, stack)).toEqual(collect(1234, stack))
    expect(collect(1234, stack)).not.toEqual(collect(5678, stack))
  })

  it('다음 묶음 전에도 예정 재료를 RecipeFlow에 공개한다', () => {
    const fever = new NightFever(createRng(1), RECIPES, VARIANT_BY_ID)
    fever.start()

    expect(fever.update(0.01, [])).toBeNull()
    expect(fever.remaining).toBe(NIGHT_FEVER.itemsPerSet)
    expect(fever.update(NIGHT_FEVER.firstDropSec - 0.01, [])).not.toBeNull()
    expect(fever.remaining).toBe(NIGHT_FEVER.itemsPerSet - 1)
  })

  it('밤 전체와 목숨 손실 뒤 보호막을 같은 이탈 판정에서 보호한다', () => {
    expect(isLifeProtected('night', 0)).toBe(true)
    expect(isLifeProtected('day', 0.1)).toBe(true)
    expect(isLifeProtected('day', 0)).toBe(false)
  })
})

describe('GameEngine Night Fever 통합', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('첫 낮 5,000점 뒤 밤이 열리고 다음 낮부터 누적 난이도 목표를 쓴다', async () => {
    const engine = await GameEngine.create(20260810)
    const events: GameEvent[] = []
    const nightScores: number[] = []
    let state: GameState | null = null
    let latestScore = 0
    let scoreBeforeFirstMerge: number | null = null
    let scoreAfterFirstMerge: number | null = null
    let waitingForMergedState = false
    engine.onEvent((event) => {
      events.push(event)
      if (event.kind === 'merge' && scoreBeforeFirstMerge === null) {
        scoreBeforeFirstMerge = latestScore
        waitingForMergedState = true
      }
    })
    engine.onStateChange((next) => {
      state = next
      if (next.timeOfDay.phase === 'night') {
        nightScores.push(next.stats.score)
      }
      if (waitingForMergedState) {
        scoreAfterFirstMerge = next.stats.score
        waitingForMergedState = false
      }
      latestScore = next.stats.score
    })
    engine.startRun()

    await clock.advance(5)
    expect(events.filter((event) => event.kind === 'drop' && event.source === 'fever')).toHaveLength(0)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('day')

    grantDayScore(engine, NIGHT_SCORE_INTERVAL / 2)
    await clock.advance(0.05)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('day')
    expect((state as GameState | null)?.timeOfDay.progress).toBeCloseTo(0.5)

    grantDayScore(engine, NIGHT_SCORE_INTERVAL / 2)
    await clock.advance(0.05)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('night')

    await clock.advance(NIGHT_SEC - 0.1)
    const feverDrops = events.filter((event) => event.kind === 'drop' && event.source === 'fever')
    expect(feverDrops).toHaveLength(EXPECTED_SETS * NIGHT_FEVER.itemsPerSet)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('night')
    expect((state as GameState | null)?.stats.lives).toBe(SOLO_LIVES)
    expect(events.some((event) => event.kind === 'merge')).toBe(true)
    expect(scoreBeforeFirstMerge).not.toBeNull()
    expect(scoreAfterFirstMerge).toBeGreaterThan(scoreBeforeFirstMerge!)
    expect(
      nightScores.every((score, index) => index === 0 || score >= nightScores[index - 1]!),
      'Fever 중 이탈이나 놓침으로 화면 점수가 내려가면 안 된다',
    ).toBe(true)
    expect(engine.debugLedges(), 'Fever 합성은 방어용 먼지구름을 만들지 않는다').toHaveLength(0)

    await clock.advance(0.2)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('day')
    expect((state as GameState | null)?.invulnerable).toBeGreaterThan(0)
    await clock.advance(0.3)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('day')
    const dayInternals = engine as unknown as {
      readonly dayScore: number
      readonly dayScoreTarget: number
    }
    const rawScore = (state as GameState | null)?.stats.rawScore
    if (rawScore === undefined) throw new Error('낮 상태가 방출되지 않았다')
    expect(dayInternals.dayScoreTarget).toBeGreaterThan(NIGHT_SCORE_INTERVAL)
    expect(dayInternals.dayScoreTarget).toBeLessThanOrEqual(
      nightScoreTargetAt(rawScore),
    )
    const remaining = dayInternals.dayScoreTarget - dayInternals.dayScore
    grantDayScore(engine, remaining / 2)
    await clock.advance(0.05)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('day')
    expect((state as GameState | null)?.timeOfDay.progress).toBeCloseTo(0.5)
    grantDayScore(engine, dayInternals.dayScoreTarget - dayInternals.dayScore)
    await clock.advance(0.05)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('night')
    engine.dispose()
  }, 60_000)

  it('밤에 이탈한 물건마다 고양이가 나와 모두 재투척한다', async () => {
    const engine = await GameEngine.create(20260811)
    const drops: GameEvent[] = []
    engine.onEvent((event) => drops.push(event))
    engine.startRun()
    grantDayScore(engine)
    await clock.advance(0.05)

    const internals = engine as unknown as {
      physics: {
        spawnItemAt(
          item: ReturnType<typeof variant>,
          x: number,
          y: number,
          owner: typeof SOLO_OWNER,
        ): number
      }
      cats: { readonly views: readonly unknown[] }
    }
    const item = variant('egg')
    const catThrows = () => drops.filter(
      (event) => event.kind === 'drop' && event.source === 'input',
    ).length
    const beforeThrows = catThrows()
    internals.physics.spawnItemAt(
      item,
      -(ARENA.halfWidth + 0.1),
      ARENA.platformTop + 1,
      SOLO_OWNER,
    )
    internals.physics.spawnItemAt(
      item,
      ARENA.halfWidth + 0.1,
      ARENA.platformTop + 1,
      SOLO_OWNER,
    )

    await clock.advance(0.05)
    expect(internals.cats.views).toHaveLength(2)

    await clock.advance(0.35)
    expect(catThrows()).toBe(beforeThrows + 2)
    engine.dispose()
  }, 60_000)

  it('밤에 움직인 물건은 낮으로 돌아온 뒤 떨어져도 목숨을 깎지 않는다', async () => {
    const engine = await GameEngine.create(20260813)
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun()
    grantDayScore(engine)
    await clock.advance(0.05)

    const internals = engine as unknown as {
      physics: {
        spawnItemAt(
          item: ReturnType<typeof variant>,
          x: number,
          y: number,
          owner: typeof SOLO_OWNER,
          itemId: number,
        ): number
        frames(): readonly { readonly itemId: number }[]
      }
    }
    const protectedId = 777
    internals.physics.spawnItemAt(
      variant('egg'),
      ARENA.platformHalfWidth + 0.9,
      ARENA.platformTop + 70,
      SOLO_OWNER,
      protectedId,
    )

    await clock.advance(NIGHT_SEC - 0.15)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('night')
    expect(internals.physics.frames().some((frame) => frame.itemId === protectedId)).toBe(true)

    await clock.advance(0.2)
    expect((state as GameState | null)?.timeOfDay.phase).toBe('day')
    await clock.advance(4)

    expect(internals.physics.frames().some((frame) => frame.itemId === protectedId)).toBe(false)
    expect((state as GameState | null)?.stats.lives).toBe(SOLO_LIVES)
    engine.dispose()
  }, 60_000)

  it('카메라가 올라가도 재투척 물건이 탑 위를 넘는다', async () => {
    const engine = await GameEngine.create(20260812)
    const cameraY = 8
    const internals = engine as unknown as {
      cameraY: number
      throwBackFromCat(item: ReturnType<typeof variant>, from: 'left' | 'right'): void
      physics: {
        step(dt: number): unknown
        snapshots(): readonly { readonly x: number; readonly y: number }[]
      }
    }
    internals.cameraY = cameraY
    internals.throwBackFromCat(variant('egg'), 'left')

    let highest = Number.NEGATIVE_INFINITY
    let xAtHighest = Number.POSITIVE_INFINITY
    for (let frame = 0; frame < 75; frame += 1) {
      internals.physics.step(1 / 60)
      const body = internals.physics.snapshots()[0]
      if (body !== undefined && body.y > highest) {
        highest = body.y
        xAtHighest = body.x
      }
    }

    // 카메라가 탑을 뒤늦게 따라가는 중이어도 화면 높이 위로 먼저 빼낸다.
    expect(highest).toBeGreaterThan(cameraY + ARENA.height + 0.5)
    expect(xAtHighest).toBeLessThan(0)
    engine.dispose()
  })
})
