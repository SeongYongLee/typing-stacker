/** dt가 이보다 크게 튀면(탭 전환 등) 물리와 낙하가 한 프레임에 순간이동한다 */
const MAX_DELTA = 1 / 20

class GameLoop {
  private rafId: number | null = null
  private lastTime = 0
  private onUpdate: (dt: number) => void = () => {}
  private onRender: () => void = () => {}

  setCallbacks(onUpdate: (dt: number) => void, onRender: () => void): void {
    this.onUpdate = onUpdate
    this.onRender = onRender
  }

  get running(): boolean {
    return this.rafId !== null
  }

  start(): void {
    if (this.rafId !== null) {
      return
    }
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.rafId === null) {
      return
    }
    cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, MAX_DELTA)
    this.lastTime = now
    this.onUpdate(dt)
    this.onRender()
    this.rafId = requestAnimationFrame(this.tick)
  }
}

export { GameLoop }
