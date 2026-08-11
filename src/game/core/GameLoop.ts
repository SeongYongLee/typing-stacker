/** dt가 이보다 크게 튀면(탭 전환 등) 물리와 낙하가 한 프레임에 순간이동한다 */
const MAX_DELTA = 1 / 20
const BACKGROUND_TICK_MS = 100
/** 브라우저가 백그라운드 타이머를 묶어도 한 번에 처리할 현실 시간의 상한. */
const MAX_BACKGROUND_CATCH_UP = 2

interface GameLoopOptions {
  /** 멀티 호스트처럼 탭이 숨겨져도 권위 시뮬레이션을 계속해야 하는 경우. */
  readonly runWhenHidden?: boolean
}

class GameLoop {
  private rafId: number | null = null
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null
  private active = false
  private lastTime = 0
  private onUpdate: (dt: number) => void = () => {}
  private onRender: () => void = () => {}
  private readonly options: GameLoopOptions

  constructor(options: GameLoopOptions = {}) {
    this.options = options
  }

  setCallbacks(onUpdate: (dt: number) => void, onRender: () => void): void {
    this.onUpdate = onUpdate
    this.onRender = onRender
  }

  get running(): boolean {
    return this.active
  }

  start(): void {
    if (this.active) {
      return
    }
    this.active = true
    this.lastTime = performance.now()
    if (this.options.runWhenHidden === true && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibility)
    }
    this.schedule()
  }

  stop(): void {
    if (!this.active) {
      return
    }
    this.active = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.backgroundTimer !== null) {
      clearTimeout(this.backgroundTimer)
      this.backgroundTimer = null
    }
    if (this.options.runWhenHidden === true && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility)
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.active) return
    const dt = Math.min((now - this.lastTime) / 1000, MAX_DELTA)
    this.lastTime = now
    this.onUpdate(dt)
    this.onRender()
    this.rafId = null
    this.schedule()
  }

  private readonly backgroundTick = (): void => {
    this.backgroundTimer = null
    if (!this.active) return
    const now = performance.now()
    let remaining = Math.min(
      Math.max(0, (now - this.lastTime) / 1000),
      MAX_BACKGROUND_CATCH_UP,
    )
    this.lastTime = now
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_DELTA)
      this.onUpdate(dt)
      remaining -= dt
    }
    this.schedule()
  }

  private readonly handleVisibility = (): void => {
    if (!this.active) return
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.backgroundTimer !== null) {
      clearTimeout(this.backgroundTimer)
      this.backgroundTimer = null
    }
    this.lastTime = performance.now()
    this.schedule()
  }

  private schedule(): void {
    if (!this.active) return
    const hidden =
      this.options.runWhenHidden === true &&
      typeof document !== 'undefined' &&
      document.hidden
    if (hidden) {
      this.backgroundTimer = setTimeout(this.backgroundTick, BACKGROUND_TICK_MS)
      return
    }
    this.rafId = requestAnimationFrame(this.tick)
  }
}

export { GameLoop, BACKGROUND_TICK_MS, MAX_BACKGROUND_CATCH_UP }
