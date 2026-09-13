import { expect, it } from 'vitest'
import { MergeRevealQueue } from '../src/game/systems/MergeRevealQueue.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
const egg = VARIANT_BY_ID.get('fried-egg')!
const book = VARIANT_BY_ID.get('magic-book')!

it('shows every result in order without replacing an active presentation', () => {
  const queue = new MergeRevealQueue()
  queue.enqueue(egg, [], 3)
  queue.advance(1)
  queue.enqueue(book, [egg], 4.2)
  queue.enqueue(egg, [], 3)
  expect(queue.current?.variant).toBe(egg)
  expect(queue.current?.elapsed).toBe(1)
  queue.advance(2)
  expect(queue.current?.variant).toBe(book)
  expect(queue.current?.elapsed).toBe(0)
  queue.advance(4.2)
  expect(queue.current?.seq).toBe(3)
  queue.advance(3)
  expect(queue.current).toBeNull()
})

it('does not skip queued results after a stalled frame or a pause', () => {
  const queue = new MergeRevealQueue()
  for (let i = 0; i < 5; i++) queue.enqueue(egg, [], 3)
  queue.advance(0)
  expect(queue.current?.elapsed).toBe(0)
  queue.advance(30)
  expect(queue.current?.seq).toBe(2)
  expect(queue.current?.elapsed).toBe(0)
})

it('clears active and pending results on a new run and gives repeated recipes distinct IDs', () => {
  const queue = new MergeRevealQueue()
  queue.enqueue(egg, [], 3)
  queue.enqueue(egg, [], 3)
  const first = queue.current!.seq
  queue.reset()
  expect(queue.current).toBeNull()
  queue.enqueue(book, [], 3)
  expect(queue.current!.seq).toBeGreaterThan(first)
  queue.advance(3)
  expect(queue.current).toBeNull()
})


it('emits one contact cue per visible reveal, never when enqueuing or paused', () => {
  const queue = new MergeRevealQueue()
  queue.enqueue(egg, [egg, egg], 3)
  queue.enqueue(book, [egg, egg, egg, egg], 4.2)
  expect(queue.advance(0.69)).toBeNull()
  expect(queue.advance(0.02)?.variant).toBe(egg)
  expect(queue.advance(0)).toBeNull()
  expect(queue.advance(0.2)).toBeNull()
  expect(queue.advance(3)).toBeNull()
  expect(queue.current?.variant).toBe(book)
  expect(queue.advance(1.32)).toBeNull()
  expect(queue.advance(0.02)?.variant).toBe(book)
  expect(queue.advance(0.2)).toBeNull()
  queue.reset()
  expect(queue.advance(5)).toBeNull()
})
