import { afterEach, beforeEach, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { MergeRevealQueue } from '../src/game/systems/MergeRevealQueue.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import { FrameClock } from './helpers/frameClock.ts'

const clock = new FrameClock()
let engine: GameEngine
let state: GameState
let cues: number[]
let internal: { mergeReveals: MergeRevealQueue; update(dt: number): void }
beforeEach(async () => {
  clock.install()
  engine = await GameEngine.create(17)
  engine.onStateChange(next => { state = next })
  engine.setStageStoriesEnabled(true)
  engine.startRun(false)
  engine.finishStageStory()
  internal = engine as unknown as typeof internal
  cues = []
  engine.onEvent(event => { if (event.kind === 'mergePresented') cues.push(internal.mergeReveals.current!.seq) })
})
afterEach(() => { engine.dispose(); clock.uninstall() })

it('keeps sound and four/five ingredient emphasis on the visible queue item without slowing play', () => {
  const egg = VARIANT_BY_ID.get('fried-egg')!
  for (const count of [2, 4, 5]) internal.mergeReveals.enqueue(egg, Array(count).fill(egg), 3)
  const start = state.stats.durationSec
  internal.update(0.5)
  expect(cues).toHaveLength(0)
  expect(state.complexMergeFocus).toBeNull()
  internal.update(0.21)
  expect(cues).toEqual([1])
  expect(state.complexMergeFocus).toBeNull()
  internal.update(2.3)
  expect(internal.mergeReveals.current?.seq).toBe(2)
  internal.update(1.32)
  expect(cues).toEqual([1])
  expect(state.complexMergeFocus).toBeNull()
  internal.update(0.02)
  expect(cues).toEqual([1, 2])
  expect(state.complexMergeFocus).toBeGreaterThanOrEqual(0)
  internal.update(0.5)
  expect(state.stats.durationSec - start).toBeCloseTo(4.85)
  internal.update(1.2)
  expect(internal.mergeReveals.current?.seq).toBe(3)
  internal.update(1.52)
  expect(cues).toEqual([1, 2, 3])
  expect(state.complexMergeFocus).not.toBeNull()
})

it('pauses the cue clock and clears old cues on restart', () => {
  const egg = VARIANT_BY_ID.get('fried-egg')!
  internal.mergeReveals.enqueue(egg, [egg, egg], 3)
  internal.update(0.5)
  engine.pause()
  internal.update(2)
  expect(cues).toHaveLength(0)
  expect(internal.mergeReveals.current?.elapsed).toBe(0.5)
  engine.resume()
  internal.update(0.21)
  expect(cues).toHaveLength(1)
  internal.mergeReveals.enqueue(egg, [egg, egg], 3)
  engine.setStageStoriesEnabled(true)
  engine.startRun(false)
  engine.finishStageStory()
  internal.update(1)
  expect(cues).toHaveLength(1)
  expect(state.complexMergeFocus).toBeNull()
})
