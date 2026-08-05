import {
  init,
  ColliderDesc,
  RigidBodyDesc,
  World,
  type RigidBody,
} from '@dimforge/rapier2d-compat'
import {
  ANCHOR_ANGULAR_DAMPING,
  ANCHOR_LINEAR_DAMPING,
  ARENA,
  HEAVY_DENSITY,
  QUAKE_MIN_SPEED,
  QUAKE_REARM_DISTANCE,
  QUAKE_REIMPACT_SPEED,
  SETTLE_HOLD_SEC,
  SETTLE_SPEED,
} from '../config.ts'
import { halfExtentY } from '../shapes.ts'
import type {
  BodySnapshot,
  ItemVariant,
  OwnerId,
  PrimitiveShape,
  Vec2,
} from '../types/game.ts'
import { isEscaped, isOutOfSight } from './collapseDetector.ts'

/**
 * WASM 초기화는 프로세스에 딱 한 번이어야 한다.
 * init()을 두 번 겹쳐 호출하면 모듈이 두 번 인스턴스화되고, 먼저 만들어진 World가
 * 낡은 인스턴스를 붙들게 되어 "recursive use of an object" 로 터진다.
 * React StrictMode가 이펙트를 두 번 돌리기 때문에 실제로 밟는 경로다.
 */
let initPromise: Promise<void> | null = null

function ensureInit(): Promise<void> {
  initPromise ??= init()
  return initPromise
}

const FIXED_STEP = 1 / 60
/** 탭 전환 등으로 dt가 크게 튀었을 때 시뮬레이션이 폭주하지 않게 */
const MAX_STEPS_PER_FRAME = 5

const LINEAR_DAMPING = 0.2
/**
 * 회전 감쇠를 세게 잡는다.
 * 우산 캐노피처럼 실루엣이 둥근 물건은 이 값이 낮으면 바퀴처럼 굴러 받침대를 벗어난다.
 * 빈 받침대 중앙에 떨궜는데 저절로 떨어지는 물건이 있으면 안 되고,
 * 그 불변식은 tests/PhysicsWorld.test.ts가 모든 변형에 대해 지킨다.
 * 미끄러지는 느낌은 선형 감쇠(위)가 담당하므로 이 값이 커도 손상되지 않는다.
 */
const ANGULAR_DAMPING = 2.4

interface SettleEvent {
  readonly variant: ItemVariant
  readonly owner: OwnerId
  readonly topY: number
}

interface StepResult {
  readonly settled: readonly SettleEvent[]
  /**
   * 이번 스텝에 받침대를 벗어난 물건들의 **주인**.
   * 개수가 아니라 주인을 돌려주는 이유는, 떨어뜨린 사람이 아니라 쌓은 사람이
   * 목숨을 잃기 때문이다 — 그래서 상대 물건을 밀어내는 것이 공격이 된다.
   * 같은 사람의 물건이 둘 떨어지면 같은 값이 두 번 들어온다.
   */
  readonly escaped: readonly OwnerId[]
  /** 무거운 물건이 부딪힌 세기. 0이면 아무 일도 없었다 */
  readonly quake: number
}

interface TrackedBody {
  readonly body: RigidBody
  readonly variant: ItemVariant
  readonly owner: OwnerId
  /**
   * 양쪽이 합의한 물건 식별자.
   * Rapier 핸들은 클라이언트마다 제각각이라 권위 키프레임을 맞추는 기준이 될 수 없다 —
   * 핸들로 맞추면 게스트가 로컬에서 만든 물건과 대응되지 않아 물건이 두 배로 늘어난다.
   */
  readonly itemId: number
  readonly heavy: boolean
  settleTimer: number
  settled: boolean
  previousSpeed: number
  impacted: boolean
  /** 감쇠를 크게 걸어 잠가둔 상태인지 */
  anchored: boolean
  /** 이탈로 이미 세어둔 물건인지. 날아가는 동안 중복으로 세지 않기 위한 표시 */
  lost: boolean
  /**
   * 한 번이라도 자리를 잃은 적이 있는지.
   * 되돌리지 않는다 — 흔들린 스택은 계속 불안정한 것으로 취급한다.
   */
  dislodged: boolean
  /** 마지막으로 자리를 잡은 지점. 여기서 QUAKE_REARM_DISTANCE만큼 벗어나면 자리를 잃는다 */
  restX: number
  restY: number
}

/**
 * 물리 엔진이 받을 수 없을 만큼 얇은 도형의 최소 두께.
 * 이보다 얇은 조각으로 콜라이더를 만들면 Rapier가 퇴화 도형으로 보고 터진다.
 */
const MIN_HALF_EXTENT = 0.008

/** 면적을 가장 긴 대각선으로 나눈 실질 두께 */
function polygonThickness(points: readonly Vec2[]): number {
  let doubleArea = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    doubleArea += a.x * b.y - b.x * a.y
  }
  let longest = 0
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i]!
      const b = points[j]!
      longest = Math.max(longest, Math.hypot(a.x - b.x, a.y - b.y))
    }
  }
  return longest === 0 ? 0 : Math.abs(doubleArea) / longest
}

/** 권위 키프레임이 준 자리로 바디를 옮긴다. 속도까지 지워야 튀지 않는다 */
function place(
  entry: TrackedBody,
  frame: { x: number; y: number; rotation: number },
): void {
  entry.body.setTranslation({ x: frame.x, y: frame.y }, true)
  entry.body.setRotation(frame.rotation, true)
  entry.body.setLinvel({ x: 0, y: 0 }, true)
  entry.body.setAngvel(0, true)
}

/** 만들 수 없는 도형이면 null을 준다 — 호출부가 그 조각을 건너뛴다 */
function colliderFor(shape: PrimitiveShape): ColliderDesc | null {
  switch (shape.kind) {
    case 'circle':
      return shape.radius < MIN_HALF_EXTENT ? null : ColliderDesc.ball(shape.radius)
    case 'box':
      return shape.hw < MIN_HALF_EXTENT || shape.hh < MIN_HALF_EXTENT
        ? null
        : ColliderDesc.cuboid(shape.hw, shape.hh)
    case 'capsule':
      return shape.radius < MIN_HALF_EXTENT
        ? null
        : ColliderDesc.capsule(shape.halfHeight, shape.radius)
    case 'polygon': {
      // 바운딩 박스가 아니라 실질 두께를 본다 — 대각선으로 누운 얇은 삼각형도 걸러야 한다
      if (shape.points.length < 3 || polygonThickness(shape.points) < MIN_HALF_EXTENT * 2) {
        return null
      }
      const flat = new Float32Array(shape.points.length * 2)
      shape.points.forEach((point, index) => {
        flat[index * 2] = point.x
        flat[index * 2 + 1] = point.y
      })
      return ColliderDesc.convexHull(flat)
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
    await ensureInit()
    return new PhysicsWorld()
  }

  get itemCount(): number {
    return this.tracked.size
  }

  /**
   * owner는 물건을 쌓은 사람이다 — 이탈했을 때 목숨을 잃는 주체가 된다.
   * itemId는 양쪽이 합의한 식별자로, 권위 키프레임을 맞추는 기준이다.
   */
  spawnItem(variant: ItemVariant, x: number, owner: OwnerId, itemId = 0): number {
    const bodyDesc = RigidBodyDesc.dynamic()
      .setTranslation(x, ARENA.spawnY)
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING)
      // 높은 곳에서 떨어지는 얇은 물건이 받침대를 뚫고 지나가는 것을 막는다
      .setCcdEnabled(true)
    const body = this.world.createRigidBody(bodyDesc)

    // 오목한 실루엣(망치, 우산, 연필)은 조각 여러 개를 한 바디에 붙여 만든다
    const parts =
      variant.shape.kind === 'compound'
        ? variant.shape.parts
        : [{ shape: variant.shape, offset: { x: 0, y: 0 } }]

    let attached = 0
    for (const part of parts) {
      const desc = colliderFor(part.shape)
      if (desc === null) {
        continue
      }
      this.world.createCollider(
        desc
          .setTranslation(part.offset.x, part.offset.y)
          .setRotation(part.rotation ?? 0)
          .setFriction(variant.friction)
          .setRestitution(variant.restitution)
          .setDensity(variant.density),
        body,
      )
      attached += 1
    }

    // 모든 조각이 퇴화 도형이었다면 물건이 콜라이더 없이 허공을 통과한다.
    // 그런 데이터가 들어오면 조용히 넘어가지 말고 바로 드러나게 한다.
    if (attached === 0) {
      throw new Error(`${variant.id}: 만들 수 있는 콜라이더가 없다`)
    }

    this.tracked.set(body.handle, {
      body,
      variant,
      owner,
      itemId,
      heavy: variant.density >= HEAVY_DENSITY,
      settleTimer: 0,
      settled: false,
      previousSpeed: 0,
      impacted: false,
      anchored: false,
      dislodged: false,
      lost: false,
      restX: x,
      restY: ARENA.spawnY,
    })
    return body.handle
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
    const goneHandles: number[] = []
    const escaped: OwnerId[] = []
    let quake = 0

    for (const [handle, entry] of this.tracked) {
      const { x, y } = entry.body.translation()

      // 화면 밖으로 완전히 나갔으면 이제 치운다
      if (isOutOfSight(x, y)) {
        goneHandles.push(handle)
        continue
      }

      if (isEscaped(x, y)) {
        // 이탈은 물건당 한 번만 센다. 매 프레임 세면 목숨 3개가 한순간에 날아간다.
        // 바디는 남겨서 테두리 밖으로 날아가는 모습이 계속 그려지게 한다.
        if (!entry.lost) {
          entry.lost = true
          escaped.push(entry.owner)
        }
        continue
      }

      const velocity = entry.body.linvel()
      const speed = Math.hypot(velocity.x, velocity.y)

      // 자리를 잡았던 물건이 이만큼 밀려났으면 스택이 무너지는 중이다.
      // 잠금을 풀어 실제로 굴러떨어지게 하고, 다음 충격에 다시 흔들릴 수 있게 되돌린다.
      if (
        entry.settled &&
        Math.hypot(x - entry.restX, y - entry.restY) >= QUAKE_REARM_DISTANCE
      ) {
        entry.impacted = false
        entry.dislodged = true
        entry.restX = x
        entry.restY = y
        if (entry.anchored) {
          entry.body.setLinearDamping(LINEAR_DAMPING)
          entry.body.setAngularDamping(ANGULAR_DAMPING)
          entry.anchored = false
        }
      }

      // 빠르게 내려오다 갑자기 느려졌으면 무언가에 부딪힌 것이다.
      // 접촉 이벤트를 따로 배선하지 않아도 착지 순간을 충분히 정확하게 잡는다.
      const minImpactSpeed = entry.dislodged ? QUAKE_REIMPACT_SPEED : QUAKE_MIN_SPEED
      if (
        entry.heavy &&
        !entry.impacted &&
        entry.previousSpeed >= minImpactSpeed &&
        speed < entry.previousSpeed * 0.55
      ) {
        entry.impacted = true
        entry.restX = x
        entry.restY = y
        quake = Math.max(quake, entry.previousSpeed * entry.variant.density)
      }
      entry.previousSpeed = speed

      if (entry.settled) {
        continue
      }

      const spinning = Math.abs(entry.body.angvel()) > 1
      if (speed < SETTLE_SPEED && !spinning) {
        entry.settleTimer += dt
        if (entry.settleTimer >= SETTLE_HOLD_SEC) {
          entry.settled = true
          entry.restX = x
          entry.restY = y
          // 무거운 물건은 자리를 잡으면 잠긴다 — 웬만한 충격에 밀리지 않는다
          if (entry.heavy) {
            entry.body.setLinearDamping(ANCHOR_LINEAR_DAMPING)
            entry.body.setAngularDamping(ANCHOR_ANGULAR_DAMPING)
            entry.anchored = true
          }
          settled.push({
            variant: entry.variant,
            owner: entry.owner,
            topY: y + halfExtentY(entry.variant.shape),
          })
        }
      } else {
        entry.settleTimer = 0
      }
    }

    for (const handle of goneHandles) {
      const entry = this.tracked.get(handle)
      if (entry !== undefined) {
        this.world.removeRigidBody(entry.body)
        this.tracked.delete(handle)
      }
    }

    return { settled, escaped, quake }
  }

  snapshots(): BodySnapshot[] {
    const result: BodySnapshot[] = []
    for (const [handle, entry] of this.tracked) {
      const { x, y } = entry.body.translation()
      result.push({
        handle,
        variant: entry.variant,
        owner: entry.owner,
        x,
        y,
        rotation: entry.body.rotation(),
        settled: entry.settled,
      })
    }
    return result
  }

  /**
   * 모든 물건이 멈춰 있는가.
   * 턴제 대전에서 "떨군 물건이 자리를 잡았는지"를 판단해 턴을 넘기는 데 쓴다.
   */
  isQuiet(): boolean {
    for (const entry of this.tracked.values()) {
      const velocity = entry.body.linvel()
      if (Math.hypot(velocity.x, velocity.y) >= SETTLE_SPEED) {
        return false
      }
      if (Math.abs(entry.body.angvel()) >= 1) {
        return false
      }
    }
    return true
  }

  /**
   * 지금 상태를 네트워크로 보낼 수 있는 형태로 뽑는다.
   * 방장이 턴 끝에 한 번 보내는 권위 키프레임이다 — 매 프레임 흘리지 않는다.
   */
  frames(): {
    itemId: number
    variantId: string
    owner: OwnerId
    x: number
    y: number
    rotation: number
  }[] {
    const result = []
    for (const entry of this.tracked.values()) {
      const { x, y } = entry.body.translation()
      result.push({
        itemId: entry.itemId,
        variantId: entry.variant.id,
        owner: entry.owner,
        x,
        y,
        rotation: entry.body.rotation(),
      })
    }
    return result
  }

  /**
   * 방장이 보낸 권위 상태로 맞춘다.
   * 양쪽이 각자 물리를 돌리므로 턴 안에서 조금씩 어긋나는데, 턴이 끝날 때 여기서 되돌린다.
   * 없는 물건은 만들고, 방장에게 없는 물건은 지운다 — 방장이 본 것이 사실이다.
   */
  applyFrames(
    frames: readonly {
      itemId: number
      variantId: string
      owner: OwnerId
      x: number
      y: number
      rotation: number
    }[],
    lookup: (variantId: string) => ItemVariant | undefined,
  ): void {
    const wanted = new Map(frames.map((frame) => [frame.itemId, frame]))

    // 방장에게 없는 물건은 지운다 — 방장이 본 것이 사실이다
    for (const [handle, entry] of [...this.tracked]) {
      if (!wanted.has(entry.itemId)) {
        this.world.removeRigidBody(entry.body)
        this.tracked.delete(handle)
      }
    }

    const mine = new Map<number, TrackedBody>()
    for (const entry of this.tracked.values()) {
      mine.set(entry.itemId, entry)
    }

    for (const frame of frames) {
      const existing = mine.get(frame.itemId)
      if (existing !== undefined) {
        place(existing, frame)
        continue
      }
      const variant = lookup(frame.variantId)
      if (variant === undefined) {
        continue
      }
      const handle = this.spawnItem(variant, frame.x, frame.owner, frame.itemId)
      const spawned = this.tracked.get(handle)
      if (spawned !== undefined) {
        place(spawned, frame)
      }
    }
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

export { PhysicsWorld }
export type { SettleEvent, StepResult }
