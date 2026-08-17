import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import type { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import type { GamePhase, ItemVariant } from '../src/game/types/game.ts'
import { FrameClock } from './helpers/frameClock.ts'

describe('화이트보드 상자 회수', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('상자 안에 있는 보드 대상만 동그라미가 되고 입력하면 실제 물건 하나가 사라진다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      loop: { stop(): void }
      physics: PhysicsWorld
      whiteboardTargets: ItemVariant[]
      catcherView: { y: number } | null
      phase: GamePhase
      emit(): void
    }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(false)
    internals.loop.stop()

    const target = internals.whiteboardTargets[0]
    expect(target).toBeDefined()
    if (target === undefined) throw new Error('화이트보드 대상이 비어 있다')
    expect(target.hidden).toBe(true)
    expect(internals.whiteboardTargets.some((candidate) => !candidate.hidden)).toBe(true)
    let current = state as unknown as GameState
    expect(current.activeWhiteboard).not.toContain(target.label)

    internals.physics.spawnItemAt(target, 0, 1, 'solo')
    internals.emit()
    current = state as unknown as GameState
    expect(current.activeWhiteboard).toContain(target.label)

    const before = internals.physics.countsByVariant().get(target.id) ?? 0
    internals.phase = 'playing'
    engine.submit(target.label)
    const after = internals.physics.countsByVariant().get(target.id) ?? 0

    expect(after).toBe(before - 1)
    expect((state as unknown as GameState).stage.returns).toBe(1)
    expect((state as unknown as GameState).stage.totalReturns).toBe(1)
    expect((state as unknown as GameState).whiteboardRecall).toMatchObject({
      label: target.label,
      sourceX: 0,
      sourceY: 1,
    })
    expect(internals.catcherView?.y).toBeGreaterThan(1)
    engine.dispose()
  })

  it('튜토리얼은 조건을 만족할 때까지 다음 단어로 넘어가지 않는다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as { loop: { stop(): void }; phase: GamePhase }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(true)
    internals.loop.stop()

    let current = state as unknown as GameState
    expect(current.stage.id).toBe(0)
    expect(current.stage).toMatchObject({
      tutorialStep: 0,
      tutorialTotal: 8,
      tutorialText: expect.stringContaining('물건을 쌓는 상자'),
    })
    expect(current.words.filter((word) => word.state === 'active')).toEqual([])

    internals.phase = 'playing'
    engine.submit('아무말')
    current = state as unknown as GameState
    expect(current.words.filter((word) => word.state === 'active')).toEqual([])

    engine.submit('')
    current = state as unknown as GameState
    expect(current.stage).toMatchObject({ tutorialStep: 1, tutorialText: expect.stringContaining('화살표 위치') })
    expect(current.words.filter((word) => word.state === 'active').map((word) => word.word)).toEqual(['책'])

    engine.submit('책')
    current = state as unknown as GameState
    expect(current.stage).toMatchObject({
      tutorialStep: 2,
      tutorialText: expect.stringContaining('계란 3개를 상자에 넣어봐요'),
    })
    expect(current.words.filter((word) => word.state === 'active').map((word) => word.word)).toEqual(['계란'])

    engine.submit('계란')
    current = state as unknown as GameState
    expect(current.stage.tutorialText).toContain('1 / 3')
    expect(current.words.filter((word) => word.state === 'active').map((word) => word.word)).toEqual(['계란'])

    engine.submit('계란')
    engine.submit('계란')
    current = state as unknown as GameState
    expect(current.words.filter((word) => word.state === 'active').map((word) => word.word)).toEqual(['프라이팬'])
    engine.submit('프라이팬')
    current = state as unknown as GameState
    expect(current.words.filter((word) => word.state === 'active').map((word) => word.word)).toEqual(['프라이팬'])
    engine.dispose()
  })

  it('튜토리얼에서도 화살표가 움직이고 입력 순간의 화살표 위치에 떨어진다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      loop: { stop(): void }
      physics: PhysicsWorld
      phase: GamePhase
      sinceLastDrop: number
    }
    engine.startRun(true)
    internals.loop.stop()
    internals.phase = 'playing'
    engine.submit('')

    const bookAim = 0.42
    ;(internals as unknown as { aimer: { setWorldX(x: number): void } }).aimer.setWorldX(bookAim)
    internals.sinceLastDrop = Number.POSITIVE_INFINITY
    engine.submit('책')
    const eggAim = -0.31
    ;(internals as unknown as { aimer: { setWorldX(x: number): void } }).aimer.setWorldX(eggAim)
    internals.sinceLastDrop = Number.POSITIVE_INFINITY
    engine.submit('계란')
    internals.sinceLastDrop = Number.POSITIVE_INFINITY
    engine.submit('계란')
    internals.sinceLastDrop = Number.POSITIVE_INFINITY
    engine.submit('계란')
    const panAim = 0.67
    ;(internals as unknown as { aimer: { setWorldX(x: number): void } }).aimer.setWorldX(panAim)
    internals.sinceLastDrop = Number.POSITIVE_INFINITY
    engine.submit('프라이팬')

    expect(
      (engine as unknown as { spawner: { readonly words: readonly { state: string; word: string }[] } }).spawner
        .words
        .filter((word) => word.state === 'active')
        .map((word) => word.word),
    ).toEqual(['프라이팬'])

    const bodies = internals.physics.snapshots()
    const egg = bodies.find((body) => body.variant.id === 'egg')
    const pan = bodies.find((body) => body.variant.id === 'frying-pan')
    const book = bodies.find((body) => body.variant.id === 'study-book')
    expect(book?.x).toBeCloseTo(bookAim)
    expect(egg?.x).toBeCloseTo(eggAim)
    expect(pan?.x).toBeCloseTo(panAim)
    engine.dispose()
  })

  it('스테이지는 시작 안내와 정산 안내를 거친 뒤 다음 보관함을 연다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      stageReturns: number
      advanceStage(): void
      emit(): void
    }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(false)

    expect((state as unknown as GameState).stage.notice?.kind).toBe('start')
    await clock.advance(1.4)
    expect((state as unknown as GameState).phase).toBe('playing')

    internals.stageReturns = 20
    internals.advanceStage()
    internals.emit()
    expect((state as unknown as GameState).stage.notice?.kind).toBe('complete')
    expect((state as unknown as GameState).stage.notice?.lesson).toBeNull()
    await clock.advance(2.2)
    expect((state as unknown as GameState).stage.id).toBe(2)
    expect((state as unknown as GameState).stage.notice?.kind).toBe('start')
    engine.dispose()
  })

  it('4/4 회수 뒤에는 같은 판에서 멈춘 경보 데모로 이어진다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as { advanceStage(): void; emit(): void; phase: GamePhase }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(true)
    internals.phase = 'playing'

    internals.advanceStage()
    internals.emit()
    expect((state as unknown as GameState).stage.id).toBe(0)
    expect((state as unknown as GameState).phase).toBe('playing')
    expect((state as unknown as GameState).stage.congestionDemo).toBe('ready')
    engine.dispose()
  })

  it('프라이팬을 세 번 떨어뜨려도 합성이 안 되면 튜토리얼이 합성을 도와준다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      loop: { stop(): void }
      physics: PhysicsWorld
      phase: GamePhase
      tutorialStep: number
      tryTutorialForcedMerge(): void
      emit(): void
    }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(true)
    internals.loop.stop()
    internals.phase = 'playing'
    internals.tutorialStep = 3
    const egg = VARIANT_BY_ID.get('egg')
    const pan = VARIANT_BY_ID.get('frying-pan')
    if (egg === undefined || pan === undefined) throw new Error('튜토리얼 재료가 없다')
    internals.physics.spawnItemAt(egg, -1, 1, 'solo')
    internals.physics.spawnItemAt(pan, 1, 1, 'solo')
    internals.physics.spawnItemAt(pan, 0, 1.4, 'solo')
    internals.physics.spawnItemAt(pan, -0.6, 1.7, 'solo')

    internals.tryTutorialForcedMerge()
    internals.emit()

    expect((state as unknown as GameState).stage.tutorialStep).toBe(4)
    expect((state as unknown as GameState).feedback?.text).toBe('합성을 도와드렸어요!')
    expect(internals.physics.snapshots().map((body) => body.variant.id)).toContain('fried-egg')
    engine.dispose()
  })

  it('계란 프라이 회수 뒤 경보 설명과 Enter 데모를 거쳐 실제 100개 낙하로 이어진다', async () => {
    const engine = await GameEngine.create(20260817)
    const internals = engine as unknown as {
      loop: { stop(): void }
      physics: PhysicsWorld
      phase: GamePhase
      tutorialStep: number
      congestionDemoDropIndex: number
      showTutorialStep(): void
      emit(): void
      update(dt: number): void
    }
    let state: GameState | null = null
    engine.onStateChange((next) => { state = next })
    engine.startRun(true)
    internals.loop.stop()
    internals.phase = 'playing'
    expect((state as unknown as GameState).stage).toMatchObject({
      returns: 0,
      target: 20,
    })
    internals.tutorialStep = 5
    internals.showTutorialStep()
    engine.submit('')
    expect((state as unknown as GameState).stage).toMatchObject({
      tutorialStep: 6,
      target: 20,
      returns: 0,
      tutorialText: expect.stringContaining('게임 클리어'),
    })
    engine.submit('')
    expect((state as unknown as GameState).stage).toMatchObject({
      tutorialStep: 7,
      tutorialText: expect.stringContaining('계란 프라이를 입력'),
    })
    const friedEgg = VARIANT_BY_ID.get('fried-egg')
    if (friedEgg === undefined) throw new Error('계란 프라이가 없다')
    internals.physics.spawnItemAt(friedEgg, 0, 1, 'solo')
    internals.emit()

    engine.submit('계란 프라이')
    expect((state as unknown as GameState).whiteboardRecall).toMatchObject({ label: '계란 프라이' })
    expect((state as unknown as GameState).stage).toMatchObject({
      congestionDemo: 'ready',
      returns: 1,
      target: 20,
      tutorialStep: 7,
      tutorialTotal: 8,
      tutorialText: expect.stringContaining('1개 줄었습니다'),
    })

    engine.submit('')
    expect((state as unknown as GameState).stage.congestionDemo).toBe('congestionGuide')
    engine.submit('')
    expect((state as unknown as GameState).stage).toMatchObject({
      congestion: 0,
      congestionDemo: 'wordRush',
    })
    for (let index = 0; index < 55; index += 1) {
      internals.update(0.05)
    }
    expect((state as unknown as GameState).stage).toMatchObject({
      congestion: 100,
      congestionDemo: 'full',
    })
    engine.submit('')
    expect((state as unknown as GameState).stage.congestionDemo).toBe('falling')
    expect(internals.physics.snapshots()).toHaveLength(0)
    for (let index = 0; index < 100; index += 1) {
      internals.update(0.05)
    }
    expect(internals.congestionDemoDropIndex).toBe(100)
    internals.update(0.3)
    expect((state as unknown as GameState).phase).toBe('playing')
    expect((state as unknown as GameState).stage.congestionDemo).toBe('gameOverIntro')
    internals.update(0.7)
    expect((state as unknown as GameState).stage.congestionDemo).toBe('gameOverPrompt')
    engine.submit('')
    expect((state as unknown as GameState).stage.congestionDemo).toBe('over')
    expect((state as unknown as GameState).phase).toBe('over')
    engine.dispose()
  })
})
