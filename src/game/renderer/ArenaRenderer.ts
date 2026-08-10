import { glowScale, shakeScale, trailScale } from './displayPrefs.ts'
import { glowAlpha, glowColor, glowStyle } from './glow.ts'
import { trailPaint } from './trailPaint.ts'
import { traceTrail } from './trailShape.ts'
import { grownBy } from './trailPaint.ts'
import { TrailField, type TrailHit } from '../systems/TrailField.ts'
import { sprite } from './spriteCache.ts'
import { ARENA_ART as GENERATED_ART, type ArenaArtName } from './arenaArt.generated.ts'
import { catPose } from './catPose.ts'
import type { CatView } from '../systems/CatPickup.ts'
import { padRatio, rim } from './rimCache.ts'
import { PAIR_MARK_COLORS } from '../systems/PairMarks.ts'
import { ARENA, LEDGE, ARENA_SCREEN_MAX_WIDTH } from '../config.ts'
import type { Bounds } from '../shapes.ts'
import type {
  BodySnapshot,
  OwnerId,
  PrimitiveShape,
  ShapeDef,
  ShapePart,
} from '../types/game.ts'

interface HiddenReveal {
  readonly label: string
  readonly sprite: string
  /**
   * 무엇으로 만들었는지. 합성으로 얻었을 때만 채워진다.
   *
   * 비어 있으면 운으로 만난 히든이라 모이는 장면 없이 결과물만 나타난다 —
   * 없던 것을 지어내면 "재료가 있었나" 하고 다음 판에 헛것을 찾게 된다.
   */
  readonly from: readonly string[]
  /** 0 → 1 */
  readonly progress: number
}

/**
 * 재료가 모이는 데 쓰는 몫(0~1).
 *
 * 합성 연출은 3초이므로 앞 1.1초가 모이는 시간이다. 처음 1.8초에 3할(0.54초)로
 * 뒀더니 재료가 무엇이었는지 알아보기 전에 겹쳐버렸다 — 눈이 화면 가운데로
 * 옮겨오는 데만도 시간이 걸린다. 반대로 더 끌면 결과물을 읽을 시간이 모자란다.
 */
const MERGE_GATHER = 0.36

/**
 * 재료가 출발하는 방향.
 *
 * **재료가 가장 많은 레시피만큼 있어야 한다.** 모자라면 재료 둘이 같은 곳에서
 * 출발해 하나로 보인다 — 여섯짜리(테라리움)가 들어오며 다섯으로는 모자라게 됐고,
 * `tests/MergeReveal.test.ts`가 그 관계를 지킨다.
 *
 * 앞의 둘은 좌우다. 재료 둘짜리가 스물일곱으로 가장 많으므로 그쪽이 가장 자주
 * 보이는 모습이고, 뒤에 무엇을 더하든 그 그림은 바뀌지 않는다.
 */
const GATHER_FROM: readonly (readonly [number, number])[] = [
  [-1, 0.12],
  [1, 0.12],
  [0, -1],
  [-0.8, -0.7],
  [0.8, -0.7],
  [0, 1],
]

/**
 * 방금 얹힌 물건이 화면에 남기는 색.
 *
 * `hiddenReveal`과 같은 모양이다 — 엔진은 **무슨 색이 얼마나 남았는지**만 넘기고
 * 그것을 어떻게 그릴지는 렌더러가 정한다. 색이 물건의 것(`words.ts`의 `color`)이라
 * 엔진을 지나오는 것이고, 밝기를 맞추고 알파를 매기는 일은 `glow.ts`가 한다.
 */
interface LandingGlow {
  /** 물건 고유색 (`#rrggbb`) */
  readonly color: string
  /** 부딪힌 세기 0~1 */
  readonly strength: number
  /** 0(닿은 순간) → 1(다 사라짐) */
  readonly progress: number
}

/** 빠진 것을 채운 뒤의 모양. 그리는 코드는 이것만 본다 */
type FilledRenderState = ArenaRenderState & Required<Pick<ArenaRenderState,
  'quake' | 'quakePhase' | 'nightfall' | 'pairPulse' | 'ledges' | 'pairMarks'>> & {
  readonly hiddenReveal: HiddenReveal | null
  readonly formingLedge: NonNullable<ArenaRenderState['formingLedge']> | null
  readonly cat: CatView | null
}

/** 없는 것에 기본값을 준다. **한 곳에서만 정한다** — 그리는 자리마다 물으면 곧 갈린다 */
function withDefaults(state: ArenaRenderState): FilledRenderState {
  return {
    ...state,
    hiddenReveal: state.hiddenReveal ?? null,
    quake: state.quake ?? 0,
    quakePhase: state.quakePhase ?? 0,
    nightfall: state.nightfall ?? 0,
    ledges: state.ledges ?? NO_LEDGES,
    formingLedge: state.formingLedge ?? null,
    pairMarks: state.pairMarks ?? NO_PAIR_MARKS,
    pairPulse: state.pairPulse ?? 0,
    cat: state.cat ?? null,
  }
}

/* 매 프레임 새로 만들지 않으려고 들고 있는 빈 값들 */
const NO_LEDGES: readonly never[] = []
const NO_PAIR_MARKS: ReadonlyMap<string, number> = new Map()

/**
 * 그릴 것 한 장.
 *
 * **혼자 하기에만 있는 것은 선택 항목이다**(`?`). 대전 엔진이 `nightfall: 0`,
 * `ledges: []` 같은 빈 값을 억지로 채워 넣어야 했는데, 그러면 혼자 하기에 연출을
 * 하나 더할 때마다 **대전 엔진도 함께 고쳐야 컴파일된다** — 실제로 하루에 네 번
 * (`ledges`·`nightfall`·`pairMarks`·`pairPulse`) 그 줄 때문에 남의 작업이 딸려오거나
 * main이 깨질 뻔했다.
 *
 * 기본값은 `withDefaults`가 한 곳에서 채운다. 그리는 쪽이 "없으면 어떻게"를 알고
 * 있으면, 넘기는 쪽은 자기가 아는 것만 넘기면 된다.
 */
interface ArenaRenderState {
  readonly bodies: readonly BodySnapshot[]
  readonly aimX: number
  readonly showAim: boolean
  readonly hiddenReveal?: HiddenReveal | null
  /** 방금 얹힌 물건의 색. 없으면 null */
  readonly landing: LandingGlow | null
  /** 지진 흔들림 진폭 (월드 단위). 0이면 흔들리지 않는다 */
  readonly quake?: number
  /** 흔들림 위상 — 프레임마다 흐르는 시간 */
  readonly quakePhase?: number
  /**
   * 주인별 표시 색. 멀티에서만 넘긴다.
   * 물건이 벗어나면 **주인**의 목숨이 깎이므로 누구 것인지 보이지 않으면
   * 하트가 왜 깎였는지 알 수 없다. 싱글은 주인이 하나뿐이라 null로 두고 그리지 않는다.
   */
  readonly ownerColors: ReadonlyMap<OwnerId, string> | null
  /**
   * 지금 서로 합칠 수 있는 것들의 표식. 변형 id → 모양 번호.
   *
   * 짝이 받침대 어디에 있는지 보여주려는 것이다 — 안 보이면 노릴 수가 없고,
   * 그러면 합성은 손으로 만드는 것이 아니라 운으로 얻는 것이 된다. 까닭은 `PairMarks.ts`에.
   */
  readonly pairMarks?: ReadonlyMap<string, number>
  /** 짝 표식의 밝기(0~1). 단어 칩과 **같은 값**이어야 둘이 함께 뛴다 */
  readonly pairPulse?: number
  /**
   * 화면이 올려다보는 높이. 탑이 자라면 이 값이 커져 시야가 따라 올라간다.
   * 이것이 없으면 탑이 스폰 높이에 닿는 순간 새 물건이 탑 속에 생긴다.
   */
  readonly cameraY: number
  /** 쌓인 것들의 꼭대기. 조준선이 여기까지 내려와 어디에 떨어질지 가리킨다 */
  readonly stackTop: number
  /** 밤이 얼마나 왔는가(0 → 낮, 1 → 밤). 받침대와 먼지 뭉치의 조명이 이 값을 따른다 */
  readonly nightfall?: number
  /**
   * 히든을 만나 공중에 선 작은 통나무들. 없으면 빈 배열이다.
   *
   * 받침대와 **같은 그림을 줄여서** 그린다 — 설명 없이 "여기도 받침대다"가 읽혀야
   * 새 자리인 줄 알고 노린다. 다른 모양으로 그리면 장식으로 보고 지나친다.
   */
  readonly ledges?: readonly {
    readonly x: number
    readonly y: number
    /** 통나무마다 길이가 다르다 — 같은 것만 서면 새 자리로 안 읽힌다 */
    readonly halfWidth: number
  }[]
  /**
   * 지금 뭉쳐지고 있는 통나무. 다 앉으면 `ledges`로 옮겨간다.
   *
   * 히든 연출이 뜨는 자리에서 출발해 놓일 곳으로 날아가 앉는다 — **어디서 온
   * 보상인지**가 보여야 히든과 통나무가 한 사건으로 읽힌다. 따로 툭 생기면
   * 그저 발판이 하나 늘어난 것이 된다.
   */
  readonly formingLedge?: {
    readonly x: number
    readonly y: number
    readonly halfWidth: number
    /** 0(히든 자리에서 출발) → 1(다 앉음) */
    readonly progress: number
  } | null
  /**
   * 판이 시작된 뒤 흐른 시간(초). 줄어들지 않는 값이어야 한다.
   *
   * 꼬리 부스러기가 이것의 **차이**로 시간을 흘린다. 렌더러는 `update`와 따로 도는
   * 콜백이라 dt를 받지 않는데, 브라우저 시계를 여기서 읽으면 판의 시간과 어긋난다 —
   * 일시정지 중에도 부스러기가 계속 흐르게 된다.
   */
  readonly time: number
  /**
   * 이번 프레임에 부딪힌 자리들. 액체가 담긴 물건이면 그 자리에서 물이 퍼진다.
   *
   * 부딪힘을 렌더러가 스스로 알아내지 않는 이유는, 물리가 이미 그 판정을 갖고 있고
   * (`IMPACT_MIN_SPEED`) 두 벌을 두면 **조율한 문턱이 서로 어긋나기** 때문이다.
   * 소리도 같은 판정을 쓴다.
   */
  readonly impacts: readonly TrailHit[]
  /**
   * 물건을 놓쳐 뛰어든 고양이. 없으면 null이다.
   *
   * 어디로 뛰는지는 `catPose.ts`가 정한다 — 여기 오는 것은 "누가 어디서 언제부터"까지다.
   */
  readonly cat?: CatView | null
  /** 실제 이동이 아닌 표시 보정 중이라 꼬리 속도 계산에서 뺄 바디들 */
  readonly suppressTrails?: ReadonlySet<number>
}

const COLORS = {
  aimTrack: 'rgba(255, 207, 92, 0.16)',
  danger: 'rgba(255, 107, 107, 0.5)',
  hidden: '#ffcf5c',
} as const

const ARROW_ART = `${import.meta.env.BASE_URL}arena/stack-drop-arrow.png`

/** 파이프라인이 여백을 잘라둔 것들. 낮/밤이 한 쌍이다 */
function artUrl(name: ArenaArtName): string {
  return `${import.meta.env.BASE_URL}arena/${GENERATED_ART[name].file}`
}

const ARENA_ART_SOURCES = [
  ARROW_ART,
  ...(Object.keys(GENERATED_ART) as ArenaArtName[]).map(artUrl),
]

/* 투명 여백을 빼고 그려, 화살표 끝이 물리 위치에 맞는다. */
const ARROW_CROP = { x: 208, y: 123, width: 621, height: 776 } as const

/**
 * 상자 그림에서 **물건이 얹히는 선**이 위에서 몇 %인가.
 *
 * 상자는 열린 채 비스듬히 보이므로 그림의 맨 위가 아니라 앞쪽 테두리가 바닥이다.
 * 그 선을 `ARENA.platformTop`에 맞춰야 물건이 상자 **안에** 담긴 것으로 보인다 —
 * 그림 위쪽(상자 안벽)이 물건 뒤로 남아 그렇게 읽힌다.
 *
 * 알파로는 잴 수 없는 값이라 눈으로 정했다. **그림을 다시 그리면 다시 봐야 한다.**
 */
const PLATFORM_SURFACE = 0.46

/**
 * 상자 그림에서 **몸통이 차지하는 폭**의 비율. 나머지는 양옆으로 열린 덮개다.
 *
 * 그림 전체를 받침대 폭에 맞추면 덮개까지 안으로 들어와 몸통이 받침대보다 좁아지고,
 * 끝에 얹힌 물건이 허공에 뜬 것처럼 보인다. 몸통을 기준으로 맞추면 덮개는 밖으로
 * 삐져나가는데 그쪽이 옳다 — 덮개는 물건을 받지 않는다.
 */
const PLATFORM_BODY = 0.88

/**
 * 히든 이름을 적는 **분실물 꼬리표**.
 *
 * 낙하 단어 쪽지(`TypingLane`)와 같은 종이·먹빛이다. 판에 글자가 적히는 자리는
 * 전부 이 방의 종이여야 한다 — 한 곳만 다른 재질이면 그것만 화면에 얹은 UI로 뜬다.
 *
 * 방의 그림(메모장)을 쓰지 않고 직접 그리는 이유는 **크기가 글자를 따라야** 하기
 * 때문이다. 물건 이름은 두 자에서 여덟 자까지라 그림 한 장을 늘여 쓰면 짧은 이름에서
 * 종이가 휑하고 긴 이름에서는 스프링이 늘어난다.
 */
const TAG_PAPER = '#f0e6cd'
const TAG_EDGE = 'rgba(150, 130, 96, 0.55)'
const TAG_INK = '#3a3020'

/**
 * index.css의 --sans와 같은 스택.
 * canvas의 font는 CSS 변수를 해석하지 못하고, 해석에 실패하면 대입 자체가 무시되어
 * 직전 폰트(고스트 이모지 크기)가 그대로 남는다 — 그래서 값을 여기에 펼쳐 쓴다.
 */
const UI_FONT = "system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

/**
 * 이탈선 아래로 남겨두는 여백(월드 단위).
 *
 * 이것이 없으면 이탈선이 캔버스 맨 아랫줄에 붙는다. 잰 값으로는 캔버스 끝이 763,
 * 선이 760~762였다 — 레인의 점선 바닥과 뭉개져 굵은 얼룩처럼 보이고, 물건이
 * 선을 넘어가는 장면은 화면 밖에서 일어나 보이지 않았다.
 * 여백을 두면 넘어가는 순간이 보이고 두 선이 서로 떨어진다.
 */
const KILL_LINE_MARGIN = 0.35

const WORLD_HEIGHT = ARENA.height - ARENA.killY + KILL_LINE_MARGIN
const WORLD_WIDTH = ARENA.halfWidth * 2

class ArenaRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private scale = 1
  private cssWidth = 0
  private cssHeight = 0
  /** 흘린 부스러기들. 렌더러가 소유한다 — 판의 결과에 닿지 않는 연출이다 */
  private readonly trails = new TrailField()
  private trailTime = 0
  /** 밤이 얼마나 왔는가. 프레임마다 상태에서 받아 낮/밤 그림을 겹치는 데 쓴다 */
  private nightfall = 0

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('2D 컨텍스트를 얻을 수 없다')
    }
    this.canvas = canvas
    this.ctx = ctx
    this.resize()
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.cssWidth = rect.width
    this.cssHeight = rect.height
    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 캔버스는 레인 뒤까지 넓게 깔리지만 아레나는 가운데 폭 안에 머문다 —
    // 남는 좌우 공간은 튕겨 나간 물건과 히든 연출이 잘리지 않게 쓰인다
    const arenaWidth = Math.min(rect.width, ARENA_SCREEN_MAX_WIDTH)
    this.scale = Math.min(arenaWidth / WORLD_WIDTH, rect.height / WORLD_HEIGHT)
  }

  draw(given: ArenaRenderState): void {
    const state = withDefaults(given)
    const { ctx } = this
    this.cameraY = state.cameraY
    this.nightfall = state.nightfall
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)

    /*
     * 얹힌 색은 **흔들림 밖에서** 화면 전체에 깐다.
     *
     * 흔들림 안에 두면 색판이 함께 밀려 가장자리에 칠하지 않은 띠가 생긴다.
     * 그리는 순서도 여기가 맞다 — 틀·받침대·물건보다 뒤에 있어야 색이 그것들을
     * 덮지 않는다. 캔버스가 레인 뒤까지 화면을 덮고 있어 이 한 번의 칠이 곧 배경이다.
     */
    if (state.landing !== null) {
      this.drawLandingGlow(state.landing)
    }

    ctx.save()
    /*
     * 흔들림은 설정을 곱해 쓴다. 0이면 아예 흔들리지 않는다 —
     * 흔들리는 화면이 어지러운 사람에게는 이 게임이 못 하는 게임이 된다.
     */
    const shake = state.quake * shakeScale()
    if (shake > 0) {
      // 결정론적 흔들림 — 두 주파수를 겹쳐 규칙적으로 보이지 않게 한다
      const amp = shake * this.scale
      const t = state.quakePhase
      ctx.translate(Math.sin(t * 47) * amp, Math.cos(t * 31) * amp * 0.7)
    }

    // 히든 연출은 배경에 깔린다 — 쌓인 물건을 가리지 않아야 한다
    if (state.hiddenReveal !== null) {
      this.drawHiddenReveal(state.hiddenReveal)
    }
    this.drawPlatformBack()
    if (state.formingLedge !== null) {
      this.drawFormingLedge(state.formingLedge)
    }
    if (state.showAim) {
      this.drawAim(state.aimX, state.stackTop)
    }
    /*
     * 부스러기는 물건보다 **뒤에** 그린다. 위에 그리면 흘린 것이 흘린 물건을 가려
     * 무엇이 떨어지는지가 오히려 안 보인다 — 꼬리를 붙인 이유와 반대가 된다.
     */
    this.drawTrails(state)
    for (const body of state.bodies) {
      this.drawBody(
        body,
        state.ownerColors,
        state.pairMarks.get(body.variant.id),
        state.pairPulse,
      )
    }
    /*
     * 앞벽은 **물건 뒤에** 온다. 이 한 줄이 "상자 위에 쌓였다"를 "상자에 담겼다"로
     * 바꾼다 — 물건의 아랫동이 앞벽에 가려 상자 속으로 들어간 것으로 읽힌다.
     *
     * 통나무는 그보다 더 앞이다. 상자 밖 공중에 서는 것이라 앞벽에 가리면 없는
     * 것처럼 보인다.
     */
    this.drawPlatformFront()
    this.drawLedges(state.ledges)
    /*
     * 고양이가 **가장 앞이다.** 목숨이 깎였다는 소식이라 이 프레임에서 가장 중요하고,
     * 무엇에 가리면 그 소식이 안 닿는다. 흔들림 안에 두는 것은 같은 방 안의 것이기
     * 때문이다 — 밖으로 빼면 화면이 흔들리는데 고양이만 가만히 있어 얹은 UI로 보인다.
     */
    if (state.cat !== null) {
      this.drawCat(state.cat)
    }
    ctx.restore()
  }


  private toScreenX(worldX: number): number {
    return this.cssWidth / 2 + worldX * this.scale
  }

  private cameraY = 0

  private toScreenY(worldY: number): number {
    return (
      this.cssHeight -
      KILL_LINE_MARGIN * this.scale -
      (worldY - ARENA.killY - this.cameraY) * this.scale
    )
  }

  /**
   * 방금 얹힌 물건의 색을 화면에 번지게 한다.
   *
   * `lighter`(가산 합성)를 쓴다. 보통 합성으로 덮으면 짙은 색이 배경을 **어둡게** 만들어
   * "무엇이 얹혔다"가 아니라 "화면이 꺼졌다"로 보인다. 빛을 더하는 쪽이면 어떤 색이든
   * 밝아지는 방향으로만 움직이므로, 배경이 어두운 이 화면에서 늘 같은 뜻으로 읽힌다.
   *
   * 알파에 사용자 설정을 곱한다. 0이면 아예 그리지 않는다 — 색이 번지는 화면이
   * 눈에 피로한 사람에게는 그것만으로 이 게임이 오래 못 하는 게임이 된다.
   */
  private drawLandingGlow(landing: LandingGlow): void {
    const alpha = glowAlpha(landing.progress, landing.strength) * glowScale()
    if (alpha <= 0) {
      return
    }
    const { ctx } = this
    ctx.save()
    /*
     * **언제나 곱으로 덮는다.** 더하기는 배경이 밝을수록 여지가 줄지만(255가 상한)
     * 곱하기는 비율로 움직여 배경 밝기와 무관하다 — 어느 배경에서도 같은 만큼
     * 어두워진다. 그래서 낮과 밤을 가르지 않는다. 까닭은 `glow.ts`에.
     */
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = glowStyle(glowColor(landing.color), alpha)
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)
    ctx.restore()
  }

  /**
   * 흘린 부스러기를 그린다.
   *
   * **전부 그대로 덮는다.** 반짝임만 빛을 더해 그렸는데, 물건이 쌓이는 자리의 배경이
   * 낮·밤 모두 밝아서(휘도 155) 겹칠 때 하얗게 뜨기만 했다. 대비는 밝기와 테두리가
   * 만든다 — 까닭은 `trailPaint.ts`에.
   *
   * 시간은 `state.time`의 차이로 낸다. 처음 한 프레임과 판이 새로 시작된 프레임은
   * 차이가 뒤로 가거나 크게 뛰므로 흘리지 않고 기준만 맞춘다.
   */
  private drawTrails(state: ArenaRenderState): void {
    const scale = trailScale()
    if (scale <= 0) {
      this.trails.reset()
      this.trailTime = state.time
      return
    }
    const dt = state.time - this.trailTime
    this.trailTime = state.time
    if (dt < 0) {
      // 판이 새로 시작됐다
      this.trails.reset()
      return
    }
    this.trails.update(state.bodies, dt, state.impacts, state.suppressTrails)

    const { ctx } = this
    ctx.save()
    for (const particle of this.trails.particles) {
      const paint = trailPaint(particle, scale)
      if (paint.alpha <= 0) {
        continue
      }
      ctx.fillStyle = paint.style
      traceTrail(ctx, particle.kind, {
        x: this.toScreenX(particle.x),
        y: this.toScreenY(particle.y),
        /*
         * 김은 피어오르며 퍼진다(`grow`). 크기가 그대로면 위로 흐르는 점들이라
         * 연기가 아니라 거품으로 보인다.
         */
        radius: Math.max(0.9, particle.size * grownBy(particle) * this.scale),
        /*
         * 방울만 속도에서 기울기를 낸다 — 늘어난 방향이 나아가는 방향과 같아야
         * "튀었다"로 읽힌다. 나머지는 스스로 뒹군다.
         *
         * 캔버스는 y가 아래로 +이므로 세로 속도의 부호를 뒤집는다.
         */
        angle:
          particle.spin === 0
            ? Math.atan2(-particle.vy, particle.vx)
            : particle.angle,
      })
      ctx.fill()
      if (paint.outline !== null) {
        ctx.lineWidth = paint.outline.width
        ctx.strokeStyle = paint.outline.style
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /*
   * 아래 붉은 이탈선을 지웠다.
   *
   * 배경이 그림으로 바뀌면서 선 하나가 그 위에 떠 있는 것이 됐다. 무엇보다 어디서
   * 잃는지는 **물건이 떨어져 사라지는 것**으로 이미 알 수 있다 — 선은 그 사실을
   * 되풀이할 뿐이었다. 규칙은 그대로다(`collapseDetector`).
   */


  /**
   * 낮 그림 위에 밤 그림을 `nightfall`만큼 덮어 그린다.
   *
   * 두 그림은 같은 자리에 같은 실루엣으로 그려져 있으므로(에셋 규칙이 그렇다)
   * 겹쳐 놓고 위쪽 알파만 올리면 조명만 넘어간다. 색을 계산해 섞으려 들면 붓질과
   * 그림자까지 뭉개진다 — **덮어 그리는 쪽이 그림이 가진 정보를 지키는 방법이다.**
   */
  private drawDayNight(
    day: ArenaArtName,
    night: ArenaArtName,
    place: (image: HTMLImageElement) => void,
  ): boolean {
    const dayImage = sprite(artUrl(day))
    if (dayImage === null) {
      return false
    }
    place(dayImage)
    const nightImage = sprite(artUrl(night))
    if (nightImage !== null && this.nightfall > 0) {
      const { ctx } = this
      /*
       * 지금 걸려 있는 알파에 **곱한다.** 덮어쓰면 이 함수를 페이드 안에서 못 쓴다 —
       * 히든 쪽지가 사라지는 중인데 밤 그림만 또렷하게 남는다.
       */
      const base = ctx.globalAlpha
      ctx.globalAlpha = base * this.nightfall
      place(nightImage)
      ctx.globalAlpha = base
    }
    return true
  }

  /**
   * 물건을 놓치면 뛰어들어 물어 가는 고양이.
   *
   * 물건이 테두리 밖으로 조용히 날아가는 것만으로는 **무엇을 잃었는지도 잃었다는
   * 것도 잘 안 보였다** — 화면 구석에서 일어나고 그때 눈은 다음 단어를 쫓고 있다.
   * 고양이가 가로질러 오르면 그 순간이 한 번 화면을 지난다.
   *
   * **낮/밤을 가르지 않는다.** 그림이 한 장뿐이라 `drawDayNight`를 쓰지 않는다 —
   * 방의 물건이 아니라 잠깐 들어왔다 나가는 것이라 조명에 물들지 않아도 어색하지 않고,
   * 오히려 배경에서 떨어져 나와 보이는 쪽이 이 연출이 하려는 일에 맞는다.
   *
   * 그림이 아직 안 왔으면 **아무것도 그리지 않는다.** 물건은 이미 세계에서 치워졌고
   * (`PhysicsWorld`), 여기서 대신 네모를 그리면 정체 모를 덩이가 지나갈 뿐이다.
   */
  private drawCat(cat: CatView): void {
    const pose = catPose(cat)
    const image = sprite(artUrl(pose.art))
    if (image === null) {
      return
    }
    const { ctx } = this
    const width = pose.width * this.scale
    const height = width * (image.naturalHeight / image.naturalWidth)
    ctx.drawImage(
      image,
      this.toScreenX(pose.x) - width / 2,
      this.toScreenY(pose.y) - height / 2,
      width,
      height,
    )

    /*
     * 물고 있는 물건은 고양이 **뒤에** 그린다. 앞에 두면 물건이 얼굴을 가려 어느
     * 고양이인지가 안 보이고, 무엇보다 입에 문 것이 아니라 앞에 든 것으로 보인다.
     */
    if (pose.carry !== null) {
      // 위에서 이미 그린 고양이를 물건 위에 한 번 더 덮는다
      this.drawCarried(cat, pose.carry)
      ctx.drawImage(
        image,
        this.toScreenX(pose.x) - width / 2,
        this.toScreenY(pose.y) - height / 2,
        width,
        height,
      )
    }
  }

  /** 고양이가 물고 가는 물건. 판에 있던 것과 같은 그림·같은 크기다 */
  private drawCarried(cat: CatView, at: { readonly x: number; readonly y: number }): void {
    const { ctx } = this
    ctx.save()
    ctx.translate(this.toScreenX(at.x), this.toScreenY(at.y))
    /*
     * 조금 기울여 문다. 똑바로 두면 물건이 공중에 정지한 것으로 보여, 물려 가는 것이
     * 아니라 고양이와 겹쳐 지나가는 것으로 읽힌다.
     */
    ctx.rotate(cat.from === 'left' ? 0.35 : -0.35)
    this.drawSprite(cat.variant.sprite, cat.variant.artBounds, null)
    ctx.restore()
  }

  /**
   * 받침대를 놓을 화면 사각형. 앞뒤 두 장이 **같은 자리**에 그려져야 한다.
   *
   * 파이프라인이 앞뒤를 한 묶음으로 잘라 두 장의 크기가 같으므로, 자리를 한 번만
   * 재서 둘 다에 쓴다. 따로 재면 잘린 양이 달라 앞벽이 어긋난다.
   */
  private platformRect(): { left: number; top: number; width: number; height: number } {
    const art = GENERATED_ART['platform-back-day']
    const width = (ARENA.platformHalfWidth * 2 * this.scale) / PLATFORM_BODY
    const height = width * (art.height / art.width)
    return {
      left: this.toScreenX(0) - width / 2,
      top: this.toScreenY(ARENA.platformTop) - height * PLATFORM_SURFACE,
      width,
      height,
    }
  }

  /**
   * 받침대의 **뒤쪽** — 안벽과 뒤 덮개. 물건보다 먼저 그린다.
   *
   * 예전에는 통짜 그림 한 장이었다. 물건이 그 위에 그려지므로 상자 앞으로 아랫동이
   * 삐져나왔고, 담긴 것처럼 보이게 하려고 그림을 눈대중 비율만큼 올려 **담긴 척**만
   * 했다. 앞뒤가 갈라진 지금은 사이에 물건을 끼워 넣으면 그만이다.
   */
  private drawPlatformBack(): void {
    const { ctx } = this
    const box = this.platformRect()
    const drawn = this.drawDayNight('platform-back-day', 'platform-back-night', (image) => {
      ctx.drawImage(image, box.left, box.top, box.width, box.height)
    })
    if (drawn) {
      return
    }
    // 이미지를 못 받아도 물리 받침대가 보이지 않는 상태로 플레이시키지 않는다
    ctx.fillStyle = '#4a5171'
    ctx.fillRect(
      this.toScreenX(-ARENA.platformHalfWidth),
      this.toScreenY(ARENA.platformTop),
      ARENA.platformHalfWidth * 2 * this.scale,
      ARENA.platformHalfHeight * 2 * this.scale,
    )
  }

  /**
   * 받침대의 **앞벽** — 물건을 다 그린 뒤에 덮는다. 그래야 상자에 담긴다.
   *
   * 통나무(먼지 뭉치)는 이 앞에 둔다. 상자 밖 공중에 서는 것이라 앞벽에 가리면
   * 없는 것처럼 보인다.
   */
  private drawPlatformFront(): void {
    const { ctx } = this
    const box = this.platformRect()
    this.drawDayNight('platform-front-day', 'platform-front-night', (image) => {
      ctx.drawImage(image, box.left, box.top, box.width, box.height)
    })
  }

  /**
   * 공중에 선 작은 통나무들.
   *
   * 받침대와 **같은 그림을 줄여서** 그린다. 새 그림을 그리지 않아도 되는 데다,
   * 무엇보다 같은 그림이라 "여기도 받침대다"가 설명 없이 읽힌다 — 다른 모양이면
   * 장식으로 보고 지나쳐서, 자리를 하나 더 준 보상이 전달되지 않는다.
   */
  private drawLedges(
    ledges: readonly { readonly x: number; readonly y: number; readonly halfWidth: number }[],
  ): void {
    if (ledges.length === 0) {
      return
    }
    const { ctx } = this
    const height = LEDGE.halfHeight * 2 * this.scale

    for (const ledge of ledges) {
      const width = ledge.halfWidth * 2 * this.scale
      const left = this.toScreenX(ledge.x - ledge.halfWidth)
      const top = this.toScreenY(ledge.y)
      /*
       * 먼지 뭉치는 **콜라이더 높이에 맞춰 눌러 그린다.** 받침대처럼 그림 비율대로
       * 늘리면 보이는 두께와 부딪히는 두께가 어긋나 허공에 걸린 것처럼 보인다.
       * 뭉치는 형태가 무른 것이라 눌려도 어색하지 않다.
       */
      const drawn = this.drawDayNight('ledge-day', 'ledge-night', (image) => {
        ctx.drawImage(image, left, top, width, height)
      })
      if (!drawn) {
        ctx.fillStyle = '#4a5171'
        ctx.fillRect(left, top, width, height)
      }
    }
  }

  /**
   * 히든 연출이 뭉쳐 통나무가 되는 장면.
   *
   * 히든이 뜨는 자리(아레나 위쪽 가운데)에서 출발해 놓일 곳으로 날아가 앉는다.
   * **어디서 온 보상인지**가 보여야 히든과 통나무가 한 사건으로 읽힌다 — 따로 툭
   * 생기면 발판이 하나 늘어난 것일 뿐이고, 그러면 히든을 노릴 이유가 되지 않는다.
   *
   * 크고 흐린 빛덩이로 출발해 **작고 또렷한 통나무**로 앉는다. 뭉쳐진다는 말이
   * 그대로 크기와 진하기다.
   */
  private drawFormingLedge(forming: {
    readonly x: number
    readonly y: number
    readonly halfWidth: number
    readonly progress: number
  }): void {
    const { ctx } = this
    const t = Math.min(Math.max(forming.progress, 0), 1)
    // 출발은 빠르고 도착은 느리다. 끝에서 천천히 앉아야 "자리를 잡았다"로 읽힌다
    const ease = 1 - (1 - t) * (1 - t) * (1 - t)

    const fromX = this.toScreenX(0)
    const fromY = this.toScreenY(ARENA.height * 0.74 + this.cameraY)
    const toX = this.toScreenX(forming.x)
    /*
     * **도착점은 통나무의 가운데다.** `forming.y`는 윗면이고(콜라이더가
     * `y - halfHeight`에 중심을 둔다), 이 연출은 그림을 `(cx, cy)`를 **중심으로**
     * 그린다. 윗면을 그대로 도착점으로 쓰면 연출이 반 칸 높은 데서 끝나고, 다 앉는
     * 순간 통나무가 그림 높이의 절반만큼 **툭 내려앉는다.** 서는 자리는 맞는데
     * 연출만 어긋난 것이라 눈에만 보이고 물리로는 잡히지 않는다.
     */
    const toY = this.toScreenY(forming.y - LEDGE.halfHeight)
    const cx = fromX + (toX - fromX) * ease
    const cy = fromY + (toY - fromY) * ease

    const width = forming.halfWidth * 2 * this.scale
    const height = LEDGE.halfHeight * 2 * this.scale
    const spread = 1 + (1 - ease) * 2.2

    ctx.save()

    // 뭉쳐지는 빛. 흩어져 있을수록 크고 흐리다
    ctx.globalAlpha = 0.55 * (1 - ease * 0.7)
    ctx.fillStyle = COLORS.hidden
    ctx.beginPath()
    ctx.ellipse(cx, cy, (width / 2) * spread, (height / 2) * spread * 1.6, 0, 0, Math.PI * 2)
    ctx.fill()

    /*
     * 먼지 뭉치는 뭉쳐질수록 또렷해진다.
     *
     * 여기만 낮/밤을 겹치지 않고 **한쪽을 고른다.** 이 그림은 이미 `ease`로 알파가
     * 걸려 있어서, 겹쳐 그리려면 알파를 곱해 넣어야 하는데 그러면 뭉쳐지는 연출과
     * 조명 전환이 한 값에 엉킨다. 뭉치는 시간이 0.85초라 그 사이에 낮과 밤이
     * 갈리는 일은 사실상 없다.
     */
    ctx.globalAlpha = ease * ease
    const dust = sprite(artUrl(this.nightfall > 0.5 ? 'ledge-night' : 'ledge-day'))
    if (dust !== null) {
      ctx.drawImage(dust, cx - width / 2, cy - height / 2, width, height)
    } else {
      ctx.fillStyle = '#4a5171'
      ctx.fillRect(cx - width / 2, cy - height / 2, width, height)
    }

    // 다 앉는 순간 한 번 퍼진다. 여기서부터 실제로 물건을 받는다는 표시다
    if (t > 0.8) {
      const ring = (t - 0.8) / 0.2
      ctx.globalAlpha = (1 - ring) * 0.6
      ctx.strokeStyle = COLORS.hidden
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(
        toX,
        toY,
        (width / 2) * (1 + ring * 0.9),
        (height / 2) * (1 + ring * 2.4),
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
    }

    ctx.restore()
  }

  private drawAim(worldX: number, stackTop: number): void {
    const { ctx } = this
    const x = this.toScreenX(worldX)
    const top = this.toScreenY(ARENA.height + this.cameraY)
    // 조준선은 쌓인 것의 꼭대기에서 끝난다 — 실제로 물건이 닿을 자리다
    const trackBottom = this.toScreenY(stackTop)
    const arrow = sprite(ARROW_ART)
    const arrowWidth = Math.min(44, Math.max(32, this.scale * 0.36))
    const arrowHeight = arrowWidth * (ARROW_CROP.height / ARROW_CROP.width)
    const arrowTop = top + 2
    const trackTop = arrow === null ? top + 22 : arrowTop + arrowHeight

    ctx.save()
    ctx.strokeStyle = COLORS.aimTrack
    ctx.lineWidth = 2
    ctx.setLineDash([4, 10])
    ctx.beginPath()
    ctx.moveTo(x, trackTop)
    ctx.lineTo(x, trackBottom)
    ctx.stroke()
    ctx.restore()

    if (arrow !== null) {
      ctx.drawImage(
        arrow,
        ARROW_CROP.x,
        ARROW_CROP.y,
        ARROW_CROP.width,
        ARROW_CROP.height,
        x - arrowWidth / 2,
        arrowTop,
        arrowWidth,
        arrowHeight,
      )
      return
    }

    ctx.save()
    ctx.fillStyle = '#ffcf5c'
    ctx.beginPath()
    ctx.moveTo(x, top + 20)
    ctx.lineTo(x - 9, top + 2)
    ctx.lineTo(x + 9, top + 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /**
   * 히든이 나왔을 때 아레나 배경에 이름과 링을 깔아준다.
   *
   * 합성이면 그 앞에 **재료가 모이는 장면**이 붙는다. 결과물만 띄우면 방금 무엇이
   * 사라졌는지 알 수 없어서, 붙여보고 싶은 짝을 다음 판에 기억하지 못한다 —
   * 합성은 레시피를 외워가는 재미인데 그 배울 기회가 딱 이 순간뿐이다.
   *
   * 물건이 실제로 합쳐지는 곳은 쌓인 탑 위 그 자리이고, 여기는 **그것을 알리는
   * 자막**이다. 자막에서 다시 합치는 것이 두 번 보여주는 셈처럼 보이지만,
   * 탑 위에서 벌어지는 일은 한 프레임 만에 끝나고 그때 눈은 다음 단어를 쫓고 있다.
   */
  private drawHiddenReveal(reveal: HiddenReveal): void {
    const { ctx } = this
    const t = Math.min(Math.max(reveal.progress, 0), 1)
    // 앞의 12%는 밝아지고, 뒤의 40%는 사라진다
    const alpha = t < 0.12 ? t / 0.12 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1
    if (alpha <= 0) {
      return
    }

    const cx = this.toScreenX(0)
    /*
     * 아레나 위쪽에 띄운다. 가운데(0.52)에 두면 쌓인 물건이 정확히 그 자리로 올라와
     * 이름이 가려진다 — 히든이 나온 순간이 가장 반가운데 그때 이름을 못 읽으면 헛일이다.
     * 스택은 아래에서 자라고 화살표는 맨 위를 지나므로 그 사이가 유일하게 비어 있는 띠다.
     */
    // 히든 연출은 배경 자막이지 월드에 놓인 물건이 아니다 —
    // 카메라를 더해 시야에 붙여두지 않으면 탑이 높아졌을 때 화면 밖으로 흘러내린다
    const cy = this.toScreenY(ARENA.height * 0.74 + this.cameraY)
    const unit = this.scale

    /*
     * 합성이면 앞 3할 동안 재료가 모인다. 그동안 결과물은 아직 없다 —
     * 겹쳐 그리면 결과가 재료보다 먼저 보여서 "합쳐졌다"가 아니라 "셋이 겹쳤다"가 된다.
     */
    const merging = reveal.from.length > 0
    const gather = merging ? Math.min(t / MERGE_GATHER, 1) : 1

    ctx.save()
    ctx.globalAlpha = alpha

    if (merging && gather < 1) {
      this.drawGathering(reveal.from, cx, cy, unit, gather, alpha)
      ctx.restore()
      return
    }

    // 모임이 끝난 **그 순간**에 한 번 번쩍인다. 재료가 결과로 바뀌는 자리를 못 박는다
    const flash = merging ? Math.max(0, 1 - (t - MERGE_GATHER) / 0.1) : 0
    if (flash > 0) {
      // 결과물을 덮어버리지 않을 만큼만. 가리면 번쩍임이 아니라 빈칸으로 보인다
      ctx.globalAlpha = alpha * flash * 0.55
      ctx.fillStyle = COLORS.hidden
      ctx.beginPath()
      ctx.arc(cx, cy, unit * (0.5 + (1 - flash) * 1.1), 0, Math.PI * 2)
      ctx.fill()
    }

    /*
     * 링은 결과물이 나온 시점을 0으로 잡는다. 합성일 때 연출 시작을 0으로 두면
     * 재료가 모이는 동안 링이 이미 다 퍼져서, 정작 결과가 나올 때는 아무 일도 없다.
     */
    const ringBase = merging ? Math.max(0, (t - MERGE_GATHER) / (1 - MERGE_GATHER)) : t
    for (let i = 0; i < 2; i += 1) {
      const ringT = Math.min(ringBase * 1.6 - i * 0.18, 1)
      if (ringT <= 0) continue
      ctx.beginPath()
      ctx.arc(cx, cy, unit * (0.3 + ringT * 1.7), 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.hidden
      ctx.globalAlpha = alpha * (1 - ringT) * 0.5
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // 결과물은 튀어나오듯 커진다. 모이던 것이 하나로 뭉쳐 부풀어 오르는 것으로 읽힌다
    const pop = merging ? Math.min(ringBase / 0.16, 1) : 1

    /*
     * **나온 직후가 가장 또렷하다.**
     *
     * 예전에는 처음부터 끝까지 0.2로 깔아 배경 무늬처럼 두었다. 그러면 무엇을
     * 얻었는지 그림으로는 알아볼 수 없어 이름을 읽어야만 했는데, 합성은 판당
     * 0.27회뿐인 순간이라 그 한 번은 눈에 들어와야 한다.
     *
     * 그렇다고 끝까지 또렷하면 커지는 그림이 아레나를 덮는다. 그래서 **커질수록
     * 흐려지게** 한다 — 터져 나왔다가 흩어지는 것으로 읽힌다. 링이 퍼지는 것과
     * 같은 시계(`ringBase`)를 쓰므로 합성이든 운이든 결과가 나온 순간이 0이다.
     */
    const settle = Math.min(Math.max((ringBase - 0.2) / 0.4, 0), 1)
    ctx.globalAlpha = alpha * pop * (0.75 - settle * 0.5)
    const ghost = unit * (1.3 + t * 0.5) * (0.55 + pop * 0.45)
    const img = sprite(reveal.sprite)
    if (img !== null) {
      const ratio = img.naturalWidth / img.naturalHeight
      const w = ratio >= 1 ? ghost : ghost * ratio
      const h = ratio >= 1 ? ghost / ratio : ghost
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const labelSize = Math.max(16, unit * 0.34)
    const tagSize = Math.max(10, unit * 0.16)
    /*
     * 쪽지는 물건 그림 **아래로 비켜선다.** 0.62로 두었더니 그림의 아랫동이 종이를
     * 덮어 이름이 반쯤 가려졌다 — 무엇을 얻었는지 알리려고 띄운 것이 그림에 가린다.
     * 그림은 커지며 흩어지므로(`ghost`) 그 크기에 비례해 내려야 늘 비켜선다.
     */
    const labelY = cy + ghost * 0.95
    const tagY = labelY + Math.max(16, unit * 0.32)

    /*
     * 이름은 **보관소의 메모지 위에** 적힌다.
     *
     * 예전에는 어두운 둥근 판을 깔았다. 배경이 단색일 때는 그것이 배경의 일부처럼
     * 보였는데, 방을 그린 그림 위에서는 **화면에 얹은 UI**로 떠버린다 — 방 안의
     * 물건들 사이에 검은 상자 하나만 다른 세계에서 온 것처럼 놓인다.
     *
     * 메모지는 이 방에 원래 있는 물건이다. 분실물 보관소에서 무엇이 들어왔는지
     * 적어두는 자리이므로, 히든을 찾은 것을 여기에 적는 것이 방의 이야기와 맞는다.
     * 낮/밤 그림이 한 쌍이라 조명도 방을 따라간다.
     */
    ctx.font = `700 ${labelSize}px ${UI_FONT}`
    const textWidth = Math.max(ctx.measureText(reveal.label).width, tagSize * 5)

    /*
     * **한 값이 네 변을 다 정한다.**
     *
     * 예전에는 변마다 따로 적혀 있어서 여백이 어긋나 있었다 — 좌우 `0.80`, 위
     * `0.45`, 아래 `0.74`(labelSize 기준). 위가 유독 좁아 글자가 종이 윗변에
     * 붙어 보였다. 변마다 다른 식으로 적으면 글자 크기를 만질 때마다 그 비율이
     * 다시 어긋난다.
     *
     * 글자가 차지하는 칸은 `textBaseline = 'middle'` 기준이라 각 줄의 위아래로
     * 제 글자 크기의 절반씩이다. 그 칸에 사방 같은 여백을 두른다.
     */
    const pad = labelSize * 0.62
    const contentTop = labelY - labelSize / 2
    const contentBottom = tagY + tagSize / 2
    const plateWidth = textWidth + pad * 2
    const plateTop = contentTop - pad
    const plateHeight = contentBottom + pad - plateTop
    ctx.globalAlpha = alpha * 0.94
    ctx.fillStyle = TAG_PAPER
    ctx.strokeStyle = TAG_EDGE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(cx - plateWidth / 2, plateTop, plateWidth, plateHeight, labelSize * 0.35)
    ctx.fill()
    ctx.stroke()

    // 종이 위에 쓰는 글씨다. 금색은 어두운 판에서나 읽히고 종이 위에서는 번진다
    ctx.globalAlpha = alpha
    ctx.fillStyle = TAG_INK
    ctx.fillText(reveal.label, cx, labelY)
    ctx.font = `${tagSize}px ${UI_FONT}`
    ctx.globalAlpha = alpha * 0.7
    // 어느 길로 얻었는지가 이 한 단어로 갈린다 — 운으로 만난 것과 손으로 만든 것
    ctx.fillText(reveal.from.length > 0 ? '합성' : 'HIDDEN', cx, tagY)

    ctx.restore()
  }

  /**
   * 재료가 가운데로 미끄러져 들어온다.
   *
   * 출발 자리는 `GATHER_FROM`의 방향뿐이고 거리는 화면 크기(`unit`)를 따른다 —
   * 실제로 어디서 합쳐졌는지와는 상관없다. 이것은 월드에 놓인 물건이 아니라
   * "이것과 이것이었다"를 알리는 자막이다.
   */
  private drawGathering(
    from: readonly string[],
    cx: number,
    cy: number,
    unit: number,
    gather: number,
    alpha: number,
  ): void {
    const { ctx } = this
    // 끝에서 살짝 붙는 느낌이 나도록 뒤로 갈수록 빨라진다
    const eased = gather * gather * (3 - 2 * gather)
    const spread = unit * 1.5 * (1 - eased)
    // 겹치기 직전에 작아진다 — 같은 크기로 겹치면 뒤엣것이 앞엣것에 가려 사라진 것처럼 보인다
    const size = unit * (1.0 - eased * 0.25)

    for (let i = 0; i < from.length; i += 1) {
      const dir = GATHER_FROM[i % GATHER_FROM.length]!
      const img = sprite(from[i]!)
      if (img === null) {
        continue
      }
      const ratio = img.naturalWidth / img.naturalHeight
      const w = ratio >= 1 ? size : size * ratio
      const h = ratio >= 1 ? size / ratio : size
      // 처음부터 알아볼 수 있어야 한다 — 무엇이 재료였는지가 이 연출의 전부다
      ctx.globalAlpha = alpha * (0.5 + eased * 0.4)
      ctx.drawImage(
        img,
        cx + dir[0] * spread - w / 2,
        cy + dir[1] * spread - h / 2,
        w,
        h,
      )
    }
  }

  private drawBody(
    body: BodySnapshot,
    ownerColors: ReadonlyMap<OwnerId, string> | null,
    mark: number | undefined,
    pulse: number,
  ): void {
    const { ctx } = this
    const { shape } = body.variant

    ctx.save()
    ctx.translate(this.toScreenX(body.x), this.toScreenY(body.y))
    // 월드는 y가 위로 +, 캔버스는 아래로 + 이므로 회전 방향을 뒤집는다
    ctx.rotate(-body.rotation)

    /*
     * 짝 표식은 **물건의 실루엣 테두리**로 두른다. 대전에서 주인을 가르는 것과 같은
     * 장치다(`rimCache`) — 동그라미를 덧그리면 물건 위에 딴 것이 얹힌 것으로 보이는데,
     * 이것은 그 물건에 대한 이야기이므로 물건의 윤곽을 따라야 한다.
     *
     * 둘이 겹칠 일은 없다. 주인 색은 대전에만, 짝 표식은 싱글에만 있다.
     */
    const ownerColor = ownerColors?.get(body.owner) ?? null
    const rimColor =
      ownerColor ??
      (mark === undefined
        ? null
        : (PAIR_MARK_COLORS[mark % PAIR_MARK_COLORS.length] ?? null))
    /*
     * 짝 표식은 **숨 쉬듯 밝아졌다 어두워진다.** 단어 칩이 같은 주기로 빛나므로,
     * 둘이 함께 뛰는 것으로 보여 "이 둘이 한 쌍"이 색보다 먼저 읽힌다.
     * 주인 색은 신원이라 흔들리면 안 되므로 그대로 둔다.
     */
    const rimAlpha = ownerColor === null && mark !== undefined ? pulse : 1
    const drawn = this.drawSprite(body.variant.sprite, body.variant.artBounds, rimColor, rimAlpha)

    // 그림이 아직 로드되지 않았으면 충돌 도형만이라도 보여준다
    if (!drawn) {
      ctx.fillStyle = body.variant.color
      ctx.strokeStyle = rimColor ?? 'rgba(0, 0, 0, 0.4)'
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.55
      for (const part of this.partsOf(shape)) {
        this.tracePart(part)
        ctx.fill()
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  /**
   * 그림을 물건의 원래 크기에 맞춰 그린다 — 보이는 것과 부딪히는 것이 같아야 한다.
   * 주인 색 테두리는 미리 만들어 둔 것을 겹쳐 그린다 (rimCache).
   */
  private drawSprite(
    src: string,
    bounds: Bounds,
    ownerColor: string | null,
    rimAlpha = 1,
  ): boolean {
    const img = sprite(src)
    if (img === null) {
      return false
    }
    const { ctx } = this
    const width = bounds.hw * 2 * this.scale
    const height = bounds.hh * 2 * this.scale
    const left = -width / 2
    const top = -height / 2

    if (ownerColor !== null) {
      const glow = rim(img, ownerColor)
      if (glow !== null) {
        ctx.globalAlpha = rimAlpha
        // 테두리 그림은 원본보다 여백만큼 크다. 같은 비율로 넓게 그려야 자리가 맞는다
        const pad = padRatio(img)
        const padX = width * pad.x
        const padY = height * pad.y
        ctx.drawImage(glow, left - padX, top - padY, width + padX * 2, height + padY * 2)
        ctx.globalAlpha = 1
      }
    }

    ctx.drawImage(img, left, top, width, height)
    return true
  }

  private partsOf(shape: ShapeDef): readonly ShapePart[] {
    if (shape.kind === 'compound') {
      return shape.parts
    }
    return [{ shape, offset: { x: 0, y: 0 } }]
  }

  private tracePart(part: ShapePart): void {
    const { ctx, scale } = this
    ctx.beginPath()
    // 캔버스 y축이 뒤집혀 있으므로 오프셋의 y도 뒤집는다
    const ox = part.offset.x * scale
    const oy = -part.offset.y * scale
    this.traceShape(part.shape, ox, oy)
  }

  private traceShape(shape: PrimitiveShape, ox: number, oy: number): void {
    const { ctx, scale } = this
    switch (shape.kind) {
      case 'circle':
        ctx.arc(ox, oy, shape.radius * scale, 0, Math.PI * 2)
        break
      case 'box':
        ctx.rect(
          ox - shape.hw * scale,
          oy - shape.hh * scale,
          shape.hw * 2 * scale,
          shape.hh * 2 * scale,
        )
        break
      case 'capsule': {
        const r = shape.radius * scale
        const h = shape.halfHeight * scale
        ctx.moveTo(ox - r, oy - h)
        ctx.lineTo(ox - r, oy + h)
        ctx.arc(ox, oy + h, r, Math.PI, 0, true)
        ctx.lineTo(ox + r, oy - h)
        ctx.arc(ox, oy - h, r, 0, Math.PI, true)
        ctx.closePath()
        break
      }
      case 'polygon': {
        shape.points.forEach((point, index) => {
          const x = ox + point.x * scale
          const y = oy - point.y * scale
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.closePath()
        break
      }
    }
  }
}

export { ArenaRenderer, ARENA_ART_SOURCES }
export type { ArenaRenderState, HiddenReveal }
