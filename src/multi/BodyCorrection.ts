import type { BodyCorrection as PhysicsCorrection } from '../game/physics/PhysicsWorld.ts'
import type { BodySnapshot } from '../game/types/game.ts'

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

const DEFAULT_DURATION_SEC = 0.12
const MAX_DISTANCE = 0.75
const MAX_ROTATION = Math.PI / 3

interface ActiveCorrection {
  dx: number
  dy: number
  rotation: number
  age: number
}

function shortestAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value))
}

function remaining(age: number, duration: number): number {
  const t = Math.min(1, Math.max(0, age / duration))
  const smooth = t * t * (3 - 2 * t)
  return 1 - smooth
}

/** 참가자의 권위 물리 교정을 화면에서만 짧게 이어 붙인다. */
class BodyCorrection {
  private readonly duration: number
  private readonly active = new Map<number, ActiveCorrection>()
  /** 임계값을 넘어 즉시 스냅한 바디도 한 렌더 동안 꼬리 속도 계산에서 뺀다. */
  private readonly instant = new Set<number>()
  private readonly buffer: Mutable<BodySnapshot>[] = []
  private readonly suppressed = new Set<number>()
  /** 교정을 받은 직후 첫 update에서는 시간을 먹지 않아 첫 그림을 정확히 보존한다. */
  private fresh = false

  constructor(duration = DEFAULT_DURATION_SEC) {
    this.duration = duration
  }

  get hasActive(): boolean {
    return this.active.size > 0
  }

  get suppressedHandles(): ReadonlySet<number> {
    return this.suppressed
  }

  note(corrections: readonly PhysicsCorrection[]): void {
    for (const correction of corrections) {
      const previous = this.active.get(correction.handle)
      const scale = previous === undefined ? 0 : remaining(previous.age, this.duration)
      const dx = correction.dx + (previous?.dx ?? 0) * scale
      const dy = correction.dy + (previous?.dy ?? 0) * scale
      const rotation = shortestAngle(
        correction.rotation + (previous?.rotation ?? 0) * scale,
      )
      if (Math.hypot(dx, dy) > MAX_DISTANCE || Math.abs(rotation) > MAX_ROTATION) {
        this.active.delete(correction.handle)
        this.instant.add(correction.handle)
        continue
      }
      if (Math.hypot(dx, dy) < 1e-6 && Math.abs(rotation) < 1e-6) {
        this.active.delete(correction.handle)
        continue
      }
      this.active.set(correction.handle, { dx, dy, rotation, age: 0 })
    }
    this.fresh = this.active.size > 0
  }

  advance(dt: number): void {
    if (this.fresh) {
      this.fresh = false
      return
    }
    for (const [handle, correction] of this.active) {
      correction.age += Math.max(0, dt)
      if (correction.age >= this.duration) this.active.delete(handle)
    }
  }

  apply(bodies: readonly BodySnapshot[]): readonly BodySnapshot[] {
    this.suppressed.clear()
    for (const handle of this.instant) this.suppressed.add(handle)
    this.instant.clear()
    let count = 0
    for (const body of bodies) {
      const correction = this.active.get(body.handle)
      const scale = correction === undefined ? 0 : remaining(correction.age, this.duration)
      const slot = (this.buffer[count] ??= { ...body })
      slot.handle = body.handle
      slot.itemId = body.itemId
      slot.variant = body.variant
      slot.owner = body.owner
      slot.x = body.x + (correction?.dx ?? 0) * scale
      slot.y = body.y + (correction?.dy ?? 0) * scale
      slot.rotation = body.rotation + (correction?.rotation ?? 0) * scale
      slot.settled = body.settled
      slot.recalled = body.recalled
      if (correction !== undefined) this.suppressed.add(body.handle)
      count += 1
    }
    this.buffer.length = count
    return this.buffer
  }

  reset(): void {
    this.active.clear()
    this.instant.clear()
    this.buffer.length = 0
    this.suppressed.clear()
    this.fresh = false
  }
}

export { BodyCorrection, DEFAULT_DURATION_SEC, MAX_DISTANCE, MAX_ROTATION }
