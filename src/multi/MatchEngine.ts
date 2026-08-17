import {
  AIM_HALF_RANGE,
  ARENA,
  INVULNERABLE_SEC,
  LEDGE,
  LIVES,
} from '../game/config.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import { SOLO_STAGES, featuredEntries, type SoloStage } from '../game/data/soloStages.ts'
import { craftKeyOf, RECIPES } from '../game/data/recipes.ts'
import { shapeBounds } from '../game/shapes.ts'
import { followCameraY, spawnYFor } from '../game/systems/Camera.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../game/renderer/ArenaRenderer.ts'
import { Aimer } from '../game/systems/Aimer.ts'
import {
  MAX_ON_SCREEN,
  difficultyAt,
  difficultyProgress,
  forPlayers,
} from '../game/systems/Difficulty.ts'
import { resolveCrafted, resolveItem } from '../game/systems/ItemResolver.ts'
import {
  findMerge,
  mergeCandidateKeys,
  MERGE_CHECK_INTERVAL_SEC,
} from '../game/systems/Merger.ts'
import { placeLedge } from '../game/systems/Ledge.ts'
import { pairMarks, pairPartners, pairPulse, pairSizes } from '../game/systems/PairMarks.ts'
import { RecipeFlow } from '../game/systems/RecipeFlow.ts'
import { Whiteboard } from '../game/systems/Whiteboard.ts'
import { createRng, type Rng } from '../game/systems/Rng.ts'
import { judgeInput } from '../game/systems/TypingJudge.ts'
import { LandingGlow } from '../game/systems/LandingGlow.ts'
import type { TrailHit } from '../game/systems/TrailField.ts'
import { impactEventOf, quakeEventOf, trailHitOf } from '../game/systems/ImpactFeel.ts'
import { WordSpawner } from '../game/systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../game/types/events.ts'
import type { DifficultyLevel, FallingWord, MergeHint, OwnerId, WordEntry } from '../game/types/game.ts'
import { MatchState } from './MatchState.ts'
import { buildOwnerColors } from './ownerColors.ts'
import type {
  BodyFrame,
  DuelHeartReward,
  Message,
  PlayerId,
  PlayerInfo,
} from './protocol.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'
import type { ChatLine } from './ChatLog.ts'
import type { ChatLog } from './ChatLog.ts'
import { BodyCorrection } from './BodyCorrection.ts'
import { Presence } from './Presence.ts'
import type { MatchMode } from './matchModes.ts'
import { visibleDuelTowerIds } from './duelTowers.ts'
import { DuelRace, type DuelResult } from './DuelRace.ts'

/**
 * 대전 한 판.
 *
 * 싱글의 GameEngine과 나눠 둔 이유는 규칙이 다르기 때문이다 — 여기서는 받침대가 하나이고
 * 턴이 돌아가며, 목숨은 물건 주인이 잃는다. 물리·렌더러·단어 시스템은 그대로 공유한다.
 *
 * **방장이 심판이다.** 공유 모드는 방장 물리가 정본이고, 대결은 각 참가자의 자기 판
 * 물리가 정본이다. 목숨·골인·순위는 어느 모드든 방장만 확정해 결과 순서를 하나로 둔다.
 */

/**
 * 한 사람이 연달아 떨구는 사이의 최소 간격(초).
 *
 * 턴을 없앤 자리를 이것이 대신한다. 예전에는 물건이 자리를 잡을 때까지 아무도
 * 떨구지 못했는데, 그러면 상대가 쌓는 몇 초 동안 내 손이 멈춘다 — 타자게임에서
 * 가장 큰 대가다. 이제 둘 다 언제든 치되, 한 사람이 물건을 쏟아붓지는 못한다.
 * 싱글의 DROP_COOLDOWN_MS와 같은 장치이고, 사람마다 따로 돈다.
 */
const DROP_INTERVAL_SEC = 0.5
/** 동시 진행에서는 모두가 단어를 치므로 함께 쌓기보다 단어를 2배 자주 공급한다. */
const DUEL_WORD_RATE_MULTIPLIER = 2
const MERGED_ITEM_ID_BASE = 1_000_000

const NO_MARKS: ReadonlyMap<string, number> = new Map()
const NO_MERGE_HINTS: ReadonlyMap<string, readonly MergeHint[]> = new Map()
const WORD_BASE_ID = new Map(
  WORDS.map((entry) => [entry.word, entry.variants[0]?.id ?? '']),
)

function difficultyForMatch(
  level: DifficultyLevel,
  players: number,
  matchMode: MatchMode,
): DifficultyLevel {
  const scaled = forPlayers(level, players)
  if (matchMode !== 'duel') {
    return scaled
  }
  return {
    ...scaled,
    maxConcurrent: MAX_ON_SCREEN,
    spawnInterval: scaled.spawnInterval / DUEL_WORD_RATE_MULTIPLIER,
  }
}

/**
 * 한 차례에 주어지는 시간(초). 넘기면 방장이 대신 떨궈 차례를 넘긴다.
 *
 * **잠수를 막는 것이 목적이다.** 받침대가 하나뿐이라 한 사람이 손을 놓으면 판 전체가
 * 멎는다 — 나머지는 나가는 것 말고 할 수 있는 일이 없다.
 *
 * 넉넉히 잡았다. 단어를 찾아 읽고 한글로 치는 데 드는 시간에 조준까지 얹어야 하고,
 * 이 시한에 걸리는 것은 자리를 비운 사람이지 느린 사람이 아니어야 한다.
 */
const TURN_LIMIT_SEC = 10

/** 남은 시간이 이 아래로 내려가면 화면이 다급하게 알린다 */
const TURN_HURRY_SEC = 5

/** 권위 키프레임을 보내는 간격(초). 턴이 없어져 끝나는 지점이 사라졌다 */
const SYNC_INTERVAL_SEC = 2.5
/** 대결 게임판 주인이 움직임을 직접 배포하는 간격. 원격 판은 그 사이를 예측한다. */
const DUEL_BOARD_SYNC_INTERVAL_SEC = 0.125
/** 입력된 단어 자리에서 누가 가져갔는지 읽을 수 있게 남기는 시간. */
const DUEL_WORD_CLAIM_SEC = 1.4
/** 대결 모드에서 이 높이까지 자기 탑을 올리면 골인한다. */
const DUEL_TARGET_STACK_TOP = ARENA.platformTop + 3.2
/** 골인·탈락한 타워가 결과 효과와 함께 사라지는 시간. */
const DUEL_TOWER_EXIT_SEC = 1.2
/** 판 전환 직후에는 구형 판 ID 없는 지연 명령을 잠깐 버린다. */
const LEGACY_COMMAND_GRACE_SEC = 1
/** 대전 물리는 브라우저 프레임 간격 대신 이 간격으로만 전진한다. */
const FIXED_STEP_SEC = 1 / 60
/** 한 프레임에 밀린 물리를 처리할 최대 횟수. 탭 복귀 때 긴 따라잡기를 막는다. */
const MAX_FIXED_STEPS = 3
/** 드롭 명령이 네트워크를 지나갈 시간을 주는 물리 tick 수. 60Hz 기준 약 100ms다. */
const DROP_LEAD_TICKS = 6

/**
 * 대전은 튜토리얼을 쓰지 않는다. 한 판의 테마는 시드만으로 정하므로 방장 교체나
 * 재접속 뒤에도 모두 같은 단어 풀과 스테이지 이름을 복원할 수 있다.
 */
function duelStageFor(seed: number): SoloStage {
  const stages = SOLO_STAGES.filter((stage) => stage.id > 0)
  const index = Math.floor(createRng(seed ^ 0x73746167).next() * stages.length)
  return stages[index] ?? SOLO_STAGES[1]!
}

/**
 * 판을 가리키는 이름. 인원이 몇이든 길이가 같다.
 *
 * 참가자 전원이 각자 만들어도 같은 값이 나와야 한다 — 서버가 여러 보고를 한 판으로
 * 묶는 기준이기 때문이다. 그래서 기기 id를 정렬한 뒤 접는다(FNV-1a).
 * 시드와 인원이 함께 들어가므로 서로 다른 판이 같은 이름을 갖는 일은 사실상 없다.
 */
function matchIdOf(seed: number, devices: readonly string[]): string {
  const joined = [...devices].sort().join('.')
  let hash = 0x811c9dc5
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${seed}-${devices.length}-${hash.toString(36)}`
}

/**
 * 이 판의 첫 차례.
 *
 * 방장이 따로 보내지 않고 시드와 명단에서 뽑는다. 둘은 start 메시지에 이미 있고,
 * 양쪽이 같은 값을 갖는다. 판마다 seed가 바뀌므로 시작하는 사람도 한 사람에게 고정되지 않는다.
 */
function starterOf(seed: number, players: readonly PlayerInfo[]): PlayerId | null {
  if (players.length === 0) {
    return null
  }
  const index = Math.floor(createRng(seed).next() * players.length) % players.length
  return players[index]?.id ?? players[0]!.id
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 아무도 무적이 아닐 때 돌려주는 고정 배열 — 매 프레임 빈 배열을 새로 만들지 않으려는 것 */

const NO_INVULNERABLE: readonly (readonly [PlayerId, number])[] = []

const HOST_MESSAGES = new Set<Message['t']>([
  'dropped', 'chatted', 'left', 'words', 'lives', 'duelWhiteboard', 'duelResults', 'sync', 'over',
  'rematchList', 'restart', 'room',
])

interface MatchViewState {
  readonly phase: 'playing' | 'over'
  readonly selfId: PlayerId
  readonly players: readonly PlayerInfo[]
  readonly lives: readonly (readonly [PlayerId, number])[]
  /** 지금 떨굴 차례인 사람. 판이 끝났으면 null */
  readonly current: PlayerId | null
  /** 지금이 내 차례인가. 쿨타임이 남았어도 참일 수 있다 — 곧 내 순서라는 뜻이다 */
  readonly myTurn: boolean
  /** 지금 떨굴 수 있는지. 내 차례이면서 쿨타임이 끝났을 때만 참 */
  readonly canDrop: boolean
  /**
   * 남은 쿨타임 0~1. 화면이 채워지는 눈금으로 그린다.
   * **모두가 같은 값을 본다** — 받침대가 하나이듯 대기도 하나다.
   */
  readonly dropCooldown: number
  /**
   * 지금 차례인 사람에게 남은 시간(초). 아무도 차례가 아니면 null.
   *
   * 남의 차례일 때도 보인다 — 얼마나 더 기다려야 하는지 알아야 하고,
   * 자리를 비운 사람이 있는지도 이 숫자가 말해준다.
   */
  readonly turnLeft: number | null
  /**
   * 사람별 남은 무적 비율(1 → 0). 목숨을 잃은 직후 잠깐 붙는다.
   *
   * 없으면 탑이 한 번 무너질 때 그 사람의 물건이 줄줄이 벗어나며 목숨 셋이
   * 한순간에 날아간다 — 만회할 틈이 없다. 싱글과 같은 규칙이다.
   */
  readonly invulnerable: readonly (readonly [PlayerId, number])[]
  /** 방금 목숨을 잃은 사람. 누구인지가 핵심이라 가운데에 띄운다 */
  readonly hurt: { readonly by: PlayerId; readonly lives: number } | null
  readonly words: readonly FallingWord[]
  readonly wordClaims: readonly DuelWordClaim[]
  readonly wordMarks: ReadonlyMap<string, number>
  readonly wordMergeSizes: ReadonlyMap<string, number>
  /** 합성 가능한 단어 → 내 받침대에서 붙일 짝 물건. */
  readonly wordMergeHints: ReadonlyMap<string, readonly MergeHint[]>
  readonly pairPulse: number
  readonly whiteboard: readonly string[]
  readonly activeWhiteboard: readonly string[]
  readonly heartReward: DuelHeartReward | null
  /** 내 게임판에서 방금 성공한 합성. 상대 합성은 각자 자기 화면에서만 강조한다. */
  readonly mergeFeedback: DuelMergeFeedback | null
  readonly aimNormalized: number
  /**
   * 주고받은 말. 코드로 모인 방에서만 오간다.
   *
   * 차례가 아닐 때 할 일이 없어진 자리를 메우는 것이다 — 예전에는 그 자리에 노림이
   * 있었는데, 남의 차례를 방해하는 일이라 배우기도 어렵고 당하는 쪽도 영문을 몰랐다.
   */
  readonly chat: readonly ChatLine[]
  /** 지금 입력창의 Enter가 무엇을 하는가. 같은 칸이 때에 따라 다른 일을 한다 */
  readonly inputMode: 'drop' | 'chat' | 'idle'
  /** 이 판이 티어에 반영되는가. 랭크 게임만 그렇다 */
  readonly ranked: boolean
  /** 실제로 열린 모드. UI와 입력 규칙이 이 값을 따른다 */
  readonly matchMode: MatchMode
  /** 이번 대전에 고정된 싱글 보관소 테마. 단어 풀과 노릴 합성의 힌트다. */
  readonly stage: { readonly id: number; readonly title: string }
  /**
   * 등수. 1이 마지막까지 버틴 사람이다. 판이 끝나면 결과 화면이 그대로 보여준다.
   * 같은 붕괴로 함께 탈락하면 공동 등수다.
   */
  readonly standings: readonly { readonly id: PlayerId; readonly placement: number }[]
  /** 대결 중 이미 골인하거나 탈락해 순위가 확정된 사람들. */
  readonly duelResults: readonly DuelResult[]
  /** 현재 캔버스에 왼쪽부터 그려진 대결 게임판 순서. DOM 효과 위치도 이를 따른다. */
  readonly duelTowerIds: readonly PlayerId[]
  readonly feedback: MatchFeedback | null
  readonly winner: PlayerId | null
  readonly connectionLost: boolean
  /**
   * 끊겼고 다시 붙는 중이다. **`connectionLost`와 다르다** — 이쪽은 아직 희망이 있고,
   * 사람이 할 일도 다르다(기다리기 vs 나가기).
   */
  readonly reconnecting: boolean
  /** 판을 거듭하며 쌓인 승수. 이름 옆에 붙는다 */
  readonly wins: readonly (readonly [PlayerId, number])[]
  /** 계속하기를 누른 사람들 */
  readonly wantRematch: readonly PlayerId[]
  /**
   * 상대가 **일부러** 로비로 나갔다.
   * 연결이 끊긴 것과 구분한다 — 이쪽은 사고가 아니라 상대의 선택이고,
   * 다시 시도해볼 것이 없으므로 남은 사람에게는 나가는 길만 열어준다.
   */
  readonly opponentLeft: boolean
  /** 판 도중에 사라진 사람들. 무너져 탈락한 것과 다르게 보여준다 */
  readonly left: readonly PlayerId[]
  /**
   * 이 판을 가리키는 이름. 양쪽이 같은 값을 만든다.
   *
   * 레이팅은 **양쪽 보고가 일치할 때만** 움직이는데, 서버가 두 보고를 짝지으려면
   * "같은 판"이라는 기준이 필요하다. 시드는 방장이 정해 양쪽이 나눠 가졌고
   * 기기 id는 명단에 실려 있으므로, 둘을 합쳐 정렬하면 양쪽에서 같은 값이 나온다.
   */
  readonly matchId: string
}

interface DuelWordClaim {
  readonly seq: number
  readonly by: PlayerId
  readonly word: string
  readonly side: FallingWord['side']
  readonly slot: number
  readonly y: number
  /** 화이트보드 단어를 가져가 생명 보상을 받은 획득인지 여부. */
  readonly lifeReward: boolean
}

interface DuelMergeFeedback {
  readonly seq: number
  readonly itemLabel: string
  readonly ingredientCount: number
}

interface TimedDuelWordClaim extends DuelWordClaim {
  readonly expiresAt: number
}

interface MatchFeedback {
  readonly seq: number
  readonly text: string
  readonly kind: 'dropped' | 'suggested' | 'miss' | 'notYourTurn'
  readonly itemLabel: string | null
  readonly hidden: boolean
}

interface MatchEngineOptions {
  readonly transport: Transport
  readonly players: readonly PlayerInfo[]
  readonly seed: number
  readonly matchMode?: MatchMode
  /** 이 판을 여는 첫 차례. 없으면 seed와 명단으로 계산한다 */
  readonly starter?: PlayerId | null
  /**
   * 판을 거듭하며 쌓이는 승수. **세션이 들고 있는 것을 그대로 받아 고친다** —
   * 엔진은 판마다 새로 만들어지므로 여기서 소유하면 점수가 매 판 사라진다.
   */
  readonly wins: Map<PlayerId, number>
  readonly onFailure?: (failure: TransportFailure) => void
  /** 다음 판을 열어달라고 세션에 청한다. 엔진은 자기 자신을 갈아치울 수 없다 */
  readonly onRestart?: (seed: number) => void
  /** 친선전 방 연결을 유지한 채 준비 화면으로 돌아가달라고 세션에 청한다 */
  readonly onReturnToRoom?: () => void
  /**
   * 주고받은 말. **세션이 들고 있는 것을 그대로 받는다** — 준비 화면에서 나눈 말이
   * 판이 열리는 순간 사라지면 안 되고, 엔진은 판마다 새로 만들어진다.
   */
  readonly chat: ChatLog
  /**
   * 말을 걸 수 있는 방인가. 코드로 모인 방만 그렇다 —
   * 랭크 게임은 서로 모르는 사이라 말을 걸 자리가 아니다.
   */
  readonly chatEnabled: boolean
  /**
   * 이 판이 티어에 반영되는가. **랭크 게임만 그렇다.**
   *
   * 코드로 모인 방은 누구와 붙을지 고를 수 있다 — 늘 이기는 상대만 불러 판을
   * 거듭하면 사다리가 실력이 아니라 상대를 고르는 능력을 재게 된다. 아는 사람끼리
   * 편하게 하는 자리를 남겨두려면 그 자리에는 점수가 걸리지 않아야 한다.
   *
   * `chatEnabled`의 반대이지만 따로 둔다 — 둘은 뜻이 다르고, 하나에서 파생시키면
   * 채팅 규칙을 바꿀 때 랭킹이 조용히 따라 바뀐다.
   */
  readonly ranked: boolean
  /**
   * 지금 시각(ms). 같은 말이 연달아 오는 것을 막는 데만 쓴다.
   *
   * **세션과 엔진이 같은 시계를 봐야 한다.** 기록을 나눠 쓰는데 시계가 다르면,
   * 준비 화면(큰 값)에서 판(0부터 시작하는 경과 시간)으로 넘어가는 순간 시각이
   * 거꾸로 흘러 그 뒤의 말이 전부 버려진다.
   */
  readonly chatClock: () => number
}

interface ScheduledDrop {
  readonly by: PlayerId
  readonly word: string
  readonly aimX: number
  readonly spawnY: number
  readonly variantId: string
  readonly itemId: number
  readonly applyAtTick: number | null
}

class MatchEngine {
  private readonly physics: PhysicsWorld
  /** 호스트 탭이 숨겨져도 단어·물리·판정의 권위 시계는 계속 흘러야 한다. */
  private readonly loop = new GameLoop({ runWhenHidden: true })
  private readonly transport: Transport
  private readonly match: MatchState
  private readonly ownerColors: Map<OwnerId, string>
  private readonly onFailure: ((failure: TransportFailure) => void) | null
  private readonly onRestart: ((seed: number) => void) | null
  private readonly onReturnToRoom: (() => void) | null
  private readonly wins: Map<PlayerId, number>
  private readonly chat: ChatLog
  private readonly chatEnabled: boolean
  private readonly ranked: boolean
  private readonly matchMode: MatchMode
  private readonly seed: number
  private readonly duelStage: SoloStage | null
  private readonly chatClock: () => number
  private readonly duelWorlds: ReadonlyMap<PlayerId, PhysicsWorld> | null
  private readonly duelRace: DuelRace | null
  /** 결과 연출 시작 시각. 타워를 즉시 잘라내지 않고 자연스럽게 치우는 데 쓴다. */
  private readonly duelFinishedAt = new Map<PlayerId, number>()
  private readonly wantRematch = new Set<PlayerId>()
  /** 승수는 판마다 한 번만 올린다 — 방장과 참가자가 각자 끝을 알아채기 때문이다 */
  private recorded = false
  /** 1위가 경기 도중 정해져도 승수는 그 순간 한 번만 올린다. */
  private awardedWinner: PlayerId | null = null
  /** 모두의 계속하기가 모인 뒤 재시작 신호는 판마다 한 번만 보낸다. */
  private restartRequested = false
  private roomReturnRequested = false
  private opponentLeft = false
  /** 지금 다시 붙는 중인가. 판을 접는 것과 갈라 보여줘야 한다 */
  private reconnecting = false
  /** 누구를 언제까지 기다리고 방장이 누구인가. **판정만** 그쪽에 있다 */
  private readonly presence: Presence
  /*
   * 화면에 넘길 사본. emit()은 매 프레임 도는데 이 둘은 판이 끝날 때만 바뀐다 —
   * 프레임마다 새로 만들면 그것만으로 쓰레기가 쌓인다. 바뀐 순간에만 다시 만든다.
   */
  private winsView: readonly (readonly [PlayerId, number])[] = []
  private rematchView: readonly PlayerId[] = []
  private readonly matchId: string

  private rng: Rng
  private spawner: WordSpawner
  private readonly recipeFlows = new Map<PlayerId, RecipeFlow>()
  private recipePickIndex = 0
  private readonly recipeCounts = new Map<string, number>()
  private focusedRecipeWords: readonly string[] = []
  private readonly whiteboard: Whiteboard
  private whiteboardWords: readonly string[] = []
  private heartReward: DuelHeartReward | null = null
  private heartRewardSeq = 0
  private wordClaims: readonly TimedDuelWordClaim[] = []
  private wordClaimSeq = 0
  private mergeFeedback: DuelMergeFeedback | null = null
  private mergeFeedbackSeq = 0
  private readonly duelRng: Rng
  private nextMergedItemId: number
  private readonly pendingMergedRecipes: string[] = []
  private readonly duelMarks = new Map<PlayerId, ReadonlyMap<string, number>>()
  private readonly duelMergeSizes = new Map<PlayerId, ReadonlyMap<string, number>>()
  private readonly duelMarkPhysicsVersions = new Map<PlayerId, number>()
  private readonly duelMarkWordVersions = new Map<PlayerId, number>()
  private aimer = new Aimer(AIM_HALF_RANGE)
  /** 빛나는 물건이 얹힐 때 번지는 색. 싱글과 같은 것을 쓴다 */
  private readonly landing = new LandingGlow()
  /** 이번 프레임에 부딪힌 자리들. 배열을 새로 만들지 않고 비워 쓴다 */
  private readonly frameImpacts: TrailHit[] = []
  /** 표시 보정 중인 물건의 충돌만 걷어낸 렌더용 버퍼 */
  private readonly visibleImpacts: TrailHit[] = []
  private elapsed = 0
  /** 자기 대결판의 접촉 그래프를 다시 검사하기까지 누적한 시간. */
  private duelMergeCheckElapsed = 0

  /** 사람별로 다음에 떨굴 수 있을 때까지 남은 시간(초) */
  /**
   * 다음 사람이 떨굴 수 있게 되기까지 남은 시간(초). **모두가 함께 쓴다.**
   *
   * 사람마다 따로 돌리면 각자 자기 시계만 보면 되어 "받침대 하나를 함께 쓴다"가
   * 사라진다. 하나로 두면 앞사람이 떨군 직후의 정적이 모두에게 같은 길이로 흐르고,
   * 그것이 끝나는 순간이 곧 다음 사람의 차례다.
   *
   * 방장이 소유한다 — 참가자는 화면에 게이지를 그리는 데만 쓴다.
   */
  private dropCooldown = 0
  /** 대결 모드에서 사람마다 따로 도는 드롭 쿨타임 */
  private readonly duelCooldowns = new Map<PlayerId, number>()
  /**
   * 지금 차례가 시작된 뒤 흐른 시간(초).
   *
   * **판정은 방장만 한다.** 양쪽이 각자 재서 각자 떨구면 같은 순간에 다른 물건이
   * 두 번 떨어진다. 참가자는 화면에 숫자를 그리는 데만 쓴다 — 조금 어긋나도
   * 보이는 것이 어긋날 뿐이고, 실제로 떨어지는 것은 방장이 보낸 하나다.
   */
  private turnElapsed = 0
  private sinceSync = 0
  private sinceDuelBoardSync = 0
  /** 현재 로컬 물리 step 번호. 공유 모드 참가자만 sync에서 방장 tick에 맞춘다. */
  private physicsTick = 0
  /** 게임판별로 마지막에 적용한 주인 tick. 늦게 도착한 상태가 판을 되감지 못하게 한다. */
  private readonly duelBoardTicks = new Map<PlayerId, number>()
  /** 판 주인이 마지막으로 확정한 탑 높이. 예측 물리는 골인 판정에 쓰지 않는다. */
  private readonly duelStackTops = new Map<PlayerId, number>()
  /** 원격 게임판 주인이 보고한 이탈. 목숨과 순위 판정은 다음 방장 step에서 확정한다. */
  private readonly pendingDuelEscapes = new Map<PlayerId, number>()
  /** 가변 렌더 프레임 시간을 고정 물리 step으로 바꾸기 위한 누적 시간. */
  private fixedAccumulator = 0
  /** 물리 세계에 넣는 시점만 예약한다. 단어 제거·턴 이동은 드롭 승인 시점에 한다. */
  private readonly pendingDrops: ScheduledDrop[] = []
  /** 방장이 떨군 뒤 정착 상태를 한 번 더 알려줄 물건들 */
  private readonly pendingSettledSync = new Set<number>()
  /** 참가자 화면에서만 권위 위치 교정을 짧게 이어 붙인다. */
  private readonly bodyCorrection = new BodyCorrection()
  /** 대결 원격 판은 각 판 주인의 위치로 교정하되 화면에서만 짧게 이어 붙인다. */
  private readonly duelBodyCorrections = new Map<PlayerId, BodyCorrection>()

  /**
   * 덫이 걸린 단어 — 단어 → 건 사람.
   *
   * 단어를 열쇠로 삼는 이유는 낙하 단어가 사라졌다 다시 나와도 같은 덫으로 이어져야
   * 하기 때문이다. 상대가 그 단어를 치면 덫이 작동하고 건 사람이 하트를 되찾는다.
   */
  /**
   * 노려진 단어 → 노리는 사람.
   */
  /*
   * 등수 사본. emit()은 매 프레임 도는데 등수는 누가 탈락할 때만 바뀐다 —
   * 프레임마다 다시 세면 그것만으로 쓰레기가 쌓인다.
   */
  private standingsView: readonly { id: PlayerId; placement: number }[] = []
  private feedback: MatchFeedback | null = null
  private feedbackSeq = 0
  private connectionLost = false
  /** 방장이 물건마다 매기는 번호. 양쪽이 같은 물건으로 취급하는 기준이다 */
  private nextItemId = 1
  /** 방장이 마지막으로 보낸 단어 밭의 판번호 */
  private sentWordVersion = -1
  /**
   * 사람별 남은 무적 시간(초).
   *
   * 방장은 이것으로 목숨을 깎을지 말지를 정하고, 참가자는 화면에 베리어를 그리는 데만 쓴다.
   * 양쪽이 각자 굴려도 되는 이유는 판정이 방장 한 곳에서만 나기 때문이다 —
   * 참가자 쪽 값이 조금 어긋나도 승패에 닿지 않는다.
   */
  private readonly invulnerable = new Map<PlayerId, number>()
  /** 가장 최근에 목숨을 잃은 사람. 무적이 끝나면 지운다 */
  private lastHurt: PlayerId | null = null
  /** 현재 현지 시각에 맞춰 화면이 고정한 조명. 대전 규칙과는 무관하다. */
  private nightfall: 0 | 1 = 0
  /** 지금 화면이 올려다보는 높이. 탑을 따라 올라간다 */
  private cameraY = 0
  /** 이번 판에 닿았던 가장 높은 난이도 진행도(0~1) */
  private difficultyPeak = 0

  private renderer: ArenaRenderer | null = null
  private listener: ((state: MatchViewState) => void) | null = null
  private events: GameEventSink | null = null
  /**
   * 마지막으로 소리로 알린 "떨굴 수 있는가".
   * 턴이 넘어오는 순간은 방장과 참가자가 서로 다른 경로로 알게 되므로(한쪽은
   * nextTurn, 다른 쪽은 turn 메시지) 두 곳에 소리를 심는 대신 값이 바뀌는 것을 본다.
   */
  private announcedCanDrop = false

  private constructor(
    physics: PhysicsWorld,
    options: MatchEngineOptions,
    duelWorlds: ReadonlyMap<PlayerId, PhysicsWorld> | null,
  ) {
    this.physics = physics
    this.duelWorlds = duelWorlds
    /*
     * 판 이름은 시작할 때 한 번 만든다. 기기 id를 정렬해 넣으므로 방장과 참가자가
     * 각자 만들어도 같은 값이 나온다 — 따로 주고받을 필요가 없다.
     *
     * **id를 그대로 이어 붙이지 않는다.** 그렇게 했더니 여덟이 붙었을 때 UUID 여덟 개가
     * 들어가 300자를 넘겼고, 서버의 길이 상한에 걸려 그 판이 통째로 버려졌다.
     * 인원이 늘 때마다 상한을 올리는 것은 같은 함정을 다시 놓는 것이라, 길이가
     * 인원에 비례하지 않게 줄여서 넣는다.
     */
    this.matchId = matchIdOf(
      options.seed,
      options.players.map((player) => player.device),
    )
    this.transport = options.transport
    this.onFailure = options.onFailure ?? null
    this.onRestart = options.onRestart ?? null
    this.onReturnToRoom = options.onReturnToRoom ?? null
    this.wins = options.wins
    this.chat = options.chat
    this.chatEnabled = options.chatEnabled
    this.ranked = options.ranked
    this.matchMode = options.matchMode ?? 'shared'
    this.seed = options.seed
    this.duelStage = this.matchMode === 'duel' ? duelStageFor(options.seed) : null
    this.chatClock = options.chatClock
    this.winsView = [...this.wins]
    this.match = new MatchState(options.players, LIVES, options.starter ?? starterOf(options.seed, options.players))
    this.duelRace = this.matchMode === 'duel' ? new DuelRace(options.players) : null
    for (const player of options.players) {
      this.duelStackTops.set(player.id, ARENA.platformTop)
      if (this.matchMode === 'duel') {
        this.duelBodyCorrections.set(player.id, new BodyCorrection())
      }
    }
    this.standingsView = this.duelRace === null ? this.match.standings() : []
    this.ownerColors = buildOwnerColors(options.players)
    this.presence = new Presence(options.players, options.transport.selfId)
    this.rng = createRng(options.seed)
    for (let index = 0; index < options.players.length; index += 1) {
      const player = options.players[index]!
      this.recipeFlows.set(
        player.id,
        new RecipeFlow(createRng(options.seed ^ 0x72656369 ^ ((index + 1) * 0x9e37)), WORDS, RECIPES),
      )
    }
    const selfIndex = Math.max(0, options.players.findIndex((player) => player.id === options.transport.selfId))
    this.duelRng = createRng(options.seed ^ 0x6475656c ^ ((selfIndex + 1) * 0x45d9))
    this.nextMergedItemId = MERGED_ITEM_ID_BASE + selfIndex * 100_000
    this.whiteboard = new Whiteboard(createRng(options.seed ^ 0x5eed))
    this.spawner = new WordSpawner(
      this.rng,
      WORDS,
      this.matchMode === 'duel' ? (candidates) => this.pickRecipeWord(candidates) : null,
    )
    if (this.matchMode === 'duel') {
      this.spawner.restrict(featuredEntries(this.duelStage!))
      this.syncDuelRecipeGuidance()
    }
    if (!this.isHost) {
      this.spawner.follow()
    }
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(options: MatchEngineOptions): Promise<MatchEngine> {
    const physics = await PhysicsWorld.create()
    const matchMode = options.matchMode ?? 'shared'
    const duelWorlds = matchMode === 'duel'
      ? new Map(await Promise.all(options.players.map(async (player) => [
          player.id,
          await PhysicsWorld.create(),
        ] as const)))
      : null
    return new MatchEngine(physics, options, duelWorlds)
  }

  /**
   * 지금 내가 방장인가.
   *
   * **전송로가 아니라 엔진이 기억한다.** 전송로의 `isHost`는 붙는 순간 정해져 바뀌지
   * 않는데, 방장이 사라지면 다음 사람이 이어받아야 한다.
   */
  get isHost(): boolean {
    return this.presence.host === this.transport.selfId
  }

  start(): void {
    this.loop.start()
    this.fire({ kind: 'runStart' })
    if (this.isHost && this.matchMode === 'duel') {
      this.broadcastDuelWhiteboard()
    }
    this.emit()
  }

  private pickRecipeWord(candidates: readonly WordEntry[]): WordEntry {
    const players = this.match.players.filter((player) => this.isDuelActive(player.id))
    if (players.length === 0) return this.rng.pick(candidates)
    const player = players[this.recipePickIndex % players.length]!
    this.recipePickIndex += 1
    return this.recipeFlows.get(player.id)?.pick(candidates) ?? this.rng.pick(candidates)
  }

  /** 각자 자기 보드에서 완성하기 쉬운 재료를 공용 단어 밭에 번갈아 공급한다. */
  private syncDuelRecipeGuidance(): void {
    if (this.matchMode !== 'duel') return
    const focused = new Set<string>()
    for (const player of this.match.players) {
      const flow = this.recipeFlows.get(player.id)
      if (flow === undefined) continue
      this.recipeCounts.clear()
      for (const [id, count] of this.worldFor(player.id).countsByVariant()) {
        this.recipeCounts.set(id, count)
      }
      for (const falling of this.spawner.words) {
        if (falling.state !== 'active') continue
        const id = WORD_BASE_ID.get(falling.word)
        if (id !== undefined) {
          this.recipeCounts.set(id, (this.recipeCounts.get(id) ?? 0) + 1)
        }
      }
      for (const pending of this.pendingDrops) {
        if (pending.by === player.id) {
          this.recipeCounts.set(
            pending.variantId,
            (this.recipeCounts.get(pending.variantId) ?? 0) + 1,
          )
        }
      }
      flow.observe(this.recipeCounts)
      for (const word of flow.prepareFocusWords()) focused.add(word)
    }
    this.focusedRecipeWords = [...focused]
    if (this.isHost) {
      this.whiteboard.refill(WORDS, this.focusedRecipeWords)
      this.whiteboardWords = this.whiteboard.words
      this.spawner.prefer(this.whiteboardWords)
    }
  }

  onStateChange(listener: (state: MatchViewState) => void): void {
    this.listener = listener
    this.emit()
  }

  /** 사건을 받아간다. 싱글의 GameEngine과 같은 통로다 */
  onEvent(sink: GameEventSink): void {
    this.events = sink
  }

  private fire(event: GameEvent): void {
    this.events?.(event)
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

  /**
   * 대전 규칙과 무관한 화면 조명. React 경계가 현지 시각을 읽어 낮 또는 밤으로 고정한다.
   */
  setNightfall(nightfall: 0 | 1): void {
    if (this.nightfall === nightfall) {
      return
    }
    this.nightfall = nightfall
    this.render()
  }

  /**
   * Enter를 누른 순간.
   *
   * **내 차례면 떨구고, 아니면 한마디가 된다.** 같은 칸이 때에 따라 다른 일을 하는데,
   * 그렇게 둔 것은 차례를 기다리는 동안 손이 갈 곳이 여기밖에 없기 때문이다 —
   * 예전에는 이 자리에 노림이 있었다. 화면은 칸 위에 지금 무엇을 하는지 적어둔다.
   *
   * 판정보다 먼저 갈라야 한다. 뒤에 두면 한마디가 낙하 단어와 맞는지 검사받고,
   * 맞지 않으면 오타로 처리되어 말이 사라진다.
   */
  submit(text: string): void {
    if (this.match.over) {
      // 친선전은 결과 화면에서도 같은 입력칸으로 대화를 이어간다.
      if (this.canPlayerChat(this.transport.selfId)) {
        this.sendChat(text)
      }
      return
    }
    const inputMode = this.inputMode()
    if (inputMode === 'chat') {
      this.sendChat(text)
      return
    }
    if (inputMode === 'idle') {
      return
    }
    const result = judgeInput(this.spawner.words, text)
    this.feedbackSeq += 1

    if (result.kind === 'miss') {
      this.feedback = {
        seq: this.feedbackSeq,
        text: result.input,
        kind: 'miss',
        itemLabel: null,
        hidden: false,
      }
      this.fire({ kind: 'wordMiss' })
      this.emit()
      return
    }

    const word = result.word.word
    // 대전에는 콤보가 없다. 맞췄다는 사실만 알린다
    this.fire({ kind: 'wordHit', combo: 0 })
    if (this.canDropNow()) {
      this.requestDrop(word)
    }
  }

  /**
   * 누가 사라졌다. 나갔든 끊겼든 이 층에서는 같다.
   *
   * **한 사람이 사라졌다고 판을 접지 않는다.** 여덟까지 붙는데 그렇게 두면 한 사람의
   * 네트워크 끊김이 나머지 일곱의 판을 죽인다. 그 사람만 빼고 이어간다.
   *
   * 다만 **방장이 사라지면 이어갈 수 없다.** 물리와 판정을 방장이 쥐고 있고 스타
   * 토폴로지라 참가자끼리는 서로 닿지도 못한다. 그때만 판이 끝난다.
   *
   * 판정은 방장만 한다. 참가자는 자기 전송로가 알려준 것으로 움직이지 않고 방장이
   * 보내주는 `left`를 따른다 — 각자 판단하면 사람마다 다른 명단을 갖게 된다.
   */
  private noticeGone(who: PlayerId): void {
    /*
     * **둘로 시작한 판은 예전 그대로 끝낸다.** 남는 사람이 하나뿐이라 이어갈 판이
     * 없는데, 그때 "이겼습니다"를 띄우면 상대의 회선이 끊긴 것을 이긴 것으로 말하는
     * 셈이다 — "연결이 끊겼습니다"가 실제로 일어난 일이다.
     */
    if (this.match.players.length <= 2) {
      this.connectionLost = true
      this.loop.stop()
      this.emit()
      return
    }
    /*
     * **방장이 사라지면 다음 사람이 이어받는다.**
     *
     * 모두가 같은 규칙으로 고르므로 아무도 알릴 필요가 없다 — 누가 사라졌는지는
     * 이미 모두가 알고 명단 순서도 같다. 정해서 보내면 그 메시지가 늦거나 유실될 때
     * 방장이 둘이 되거나 아무도 아니게 된다.
     *
     * 이어받은 사람은 그 자리에서 심판이 된다. 참가자도 목숨·차례를 따라 갱신해
     * 왔고 물리도 각자 돌리고 있어서, 새로 받아올 상태가 없다.
     */
    if (who === this.presence.host) {
      this.presence.handOver(
        who,
        this.match.players,
        (id) => this.match.isAlive(id),
        this.transport.selfId,
      )
      if (this.isHost) {
        this.spawner.lead()
        this.broadcastAuthorityState()
      }
    }
    if (!this.isHost) {
      // 방장이 정리해 알려줄 것이다
      return
    }
    /*
     * **바로 빼지 않는다.** 회선이 흔들린 것과 나간 것은 겉으로 같은데, 여기서 빼면
     * 잠깐 끊겼다 돌아온 사람이 이미 죽어 있다. 유예를 두고 그 안에 돌아오면 없던 일이 된다.
     *
     * 그동안 그 사람 차례는 시한이 대신 넘겨주므로 판은 멎지 않는다.
     */
    this.presence.await(who, this.elapsed)
    this.emit()
  }

  /** 유예가 지난 사람을 판에서 뺀다. 방장만 본다 */
  private sweepGone(): void {
    for (const who of this.presence.expired(this.elapsed)) {
      this.transport.broadcast({ t: 'left', who, matchId: this.matchId })
      this.applyLeft(who)
    }
  }

  /**
   * 돌아온 사람에게 지금 상태를 통째로 보낸다. 방장만 한다.
   *
   * 순서가 있다 — 밭과 목숨을 먼저 주고 물건을 마지막에 준다. 물건이 먼저 오면
   * 그 사람 화면에는 아직 옛 목숨이 걸린 채로 새 탑이 서고, 그 사이가 눈에 남는다.
   */
  private resendTo(peer: PlayerId): void {
    this.transport.sendTo(peer, {
      t: 'words', words: this.spawner.words, matchId: this.matchId,
    })
    this.transport.sendTo(peer, {
      t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
    })
    if (this.matchMode === 'duel') {
      this.transport.sendTo(peer, {
        t: 'duelWhiteboard', words: this.whiteboardWords, matchId: this.matchId,
      })
    }
    if (this.duelRace !== null) {
      this.transport.sendTo(peer, {
        t: 'duelResults', results: this.duelRace.results, matchId: this.matchId,
      })
    }
    this.transport.sendTo(peer, {
      t: 'sync',
      bodies: this.allFrames(),
      welds: this.allWeldPairs(),
      tick: this.physicsTick,
      matchId: this.matchId,
    })
  }

  /** 사라진 사람을 판에서 뺀다. 양쪽이 똑같이 실행한다 */
  private applyLeft(who: PlayerId): void {
    if (this.duelRace !== null && !this.duelRace.isActive(who)) {
      this.presence.markGone(who)
      this.emit()
      return
    }
    if (!this.match.isAlive(who)) {
      return
    }
    this.presence.markGone(who)
    // 그 사람만의 회차다 — 함께 무너진 것이 아니므로 등수를 같이 매기면 안 된다
    this.match.startDeathBatch()
    this.match.setLives(who, 0)
    if (this.duelRace !== null) {
      this.duelRace.eliminate([who])
      if (this.isHost) this.publishDuelResults()
    } else {
      this.standingsView = this.match.standings()
    }
    this.match.ensureTurnAlive()
    // 사라진 사람 차례에서 시계가 이어지면 안 된다
    this.turnElapsed = 0
    if (this.isHost) {
      this.transport.broadcast({
        t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
      })
      if (this.duelRace !== null ? this.finishDuelIfReady() : this.match.over) {
        if (this.duelRace !== null) {
          this.emit()
          return
        }
        this.loop.stop()
        this.recordWin(this.match.winner)
        this.transport.broadcast({
          t: 'over', winner: this.match.winner, matchId: this.matchId,
        })
      }
    }
    this.emit()
  }

  /**
   * 지금 Enter가 무엇을 하는가.
   *
   * 떨굴 수 있으면 물건이고, 아니면 한마디다. 코드로 모인 방이 아니면 할 말이 없어
   * 아무 일도 하지 않는다 — 그때는 화면이 칸을 잠가 헛치지 않게 한다.
   */
  private inputMode(): 'drop' | 'chat' | 'idle' {
    if (this.canDropNow()) {
      return 'drop'
    }
    return this.canPlayerChat(this.transport.selfId) ? 'chat' : 'idle'
  }

  handleTransportEvent(event: TransportEvent): void {
    switch (event.kind) {
      case 'message':
        this.handleMessage(event.from, event.message)
        break
      case 'peerLeft':
        /*
         * 결과 화면에서는 다시 진행 중인 판으로 복구할 것이 없다. 특히 호스트가 탭을
         * 닫으면 `bye`와 연결 종료가 경합해 `peerLeft`만 올 수 있는데, 이것을 연결 장애로
         * 남기면 참가자에게 응답할 상대가 없는 계속하기 버튼이 열린 채로 남는다.
         */
        if (this.match.over && this.match.players.length <= 2) {
          this.opponentLeft = true
          this.reconnecting = false
          this.connectionLost = false
          this.loop.stop()
          this.emit()
          break
        }
        // bye를 먼저 받았다면 사고가 아니라 상대가 나간 것이다. 안내를 실패로 덮지 않는다.
        if (this.opponentLeft && this.match.players.length <= 2) {
          this.loop.stop()
          this.emit()
        } else {
          this.noticeGone(event.peer)
        }
        break
      case 'error':
        this.onFailure?.(event.failure)
        break
      case 'peerJoined':
        // 유예 안에 돌아왔다. 없던 일로 하고 계속한다
        this.presence.returned(event.peer)
        /*
         * 판 도중에 새로 들어오는 길은 없으므로 돌아온 사람이다. **방장이 지금
         * 상태를 통째로 다시 보낸다** — 없는 동안 오간 것을 그 사람만 못 받았고,
         * 무엇을 놓쳤는지는 보낸 쪽도 모른다.
         */
        if (this.isHost) {
          this.resendTo(event.peer)
        }
        break
      case 'reconnecting':
        // 판을 접지 않는다. 화면이 "다시 붙는 중"을 보여주고 기다린다
        this.reconnecting = true
        this.emit()
        break
      case 'resumed':
        // 방장이 곧 지금 상태를 보내주므로 여기서는 표시만 되돌린다
        this.reconnecting = false
        this.emit()
        break
    }
  }

  /**
   * 검사용 — 지금 아레나에 있는 물건들.
   * 대전은 두 쪽의 상태가 어긋나면 승패가 갈리므로, 자동 검증이 양쪽을 대조할 통로가 필요하다.
   */
  debugBodies(): { itemId: number; variantId: string; owner: string; x: number; y: number }[] {
    return this.allFrames().map((frame) => ({
      itemId: frame.itemId,
      variantId: frame.variantId,
      owner: frame.owner,
      x: frame.x,
      y: frame.y,
    }))
  }

  /**
   * 검사용 — 아레나 밖에 물건을 만들어 이탈을 일으킨다.
   *
   * 무적은 "여러 개가 한꺼번에 벗어날 때"만 드러나는 규칙인데, 그 상황을 실제 플레이로
   * 만들려면 탑을 무너뜨려야 해서 재현이 불안정하다. 여기서는 원인을 직접 만든다.
   */
  /** 검사용 — 내 전송로 id. 이탈시킬 물건의 주인을 고르는 데 쓴다 */
  debugSelf(): PlayerId {
    return this.transport.selfId
  }

  debugEscape(owner: PlayerId, count: number): void {
    const variant = WORDS[0]?.variants[0]
    if (variant === undefined) {
      return
    }
    const world = this.worldFor(owner)
    for (let i = 0; i < count; i += 1) {
      world.spawnItemAt(
        variant,
        ARENA.halfWidth + 2 + i,
        ARENA.platformTop + 1,
        owner,
        this.nextItemId,
      )
      this.nextItemId += 1
    }
  }

  private allWorlds(): readonly PhysicsWorld[] {
    return this.duelWorlds === null ? [this.physics] : [...this.duelWorlds.values()]
  }

  private worldFor(owner: PlayerId): PhysicsWorld {
    return this.duelWorlds?.get(owner) ?? this.physics
  }

  private allFrames(): ReturnType<PhysicsWorld['frames']> {
    return this.allWorlds().flatMap((world) => [...world.frames()])
  }

  private allWeldPairs(): ReturnType<PhysicsWorld['weldPairs']> {
    return this.allWorlds().flatMap((world) => [...world.weldPairs()])
  }

  private awardWinner(winner: PlayerId | null): void {
    if (winner === null || this.awardedWinner !== null) {
      return
    }
    this.awardedWinner = winner
    this.wins.set(winner, (this.wins.get(winner) ?? 0) + 1)
    this.winsView = [...this.wins]
  }

  /** 이긴 사람에게 1점. 무승부(둘 다 같은 붕괴로 탈락)면 아무도 못 얻는다 */
  private recordWin(winner: PlayerId | null): void {
    if (this.recorded) {
      return
    }
    this.recorded = true
    this.awardWinner(winner)
    // 무승부(winner === null)는 이긴 것이 아니다
    this.fire({ kind: 'gameOver', won: winner === this.transport.selfId })
    this.winsView = [...this.wins]
    /*
     * 판이 끝나면 무적 시계가 멈춘다(update가 먼저 빠져나간다). 그대로 두면 결과
     * 화면 내내 하트에 베리어가 씌워진 채로 남는다 — 끝난 판에서 지킬 것이 없다.
     */
    this.invulnerable.clear()
    this.lastHurt = null
  }

  /** 화면에서 계속하기를 눌렀다 */
  requestRematch(): void {
    if (!this.match.over || this.opponentLeft) {
      return
    }
    if (this.isHost) {
      this.wantRematch.add(this.transport.selfId)
      this.publishRematch()
      return
    }
    this.transport.broadcast({ t: 'rematch', matchId: this.matchId })
  }

  /** 친선전 결과에서 연결과 채팅 기록을 유지한 채 준비 화면으로 돌아간다. */
  requestRoomReturn(): void {
    if (!this.match.over || !this.chatEnabled || this.opponentLeft || this.roomReturnRequested) {
      return
    }
    if (this.isHost) {
      this.transport.broadcast({ t: 'room', matchId: this.matchId })
      this.finishRoomReturn()
      return
    }
    this.transport.broadcast({ t: 'room', matchId: this.matchId })
  }

  private finishRoomReturn(): void {
    if (this.roomReturnRequested) return
    this.roomReturnRequested = true
    this.loop.stop()
    this.onReturnToRoom?.()
  }

  /** 화면에서 로비로 나가기를 눌렀다. 상대가 영문을 모른 채 기다리지 않게 알리고 나간다 */
  announceLeave(): void {
    if (this.opponentLeft) {
      return
    }
    this.transport.broadcast({ t: 'bye' })
  }

  /** 방장만 부른다. 모두 누르면 여기서 다음 판이 열린다 */
  private publishRematch(): void {
    this.rematchView = [...this.wantRematch]
    this.transport.broadcast({
      t: 'rematchList', ready: this.rematchView, matchId: this.matchId,
    })
    this.emit()

    const all = this.match.players.every((player) => this.wantRematch.has(player.id))
    if (!all || this.restartRequested) {
      return
    }
    this.restartRequested = true
    // 시드를 새로 뽑아야 다음 판에 같은 단어가 같은 순서로 되풀이되지 않는다
    const seed = Date.now() >>> 0
    this.transport.broadcast({ t: 'restart', seed, matchId: this.matchId })
    this.onRestart?.(seed)
  }

  dispose(): void {
    this.loop.stop()
    this.renderer = null
    this.listener = null
    this.events = null
    this.physics.dispose()
    for (const world of this.duelWorlds?.values() ?? []) {
      world.dispose()
    }
  }

  /** 지금 떨굴 수 있는지. 화면에 보여주는 값과 같은 기준이어야 한다 */
  private canDropNow(): boolean {
    if (this.matchMode === 'duel') {
      return !this.match.over
        && this.isDuelActive(this.transport.selfId)
        && this.cooldownOf(this.transport.selfId) <= 0
    }
    return this.match.canDrop(this.transport.selfId) && this.dropCooldown <= 0
  }

  private canPlayerDrop(id: PlayerId): boolean {
    if (this.matchMode === 'duel') {
      return !this.match.over && this.isDuelActive(id) && this.cooldownOf(id) <= 0
    }
    return this.match.canDrop(id) && this.dropCooldown <= 0
  }

  /** 남은 공유 쿨타임(초). 누구에게나 같은 값이다 */
  private waitLeft(): number {
    if (this.matchMode === 'duel') {
      return this.cooldownOf(this.transport.selfId)
    }
    return this.dropCooldown
  }

  private cooldownOf(id: PlayerId): number {
    return this.duelCooldowns.get(id) ?? 0
  }

  private isDuelActive(id: PlayerId): boolean {
    return this.match.isAlive(id) && (this.duelRace?.isActive(id) ?? true)
  }

  private canPlayerChat(id: PlayerId): boolean {
    if (!this.chatEnabled) return false
    if (this.matchMode !== 'duel') return !this.canPlayerDrop(id)
    return (this.duelRace?.resultOf(id) ?? null) !== null
  }

  /**
   * 한마디 한다.
   *
   * **방장을 거쳐서만 퍼진다.** 저마다 뿌리면 사람마다 다른 순서로 쌓이고, 거르는
   * 규칙도 여러 벌이 된다. 방장은 자기가 보낸 참가자용 메시지를 스스로 처리하지
   * 않으므로 곧바로 결과를 알린다.
   */
  sendChat(text: string): void {
    if (!this.canPlayerChat(this.transport.selfId)) {
      return
    }
    if (this.isHost) {
      this.applyChat(this.transport.selfId, text)
      return
    }
    this.transport.broadcast({ t: 'chat', text })
  }

  /** 방장이 걸러 모두에게 돌린다. 버려진 말은 퍼지지 않는다 */
  private applyChat(from: PlayerId, text: string): void {
    if (!this.isHost || !this.canPlayerChat(from)) {
      return
    }
    const line = this.chat.add(from, this.nameOf(from), text, this.chatClock())
    if (line === null) {
      return
    }
    this.transport.broadcast({ t: 'chatted', from, text: line.text })
    this.fire({ kind: 'chat', mine: from === this.transport.selfId })
    this.emit()
  }

  private nameOf(id: PlayerId): string {
    return this.match.players.find((player) => player.id === id)?.nickname ?? '이름없음'
  }

  /**
   * 시한을 넘긴 사람 대신 떨군다. **방장만 한다.**
   *
   * 자리를 비운 사람 하나에 판 전체가 멎는 것을 막는 장치다. 받침대가 하나뿐이라
   * 나머지는 나가는 것 말고 할 수 있는 일이 없다.
   *
   * 화면에 있는 단어 중 **가장 아래까지 내려온 것**을 고른다. 없는 단어를 지어내면
   * 그 사람만 다른 것을 보게 되고, 무엇보다 "떨어지는 물건은 늘 화면의 단어에서
   * 나온다"는 이 게임의 규칙이 그 한 번에 깨진다.
   *
   * **난수를 쓰지 않는다.** 난수를 끌어 쓰면 그만큼 단어와 물건의 흐름이 밀려
   * 이 한 번이 그 뒤의 판 전체를 바꾼다. 가장 아래 것은 어차피 곧 놓칠 단어이기도 하다.
   *
   * 화살표는 지금 있는 자리를 그대로 쓴다. 가운데로 옮기지 않는 것은, 자리를 비운
   * 사람에게 좋은 자리를 주는 셈이 되기 때문이다.
   */
  private dropForIdlePlayer(): void {
    const who = this.match.currentPlayer
    if (who === null) {
      return
    }
    let lowest: FallingWord | null = null
    for (const word of this.spawner.words) {
      if (word.state !== 'active') continue
      if (lowest === null || word.y > lowest.y) {
        lowest = word
      }
    }
    if (lowest === null) {
      // 칠 단어가 없으면 곧 다시 본다. 단어는 이내 내려온다
      this.turnElapsed = TURN_LIMIT_SEC - 0.5
      return
    }
    this.resolveDrop(who, lowest.word, this.aimer.worldX)
  }

  /** 내가 떨구려 한다. 방장이면 바로 판정하고, 게스트면 방장에게 청한다 */
  private requestDrop(word: string): void {
    if (this.isHost) {
      this.resolveDrop(this.transport.selfId, word, this.aimer.worldX)
      return
    }
    this.transport.broadcast({
      t: 'drop', word, aimX: this.aimer.worldX, matchId: this.matchId,
    })
  }

  /**
   * 방장만 부른다. 여기가 상대를 믿지 않는 지점이다 —
   * 자기 턴인지, 실제로 화면에 있던 단어인지, 조준이 범위 안인지 전부 확인한다.
   */
  private resolveDrop(by: PlayerId, word: string, rawAimX: number): void {
    if (!this.canPlayerDrop(by)) {
      return
    }
    const target = this.spawner.words.find(
      (candidate) => candidate.state === 'active' && candidate.word === word,
    )
    if (target === undefined) {
      return
    }
    // 대결 단어는 각자에게 배정된다. 남의 단어를 먼저 치면 상대의 시간 압박을
    // 없애는 셈이므로, 방장이 이 자리에서 거절한다.
    if (this.matchMode === 'duel' && this.duelWordOwner(target.id) !== by) {
      return
    }
    if (this.matchMode === 'duel' && this.whiteboard.has(word)) {
      this.resolveWhiteboardClaim(by, target)
      return
    }
    const aimX = clamp(rawAimX, -AIM_HALF_RANGE, AIM_HALF_RANGE)
    const variant = resolveItem(word)
    const itemId = this.nextItemId
    this.nextItemId += 1

    const spawnY = spawnYFor(this.cameraY)
    const applyAtTick = this.physicsTick + DROP_LEAD_TICKS
    this.transport.broadcast({
      t: 'dropped',
      by,
      word,
      aimX,
      spawnY,
      variantId: variant.id,
      itemId,
      applyAtTick,
      matchId: this.matchId,
    })
    this.acceptDrop(by, word, aimX, spawnY, variant.id, itemId, applyAtTick)
  }

  /** 참가자 명단에 단어 순서를 고르게 나눈다. 탈락해도 기존 단어의 주인이 바뀌지 않는다. */
  private duelWordOwner(wordId: number): PlayerId | null {
    const players = this.match.players
    if (players.length === 0) return null
    return players[(wordId - 1) % players.length]?.id ?? null
  }

  /** 만료된 내 단어는 기본 물건으로 내 필드에 자동 반입된다. */
  private dropExpiredDuelWord(word: FallingWord): void {
    const by = this.duelWordOwner(word.id)
    if (by === null || !this.isDuelActive(by)) return
    const entry = WORDS.find((candidate) => candidate.word === word.word)
    const variant = entry?.variants[0]
    if (variant === undefined) return
    const itemId = this.nextItemId
    this.nextItemId += 1
    const spawnY = spawnYFor(this.cameraY)
    const applyAtTick = this.physicsTick + DROP_LEAD_TICKS
    this.transport.broadcast({
      t: 'dropped', by, word: word.word, aimX: this.aimer.worldX, spawnY,
      variantId: variant.id, itemId, applyAtTick, matchId: this.matchId,
    })
    this.acceptDrop(by, word.word, this.aimer.worldX, spawnY, variant.id, itemId, applyAtTick)
  }

  private resolveWhiteboardClaim(by: PlayerId, target: FallingWord): void {
    const index = this.whiteboard.words.indexOf(target.word)
    if (index < 0 || !this.whiteboard.claim(target.word, WORDS, this.focusedRecipeWords)) return

    this.recordWordClaim(target, by, true)
    this.spawner.remove(target.id)
    this.match.setLives(by, Math.min(LIVES, this.match.livesOf(by) + 1))
    this.duelCooldowns.set(by, DROP_INTERVAL_SEC)
    this.whiteboardWords = this.whiteboard.words
    this.spawner.prefer(this.whiteboardWords)
    this.heartReward = {
      seq: ++this.heartRewardSeq,
      player: by,
      word: target.word,
      index,
    }
    this.transport.broadcast({
      t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
    })
    this.broadcastDuelWhiteboard(this.heartReward)
    if (by === this.transport.selfId) {
      this.feedbackSeq += 1
      this.feedback = {
        seq: this.feedbackSeq,
        text: target.word,
        kind: 'dropped',
        itemLabel: '하트',
        hidden: false,
      }
    }
    this.emit()
  }

  private broadcastDuelWhiteboard(reward: DuelHeartReward | null = null): void {
    this.transport.broadcast({
      t: 'duelWhiteboard',
      words: this.whiteboardWords,
      ...(reward === null ? {} : { reward }),
      matchId: this.matchId,
    })
  }

  /** 양쪽이 똑같이 실행하는 부분. 단어·턴은 바로 확정하고 물리 생성만 tick에 맞춘다. */
  private acceptDrop(
    by: PlayerId,
    word: string,
    aimX: number,
    spawnY: number,
    variantId: string,
    itemId: number,
    applyAtTick: number | null,
  ): void {
    const variant = VARIANT_BY_ID.get(variantId)
    if (variant === undefined) {
      return
    }
    const target = this.spawner.words.find(
      (candidate) => candidate.state === 'active' && candidate.word === word,
    )
    if (target !== undefined) {
      this.recordWordClaim(target, by)
      this.spawner.remove(target.id)
    }

    this.scheduleDrop({ by, word, aimX, spawnY, variantId, itemId, applyAtTick })
    // 양쪽이 다 지나는 자리다 — 상대가 떨군 것도 소리로 들린다
    this.fire({
      kind: 'drop',
      source: 'input',
      hidden: false,
      material: variant.material,
      tone: variant.tone,
    })
    /*
     * 차례를 넘기고 모두가 함께 쓰는 쿨타임을 건다.
     *
     * 앞사람의 물건이 **자리를 잡기를 기다리지는 않는다.** 기다리게 하면 구르는
     * 물건 하나에 판 전체가 몇 초씩 멈춘다. 쿨타임이 끝나는 순간 다음 사람이 친다.
     */
    if (this.matchMode !== 'duel') {
      this.match.nextTurn()
      this.dropCooldown = DROP_INTERVAL_SEC
    } else {
      this.duelCooldowns.set(by, DROP_INTERVAL_SEC)
    }
    this.turnElapsed = 0

    if (by === this.transport.selfId) {
      this.feedbackSeq += 1
      this.feedback = {
        seq: this.feedbackSeq,
        text: word,
        kind: 'dropped',
        itemLabel: variant.label,
        hidden: false,
      }
    }
    this.emit()
  }

  private recordWordClaim(target: FallingWord, by: PlayerId, lifeReward = false): void {
    if (this.matchMode !== 'duel') return
    this.wordClaims = [
      ...this.wordClaims.filter((claim) => claim.expiresAt > this.elapsed),
      {
        seq: ++this.wordClaimSeq,
        by,
        word: target.word,
        side: target.side,
        slot: target.slot,
        y: target.y,
        lifeReward,
        expiresAt: this.elapsed + DUEL_WORD_CLAIM_SEC,
      },
    ].slice(-MAX_ON_SCREEN)
  }

  private scheduleDrop(drop: ScheduledDrop): void {
    if (drop.applyAtTick === null || drop.applyAtTick <= this.physicsTick) {
      this.spawnScheduledDrop(drop)
      return
    }
    this.pendingDrops.push(drop)
    this.pendingDrops.sort((a, b) => (a.applyAtTick ?? 0) - (b.applyAtTick ?? 0))
  }

  private spawnScheduledDrops(): void {
    while (this.pendingDrops.length > 0) {
      const next = this.pendingDrops[0]!
      if (next.applyAtTick !== null && next.applyAtTick > this.physicsTick) {
        return
      }
      this.pendingDrops.shift()
      this.spawnScheduledDrop(next)
    }
  }

  private spawnScheduledDrop(drop: ScheduledDrop): void {
    const variant = VARIANT_BY_ID.get(drop.variantId)
    if (variant === undefined) {
      return
    }
    const world = this.worldFor(drop.by)
    if (world.frames().some((frame) => frame.itemId === drop.itemId)) {
      return
    }
    world.spawnItemAt(variant, drop.aimX, drop.spawnY, drop.by, drop.itemId)
    if (this.isHost && this.matchMode !== 'duel') {
      this.pendingSettledSync.add(drop.itemId)
    }
  }

  private handleMessage(from: PlayerId, message: Message): void {
    if (!this.isHost && HOST_MESSAGES.has(message.t) && from !== this.presence.host) {
      return
    }
    if ('matchId' in message && message.matchId !== undefined && message.matchId !== this.matchId) {
      return
    }
    switch (message.t) {
      case 'drop':
        // 게스트가 보낸 청. 방장만 처리하고, 검증은 resolveDrop이 한다
        if (this.isHost) {
          if (message.matchId === undefined && this.elapsed < LEGACY_COMMAND_GRACE_SEC) return
          this.resolveDrop(from, message.word, message.aimX)
        }
        break
      case 'dropped':
        if (!this.isHost) {
          this.acceptDrop(
            message.by,
            message.word,
            message.aimX,
            message.spawnY ?? spawnYFor(this.cameraY),
            message.variantId,
            message.itemId,
            message.applyAtTick ?? null,
          )
        }
        break
      case 'chat':
        // 거르는 것은 방장의 일이다. 참가자가 보낸 것은 여기서 한 번만 통과한다
        this.applyChat(from, message.text)
        break
      case 'chatted':
        if (!this.isHost) {
          this.chat.add(message.from, this.nameOf(message.from), message.text, this.chatClock())
          this.fire({ kind: 'chat', mine: message.from === this.transport.selfId })
          this.emit()
        }
        break
      case 'words':
        if (!this.isHost) {
          this.spawner.apply(message.words)
          this.emit()
        }
        break
      case 'lives':
        // 목숨은 방장이 정한 값을 그대로 따른다
        if (!this.isHost) {
          this.applyLives(message.lives)
        }
        break
      case 'duelWhiteboard':
        if (!this.isHost && this.matchMode === 'duel') {
          this.whiteboardWords = message.words
          this.spawner.prefer(this.whiteboardWords)
          if (message.reward !== undefined && message.reward.seq > (this.heartReward?.seq ?? 0)) {
            this.heartReward = message.reward
            const claimed = this.spawner.words.find((word) => (
              word.state === 'active' && word.word === message.reward?.word
            ))
            if (claimed !== undefined) {
              this.recordWordClaim(claimed, message.reward.player, true)
              this.spawner.remove(claimed.id)
            }
          }
          this.emit()
        }
        break
      case 'duelResults':
        if (!this.isHost && this.duelRace !== null) {
          this.applyDuelResults(message.results)
          this.emit()
        }
        break
      case 'sync':
        if (!this.isHost) {
          if (this.duelWorlds === null && message.tick !== undefined) {
            this.physicsTick = message.tick
            this.pendingDrops.sort((a, b) => (a.applyAtTick ?? 0) - (b.applyAtTick ?? 0))
          }
          if (this.duelWorlds === null) {
            const corrections = this.physics.applyFrames(
              message.bodies,
              (id) => VARIANT_BY_ID.get(id),
              message.welds,
            )
            this.bodyCorrection.note(corrections)
          } else {
            // 재연결 복구에서만 방장이 보관한 내 판을 받는다. 평소 정본은 판 주인이다.
            this.applyDuelBoardFrames(
              this.transport.selfId,
              message.bodies,
              message.welds,
            )
          }
          this.emit()
        }
        break
      case 'duelBoardState':
        this.applyDuelBoardState(from, message)
        break
      case 'over':
        if (!this.isHost) {
          this.loop.stop()
          if (!this.match.over) {
            this.match.finishWithWinner(message.winner)
          }
          this.standingsView = this.duelRace?.results.map(({ id, placement }) => ({ id, placement }))
            ?? this.match.standings()
          this.recordWin(message.winner)
          this.emit()
        }
        break
      case 'rematch':
        if (this.isHost && this.match.over) {
          this.wantRematch.add(from)
          this.publishRematch()
        }
        break
      case 'rematchList':
        if (!this.isHost) {
          this.wantRematch.clear()
          for (const id of message.ready) {
            this.wantRematch.add(id)
          }
          this.rematchView = [...this.wantRematch]
          this.emit()
        }
        break
      case 'restart':
        if (!this.isHost) {
          this.onRestart?.(message.seed)
        }
        break
      case 'room':
        if (!this.match.over || !this.chatEnabled) break
        if (this.isHost) {
          this.transport.broadcast({ t: 'room', matchId: this.matchId })
        }
        this.finishRoomReturn()
        break
      case 'bye':
        /*
         * 사고가 아니라 그 사람의 선택이다. 둘일 때는 남은 사람에게 나가는 길만
         * 열어주면 되지만, 여럿이면 나머지는 계속한다 — 처리는 끊긴 것과 같다.
         */
        if (this.match.players.length <= 2) {
          this.opponentLeft = true
          this.loop.stop()
          this.emit()
          break
        }
        this.noticeGone(from)
        break
      case 'left':
        // 판정은 방장이 한다. 참가자는 결과만 따른다
        if (!this.isHost) {
          this.applyLeft(message.who)
        }
        break
      default:
        break
    }
  }

  private applyLives(lives: readonly (readonly [PlayerId, number])[]): void {
    /*
     * **참가자 쪽에서도 회차를 올린다.** 방장에서만 올리면 참가자의 모든 탈락이 한
     * 회차에 묶여 전부 공동 등수가 된다 — 실제로 방장은 1·2·3위를 보는데 참가자는
     * 1·2·2위를 봤다. `lives` 한 통이 곧 한 번의 판정이다.
     */
    this.match.startDeathBatch()
    for (const [id, count] of lives) {
      // 방장이 보낸 값과 견줘 **누가** 잃었는지를 알아낸다 — 연출에 필요한 것이 그것이다
      const before = this.match.livesOf(id)
      this.match.setLives(id, count)
      /*
       * 한 칸 넘게 잃었을 때만 "무너졌다"로 본다. 노림은 반 칸이고 그 알림은
       * 따로 있으므로, 여기서까지 무적을 주면 노림이 연달아 막힌다.
       */
      if (before - count >= 1) {
        this.markHurt(id)
      }
    }
    if (this.duelRace === null) {
      this.standingsView = this.match.standings()
    }
    /*
     * 차례인 사람이 방금 탈락했으면 넘긴다 — 안 그러면 죽은 사람 차례에서 판이 멈춘다.
     * 차례가 남에게 넘어갔으니 시한도 처음부터다. 되돌리지 않으면 방금 받은 사람이
     * 앞사람이 쓰던 시간을 이어받아, 손도 대기 전에 대신 떨궈진다.
     */
    this.match.ensureTurnAlive()
    this.turnElapsed = 0
    this.emit()
  }

  /**
   * 목숨을 잃은 직후 잠깐 무적을 준다.
   *
   * 탑이 한 번 무너지면 그 사람의 물건이 줄줄이 벗어난다. 그때마다 깎으면 목숨 셋이
   * 한순간에 날아가 만회할 틈이 없다. 방장은 이 값으로 판정하고, 양쪽 다 화면에 그린다.
   */
  private markHurt(owner: PlayerId): void {
    this.invulnerable.set(owner, INVULNERABLE_SEC)
    this.lastHurt = owner
    // 방장은 판정에서, 참가자는 lives 메시지에서 여기로 온다 — 소리는 한 자리에만 둔다
    this.fire({ kind: 'lifeLost', livesLeft: this.match.livesOf(owner) })
  }

  /**
   * 화면에 넘길 남은 비율. 아무도 무적이 아니면 **같은 빈 배열을 돌려준다** —
   * 매 프레임 새 배열을 만들면 그것만으로 쓰레기가 쌓인다.
   */
  private invulnerableRatios(): readonly (readonly [PlayerId, number])[] {
    if (this.invulnerable.size === 0) {
      return NO_INVULNERABLE
    }
    const ratios: [PlayerId, number][] = []
    for (const [id, left] of this.invulnerable) {
      ratios.push([id, left / INVULNERABLE_SEC])
    }
    return ratios
  }

  private isInvulnerable(owner: PlayerId): boolean {
    return (this.invulnerable.get(owner) ?? 0) > 0
  }

  private tickInvulnerable(dt: number): void {
    for (const [id, left] of this.invulnerable) {
      const next = left - dt
      if (next <= 0) {
        this.invulnerable.delete(id)
        if (this.lastHurt === id) {
          this.lastHurt = null
        }
      } else {
        this.invulnerable.set(id, next)
      }
    }
  }

  private readonly update = (dt: number): void => {
    this.bodyCorrection.advance(dt)
    for (const correction of this.duelBodyCorrections.values()) {
      correction.advance(dt)
    }
    const cameraTop = this.matchMode === 'duel'
      ? Math.max(
          ARENA.platformTop,
          ...this.match.players
            .filter((player) => this.isDuelActive(player.id))
            .map((player) => this.duelStackTops.get(player.id) ?? ARENA.platformTop),
        )
      : this.physics.stackTop()
    this.cameraY = followCameraY(this.cameraY, cameraTop, dt)
    // 판이 끝난 뒤에도 색은 계속 사라져야 한다 — 그리기가 매 프레임 이어지므로
    this.landing.advance(dt)
    // 지난 프레임의 부딪힘은 이미 그려졌다
    this.frameImpacts.length = 0
    if (this.match.over || this.connectionLost) {
      return
    }

    this.fixedAccumulator = Math.min(
      this.fixedAccumulator + dt,
      FIXED_STEP_SEC * MAX_FIXED_STEPS,
    )
    while (this.fixedAccumulator >= FIXED_STEP_SEC) {
      this.fixedAccumulator -= FIXED_STEP_SEC
      this.updateFixed(FIXED_STEP_SEC)
      if (this.match.over || this.connectionLost) {
        break
      }
    }
    this.noticeTurn()
    this.emit()
  }

  private updateFixed(dt: number): void {
    this.elapsed += dt

    if (this.wordClaims.some((claim) => claim.expiresAt <= this.elapsed)) {
      this.wordClaims = this.wordClaims.filter((claim) => claim.expiresAt > this.elapsed)
    }

    // 모두가 함께 쓰는 쿨타임. 0이 되는 순간이 곧 다음 차례 사람의 시작이다
    if (this.dropCooldown > 0) {
      this.dropCooldown = Math.max(0, this.dropCooldown - dt)
    }
    for (const [id, left] of this.duelCooldowns) {
      const next = left - dt
      if (next <= 0) {
        this.duelCooldowns.delete(id)
      } else {
        this.duelCooldowns.set(id, next)
      }
    }

    /*
     * 차례 시계. 쿨타임이 도는 동안에는 아직 아무도 칠 수 없으므로 세지 않는다 —
     * 그러지 않으면 실제로 손이 갈 수 있는 시간이 시한보다 짧아진다.
     */
    if (this.isHost) {
      this.sweepGone()
    }

    if (this.matchMode !== 'duel' && this.dropCooldown <= 0 && this.match.currentPlayer !== null) {
      this.turnElapsed += dt
      if (this.isHost && this.turnElapsed >= TURN_LIMIT_SEC) {
        this.dropForIdlePlayer()
      }
    }

    /*
     * 난이도는 쌓은 높이를 따라간다. 한 번 오른 뒤에는 내려가지 않는다 —
     * 탑이 무너질 때마다 단어가 뜸해졌다 몰아쳤다 하면 무엇이 기준인지 알 수 없다.
     */
    const top = this.duelWorlds === null
      ? this.physics.stackTop()
      : Math.max(ARENA.platformTop, ...this.duelStackTops.values())
    this.difficultyPeak = Math.max(this.difficultyPeak, difficultyProgress(top))
    /*
     * 사람이 많을수록 단어를 더 많이, 더 자주 내보낸다. 차례를 기다리는 사람들이
     * 덫을 걸 단어가 있어야 손이 멈추지 않는다 — 그것이 이 게임에서 가장 큰 대가다.
     */
    const difficulty = difficultyForMatch(
      difficultyAt(this.difficultyPeak),
      this.match.players.length,
      this.matchMode,
    )
    this.tickInvulnerable(dt)
    this.aimer.update(dt, difficulty.aimSpeed)
    /*
     * 단어 밭은 방장이 소유한다. 참가자의 스포너는 따라가기만 하고 스스로 내지 않는다 —
     * 난이도가 쌓은 높이를 따라가는데 그 높이가 양쪽에서 미세하게 어긋나서,
     * 시드를 맞춰도 나오는 순간이 결국 갈린다.
     */
    if (this.isHost && this.matchMode === 'duel') {
      this.syncDuelRecipeGuidance()
    }
    const missedWords = this.spawner.update(dt, difficulty)
    if (this.isHost && this.matchMode === 'duel') {
      for (const word of missedWords) this.dropExpiredDuelWord(word)
    }

    this.spawnScheduledDrops()
    let ownedEscaped: readonly PlayerId[] = []
    const stepped = this.duelWorlds === null
      ? [this.physics.step(dt)]
      : [...this.duelWorlds].map(([owner, world]) => {
          const result = world.step(dt)
          if (owner === this.transport.selfId) {
            /*
             * 대결 보드는 주인별로 분리되어 있지만 동기화 오류로 다른 소유자의 바디가
             * 섞여도 그 이탈을 이 보드의 패배로 보고하지 않는다. 방장은 보고 개수를
             * 보드 주인에게 귀속하므로 여기서 소유권을 한 번 더 확인해야 한다.
             */
            ownedEscaped = result.escaped
              .filter((event) => event.owner === owner)
              .map((event) => event.owner)
          }
          return result
        })
    this.physicsTick += 1
    const escapedOwners = this.duelWorlds === null
      ? stepped.flatMap((result) => result.escaped.map((event) => event.owner))
      : ownedEscaped
    if (this.duelWorlds !== null) {
      this.duelStackTops.set(
        this.transport.selfId,
        this.worldFor(this.transport.selfId).stackTop(),
      )
      this.duelMergeCheckElapsed += dt
      if (this.duelMergeCheckElapsed >= MERGE_CHECK_INTERVAL_SEC) {
        this.duelMergeCheckElapsed %= MERGE_CHECK_INTERVAL_SEC
        this.tryDuelMerge()
      }
    }
    let quake = 0
    for (const result of stepped) {
      quake = Math.max(quake, result.quake)
      this.landing.note(result.impacts)
      for (const hit of result.impacts) {
        this.frameImpacts.push(trailHitOf(hit))
        this.fire(impactEventOf(hit))
      }
    }
    const shake = quakeEventOf(quake)
    if (shake !== null) {
      this.fire(shake)
    }

    if (this.isHost) {
      this.broadcastWordsIfChanged()
      this.hostJudge(dt, escapedOwners)
    }
    if (this.duelWorlds !== null && this.isDuelActive(this.transport.selfId)) {
      this.sinceDuelBoardSync += dt
      if (escapedOwners.length > 0 || this.sinceDuelBoardSync >= DUEL_BOARD_SYNC_INTERVAL_SEC) {
        this.broadcastDuelBoardState(escapedOwners.length)
      }
    }
  }

  /**
   * 떨굴 수 있게 된 순간을 알린다.
   *
   * 대전에서 가장 놓치기 쉬운 정보다 — 내 차례는 상대의 물건이 멈춘 뒤 조용히
   * 시작되는데, 그때 눈은 내려오는 단어를 쫓고 있다. 소리가 없으면 몇 초를 그냥 흘린다.
   */
  private noticeTurn(): void {
    if (this.matchMode === 'duel') {
      this.announcedCanDrop = this.canDropNow()
      return
    }
    const canDrop = this.canDropNow()
    if (canDrop !== this.announcedCanDrop) {
      this.announcedCanDrop = canDrop
      if (canDrop) {
        this.fire({ kind: 'turn' })
      }
    }
  }

  /** 밭이 바뀐 프레임에만 보낸다. 매 프레임 흘리면 무료 전송로의 한도를 태운다 */
  private broadcastWordsIfChanged(): void {
    if (this.spawner.version === this.sentWordVersion) {
      return
    }
    this.sentWordVersion = this.spawner.version
    this.transport.broadcast({
      t: 'words', words: this.spawner.words, matchId: this.matchId,
    })
  }

  private tryDuelMerge(): void {
    if (this.duelWorlds === null || !this.isDuelActive(this.transport.selfId)) return
    const owner = this.transport.selfId
    const world = this.worldFor(owner)
    const candidateKeys = mergeCandidateKeys(RECIPES, world.countsByVariant())
    if (candidateKeys.size === 0) return
    const match = findMerge(
      world.contactGraph((variantId) => candidateKeys.has(craftKeyOf(variantId))),
      RECIPES,
    )
    if (match === null) return

    const result = resolveCrafted(match.recipe, this.duelRng)
    const itemId = ++this.nextMergedItemId
    if (world.mergeItems(match.itemIds, result, owner, itemId) === null) return

    this.recipeFlows.get(owner)?.onMerged(match.recipe)
    this.pendingMergedRecipes.push(match.recipe.id)
    this.mergeFeedback = {
      seq: ++this.mergeFeedbackSeq,
      itemLabel: result.label,
      ingredientCount: match.recipe.inputs.length,
    }
    this.growDuelLedge(world)
    this.fire({ kind: 'merge' })
    this.sinceDuelBoardSync = DUEL_BOARD_SYNC_INTERVAL_SEC
  }

  private growDuelLedge(world: PhysicsWorld): void {
    const items = world.frames().flatMap((frame) => {
      const variant = VARIANT_BY_ID.get(frame.variantId)
      if (variant === undefined) return []
      const { hw, hh } = shapeBounds(variant.shape)
      return [{ x: frame.x, y: frame.y, hw, hh }]
    })
    const ledges = world.ledges().map((ledge) => ({
      ...ledge,
      hw: ledge.halfWidth,
      hh: LEDGE.halfHeight,
    }))
    const spot = placeLedge(items, ledges, world.stackTop(), this.duelRng)
    if (spot !== null) world.addLedge(spot.x, spot.y, spot.halfWidth)
  }

  private marksFor(owner: PlayerId): ReadonlyMap<string, number> {
    if (this.matchMode !== 'duel') return NO_MARKS
    const world = this.worldFor(owner)
    if (
      this.duelMarkPhysicsVersions.get(owner) === world.version &&
      this.duelMarkWordVersions.get(owner) === this.spawner.version
    ) {
      return this.duelMarks.get(owner) ?? NO_MARKS
    }
    const counts = new Map(world.countsByVariant())
    for (const falling of this.spawner.words) {
      if (falling.state !== 'active') continue
      const id = WORD_BASE_ID.get(falling.word)
      if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const marks = pairMarks(counts, RECIPES, this.duelMarks.get(owner) ?? NO_MARKS)
    this.duelMarks.set(owner, marks)
    this.duelMergeSizes.set(owner, pairSizes(counts, RECIPES, marks))
    this.duelMarkPhysicsVersions.set(owner, world.version)
    this.duelMarkWordVersions.set(owner, this.spawner.version)
    return marks
  }

  private mergeSizesFor(owner: PlayerId): ReadonlyMap<string, number> {
    this.marksFor(owner)
    return this.duelMergeSizes.get(owner) ?? NO_MARKS
  }

  private wordMarksFor(owner: PlayerId): ReadonlyMap<string, number> {
    const marks = this.marksFor(owner)
    if (marks.size === 0) return NO_MARKS
    const byWord = new Map<string, number>()
    for (const falling of this.spawner.words) {
      const id = WORD_BASE_ID.get(falling.word)
      const mark = id === undefined ? undefined : marks.get(id)
      if (mark !== undefined) byWord.set(falling.word, mark)
    }
    return byWord
  }

  private wordMergeSizesFor(owner: PlayerId): ReadonlyMap<string, number> {
    const sizes = this.mergeSizesFor(owner)
    if (sizes.size === 0) return NO_MARKS
    const byWord = new Map<string, number>()
    for (const falling of this.spawner.words) {
      const id = WORD_BASE_ID.get(falling.word)
      const size = id === undefined ? undefined : sizes.get(id)
      if (size !== undefined) byWord.set(falling.word, size)
    }
    return byWord
  }

  private wordMergeHintsFor(owner: PlayerId): ReadonlyMap<string, readonly MergeHint[]> {
    const marks = this.marksFor(owner)
    if (marks.size === 0) return NO_MERGE_HINTS
    const partners = pairPartners(marks, new Map(this.worldFor(owner).countsByVariant()))
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

  /** 현재 권위 물리 상태를 보낸다. */
  private broadcastAuthoritySync(): void {
    this.transport.broadcast({
      t: 'sync',
      bodies: this.allFrames(),
      welds: this.allWeldPairs(),
      tick: this.physicsTick,
      matchId: this.matchId,
    })
    this.sinceSync = 0
  }

  /** 대결에서는 각 참가자가 자기 게임판의 물리 정본을 직접 배포한다. */
  private broadcastDuelBoardState(escaped: number): void {
    if (this.duelWorlds === null) return
    const owner = this.transport.selfId
    const world = this.worldFor(owner)
    this.transport.broadcast({
      t: 'duelBoardState',
      owner,
      bodies: world.frames(),
      welds: world.weldPairs(),
      ledges: world.ledges(),
      mergedRecipes: [...this.pendingMergedRecipes],
      tick: this.physicsTick,
      escaped,
      matchId: this.matchId,
    })
    this.pendingMergedRecipes.length = 0
    this.sinceDuelBoardSync = 0
  }

  private applyDuelBoardFrames(
    owner: PlayerId,
    bodies: readonly BodyFrame[],
    welds: readonly (readonly [number, number])[],
  ): void {
    const world = this.duelWorlds?.get(owner)
    if (world === undefined) return
    const ownedBodies = bodies.filter((frame) => frame.owner === owner)
    const bodyIds = new Set(ownedBodies.map((frame) => frame.itemId))
    const ownedWelds = welds.filter(([a, b]) => bodyIds.has(a) && bodyIds.has(b))
    const corrections = world.applyFrames(
      ownedBodies,
      (id) => VARIANT_BY_ID.get(id),
      ownedWelds,
    )
    this.duelBodyCorrections.get(owner)?.note(corrections)
  }

  private applyDuelBoardState(
    from: PlayerId,
    message: Extract<Message, { readonly t: 'duelBoardState' }>,
  ): void {
    if (
      this.duelWorlds === null ||
      (message.owner !== from && (this.isHost || from !== this.presence.host)) ||
      message.owner === this.transport.selfId ||
      !this.match.players.some((player) => player.id === message.owner)
    ) return
    const owner = message.owner
    const previousTick = this.duelBoardTicks.get(owner) ?? -1
    if (message.tick <= previousTick) return
    this.duelBoardTicks.set(owner, message.tick)
    this.applyDuelBoardFrames(owner, message.bodies, message.welds)
    const world = this.worldFor(owner)
    if (message.ledges !== undefined) {
      const currentLedges = world.ledges()
      const ledgesChanged = currentLedges.length !== message.ledges.length || message.ledges.some(
        (ledge, index) => {
          const current = currentLedges[index]
          return current === undefined || current.x !== ledge.x || current.y !== ledge.y ||
            current.halfWidth !== ledge.halfWidth
        },
      )
      if (ledgesChanged) world.replaceLedges(message.ledges)
    }
    if (this.isHost) {
      const flow = this.recipeFlows.get(owner)
      for (const recipeId of message.mergedRecipes ?? []) {
        const recipe = RECIPES.find((candidate) => candidate.id === recipeId)
        if (recipe !== undefined) flow?.onMerged(recipe)
      }
      this.transport.broadcast(message)
    }
    this.duelStackTops.set(owner, world.stackTop())
    if (this.isHost && message.escaped > 0 && this.isDuelActive(owner)) {
      const pending = this.pendingDuelEscapes.get(owner) ?? 0
      this.pendingDuelEscapes.set(owner, Math.min(MAX_ON_SCREEN, pending + message.escaped))
    }
    this.emit()
  }

  /** 새 방장이 되거나 복귀자를 맞출 때 현재 권위 상태를 즉시 다시 선언한다. */
  private broadcastAuthorityState(): void {
    this.sentWordVersion = this.spawner.version
    this.transport.broadcast({
      t: 'words', words: this.spawner.words, matchId: this.matchId,
    })
    this.transport.broadcast({
      t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
    })
    if (this.duelRace !== null) {
      this.broadcastDuelWhiteboard()
      this.transport.broadcast({
        t: 'duelResults', results: this.duelRace.results, matchId: this.matchId,
      })
      this.broadcastDuelBoardState(0)
      return
    }
    this.broadcastAuthoritySync()
  }

  private applyDuelResults(results: readonly DuelResult[]): void {
    if (this.duelRace === null) return
    const previous = new Set(this.duelRace.results.map((result) => result.id))
    this.duelRace.apply(results)
    for (const result of this.duelRace.results) {
      if (!previous.has(result.id)) {
        this.duelFinishedAt.set(result.id, this.elapsed)
      }
    }
    this.standingsView = this.duelRace.results.map(({ id, placement }) => ({ id, placement }))
    this.awardWinner(this.duelRace.winner())
  }

  private publishDuelResults(): void {
    if (this.duelRace === null || !this.isHost) return
    for (const result of this.duelRace.results) {
      if (!this.duelFinishedAt.has(result.id)) {
        this.duelFinishedAt.set(result.id, this.elapsed)
      }
    }
    this.standingsView = this.duelRace.results.map(({ id, placement }) => ({ id, placement }))
    this.awardWinner(this.duelRace.winner())
    this.transport.broadcast({
      t: 'duelResults', results: this.duelRace.results, matchId: this.matchId,
    })
  }

  /**
   * 드롭 직후가 아니라 **놓인 뒤** 한 번 맞춘다.
   *
   * 낙하 중에 계속 보정하면 비호스트 화면에서 물건이 되감기며 다시 떨어지는 것처럼 보인다.
   * 그래서 방장이 만든 물건이 정착했거나, 바깥으로 나가 사라진 뒤에만 전체 권위 상태를 보낸다.
   */
  private broadcastSettledDropSync(): boolean {
    if (this.pendingSettledSync.size === 0) {
      return false
    }
    const byItem = new Map(this.allFrames().map((frame) => [frame.itemId, frame]))
    let shouldSync = false
    for (const itemId of [...this.pendingSettledSync]) {
      const frame = byItem.get(itemId)
      if (
        frame === undefined ||
        (frame.stateVersion === 1 && (frame.settled || frame.sleeping || frame.lost))
      ) {
        this.pendingSettledSync.delete(itemId)
        shouldSync = true
      }
    }
    if (shouldSync) {
      this.broadcastAuthoritySync()
    }
    return shouldSync
  }

  /** 심판은 방장만 본다 — 목숨과 턴은 한 곳에서만 정해져야 한다 */
  private hostJudge(dt: number, escaped: readonly PlayerId[]): void {
    let duelChanged = false
    if (this.duelRace !== null) {
      const finishers = this.duelGoalFinishers()
      if (finishers.length > 0) {
        this.duelRace.finishGoals(finishers)
        duelChanged = true
      }
    }

    let anyLost = false
    // 이번 판정에 함께 죽는 사람들은 공동 등수다
    this.match.startDeathBatch()
    const escapedOwners = this.duelRace === null
      ? escaped
      : [
          ...escaped,
          ...[...this.pendingDuelEscapes].flatMap(([owner, count]) => Array(count).fill(owner)),
        ]
    this.pendingDuelEscapes.clear()
    for (const owner of escapedOwners) {
      if (this.duelRace !== null && !this.duelRace.isActive(owner)) {
        continue
      }
      // 무적인 사람의 물건은 세계에서 치우되 목숨은 깎지 않는다
      if (this.isInvulnerable(owner)) {
        continue
      }
      this.match.loseLife(owner)
      this.markHurt(owner)
      anyLost = true
    }
    if (anyLost) {
      if (this.duelRace !== null) {
        const eliminated = this.match.players
          .filter((player) => this.duelRace!.isActive(player.id) && !this.match.isAlive(player.id))
          .map((player) => player.id)
        if (this.duelRace.eliminate(eliminated).length > 0) {
          duelChanged = true
        }
      } else {
        this.standingsView = this.match.standings()
      }
      // 참가자도 같은 순서로 건너뛰도록 양쪽이 똑같이 부른다
      this.match.ensureTurnAlive()
      this.turnElapsed = 0
      this.transport.broadcast({
        t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
      })
    }

    if (this.duelRace !== null) {
      if (duelChanged) {
        this.publishDuelResults()
      }
      if (this.finishDuelIfReady()) {
        return
      }
      return
    } else if (this.match.over) {
      this.loop.stop()
      this.recordWin(this.match.winner)
      this.transport.broadcast({
        t: 'over', winner: this.match.winner, matchId: this.matchId,
      })
      return
    }

    /*
     * 키프레임을 일정 간격으로 보낸다.
     *
     * 예전에는 턴이 끝날 때 보냈다. 턴이 사라지면서 "끝나는 지점"이 없어졌는데,
     * 물리는 양쪽에서 따로 돌기 때문에 맞춰주지 않으면 서서히 벌어진다.
     * 매 프레임 흘리면 무료 전송로의 한도를 태우므로 간격을 둔다.
     */
    const settledSynced = this.broadcastSettledDropSync()
    if (!settledSynced) {
      this.sinceSync += dt
    }
    if (this.sinceSync >= SYNC_INTERVAL_SEC) {
      this.broadcastAuthoritySync()
    }
  }

  private duelGoalFinishers(): readonly PlayerId[] {
    if (this.duelRace === null) return []
    return this.match.players
      .filter((player) => (
        this.isDuelActive(player.id) &&
        (this.duelStackTops.get(player.id) ?? ARENA.platformTop) >= DUEL_TARGET_STACK_TOP
      ))
      .sort((a, b) => (
        (this.duelStackTops.get(b.id) ?? ARENA.platformTop) -
        (this.duelStackTops.get(a.id) ?? ARENA.platformTop)
      ))
      .map((player) => player.id)
  }

  private finishDuelIfReady(): boolean {
    if (this.duelRace === null || this.duelRace.activeCount > 1) return false
    if (this.duelRace.settleLast() !== null) {
      this.publishDuelResults()
    }
    const winner = this.duelRace.winner()
    this.match.finishWithWinner(winner)
    this.loop.stop()
    this.recordWin(winner)
    this.transport.broadcast({ t: 'over', winner, matchId: this.matchId })
    return true
  }

  private readonly render = (): void => {
    if (this.matchMode === 'duel') {
      const visible = this.visibleDuelIds()
      const towers = visible.map((id) => {
        const world = this.worldFor(id)
        const stackTop = world.stackTop()
        const bodies = this.duelBodyCorrections.get(id)?.apply(world.snapshots())
          ?? world.snapshots()
        const player = this.match.players.find((candidate) => candidate.id === id)
        const result = this.duelRace?.resultOf(id) ?? null
        const finishedAt = this.duelFinishedAt.get(id)
        return {
          id,
          nickname: player?.nickname ?? '이름없음',
          mine: id === this.transport.selfId,
          bodies,
          aimX: this.aimer.worldX,
          showAim: id === this.transport.selfId
            && !this.match.over
            && this.isDuelActive(this.transport.selfId),
          cameraY: this.cameraY,
          stackTop,
          lives: this.match.livesOf(id),
          ledges: world.ledges(),
          pairMarks: this.marksFor(id),
          pairSizes: this.mergeSizesFor(id),
          pairPulse: pairPulse(this.elapsed),
          result,
          exitProgress: finishedAt === undefined
            ? 0
            : clamp((this.elapsed - finishedAt) / DUEL_TOWER_EXIT_SEC, 0, 1),
          ownerColors: this.ownerColors,
        }
      })
      this.renderer?.draw({
        bodies: [],
        aimX: 0,
        showAim: false,
        landing: this.landing.view,
        nightfall: this.nightfall,
        cameraY: this.cameraY,
        stackTop: this.worldFor(this.transport.selfId).stackTop(),
        time: this.elapsed,
        impacts: this.frameImpacts,
        ownerColors: this.ownerColors,
        duelTowers: towers,
        duelGoalY: DUEL_TARGET_STACK_TOP,
      })
      return
    }

    const bodies = this.isHost
      ? this.physics.snapshots()
      : this.bodyCorrection.apply(this.physics.snapshots())
    const suppressed = this.bodyCorrection.suppressedHandles
    this.visibleImpacts.length = 0
    for (const impact of this.frameImpacts) {
      if (!suppressed.has(impact.handle)) this.visibleImpacts.push(impact)
    }
    /*
     * 국면을 도는 밤은 혼자 하기에만 있지만, 대전도 현재 현지 시각에 맞춘 고정 조명은
     * 쓴다. 통나무·합성 표식·히든 공개·지진은 여전히 넘기지 않는다.
     */
    this.renderer?.draw({
      bodies,
      aimX: this.aimer.worldX,
      showAim: !this.match.over && this.match.isAlive(this.transport.selfId),
      landing: this.landing.view,
      nightfall: this.nightfall,
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
      // 꼬리 부스러기가 이 값의 차이로 시간을 흘린다
      time: this.elapsed,
      // 실제 물리 위치와 표시 위치가 다른 물건의 물 튐만 잠시 숨긴다.
      impacts: this.visibleImpacts,
      suppressTrails: suppressed,
      ownerColors: this.ownerColors,
    })
  }

  private visibleDuelIds(): readonly PlayerId[] {
    if (this.matchMode !== 'duel') return []
    const active = new Set(
      this.match.players
        .filter((player) => this.isDuelActive(player.id))
        .map((player) => player.id),
    )
    const candidates = this.match.players.filter((player) => {
      if (active.has(player.id)) return true
      const finishedAt = this.duelFinishedAt.get(player.id)
      return finishedAt !== undefined && this.elapsed - finishedAt < DUEL_TOWER_EXIT_SEC
    })
    return visibleDuelTowerIds({
      players: candidates,
      selfId: this.transport.selfId,
      alive: active,
      seed: this.seed,
    })
  }

  private emit(): void {
    const snapshot = this.match.snapshot()
    this.listener?.({
      phase: snapshot.over ? 'over' : 'playing',
      selfId: this.transport.selfId,
      players: this.match.players,
      lives: snapshot.lives,
      canDrop: this.canDropNow(),
      current: this.matchMode === 'duel' ? null : this.match.currentPlayer,
      myTurn: this.matchMode === 'duel'
        ? this.isDuelActive(this.transport.selfId) && !snapshot.over
        : this.match.currentPlayer === this.transport.selfId,
      dropCooldown: Math.min(1, Math.max(0, this.waitLeft() / DROP_INTERVAL_SEC)),
      turnLeft:
        this.matchMode === 'duel' || this.match.currentPlayer === null
          ? null
          : Math.max(0, TURN_LIMIT_SEC - this.turnElapsed),
      invulnerable: this.invulnerableRatios(),
      hurt:
        this.lastHurt === null
          ? null
          : { by: this.lastHurt, lives: this.match.livesOf(this.lastHurt) },
      // 매 프레임 복사하지 않는다 — 스포너가 목록을 바꿀 때 새 배열로 갈아치운다
      words: this.spawner.words,
      wordClaims: this.wordClaims,
      wordMarks: this.wordMarksFor(this.transport.selfId),
      wordMergeSizes: this.wordMergeSizesFor(this.transport.selfId),
      wordMergeHints: this.wordMergeHintsFor(this.transport.selfId),
      pairPulse: pairPulse(this.elapsed),
      whiteboard: this.matchMode === 'duel' ? this.whiteboardWords : [],
      activeWhiteboard: this.matchMode === 'duel'
        ? this.whiteboardWords.filter((word) => this.spawner.words.some((falling) => (
            falling.state === 'active' && falling.word === word
          )))
        : [],
      heartReward: this.heartReward,
      mergeFeedback: this.mergeFeedback,
      aimNormalized: this.aimer.normalized,
      chat: this.chat.view,
      inputMode: this.inputMode(),
      ranked: this.ranked,
      matchMode: this.matchMode,
      stage: this.duelStage === null
        ? { id: 0, title: '함께 쌓기' }
        : { id: this.duelStage.id, title: this.duelStage.title },
      standings: this.standingsView,
      duelResults: this.duelRace?.results ?? [],
      duelTowerIds: this.visibleDuelIds(),
      feedback: this.feedback,
      winner: snapshot.winner,
      connectionLost: this.connectionLost,
      reconnecting: this.reconnecting,
      matchId: this.matchId,
      wins: this.winsView,
      wantRematch: this.rematchView,
      opponentLeft: this.opponentLeft,
      left: this.presence.gone,
    })
  }
}

export {
  MatchEngine,
  DROP_INTERVAL_SEC,
  DUEL_WORD_RATE_MULTIPLIER,
  TURN_LIMIT_SEC,
  TURN_HURRY_SEC,
  DUEL_TARGET_STACK_TOP,
  matchIdOf,
  difficultyForMatch,
  starterOf,
}
export type {
  DuelMergeFeedback,
  DuelWordClaim,
  MatchViewState,
  MatchFeedback,
  MatchEngineOptions,
}
