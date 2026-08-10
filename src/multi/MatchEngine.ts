import {
  AIM_HALF_RANGE,
  ARENA,
  INVULNERABLE_SEC,
  LIVES,
} from '../game/config.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import { followCameraY, spawnYFor } from '../game/systems/Camera.ts'
import type { EscapeEvent } from '../game/physics/PhysicsWorld.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../game/renderer/ArenaRenderer.ts'
import { Aimer } from '../game/systems/Aimer.ts'
import { difficultyAt, difficultyProgress, forPlayers } from '../game/systems/Difficulty.ts'
import { resolveItem } from '../game/systems/ItemResolver.ts'
import { createRng, type Rng } from '../game/systems/Rng.ts'
import { judgeInput } from '../game/systems/TypingJudge.ts'
import { LandingGlow } from '../game/systems/LandingGlow.ts'
import type { TrailHit } from '../game/systems/TrailField.ts'
import { impactEventOf, quakeEventOf, trailHitOf } from '../game/systems/ImpactFeel.ts'
import { WordSpawner } from '../game/systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../game/types/events.ts'
import type { FallingWord, OwnerId } from '../game/types/game.ts'
import { MatchState } from './MatchState.ts'
import { buildOwnerColors } from './ownerColors.ts'
import type { Message, PlayerId, PlayerInfo } from './protocol.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'
import type { ChatLine } from './ChatLog.ts'
import type { ChatLog } from './ChatLog.ts'
import { BodyCorrection } from './BodyCorrection.ts'
import { Presence } from './Presence.ts'

/**
 * 대전 한 판.
 *
 * 싱글의 GameEngine과 나눠 둔 이유는 규칙이 다르기 때문이다 — 여기서는 받침대가 하나이고
 * 턴이 돌아가며, 목숨은 물건 주인이 잃는다. 물리·렌더러·단어 시스템은 그대로 공유한다.
 *
 * **방장이 심판이다.** 양쪽이 각자 물리를 돌리지만 "누가 목숨을 잃었는지, 턴이 누구에게
 * 넘어가는지"는 방장만 정하고 결과를 보낸다. Rapier의 크로스 플랫폼 결정론에 승패를
 * 걸지 않으려는 것이고, 턴이 끝날 때마다 방장이 권위 키프레임을 보내 어긋남을 되돌린다.
 */

/**
 * 한 사람이 연달아 떨구는 사이의 최소 간격(초).
 *
 * 턴을 없앤 자리를 이것이 대신한다. 예전에는 물건이 자리를 잡을 때까지 아무도
 * 떨구지 못했는데, 그러면 상대가 쌓는 몇 초 동안 내 손이 멈춘다 — 타자게임에서
 * 가장 큰 대가다. 이제 둘 다 언제든 치되, 한 사람이 물건을 쏟아붓지는 못한다.
 * 싱글의 DROP_COOLDOWN_MS와 같은 장치이고, 사람마다 따로 돈다.
 */
const DROP_INTERVAL_SEC = 0.9

/**
 * 한 차례에 주어지는 시간(초). 넘기면 방장이 대신 떨궈 차례를 넘긴다.
 *
 * **잠수를 막는 것이 목적이다.** 받침대가 하나뿐이라 한 사람이 손을 놓으면 판 전체가
 * 멎는다 — 나머지는 나가는 것 말고 할 수 있는 일이 없다.
 *
 * 넉넉히 잡았다. 단어를 찾아 읽고 한글로 치는 데 드는 시간에 조준까지 얹어야 하고,
 * 이 시한에 걸리는 것은 자리를 비운 사람이지 느린 사람이 아니어야 한다.
 */
const TURN_LIMIT_SEC = 20

/** 남은 시간이 이 아래로 내려가면 화면이 다급하게 알린다 */
const TURN_HURRY_SEC = 5

/** 권위 키프레임을 보내는 간격(초). 턴이 없어져 끝나는 지점이 사라졌다 */
const SYNC_INTERVAL_SEC = 2.5
/** 판 전환 직후에는 구형 판 ID 없는 지연 명령을 잠깐 버린다. */
const LEGACY_COMMAND_GRACE_SEC = 1
/** 드롭 명령이 네트워크를 지나갈 시간을 주는 물리 tick 수. 현재 루프 기준 약 100ms다. */
const DROP_LEAD_TICKS = 6

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

/** 아무도 무적이 아닐 때 돌려주는 고정 배열 — 매 프레임 빈 배열을 새로 만들지 않으려는 것 */

const NO_INVULNERABLE: readonly (readonly [PlayerId, number])[] = []

const HOST_MESSAGES = new Set<Message['t']>([
  'dropped', 'chatted', 'left', 'words', 'lives', 'sync', 'over', 'rematchList', 'restart',
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
  /**
   * 등수. 1이 마지막까지 버틴 사람이다. 판이 끝나면 결과 화면이 그대로 보여준다.
   * 같은 붕괴로 함께 탈락하면 공동 등수다.
   */
  readonly standings: readonly { readonly id: PlayerId; readonly placement: number }[]
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
  private readonly loop = new GameLoop()
  private readonly transport: Transport
  private readonly match: MatchState
  private readonly ownerColors: Map<OwnerId, string>
  private readonly onFailure: ((failure: TransportFailure) => void) | null
  private readonly onRestart: ((seed: number) => void) | null
  private readonly wins: Map<PlayerId, number>
  private readonly chat: ChatLog
  private readonly chatEnabled: boolean
  private readonly ranked: boolean
  private readonly chatClock: () => number
  private readonly wantRematch = new Set<PlayerId>()
  /** 승수는 판마다 한 번만 올린다 — 방장과 참가자가 각자 끝을 알아채기 때문이다 */
  private recorded = false
  /** 모두의 계속하기가 모인 뒤 재시작 신호는 판마다 한 번만 보낸다. */
  private restartRequested = false
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

  /**
   * 단어 밭을 굴리는 난수와 물건을 뽑는 난수를 나눠 둔다.
   *
   * 하나로 쓰면 방장만 물건을 뽑으므로(참가자는 방장이 정한 id를 받는다) 첫 드롭에서
   * 두 난수열이 갈린다. 지금은 단어 밭도 방장이 소유해 이 갈림이 겉으로 드러나지
   * 않지만, 하나를 나눠 쓰는 구조 자체를 남겨두면 같은 함정에 다시 빠진다.
   */
  private rng: Rng
  private itemRng: Rng
  private spawner: WordSpawner
  private aimer = new Aimer(AIM_HALF_RANGE)
  /** 빛나는 물건이 얹힐 때 번지는 색. 싱글과 같은 것을 쓴다 */
  private readonly landing = new LandingGlow()
  /** 이번 프레임에 부딪힌 자리들. 배열을 새로 만들지 않고 비워 쓴다 */
  private readonly frameImpacts: TrailHit[] = []
  /** 표시 보정 중인 물건의 충돌만 걷어낸 렌더용 버퍼 */
  private readonly visibleImpacts: TrailHit[] = []
  private elapsed = 0

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
  /**
   * 지금 차례가 시작된 뒤 흐른 시간(초).
   *
   * **판정은 방장만 한다.** 양쪽이 각자 재서 각자 떨구면 같은 순간에 다른 물건이
   * 두 번 떨어진다. 참가자는 화면에 숫자를 그리는 데만 쓴다 — 조금 어긋나도
   * 보이는 것이 어긋날 뿐이고, 실제로 떨어지는 것은 방장이 보낸 하나다.
   */
  private turnElapsed = 0
  private sinceSync = 0
  /** 현재 로컬 물리 step 번호. sync를 받으면 참가자는 방장 tick에 맞춘다. */
  private physicsTick = 0
  /** 물리 세계에 넣는 시점만 예약한다. 단어 제거·턴 이동은 드롭 승인 시점에 한다. */
  private readonly pendingDrops: ScheduledDrop[] = []
  /** 방장이 떨군 뒤 정착 상태를 한 번 더 알려줄 물건들 */
  private readonly pendingSettledSync = new Set<number>()
  /** 참가자 화면에서만 권위 위치 교정을 짧게 이어 붙인다. */
  private readonly bodyCorrection = new BodyCorrection()

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

  private constructor(physics: PhysicsWorld, options: MatchEngineOptions) {
    this.physics = physics
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
    this.wins = options.wins
    this.chat = options.chat
    this.chatEnabled = options.chatEnabled
    this.ranked = options.ranked
    this.chatClock = options.chatClock
    this.winsView = [...this.wins]
    this.match = new MatchState(options.players, LIVES, options.starter ?? starterOf(options.seed, options.players))
    this.standingsView = this.match.standings()
    this.ownerColors = buildOwnerColors(options.players)
    this.presence = new Presence(options.players, options.transport.selfId)
    this.rng = createRng(options.seed)
    this.itemRng = createRng((options.seed ^ 0x9e3779b9) >>> 0)
    this.spawner = new WordSpawner(this.rng, WORDS)
    if (!this.isHost) {
      this.spawner.follow()
    }
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(options: MatchEngineOptions): Promise<MatchEngine> {
    const physics = await PhysicsWorld.create()
    return new MatchEngine(physics, options)
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
    this.emit()
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
      return
    }
    if (this.inputMode() === 'chat') {
      this.sendChat(text)
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
    this.transport.sendTo(peer, {
      t: 'sync',
      bodies: this.physics.frames(),
      welds: this.physics.weldPairs(),
      tick: this.physicsTick,
      matchId: this.matchId,
    })
  }

  /** 사라진 사람을 판에서 뺀다. 양쪽이 똑같이 실행한다 */
  private applyLeft(who: PlayerId): void {
    if (!this.match.isAlive(who)) {
      return
    }
    this.presence.markGone(who)
    // 그 사람만의 회차다 — 함께 무너진 것이 아니므로 등수를 같이 매기면 안 된다
    this.match.startDeathBatch()
    this.match.setLives(who, 0)
    this.standingsView = this.match.standings()
    this.match.ensureTurnAlive()
    // 사라진 사람 차례에서 시계가 이어지면 안 된다
    this.turnElapsed = 0
    if (this.isHost) {
      this.transport.broadcast({
        t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
      })
      if (this.match.over) {
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
    return this.chatEnabled ? 'chat' : 'idle'
  }

  handleTransportEvent(event: TransportEvent): void {
    switch (event.kind) {
      case 'message':
        this.handleMessage(event.from, event.message)
        break
      case 'peerLeft':
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
    return this.physics.frames().map((frame) => ({
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
    for (let i = 0; i < count; i += 1) {
      this.physics.spawnItemAt(
        variant,
        ARENA.halfWidth + 2 + i,
        ARENA.platformTop + 1,
        owner,
        this.nextItemId,
      )
      this.nextItemId += 1
    }
  }

  /** 이긴 사람에게 1점. 무승부(둘 다 같은 붕괴로 탈락)면 아무도 못 얻는다 */
  private recordWin(winner: PlayerId | null): void {
    if (this.recorded) {
      return
    }
    this.recorded = true
    if (winner !== null) {
      this.wins.set(winner, (this.wins.get(winner) ?? 0) + 1)
    }
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
  }

  /** 지금 떨굴 수 있는지. 화면에 보여주는 값과 같은 기준이어야 한다 */
  private canDropNow(): boolean {
    return this.match.canDrop(this.transport.selfId) && this.dropCooldown <= 0
  }

  /** 남은 공유 쿨타임(초). 누구에게나 같은 값이다 */
  private waitLeft(): number {
    return this.dropCooldown
  }

  /**
   * 한마디 한다.
   *
   * **방장을 거쳐서만 퍼진다.** 저마다 뿌리면 사람마다 다른 순서로 쌓이고, 거르는
   * 규칙도 여러 벌이 된다. 방장은 자기가 보낸 참가자용 메시지를 스스로 처리하지
   * 않으므로 곧바로 결과를 알린다.
   */
  sendChat(text: string): void {
    if (!this.chatEnabled) {
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
    if (!this.chatEnabled || !this.isHost) {
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
    if (!this.match.canDrop(by) || this.dropCooldown > 0) {
      return
    }
    const target = this.spawner.words.find(
      (candidate) => candidate.state === 'active' && candidate.word === word,
    )
    if (target === undefined) {
      return
    }
    const aimX = Math.min(Math.max(rawAimX, -AIM_HALF_RANGE), AIM_HALF_RANGE)
    const variant = resolveItem(word, this.itemRng)
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
      this.spawner.remove(target.id)
    }

    this.scheduleDrop({ by, word, aimX, spawnY, variantId, itemId, applyAtTick })
    // 양쪽이 다 지나는 자리다 — 상대가 떨군 것도 소리로 들린다
    this.fire({
      kind: 'drop',
      hidden: variant.hidden,
      material: variant.material,
      tone: variant.tone,
    })
    if (variant.hidden) {
      this.fire({ kind: 'reveal' })
    }
    /*
     * 차례를 넘기고 모두가 함께 쓰는 쿨타임을 건다.
     *
     * 앞사람의 물건이 **자리를 잡기를 기다리지는 않는다.** 기다리게 하면 구르는
     * 물건 하나에 판 전체가 몇 초씩 멈춘다. 쿨타임이 끝나는 순간 다음 사람이 친다.
     */
    this.match.nextTurn()
    this.dropCooldown = DROP_INTERVAL_SEC
    this.turnElapsed = 0

    if (by === this.transport.selfId) {
      this.feedbackSeq += 1
      this.feedback = {
        seq: this.feedbackSeq,
        text: word,
        kind: 'dropped',
        itemLabel: variant.label,
        hidden: variant.hidden,
      }
    }
    this.emit()
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
    if (this.physics.frames().some((frame) => frame.itemId === drop.itemId)) {
      return
    }
    this.physics.spawnItemAt(variant, drop.aimX, drop.spawnY, drop.by, drop.itemId)
    if (this.isHost) {
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
      case 'sync':
        if (!this.isHost) {
          if (message.tick !== undefined) {
            this.physicsTick = message.tick
            this.pendingDrops.sort((a, b) => (a.applyAtTick ?? 0) - (b.applyAtTick ?? 0))
          }
          const corrections = this.physics.applyFrames(
            message.bodies,
            (id) => VARIANT_BY_ID.get(id),
            message.welds,
          )
          this.bodyCorrection.note(corrections)
          this.emit()
        }
        break
      case 'over':
        if (!this.isHost) {
          this.loop.stop()
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
    this.standingsView = this.match.standings()
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
    this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
    // 판이 끝난 뒤에도 색은 계속 사라져야 한다 — 그리기가 매 프레임 이어지므로
    this.landing.advance(dt)
    // 지난 프레임의 부딪힘은 이미 그려졌다
    this.frameImpacts.length = 0
    if (this.match.over || this.connectionLost) {
      return
    }

    this.elapsed += dt

    // 모두가 함께 쓰는 쿨타임. 0이 되는 순간이 곧 다음 차례 사람의 시작이다
    if (this.dropCooldown > 0) {
      this.dropCooldown = Math.max(0, this.dropCooldown - dt)
    }

    /*
     * 차례 시계. 쿨타임이 도는 동안에는 아직 아무도 칠 수 없으므로 세지 않는다 —
     * 그러지 않으면 실제로 손이 갈 수 있는 시간이 시한보다 짧아진다.
     */
    if (this.isHost) {
      this.sweepGone()
    }

    if (this.dropCooldown <= 0 && this.match.currentPlayer !== null) {
      this.turnElapsed += dt
      if (this.isHost && this.turnElapsed >= TURN_LIMIT_SEC) {
        this.dropForIdlePlayer()
      }
    }

    /*
     * 난이도는 쌓은 높이를 따라간다. 한 번 오른 뒤에는 내려가지 않는다 —
     * 탑이 무너질 때마다 단어가 뜸해졌다 몰아쳤다 하면 무엇이 기준인지 알 수 없다.
     */
    this.difficultyPeak = Math.max(
      this.difficultyPeak,
      difficultyProgress(this.physics.stackTop()),
    )
    /*
     * 사람이 많을수록 단어를 더 많이, 더 자주 내보낸다. 차례를 기다리는 사람들이
     * 덫을 걸 단어가 있어야 손이 멈추지 않는다 — 그것이 이 게임에서 가장 큰 대가다.
     */
    const difficulty = forPlayers(difficultyAt(this.difficultyPeak), this.match.players.length)
    this.tickInvulnerable(dt)
    this.aimer.update(dt, difficulty.aimSpeed)
    /*
     * 단어 밭은 방장이 소유한다. 참가자의 스포너는 따라가기만 하고 스스로 내지 않는다 —
     * 난이도가 쌓은 높이를 따라가는데 그 높이가 양쪽에서 미세하게 어긋나서,
     * 시드를 맞춰도 나오는 순간이 결국 갈린다.
     */
    this.spawner.update(dt, difficulty)

    this.spawnScheduledDrops()
    const { impacts, escaped, quake } = this.physics.step(dt)
    this.physicsTick += 1
    this.landing.note(impacts)
    for (const hit of impacts) {
      this.frameImpacts.push(trailHitOf(hit))
      this.fire(impactEventOf(hit))
    }
    const shake = quakeEventOf(quake)
    if (shake !== null) {
      this.fire(shake)
    }

    if (this.isHost) {
      this.broadcastWordsIfChanged()
      this.hostJudge(dt, escaped)
    }
    this.noticeTurn()
    this.emit()
  }

  /**
   * 떨굴 수 있게 된 순간을 알린다.
   *
   * 대전에서 가장 놓치기 쉬운 정보다 — 내 차례는 상대의 물건이 멈춘 뒤 조용히
   * 시작되는데, 그때 눈은 내려오는 단어를 쫓고 있다. 소리가 없으면 몇 초를 그냥 흘린다.
   */
  private noticeTurn(): void {
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

  /** 현재 권위 물리 상태를 보낸다. */
  private broadcastAuthoritySync(): void {
    this.transport.broadcast({
      t: 'sync',
      bodies: this.physics.frames(),
      welds: this.physics.weldPairs(),
      tick: this.physicsTick,
      matchId: this.matchId,
    })
    this.sinceSync = 0
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
    this.broadcastAuthoritySync()
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
    const byItem = new Map(this.physics.frames().map((frame) => [frame.itemId, frame]))
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
  private hostJudge(dt: number, escaped: readonly EscapeEvent[]): void {
    let anyLost = false
    // 이번 판정에 함께 죽는 사람들은 공동 등수다
    this.match.startDeathBatch()
    for (const { owner } of escaped) {
      // 무적인 사람의 물건은 세계에서 치우되 목숨은 깎지 않는다
      if (this.isInvulnerable(owner)) {
        continue
      }
      this.match.loseLife(owner)
      this.markHurt(owner)
      anyLost = true
    }
    if (anyLost) {
      this.standingsView = this.match.standings()
      // 참가자도 같은 순서로 건너뛰도록 양쪽이 똑같이 부른다
      this.match.ensureTurnAlive()
      this.turnElapsed = 0
      this.transport.broadcast({
        t: 'lives', lives: this.match.snapshot().lives, matchId: this.matchId,
      })
    }

    if (this.match.over) {
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

  private readonly render = (): void => {
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

  private emit(): void {
    const snapshot = this.match.snapshot()
    this.listener?.({
      phase: snapshot.over ? 'over' : 'playing',
      selfId: this.transport.selfId,
      players: this.match.players,
      lives: snapshot.lives,
      canDrop: this.canDropNow(),
      current: this.match.currentPlayer,
      myTurn: this.match.currentPlayer === this.transport.selfId,
      dropCooldown: Math.min(1, Math.max(0, this.waitLeft() / DROP_INTERVAL_SEC)),
      turnLeft:
        this.match.currentPlayer === null
          ? null
          : Math.max(0, TURN_LIMIT_SEC - this.turnElapsed),
      invulnerable: this.invulnerableRatios(),
      hurt:
        this.lastHurt === null
          ? null
          : { by: this.lastHurt, lives: this.match.livesOf(this.lastHurt) },
      // 매 프레임 복사하지 않는다 — 스포너가 목록을 바꿀 때 새 배열로 갈아치운다
      words: this.spawner.words,
      aimNormalized: this.aimer.normalized,
      chat: this.chat.view,
      inputMode: this.inputMode(),
      ranked: this.ranked,
      standings: this.standingsView,
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

export { MatchEngine, DROP_INTERVAL_SEC, TURN_LIMIT_SEC, TURN_HURRY_SEC, matchIdOf, starterOf }
export type { MatchViewState, MatchFeedback, MatchEngineOptions }
