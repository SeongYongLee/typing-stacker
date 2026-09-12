import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import type { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import type { GamePhase, ItemVariant } from '../src/game/types/game.ts'
import { FrameClock } from './helpers/frameClock.ts'

describe('회수 입력 안내', () => {
  const clock = new FrameClock()
  let engine: GameEngine
  let state: GameState
  let internals: {
    phase: GamePhase
    physics: PhysicsWorld
    spawner: { setScripted(value: boolean): void }
    whiteboardTargets: ItemVariant[]
    whiteboardWords: string[]
    enterStage(id: number): void
  }
  const book = VARIANT_BY_ID.get('study-book')!

  beforeEach(async () => {
    clock.install()
    engine = await GameEngine.create(20260907)
    engine.onStateChange((next) => { state = next })
    engine.startRun(false)
    internals = engine as unknown as typeof internals
    internals.phase = 'playing'
    internals.spawner.setScripted(true)
    internals.whiteboardTargets = [book]
    internals.whiteboardWords = [book.label]
  })
  afterEach(() => {
    engine.dispose()
    clock.uninstall()
  })
  function addBook() {
    internals.physics.spawnItemAt(book, 0, 1.2, 'solo')
  }

  it('회수할 물건 없이 보낸 시간은 세지 않고, 물건이 생긴 뒤 12초를 기다린다', async () => {
    await clock.advance(20)
    expect(state.whiteboardReminder).toBeNull()
    addBook()
    await clock.advance(11)
    expect(state.activeWhiteboard).toContain(book.label)
    expect(state.whiteboardReminder).toBeNull()
    await clock.advance(1.2)
    expect(state.whiteboardReminder).toBe(book.label)
    engine.submit(book.label)
    expect(state.whiteboardReminder).toBeNull()
    expect(state.stage.returns).toBe(1)
  })

  it('일시정지 동안 시간을 세지 않으며 안내도 숨긴다', async () => {
    addBook()
    await clock.advance(6)
    engine.pause()
    await clock.advance(30)
    engine.resume()
    await clock.advance(5)
    expect(state.whiteboardReminder).toBeNull()
    await clock.advance(1.2)
    expect(state.whiteboardReminder).toBe(book.label)
    engine.pause()
    expect(state.whiteboardReminder).toBeNull()
  })

  it('회수 가능한 물건이 없어지면 대기 시간을 초기화한다', async () => {
    addBook()
    await clock.advance(11)
    internals.physics.removeOneByVariant(book.id)
    await clock.advance(1)
    addBook()
    await clock.advance(2)
    expect(state.whiteboardReminder).toBeNull()
    await clock.advance(10.2)
    expect(state.whiteboardReminder).toBe(book.label)
  })

  it('스테이지가 바뀌면 이전 안내와 대기 시간을 초기화한다', async () => {
    addBook()
    await clock.advance(12.2)
    expect(state.whiteboardReminder).toBe(book.label)
    internals.enterStage(2)
    await clock.advance(0.1)
    expect(state.whiteboardReminder).toBeNull()
    internals.phase = 'playing'
    internals.spawner.setScripted(true)
    internals.whiteboardTargets = [book]
    internals.whiteboardWords = [book.label]
    addBook()
    await clock.advance(2)
    expect(state.whiteboardReminder).toBeNull()
  })
})
