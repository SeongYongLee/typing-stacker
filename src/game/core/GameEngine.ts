import {
  AIM_HALF_RANGE,
  ARENA,
  DROP_COOLDOWN_MS,
  INVULNERABLE_SEC,
  CATCH,
  LEDGE,
  NIGHT_SCORE_INTERVAL,
  NIGHT_SEC,
  SOLO_LIVES,
  SOLO_OWNER,
  QUAKE_DURATION,
  QUAKE_IMPACT_SCALE,
  QUAKE_MAX_AMPLITUDE,
} from '../config.ts'
import { VARIANT_BY_ID, WORDS } from '../data/words.ts'
import { shapeBounds } from '../shapes.ts'
import { PhysicsWorld, type ImpactEvent } from '../physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../renderer/ArenaRenderer.ts'
import { Aimer } from '../systems/Aimer.ts'
import { difficultyAt, difficultyProgress } from '../systems/Difficulty.ts'
import { RECIPES } from '../data/recipes.ts'
import { placeLedge } from '../systems/Ledge.ts'
import { resolveCrafted, resolveItem } from '../systems/ItemResolver.ts'
import { canMergeAnything, findMerge } from '../systems/Merger.ts'
import { pairMarks, pairPulse } from '../systems/PairMarks.ts'
import { RecipeFlow } from '../systems/RecipeFlow.ts'
import { NightFever, isLifeProtected } from '../systems/NightFever.ts'
import { timeOfDay, type Phase, type TimeOfDay } from '../systems/DayNight.ts'
import { Whiteboard } from '../systems/Whiteboard.ts'
import { catchSpot, plankOf, recallDropX, type CatchPlank } from '../systems/Catcher.ts'
import { createRng, type Rng } from '../systems/Rng.ts'
import { followCameraY, spawnYFor, targetCameraY } from '../systems/Camera.ts'
import { Collection } from '../systems/Collection.ts'
import { ScoreManager } from '../systems/ScoreManager.ts'
import { judgeInput } from '../systems/TypingJudge.ts'
import { impactEventOf, quakeEventOf, trailHitOf } from '../systems/ImpactFeel.ts'
import { WordSpawner } from '../systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../types/events.ts'
import type { FallingWord, GamePhase, ItemVariant, RunStats } from '../types/game.ts'
import { LandingGlow } from '../systems/LandingGlow.ts'
import { CatPickup, catPickupY } from '../systems/CatPickup.ts'
import type { TrailHit } from '../systems/TrailField.ts'
import { GameLoop } from './GameLoop.ts'

/** 알릴 짝이 없을 때 돌려주는 빈 표. 프레임마다 빈 Map을 새로 만들지 않으려는 것 */
const NO_MARKS: ReadonlyMap<string, number> = new Map()

/** 단어 → 그 단어의 기본 변형 id. 내려오는 단어가 무슨 재료인지 보려는 것이다 */
const WORD_BASE_ID = new Map(
  WORDS.map((entry) => [entry.word, entry.variants[0]?.id ?? '']),
)

/** 표에서 못 찾은 재료를 걸러낸다 — 레시피는 id 문자열이라 오타가 조용히 지나갈 수 있다 */
function isVariant(item: ItemVariant | undefined): item is ItemVariant {
  return item !== undefined
}

/** 무너지는 장면을 이만큼 보여준 뒤 결과 화면으로 넘어간다 */
const COLLAPSE_VIEW_SEC = 1.3

/** 목숨을 잃을 상황에서 고양이가 가끔 같은 물건을 다시 던져준다 */
const CAT_RETHROW_CHANCE = 0.25
/** 물고 간 뒤 바로 튀어나오면 고양이가 던진 것으로 읽히지 않아서 약간 기다린다 */
const CAT_RETHROW_DELAY_SEC = 0.28
/** 탑 중앙 부근에서 포물선 정점을 지나도록 맞춘 재투척 속도 */
const CAT_RETHROW_VELOCITY = { horizontal: 1.5, vertical: 8.2 } as const
/** 받을 곳이 없는 물건은 화면 아래까지 완전히 내려가기 전에 고양이가 낚아챈다 */
const CAT_EARLY_ESCAPE_MARGIN = 0.35
/** 보드 단어가 물건으로 바뀌어 손과 함께 사라지는 시간 */
const WHITEBOARD_RECALL_SEC = CATCH.holdSec

/**
 * 합성 연출 길이.
 *
 * 재료 둘과 결과물을 읽어야 하고, 그중 재료는 모이는 동안에만 보인다. 짧게 밀어 넣으면
 * 재료를 알아보기 전에 겹쳐버려서, 정작 이 연출을 붙인 이유(무엇으로 만들었는지
 * 알리는 것)가 사라진다.
 */
const MERGE_REVEAL_SEC = 3

interface SubmitFeedback {
  /** 같은 내용을 다시 제출해도 애니메이션이 다시 돌게 하는 일회용 키 */
  readonly seq: number
  readonly text: string
  readonly ok: boolean
  readonly itemLabel: string | null
  readonly hidden: boolean
  /** 이 입력으로 대기 중인 물건을 막았는지 */
}

interface GameState {
  readonly phase: GamePhase
  readonly elapsed: number
  readonly words: readonly FallingWord[]
  /**
   * 지금 내려오는 단어 중 **무엇과 붙는지 아는 것**들. 단어 → 표식 번호.
   *
   * 받침대의 물건에도 같은 번호가 붙어 있어서, 같은 모양끼리 붙이면 합쳐진다.
   * 까닭은 `systems/PairMarks.ts`에.
   */
  readonly wordMarks: ReadonlyMap<string, number>
  /**
   * 지금 벽에 적힌 회수 목록. 이 단어를 치면 쌓지 않고 빼낸다.
   *
   * 낙하 쪽지에 표식을 붙이는 쪽(`TypingLane`)과 벽을 그리는 쪽이 같은 값을 본다 —
   * 둘이 어긋나면 "보드에는 있는데 쪽지에는 표시가 없다"가 생긴다.
   */
  readonly whiteboard: readonly string[]
  /** 방금 보드 단어가 물건으로 바뀐 짧은 연출 */
  readonly whiteboardRecall: WhiteboardRecallView | null
  /**
   * 짝 표식의 밝기(0~1). 받침대의 물건도 **같은 값**으로 빛난다 —
   * 둘이 함께 뛰어야 한 쌍이라는 것이 색보다 먼저 읽힌다.
   */
  readonly pairPulse: number
  /**
   * 지금 몇 시인가 — 국면과 그 안의 진행도, 그리고 밤에 얼마나 잠겼는가.
   *
   * **규칙 쪽이 내놓는 값이다.** 그리는 쪽(시계·배경·받침대)은 이것을 받아 쓴다 —
   * 배경의 낮/밤은 `timeOfDay.nightfall`을 그대로 따라간다. 밤 국면에 들면 레시피
   * 묶음이 직접 떨어지고 하트가 무적이 된다. 화면과 규칙이 같은 시계를 본다.
   */
  readonly timeOfDay: TimeOfDay
  readonly aimNormalized: number
  readonly stats: RunStats
  readonly feedback: SubmitFeedback | null
  /** 판이 새로 시작될 때마다 올라간다. UI가 입력창을 초기화하는 신호 */
  readonly runSeq: number
  /**
   * 남은 무적 시간의 비율(1 → 방금 깎였다, 0 → 무적 아님).
   * 하트에 씌우는 베리어가 이 값으로 옅어진다.
   */
  readonly invulnerable: number
  /** 지금까지 도감에 모은 히든 물건 id */
  readonly collected: readonly string[]
  /** 그중 이번 판에 처음 만난 것 */
  readonly freshlyCollected: readonly string[]
}

interface PendingDrop {
  readonly variant: ItemVariant
  readonly x: number
  /** 회수로 떨구는 것인가. 쿨다운을 기다리는 동안에도 이 표를 잃으면 안 된다 */
  readonly recalled: boolean
}

interface WhiteboardRecallView {
  readonly word: string
  readonly label: string
  readonly sprite: string
  readonly side: 'left' | 'right'
  readonly index: number
  readonly progress: number
}

interface WhiteboardRecall {
  readonly word: string
  readonly label: string
  readonly sprite: string
  readonly side: 'left' | 'right'
  readonly index: number
  elapsed: number
}

interface PendingCatThrow {
  readonly variant: ItemVariant
  readonly from: 'left' | 'right'
  readonly delay: number
  readonly nightProtected: boolean
}

/**
 * 놓친 단어가 서 있던 자리를 아레나 x로 옮긴다.
 * 왼쪽 레인의 왼쪽 칸일수록 아레나 왼쪽에서 떨어진다 — 어디로 내려올지 미리 보이므로
 * 미리 대비할 수 있고, 조준 범위 안이라 예고 물건도 받침대에 온전히 얹힌다.
 */

class GameEngine {
  private readonly physics: PhysicsWorld
  private readonly loop = new GameLoop()
  private readonly score = new ScoreManager()
  private readonly collection: Collection
  /** 도감에 새 칸이 채워졌을 때. 바깥이 저장을 맡는다 */
  private onDiscover: ((ids: readonly string[]) => void) | null = null
  private rng: Rng
  private recipeFlow: RecipeFlow
  private catRng: Rng
  private nightFever: NightFever
  private spawner: WordSpawner
  /** 화이트보드보다 먼저 확정한 현재 집중 레시피의 단어들 */
  private focusedRecipeWords: readonly string[] = []
  /** RecipeFlow에 넘길 개수표. 매 프레임 새 Map을 만들지 않고 비워 쓴다. */
  private readonly recipeCounts = new Map<string, number>()
  private aimer = new Aimer(AIM_HALF_RANGE)

  private phase: GamePhase = 'title'
  private elapsed = 0
  private seed: number
  private feedback: SubmitFeedback | null = null
  private feedbackSeq = 0

  private sinceLastDrop = Number.POSITIVE_INFINITY
  /** Night Fever 중 놓친 단어 수. 이 구간에는 정확도 점수 패널티를 매기지 않는다. */
  private feverForgivenMisses = 0
  private collapseTimer = 0
  /**
   * 지금 알리는 중인 물건.
   *
   * `from`이 있으면 **합성으로 얻은 것**이라 재료가 모이는 장면부터 보여준다.
   * 운으로 나온 히든은 재료가 없으므로 비어 있다 — 어느 길로 얻었는지가 이 하나로 갈린다.
   */
  private hiddenReveal:
    | {
        variant: ItemVariant
        from: readonly ItemVariant[]
        elapsed: number
        /** 이 연출이 도는 시간(초). 합성과 운이 다르다 */
        duration: number
      }
    | null = null
  /** 뭉쳐지는 중인 통나무. 다 앉으면 물리에 세우고 비운다 */
  private formingLedge: { x: number; y: number; halfWidth: number; elapsed: number } | null = null
  /** 낮에 합성이 연달아 일어나도 통나무 보상을 덮어쓰지 않도록 기다리는 횟수 */
  private pendingLedgeRewards = 0
  /** 방금 얹힌 물건의 색. 대전과 같은 것을 쓴다 */
  private readonly landing = new LandingGlow()
  /**
   * 물건을 놓치면 뛰어드는 고양이. 판의 결과에 닿지 않는 연출이다.
   *
   * 목숨을 잃는 이탈에만 부른다 — 무너질 때 우수수 떨어지는 것까지 부르면 고양이가
   * 여럿 교차해 무엇이 목숨을 깎았는지 오히려 안 보인다.
   */
  private readonly cats: CatPickup
  /**
   * 이번 프레임에 부딪힌 자리들. 렌더러가 그 자리에서 물이 퍼지게 하는 데 쓴다.
   *
   * 배열을 새로 만들지 않고 **비워 쓴다.** 매 프레임 도는 자리라 새로 만들면
   * 그것만으로 쓰레기가 쌓인다 — 대부분의 프레임에는 부딪힘이 없어 빈 채로 넘어간다.
   */
  private readonly frameImpacts: TrailHit[] = []
  private quakeLeft = 0
  private quakeStrength = 0
  private quakePhase = 0
  /** 지금 화면이 올려다보는 높이. 탑을 따라 부드럽게 올라간다 */
  private cameraY = 0
  /** 이번 판에 닿았던 가장 높은 난이도 진행도(0~1) */
  private difficultyPeak = 0
  private lives = SOLO_LIVES
  /** 남은 무적 시간(초). 목숨을 잃은 직후의 연쇄 이탈을 한 번으로 묶는다 */
  private invulnerableLeft = 0
  /** 직전에 매긴 짝 표식. 색을 이어 쓰려면 지난 판정을 들고 있어야 한다 */
  private lastMarks: ReadonlyMap<string, number> = NO_MARKS
  /** 지금 국면. 바뀔 때만 Fever와 레시피 흐름을 갈아끼우려고 들고 있는다 */
  private phaseNow: Phase = 'day'
  /** 낮에 얻어 다음 Night Fever까지 쌓인 점수. 밤에 얻은 점수는 포함하지 않는다. */
  private dayScore = 0
  /** 현재 Night Fever에서 흐른 시간. 밤은 기존처럼 10초 동안 열린다. */
  private nightElapsed = 0
  /** 프레임 사이 새로 얻은 점수만 낮 게이지에 더하기 위한 기준값. */
  private observedRawScore = 0
  /** 벽에 적힌 회수 목록. 여기 있는 단어를 치면 쌓지 않고 빼낸다 */
  private readonly whiteboard = new Whiteboard(createRng(0x5eed))
  /** 지금 뻗어 있는 회수 판. 남은 시간이 0이 되면 치운다 */
  private catcherLeft = 0
  /** 렌더러가 물리 회수 판과 같은 자리에 손 그림을 그리기 위한 값 */
  private catcherView: CatchPlank | null = null
  /** 보드 단어가 물건으로 바뀌는 짧은 연결 연출 */
  private whiteboardRecall: WhiteboardRecall | null = null
  /** 표식을 계산한 프레임. 한 프레임에 두 번 세지 않으려는 것 */
  private markFrame = -1
  /** 프레임 번호. 늘어나기만 하면 되므로 update에서 한 번 올린다 */
  private frameSeq = 0
  private runSeq = 0
  private readonly dropQueue: PendingDrop[] = []
  private readonly catThrowQueue: PendingCatThrow[] = []

  private renderer: ArenaRenderer | null = null
  private listener: ((state: GameState) => void) | null = null
  /**
   * 사건을 받아가는 쪽(지금은 소리). 렌더러와 같은 자리다 —
   * 엔진은 무슨 일이 일어났는지만 말하고, 그것을 무엇으로 바꿀지는 바깥이 정한다.
   */
  private events: GameEventSink | null = null

  private constructor(physics: PhysicsWorld, seed: number, known: readonly string[]) {
    this.physics = physics
    this.seed = seed
    this.collection = new Collection(known)
    this.cats = new CatPickup(seed ^ 0x63617473)
    this.rng = createRng(seed)
    this.recipeFlow = new RecipeFlow(createRng(seed ^ 0x72656369), WORDS, RECIPES)
    this.catRng = createRng(seed ^ 0xc47f00d)
    this.nightFever = new NightFever(createRng(seed ^ 0x66657672), RECIPES, VARIANT_BY_ID)
    this.spawner = new WordSpawner(this.rng, WORDS, (candidates) =>
      this.recipeFlow.pick(candidates),
    )
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(seed: number, known: readonly string[] = []): Promise<GameEngine> {
    const physics = await PhysicsWorld.create()
    return new GameEngine(physics, seed, known)
  }

  /** 도감이 늘어날 때마다 부른다. 저장은 바깥(브라우저를 아는 쪽)이 한다 */
  onCollectionChange(listener: (ids: readonly string[]) => void): void {
    this.onDiscover = listener
  }

  onStateChange(listener: (state: GameState) => void): void {
    this.listener = listener
    this.emit()
  }

  /** 사건을 받아간다. 붙지 않으면 엔진은 아무것도 내보내지 않는다 */
  onEvent(sink: GameEventSink): void {
    this.events = sink
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.renderer = new ArenaRenderer(canvas)
    this.render()
  }

  detachCanvas(): void {
    this.renderer = null
  }

  handleResize(): void {
    this.renderer?.resize()
    this.render()
  }

  startRun(): void {
    this.phase = 'playing'
    this.elapsed = 0
    this.feedback = null
    this.sinceLastDrop = Number.POSITIVE_INFINITY
    this.feverForgivenMisses = 0
    this.collapseTimer = 0
    this.lives = SOLO_LIVES
    this.invulnerableLeft = 0
    this.lastMarks = NO_MARKS
    this.hiddenReveal = null
    this.formingLedge = null
    this.pendingLedgeRewards = 0
    this.quakeLeft = 0
    this.quakeStrength = 0
    this.dropQueue.length = 0
    this.catThrowQueue.length = 0
    this.runSeq += 1
    this.rng = createRng(this.seed)
    this.recipeFlow = new RecipeFlow(createRng(this.seed ^ 0x72656369), WORDS, RECIPES)
    this.catRng = createRng(this.seed ^ 0xc47f00d)
    this.nightFever = new NightFever(
      createRng(this.seed ^ 0x66657672),
      RECIPES,
      VARIANT_BY_ID,
    )
    this.spawner = new WordSpawner(this.rng, WORDS, (candidates) =>
      this.recipeFlow.pick(candidates),
    )
    this.focusedRecipeWords = []
    this.phaseNow = 'day'
    this.dayScore = 0
    this.nightElapsed = 0
    this.observedRawScore = 0
    this.whiteboard.clear()
    this.spawner.prefer(this.whiteboard.words)
    this.catcherLeft = 0
    this.catcherView = null
    this.whiteboardRecall = null
    this.aimer = new Aimer(AIM_HALF_RANGE)
    this.score.reset()
    this.collection.startRun()
    this.cats.reset(this.seed ^ 0x63617473)
    this.cameraY = 0
    this.difficultyPeak = 0
    this.physics.reset()
    this.observeRecipeFlow()
    this.syncWhiteboardWithRecipe()
    this.loop.start()
    this.fire({ kind: 'runStart' })
    this.emit()
  }

  /** 다음 판은 다른 단어 순서로 시작한다 */
  reseed(seed: number): void {
    this.seed = seed
  }

  toTitle(): void {
    this.loop.stop()
    this.phase = 'title'
    this.emit()
  }

  /**
   * Enter를 누른 순간 호출된다. 조준 x좌표는 지금 화면에 그려져 있는 화살표
   * 위치를 그대로 쓴다 — 보이는 것과 판정이 어긋나지 않아야 한다.
   */
  submit(text: string): void {
    if (this.phase !== 'playing') {
      return
    }

    this.feedbackSeq += 1

    const result = judgeInput(this.spawner.words, text)

    if (result.kind === 'miss') {
      this.feedback = {
        seq: this.feedbackSeq,
        text: result.input,
        ok: false,
        itemLabel: null,
        hidden: false,
      }
      this.fire({ kind: 'wordMiss' })
      this.emit()
      return
    }

    this.spawner.remove(result.word.id)
    this.score.onWordMatched(result.word.word)
    this.fire({ kind: 'wordHit', combo: this.score.comboCount })
    // 물건의 정체는 이 순간 처음 결정되고, 그대로 플레이어에게 공개된다
    const variant = resolveItem(result.word.word)
    /*
     * 보드에 적힌 단어면 **쌓지 않고 빼낸다.**
     *
     * 조준을 쓰지 않는 것이 이 갈래의 유일한 예외다 — 빼내는 쪽은 단어가 내려온
     * 레인이 정하는데 떨구는 자리를 조준이 정하면 판이 아레나를 가로지른다.
     * 까닭과 실측은 `CATCH.dropX`에.
     */
    const recallIndex = this.whiteboard.words.indexOf(result.word.word)
    const recalled = this.whiteboard.claim(
      result.word.word,
      WORDS,
      this.focusedRecipeWords,
    )
    this.spawner.prefer(this.whiteboard.words)
    if (recalled) {
      const side = result.word.side
      const dropX = recallDropX(side)
      const catcher = plankOf(catchSpot(dropX, side, this.physics.stackTop()))
      this.physics.clearCatcher()
      this.catcherView = catcher
      this.catcherLeft = CATCH.holdSec
      this.whiteboardRecall = {
        word: result.word.word,
        label: variant.label,
        sprite: variant.sprite,
        side,
        index: Math.max(recallIndex, 0),
        elapsed: 0,
      }
      this.fire({
        kind: 'drop',
        source: 'input',
        hidden: false,
        material: variant.material,
        tone: variant.tone,
      })
    } else {
      this.queueDrop(variant, this.aimer.worldX)
    }
    this.discover(variant)

    this.feedback = {
      seq: this.feedbackSeq,
      text: result.word.word,
      ok: true,
      itemLabel: variant.label,
      hidden: false,
    }
    this.emit()
  }

  /**
   * 판을 멈춘다. 루프는 계속 돌린다 — 멈추면 화면이 통째로 얼어붙어
   * 일시정지 창 뒤로 아무것도 안 보인다. 대신 update가 시간을 흘리지 않는다.
   */
  pause(): void {
    if (this.phase !== 'playing') {
      return
    }
    this.phase = 'paused'
    this.emit()
  }

  resume(): void {
    if (this.phase !== 'paused') {
      return
    }
    this.phase = 'playing'
    this.emit()
  }

  dispose(): void {
    this.loop.stop()
    this.renderer = null
    this.listener = null
    this.events = null
    this.physics.dispose()
  }

  private fire(event: GameEvent): void {
    this.events?.(event)
  }

  /**
   * 부딪힘을 소리와 화면으로 나눠 보낸다.
   *
   * 세기를 0~1로 눌러 보내는 이유는 받는 쪽이 물리 단위를 몰라도 되게 하려는 것이다.
   * 지진은 이미 화면을 흔들고 있으므로 소리에도 따로 알려서, 쿵 소리와 흔들림이
   * 같은 순간에 오게 한다.
   *
   * **색 번짐은 사건 통로를 타지 않는다.** 소리는 엔진이 모르는 바깥일이라 사건으로
   * 넘기지만, 화면은 엔진이 프레임마다 스냅샷으로 밀어주는 것이다 — 히든 연출과
   * 같은 자리다. 그래서 소리 수신자가 붙지 않은 판(테스트·headless)에서도 색은 남는다.
   */
  private handleImpacts(
    impacts: readonly ImpactEvent[],
    quake: number,
  ): void {
    this.landing.note(impacts)
    for (const hit of impacts) {
      this.frameImpacts.push(trailHitOf(hit))
    }
    if (this.events === null) {
      return
    }
    for (const hit of impacts) {
      this.fire(impactEventOf(hit))
    }
    const shake = quakeEventOf(quake)
    if (shake !== null) {
      this.fire(shake)
    }
  }

  private advanceQuake(dt: number): void {
    this.quakePhase += dt
    if (this.quakeLeft > 0) {
      this.quakeLeft = Math.max(this.quakeLeft - dt, 0)
    }
  }

  /** 충격 세기를 흔들림으로 바꾼다. 세기는 0~1로 눌러 화면이 과하게 튀지 않게 한다 */
  private applyQuake(impact: number): void {
    if (impact <= 0) {
      return
    }
    const strength = Math.min(impact / QUAKE_IMPACT_SCALE, 1)
    if (strength > this.quakeStrength || this.quakeLeft <= 0) {
      this.quakeStrength = strength
    }
    this.quakeLeft = QUAKE_DURATION
  }

  private get quakeAmplitude(): number {
    if (this.quakeLeft <= 0) {
      return 0
    }
    const decay = this.quakeLeft / QUAKE_DURATION
    return QUAKE_MAX_AMPLITUDE * this.quakeStrength * decay * decay
  }

  private queueDrop(variant: ItemVariant, x: number, recalled = false): void {
    if (this.sinceLastDrop >= DROP_COOLDOWN_MS / 1000) {
      this.dropNow(variant, x, recalled)
      return
    }
    // 쿨다운 중이면 조준한 x를 그대로 들고 대기한다. 입력을 버리지는 않는다.
    this.dropQueue.push({ variant, x, recalled })
  }

  /**
   * 물건을 실제로 세계에 떨군다.
   * 대기하다 떨어진 것도 여기를 지나므로, 낙하음이 물건이 생기는 순간과 어긋나지 않는다.
   */
  private dropNow(
    variant: ItemVariant,
    x: number,
    recalled = false,
    source: 'input' | 'fever' = 'input',
  ): void {
    this.physics.spawnItemAt(
      variant,
      x,
      spawnYFor(this.cameraY),
      SOLO_OWNER,
      0,
      recalled,
      source === 'fever',
    )
    this.sinceLastDrop = 0
    this.fire({
      kind: 'drop',
      source,
      hidden: false,
      material: variant.material,
      tone: variant.tone,
    })
  }

  private readonly update = (dt: number): void => {
    this.advanceQuake(dt)
    // 색은 판이 멈춰 있어도(일시정지·무너짐) 계속 사라져야 한다 — 그리기가 매 프레임 돈다
    this.landing.advance(dt)
    this.cats.update(dt)
    this.advanceCatThrows(dt)
    this.advanceWhiteboardRecall(dt)
    // 지난 프레임의 부딪힘은 이미 그려졌다. 비우지 않으면 물이 계속 퍼진다
    this.frameImpacts.length = 0

    if (this.phase === 'collapsing') {
      this.collapseTimer += dt
      this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
      this.syncEscapeLine()
      const result = this.physics.step(dt)
      this.applyQuake(result.quake)
      // 쏟아지는 동안에도 부딪히는 소리는 나야 한다. 무너짐은 이 게임의 결말이다
      this.handleImpacts(result.impacts, result.quake)
      if (this.collapseTimer >= COLLAPSE_VIEW_SEC) {
        this.phase = 'over'
        this.loop.stop()
        this.fire({ kind: 'gameOver', won: null })
      }
      this.emit()
      return
    }

    if (this.phase !== 'playing') {
      // 멈춘 동안에도 그리기는 이어진다 — 아래 render가 매 프레임 돈다
      return
    }

    this.elapsed += dt
    this.sinceLastDrop += dt
    this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
    this.syncEscapeLine()
    if (this.invulnerableLeft > 0) {
      this.invulnerableLeft = Math.max(this.invulnerableLeft - dt, 0)
    }

    if (this.hiddenReveal !== null) {
      this.hiddenReveal.elapsed += dt
      if (this.hiddenReveal.elapsed >= this.hiddenReveal.duration) {
        this.hiddenReveal = null
      }
    }
    this.advanceLedge(dt)
    this.advanceCatcher(dt)

    /*
     * 난이도는 쌓은 높이를 따라간다. 한 번 오른 뒤에는 내려가지 않는다 —
     * 탑이 무너질 때마다 단어가 뜸해졌다 몰아쳤다 하면 무엇이 기준인지 알 수 없다.
     */
    this.difficultyPeak = Math.max(
      this.difficultyPeak,
      difficultyProgress(this.physics.stackTop()),
    )
    this.frameSeq += 1
    if (this.phaseNow === 'night') {
      this.nightElapsed = Math.min(this.nightElapsed + dt, NIGHT_SEC)
      if (this.nightElapsed >= NIGHT_SEC) {
        this.applyPhase('day')
      }
    }
    const difficulty = difficultyAt(this.difficultyPeak)
    this.aimer.update(dt, difficulty.aimSpeed)
    /*
     * 놓친 단어는 판을 방해하지 않고 사라진다. 낮의 대가는 **콤보와 점수**다.
     * Night Fever에는 자동 낙하를 지켜보는 동안 점수가 되감기지 않도록 정확도 패널티를
     * 면제하되, 타자 콤보는 놓친 순간 그대로 끊는다.
     */
    this.observeRecipeFlow()
    this.syncWhiteboardWithRecipe()
    const missedWords = this.spawner.update(dt, difficulty)
    if (missedWords.length > 0) {
      this.score.onWordMissed()
      if (this.phaseNow === 'night') {
        this.feverForgivenMisses += missedWords.length
      }
    }

    if (this.dropQueue.length > 0 && this.sinceLastDrop >= DROP_COOLDOWN_MS / 1000) {
      const next = this.dropQueue.shift()
      if (next !== undefined) {
        this.dropNow(next.variant, next.x, next.recalled)
      }
    }

    const feverDrop = this.nightFever.update(dt, this.physics.snapshots())
    if (feverDrop !== null) {
      this.dropNow(feverDrop.variant, feverDrop.x, false, 'fever')
      this.discover(feverDrop.variant)
    }

    const { settled, impacts, escaped, quake } = this.physics.step(
      dt,
      this.phaseNow === 'night',
    )
    this.applyQuake(quake)
    this.handleImpacts(impacts, quake)
    for (const event of settled) {
      this.score.onSettled(event.variant, event.topY)
    }

    this.tryMerge()
    this.advanceDayScore()

    /*
     * 무너짐 한 번은 이탈 여러 개를 만든다. 그것을 각각 세면 목숨 3개가 한순간에
     * 사라지므로, 한 번 깎인 뒤에는 잠깐 무적으로 둔다 — 개수가 아니라 **사건**을 센다.
     */
    /*
     * **회수로 나간 것은 목숨을 깎지 않는다.** 그것이 이 규칙의 전부다.
     *
     * 물건마다 표를 보고 가른다 — 판이 서 있는 동안인지로 가르면 같은 프레임에 탑이
     * 무너졌을 때 그 이탈까지 함께 면제된다. 회수 하나가 붕괴 하나를 덮어주는 셈이라
     * 배출구가 아니라 방패가 된다.
     */
    const fallen = escaped.filter((event) => event.recalled !== true)
    if (fallen.length > 0 && this.phaseNow === 'night') {
      /*
       * Night Fever는 방어 구간이다. 빠진 물건마다 고양이를 한 마리씩 보내고 전부
       * 되던진다. 여러 물건이 같은 프레임에 빠져도 첫 물건만 구하면 "우르르"가
       * 아니라 평소 회수와 같아지므로 배열 전체를 처리한다.
       */
      for (const taken of fallen) {
        this.cats.take(taken.variant, taken.x, catPickupY(taken.y, this.cameraY), true)
        this.queueCatThrow(taken.variant, taken.x < 0 ? 'left' : 'right')
      }
    } else {
      const costly = fallen.filter((event) => event.nightProtected !== true)
      if (costly.length === 0 || isLifeProtected(this.phaseNow, this.invulnerableLeft)) {
        this.emit()
        return
      }
      // 목숨을 깎을 뻔한 그 물건을 고양이가 물어 간다. 여럿 떨어졌으면 첫 번째 것이다
      const taken = costly[0]
      if (taken !== undefined) {
        this.cats.take(taken.variant, taken.x, catPickupY(taken.y, this.cameraY))
      }
      if (taken !== undefined && this.catRng.next() < CAT_RETHROW_CHANCE) {
        this.queueCatThrow(taken.variant, taken.x < 0 ? 'left' : 'right')
      } else {
        this.lives = Math.max(this.lives - 1, 0)
        this.invulnerableLeft = INVULNERABLE_SEC
        // 콤보가 끊기는 유일한 조건이다 — 오타나 놓친 단어로는 끊기지 않는다
        this.score.onLifeLost()
        this.fire({ kind: 'lifeLost', livesLeft: this.lives })
      }
      if (this.lives === 0) {
        this.phase = 'collapsing'
        this.collapseTimer = 0
        this.fire({ kind: 'collapse' })
      }
    }

    this.emit()
  }

  private syncEscapeLine(): void {
    const stackTop = this.physics.stackTop()
    /*
     * 카메라가 내려오는 중이면 현재 카메라가 실제 탑보다 높게 남아 있다. 그 상태에서
     * 현재 카메라 하단선을 이탈선으로 쓰면 정상 낙하 물건도 고양이가 먼저 가져간다.
     * 올라갈 때는 현재 화면 기준으로 빠르게 잡고, 내려올 때는 목표 카메라 기준으로
     * 낮춰 잡는다.
     */
    const escapeCameraY = Math.min(this.cameraY, targetCameraY(stackTop))
    this.physics.setEscapeY(escapeCameraY + ARENA.killY + CAT_EARLY_ESCAPE_MARGIN)
  }

  private queueCatThrow(variant: ItemVariant, from: 'left' | 'right'): void {
    this.catThrowQueue.push({
      variant,
      from,
      delay: CAT_RETHROW_DELAY_SEC,
      nightProtected: this.phaseNow === 'night',
    })
  }

  private advanceCatThrows(dt: number): void {
    if (this.catThrowQueue.length === 0) {
      return
    }
    for (let index = this.catThrowQueue.length - 1; index >= 0; index -= 1) {
      const pending = this.catThrowQueue[index]
      if (pending === undefined) {
        continue
      }
      const delay = pending.delay - dt
      if (delay > 0) {
        this.catThrowQueue[index] = { ...pending, delay }
        continue
      }
      this.catThrowQueue.splice(index, 1)
      this.throwBackFromCat(pending.variant, pending.from, pending.nightProtected)
    }
  }

  private advanceWhiteboardRecall(dt: number): void {
    if (this.whiteboardRecall === null) {
      return
    }
    this.whiteboardRecall.elapsed += dt
    if (this.whiteboardRecall.elapsed >= WHITEBOARD_RECALL_SEC) {
      this.whiteboardRecall = null
    }
  }

  private throwBackFromCat(
    variant: ItemVariant,
    from: 'left' | 'right',
    nightProtected = false,
  ): void {
    const sign = from === 'left' ? -1 : 1
    this.physics.spawnItemMovingAt(
      variant,
      sign * (ARENA.platformHalfWidth + 0.7),
      this.cameraY + ARENA.platformTop + 1.15,
      SOLO_OWNER,
      0,
      false,
      {
        x: -sign * CAT_RETHROW_VELOCITY.horizontal,
        y: CAT_RETHROW_VELOCITY.vertical,
      },
      -sign * 1.8,
      false,
      nightProtected,
    )
    this.fire({
      kind: 'drop',
      source: 'input',
      hidden: false,
      material: variant.material,
      tone: variant.tone,
    })
  }

  /**
   * 레시피 흐름이 다음 단어를 고를 때 보는 현재 재료 수를 만든다.
   *
   * 받침대만 보면 늦다. 화면에 내려오는 단어와 드롭 대기열까지 세야 이미 약속한 재료를
   * 또 내보내지 않는다. 단어 입력은 기본 변형을 떨어뜨리므로 그 기준으로 센다.
   */
  private observeRecipeFlow(): void {
    this.recipeCounts.clear()
    for (const [id, count] of this.physics.countsByVariant()) {
      this.recipeCounts.set(id, count)
    }
    for (const falling of this.spawner.words) {
      if (falling.state !== 'active') {
        continue
      }
      const id = WORD_BASE_ID.get(falling.word)
      if (id !== undefined) {
        this.recipeCounts.set(id, (this.recipeCounts.get(id) ?? 0) + 1)
      }
    }
    for (const pending of this.dropQueue) {
      if (!pending.recalled) {
        const id = pending.variant.id
        this.recipeCounts.set(id, (this.recipeCounts.get(id) ?? 0) + 1)
      }
    }
    for (const pending of this.nightFever.pending) {
      const id = pending.variant.id
      this.recipeCounts.set(id, (this.recipeCounts.get(id) ?? 0) + 1)
    }
    this.recipeFlow.observe(this.recipeCounts)
  }

  /** 레시피를 먼저 정한 뒤 그 재료를 제외한 목록으로 회수 보드를 맞춘다. */
  private syncWhiteboardWithRecipe(): void {
    this.focusedRecipeWords = this.recipeFlow.prepareFocusWords()
    this.whiteboard.refill(WORDS, this.focusedRecipeWords)
    this.spawner.prefer(this.whiteboard.words)
  }

  /**
   * 닿아 있는 재료가 레시피를 이루면 합친다.
   *
   * 한 프레임에 하나만 합치는 이유는 재료가 겹칠 수 있어서다. 하나를 합친 뒤
   * 남은 것으로 다음 프레임에 다시 판단하면 규칙이 단순하고, 화면에서도
   * 연쇄가 한 번에 하나씩 터지는 것으로 보인다.
   */
  private tryMerge(): void {
    /*
     * 접촉을 보기 전에 재료가 갖춰졌는지부터 묻는다.
     *
     * `contactGraph()`는 물건마다 콜라이더를 전부 훑고 WASM 경계를 여러 번 넘는 데다
     * 접촉 쌍마다 열쇠 문자열을 만든다 — 한 프레임에서 물리 시뮬레이션 자체보다 비쌌다.
     * 그런데 재료로 쓰이는 물건은 일부뿐이라 **대부분의 프레임에는 합칠 후보가 없다.**
     * 개수만 세어보면 그 일을 통째로 건너뛸 수 있고, 걸러지는 경우는 어차피
     * `findMerge`가 null을 주던 경우이므로 결과는 달라지지 않는다.
     */
    if (!canMergeAnything(RECIPES, this.physics.countsByVariant())) {
      return
    }
    const match = findMerge(this.physics.contactGraph(), RECIPES)
    if (match === null) {
      return
    }
    /*
     * 재료를 맞췄어도 **무엇이 나올지는 모른다.** 레시피 다섯은 낮은 확률로 다른
     * 형태를 내놓는다(우주선의 비행접시, 하트반지의 다이아반지 …). 확률은 히든과
     * 같은 값이고 판의 난수를 쓰므로 같은 시드면 같은 결과다.
     */
    const result = resolveCrafted(match.recipe, this.rng)
    const created = this.physics.mergeItems(match.itemIds, result, SOLO_OWNER)
    if (created === null) {
      return
    }
    this.recipeFlow.onMerged(match.recipe)
    /*
     * 합성으로 얻은 것도 히든이다 — 운으로 만난 것과 같은 자리에서 알린다.
     * 다만 **무엇으로 만들었는지**를 함께 넘긴다. 결과물만 띄우면 방금 무엇이
     * 사라졌는지 알 수 없어서, 붙여보고 싶은 짝을 다음 판에 기억하지 못한다.
     */
    this.hiddenReveal = {
      variant: result,
      from: match.recipe.inputs.map((id) => VARIANT_BY_ID.get(id)).filter(isVariant),
      elapsed: 0,
      duration: MERGE_REVEAL_SEC,
    }
    this.fire({ kind: 'merge' })
    this.score.onCrafted(result)
    this.discover(result)
    // Night Fever 자체가 방어 구간이므로 합성으로 방어용 먼지구름·통나무를 더 만들지 않는다.
    if (this.phaseNow !== 'night') {
      this.growLedge()
    }
  }

  /**
   * 국면이 바뀌면 레시피 밀도와 Night Fever를 함께 바꾼다.
   *
   * 이미 내려오는 단어는 그대로 둔다. 밤에 들어가면 NightFever의 1.8초 낙하·3초 휴식 시계를 열고,
   * 새벽에는 밤에 시작된 붕괴가 뒤늦게 목숨을 깎지 않도록 기존 보호막을 이어 붙인다.
   */
  private applyPhase(next: Phase): void {
    if (next === this.phaseNow) {
      return
    }
    const previous = this.phaseNow
    this.phaseNow = next
    this.recipeFlow.setPhase(next)

    if (next === 'night') {
      this.nightElapsed = 0
      this.nightFever.start()
    } else if (previous === 'night') {
      this.nightFever.stop()
      this.nightElapsed = 0
      this.invulnerableLeft = Math.max(this.invulnerableLeft, INVULNERABLE_SEC)
    }
    /* 낮·밤 보드는 같은 프레임의 `syncWhiteboardWithRecipe`가 레시피 확정 뒤 맞춘다. */
  }

  /** 낮에 실제로 얻은 점수만 모아 5,000점마다 Night Fever를 한 번 연다. */
  private advanceDayScore(): void {
    const rawScore = this.score.rawPoints
    const gained = Math.max(rawScore - this.observedRawScore, 0)
    this.observedRawScore = rawScore
    if (this.phaseNow !== 'day' || gained === 0) {
      return
    }
    this.dayScore += gained
    if (this.dayScore >= NIGHT_SCORE_INTERVAL) {
      this.dayScore -= NIGHT_SCORE_INTERVAL
      this.applyPhase('night')
    }
  }

  private timeView(): TimeOfDay {
    return this.phaseNow === 'day'
      ? timeOfDay('day', this.dayScore / NIGHT_SCORE_INTERVAL)
      : timeOfDay('night', this.nightElapsed / NIGHT_SEC)
  }

  /**
   * 지금 서 있는 통나무들. 확인용이다.
   *
   * 통나무는 화면에만 나타나고 `GameState`에는 실리지 않아서(연출이라 규칙에 닿지
   * 않는다) 밖에서 볼 길이 없었다. 그래서 "합성했는데 안 생긴다"를 눈이 아니면
   * 확인할 수 없었다. 대전의 `debugBodies`와 같은 자리다.
   */
  debugLedges(): readonly { x: number; y: number; halfWidth: number }[] {
    return this.physics.ledges()
  }

  /** 현재 화이트보드보다 먼저 확정된 집중 레시피 단어. 엔진 통합 검증용이다. */
  debugFocusedRecipeWords(): readonly string[] {
    return this.focusedRecipeWords
  }

  /**
   * 물건을 만났다. 도감은 히든만이 아니라 전부를 센다 —
   * 기본 물건이 먼저 채워져야 도감이 비어 보이지 않고, 그 사이에 남은 빈 칸이
   * 무엇을 더 찾아야 하는지 알려준다.
   */
  private discover(variant: ItemVariant): void {
    if (this.collection.add(variant.id)) {
      this.onDiscover?.(this.collection.ids)
    }
  }

  /**
   * **합성했을 때만** 공중에 작은 통나무를 하나 세운다.
   *
   * 판을 끝내는 것은 점수가 아니라 얹을 자리가 좁아지는 것이니, 자리를 하나 더 주는
   * 것이 이 게임의 말로 된 보상이다. 자리를 고르는 규칙은 `systems/Ledge.ts`에 있다.
   *
   * ## 자리가 없으면 그냥 지나간다
   *
   * 억지로 끼워 넣으면 통나무가 탑 속에 박혀 물건을 밀어내고, 보상이 오히려 판을
   * 무너뜨린다.
   *
   * 물건의 크기는 회전을 무시하고 외접 사각형으로 본다. 기울어 누운 물건은 실제보다
   * 넓게 잡히는데, 그쪽으로 틀리는 편이 안전하다 — 겹쳐 세우는 것보다 한 번 거르는
   * 것이 싸다.
   */
  private growLedge(): void {
    this.pendingLedgeRewards += 1
    this.startNextLedge()
  }

  /** 진행 중인 통나무가 없을 때 대기 중인 합성 보상 하나를 꺼낸다. */
  private startNextLedge(): void {
    if (this.formingLedge !== null || this.pendingLedgeRewards <= 0) {
      return
    }
    this.pendingLedgeRewards -= 1
    const items = this.physics.frames().flatMap((frame) => {
      const variant = VARIANT_BY_ID.get(frame.variantId)
      if (variant === undefined) {
        return []
      }
      const { hw, hh } = shapeBounds(variant.shape)
      return [{ x: frame.x, y: frame.y, hw, hh }]
    })
    const ledges = this.physics
      .ledges()
      .map((spot) => ({ ...spot, hw: spot.halfWidth, hh: LEDGE.halfHeight }))

    const spot = placeLedge(items, ledges, this.physics.stackTop(), this.rng)
    if (spot !== null) {
      // 아직 세우지 않는다. 연출이 뭉쳐 다 앉은 뒤에 실제 통나무가 된다
      this.formingLedge = { ...spot, elapsed: 0 }
    } else {
      // 지금 자리가 없으면 기존 규칙처럼 보상을 건너뛴다. 대기열도 같은 세계를 보므로 비운다.
      this.pendingLedgeRewards = 0
    }
  }

  /**
   * 뭉쳐지던 것이 다 앉으면 그때 통나무를 세운다.
   *
   * **먼저 세워두고 연출만 얹으면 안 된다.** 아직 보이지도 않는 통나무가 물건을
   * 받아내서 허공에 걸린 것처럼 보인다 — 보이는 것과 부딪히는 것이 어긋나면 안 된다는
   * 이 프로젝트의 전제가 연출에도 그대로 적용된다.
   */
  /**
   * 회수 판은 **잠깐만 서 있는다.**
   *
   * 더 끌면 다음에 떨구는 물건까지 받아내서 배출구가 아니라 공중 발판이 된다 —
   * 회수는 친 그 단어에만 걸리는 규칙이다.
   */
  private advanceCatcher(dt: number): void {
    if (this.catcherLeft <= 0) {
      return
    }
    this.catcherLeft -= dt
    if (this.catcherLeft <= 0) {
      this.catcherLeft = 0
      this.catcherView = null
      this.physics.clearRecalledItems()
      this.physics.clearCatcher()
    }
  }

  private advanceLedge(dt: number): void {
    const forming = this.formingLedge
    if (forming === null) {
      return
    }
    forming.elapsed += dt
    if (forming.elapsed >= LEDGE.formSec) {
      this.physics.addLedge(forming.x, forming.y, forming.halfWidth)
      this.formingLedge = null
      this.startNextLedge()
    }
  }

  /**
   * 지금 서로 붙일 수 있는 것들의 표식.
   *
   * 받침대의 물건과 **내려오는 단어**를 함께 센다 — 받침대만 보면 알았을 때는 이미
   * 둘 다 놓인 뒤라 할 수 있는 일이 없다. 까닭은 `PairMarks.ts`에.
   *
   * 매 프레임 다시 세지만 `countsByVariant`는 이미 합성 판정이 프레임마다 쓰는 값이고,
   * 단어는 많아야 예닐곱 개다.
   */
  private marks(): ReadonlyMap<string, number> {
    /*
     * 한 프레임에 두 번 부른다(그리는 쪽과 상태를 미는 쪽). 같은 프레임에서는 같은
     * 답이어야 하고, 두 번 세는 것도 헛일이다 — 프레임 번호로 한 번만 세고 나눠 쓴다.
     */
    if (this.markFrame === this.frameSeq) {
      return this.lastMarks
    }
    const counts = this.availableVariantCounts()
    /*
     * 직전 배정을 넘겨 **쓰던 색을 지키게** 한다. 안 그러면 다른 단어가 사라진 것만으로
     * 내 색이 바뀐다 — 까닭은 `PairMarks.ts`에.
     */
    this.lastMarks = pairMarks(counts, RECIPES, this.lastMarks)
    this.markFrame = this.frameSeq
    return this.lastMarks
  }

  private availableVariantCounts(): Map<string, number> {
    const counts = new Map(this.physics.countsByVariant())
    for (const falling of this.spawner.words) {
      if (falling.state !== 'active') {
        continue
      }
      // 단어 입력은 기본 변형을 떨어뜨리므로 표식도 기본 변형으로 친다.
      const id = WORD_BASE_ID.get(falling.word)
      if (id !== undefined) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    return counts
  }

  /** 물건 표식을 단어 쪽으로 옮긴다. 화면은 단어만 알고 물건 id는 모른다 */
  private wordMarks(marks: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
    if (marks.size === 0) {
      return NO_MARKS
    }
    const byWord = new Map<string, number>()
    for (const falling of this.spawner.words) {
      const id = WORD_BASE_ID.get(falling.word)
      const mark = id === undefined ? undefined : marks.get(id)
      if (mark !== undefined) {
        byWord.set(falling.word, mark)
      }
    }
    return byWord
  }

  private readonly render = (): void => {
    const time = this.timeView()
    const reveal = this.hiddenReveal
    this.renderer?.draw({
      bodies: this.physics.snapshots(),
      aimX: this.aimer.worldX,
      showAim: this.phase === 'playing',
      hiddenReveal:
        reveal === null
          ? null
          : {
              label: reveal.variant.label,
              sprite: reveal.variant.sprite,
              from: reveal.from.map((item) => item.sprite),
              progress: reveal.elapsed / reveal.duration,
            },
      whiteboardRecall:
        this.whiteboardRecall === null
          ? null
          : {
              word: this.whiteboardRecall.word,
              label: this.whiteboardRecall.label,
              sprite: this.whiteboardRecall.sprite,
              side: this.whiteboardRecall.side,
              index: this.whiteboardRecall.index,
              progress: Math.min(this.whiteboardRecall.elapsed / WHITEBOARD_RECALL_SEC, 1),
            },
      landing: this.landing.view,
      cats: this.cats.views,
      quake: this.quakeAmplitude,
      quakePhase: this.quakePhase,
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
      nightfall: time.nightfall,
      ledges: this.physics.ledges(),
      formingLedge:
        this.formingLedge === null
          ? null
          : {
              x: this.formingLedge.x,
              y: this.formingLedge.y,
              halfWidth: this.formingLedge.halfWidth,
              progress: Math.min(this.formingLedge.elapsed / LEDGE.formSec, 1),
            },
      catcher:
        this.catcherView === null
          ? null
          : {
              ...this.catcherView,
              progress: 1 - this.catcherLeft / CATCH.holdSec,
            },
      /*
       * 꼬리 부스러기가 이 값의 차이로 시간을 흘린다. `elapsed`가 아니라 `quakePhase`를
       * 쓰는 이유는 이쪽이 **판이 멈춰도 계속 흐르기** 때문이다 — 무너지는 장면에서
       * 부스러기가 얼어붙으면 안 된다.
       */
      time: this.quakePhase,
      impacts: this.frameImpacts,
      // 싱글은 주인이 하나뿐이라 구분해 그릴 것이 없다
      ownerColors: null,
      pairMarks: this.marks(),
      // 단어 칩과 같은 값을 쓴다. 계산이 한 곳에 있어야 위상이 어긋나지 않는다
      pairPulse: pairPulse(this.elapsed),
    })
  }

  private emit(): void {
    const time = this.timeView()
    this.listener?.({
      phase: this.phase,
      elapsed: this.elapsed,
      // 스포너가 목록을 바꿀 때 새 배열로 갈아치우므로 여기서 또 복사하지 않는다 —
      // 매 프레임 복사하면 GC가 주기적으로 돌아 화면이 살짝 멈춘다
      words: this.spawner.words,
      wordMarks: this.wordMarks(this.marks()),
      whiteboard: this.whiteboard.words,
      whiteboardRecall:
        this.whiteboardRecall === null
          ? null
          : {
              word: this.whiteboardRecall.word,
              label: this.whiteboardRecall.label,
              sprite: this.whiteboardRecall.sprite,
              side: this.whiteboardRecall.side,
              index: this.whiteboardRecall.index,
              progress: Math.min(this.whiteboardRecall.elapsed / WHITEBOARD_RECALL_SEC, 1),
            },
      pairPulse: pairPulse(this.elapsed),
      timeOfDay: time,
      aimNormalized: this.aimer.normalized,
      stats: this.score.stats(
        Math.max(this.spawner.missedCount - this.feverForgivenMisses, 0),
        this.lives,
        this.elapsed,
      ),
      feedback: this.feedback,
      runSeq: this.runSeq,
      invulnerable: this.invulnerableLeft / INVULNERABLE_SEC,
      collected: this.collection.ids,
      freshlyCollected: this.collection.freshIds,
    })
  }
}

export { GameEngine }
export type { GameState, SubmitFeedback }
