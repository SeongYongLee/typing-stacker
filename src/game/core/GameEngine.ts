import {
  AIM_HALF_RANGE,
  ARENA,
  DROP_COOLDOWN_MS,
  CATCH,
  SOLO_LIVES,
  SOLO_OWNER,
  QUAKE_DURATION,
  QUAKE_IMPACT_SCALE,
  QUAKE_MAX_AMPLITUDE,
} from '../config.ts'
import { VARIANT_BY_ID, WORDS } from '../data/words.ts'
import {
  featuredEntries,
  soloStage,
  type SoloStage,
  type SoloStageId,
} from '../data/soloStages.ts'
import { PhysicsWorld, type ImpactEvent } from '../physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../renderer/ArenaRenderer.ts'
import { Aimer } from '../systems/Aimer.ts'
import { craftKeyOf, RECIPES } from '../data/recipes.ts'
import { resolveCrafted, resolveItem } from '../systems/ItemResolver.ts'
import {
  findMerge,
  mergeCandidateKeys,
  MERGE_CHECK_INTERVAL_SEC,
} from '../systems/Merger.ts'
import { pairMarks, pairPartners, pairPulse, pairSizes } from '../systems/PairMarks.ts'
import { RecipeFlow } from '../systems/RecipeFlow.ts'
import { NightFever } from '../systems/NightFever.ts'
import { timeOfDay, type TimeOfDay } from '../systems/DayNight.ts'
import { Whiteboard } from '../systems/Whiteboard.ts'
import { type CatchPlank } from '../systems/Catcher.ts'
import { createRng, type Rng } from '../systems/Rng.ts'
import { renderVerticalBounds } from '../systems/Camera.ts'
import { Collection } from '../systems/Collection.ts'
import { ScoreManager } from '../systems/ScoreManager.ts'
import { judgeInput } from '../systems/TypingJudge.ts'
import { impactEventOf, quakeEventOf, trailHitOf } from '../systems/ImpactFeel.ts'
import { WordSpawner } from '../systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../types/events.ts'
import type { FallingWord, GamePhase, ItemVariant, MergeHint, RunStats } from '../types/game.ts'
import { LandingGlow } from '../systems/LandingGlow.ts'
import { CatPickup, catPickupY } from '../systems/CatPickup.ts'
import type { TrailHit } from '../systems/TrailField.ts'
import { GameLoop } from './GameLoop.ts'

/** 알릴 짝이 없을 때 돌려주는 빈 표. 프레임마다 빈 Map을 새로 만들지 않으려는 것 */
const NO_MARKS: ReadonlyMap<string, number> = new Map()
const NO_MERGE_HINTS: ReadonlyMap<string, readonly MergeHint[]> = new Map()
const NO_MERGE_SIZES: ReadonlyMap<string, number> = new Map()

/** 단어 → 그 단어의 기본 변형 id. 내려오는 단어가 무슨 재료인지 보려는 것이다 */
const WORD_BASE_ID = new Map(
  WORDS.map((entry) => [entry.word, entry.variants[0]?.id ?? '']),
)

/** 표에서 못 찾은 재료를 걸러낸다 — 레시피는 id 문자열이라 오타가 조용히 지나갈 수 있다 */
function isVariant(item: ItemVariant | undefined): item is ItemVariant {
  return item !== undefined
}

/** 스테이지가 바뀔 때 한 번만 회수 후보를 만든다. */
function whiteboardCandidatesFor(stage: SoloStage): readonly ItemVariant[] {
  const candidates = new Map<string, ItemVariant>()
  for (const entry of featuredEntries(stage)) {
    for (const variant of entry.variants) {
      candidates.set(variant.id, variant)
    }
  }
  for (const id of stage.hiddenResults) {
    const variant = VARIANT_BY_ID.get(id)
    if (variant !== undefined) {
      candidates.set(variant.id, variant)
    }
  }
  return [...candidates.values()]
}

/** 무너지는 장면을 이만큼 보여준 뒤 결과 화면으로 넘어간다 */
const COLLAPSE_VIEW_SEC = 2.8

/** 게임오버가 될 상황에서 고양이가 물건을 물고 달려간다. */
/** 탑 중앙 부근에서 포물선 정점을 지나도록 맞춘 재투척 속도 */
const CAT_RETHROW_VELOCITY = { horizontal: 1.5, vertical: 8.2 } as const
/** 받을 곳이 없는 물건은 화면 아래까지 완전히 내려가기 전에 고양이가 낚아챈다 */
const CAT_EARLY_ESCAPE_MARGIN = 0.35
/** 보드 단어가 물건으로 바뀌어 손과 함께 사라지는 시간 */
const WHITEBOARD_RECALL_SEC = CATCH.holdSec
const CONGESTION_PER_MISSED_WORD = 20
const CONGESTION_RECOVERY_PER_HIT = 2
const CONGESTION_RUSH_INTERVAL = 0.5
/** 실제 경보 물건 하나가 상단 보관함에서 내려오는 데 걸리는 시간. */
const CONGESTION_BURST_SEC = 0.42
/** 튜토리얼에서만 보여주는 과장된 경보 반입 장면의 길이. */
const CONGESTION_DEMO_SEC = 5.2
const CONGESTION_DEMO_DROP_INTERVAL_SEC = 0.045
/** 경보 데모에서 단어 하나가 화면을 가로지르는 시간. 입력할 틈이 없게 짧다. */
const CONGESTION_DEMO_WORD_FALL_SEC = 1.25
const CONGESTION_DEMO_WORD_INTERVAL_SEC = 0.28
const CONGESTION_DEMO_WORD_COUNT = 5
/** 고양이가 물건을 물고 화면을 가로지른 뒤, 사라지기 직전에 튜토리얼을 멈춘다. */
const CONGESTION_DEMO_CAT_FREEZE_SEC = 0.7
const TUTORIAL_EGG_DROPS_REQUIRED = 3
const STAGE_START_NOTICE_SEC = 1.35
const STAGE_COMPLETE_NOTICE_SEC = 2.1

const TUTORIAL_STEPS = [
  {
    kind: 'intro',
    text: '이곳은 물건을 쌓는 상자입니다. 단어를 입력하면 물건이 상자 안으로 떨어집니다. Enter를 누르세요.',
  },
  {
    kind: 'word',
    word: '책',
    side: 'left',
    text: '책을 입력하고 Enter를 누르세요. 물건은 그 순간 화살표 위치에 떨어집니다.',
  },
  {
    kind: 'word',
    word: '계란',
    side: 'right',
    text: '이번에는 계란 3개를 상자에 넣어봐요.',
  },
  {
    kind: 'word',
    word: '프라이팬',
    side: 'right',
    text: '계란 옆에 프라이팬을 떨어뜨려 보세요. 물건과 단어가 짝이면 같은 색 테두리로 깜빡입니다.',
  },
  {
    kind: 'intro',
    text: '합성을 도와드렸어요! 계란과 프라이팬을 가까이 두면 합성됩니다. Enter를 누르세요.',
  },
  {
    kind: 'board',
    text: '화이트보드의 단어는 상자 안에 있으면 회수할 수 있습니다. Enter를 누르세요.',
  },
  {
    kind: 'intro',
    text: '정해진 횟수만큼 회수하면 게임 클리어입니다. Enter를 누르세요.',
  },
  {
    kind: 'board',
    text: '마침 계란 프라이가 상자 안에 있습니다. 계란 프라이를 입력하고 Enter를 눌러 회수하세요.',
  },
] as const

/**
 * 합성 연출 길이.
 *
 * 재료 둘과 결과물을 읽어야 하고, 그중 재료는 모이는 동안에만 보인다. 짧게 밀어 넣으면
 * 재료를 알아보기 전에 겹쳐버려서, 정작 이 연출을 붙인 이유(무엇으로 만들었는지
 * 알리는 것)가 사라진다.
 */
const MERGE_REVEAL_SEC = 3
/** 3개 이상 합성 직후 세계가 거의 멈춘 듯 보이는 시간과 속도 */
const COMPLEX_MERGE_REVEAL_SEC = 4.2
const COMPLEX_MERGE_SLOW_SEC = 1.2
const COMPLEX_MERGE_TIME_SCALE = 0.035
/** 회전한 큰 물체와 화면 경계 연출까지 남겨두는 렌더 월드 여백. */
const RENDER_VERTICAL_MARGIN = 1.5
/** 점수를 나눠 더했을 때 생기는 부동소수점 경계 오차. */

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
  /** 합성 가능한 단어 → 현재 표식이 가리키는 레시피의 총 재료 수. */
  readonly wordMergeSizes: ReadonlyMap<string, number>
  /** 합성 가능한 단어 → 지금 받침대에서 붙일 짝 물건. */
  readonly wordMergeHints: ReadonlyMap<string, readonly MergeHint[]>
  /**
   * 지금 벽에 적힌 회수 목록. 이 단어를 치면 쌓지 않고 빼낸다.
   *
   * 낙하 쪽지에 표식을 붙이는 쪽(`TypingLane`)과 벽을 그리는 쪽이 같은 값을 본다 —
   * 둘이 어긋나면 "보드에는 있는데 쪽지에는 표시가 없다"가 생긴다.
   */
  readonly whiteboard: readonly string[]
  /** 보드 대상 중 지금 상자 안에 실제로 있어 입력할 수 있는 항목. */
  readonly activeWhiteboard: readonly string[]
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
  /** 3개 이상 합성 슬로모션의 진행도. 해당 연출이 아니면 null이다. */
  readonly complexMergeFocus: number | null
  /** 판이 새로 시작될 때마다 올라간다. UI가 입력창을 초기화하는 신호 */
  readonly runSeq: number
  /** 지금까지 도감에 모은 히든 물건 id */
  readonly collected: readonly string[]
  /** 그중 이번 판에 처음 만난 것 */
  readonly freshlyCollected: readonly string[]
  /** 점수와 별개인 싱글 보관함 진행도. */
  readonly stage: {
    readonly id: SoloStageId
    readonly title: string
    readonly returns: number
    /** 이번 런 전체에서 회수한 물건 수. 결과 안내 조건에 쓴다. */
    readonly totalReturns: number
    readonly target: number | null
    readonly congestion: number
    /** 정상 입력으로 혼잡 경보가 줄어들 때마다 증가하는 테두리 연출 신호. */
    readonly congestionRecoverySeq: number
    /** 경보 반입이 막 시작된 짧은 상단 보관함 연출. */
    readonly congestionBurst: number
    /** 혼잡 반입 물건이 아직 떨어지고 있는가. */
    readonly congestionRush: boolean
    /** 첫 판에서만 보여주는 의도적인 경보·게임오버 데모의 상태. */
    readonly congestionDemo: 'ready' | 'congestionGuide' | 'wordRush' | 'full' | 'falling' | 'gameOverIntro' | 'gameOverPrompt' | 'over' | null
    /** 0부터 시작하는 안내 단계. 튜토리얼이 아닐 때는 null이다. */
    readonly tutorialStep: number | null
    readonly tutorialTotal: number | null
    readonly tutorialText: string | null
    readonly endlessUnlocked: boolean
    readonly notice: {
      readonly kind: 'start' | 'complete'
      readonly title: string
      readonly returns: number
      readonly target: number | null
      readonly score: number
    } | null
  }
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
  /** 상자에서 회수하기 직전의 실제 물건 위치. */
  readonly sourceX: number
  readonly sourceY: number
  readonly progress: number
}

interface WhiteboardRecall {
  readonly word: string
  readonly label: string
  readonly sprite: string
  readonly side: 'left' | 'right'
  readonly index: number
  readonly sourceX: number
  readonly sourceY: number
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
  private nightFever: NightFever
  private spawner: WordSpawner
  /** 화이트보드보다 먼저 확정한 현재 집중 레시피의 단어들 */
  private focusedRecipeWords: readonly string[] = []
  /** RecipeFlow에 넘길 개수표. 구성이 바뀐 때만 비워 다시 쓴다. */
  private readonly recipeCounts = new Map<string, number>()
  private recipePhysicsVersion = -1
  private recipeWordVersion = -1
  private recipeDropQueueVersion = -1
  private recipeFeverVersion = -1
  private recipeStageId: SoloStageId | null = null
  private dropQueueVersion = 0
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
  /** 게임오버 직전 고양이가 회수하는 물건. 화면 확대의 기준점이다. */
  private collapseFocus: { readonly x: number; readonly y: number } | null = null
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
  /** 3개 이상 합성의 짧은 슬로모션. 연출 시간은 이 값과 무관하게 정상 속도로 흐른다. */
  private complexMergeSlowLeft = 0
  /** 접촉 그래프를 매 렌더 프레임 만들지 않기 위한 합성 검사 시계. */
  private mergeCheckElapsed = 0
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
  private lives = SOLO_LIVES
  /** 직전에 매긴 짝 표식. 색을 이어 쓰려면 지난 판정을 들고 있어야 한다 */
  private lastMarks: ReadonlyMap<string, number> = NO_MARKS
  /** `lastMarks`가 선택한 레시피의 총 재료 수. */
  private lastMergeSizes: ReadonlyMap<string, number> = NO_MERGE_SIZES
  /** 낮에 얻어 다음 Night Fever까지 쌓인 점수. 밤에 얻은 점수는 포함하지 않는다. */
  /** 이번 낮에 채워야 하는 점수. 낮이 시작된 뒤에는 바꾸지 않아 시계가 역행하지 않는다. */
  /** 현재 Night Fever에서 흐른 시간. 밤은 기존처럼 10초 동안 열린다. */
  /** 프레임 사이 새로 얻은 점수만 낮 게이지에 더하기 위한 기준값. */
  /** 벽에 적힌 회수 목록. 여기 있는 단어를 치면 쌓지 않고 빼낸다 */
  private readonly whiteboard = new Whiteboard(createRng(0x5eed))
  /** 화이트보드는 단어 레인이 아니라 상자 안의 실제 변형을 가리킨다. */
  private whiteboardTargets: ItemVariant[] = []
  private whiteboardCandidates: readonly ItemVariant[] = []
  /** 지금 뻗어 있는 회수 판. 남은 시간이 0이 되면 치운다 */
  private catcherLeft = 0
  /** 렌더러가 물리 회수 판과 같은 자리에 손 그림을 그리기 위한 값 */
  private catcherView: CatchPlank | null = null
  /** 보드 단어가 물건으로 바뀌는 짧은 연결 연출 */
  private whiteboardRecall: WhiteboardRecall | null = null
  private stageId: SoloStageId = 0
  private stageReturns = 0
  private totalReturns = 0
  private congestion = 0
  private congestionRecoverySeq = 0
  private congestionRushLeft = 0
  private congestionRushTimer = 0
  private congestionBurstLeft = 0
  private congestionDemo: GameState['stage']['congestionDemo'] = null
  private congestionDemoElapsed = 0
  private congestionDemoDropsLeft = 0
  private congestionDemoDropTimer = 0
  private congestionDemoDropIndex = 0
  private congestionDemoWordTimer = 0
  private congestionDemoWordIndex = 0
  /** 데모에서 실제로 화면 밖으로 나간 마지막 물건. 게임오버 고양이가 이 물건을 문다. */
  private congestionDemoEscape: { readonly variant: ItemVariant; readonly x: number; readonly y: number } | null = null
  private tutorialStep = 0
  private tutorialEggDrops = 0
  private endlessUnlocked = false
  private stageScoreStart = 0
  private stageNotice: GameState['stage']['notice'] = null
  private stageTransitionLeft = 0
  private pendingStageId: SoloStageId | null = null
  /** 물건이나 단어 구성이 그대로면 합성 표식을 다시 세지 않는다. */
  private markPhysicsVersion = -1
  private markWordVersion = -1
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
    this.nightFever = new NightFever(createRng(seed ^ 0x66657672), RECIPES, VARIANT_BY_ID)
    this.spawner = new WordSpawner(this.rng, WORDS, (candidates) =>
      this.recipeFlow.pick(candidates),
      { startImmediately: false },
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

  startRun(showTutorial = true): void {
    this.phase = 'playing'
    this.elapsed = 0
    this.feedback = null
    this.sinceLastDrop = Number.POSITIVE_INFINITY
    this.feverForgivenMisses = 0
    this.collapseTimer = 0
    this.collapseFocus = null
    this.lives = SOLO_LIVES
    this.lastMarks = NO_MARKS
    this.lastMergeSizes = NO_MERGE_SIZES
    this.markPhysicsVersion = -1
    this.markWordVersion = -1
    this.hiddenReveal = null
    this.complexMergeSlowLeft = 0
    this.mergeCheckElapsed = 0
    this.quakeLeft = 0
    this.quakeStrength = 0
    this.dropQueue.length = 0
    this.dropQueueVersion += 1
    this.catThrowQueue.length = 0
    this.runSeq += 1
    this.rng = createRng(this.seed)
    this.recipeFlow = new RecipeFlow(createRng(this.seed ^ 0x72656369), WORDS, RECIPES)
    this.nightFever = new NightFever(
      createRng(this.seed ^ 0x66657672),
      RECIPES,
      VARIANT_BY_ID,
    )
    this.spawner = new WordSpawner(this.rng, WORDS, (candidates) =>
      this.recipeFlow.pick(candidates),
      { startImmediately: false },
    )
    this.focusedRecipeWords = []
    this.stageId = showTutorial ? 0 : 1
    this.stageReturns = 0
    this.totalReturns = 0
    this.congestion = 0
    this.congestionRecoverySeq = 0
    this.congestionRushLeft = 0
    this.congestionRushTimer = 0
    this.congestionBurstLeft = 0
    this.congestionDemo = null
    this.congestionDemoElapsed = 0
    this.congestionDemoDropsLeft = 0
    this.congestionDemoDropTimer = 0
    this.congestionDemoDropIndex = 0
    this.congestionDemoWordTimer = 0
    this.congestionDemoWordIndex = 0
    this.congestionDemoEscape = null
    this.tutorialStep = 0
    this.tutorialEggDrops = 0
    this.endlessUnlocked = false
    this.stageScoreStart = 0
    this.stageNotice = null
    this.stageTransitionLeft = 0
    this.pendingStageId = null
    this.catcherLeft = 0
    this.catcherView = null
    this.whiteboardRecall = null
    this.aimer = new Aimer(AIM_HALF_RANGE)
    this.score.reset()
    this.collection.startRun()
    this.cats.reset(this.seed ^ 0x63617473)
    this.physics.reset()
    this.configureStage()
    this.openStageNotice()
    this.refreshRecipeFlow()
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

  /** 스테이지 전환 시 단어 풀과 보드만 갈아끼운다. 물리 초기화는 호출부가 맡는다. */
  private configureStage(): void {
    const stage = soloStage(this.stageId)
    this.physics.setContainer(stage.box.halfWidth, stage.box.wallHeight)
    this.physics.setEscapeY(ARENA.killY + CAT_EARLY_ESCAPE_MARGIN)
    this.spawner.restrict(featuredEntries(stage))
    this.whiteboard.clear()
    this.whiteboardTargets = []
    this.whiteboardCandidates = whiteboardCandidatesFor(stage)
    this.focusedRecipeWords = []
    if (stage.id === 0) {
      this.spawner.setScripted(true)
      this.showTutorialStep()
      return
    }
    this.spawner.setScripted(false)
    this.syncRecipeFocus()
    this.refillWhiteboard()
  }

  private showTutorialStep(): void {
    const step = TUTORIAL_STEPS[this.tutorialStep]
    if (step === undefined) {
      return
    }
    if (step.kind === 'intro') {
      return
    }
    if (step.kind === 'board') {
      const friedEgg = VARIANT_BY_ID.get('fried-egg')
      this.whiteboardTargets = friedEgg === undefined ? [] : [friedEgg]
      this.whiteboard.set(this.whiteboardTargets.map((target) => target.label))
      return
    }
    this.spawner.spawnScripted(step.word, step.side)
  }

  private advanceStage(): void {
    const stage = soloStage(this.stageId)
    // 4/4 회수 뒤에도 처음 튜토리얼 판을 그대로 쓴다. 보관함·물리 세계를
    // 갈아끼우지 않고 멈춘 채 Enter만 기다리므로, 규칙의 원인과 결과가 이어진다.
    if (stage.id === 0) {
      // 회수 직후 상단에서 다음 행동을 알려준다. 손 연출은 멈춘 판에서도 계속 돈다.
      this.congestionDemo = 'ready'
      this.congestionDemoElapsed = 0
      return
    }
    this.stageNotice = {
      kind: 'complete',
      title: stage.title,
      returns: this.stageReturns,
      target: stage.returnTarget,
      score: Math.max(0, this.score.stats(0, this.lives, this.elapsed).score - this.stageScoreStart),
    }
    this.pendingStageId = this.stageId < 5 ? (this.stageId + 1) as SoloStageId : null
    this.stageTransitionLeft = STAGE_COMPLETE_NOTICE_SEC
    this.phase = 'stageTransition'
  }

  private openStageNotice(): void {
    const stage = soloStage(this.stageId)
    this.stageNotice = {
      kind: 'start',
      title: stage.title,
      returns: 0,
      target: stage.returnTarget,
      score: 0,
    }
    this.stageTransitionLeft = STAGE_START_NOTICE_SEC
    this.phase = 'stageTransition'
  }

  private advanceStageTransition(dt: number): void {
    this.elapsed += dt
    this.stageTransitionLeft = Math.max(0, this.stageTransitionLeft - dt)
    if (this.stageTransitionLeft > 0 || this.stageNotice === null) {
      return
    }
    if (this.stageNotice.kind === 'start') {
      this.stageNotice = null
      this.phase = 'playing'
      return
    }
    if (this.pendingStageId === null) {
      this.stageNotice = null
      this.phase = 'credits'
      return
    }
    const nextStageId = this.pendingStageId
    this.pendingStageId = null
    this.enterStage(nextStageId)
  }

  /** 다음 보관함의 물리·단어 풀을 열고 시작 안내를 띄운다. */
  private enterStage(stageId: SoloStageId): void {
    this.stageId = stageId
    this.stageReturns = 0
    this.congestion = 0
    this.congestionRecoverySeq = 0
    this.congestionRushLeft = 0
    this.congestionRushTimer = 0
    this.congestionBurstLeft = 0
    this.congestionDemo = null
    this.congestionDemoElapsed = 0
    this.congestionDemoDropsLeft = 0
    this.congestionDemoDropTimer = 0
    this.congestionDemoDropIndex = 0
    this.congestionDemoWordTimer = 0
    this.congestionDemoWordIndex = 0
    this.congestionDemoEscape = null
    this.physics.reset()
    this.spawner.reset()
    this.configureStage()
    this.stageScoreStart = this.score.stats(0, this.lives, this.elapsed).score
    this.openStageNotice()
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

    // 화이트보드 규칙을 읽는 장면에서는 회수를 열지 않는다. Enter로 설명을 닫은 뒤
    // 같은 보드를 그대로 쓰며 실제 회수 입력을 받는다.
    if (
      this.stageId === 0 &&
      (this.tutorialStep === 0 ||
        this.tutorialStep === 4 ||
        this.tutorialStep === 5 ||
        this.tutorialStep === 6)
    ) {
      if (text.trim() === '') {
        this.tutorialStep += 1
        this.showTutorialStep()
        this.emit()
      }
      return
    }

    /*
     * 실제 판에서 빈 Enter는 오타일 뿐이다. 다만 처음 경보를 배우는 판에서는
     * "일부러 놓치기"를 안전한 한 번의 행동으로 바꾼다. 일반 규칙에 예외를
     * 섞지 않도록 이 판·이 단계에서만 연다.
     */
    if (this.congestionDemo === 'gameOverPrompt' && text.trim() === '') {
      this.congestionDemo = 'over'
      this.lives = 0
      this.phase = 'over'
      this.loop.stop()
      this.fire({ kind: 'gameOver', won: null })
      this.emit()
      return
    }

    if (this.congestionDemo === 'ready' && text.trim() === '') {
      this.congestionDemo = 'congestionGuide'
      this.emit()
      return
    }

    if (this.congestionDemo === 'congestionGuide' && text.trim() === '') {
      this.congestion = 0
      this.congestionDemo = 'wordRush'
      this.congestionDemoElapsed = 0
      this.congestionDemoWordTimer = 0
      this.congestionDemoWordIndex = 0
      this.spawner.reset()
      this.spawner.setScripted(true)
      this.feedback = {
        seq: this.feedbackSeq,
        text: '단어 폭주',
        ok: true,
        itemLabel: null,
        hidden: false,
      }
      this.emit()
      return
    }

    if (this.congestionDemo === 'full' && text.trim() === '') {
      this.congestionDemo = 'falling'
      this.congestionDemoElapsed = 0
      this.congestionDemoDropsLeft = 100
      this.congestionDemoDropTimer = 0
      this.congestionDemoDropIndex = 0
      this.emit()
      return
    }

    const targetIndex = this.whiteboard.words.indexOf(text.trim())
    const target = targetIndex === -1 ? undefined : this.whiteboardTargets[targetIndex]
    if (target !== undefined) {
      const source = this.physics.snapshots().find((body) => body.variant.id === target.id)
      const recalled = this.physics.removeOneByVariant(target.id)
      if (recalled !== null) {
        const side = (source?.x ?? 0) < 0 ? 'left' : 'right'
        const sourceX = source?.x ?? 0
        const sourceY = source?.y ?? ARENA.platformTop
        // 손은 회수 대상에 박히지 않고 현재 탑 꼭대기보다 위에서 받는다.
        const handY = Math.max(sourceY, this.physics.stackTop(), ARENA.platformTop) + 0.55
        this.catcherView = {
          x: sourceX,
          y: handY,
          halfLength: 0.5,
          angle: side === 'left' ? -0.2 : 0.2,
        }
        this.catcherLeft = CATCH.holdSec
        this.whiteboardRecall = {
          word: target.label,
          label: recalled.label,
          sprite: recalled.sprite,
          side,
          index: targetIndex,
          sourceX,
          sourceY,
          elapsed: 0,
        }
        this.score.onRecalled(recalled)
        this.discover(recalled)
        this.whiteboardTargets.splice(targetIndex, 1)
        this.refillWhiteboard()
        this.stageReturns += 1
        this.totalReturns += 1
        if (this.stageId === 0) {
          this.tutorialStep += 1
          this.advanceStage()
        } else {
          this.advanceStageIfTargetReached()
        }
        this.feedback = {
          seq: this.feedbackSeq,
          text: target.label,
          ok: true,
          itemLabel: recalled.label,
          hidden: recalled.hidden,
        }
        this.fire({ kind: 'wordHit', combo: this.score.comboCount })
        this.emit()
        return
      }
    }

    const result = judgeInput(this.spawner.words, text)

    if (result.kind === 'miss') {
      this.score.onInputMissed()
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
    if (this.congestion > 0) {
      this.congestion = Math.max(0, this.congestion - CONGESTION_RECOVERY_PER_HIT)
      this.congestionRecoverySeq += 1
    }
    this.fire({ kind: 'wordHit', combo: this.score.comboCount })
    // 물건의 정체는 이 순간 처음 결정되고, 그대로 플레이어에게 공개된다
    const entry = WORDS.find((candidate) => candidate.word === result.word.word)
    const variant =
      this.stageId === 0 && entry?.variants[0] !== undefined
        ? entry.variants[0]
        : resolveItem(result.word.word)
    this.queueDrop(variant, this.aimer.worldX)
    if (this.stageId === 0) {
      if (result.word.word === '책') {
        this.tutorialStep += 1
      }
      if (result.word.word === '계란') {
        this.tutorialEggDrops += 1
        if (this.tutorialEggDrops >= TUTORIAL_EGG_DROPS_REQUIRED) {
          this.tutorialStep += 1
        }
      }
      // 합성이 일어날 때까지 프라이팬을 계속 낼 수 있다.
      this.showTutorialStep()
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

  /** 5스테이지 엔딩 후 같은 상자와 탑에서 끝없는 보관을 이어간다. */
  continueEndless(): void {
    if (this.phase !== 'credits') {
      return
    }
    this.endlessUnlocked = true
    this.stageReturns = 0
    this.phase = 'playing'
    this.emit()
  }

  /** 엔딩 뒤 계속 정리하기를 선택했다면 마지막 스테이지의 목표를 다시 판정하지 않는다. */
  private advanceStageIfTargetReached(): void {
    const stage = soloStage(this.stageId)
    if (
      stage.returnTarget === null ||
      this.stageReturns < stage.returnTarget ||
      (stage.endless && this.endlessUnlocked)
    ) {
      return
    }
    this.advanceStage()
  }

  private isEndlessMode(): boolean {
    return soloStage(this.stageId).endless && this.endlessUnlocked
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
    this.dropQueueVersion += 1
  }

  /**
   * 물건을 실제로 세계에 떨군다.
   * 대기하다 떨어진 것도 여기를 지나므로, 낙하음이 물건이 생기는 순간과 어긋나지 않는다.
   */
  private dropNow(
    variant: ItemVariant,
    x: number,
    recalled = false,
    source: 'input' | 'fever' | 'congestion' = 'input',
  ): void {
    this.physics.spawnItemAt(
      variant,
      x,
      ARENA.spawnY,
      SOLO_OWNER,
      0,
      recalled,
      source === 'fever',
      source === 'congestion',
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

  private readonly update = (frameDt: number): void => {
    const slowingComplexMerge = this.phase === 'playing' && this.complexMergeSlowLeft > 0
    if (slowingComplexMerge) {
      this.complexMergeSlowLeft = Math.max(this.complexMergeSlowLeft - frameDt, 0)
    }
    const dt = slowingComplexMerge ? frameDt * COMPLEX_MERGE_TIME_SCALE : frameDt
    this.congestionBurstLeft = Math.max(this.congestionBurstLeft - frameDt, 0)
    this.advanceQuake(dt)
    // 색은 판이 멈춰 있어도(일시정지·무너짐) 계속 사라져야 한다 — 그리기가 매 프레임 돈다
    this.landing.advance(dt)
    // 게임오버 직전에는 고양이를 읽을 수 있게 시간 전체를 늦춘다.
    // 튜토리얼 게임오버 안내가 뜬 마지막 프레임에서는 고양이도 함께 멈춘다.
    if (this.congestionDemo !== 'gameOverPrompt') {
      this.cats.update(this.phase === 'collapsing' ? frameDt * 0.42 : dt)
    }
    this.advanceCatThrows(dt)
    // 회수 손은 경보 안내와 별개다. 4/4 직후 판이 Enter를 기다려도 손과 물건은
    // 계속 움직여야 상단 안내와 회수 결과를 같은 순간에 읽을 수 있다.
    this.advanceCatcher(dt)
    this.advanceWhiteboardRecall(dt)
    // 지난 프레임의 부딪힘은 이미 그려졌다. 비우지 않으면 물이 계속 퍼진다
    this.frameImpacts.length = 0

    if (this.phase === 'collapsing') {
      this.collapseTimer += dt
      const result = this.physics.step(frameDt * 0.12)
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

    if (this.phase === 'stageTransition') {
      this.advanceStageTransition(frameDt)
      this.emit()
      return
    }

    if (this.phase !== 'playing') {
      // 멈춘 동안에도 그리기는 이어진다 — 아래 render가 매 프레임 돈다
      return
    }

    // 경보 데모를 읽는 동안에는 단어·물리·시간을 전부 멈춘다. Enter만 다음 장면을 연다.
    if (this.congestionDemo === 'ready') {
      return
    }

    if (this.congestionDemo === 'wordRush') {
      this.congestionDemoElapsed += frameDt
      this.advanceCongestionDemoWords(frameDt)
      const difficulty = {
        ...soloStage(this.stageId).difficulty,
        fallDuration: CONGESTION_DEMO_WORD_FALL_SEC,
        spawnInterval: Number.POSITIVE_INFINITY,
      }
      const missed = this.spawner.update(frameDt, difficulty)
      if (missed.length > 0) {
        this.score.onWordMissed()
        this.congestion = Math.min(100, this.congestion + missed.length * CONGESTION_PER_MISSED_WORD)
      }
      if (this.congestion >= 100) {
        this.congestionDemo = 'full'
      }
      this.emit()
      return
    }

    if (this.congestionDemo === 'falling') {
      this.congestionDemoElapsed += frameDt
      this.advanceCongestionDemoDrops(frameDt)
      const { settled, impacts, escaped, quake } = this.physics.step(dt)
      this.applyQuake(quake)
      this.handleImpacts(impacts, quake)
      const escapedItem = escaped.find((event) => event.recalled !== true)
      if (escapedItem !== undefined) {
        this.congestionDemoEscape = escapedItem
      }
      for (const event of settled) {
        this.score.onSettled(event.variant, event.topY)
      }
      if (this.congestionDemoElapsed >= CONGESTION_DEMO_SEC) {
        const taken = this.congestionDemoEscape ?? escapedItem ?? this.physics.snapshots()[0]
        if (taken !== undefined) {
          const pickupY = catPickupY(taken.y, 0)
          this.cats.take(taken.variant, taken.x, pickupY)
          this.collapseFocus = { x: taken.x, y: pickupY }
        }
        this.lives = 0
        this.congestionDemo = 'gameOverIntro'
        this.congestionDemoElapsed = 0
      }
      this.emit()
      return
    }

    // 고양이가 물건을 문 모습은 실제 게임오버와 같지만, 끝까지 지나가 버리기 전에
    // 멈춰 설명을 읽게 한다. 이 분기에서는 물리·단어·카메라가 모두 정지한다.
    if (this.congestionDemo === 'gameOverIntro') {
      this.congestionDemoElapsed += frameDt
      if (this.congestionDemoElapsed >= CONGESTION_DEMO_CAT_FREEZE_SEC) {
        this.congestionDemo = 'gameOverPrompt'
      }
      this.emit()
      return
    }

    if (this.congestionDemo === 'gameOverPrompt') {
      return
    }

    this.elapsed += dt
    this.sinceLastDrop += dt
    if (this.hiddenReveal !== null) {
      // 다중 합성 슬로모션 중에도 합성 자막은 정상 속도로 움직여 정지 이유를 보여준다.
      this.hiddenReveal.elapsed += frameDt
      if (this.hiddenReveal.elapsed >= this.hiddenReveal.duration) {
        this.hiddenReveal = null
      }
    }
    const difficulty = soloStage(this.stageId).difficulty
    this.aimer.update(dt, difficulty.aimSpeed)
    /*
     * 놓친 단어는 판을 방해하지 않고 사라진다. 낮의 대가는 **콤보와 점수**다.
     * Night Fever에는 자동 낙하를 지켜보는 동안 점수가 되감기지 않도록 정확도 패널티를
     * 면제하되, 타자 콤보는 놓친 순간 그대로 끊는다.
     */
    this.refreshRecipeFlow()
    const missedWords = this.spawner.update(dt, difficulty)
    if (missedWords.length > 0) {
      this.score.onWordMissed()
      if (this.stageId !== 0) {
        this.congestion = Math.min(100, this.congestion + missedWords.length * CONGESTION_PER_MISSED_WORD)
        if (this.congestion >= 100) {
          this.congestion = 0
          this.congestionRushLeft = soloStage(this.stageId).congestionDrops
          this.congestionRushTimer = 0
        }
      }
    }
    if (this.stageId === 0 && missedWords.length > 0) {
      this.showTutorialStep()
    }

    if (this.dropQueue.length > 0 && this.sinceLastDrop >= DROP_COOLDOWN_MS / 1000) {
      const next = this.dropQueue.shift()
      if (next !== undefined) {
        this.dropQueueVersion += 1
        this.dropNow(next.variant, next.x, next.recalled)
      }
    }

    this.advanceCongestionRush(dt)

    const { settled, impacts, escaped, quake } = this.physics.step(dt)
    this.applyQuake(quake)
    this.handleImpacts(impacts, quake)
    for (const event of settled) {
      this.score.onSettled(event.variant, event.topY)
    }

    this.mergeCheckElapsed += frameDt
    if (this.mergeCheckElapsed >= MERGE_CHECK_INTERVAL_SEC) {
      this.mergeCheckElapsed %= MERGE_CHECK_INTERVAL_SEC
      this.tryMerge()
      this.tryTutorialForcedMerge()
    }

    /*
     * **회수로 나간 것은 게임오버를 만들지 않는다.** 그것이 이 규칙의 전부다.
     *
     * 물건마다 표를 보고 가른다 — 판이 서 있는 동안인지로 가르면 같은 프레임에 탑이
     * 무너졌을 때 그 이탈까지 함께 면제된다. 회수 하나가 붕괴 하나를 덮어주는 셈이라
     * 배출구가 아니라 방패가 된다.
    */
    const fallen = escaped.filter((event) => event.recalled !== true)
    if (fallen.length > 0 && this.stageId !== 0) {
      this.lives = 0
      this.score.onLifeLost()
      const taken = fallen[0]
      if (taken !== undefined) {
        this.cats.take(taken.variant, taken.x, catPickupY(taken.y, 0))
        this.collapseFocus = {
          x: taken.x,
          y: catPickupY(taken.y, 0),
        }
      }
      this.phase = 'collapsing'
      this.collapseTimer = 0
      this.fire({ kind: 'collapse' })
    }

    this.emit()
  }

  /** 경보 데모의 100개도 렌더링용 가짜가 아니라 실제 물리 물체다. */
  private advanceCongestionDemoDrops(dt: number): void {
    if (this.congestionDemoDropsLeft <= 0) {
      return
    }
    this.congestionDemoDropTimer -= dt
    if (this.congestionDemoDropTimer > 0) {
      return
    }
    const entries = featuredEntries(soloStage(this.stageId))
    if (entries.length === 0) {
      return
    }
    const entry = entries[this.congestionDemoDropIndex % entries.length]
    const variant = entry?.variants[0]
    if (variant !== undefined) {
      const column = this.congestionDemoDropIndex % 10
      const x = -AIM_HALF_RANGE + ((column + 0.5) / 10) * AIM_HALF_RANGE * 2
      // 실제 경보 반입과 같은 경로로 넣어, 상단 보관함 신호·낙하음도 함께 재생한다.
      this.dropNow(variant, x, false, 'congestion')
      this.discover(variant)
      this.congestionBurstLeft = CONGESTION_BURST_SEC
    }
    this.congestionDemoDropIndex += 1
    this.congestionDemoDropsLeft -= 1
    this.congestionDemoDropTimer += CONGESTION_DEMO_DROP_INTERVAL_SEC
  }

  /** 입력할 수 없는 짧은 폭주 동안 서로 다른 단어를 순서대로 내보낸다. */
  private advanceCongestionDemoWords(dt: number): void {
    if (this.congestionDemoWordIndex >= CONGESTION_DEMO_WORD_COUNT) {
      return
    }
    this.congestionDemoWordTimer -= dt
    if (this.congestionDemoWordTimer > 0) {
      return
    }
    const entries = featuredEntries(soloStage(this.stageId))
    const entry = entries[this.congestionDemoWordIndex % entries.length]
    if (entry !== undefined) {
      this.spawner.spawnScripted(
        entry.word,
        this.congestionDemoWordIndex % 2 === 0 ? 'left' : 'right',
        Math.floor(this.congestionDemoWordIndex / 2),
      )
    }
    this.congestionDemoWordIndex += 1
    this.congestionDemoWordTimer += CONGESTION_DEMO_WORD_INTERVAL_SEC
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

  /** 혼잡 게이지가 가득 찬 뒤에만 물건을 자동 반입한다. 중간 경보에는 패널티가 없다. */
  private advanceCongestionRush(dt: number): void {
    if (this.congestionRushLeft <= 0 || this.stageId === 0) {
      return
    }
    this.congestionRushTimer -= dt
    if (this.congestionRushTimer > 0) {
      return
    }
    const entries = featuredEntries(soloStage(this.stageId))
    const entry = this.rng.pick(entries)
    const variant = entry.variants[0]
    if (variant === undefined) {
      return
    }
    this.dropNow(variant, this.rng.next() * AIM_HALF_RANGE * 2 - AIM_HALF_RANGE, false, 'congestion')
    this.discover(variant)
    this.congestionRushLeft -= 1
    this.congestionRushTimer = CONGESTION_RUSH_INTERVAL
    this.congestionBurstLeft = CONGESTION_BURST_SEC
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
      ARENA.platformTop + 1.15,
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

  /** 재료 구성이 그대로면 레시피 관찰과 집중 단어 계산을 건너뛴다. */
  private refreshRecipeFlow(): void {
    const physicsVersion = this.physics.version
    const wordVersion = this.spawner.version
    const feverVersion = this.nightFever.version
    if (
      this.recipePhysicsVersion === physicsVersion &&
      this.recipeWordVersion === wordVersion &&
      this.recipeDropQueueVersion === this.dropQueueVersion &&
      this.recipeFeverVersion === feverVersion &&
      this.recipeStageId === this.stageId
    ) {
      return
    }

    this.observeRecipeFlow()
    this.syncRecipeFocus()
    this.recipePhysicsVersion = physicsVersion
    this.recipeWordVersion = wordVersion
    this.recipeDropQueueVersion = this.dropQueueVersion
    this.recipeFeverVersion = feverVersion
    this.recipeStageId = this.stageId
  }

  private syncRecipeFocus(): void {
    this.focusedRecipeWords = this.recipeFlow.prepareFocusWords()
  }

  /** 상자 안에서 찾아 돌려줄 물건 목록을 세 칸으로 유지한다. */
  private refillWhiteboard(): void {
    if (this.stageId === 0) {
      return
    }
    const candidates = this.whiteboardCandidates
    if (this.whiteboardTargets.length === 0) {
      const hidden = candidates.filter((candidate) => candidate.hidden)
      if (hidden.length > 0) {
        this.whiteboardTargets.push(hidden[this.rng.int(hidden.length)]!)
      }
    }
    while (this.whiteboardTargets.length < 3 && candidates.length > this.whiteboardTargets.length) {
      const available = candidates.filter((candidate) => !this.whiteboardTargets.some((target) => target.id === candidate.id))
      if (available.length === 0) break
      this.whiteboardTargets.push(available[this.rng.int(available.length)]!)
    }
    // 히든만 세 장이면 회수 목록이 전부 미지의 물건이 된다. 첫 히든 보상은 남기되,
    // 일반 후보가 있으면 마지막 칸을 바꿔 적어도 한 장은 바로 읽을 수 있게 한다.
    if (this.whiteboardTargets.length > 1 && this.whiteboardTargets.every((target) => target.hidden)) {
      const normal = candidates.filter(
        (candidate) => !candidate.hidden && !this.whiteboardTargets.some((target) => target.id === candidate.id),
      )
      if (normal.length > 0) {
        const replacement = normal[this.rng.int(normal.length)]
        if (replacement !== undefined) {
          this.whiteboardTargets[this.whiteboardTargets.length - 1] = replacement
        }
      }
    }
    this.whiteboard.set(this.whiteboardTargets.map((target) => target.label))
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
    const candidateKeys = mergeCandidateKeys(RECIPES, this.physics.countsByVariant())
    if (candidateKeys.size === 0) {
      return
    }
    const match = findMerge(
      this.physics.contactGraph((variantId) => candidateKeys.has(craftKeyOf(variantId))),
      RECIPES,
    )
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
      duration: match.recipe.inputs.length >= 3 ? COMPLEX_MERGE_REVEAL_SEC : MERGE_REVEAL_SEC,
    }
    if (match.recipe.inputs.length >= 3) {
      this.complexMergeSlowLeft = COMPLEX_MERGE_SLOW_SEC
    }
    this.fire({ kind: 'merge' })
    this.score.onCrafted(result)
    this.discover(result)
    if (this.stageId === 0 && this.tutorialStep === 3 && result.id === 'fried-egg') {
      this.tutorialStep = 5
      this.showTutorialStep()
    }
  }

  /**
   * 합성을 배우는 첫 판에서만 쓰는 안전장치.
   *
   * 프라이팬을 세 번 실제로 떨어뜨렸는데도 계란 곁에 놓지 못했다면, 둘을 골라
   * 기존 합성 연출로 묶어 준다. 튜토리얼이 조작 실수 때문에 막히지 않게 하는 장면이다.
   */
  private tryTutorialForcedMerge(): void {
    if (this.stageId !== 0 || this.tutorialStep !== 3) {
      return
    }
    const recipe = RECIPES.find((candidate) => candidate.result.id === 'fried-egg')
    const result = VARIANT_BY_ID.get('fried-egg')
    if (recipe === undefined || result === undefined) {
      return
    }
    const bodies = this.physics.snapshots()
    const egg = bodies.find((body) => body.variant.id === 'egg')
    const pans = bodies.filter((body) => body.variant.id === 'frying-pan')
    const pan = pans[0]
    if (pans.length < 3 || egg === undefined || pan === undefined) {
      return
    }
    const created = this.physics.mergeItems([egg.handle, pan.handle], result, SOLO_OWNER)
    if (created === null) {
      return
    }

    this.recipeFlow.onMerged(recipe)
    this.hiddenReveal = {
      variant: result,
      from: [egg.variant, pan.variant],
      elapsed: 0,
      duration: MERGE_REVEAL_SEC,
    }
    this.feedbackSeq += 1
    this.feedback = {
      seq: this.feedbackSeq,
      text: '합성을 도와드렸어요!',
      ok: true,
      itemLabel: result.label,
      hidden: result.hidden,
    }
    this.fire({ kind: 'merge' })
    this.score.onCrafted(result)
    this.discover(result)
    // 방금 친 세 번째 프라이팬 Enter가 안내까지 넘기지 않도록, 전용 멈춤 단계를 연다.
    this.tutorialStep = 4
    this.showTutorialStep()
  }

  /**
   * 국면이 바뀌면 레시피 밀도와 Night Fever를 함께 바꾼다.
   *
   * 이미 내려오는 단어는 그대로 둔다. 밤에 들어가면 NightFever의 1.8초 낙하·3초 휴식 시계를 열고,
   * 새벽에는 밤에 시작된 붕괴가 뒤늦게 목숨을 깎지 않도록 기존 보호막을 이어 붙인다.
   */
  private timeView(): TimeOfDay {
    const cycle = (this.elapsed % 180) / 180
    return cycle < 2 / 3
      ? timeOfDay('day', cycle / (2 / 3))
      : timeOfDay('night', (cycle - 2 / 3) / (1 / 3))
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
    if (
      this.markPhysicsVersion === this.physics.version &&
      this.markWordVersion === this.spawner.version
    ) {
      return this.lastMarks
    }
    const counts = this.availableVariantCounts()
    /*
     * 직전 배정을 넘겨 **쓰던 색을 지키게** 한다. 안 그러면 다른 단어가 사라진 것만으로
     * 내 색이 바뀐다 — 까닭은 `PairMarks.ts`에.
     */
    this.lastMarks = pairMarks(counts, RECIPES, this.lastMarks)
    this.lastMergeSizes = pairSizes(counts, RECIPES, this.lastMarks)
    this.markPhysicsVersion = this.physics.version
    this.markWordVersion = this.spawner.version
    return this.lastMarks
  }

  private mergeSizes(): ReadonlyMap<string, number> {
    this.marks()
    return this.lastMergeSizes
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

  private wordMergeSizes(sizes: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
    if (sizes.size === 0) return NO_MERGE_SIZES
    const byWord = new Map<string, number>()
    for (const falling of this.spawner.words) {
      const id = WORD_BASE_ID.get(falling.word)
      const size = id === undefined ? undefined : sizes.get(id)
      if (size !== undefined) byWord.set(falling.word, size)
    }
    return byWord
  }

  private wordMergeHints(marks: ReadonlyMap<string, number>): ReadonlyMap<string, readonly MergeHint[]> {
    if (marks.size === 0) return NO_MERGE_HINTS
    const partners = pairPartners(marks, new Map(this.physics.countsByVariant()))
    const byWord = new Map<string, readonly MergeHint[]>()
    for (const falling of this.spawner.words) {
      const id = WORD_BASE_ID.get(falling.word)
      const partnerIds = id === undefined ? undefined : partners.get(id)
      const hints = partnerIds?.flatMap((partner) => {
        const variant = VARIANT_BY_ID.get(partner)
        return variant === undefined
          ? []
          : [{ id: variant.id, sprite: variant.sprite, hidden: variant.hidden }]
      })
      if (hints !== undefined && hints.length > 0) byWord.set(falling.word, hints)
    }
    return byWord
  }

  private readonly render = (): void => {
    const time = this.timeView()
    const reveal = this.hiddenReveal
    const renderBounds = renderVerticalBounds(0, RENDER_VERTICAL_MARGIN)
    this.renderer?.draw({
      bodies: this.physics.snapshots(renderBounds.bottom, renderBounds.top),
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
              sourceX: this.whiteboardRecall.sourceX,
              sourceY: this.whiteboardRecall.sourceY,
              progress: Math.min(this.whiteboardRecall.elapsed / WHITEBOARD_RECALL_SEC, 1),
            },
      landing: this.landing.view,
      cats: this.cats.views,
      collapseFocus:
        this.phase === 'collapsing' && this.collapseFocus !== null
          ? {
              ...this.collapseFocus,
              progress: Math.min(this.collapseTimer / COLLAPSE_VIEW_SEC, 1),
            }
          : null,
      container: soloStage(this.stageId).box,
      quake: this.quakeAmplitude,
      quakePhase: this.quakePhase,
      cameraY: 0,
      stackTop: this.physics.stackTop(),
      nightfall: time.nightfall,
      ledges: this.physics.ledges(),
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
      pairSizes: this.mergeSizes(),
      // 단어 칩과 같은 값을 쓴다. 계산이 한 곳에 있어야 위상이 어긋나지 않는다
      pairPulse: pairPulse(this.elapsed),
    })
  }

  private emit(): void {
    const time = this.timeView()
    const marks = this.marks()
    this.listener?.({
      phase: this.phase,
      elapsed: this.elapsed,
      // 스포너가 목록을 바꿀 때 새 배열로 갈아치우므로 여기서 또 복사하지 않는다 —
      // 매 프레임 복사하면 GC가 주기적으로 돌아 화면이 살짝 멈춘다
      words: this.spawner.words,
      wordMarks: this.wordMarks(marks),
      wordMergeSizes: this.wordMergeSizes(this.mergeSizes()),
      wordMergeHints: this.wordMergeHints(marks),
      whiteboard: this.whiteboard.words,
      activeWhiteboard: this.whiteboardTargets
        .filter((target) => (this.physics.countsByVariant().get(target.id) ?? 0) > 0)
        .map((target) => target.label),
      whiteboardRecall:
        this.whiteboardRecall === null
          ? null
          : {
              word: this.whiteboardRecall.word,
              label: this.whiteboardRecall.label,
              sprite: this.whiteboardRecall.sprite,
              side: this.whiteboardRecall.side,
              index: this.whiteboardRecall.index,
              sourceX: this.whiteboardRecall.sourceX,
              sourceY: this.whiteboardRecall.sourceY,
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
      complexMergeFocus:
        this.complexMergeSlowLeft > 0
          ? Math.min(Math.max(1 - this.complexMergeSlowLeft / COMPLEX_MERGE_SLOW_SEC, 0), 1)
          : null,
      runSeq: this.runSeq,
      collected: this.collection.ids,
      freshlyCollected: this.collection.freshIds,
      stage: {
        id: this.stageId,
        title: soloStage(this.stageId).title,
        returns: this.stageReturns,
        totalReturns: this.totalReturns,
        // 튜토리얼에서도 첫 보관함과 같은 목표를 처음부터 계속 보여준다.
        // 계란 프라이를 회수하면 stageReturns가 올라가므로 20개에서 19개로 바뀐다.
        target:
          this.stageId === 0
            ? soloStage(1).returnTarget
            : this.isEndlessMode()
              ? null
              : soloStage(this.stageId).returnTarget,
        congestion: this.congestion,
        congestionRecoverySeq: this.congestionRecoverySeq,
        congestionBurst: this.congestionBurstLeft / CONGESTION_BURST_SEC,
        // 데모도 일반 플레이처럼 게이지가 가득 차면 같은 경보 상태로 그린다.
        congestionRush:
          this.congestionRushLeft > 0 ||
          this.congestionDemo === 'full' ||
          this.congestionDemo === 'falling',
        congestionDemo: this.congestionDemo,
        // 조작 안내가 끝난 뒤에도 경보·게임오버 데모는 튜토리얼의 연장이다.
        // 마지막 번호를 유지해 남은 회수 횟수 왼쪽 라벨이 보관소 이름으로 바뀌지 않게 한다.
        tutorialStep:
          this.stageId === 0 ? Math.min(this.tutorialStep, TUTORIAL_STEPS.length - 1) : null,
        tutorialTotal: this.stageId === 0 ? TUTORIAL_STEPS.length : null,
        tutorialText:
          this.congestionDemo === 'ready'
            ? '계란 프라이를 회수해 남은 횟수가 1개 줄었습니다. Enter를 누르세요.'
            : this.congestionDemo === 'congestionGuide'
              ? '단어를 놓치면 혼잡 경보 게이지가 쌓입니다. Enter를 누르세요.'
            : this.congestionDemo === 'full'
              ? '혼잡 경보 게이지가 가득 찼습니다. Enter를 누르세요.'
            : this.stageId === 0 && this.tutorialStep === 2
              ? `${TUTORIAL_STEPS[this.tutorialStep].text} (${this.tutorialEggDrops} / ${TUTORIAL_EGG_DROPS_REQUIRED})`
              : this.stageId === 0 ? (TUTORIAL_STEPS[this.tutorialStep]?.text ?? null) : null,
        endlessUnlocked: this.endlessUnlocked,
        notice: this.stageNotice,
      },
    })
  }

}

export { GameEngine }
export type { GameState, SubmitFeedback }
