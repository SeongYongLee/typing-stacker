import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameLoop } from '../src/game/core/GameLoop.ts'

class VisibilityDocument extends EventTarget {
  hidden = false
}

const globals = globalThis as unknown as Record<string, unknown>
const originalDocument = globals['document']
const originalRaf = globals['requestAnimationFrame']
const originalCancelRaf = globals['cancelAnimationFrame']

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  globals['document'] = originalDocument
  globals['requestAnimationFrame'] = originalRaf
  globals['cancelAnimationFrame'] = originalCancelRaf
})

describe('GameLoop 백그라운드 진행', () => {
  it('멀티 루프는 숨겨진 동안 렌더 없이 경과 시간을 작은 단계로 처리한다', () => {
    vi.useFakeTimers()
    const document = new VisibilityDocument()
    globals['document'] = document

    let nextRaf = 1
    const frames = new Map<number, FrameRequestCallback>()
    globals['requestAnimationFrame'] = (callback: FrameRequestCallback) => {
      const id = nextRaf++
      frames.set(id, callback)
      return id
    }
    globals['cancelAnimationFrame'] = (id: number) => frames.delete(id)

    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    let elapsed = 0
    let updates = 0
    let renders = 0
    const loop = new GameLoop({ runWhenHidden: true })
    loop.setCallbacks(
      (dt) => {
        elapsed += dt
        updates += 1
      },
      () => { renders += 1 },
    )
    loop.start()

    document.hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)

    now = 1000
    vi.advanceTimersByTime(100)
    expect(elapsed).toBeCloseTo(1)
    expect(updates).toBe(20)
    expect(renders).toBe(0)

    document.hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(1)
    loop.stop()
  })
})
