import { vi } from 'vitest'

/**
 * rAF와 시계를 손으로 돌린다.
 *
 * GameLoop은 requestAnimationFrame과 performance.now로 시간을 읽는다. node에는 rAF가 없고,
 * setTimeout으로 흉내내면 3초짜리 시뮬레이션에 실제로 3초를 기다려야 한다.
 * 여기서는 프레임을 즉시 소비하면서 시계만 앞으로 밀어, 빠르고 재현 가능하게 만든다.
 *
 * 메시지가 마이크로태스크로 전달되므로(LoopbackTransport) 프레임 사이에 큐를 비운다.
 */
class FrameClock {
  private nowMs = 0
  private nextId = 1
  private readonly pending = new Map<number, FrameRequestCallback>()
  private restore: (() => void)[] = []

  install(): void {
    const raf = (callback: FrameRequestCallback): number => {
      const id = this.nextId
      this.nextId += 1
      this.pending.set(id, callback)
      return id
    }
    const cancel = (id: number): void => {
      this.pending.delete(id)
    }

    const globals = globalThis as unknown as Record<string, unknown>
    const previousRaf = globals['requestAnimationFrame']
    const previousCancel = globals['cancelAnimationFrame']
    globals['requestAnimationFrame'] = raf
    globals['cancelAnimationFrame'] = cancel

    const spy = vi.spyOn(performance, 'now').mockImplementation(() => this.nowMs)

    this.restore = [
      () => {
        globals['requestAnimationFrame'] = previousRaf
        globals['cancelAnimationFrame'] = previousCancel
      },
      () => spy.mockRestore(),
    ]
  }

  uninstall(): void {
    for (const undo of this.restore) {
      undo()
    }
    this.restore = []
    this.pending.clear()
  }

  /** 프레임을 stepMs 간격으로 돌리며 그 사이 도착한 메시지를 처리한다 */
  async advance(seconds: number, stepMs = 16): Promise<void> {
    const frames = Math.max(1, Math.round((seconds * 1000) / stepMs))
    for (let i = 0; i < frames; i += 1) {
      this.nowMs += stepMs
      const due = [...this.pending.entries()]
      this.pending.clear()
      for (const [, callback] of due) {
        callback(this.nowMs)
      }
      // 전송로가 미뤄둔 전달을 흘려보낸다
      await Promise.resolve()
      await Promise.resolve()
    }
  }

  /** 프레임을 돌리지 않고 대기 중인 메시지만 처리한다 */
  async flush(): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve()
    }
  }
}

export { FrameClock }
