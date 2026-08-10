import { shakeScale } from './displayPrefs.ts'
import { TrailField, type TrailHit } from '../systems/TrailField.ts'
import type { CatView } from '../systems/CatPickup.ts'
import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../config.ts'
import type { BodySnapshot, OwnerId } from '../types/game.ts'
import { ARENA_ART_SOURCES } from './arenaArt.ts'
import {
  catcherAlpha,
  catcherVisualOffset,
  drawAim,
  drawBody,
  drawCat,
  drawCatcher,
  drawLedges,
  drawPlatformBack,
  drawPlatformFront,
} from './arenaPaint.ts'
import {
  drawFormingLedge,
  drawHiddenReveal,
  drawLandingGlow,
  drawTrails,
  drawWhiteboardRecall,
} from './effectPaint.ts'
import type { ArenaView } from './arenaView.ts'

interface HiddenReveal {
  readonly label: string
  readonly sprite: string
  /**
   * 무엇으로 만들었는지. 히든은 합성 결과로만 나타나므로 재료를 함께 보여준다.
   */
  readonly from: readonly string[]
  /** 0 → 1 */
  readonly progress: number
}

interface WhiteboardRecall {
  readonly word: string
  readonly label: string
  readonly sprite: string
  readonly side: 'left' | 'right'
  readonly index: number
  /** 0 → 1 */
  readonly progress: number
}

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
  readonly whiteboardRecall: WhiteboardRecall | null
  readonly formingLedge: NonNullable<ArenaRenderState['formingLedge']> | null
  readonly catcher: NonNullable<ArenaRenderState['catcher']> | null
  readonly cat: CatView | null
}

/** 없는 것에 기본값을 준다. **한 곳에서만 정한다** — 그리는 자리마다 물으면 곧 갈린다 */
function withDefaults(state: ArenaRenderState): FilledRenderState {
  return {
    ...state,
    hiddenReveal: state.hiddenReveal ?? null,
    whiteboardRecall: state.whiteboardRecall ?? null,
    quake: state.quake ?? 0,
    quakePhase: state.quakePhase ?? 0,
    nightfall: state.nightfall ?? 0,
    ledges: state.ledges ?? NO_LEDGES,
    formingLedge: state.formingLedge ?? null,
    catcher: state.catcher ?? null,
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
 * **한쪽에만 있는 것은 선택 항목이다**(`?`). 대전 엔진이 `ledges: []` 같은 빈 값을
 * 억지로 채워 넣어야 했는데, 그러면 혼자 하기에 연출을 하나 더할 때마다 **대전 엔진도
 * 함께 고쳐야 컴파일된다** — 실제로 하루에 네 번 (`ledges`·`nightfall`·`pairMarks`·
 * `pairPulse`) 그 줄 때문에 남의 작업이 딸려오거나 main이 깨질 뻔했다. `nightfall`은
 * 이제 양쪽이 쓰지만, 빠뜨린 렌더 호출을 안전하게 낮으로 그리는 기본값은 그대로 둔다.
 *
 * 기본값은 `withDefaults`가 한 곳에서 채운다. 그리는 쪽이 "없으면 어떻게"를 알고
 * 있으면, 넘기는 쪽은 자기가 아는 것만 넘기면 된다.
 */
interface ArenaRenderState {
  readonly bodies: readonly BodySnapshot[]
  readonly aimX: number
  readonly showAim: boolean
  readonly hiddenReveal?: HiddenReveal | null
  readonly whiteboardRecall?: WhiteboardRecall | null
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
   * 화이트보드 단어를 쳤을 때 잠깐 나오는 회수 손/판.
   *
   * 물리 콜라이더와 같은 중심·길이·기울기를 받는다. 보이는 판과 부딪히는 판이
   * 어긋나면 회수 규칙이 연출 때문에 불공정하게 보인다.
   */
  readonly catcher?: {
    readonly x: number
    readonly y: number
    readonly halfLength: number
    readonly angle: number
    /** 0(나옴) → 1(사라짐) */
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
  readonly duelTowers?: readonly DuelTowerRenderState[]
}

interface DuelTowerRenderState {
  readonly id: OwnerId
  readonly bodies: readonly BodySnapshot[]
  readonly aimX: number
  readonly showAim: boolean
  readonly cameraY: number
  readonly stackTop: number
  readonly ownerColors: ReadonlyMap<OwnerId, string> | null
}

/**
 * 이탈선 아래로 남겨두는 여백(월드 단위).
 *
 * 이것이 없으면 이탈선이 캔버스 맨 아랫줄에 붙는다. 잰 값으로는 캔버스 끝이 763,
 * 선이 760~762였다 — 레인의 점선 바닥과 뭉개져 굵은 얼룩처럼 보이고, 물건이
 * 선을 넘어가는 장면은 화면 밖에서 일어나 보이지 않았다.
 * 여백을 두면 넘어가는 순간이 보이고 두 선이 서로 떨어진다.
 *
 * 하단 HUD를 한 줄로 압축한 뒤에는 이탈선을 화면 안에 남겨둘 필요보다 판을 넓게 쓰는
 * 쪽이 더 중요하다. 음수면 이탈선은 살짝 화면 아래로 밀리고, 받침대는 그만큼 내려간다.
 * 실제 물리 이탈선은 `ARENA.killY` 그대로라 게임 규칙은 바뀌지 않는다.
 */
const KILL_LINE_MARGIN = -0.18

/*
 * 화살표는 실제 스폰 지점(ARENA.spawnY)에 아래 끝을 맞춘다. 그래서 화살표 몸통은
 * spawnY보다 위로 올라가며, 렌더 높이 계산도 그 여유까지 포함해야 낮은 뷰포트에서
 * 잘리지 않는다.
 */
const WORLD_TOP = Math.max(ARENA.height, ARENA.spawnY + 0.8)
const WORLD_HEIGHT = WORLD_TOP - ARENA.killY + KILL_LINE_MARGIN
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
    const view = this.view()
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
    if (state.duelTowers !== undefined && state.duelTowers.length > 0) {
      this.drawDuel(state.duelTowers)
      return
    }

    /*
     * 얹힌 색은 **흔들림 밖에서** 화면 전체에 깐다.
     *
     * 흔들림 안에 두면 색판이 함께 밀려 가장자리에 칠하지 않은 띠가 생긴다.
     * 그리는 순서도 여기가 맞다 — 틀·받침대·물건보다 뒤에 있어야 색이 그것들을
     * 덮지 않는다. 캔버스가 레인 뒤까지 화면을 덮고 있어 이 한 번의 칠이 곧 배경이다.
     */
    if (state.landing !== null) {
      drawLandingGlow(view, state.landing)
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
      drawHiddenReveal(view, state.hiddenReveal)
    }
    drawPlatformBack(view)
    if (state.formingLedge !== null) {
      drawFormingLedge(view, state.formingLedge)
    }
    if (state.showAim) {
      drawAim(view, state.aimX, state.stackTop)
    }
    /*
     * 부스러기는 물건보다 **뒤에** 그린다. 위에 그리면 흘린 것이 흘린 물건을 가려
     * 무엇이 떨어지는지가 오히려 안 보인다 — 꼬리를 붙인 이유와 반대가 된다.
     */
    this.trailTime = drawTrails(view, this.trails, state, this.trailTime)
    /*
     * 회수 손은 물건보다 먼저 그린다. 손이 물건을 받는 연출이므로 손바닥이 물건을
     * 덮으면 들어 올린 것이 아니라 물건 앞을 가로막은 것처럼 보인다.
     */
    if (state.catcher !== null) {
      drawCatcher(view, state.catcher)
    }
    if (state.whiteboardRecall !== null && state.catcher !== null) {
      drawWhiteboardRecall(view, state.whiteboardRecall, state.catcher)
    }
    for (const body of state.bodies) {
      const recalled = body.recalled === true && state.catcher !== null
      const bodyAlpha = recalled ? catcherAlpha(state.catcher.progress) : 1
      if (recalled) {
        const side = state.catcher.x < 0 ? 'left' : 'right'
        ctx.save()
        ctx.translate(catcherVisualOffset(side), 0)
      }
      drawBody(
        view,
        body,
        state.ownerColors,
        state.pairMarks.get(body.variant.id),
        state.pairPulse,
        bodyAlpha,
      )
      if (recalled) {
        ctx.restore()
      }
    }
    /*
     * 앞벽은 **물건 뒤에** 온다. 이 한 줄이 "상자 위에 쌓였다"를 "상자에 담겼다"로
     * 바꾼다 — 물건의 아랫동이 앞벽에 가려 상자 속으로 들어간 것으로 읽힌다.
     *
     * 통나무는 그보다 더 앞이다. 상자 밖 공중에 서는 것이라 앞벽에 가리면 없는
     * 것처럼 보인다.
     */
    drawPlatformFront(view)
    drawLedges(view, state.ledges)
    /*
     * 고양이가 **가장 앞이다.** 목숨이 깎였다는 소식이라 이 프레임에서 가장 중요하고,
     * 무엇에 가리면 그 소식이 안 닿는다. 흔들림 안에 두는 것은 같은 방 안의 것이기
     * 때문이다 — 밖으로 빼면 화면이 흔들리는데 고양이만 가만히 있어 얹은 UI로 보인다.
     */
    if (state.cat !== null) {
      drawCat(view, state.cat)
    }
    ctx.restore()
  }

  private drawDuel(towers: readonly DuelTowerRenderState[]): void {
    const { ctx } = this
    const count = Math.max(1, towers.length)
    const gap = 12
    const width = (this.cssWidth - gap * (count - 1)) / count
    for (let index = 0; index < towers.length; index += 1) {
      const tower = towers[index]
      if (tower === undefined) {
        continue
      }
      const left = index * (width + gap)
      const scale = Math.min(width / WORLD_WIDTH, this.cssHeight / WORLD_HEIGHT)
      const view: ArenaView = {
        ctx,
        scale,
        cssWidth: width,
        cssHeight: this.cssHeight,
        cameraY: tower.cameraY,
        nightfall: this.nightfall,
        toScreenX: (worldX) => left + width / 2 + worldX * scale,
        toScreenY: (worldY) => (
          this.cssHeight -
          KILL_LINE_MARGIN * scale -
          (worldY - ARENA.killY - tower.cameraY) * scale
        ),
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(left, 0, width, this.cssHeight)
      ctx.clip()
      drawPlatformBack(view)
      if (tower.showAim) {
        drawAim(view, tower.aimX, tower.stackTop)
      }
      for (const body of tower.bodies) {
        drawBody(view, body, tower.ownerColors, undefined, 0, 1)
      }
      drawPlatformFront(view)
      ctx.restore()
    }
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


  private view(): ArenaView {
    return {
      ctx: this.ctx,
      scale: this.scale,
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      cameraY: this.cameraY,
      nightfall: this.nightfall,
      toScreenX: (worldX) => this.toScreenX(worldX),
      toScreenY: (worldY) => this.toScreenY(worldY),
    }
  }
}

export { ArenaRenderer, ARENA_ART_SOURCES }
export type { ArenaRenderState, HiddenReveal, LandingGlow, WhiteboardRecall, DuelTowerRenderState }
