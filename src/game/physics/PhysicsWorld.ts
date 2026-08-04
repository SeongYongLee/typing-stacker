import {
  init,
  ColliderDesc,
  RigidBodyDesc,
  World,
  type RigidBody,
} from '@dimforge/rapier2d-compat'
import { ARENA, SETTLE_HOLD_SEC, SETTLE_SPEED } from '../config.ts'
import type { BodySnapshot, ItemVariant, ShapeDef } from '../types/game.ts'
import { isEscaped } from './collapseDetector.ts'

const FIXED_STEP = 1 / 60
/** 탭 전환 등으로 dt가 크게 튀었을 때 시뮬레이션이 폭주하지 않게 */
const MAX_STEPS_PER_FRAME = 5

const LINEAR_DAMPING = 0.2
const ANGULAR_DAMPING = 0.5

interface SettleEvent {
  readonly variant: ItemVariant
  readonly topY: number
}

interface StepResult {
  readonly settled: readonly SettleEvent[]
  readonly escaped: boolean
}

interface TrackedBody {
  readonly body: RigidBody
  readonly variant: ItemVariant
  settleTimer: number
  settled: boolean
}

/** 도형의 중심에서 위쪽 끝까지의 거리. 높이 점수를 매길 때 쓴다. */
function halfExtentY(shape: ShapeDef): number {
  switch (shape.kind) {
    case 'circle':
      return shape.radius
    case 'box':
      return shape.hh
    case 'capsule':
      return shape.halfHeight + shape.radius
    case 'polygon':
      return Math.max(...shape.points.map((point) => Math.abs(point.y)))
  }
}

function colliderFor(shape: ShapeDef): ColliderDesc {
  switch (shape.kind) {
    case 'circle':
      return ColliderDesc.ball(shape.radius)
    case 'box':
      return ColliderDesc.cuboid(shape.hw, shape.hh)
    case 'capsule':
      return ColliderDesc.capsule(shape.halfHeight, shape.radius)
    case 'polygon': {
      const flat = new Float32Array(shape.points.length * 2)
      shape.points.forEach((point, index) => {
        flat[index * 2] = point.x
        flat[index * 2 + 1] = point.y
      })
      const hull = ColliderDesc.convexHull(flat)
      if (hull === null) {
        // 볼록 껍질을 만들 수 없는 점 집합이면 외접 박스로 대체한다
        const hw = Math.max(...shape.points.map((p) => Math.abs(p.x)))
        const hh = Math.max(...shape.points.map((p) => Math.abs(p.y)))
        return ColliderDesc.cuboid(hw, hh)
      }
      return hull
    }
  }
}

class PhysicsWorld {
  private readonly world: World
  private readonly tracked = new Map<number, TrackedBody>()
  private accumulator = 0

  private constructor() {
    this.world = new World({ x: 0, y: ARENA.gravity })
    this.world.timestep = FIXED_STEP
    this.createPlatform()
  }

  static async create(): Promise<PhysicsWorld> {
    await init()
    return new PhysicsWorld()
  }

  get itemCount(): number {
    return this.tracked.size
  }

  spawnItem(variant: ItemVariant, x: number): void {
    const bodyDesc = RigidBodyDesc.dynamic()
      .setTranslation(x, ARENA.spawnY)
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING)
      // 높은 곳에서 떨어지는 얇은 물건이 받침대를 뚫고 지나가는 것을 막는다
      .setCcdEnabled(true)
    const body = this.world.createRigidBody(bodyDesc)

    const collider = colliderFor(variant.shape)
      .setFriction(variant.friction)
      .setRestitution(variant.restitution)
      .setDensity(variant.density)
    this.world.createCollider(collider, body)

    this.tracked.set(body.handle, {
      body,
      variant,
      settleTimer: 0,
      settled: false,
    })
  }

  step(dt: number): StepResult {
    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.world.step()
      this.accumulator -= FIXED_STEP
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      this.accumulator = 0
    }

    const settled: SettleEvent[] = []
    let escaped = false

    for (const entry of this.tracked.values()) {
      const { x, y } = entry.body.translation()
      if (isEscaped(x, y)) {
        escaped = true
        continue
      }
      if (entry.settled) {
        continue
      }

      const velocity = entry.body.linvel()
      const speed = Math.hypot(velocity.x, velocity.y)
      const spinning = Math.abs(entry.body.angvel()) > 1
      if (speed < SETTLE_SPEED && !spinning) {
        entry.settleTimer += dt
        if (entry.settleTimer >= SETTLE_HOLD_SEC) {
          entry.settled = true
          settled.push({
            variant: entry.variant,
            topY: y + halfExtentY(entry.variant.shape),
          })
        }
      } else {
        entry.settleTimer = 0
      }
    }

    return { settled, escaped }
  }

  snapshots(): BodySnapshot[] {
    const result: BodySnapshot[] = []
    for (const [handle, entry] of this.tracked) {
      const { x, y } = entry.body.translation()
      result.push({
        handle,
        variant: entry.variant,
        x,
        y,
        rotation: entry.body.rotation(),
        settled: entry.settled,
      })
    }
    return result
  }

  reset(): void {
    for (const entry of this.tracked.values()) {
      this.world.removeRigidBody(entry.body)
    }
    this.tracked.clear()
    this.accumulator = 0
  }

  dispose(): void {
    this.world.free()
  }

  private createPlatform(): void {
    const body = this.world.createRigidBody(
      RigidBodyDesc.fixed().setTranslation(
        0,
        ARENA.platformTop - ARENA.platformHalfHeight,
      ),
    )
    this.world.createCollider(
      ColliderDesc.cuboid(ARENA.platformHalfWidth, ARENA.platformHalfHeight)
        .setFriction(0.9)
        .setRestitution(0.02),
      body,
    )
  }
}

export { PhysicsWorld, halfExtentY }
export type { SettleEvent, StepResult }
