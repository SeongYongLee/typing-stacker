import { trailOf, type Trail } from '../data/trails.ts'

/**
 * 물건이 움직인 자리에 남는 부스러기들.
 *
 * 물건마다 소리가 다르고 튐이 다르고 빛나는 것은 화면을 물들이는데, **움직이는 모습은
 * 다 같았다.** 단풍잎과 텀블러가 같은 속도로 같은 궤적을 그리며 내려온다. 그래서
 * 떨어지는 동안에는 무엇이 오는지가 그림 하나에만 걸려 있고, 그때 눈은 다음 단어를
 * 쫓고 있다 — 낙하음을 재질마다 다르게 만든 것과 같은 자리다.
 *
 * ## 왜 여기가 `systems/`인가
 *
 * 캔버스도 DOM도 모른다. 받는 것은 물건의 자리와 시간이고 내놓는 것은 **점들의 목록**이다.
 * 그것을 어떻게 그릴지는 `renderer/trailPaint.ts`가 정한다 — 색번짐에서 "엔진은 얼마나
 * 남았는지만, 렌더러가 어떻게 보일지"로 나눈 것과 같은 경계다. 덕분에 뿜는 양·수명·
 * 상한처럼 실제로 조율하게 되는 값들이 node에서 그대로 검사된다.
 *
 * ## 속도를 스냅샷에서 구한다
 *
 * `BodySnapshot`에는 속도가 없다(x·y·회전·정착 여부뿐). 물리 층에 속도를 더해 흘려보낼
 * 수도 있었지만, 자리는 이미 **매 프레임** 오므로 지난 프레임과의 차이가 곧 속도다.
 * 연출 하나 때문에 물리와 대전 동기화가 오가는 값을 늘리지 않는 편이 낫다.
 */

interface TrailBody {
  readonly handle: number
  readonly x: number
  readonly y: number
  readonly settled: boolean
  readonly variant: { readonly id: string; readonly color: string }
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** 남은 수명(초) */
  life: number
  /** 태어날 때의 수명. 옅어지는 정도를 여기서 낸다 */
  born: number
  /** 월드 단위 반지름 */
  size: number
  kind: Trail
  color: string
  /** 흔들리며 내려오는 것들의 위상 */
  phase: number
}

interface TrailSpec {
  /** 1초에 뿜는 개수 (속도 1m/s일 때). 속도에 비례해 늘어난다 */
  readonly rate: number
  /** 수명(초) */
  readonly life: number
  /** 월드 단위 반지름 */
  readonly size: number
  /** 중력 배수. 1이면 물건과 같이 떨어지고 0이면 뜬 자리에 머문다 */
  readonly gravity: number
  /** 물건 속도를 얼마나 물려받는가. 1이면 같이 날아간다 */
  readonly inherit: number
  /** 좌우로 흔들리는 폭(m/s). 0이면 안 흔들린다 */
  readonly sway: number
  /** 태어날 때 흩어지는 폭(m/s) */
  readonly spread: number
}

/**
 * 갈래마다 다른 것은 **네 가지**다 — 얼마나 많이, 얼마나 오래, 얼마나 무겁게,
 * 얼마나 흔들리며. 이 넷이 갈리면 눈으로 갈래가 구분된다.
 *
 * 색은 여기 없다. 물건이 갖고 온다(`words.ts`의 `color`) — 같은 갈래 안에서도
 * 단풍잎과 클로버가 다른 색으로 흩날려야 하기 때문이다.
 */
const SPECS: Readonly<Record<Trail, TrailSpec>> = {
  /* 빠르게 반짝이고 곧 사라진다. 뜬 자리에 남아 물건이 지나간 길을 그린다 */
  sparkle: { rate: 40, life: 0.55, size: 0.055, gravity: 0, inherit: 0.15, sway: 0, spread: 0.35 },
  /* 튀어서 아래로 가속한다. 물건보다 빨리 떨어져 뒤로 처진다 */
  droplet: { rate: 22, life: 0.5, size: 0.045, gravity: 1.3, inherit: 0.35, sway: 0, spread: 0.5 },
  /* 좌우로 흔들리며 천천히 내려온다 */
  petal: { rate: 14, life: 1.5, size: 0.075, gravity: 0.18, inherit: 0.2, sway: 0.9, spread: 0.3 },
  /* 가장 느리다. 크고 옅어서 거의 떠 있다 */
  fluff: { rate: 10, life: 2.2, size: 0.09, gravity: 0.06, inherit: 0.12, sway: 0.5, spread: 0.2 },
  /* 작고 짧게 아래로 흩어진다 */
  crumb: { rate: 24, life: 0.65, size: 0.04, gravity: 1, inherit: 0.3, sway: 0, spread: 0.6 },
}

/** 이 속도(m/s)보다 느리면 아무것도 흘리지 않는다 — 얹혀 있는 물건이 계속 반짝이면 안 된다 */
const MIN_SPEED = 0.6
/** 속도가 이만큼이면 뿜는 양이 최대다 */
const FULL_SPEED = 6

/**
 * 점 개수 상한.
 *
 * 프레임 예산에는 여유가 있지만(측정 0.49ms / 16.7ms) 상한이 없으면 탑이 무너질 때
 * 열 개가 동시에 흘려 개수가 갑자기 뛴다. 그 순간은 이미 화면이 복잡한데 거기에
 * 부스러기를 더하면 무엇이 떨어지는지가 오히려 안 보인다.
 */
const MAX_PARTICLES = 420

/** 한 프레임에 흐를 수 있는 최대 시간(초). 탭이 가려졌다 돌아올 때 한꺼번에 튀지 않게 */
const MAX_STEP = 0.05

class TrailField {
  private readonly live: Particle[] = []
  /** handle → 지난 프레임 자리. 속도를 여기서 낸다 */
  private readonly previous = new Map<number, { x: number; y: number }>()
  /** 갈래마다 남은 뿜을 몫. 소수점을 버리면 느린 갈래가 영영 안 나온다 */
  private readonly debt = new Map<number, number>()
  private seed = 1

  /**
   * 난수를 스스로 굴린다.
   *
   * `Rng`를 주입받지 않는 유일한 자리다. 이것은 **판의 결과에 닿지 않는 연출**이고,
   * 판의 난수열에 끼어들면 같은 시드가 같은 판을 만들지 못한다 — 부스러기 하나 때문에
   * 단어 순서와 히든 결과가 갈리는 것이 훨씬 나쁘다.
   */
  private random(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  /** 판을 다시 시작할 때. 앞 판의 부스러기가 남아 있으면 안 된다 */
  reset(): void {
    this.live.length = 0
    this.previous.clear()
    this.debt.clear()
  }

  get particles(): readonly Particle[] {
    return this.live
  }

  /**
   * 시간을 흘리고 새로 뿜는다.
   *
   * @param bodies 이번 프레임의 물건들
   * @param dt 지난 프레임에서 흐른 시간(초)
   */
  update(bodies: readonly TrailBody[], dt: number): void {
    const step = Math.min(Math.max(dt, 0), MAX_STEP)
    if (step <= 0) {
      return
    }
    this.advance(step)
    this.emit(bodies, step)
    this.forget(bodies)
  }

  private advance(dt: number): void {
    let write = 0
    for (const particle of this.live) {
      particle.life -= dt
      if (particle.life <= 0) {
        continue
      }
      const spec = SPECS[particle.kind]
      particle.phase += dt
      particle.vy -= spec.gravity * 7 * dt
      particle.x += (particle.vx + Math.sin(particle.phase * 6) * spec.sway) * dt
      particle.y += particle.vy * dt
      this.live[write] = particle
      write += 1
    }
    this.live.length = write
  }

  private emit(bodies: readonly TrailBody[], dt: number): void {
    for (const body of bodies) {
      const kind = trailOf(body.variant.id)
      const last = this.previous.get(body.handle)
      this.previous.set(body.handle, { x: body.x, y: body.y })
      if (kind === null || last === undefined || body.settled) {
        continue
      }
      const vx = (body.x - last.x) / dt
      const vy = (body.y - last.y) / dt
      const speed = Math.hypot(vx, vy)
      if (speed < MIN_SPEED) {
        continue
      }
      const spec = SPECS[kind]
      const strength = Math.min(speed / FULL_SPEED, 1)
      /*
       * 뿜을 몫을 소수점째로 쌓아둔다. 매 프레임 내림하면 느린 갈래(초당 6개)는
       * 한 프레임 몫이 0.1이라 영영 하나도 안 나온다.
       */
      const owed = (this.debt.get(body.handle) ?? 0) + spec.rate * strength * dt
      const count = Math.floor(owed)
      this.debt.set(body.handle, owed - count)
      for (let i = 0; i < count; i += 1) {
        if (this.live.length >= MAX_PARTICLES) {
          return
        }
        this.live.push({
          x: body.x + (this.random() - 0.5) * spec.size * 4,
          y: body.y + (this.random() - 0.5) * spec.size * 4,
          vx: vx * spec.inherit + (this.random() - 0.5) * spec.spread,
          vy: vy * spec.inherit + (this.random() - 0.5) * spec.spread,
          life: spec.life * (0.65 + this.random() * 0.35),
          born: spec.life,
          size: spec.size * (0.7 + this.random() * 0.6),
          kind,
          color: body.variant.color,
          phase: this.random() * 6,
        })
      }
    }
  }

  /** 세계에서 사라진 물건의 기록을 치운다. 남겨두면 판이 길어질수록 쌓인다 */
  private forget(bodies: readonly TrailBody[]): void {
    if (this.previous.size <= bodies.length) {
      return
    }
    const alive = new Set(bodies.map((body) => body.handle))
    for (const handle of [...this.previous.keys()]) {
      if (!alive.has(handle)) {
        this.previous.delete(handle)
        this.debt.delete(handle)
      }
    }
  }
}

export { TrailField, SPECS, MAX_PARTICLES, MIN_SPEED, FULL_SPEED }
export type { Particle, TrailBody, TrailSpec }
