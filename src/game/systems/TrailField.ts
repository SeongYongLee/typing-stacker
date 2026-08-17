import { STEAM_COLOR, splashColorOf, steams, trailOf, type Trail } from '../data/trails.ts'

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
  /** Night Fever 자동 낙하이면 원래 재질 꼬리 대신 별똥별 꼬리를 쓴다. */
  readonly fever?: boolean
  /** 혼잡 경보 반입이면 보라색 대신 주황·붉은 경보 꼬리를 쓴다. */
  readonly congestion?: boolean
  readonly variant: {
    readonly id: string
    readonly color: string
    /**
     * 그린 크기의 절반. 김이 물건 **위에서** 피어오르게 하고, 부딪힘이 누구를
     * 때렸는지 찾는 데 쓴다.
     */
    readonly artBounds: { readonly hw: number; readonly hh: number }
  }
}

/** 부딪힌 자리 하나 — 물리가 돌려주는 것 중 이 연출에 필요한 부분만 */
interface TrailHit {
  readonly handle: number
  readonly id: string
  readonly color: string
  readonly x: number
  readonly y: number
  /** 부딪힌 세기 0~1 */
  readonly strength: number
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
  /**
   * 기울기(라디안). 모양이 있는 부스러기는 이것이 없으면 전부 같은 방향을 보고 있어
   * 흩날리는 것이 아니라 도장을 찍은 것처럼 보인다.
   */
  angle: number
  /** 초당 회전(라디안). 잎은 뒹굴고 반짝임은 거의 제자리에서 돈다 */
  spin: number
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
  /**
   * 회전 빠르기(초당 라디안, ±).
   *
   * 잎처럼 납작한 것은 뒹굴어야 하고 방울은 진행 방향을 지켜야 한다 — 방울이 뒹굴면
   * 늘어난 방향이 속도와 어긋나 "튀었다"가 읽히지 않는다. 그래서 방울은 0이고,
   * 기울기는 렌더러가 속도에서 낸다.
   */
  readonly spin: number
  /**
   * 살면서 얼마나 커지는가(0이면 그대로).
   *
   * 김에만 쓴다. 피어오르며 퍼지는 것이 김의 성질이고, 그게 없으면 위로 흐르는
   * 점들이라 연기가 아니라 거품처럼 보인다.
   */
  readonly grow: number
}

/**
 * 갈래마다 다른 것은 **네 가지**다 — 얼마나 많이, 얼마나 오래, 얼마나 무겁게,
 * 얼마나 흔들리며. 이 넷이 갈리면 눈으로 갈래가 구분된다.
 *
 * **크기는 2026-08-09에 1.35배로 키웠다.** 아레나 배경이 단색에서 밝은 그림으로
 * 바뀌고 물건 스티커도 다시 그려지며, 예전 크기로는 부스러기가 배경 무늬에 묻혔다.
 * 김만 그대로다 — 그쪽은 배경이라 커지면 쌓인 물건을 가린다.
 *
 * 색은 여기 없다. 물건이 갖고 온다(`words.ts`의 `color`) — 같은 갈래 안에서도
 * 단풍잎과 클로버가 다른 색으로 흩날려야 하기 때문이다.
 */
const SPECS: Readonly<Record<Trail, TrailSpec>> = {
  /* 빠르게 반짝이고 곧 사라진다. 뜬 자리에 남아 물건이 지나간 길을 그린다 */
  sparkle: {
    rate: 40, life: 0.55, size: 0.075, gravity: 0, inherit: 0.15, sway: 0, spread: 0.35,
    // 별은 제자리에서 천천히 돈다. 빠르게 돌리면 반짝임이 아니라 바람개비가 된다
    spin: 1.2,
    grow: 0,
  },
  /* 튀어서 아래로 가속한다. 물건보다 빨리 떨어져 뒤로 처진다 */
  droplet: {
    rate: 22, life: 0.5, size: 0.062, gravity: 1.3, inherit: 0.35, sway: 0, spread: 0.5,
    // 방울은 진행 방향으로 늘어나야 하므로 돌지 않는다
    spin: 0,
    grow: 0,
  },
  /* 좌우로 흔들리며 천천히 내려온다. 잎은 뒹굴어야 잎으로 보인다 */
  petal: {
    rate: 14, life: 1.5, size: 0.098, gravity: 0.18, inherit: 0.2, sway: 0.9, spread: 0.3,
    spin: 3.4,
    grow: 0,
  },
  /* 가장 느리다. 크고 옅어서 거의 떠 있다 */
  fluff: {
    rate: 10, life: 2.2, size: 0.115, gravity: 0.06, inherit: 0.12, sway: 0.5, spread: 0.2,
    spin: 0.8,
    grow: 0,
  },
  /* 작고 짧게 아래로 흩어진다. 부러진 조각처럼 빠르게 뒹군다 */
  crumb: {
    rate: 24, life: 0.65, size: 0.055, gravity: 1, inherit: 0.3, sway: 0, spread: 0.6,
    spin: 5,
    grow: 0,
  },
  /*
   * 닿는 순간 위로 솟구치는 물. `rate`를 쓰지 않는다 — 흘리는 것이 아니라 한 번에
   * 터지는 것이라 개수는 `SPLASH_COUNT`가 정한다.
   *
   * 짧게 살고 무겁게 떨어진다. 오래 남으면 튄 물이 공중에 걸린 것처럼 보이고,
   * 가벼우면 솟은 채로 떠 있어 "튀었다"가 아니라 "흩날렸다"가 된다.
   */
  splash: {
    rate: 0, life: 0.55, size: 0.052, gravity: 1.1, inherit: 0, sway: 0, spread: 0,
    spin: 0, grow: 0,
  },
  /*
   * 얹힌 뒤 피어오르는 김. **중력이 음수라 위로 뜬다.**
   *
   * 다른 갈래와 조건이 반대다 — 속도가 아니라 **정착**했을 때 뿜고, 속도에 비례하지
   * 않고 일정하게 낸다. 오래 살고(1.8초) 살면서 커지며 옅어진다.
   */
  steam: {
    rate: 7, life: 1.8, size: 0.05, gravity: -0.12, inherit: 0, sway: 0.35, spread: 0.12,
    spin: 0.4, grow: 1.1,
  },
}

/**
 * Fever 물건은 원래 갈래와 무관하게 더 길고 촘촘한 반짝임을 남긴다.
 * 물건 뒤에 별이 이어져야 별똥별로 읽히므로 일반 `sparkle`보다 수명과 양을 늘린다.
 */
const FEVER_TRAIL_SPEC: TrailSpec = {
  ...SPECS.sparkle,
  rate: 82,
  life: 1.4,
  size: 0.09,
  inherit: 0.05,
  spread: 0.42,
  spin: 1.8,
}
const FEVER_TRAIL_COLOR = '#dec7ff'
const CONGESTION_TRAIL_COLOR = '#ff7959'
const CONGESTION_TRAIL_SPEC: TrailSpec = {
  rate: 28,
  life: 0.42,
  size: 0.052,
  gravity: 0.2,
  inherit: 0.16,
  sway: 0.8,
  spread: 0.95,
  spin: 7,
  grow: 0,
}

/** 한 번 부딪힐 때 터지는 물방울 수. 세기에 따라 이 값까지 늘어난다 */
const SPLASH_COUNT = 16
/**
 * 이 세기(0~1)보다 약하게 닿으면 퍼지지 않는다. 살짝 얹히는 것까지 튀면 늘 젖어 있다.
 *
 * 실측으로 액체 물건이 빈 받침대에 닿는 세기는 **0.118~1.0**이다(마티니가 가장 약하고
 * 전기주전자가 최대치). 0.12로 두었더니 마티니만 영영 안 튀었다 — 열 중 하나가 규칙에서
 * 빠지면 그것은 문턱이 아니라 버그로 보인다.
 */
const SPLASH_MIN_STRENGTH = 0.08
/**
 * 튀어오르는 속도(m/s).
 *
 * 세기를 **그대로 곱하면 안 된다.** 실측 세기가 0.26(칵테일)쯤이라 그대로 곱하면
 * 초속 1m도 못 되고, 0.55초 사는 물방울이 5픽셀쯤 오르다 만다 — 화면에서는
 * 맺힌 점으로 보이지 실제로 튀어 보이지 않는다. 아래 `SPLASH_FLOOR`가 바닥을 깐다.
 */
const SPLASH_SPEED = 3.6
/**
 * 가장 약하게 닿아도 이만큼은 튄다(0~1).
 *
 * 세기는 얼마나 크게 튀는지를 정하는 것이지 **튀느냐 마느냐**를 정하는 것이 아니다.
 * 문턱을 넘었으면 눈에 보여야 하고, 그 위에서 세기가 크기를 가른다.
 */
const SPLASH_FLOOR = 0.55
/**
 * 부채가 벌어진 각(라디안). 위쪽을 가운데로 두고 좌우로 이만큼 펼쳐진다.
 *
 * **위가 가운데인 것이 요점이다.** 처음에는 반원(0~π)에 고르게 뿌리고 세로 성분을
 * 절반으로 눌렀는데, 그러면 옆으로 흐르기만 해서 "튀었다"가 아니라 "번졌다"로 보였다.
 * 물이 튀는 것은 **중력 반대 방향**으로 솟구쳤다가 되떨어지는 것이고, 부채꼴은
 * 그 솟구침이 한 점에서 갈라지는 모양이다.
 *
 * 2.3라디안이면 130도쯤이라 좌우 65도까지 벌어진다. 180도에 가까우면 부채가 아니라
 * 바닥을 기는 물이 되고, 좁으면 분수처럼 한 줄기로 솟는다.
 */
const SPLASH_FAN = 2.3

/**
 * 마른 것이 부딪혔을 때 터지는 개수. 물보다 적다.
 *
 * 물은 사방으로 흩어지는 것이 그 물질의 성질이지만 잎·털·조각은 몇 장이 떨어져
 * 나오는 것이다. 같은 수로 터뜨리면 나뭇잎에서 잎이 열여섯 장 튀어나온다.
 */
const DRY_BURST_COUNT = 9

/** 마른 것이 튀는 속도 배수. 물처럼 솟구치지 않고 툭 떨어져 나온다 */
const DRY_SPEED = 0.6

/**
 * 맞은 쪽이 떨어진 쪽의 몇 배로 반응하는가.
 *
 * 사건의 주인공은 떨어진 쪽이다. 같은 세기로 터지면 둘 중 무엇이 떨어진 것인지
 * 알 수 없게 되고, 그러면 "무엇이 왔는가"라는 이 연출의 목적이 흐려진다.
 */
const STRUCK_SCALE = 0.65

/**
 * 이만큼(월드 단위) 안에 붙어 있으면 맞은 것으로 본다.
 *
 * 물리가 부딪힘을 잡는 시점은 **속도가 꺾인 프레임**이라 두 물건이 아직 완전히
 * 붙어 있지 않다. 0으로 두면 거의 아무도 못 찾고, 너무 크면 한 칸 아래 것까지
 * 반응해 탑이 통째로 흔들린 것처럼 보인다.
 */
const CONTACT_SLACK = 0.14

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

/**
 * 김만 따로 두는 상한.
 *
 * 상시 뿜는 유일한 갈래라 전체 상한만 두면 뜨거운 물건이 몇 개 쌓였을 때 김이 자리를
 * 다 차지해 **떨어지는 물건의 꼬리가 사라진다.** 김은 배경이고 꼬리는 정보다.
 */
const STEAM_MAX = 90

/** 한 프레임에 흐를 수 있는 최대 시간(초). 탭이 가려졌다 돌아올 때 한꺼번에 튀지 않게 */
const MAX_STEP = 0.05
const NO_SUPPRESSED: ReadonlySet<number> = new Set()

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
   * @param hits 이번 프레임에 부딪힌 자리들. 액체가 담긴 것이면 물이 퍼진다
   */
  update(
    bodies: readonly TrailBody[],
    dt: number,
    hits: readonly TrailHit[] = [],
    suppressed: ReadonlySet<number> = NO_SUPPRESSED,
  ): void {
    /*
     * 부딪힘은 dt가 0이어도 처리한다. 물이 퍼지는 것은 **사건**이라 흘려보내면
     * 그 프레임의 부딪힘이 통째로 사라진다 — 시간이 안 흐른 프레임이 실제로 있다
     * (판이 멈춰 있거나 화면이 처음 그려질 때).
     */
    this.burst(hits, bodies)
    const step = Math.min(Math.max(dt, 0), MAX_STEP)
    if (step <= 0) {
      return
    }
    this.advance(step)
    this.emit(bodies, step, suppressed)
    this.forget(bodies)
  }

  /**
   * 부딪히면 **닿은 둘이 각각 반응한다.**
   *
   * 떨어진 물건만 반응하면 받침대에 쌓인 것들은 아무 일 없는 배경이 된다. 위에서
   * 무언가 떨어져 나뭇잎을 쳤으면 잎이 흩날려야 하고, 물잔을 쳤으면 물이 튀어야
   * 한다 — 그래야 쌓아둔 것이 살아 있는 것으로 보이고, **무엇 위에 얹었는지**가
   * 부딪히는 순간 한 번 더 읽힌다.
   *
   * 맞은 쪽은 떨어진 쪽보다 약하다(`STRUCK_SCALE`). 사건의 주인공은 떨어진 쪽이고,
   * 같은 세기로 터지면 둘 중 무엇이 떨어진 것인지 알 수 없게 된다.
   */
  private burst(hits: readonly TrailHit[], bodies: readonly TrailBody[]): void {
    for (const hit of hits) {
      if (hit.strength < SPLASH_MIN_STRENGTH) {
        continue
      }
      const faller = this.bodyAt(hit, bodies)
      this.react(trailOf(hit.id), hit.id, hit.color, hit.x, hit.y, hit.strength)

      const struck = this.struckBy(hit, faller, bodies)
      if (struck === null) {
        continue
      }
      this.react(
        trailOf(struck.variant.id),
        struck.variant.id,
        struck.variant.color,
        (hit.x + struck.x) / 2,
        struck.y + struck.variant.artBounds.hh,
        hit.strength * STRUCK_SCALE,
      )
    }
  }

  /** 부딪힘을 낸 물건. 자리가 정확히 같은 것을 찾는다 — 물리가 방금 그 자리를 넘겼다 */
  private bodyAt(hit: TrailHit, bodies: readonly TrailBody[]): TrailBody | null {
    for (const body of bodies) {
      if (body.variant.id === hit.id && Math.abs(body.x - hit.x) < 1e-6 && Math.abs(body.y - hit.y) < 1e-6) {
        return body
      }
    }
    return null
  }

  /**
   * 무엇을 때렸는가.
   *
   * 물리는 **한 물건의 속도가 꺾인 것**으로 부딪힘을 잡으므로 상대를 모른다. 접촉 쌍을
   * 다시 물어보면 WASM 경계를 또 넘어야 하는데, 자리는 이미 매 프레임 오므로 여기서
   * 찾는 편이 싸다 — 속도를 스냅샷 차분으로 내는 것과 같은 판단이다.
   *
   * 바로 **아래에서 가로로 겹치는 것** 중 가장 가까운 하나다. 옆으로 스친 것까지
   * 세면 탑 전체가 한 번에 반응해 무엇을 쳤는지가 오히려 안 보인다.
   */
  private struckBy(
    hit: TrailHit,
    faller: TrailBody | null,
    bodies: readonly TrailBody[],
  ): TrailBody | null {
    const halfWidth = faller?.variant.artBounds.hw ?? 0
    const bottom = hit.y - (faller?.variant.artBounds.hh ?? 0)
    let best: TrailBody | null = null
    let bestGap = Number.POSITIVE_INFINITY
    for (const body of bodies) {
      if (body === faller || trailOf(body.variant.id) === null) {
        continue
      }
      const gap = Math.abs(bottom - (body.y + body.variant.artBounds.hh))
      if (gap > CONTACT_SLACK || gap >= bestGap) {
        continue
      }
      const overlap =
        Math.min(hit.x + halfWidth, body.x + body.variant.artBounds.hw) -
        Math.max(hit.x - halfWidth, body.x - body.variant.artBounds.hw)
      if (overlap <= 0) {
        continue
      }
      bestGap = gap
      best = body
    }
    return best
  }

  /**
   * 한 자리에서 위쪽 부채꼴로 한 번 터뜨린다.
   *
   * **액체만 물 모양(`splash`)으로 바뀐다.** 나머지는 제 갈래 그대로 터지므로 잎은
   * 잎으로 흩날리고 털은 털로 날린다 — 흘리는 것과 터지는 것이 같은 모양이어야
   * 그것이 같은 물건에서 나온 것으로 읽힌다.
   *
   * **중력 반대 방향이다.** 솟구쳤다가 되떨어지는 것이 부딪힌 자리에서 튀는 모습이고,
   * 되떨어지는 쪽은 중력이 맡으므로 여기서는 솟는 것만 정한다.
   */
  private react(
    kind: Trail | null,
    id: string,
    bodyColor: string,
    x: number,
    y: number,
    strength: number,
  ): void {
    if (kind === null || strength < SPLASH_MIN_STRENGTH) {
      return
    }
    const liquid = kind === 'droplet'
    const shape = liquid ? 'splash' : kind
    const spec = SPECS[shape]
    // 물건 색이 곧 담긴 것의 색은 아니다 — 생선은 살구빛인데 튀는 것은 물이다
    const color = liquid ? splashColorOf(id, bodyColor) : bodyColor
    const reachScale = SPLASH_FLOOR + (1 - SPLASH_FLOOR) * strength
    const base = liquid ? SPLASH_COUNT : DRY_BURST_COUNT
    const count = Math.max(liquid ? 6 : 4, Math.round(base * reachScale))
    for (let i = 0; i < count; i += 1) {
      if (this.live.length >= MAX_PARTICLES) {
        return
      }
      /*
       * 위(π/2)를 가운데로 두고 좌우로 펼친다. 각도가 이 부채 안에 있으므로
       * 세로 성분은 언제나 위쪽이다 — 바닥에 닿아 튄 것이 바닥을 뚫고 내려가지 않는다.
       */
      const fan = count === 1 ? 0.5 : i / (count - 1)
      const angle = Math.PI / 2 + (fan - 0.5) * SPLASH_FAN + (this.random() - 0.5) * 0.25
      /*
       * 부채 가운데가 가장 높이 솟는다. 전부 같은 속도면 반원으로 퍼져 물이 아니라
       * 폭발처럼 보인다 — 가운데가 높고 가장자리가 낮아야 튄 것으로 읽힌다.
       */
      const reach = 0.55 + Math.sin(angle) * 0.45
      const speed =
        SPLASH_SPEED * reach * (0.75 + this.random() * 0.5) * reachScale * (liquid ? 1 : DRY_SPEED)
      this.live.push({
        x: x + (this.random() - 0.5) * 0.12,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: spec.life * (0.6 + this.random() * 0.4),
        born: spec.life,
        size: spec.size * (0.6 + this.random() * 0.8),
        kind: shape,
        color,
        phase: this.random() * Math.PI * 2,
        angle: this.random() * Math.PI * 2,
        spin: (this.random() - 0.5) * 2 * spec.spin,
      })
    }
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
      particle.angle += particle.spin * dt
      particle.vy -= spec.gravity * 7 * dt
      particle.x += (particle.vx + Math.sin(particle.phase * 6) * spec.sway) * dt
      particle.y += particle.vy * dt
      this.live[write] = particle
      write += 1
    }
    this.live.length = write
  }

  private emit(
    bodies: readonly TrailBody[],
    dt: number,
    suppressed: ReadonlySet<number>,
  ): void {
    for (const body of bodies) {
      const kind = body.fever === true ? 'sparkle' : body.congestion === true ? 'sparkle' : trailOf(body.variant.id)
      const last = this.previous.get(body.handle)
      this.previous.set(body.handle, { x: body.x, y: body.y })
      // 표시 보정은 실제 이동이 아니다. 기록만 새 위치로 옮겨 해제 프레임도 튀지 않게 한다.
      if (suppressed.has(body.handle)) {
        this.debt.set(body.handle, 0)
        continue
      }
      /*
       * 김은 꼬리와 **겹쳐도 되는 축**이다 — 나머지는 움직이는 동안 흘리고 김은
       * 얹힌 뒤에 오르므로 시간이 겹치지 않는다. 그래서 갈래를 보기 전에 따로 본다.
       */
      if (steams(body.variant.id)) {
        this.emitSteam(body, dt)
      }
      if (kind === null || last === undefined || body.settled) {
        continue
      }
      const vx = (body.x - last.x) / dt
      const vy = (body.y - last.y) / dt
      const speed = Math.hypot(vx, vy)
      if (speed < MIN_SPEED) {
        continue
      }
      const spec = body.fever === true
        ? FEVER_TRAIL_SPEC
        : body.congestion === true
          ? CONGESTION_TRAIL_SPEC
          : SPECS[kind]
      const strength = Math.min(speed / FULL_SPEED, 1)
      const count = this.owe(body.handle, spec.rate * strength * dt)
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
          color: body.fever === true
            ? FEVER_TRAIL_COLOR
            : body.congestion === true
              ? CONGESTION_TRAIL_COLOR
              : body.variant.color,
          phase: this.random() * 6,
          angle: this.random() * Math.PI * 2,
          // 반씩 양쪽으로 돌게 한다. 한 방향으로만 돌면 무리가 같이 도는 것으로 보인다
          spin: spec.spin * (this.random() < 0.5 ? -1 : 1) * (0.6 + this.random() * 0.8),
        })
      }
    }
  }

  /**
   * 뜨거운 물건이 **얹힌 뒤** 김을 피워올린다.
   *
   * 다른 갈래와 조건이 반대다 — 움직이는 동안이 아니라 자리를 잡았을 때다. 떨어지는
   * 동안 김이 나면 그건 김이 아니라 연기 꼬리이고, 정작 보여주려는 것은 **쌓인 탑이
   * 아직 살아 있다**는 것이다.
   *
   * 속도에 비례하지 않고 일정하게 낸다. 김은 물건이 무엇을 하든 같은 빠르기로 오른다.
   *
   * **물건 위에서 시작한다.** 가운데에서 내면 김이 물건 속에서 솟아 나오는 것처럼
   * 보인다 — 뜨거운 것은 윗면에서 오른다.
   */
  private emitSteam(body: TrailBody, dt: number): void {
    if (!body.settled) {
      return
    }
    /*
     * 김만 따로 상한을 둔다. 상시 뿜는 유일한 갈래라, 전체 상한만 두면 뜨거운 물건이
     * 몇 개 쌓였을 때 김이 자리를 다 차지해 **떨어지는 물건의 꼬리가 사라진다.**
     */
    if (this.count('steam') >= STEAM_MAX) {
      return
    }
    const spec = SPECS.steam
    const count = this.owe(body.handle, spec.rate * dt)
    const top = body.y + body.variant.artBounds.hh * 0.7
    for (let i = 0; i < count; i += 1) {
      if (this.live.length >= MAX_PARTICLES) {
        return
      }
      this.live.push({
        x: body.x + (this.random() - 0.5) * spec.size * 3,
        y: top,
        vx: (this.random() - 0.5) * spec.spread,
        vy: 0.25 + this.random() * 0.2,
        life: spec.life * (0.65 + this.random() * 0.35),
        born: spec.life,
        size: spec.size * (0.7 + this.random() * 0.6),
        kind: 'steam',
        color: STEAM_COLOR,
        phase: this.random() * 6,
        angle: this.random() * Math.PI * 2,
        spin: spec.spin * (this.random() < 0.5 ? -1 : 1),
      })
    }
  }

  /**
   * 뿜을 몫을 소수점째로 쌓아두고 정수분만 돌려준다.
   *
   * 매 프레임 내림하면 느린 갈래(초당 7개)는 한 프레임 몫이 0.12라 영영 하나도 안 나온다.
   */
  private owe(handle: number, amount: number): number {
    const owed = (this.debt.get(handle) ?? 0) + amount
    const count = Math.floor(owed)
    this.debt.set(handle, owed - count)
    return count
  }

  private count(kind: Trail): number {
    let total = 0
    for (const particle of this.live) {
      if (particle.kind === kind) {
        total += 1
      }
    }
    return total
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

export {
  TrailField,
  SPECS,
  MAX_PARTICLES,
  MIN_SPEED,
  FULL_SPEED,
  SPLASH_COUNT,
  SPLASH_MIN_STRENGTH,
  SPLASH_FAN,
  SPLASH_FLOOR,
  STEAM_MAX,
  FEVER_TRAIL_SPEC,
  FEVER_TRAIL_COLOR,
  CONGESTION_TRAIL_SPEC,
  CONGESTION_TRAIL_COLOR,
}
export type { Particle, TrailBody, TrailHit, TrailSpec }
