// 타입만 가져온다. 값으로 쓰면 이 덩이가 메인 번들에 실린다 — 아래 ensureInit 참고
import type {
  ColliderDesc,
  ImpulseJoint,
  RigidBody,
  World,
} from '@dimforge/rapier2d-compat'
import {
  ANCHOR_ANGULAR_DAMPING,
  ANCHOR_LINEAR_DAMPING,
  ARENA,
  HEAVY_MASS,
  IMPACT_MIN_SPEED,
  CATCH,
  LEDGE,
  QUAKE_MIN_SIZE,
  QUAKE_MIN_SPEED,
  QUAKE_REARM_DISTANCE,
  QUAKE_REIMPACT_SPEED,
  SETTLE_HOLD_SEC,
  SETTLE_SPEED,
} from '../config.ts'
import { halfExtentY } from '../shapes.ts'
import type { ContactGraph, TouchNode } from '../systems/Merger.ts'
import type {
  AuthorityBodyFrame,
  BodySnapshot,
  ItemVariant,
  OwnerId,
  PrimitiveShape,
  Vec2,
} from '../types/game.ts'
import { isOutOfSight } from './collapseDetector.ts'

/**
 * Rapier 모듈을 **필요할 때 받아온다.**
 *
 * 정적으로 import하면 이 덩이가 메인 번들에 들어간다. `-compat` 패키지는 WASM을
 * base64로 JS 안에 박아두므로 그 크기가 1.5MB가 넘고(전체 번들의 77%), 브라우저는
 * **그것을 다 받아 파싱할 때까지 화면에 아무것도 그리지 못한다.** 동적 import로
 * 갈라두면 타이틀 화면이 먼저 뜨고 물리는 그 뒤에 따라온다.
 *
 * 타이틀의 "혼자 하기"는 여전히 물리가 준비될 때까지 눌리지 않는다. 이 변경이
 * 앞당기는 것은 **첫 그림**이지 시작 가능 시점이 아니다.
 *
 * WASM 초기화는 프로세스에 딱 한 번이어야 한다. init()을 두 번 겹쳐 호출하면
 * 모듈이 두 번 인스턴스화되고, 먼저 만들어진 World가 낡은 인스턴스를 붙들게 되어
 * "recursive use of an object" 로 터진다. React StrictMode가 이펙트를 두 번 돌리기
 * 때문에 실제로 밟는 경로다 — 그래서 프로미스를 메모이즈한다.
 */
type Rapier = typeof import('@dimforge/rapier2d-compat')

let initPromise: Promise<Rapier> | null = null
let loaded: Rapier | null = null

function ensureInit(): Promise<Rapier> {
  initPromise ??= (async () => {
    const module = await import('@dimforge/rapier2d-compat')
    await module.init()
    loaded = module
    return module
  })()
  return initPromise
}

/**
 * 받아둔 모듈. `PhysicsWorld.create()`를 기다린 뒤에만 쓸 수 있다.
 *
 * 못 받은 상태에서 부르면 조용히 넘어가지 않고 바로 터뜨린다 — 물리 없이 만들어진
 * World는 그 자체로 고장이고, 나중에 이상한 자리에서 드러나면 원인을 찾기 어렵다.
 */
function rapier(): Rapier {
  if (loaded === null) {
    throw new Error('Rapier를 아직 받지 않았다. PhysicsWorld.create()를 먼저 기다려야 한다')
  }
  return loaded
}

/** 버퍼를 제자리에서 갱신하기 위해 readonly를 벗긴다 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

const FIXED_STEP = 1 / 60
/** 탭 전환 등으로 dt가 크게 튀었을 때 시뮬레이션이 폭주하지 않게 */
const MAX_STEPS_PER_FRAME = 5
/**
 * 높은 화살표/스폰 위치에서도 착지 충격이 예전보다 과하게 세지지 않도록 아래 속도를 묶는다.
 * 시각적으로는 위에서 떨어지지만, 탑을 때리는 힘은 플레이 가능한 범위에 남겨둔다.
 */
const MAX_DROP_SPEED = 6.4

const LINEAR_DAMPING = 0.2
/*
 * 회전 감쇠는 물건마다 다르다(words.ts의 angularDamping).
 * 낮으면 잘 구르는데, 우산 캐노피처럼 실루엣이 둥근 물건은 바퀴처럼 굴러
 * 받침대를 벗어난다. 빈 받침대 중앙에 떨궜는데 저절로 떨어지는 물건이 있으면
 * 안 되고, 그 불변식은 tests/PhysicsWorld.test.ts가 모든 변형에 대해 지킨다.
 * 개성을 주려고 낮출 때는 그 테스트가 한계를 알려준다.
 */

/** 두 핸들로 만드는 짝 열쇠. 순서가 달라도 같은 짝이다 */
function weldKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/** 월드 좌표를 어떤 바디의 로컬 좌표로 옮긴다 */
function toLocal(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number,
): { x: number; y: number } {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const cos = Math.cos(-rotation)
  const sin = Math.sin(-rotation)
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

interface SettleEvent {
  readonly variant: ItemVariant
  readonly owner: OwnerId
  readonly topY: number
}

/**
 * 물건이 무언가에 부딪힌 순간.
 *
 * `settled`와 따로 두는 이유는 **시점이 다르기** 때문이다. 자리를 잡았다는 판정은
 * 느려진 상태가 SETTLE_HOLD_SEC(0.35초)만큼 이어져야 나오는데, 소리는 부딪히는
 * 그 순간에 나야 한다 — 0.35초 늦은 "쿵"은 화면과 어긋난 것으로 들린다.
 */
interface ImpactEvent {
  /** 표시 보정 중인 물건의 위치 연출만 골라 숨기기 위한 로컬 바디 식별자 */
  readonly handle: number
  readonly variant: ItemVariant
  /** 물리 세계에서 콜라이더까지 반영해 잰 실제 질량 */
  readonly mass: number
  /** 부딪히기 직전 속도 x 질량 */
  readonly impact: number
  /**
   * 이 물건이 **떨어져서 처음** 닿은 것인가. 자리를 잃고 다시 부딪힌 것이면 거짓이다.
   *
   * 소리는 둘을 가리지 않는다 — 무너지는 동안에도 부딪힘은 들려야 한다. 가리는 것은
   * 화면 연출이다. 탑이 무너지면 한 프레임에 부딪힘이 열 개도 들어오는데, 그때마다
   * 화면이 물들면 여러 색이 겹쳐 무엇이 얹혔는지가 오히려 안 보인다.
   */
  readonly first: boolean
  /** 부딪힌 자리(월드 좌표). 그 자리에서 물이 퍼지는 것 같은 연출에 쓴다 */
  readonly x: number
  readonly y: number
}

/** 받침대를 벗어난 물건 하나. 고양이가 이 자리로 뛰어든다 */
interface EscapeEvent {
  readonly owner: OwnerId
  readonly variant: ItemVariant
  /**
   * 회수 판을 타고 나갔는가. **이 이탈은 목숨을 깎지 않는다**(`systems/Catcher.ts`).
   *
   * 선택 필드인 이유는 이것을 읽지 않는 쪽(고양이)이 이미 있기 때문이다 —
   * 그쪽은 `owner`·`variant`·`x`·`y`만 본다.
   */
  readonly recalled?: boolean
  /** 벗어난 자리(월드 좌표) */
  readonly x: number
  readonly y: number
}

interface StepResult {
  readonly settled: readonly SettleEvent[]
  /**
   * 이번 스텝에 부딪힌 물건들. quake와 달리 **모든** 물건을 담는다 —
   * quake는 크고 무거운 것만 보므로(entry.shakes) 가벼운 것이 얹히는 순간을 놓친다.
   */
  readonly impacts: readonly ImpactEvent[]
  /**
   * 이번 스텝에 받침대를 벗어난 물건들.
   *
   * **주인을 함께 돌려주는 이유**는 떨어뜨린 사람이 아니라 쌓은 사람이 목숨을 잃기
   * 때문이다 — 그래서 상대 물건을 밀어내는 것이 공격이 된다. 같은 사람의 물건이
   * 둘 떨어지면 같은 주인이 두 번 들어온다.
   *
   * **무엇이 어디서 떨어졌는지도 싣는다.** 고양이가 그 자리로 뛰어들어 그 물건을
   * 물고 나가기 때문이다(`systems/CatPickup.ts`).
   */
  readonly escaped: readonly EscapeEvent[]
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
  /** 자리를 잡으면 잠기는가. 관성으로 버티는 물건이다 */
  readonly heavy: boolean
  /**
   * 부딪힐 때 화면을 흔드는가.
   * 무거움과 따로 두는 이유는, 작고 조밀한 물건이 흔들면 눈과 어긋나기 때문이다.
   * 잠금은 무게의 문제이고 흔들림은 보이는 크기의 문제다.
   */
  readonly shakes: boolean
  readonly sticky: boolean
  settleTimer: number
  settled: boolean
  previousSpeed: number
  impacted: boolean
  /**
   * 부딪힘을 이미 소리로 알린 물건인지.
   * `impacted`와 따로 두는 이유는 그쪽이 지진 전용(entry.shakes)이라 가벼운 물건은
   * 아예 들어오지 않기 때문이다. 한 번 잠가두면 튕기며 나는 연발음도 막힌다.
   */
  struck: boolean
  /** 감쇠를 크게 걸어 잠가둔 상태인지 */
  anchored: boolean
  /** 이탈로 이미 세어둔 물건인지. 날아가는 동안 중복으로 세지 않기 위한 표시 */
  lost: boolean
  /**
   * 회수로 떨어뜨린 물건인가. 나갈 때 **목숨을 깎지 않는다**.
   *
   * 물건에 붙여두는 이유는 나가는 **순간**에는 그것이 회수인지 알 수 없기 때문이다 —
   * 회수 판은 이미 사라졌을 수도 있고, 같은 프레임에 탑이 무너져 여럿이 함께 나갈
   * 수도 있다. 떨어뜨릴 때 표를 달아두면 그 물건 하나만 정확히 가려낸다.
   */
  readonly recalled: boolean
  /**
   * 한 번이라도 자리를 잃은 적이 있는지.
   * 되돌리지 않는다 — 흔들린 스택은 계속 불안정한 것으로 취급한다.
   */
  dislodged: boolean
  /** 마지막으로 자리를 잡은 지점. 여기서 QUAKE_REARM_DISTANCE만큼 벗어나면 자리를 잃는다 */
  restX: number
  restY: number
  /** 권위 교정 직후의 속도 변화가 가짜 충격으로 읽히지 않게 한 스텝 쉰다 */
  suppressImpactSteps: number
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

interface BodyCorrection {
  readonly handle: number
  readonly itemId: number
  /** 교정 첫 화면을 직전 표시 위치에 두기 위한 pre - authority 오프셋 */
  readonly dx: number
  readonly dy: number
  readonly rotation: number
}

function shortestAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value))
}

/** 권위 키프레임을 적용하되 파생 상태와 잠듦까지 일관되게 복원한다. */
function place(entry: TrackedBody, frame: AuthorityBodyFrame): void {
  entry.body.setTranslation({ x: frame.x, y: frame.y }, false)
  entry.body.setRotation(frame.rotation, false)
  entry.suppressImpactSteps = 1

  // 구형 프레임은 위치만 권위였다. 새 상태가 없다고 로컬 정착·앵커를 지우면 안 된다.
  if (frame.stateVersion === undefined) {
    entry.body.setLinvel({ x: 0, y: 0 }, false)
    entry.body.setAngvel(0, false)
    entry.previousSpeed = 0
    return
  }

  entry.body.setLinvel({ x: frame.vx, y: frame.vy }, false)
  entry.body.setAngvel(frame.angularVelocity, false)
  entry.settled = frame.settled
  entry.anchored = frame.anchored
  entry.lost = frame.lost
  entry.dislodged = frame.dislodged
  entry.impacted = frame.impacted
  entry.struck = frame.struck
  entry.restX = frame.restX
  entry.restY = frame.restY
  entry.settleTimer = frame.settleTimer
  entry.previousSpeed = frame.previousSpeed
  entry.body.setLinearDamping(frame.anchored ? ANCHOR_LINEAR_DAMPING : LINEAR_DAMPING)
  entry.body.setAngularDamping(
    frame.anchored ? ANCHOR_ANGULAR_DAMPING : entry.variant.angularDamping,
  )
  if (frame.sleeping) entry.body.sleep()
  else entry.body.wakeUp()
}

/** 만들 수 없는 도형이면 null을 준다 — 호출부가 그 조각을 건너뛴다 */
function colliderFor(shape: PrimitiveShape): ColliderDesc | null {
  switch (shape.kind) {
    case 'circle':
      return shape.radius < MIN_HALF_EXTENT ? null : rapier().ColliderDesc.ball(shape.radius)
    case 'box':
      return shape.hw < MIN_HALF_EXTENT || shape.hh < MIN_HALF_EXTENT
        ? null
        : rapier().ColliderDesc.cuboid(shape.hw, shape.hh)
    case 'capsule':
      return shape.radius < MIN_HALF_EXTENT
        ? null
        : rapier().ColliderDesc.capsule(shape.halfHeight, shape.radius)
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
      return rapier().ColliderDesc.convexHull(flat)
    }
  }
}

class PhysicsWorld {
  private readonly world: World
  private readonly tracked = new Map<number, TrackedBody>()
  /** snapshots()가 재사용하는 버퍼. 매 프레임 새로 만들지 않기 위한 것 */
  private readonly snapshotBuffer: Mutable<BodySnapshot>[] = []
  /** countsByVariant()가 다시 채워 쓰는 Map. 같은 이유로 매 프레임 새로 만들지 않는다 */
  private readonly variantCounts = new Map<string, number>()
  /**
   * 붙어버린 짝과 그 관절. 열쇠는 두 핸들을 작은 것부터 이어붙인 문자열이다.
   * 같은 짝에 관절을 두 번 걸면 서로 당겨 물건이 떨리므로 반드시 한 번만 건다.
   */
  private readonly welds = new Map<string, ImpulseJoint>()
  /** 히든을 만날 때마다 공중에 서는 작은 통나무. 판이 끝나면 함께 치운다 */
  private readonly ledgeList: { x: number; y: number; halfWidth: number; body: RigidBody }[] = []
  /** 지금 서 있는 회수 판. 잠깐 있다 사라지므로 하나뿐이다 */
  private catcherBody: RigidBody | null = null
  /** 이 높이보다 아래로 내려가면 이탈이다. 싱글은 카메라를 따라 움직이고, 대전은 기본값을 쓴다 */
  private escapeY: number = ARENA.killY
  private accumulator = 0

  private constructor() {
    this.world = new (rapier().World)({ x: 0, y: ARENA.gravity })
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
  spawnItem(
    variant: ItemVariant,
    x: number,
    owner: OwnerId,
    itemId = 0,
    recalled = false,
  ): number {
    return this.spawnItemAt(variant, x, ARENA.spawnY, owner, itemId, recalled)
  }

  /**
   * 자리를 지정해 물건을 만든다. 합성 결과가 재료들이 있던 자리에서 태어나야
   * "저것들이 합쳐졌다"로 보이기 때문에 낙하 지점과 분리해 둔다.
   */
  spawnItemAt(
    variant: ItemVariant,
    x: number,
    y: number,
    owner: OwnerId,
    itemId = 0,
    recalled = false,
  ): number {
    return this.spawnItemMovingAt(variant, x, y, owner, itemId, recalled)
  }

  spawnItemMovingAt(
    variant: ItemVariant,
    x: number,
    y: number,
    owner: OwnerId,
    itemId = 0,
    recalled = false,
    velocity: Vec2 = { x: 0, y: 0 },
    angularVelocity = 0,
  ): number {
    const bodyDesc = rapier().RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(velocity.x, velocity.y)
      .setAngvel(angularVelocity)
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(variant.angularDamping)
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
      recalled,
      // 콜라이더를 다 붙인 뒤라야 실제 질량이 나온다
      heavy: body.mass() >= HEAVY_MASS,
      shakes:
        body.mass() >= HEAVY_MASS &&
        Math.max(variant.artBounds.hw, variant.artBounds.hh) * 2 >= QUAKE_MIN_SIZE,
      sticky: variant.sticky,
      settleTimer: 0,
      settled: false,
      previousSpeed: 0,
      impacted: false,
      struck: false,
      anchored: false,
      dislodged: false,
      lost: false,
      restX: x,
      restY: y,
      suppressImpactSteps: 0,
    })
    return body.handle
  }

  /**
   * 끈적한 물건에 닿은 것을 그 자리에서 실제로 붙여버린다.
   *
   * 속도를 죽이는 방식은 실패했다 — 물건이 탑 위에 자리를 잡으려면 살짝 미끄러져야
   * 하는데 그걸 막으니 모서리에서 굴러떨어져 오히려 더 낮은 곳에 앉았다. 게다가
   * 아래에 받쳐주는 것이 없으면 속도를 아무리 눌러도 중력이 이긴다.
   * 옆면에 닿아 매달리려면 실제로 붙잡는 힘이 있어야 하고, 그것이 고정 관절이다.
   *
   * 끈적함은 **한 다리만** 건너간다. 끈적한 것에 닿은 물건은 붙지만, 그 물건에
   * 닿은 다음 물건까지 붙지는 않는다. 그러지 않으면 탑 전체가 한 덩어리가 되어
   * 무너짐이라는 사건 자체가 사라진다.
   */
  private weldSticky(): void {
    for (const [handle, entry] of this.tracked) {
      if (!entry.sticky || entry.lost) {
        continue
      }
      for (let i = 0; i < entry.body.numColliders(); i += 1) {
        this.world.contactPairsWith(entry.body.collider(i), (other) => {
          const otherHandle = other.parent()?.handle
          if (otherHandle === undefined || otherHandle === handle) {
            return
          }
          const partner = this.tracked.get(otherHandle)
          if (partner === undefined || partner.lost) {
            return
          }
          this.weld(handle, entry, otherHandle, partner)
        })
      }
    }
  }

  private weld(handleA: number, a: TrackedBody, handleB: number, b: TrackedBody): void {
    const key = weldKey(handleA, handleB)
    if (this.welds.has(key)) {
      return
    }

    /*
     * 지금의 상대 자세를 그대로 굳힌다.
     * 두 물건의 중간점을 각자의 로컬 좌표로 옮겨 걸쇠로 삼고, 회전 차이를 frame으로
     * 넘긴다. 이렇게 해야 붙는 순간 서로를 끌어당겨 튀는 일이 없다.
     */
    const posA = a.body.translation()
    const posB = b.body.translation()
    const rotA = a.body.rotation()
    const rotB = b.body.rotation()
    const mid = { x: (posA.x + posB.x) / 2, y: (posA.y + posB.y) / 2 }

    const joint = this.world.createImpulseJoint(
      rapier().JointData.fixed(
        toLocal(mid, posA, rotA),
        0,
        toLocal(mid, posB, rotB),
        rotA - rotB,
      ),
      a.body,
      b.body,
      true,
    )
    /*
     * 붙인 짝끼리는 충돌을 끈다.
     *
     * 켜두면 접촉 제약이 둘을 밀어내는 동안 관절이 붙잡아, 솔버가 매 스텝 힘을
     * 주고받으며 에너지를 만들어낸다. 실측하면 달팽이가 닿은 자리보다 0.5 높이
     * 솟구쳤다가 받침대 밖으로 날아갔다. 이미 붙어 있는 둘 사이에 충돌 판정은
     * 할 일이 없으므로 끄는 것이 맞다.
     */
    joint.setContactsEnabled(false)
    this.welds.set(key, joint)
  }

  /** 사라지는 물건에 걸린 관절 기록을 지운다. 관절 자체는 Rapier가 바디와 함께 걷어낸다 */
  private forgetWelds(handle: number): void {
    for (const key of [...this.welds.keys()]) {
      if (key.startsWith(`${handle}:`) || key.endsWith(`:${handle}`)) {
        this.welds.delete(key)
      }
    }
  }

  /**
   * 지금 아레나에 있는 변형별 개수. 이탈이 확정된 물건은 세지 않는다
   * (`contactGraph`가 빼는 것과 같은 기준이어야 한다).
   *
   * 접촉을 보기 **전에** "합칠 재료가 갖춰졌는지"를 물어보려고 있다.
   * `contactGraph()`는 물건마다 콜라이더를 전부 훑고 WASM 경계를 여러 번 넘지만
   * 이쪽은 순수 JS로 Map 하나를 훑는다 — 값이 두 자릿수 배로 싸다.
   *
   * **돌려준 Map은 다음 호출에서 덮어쓴다.** 프레임마다 부르는 자리라 새로 만들지 않는다.
   */
  countsByVariant(): ReadonlyMap<string, number> {
    const counts = this.variantCounts
    counts.clear()
    for (const entry of this.tracked.values()) {
      if (entry.lost) {
        continue
      }
      counts.set(entry.variant.id, (counts.get(entry.variant.id) ?? 0) + 1)
    }
    return counts
  }

  /**
   * 지금 무엇이 무엇에 닿아 있는지.
   *
   * 물건 하나가 콜라이더 여러 개로 이루어질 수 있으므로(오목한 실루엣은 볼록
   * 조각들로 나눠 붙인다) 조각끼리의 접촉을 바디 단위로 접어서 돌려준다.
   * 이탈이 확정된 물건은 뺀다 — 떨어져 나가는 중에 스쳤다고 합쳐지면
   * 플레이어가 이유를 알 수 없다.
   */
  contactGraph(): ContactGraph {
    const nodes: TouchNode[] = []
    const seen = new Set<string>()
    const edges: [number, number][] = []

    for (const [handle, entry] of this.tracked) {
      if (entry.lost) {
        continue
      }
      nodes.push({ itemId: handle, variantId: entry.variant.id })
    }
    const live = new Set(nodes.map((node) => node.itemId))

    for (const handle of live) {
      const entry = this.tracked.get(handle)
      if (entry === undefined) {
        continue
      }
      for (let i = 0; i < entry.body.numColliders(); i += 1) {
        const collider = entry.body.collider(i)
        this.world.contactPairsWith(collider, (other) => {
          const otherHandle = other.parent()?.handle
          if (otherHandle === undefined || otherHandle === handle || !live.has(otherHandle)) {
            return
          }
          const key = handle < otherHandle ? `${handle}:${otherHandle}` : `${otherHandle}:${handle}`
          if (seen.has(key)) {
            return
          }
          seen.add(key)
          edges.push([handle, otherHandle])
        })
      }
    }

    return { nodes, edges }
  }

  /**
   * 재료를 치우고 그 자리에 결과물을 놓는다.
   *
   * 자리는 재료들의 **무게중심**이다. 가장 아래 재료 위에 얹으면 결과물이
   * 위로 솟구쳐 탑을 밀어내고, 가장 위에 두면 허공에서 떨어진다.
   * 속도를 물려주지 않는 것도 같은 이유다 — 합성이 스택을 흔드는 사건이 되면
   * 합치기가 보상이 아니라 위험이 된다.
   */
  mergeItems(handles: readonly number[], result: ItemVariant, owner: OwnerId): number | null {
    const entries = handles
      .map((handle) => this.tracked.get(handle))
      .filter((entry): entry is TrackedBody => entry !== undefined)
    if (entries.length !== handles.length || entries.length === 0) {
      return null
    }

    let sumX = 0
    let sumY = 0
    for (const entry of entries) {
      const position = entry.body.translation()
      sumX += position.x
      sumY += position.y
    }
    const x = sumX / entries.length
    const y = sumY / entries.length

    for (const entry of entries) {
      this.forgetWelds(entry.body.handle)
      this.tracked.delete(entry.body.handle)
      this.world.removeRigidBody(entry.body)
    }

    return this.spawnItemAt(result, x, y, owner)
  }

  step(dt: number): StepResult {
    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.clampDropSpeeds()
      this.world.step()
      this.accumulator -= FIXED_STEP
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      this.accumulator = 0
    }

    this.weldSticky()

    const settled: SettleEvent[] = []
    const impacts: ImpactEvent[] = []
    const goneHandles: number[] = []
    const escaped: EscapeEvent[] = []
    let quake = 0

    for (const [handle, entry] of this.tracked) {
      const { x, y } = entry.body.translation()

      // 화면 밖으로 완전히 나갔으면 이제 치운다
      if (isOutOfSight(x, y)) {
        goneHandles.push(handle)
        continue
      }

      if (this.isEscaped(entry, x, y)) {
        /*
         * 이탈은 물건당 한 번만 센다. 매 프레임 세면 목숨 3개가 한순간에 날아간다.
         *
         * **바디는 그 자리에서 치운다.** 예전에는 남겨서 테두리 밖으로 날아가는 모습을
         * 보여줬는데, 지금은 고양이가 뛰어들어 물어 간다(`systems/CatPickup.ts`) —
         * 물건이 두 벌로 보이지 않으려면 세계에서는 사라져야 한다.
         */
        if (!entry.lost) {
          entry.lost = true
          escaped.push({ owner: entry.owner, variant: entry.variant, x, y, recalled: entry.recalled })
          goneHandles.push(handle)
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
        // 무너지는 중이라면 다시 부딪힐 때 또 소리가 나야 한다
        entry.struck = false
        entry.dislodged = true
        entry.restX = x
        entry.restY = y
        if (entry.anchored) {
          entry.body.setLinearDamping(LINEAR_DAMPING)
          entry.body.setAngularDamping(entry.variant.angularDamping)
          entry.anchored = false
        }
      }

      // 빠르게 내려오다 갑자기 느려졌으면 무언가에 부딪힌 것이다.
      // 접촉 이벤트를 따로 배선하지 않아도 착지 순간을 충분히 정확하게 잡는다.
      const minImpactSpeed = entry.dislodged ? QUAKE_REIMPACT_SPEED : QUAKE_MIN_SPEED
      if (
        entry.suppressImpactSteps <= 0 &&
        entry.shakes &&
        !entry.impacted &&
        entry.previousSpeed >= minImpactSpeed &&
        speed < entry.previousSpeed * 0.55
      ) {
        entry.impacted = true
        entry.restX = x
        entry.restY = y
        quake = Math.max(quake, entry.previousSpeed * entry.body.mass())
      }

      /*
       * 소리를 낼 부딪힘은 같은 방식으로 잡되 문턱만 낮춘다.
       * 위의 지진 판정은 크고 무거운 물건만 보므로(entry.shakes) 가벼운 것이
       * 탑 위에 얹히는 순간이 통째로 빠진다 — 정작 가장 자주 일어나는 일이다.
       */
      if (
        entry.suppressImpactSteps <= 0 &&
        !entry.struck &&
        entry.previousSpeed >= IMPACT_MIN_SPEED &&
        speed < entry.previousSpeed * 0.55
      ) {
        entry.struck = true
        const mass = entry.body.mass()
        impacts.push({
          handle,
          variant: entry.variant,
          mass,
          impact: entry.previousSpeed * mass,
          // dislodged는 한 번 켜지면 꺼지지 않는다 — 무너진 물건은 다시 처음이 되지 않는다
          first: !entry.dislodged,
          x,
          y,
        })
      }

      entry.previousSpeed = speed
      if (steps > 0 && entry.suppressImpactSteps > 0) entry.suppressImpactSteps -= 1

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
        this.forgetWelds(handle)
        this.world.removeRigidBody(entry.body)
        this.tracked.delete(handle)
      }
    }

    return { settled, impacts, escaped, quake }
  }

  private clampDropSpeeds(): void {
    for (const entry of this.tracked.values()) {
      if (entry.settled || entry.lost) {
        continue
      }
      const velocity = entry.body.linvel()
      if (velocity.y >= -MAX_DROP_SPEED) {
        continue
      }
      entry.body.setLinvel({ x: velocity.x, y: -MAX_DROP_SPEED }, true)
    }
  }

  /**
   * 렌더러에 넘길 스냅샷. **돌려준 배열과 그 안의 객체는 다음 호출에서 덮어쓴다.**
   *
   * 프레임마다 바디 수만큼 객체를 새로 만들면 초당 수백 개의 쓰레기가 쌓여 주기적으로
   * GC가 돌고, 그것이 "중간중간 살짝 멈춤"으로 느껴진다. 렌더러는 받은 즉시 그리고 버리므로
   * 버퍼를 재사용해도 안전하다 — 대신 붙들어 두려면 그 자리에서 복사해야 한다.
   */
  snapshots(): readonly BodySnapshot[] {
    const buffer = this.snapshotBuffer
    let count = 0
    for (const [handle, entry] of this.tracked) {
      const { x, y } = entry.body.translation()
      const slot = (buffer[count] ??= {
        handle,
        variant: entry.variant,
        owner: entry.owner,
        x,
        y,
        rotation: 0,
        settled: false,
        recalled: false,
      })
      slot.handle = handle
      slot.variant = entry.variant
      slot.owner = entry.owner
      slot.x = x
      slot.y = y
      slot.rotation = entry.body.rotation()
      slot.settled = entry.settled
      slot.recalled = entry.recalled
      count += 1
    }
    // 지난 프레임에 있었지만 지금은 없는 물건의 칸을 버린다
    buffer.length = count
    return buffer
  }

  /**
   * 모든 물건이 멈춰 있는가.
   * 턴제 대전에서 "떨군 물건이 자리를 잡았는지"를 판단해 턴을 넘기는 데 쓴다.
   */
  /**
   * **자리를 잡은** 것들의 꼭대기 높이. 아무것도 없으면 받침대 윗면이다.
   *
   * 낙하 중인 물건을 세면 안 된다. 물건은 스폰 높이에서 생기므로, 세는 순간
   * 꼭대기가 스폰 높이로 튀어 카메라가 따라 올라갔다가 착지하면 되돌아온다 —
   * 낮은 탑에서도 물건 하나마다 화면이 위아래로 출렁인다.
   *
   * 이탈이 확정된 물건도 세지 않는다. 튕겨 날아가는 중인 것에 카메라가 끌려가면
   * 남은 탑이 보이지 않는다. 회수 손에 올라간 물건도 세지 않는다. 그 물건은 잠깐
   * 멈출 수는 있지만 쌓일 물건이 아니므로, 카메라가 손을 따라 위로 튀면 안 된다.
   * (한 번 자리를 잡은 물건은 무너지는 중에도 계속 세므로, 탑이 쏟아지는 동안 시야가
   * 갑자기 바닥으로 내려앉지는 않는다.)
   */
  stackTop(): number {
    let top: number = ARENA.platformTop
    for (const entry of this.tracked.values()) {
      if (entry.lost || entry.recalled || !entry.settled) {
        continue
      }
      const height = entry.body.translation().y + halfExtentY(entry.variant.shape)
      if (height > top) {
        top = height
      }
    }
    return top
  }

  setEscapeY(y: number): void {
    this.escapeY = y
  }

  private isEscaped(entry: TrackedBody, x: number, y: number): boolean {
    if (Math.abs(x) > ARENA.halfWidth || y < ARENA.killY) {
      return true
    }
    /*
     * 카메라가 올라간 싱글 판에서는 화면 아래로 사라지는 순간을 바로 잡아야 고양이가
     * 늦지 않는다. 중심점이 아니라 아랫면을 본다. 눈에는 물건의 아래쪽이 먼저 화면을
     * 벗어나므로, 중심이 선을 넘을 때까지 기다리면 고양이가 한 박자 늦다.
     *
     * 다만 이미 자리 잡은 물건까지 이 기준으로 세면, 카메라가 높은 동안 받침대 위
     * 물건이 화면 아래에 있다는 이유만으로 계속 목숨을 깎는다.
     */
    return (
      !entry.settled &&
      !this.hasSupportBelow(entry, x) &&
      y - halfExtentY(entry.variant.shape) < this.escapeY
    )
  }

  private hasSupportBelow(entry: TrackedBody, x: number): boolean {
    const halfWidth = Math.max(entry.variant.artBounds.hw, 0.1)
    if (Math.abs(x) - halfWidth <= ARENA.platformHalfWidth) {
      return true
    }
    return this.ledgeList.some((ledge) => Math.abs(x - ledge.x) - halfWidth <= ledge.halfWidth)
  }

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
  frames(): AuthorityBodyFrame[] {
    const result: AuthorityBodyFrame[] = []
    for (const entry of this.tracked.values()) {
      const { x, y } = entry.body.translation()
      const velocity = entry.body.linvel()
      result.push({
        itemId: entry.itemId,
        variantId: entry.variant.id,
        owner: entry.owner,
        x,
        y,
        rotation: entry.body.rotation(),
        stateVersion: 1,
        vx: velocity.x,
        vy: velocity.y,
        angularVelocity: entry.body.angvel(),
        sleeping: entry.body.isSleeping(),
        settled: entry.settled,
        anchored: entry.anchored,
        lost: entry.lost,
        settleTimer: entry.settleTimer,
        restX: entry.restX,
        restY: entry.restY,
        previousSpeed: entry.previousSpeed,
        dislodged: entry.dislodged,
        impacted: entry.impacted,
        struck: entry.struck,
      })
    }
    return result
  }

  /**
   * 방장이 보낸 권위 상태로 맞춘다.
   * 양쪽이 각자 물리를 돌리므로 턴 안에서 조금씩 어긋나는데, 턴이 끝날 때 여기서 되돌린다.
   * 없는 물건은 만들고, 방장에게 없는 물건은 지운다 — 방장이 본 것이 사실이다.
   */
  /**
   * 붙어 있는 짝을 **itemId로** 돌려준다. Rapier 핸들은 세계마다 달라 기준이 될 수 없다.
   * 언제나 작은 id가 앞이고 정렬되어 있어, 양쪽 목록을 그대로 견줄 수 있다.
   */
  weldPairs(): [number, number][] {
    const byHandle = new Map<number, number>()
    for (const [handle, entry] of this.tracked) {
      byHandle.set(handle, entry.itemId)
    }
    const pairs: [number, number][] = []
    for (const key of this.welds.keys()) {
      const [rawA, rawB] = key.split(':')
      const a = byHandle.get(Number(rawA))
      const b = byHandle.get(Number(rawB))
      if (a === undefined || b === undefined) {
        continue
      }
      pairs.push(a < b ? [a, b] : [b, a])
    }
    pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1])
    return pairs
  }

  /** 검사용 — weldPairs와 같은 값이다 */
  debugWeldPairs(): [number, number][] {
    return this.weldPairs()
  }

  applyFrames(
    frames: readonly AuthorityBodyFrame[],
    lookup: (variantId: string) => ItemVariant | undefined,
    welds: readonly (readonly [number, number])[] = [],
  ): BodyCorrection[] {
    const corrections: BodyCorrection[] = []
    const wanted = new Map(frames.map((frame) => [frame.itemId, frame]))

    // 방장에게 없는 물건은 지운다 — 방장이 본 것이 사실이다
    for (const [handle, entry] of [...this.tracked]) {
      if (!wanted.has(entry.itemId)) {
        this.forgetWelds(handle)
        this.world.removeRigidBody(entry.body)
        this.tracked.delete(handle)
      }
    }

    const mine = new Map<number, TrackedBody>()
    for (const entry of this.tracked.values()) {
      mine.set(entry.itemId, entry)
    }

    for (const frame of frames) {
      let existing = mine.get(frame.itemId)
      if (
        existing !== undefined &&
        (existing.variant.id !== frame.variantId || existing.owner !== frame.owner)
      ) {
        const handle = existing.body.handle
        this.forgetWelds(handle)
        this.world.removeRigidBody(existing.body)
        this.tracked.delete(handle)
        existing = undefined
      }
      if (existing !== undefined) {
        const before = existing.body.translation()
        corrections.push({
          handle: existing.body.handle,
          itemId: frame.itemId,
          dx: before.x - frame.x,
          dy: before.y - frame.y,
          rotation: shortestAngle(existing.body.rotation() - frame.rotation),
        })
        place(existing, frame)
        continue
      }
      const variant = lookup(frame.variantId)
      if (variant === undefined) continue
      const handle = this.spawnItem(variant, frame.x, frame.owner, frame.itemId)
      const spawned = this.tracked.get(handle)
      if (spawned !== undefined) place(spawned, frame)
    }

    this.applyWelds(welds)
    // 관절 생성은 바디를 깨우므로 권위가 잠든 바디를 마지막에 다시 잠근다.
    const frameById = new Map(frames.map((frame) => [frame.itemId, frame]))
    for (const entry of this.tracked.values()) {
      const frame = frameById.get(entry.itemId)
      if (frame?.stateVersion === 1 && frame.sleeping) entry.body.sleep()
    }
    return corrections
  }

  /**
   * 관절 구조를 방장의 것으로 갈아끼운다.
   *
   * **자리만 맞춰서는 부족하다.** 끈적함은 매 프레임 접촉을 보고 양쪽이 각자 정하는데,
   * 접촉이 잡히는 순간이 한 프레임만 어긋나도 한쪽에만 관절이 생긴다. 관절은 한 번
   * 생기면 영구적이라, 그 뒤로는 자리를 아무리 맞춰도 탑이 다르게 움직인다 —
   * 사람 눈에는 "블럭 상황이 다르다"로 보인다.
   *
   * 통째로 지우고 다시 만든다. 지금 자리가 이미 방장의 것이므로, 다시 만든 관절은
   * 방장이 굳혀둔 것과 같은 상대 자세를 갖는다.
   */
  private applyWelds(welds: readonly (readonly [number, number])[]): void {
    for (const joint of this.welds.values()) {
      this.world.removeImpulseJoint(joint, true)
    }
    this.welds.clear()

    const byItem = new Map<number, { handle: number; entry: TrackedBody }>()
    for (const [handle, entry] of this.tracked) {
      byItem.set(entry.itemId, { handle, entry })
    }
    for (const [a, b] of welds) {
      const left = byItem.get(a)
      const right = byItem.get(b)
      if (left === undefined || right === undefined) {
        continue
      }
      this.weld(left.handle, left.entry, right.handle, right.entry)
    }
  }

  reset(): void {
    for (const entry of this.tracked.values()) {
      this.world.removeRigidBody(entry.body)
    }
    for (const ledge of this.ledgeList) {
      this.world.removeRigidBody(ledge.body)
    }
    this.ledgeList.length = 0
    this.clearCatcher()
    this.tracked.clear()
    this.welds.clear()
    this.accumulator = 0
    this.escapeY = ARENA.killY
  }

  dispose(): void {
    this.world.free()
  }

  /**
   * 공중에 작은 통나무를 세운다. 받침대와 같은 고정 몸체다.
   *
   * 마찰은 받침대와 같게 둔다 — 여기만 미끄러우면 "새 자리를 줬는데 얹히지 않는"
   * 것이 되고, 여기만 잘 붙으면 본 받침대보다 좋은 자리가 되어 판이 통나무 위로 옮겨간다.
   */
  addLedge(x: number, y: number, halfWidth: number): void {
    const body = this.world.createRigidBody(
      rapier().RigidBodyDesc.fixed().setTranslation(x, y - LEDGE.halfHeight),
    )
    this.world.createCollider(
      rapier()
        .ColliderDesc.cuboid(halfWidth, LEDGE.halfHeight)
        .setFriction(0.9)
        .setRestitution(0.02),
      body,
    )
    this.ledgeList.push({ x, y, halfWidth, body })
  }

  /** 지금 서 있는 통나무들. 렌더러가 그리고, 다음 자리를 고를 때 피할 곳이 된다 */
  ledges(): readonly { x: number; y: number; halfWidth: number }[] {
    return this.ledgeList
  }

  /**
   * 회수 판을 세운다 — 화이트보드 단어를 쳤을 때 뻗어 나오는 기울어진 판이다.
   * 자리는 `systems/Catcher.ts`가 정하고 여기서는 세우기만 한다.
   *
   * **통나무와 다른 점이 둘이다.**
   *
   * 첫째, **기울어져 있다.** 물건이 얹히는 것이 아니라 미끄러져 나가야 하므로
   * 콜라이더도 그만큼 돌려 세운다 — 축에 나란한 상자로 두면 보이는 그림과 부딪히는
   * 도형이 어긋나고, 그건 이 프로젝트가 지켜온 전제를 깬다.
   *
   * 둘째, **잠깐 있다 사라진다.** 그래서 목록이 아니라 하나만 들고 있고, 새로 세우면
   * 앞의 것을 치운다 — 겹쳐 세우면 배출구가 공중 발판이 된다.
   *
   * 마찰을 거의 두지 않는 것은 미끄러지라고 만든 판이기 때문이다. 통나무처럼 붙잡으면
   * 팔이 사라진 뒤 물건이 다시 필드로 떨어져, 회수가 아니라 늦은 드롭이 된다.
   */
  setCatcher(plank: { x: number; y: number; halfLength: number; angle: number }): void {
    this.clearCatcher()
    const body = this.world.createRigidBody(
      rapier().RigidBodyDesc.fixed().setTranslation(plank.x, plank.y).setRotation(plank.angle),
    )
    this.world.createCollider(
      rapier()
        .ColliderDesc.cuboid(plank.halfLength, CATCH.halfThickness)
        .setFriction(0.04)
        .setRestitution(0.02),
      body,
    )
    this.catcherBody = body
  }

  /** 회수 판을 치운다. 없으면 아무 일도 없다 */
  clearCatcher(): void {
    if (this.catcherBody === null) {
      return
    }
    this.world.removeRigidBody(this.catcherBody)
    this.catcherBody = null
  }

  clearRecalledItems(): void {
    for (const [handle, entry] of this.tracked) {
      if (!entry.recalled) {
        continue
      }
      this.forgetWelds(handle)
      this.world.removeRigidBody(entry.body)
      this.tracked.delete(handle)
    }
  }

  private createPlatform(): void {
    const body = this.world.createRigidBody(
      rapier().RigidBodyDesc.fixed().setTranslation(
        0,
        ARENA.platformTop - ARENA.platformHalfHeight,
      ),
    )
    this.world.createCollider(
      rapier().ColliderDesc.cuboid(ARENA.platformHalfWidth, ARENA.platformHalfHeight)
        .setFriction(0.9)
        .setRestitution(0.02),
      body,
    )

    /*
     * 양끝의 **열린 덮개** — 받침대 밖으로 비스듬히 뻗은 판자.
     *
     * 바깥이 높고 안쪽이 낮아서, 받침대 밖으로 밀려난 물건이 여기 닿으면 타고
     * **되돌아 들어온다.** 벽이 없는 판에서 "살짝 밀린 것만 살린다"를 맡는 자리다.
     *
     * 좌표는 `platform-front` 그림에서 잰 것이라 **보이는 판자와 부딪히는 판자가
     * 같다.** 몸통이 (0, platformTop - platformHalfHeight)에 서 있으므로 그만큼 뺀다.
     */
    const flap = ARENA.bowlFlap
    const baseY = ARENA.platformTop - ARENA.platformHalfHeight
    for (const side of [-1, 1]) {
      const points = new Float32Array([
        side * flap.outerX, flap.outerY - baseY,
        side * flap.innerX, flap.innerY - baseY,
        side * flap.innerX, flap.innerY - flap.thickness - baseY,
        side * flap.outerX, flap.outerY - flap.thickness - baseY,
      ])
      const desc = rapier().ColliderDesc.convexHull(points)
      if (desc === null) {
        continue
      }
      this.world.createCollider(desc.setFriction(0.9).setRestitution(0.02), body)
    }
  }
}

export { PhysicsWorld }
export type { SettleEvent, EscapeEvent, ImpactEvent, StepResult, BodyCorrection }
