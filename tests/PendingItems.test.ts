import { describe, expect, it } from 'vitest'
import { PendingQueue } from '../src/game/systems/PendingItems.ts'

describe('PendingQueue', () => {
  it('대기 시간이 다 되면 큐에서 빠져 나온다', () => {
    const queue = new PendingQueue()
    queue.add('사과', 0.5, 1)

    expect(queue.update(0.6)).toHaveLength(0)
    expect(queue.size).toBe(1)

    const due = queue.update(0.5)
    expect(due).toHaveLength(1)
    expect(due[0]!.word).toBe('사과')
    expect(due[0]!.x).toBe(0.5)
    expect(queue.size).toBe(0)
  })

  it('여러 개가 같은 프레임에 시간이 되면 한 번에 나온다', () => {
    const queue = new PendingQueue()
    queue.add('가', 0, 1)
    queue.add('나', 0, 1)
    expect(queue.update(1)).toHaveLength(2)
    expect(queue.size).toBe(0)
  })

  it('상쇄는 가장 임박한 것부터 지운다', () => {
    const queue = new PendingQueue()
    queue.add('느긋한', 0, 5)
    queue.add('급한', 0, 1)
    queue.add('중간', 0, 3)

    expect(queue.cancelOne()?.word).toBe('급한')
    expect(queue.cancelOne()?.word).toBe('중간')
    expect(queue.cancelOne()?.word).toBe('느긋한')
    expect(queue.cancelOne()).toBeNull()
  })

  it('시간이 흐른 뒤에도 임박한 순서를 다시 판단한다', () => {
    const queue = new PendingQueue()
    queue.add('먼저', 0, 3)
    queue.update(2) // 먼저: 1초 남음
    queue.add('나중', 0, 0.5)
    expect(queue.cancelOne()?.word).toBe('나중')
  })

  it('총 대기 시간을 남겨둬서 게이지를 그릴 수 있다', () => {
    const queue = new PendingQueue()
    queue.add('사과', 0, 4)
    queue.update(1)
    const item = queue.items[0]!
    expect(item.total).toBe(4)
    expect(item.remaining).toBeCloseTo(3)
  })

  it('reset은 대기 중인 것을 모두 치운다', () => {
    const queue = new PendingQueue()
    queue.add('가', 0, 1)
    queue.add('나', 0, 1)
    queue.reset()
    expect(queue.size).toBe(0)
    expect(queue.update(10)).toHaveLength(0)
  })
})
