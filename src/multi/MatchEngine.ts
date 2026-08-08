import {
  AIM_HALF_RANGE,
  ARENA,
  IMPACT_FULL_SCALE,
  INVULNERABLE_SEC,
  LIVES,
  QUAKE_IMPACT_SCALE,
} from '../game/config.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import { followCameraY, spawnYFor } from '../game/systems/Camera.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../game/renderer/ArenaRenderer.ts'
import { Aimer } from '../game/systems/Aimer.ts'
import { difficultyAt, difficultyProgress, forPlayers } from '../game/systems/Difficulty.ts'
import { resolveItem } from '../game/systems/ItemResolver.ts'
import { createRng, type Rng } from '../game/systems/Rng.ts'
import { judgeInput } from '../game/systems/TypingJudge.ts'
import { LandingGlow } from '../game/systems/LandingGlow.ts'
import { WordSpawner } from '../game/systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../game/types/events.ts'
import type { FallingWord, OwnerId } from '../game/types/game.ts'
import { MatchState } from './MatchState.ts'
import { buildOwnerColors } from './ownerColors.ts'
import type { Message, PlayerId, PlayerInfo } from './protocol.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

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

/** 권위 키프레임을 보내는 간격(초). 턴이 없어져 끝나는 지점이 사라졌다 */
const SYNC_INTERVAL_SEC = 2.5

/**
 * 노려진 단어를 쓴 사람이 잃는 하트.
 *
 * 노린 사람은 아무것도 얻지 않는다 — 얻게 하면 하트가 양쪽으로 움직여 판이 길어지고,
 * 무엇보다 "노림"이 회복 수단이 되어 이름과 어긋난다. 이것은 공격이다.
 */
const AIM_DAMAGE = 0.5

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

/** 아무도 무적이 아닐 때 돌려주는 고정 배열 — 매 프레임 빈 배열을 새로 만들지 않으려는 것 */
const NO_INVULNERABLE: readonly (readonly [PlayerId, number])[] = []

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
  /** 상대가 지목한 단어. 강제력은 없고 표시만 한다 */
  /**
   * 덫이 걸린 단어들. **내가 건 것도 들어온다** —
   * 무엇을 걸어뒀는지 모르면 같은 단어를 또 걸게 된다.
   */
  readonly aimed: readonly { readonly word: string; readonly by: PlayerId }[]
  /** 방금 되찾은 하트. 같은 seq면 이미 보여준 것이다 */
  /**
   * 방금 노려보려 한 결과. 성공했는지, 누가 먼저 차지했는지.
   * 되든 안 되든 알려야 한다 — 아무 반응이 없으면 왜 안 됐는지 알 수 없다.
   */
  readonly aimResult: {
    readonly word: string
    readonly takenBy: PlayerId | null
    readonly seq: number
  } | null
  /**
   * 등수. 1이 마지막까지 버틴 사람이다. 판이 끝나면 결과 화면이 그대로 보여준다.
   * 같은 붕괴로 함께 탈락하면 공동 등수다.
   */
  readonly standings: readonly { readonly id: PlayerId; readonly placement: number }[]
  /** 방금 먹힌 노림. 같은 seq면 이미 보여준 것이다 */
  readonly lastAim: {
    readonly by: PlayerId
    readonly victim: PlayerId
    readonly word: string
    readonly seq: number
  } | null
  readonly feedback: MatchFeedback | null
  readonly winner: PlayerId | null
  readonly connectionLost: boolean
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
  /**
   * 판을 거듭하며 쌓이는 승수. **세션이 들고 있는 것을 그대로 받아 고친다** —
   * 엔진은 판마다 새로 만들어지므로 여기서 소유하면 점수가 매 판 사라진다.
   */
  readonly wins: Map<PlayerId, number>
  readonly onFailure?: (failure: TransportFailure) => void
  /** 다음 판을 열어달라고 세션에 청한다. 엔진은 자기 자신을 갈아치울 수 없다 */
  readonly onRestart?: (seed: number) => void
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
  private readonly wantRematch = new Set<PlayerId>()
  /** 승수는 판마다 한 번만 올린다 — 방장과 참가자가 각자 끝을 알아채기 때문이다 */
  private recorded = false
  private opponentLeft = false
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
  private sinceSync = 0

  /**
   * 덫이 걸린 단어 — 단어 → 건 사람.
   *
   * 단어를 열쇠로 삼는 이유는 낙하 단어가 사라졌다 다시 나와도 같은 덫으로 이어져야
   * 하기 때문이다. 상대가 그 단어를 치면 덫이 작동하고 건 사람이 하트를 되찾는다.
   */
  /**
   * 노려진 단어 → 노리는 사람.
   *
   * 한 단어는 한 사람만 노린다(먼저 노린 사람 것). 여럿이 겹치면 한 번 밟는 데
   * 여러 칸이 날아가 인원이 많을수록 즉사한다.
   */
  private readonly aimedWord = new Map<string, PlayerId>()
  /**
   * 사람 → 그가 노리는 단어. **한 사람은 하나만 노린다.**
   *
   * 제한이 없으면 여덟이 붙었을 때 1초 만에 화면의 모든 단어가 노려져, 차례인 사람은
   * 무엇을 쳐도 하트를 잃는다. 하나로 묶으면 "어디를 노릴까"가 선택이 되고,
   * 차례인 사람에게는 언제나 피할 곳이 남는다.
   */
  private readonly aimOf = new Map<PlayerId, string>()
  /** 방금 되찾은 하트. 화면이 한 번 띄우고 지운다 */
  /**
   * 방금 노려보려 한 결과. 화면이 한 번 띄우고 지운다.
   * `takenBy`가 있으면 그 사람이 먼저 노리고 있어 실패한 것이다.
   */
  private aimResult: { word: string; takenBy: PlayerId | null; seq: number } | null = null
  private aimResultSeq = 0
  /** 방금 먹힌 노림. 화면이 한 번 띄우고 지운다 */
  private lastAim: { by: PlayerId; victim: PlayerId; word: string; seq: number } | null = null
  private aimSeq = 0
  /*
   * 화면에 넘길 사본. emit()은 매 프레임 도는데 노림은 사람이 칠 때만 바뀐다 —
   * 프레임마다 새로 만들면 그것만으로 쓰레기가 쌓인다.
   */
  private aimedView: readonly { word: string; by: PlayerId }[] = []
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
    this.winsView = [...this.wins]
    this.match = new MatchState(options.players, LIVES)
    this.standingsView = this.match.standings()
    this.ownerColors = buildOwnerColors(options.players)
    this.rng = createRng(options.seed)
    this.itemRng = createRng((options.seed ^ 0x9e3779b9) >>> 0)
    this.spawner = new WordSpawner(this.rng, WORDS)
    if (!this.transport.isHost) {
      this.spawner.follow()
    }
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(options: MatchEngineOptions): Promise<MatchEngine> {
    const physics = await PhysicsWorld.create()
    return new MatchEngine(physics, options)
  }

  get isHost(): boolean {
    return this.transport.isHost
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
   * Enter를 누른 순간.
   *
   * 떨굴 수 있으면 떨구고, 낙하 간격이 도는 중이면 그 단어에 **덫**을 건다.
   * 간격을 비워두면 그 몇 초 동안 타자가 아무 반응 없이 삼켜진다.
   */
  submit(text: string): void {
    if (this.match.over) {
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
      return
    }
    // 떨굴 수 없는 동안의 타자는 노림이 된다
    this.sendAim(word)
  }

  handleTransportEvent(event: TransportEvent): void {
    switch (event.kind) {
      case 'message':
        this.handleMessage(event.from, event.message)
        break
      case 'peerLeft':
        // 스타 토폴로지라 상대가 사라지면 판을 이어갈 수 없다
        this.connectionLost = true
        this.loop.stop()
        this.emit()
        break
      case 'error':
        this.onFailure?.(event.failure)
        break
      case 'peerJoined':
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
    if (this.transport.isHost) {
      this.wantRematch.add(this.transport.selfId)
      this.publishRematch()
      return
    }
    this.transport.broadcast({ t: 'rematch' })
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
    this.transport.broadcast({ t: 'rematchList', ready: this.rematchView })
    this.emit()

    const all = this.match.players.every((player) => this.wantRematch.has(player.id))
    if (!all) {
      return
    }
    // 시드를 새로 뽑아야 다음 판에 같은 단어가 같은 순서로 되풀이되지 않는다
    const seed = Date.now() >>> 0
    this.transport.broadcast({ t: 'restart', seed })
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
   * 이 단어를 노린다.
   *
   * **되든 안 되든 화면에 알린다.** 남이 이미 노리는 단어는 뺏지 못하는데, 그때
   * 아무 반응이 없으면 "쳤는데 왜 아무 일도 없지"가 남는다 — 손을 멈추게 하는 것과
   * 같은 대가다.
   *
   * 방향에 따라 메시지가 다르다 — 참가자는 방장을 거쳐야 하지만(`harass`),
   * 방장은 자기가 보낸 참가자용 메시지를 스스로 처리하지 않으므로 같은 방식으로
   * 보내면 아무 데도 닿지 않는다. 방장은 결과(`harassed`)를 바로 알린다.
   */
  private sendAim(word: string): void {
    const takenBy = this.aimedWord.get(word)
    if (takenBy !== undefined && takenBy !== this.transport.selfId) {
      this.aimResult = { word, takenBy, seq: (this.aimResultSeq += 1) }
      this.emit()
      return
    }
    this.aimResult = { word, takenBy: null, seq: (this.aimResultSeq += 1) }
    if (this.transport.isHost) {
      this.transport.broadcast({ t: 'harassed', by: this.transport.selfId, word })
      this.applyAim(this.transport.selfId, word)
    } else {
      this.transport.broadcast({ t: 'harass', word })
      // 건 사람에게도 바로 보여준다. 방장의 답을 기다리면 내가 뭘 걸었는지 모른 채
      // 다음 단어를 치게 된다
      this.applyAim(this.transport.selfId, word)
    }
  }

  /**
   * 양쪽이 똑같이 실행한다.
   *
   * **노림은 마지막에 친 단어로 옮겨간다.** 그래서 새로 치면 앞서 노리던 것이 풀린다 —
   * 노리는 자리가 곧 내 시선이 가 있는 자리다.
   * 남이 이미 노리는 단어는 뺏지 못한다. 먼저 노린 사람 것이다.
   */
  private applyAim(by: PlayerId, word: string): void {
    if (this.aimedWord.has(word)) {
      return
    }
    const previous = this.aimOf.get(by)
    if (previous !== undefined) {
      this.aimedWord.delete(previous)
    }
    this.aimOf.set(by, word)
    this.aimedWord.set(word, by)
    this.refreshAimedView()
    this.fire({ kind: 'suggested' })
    this.emit()
  }

  /** 내가 떨구려 한다. 방장이면 바로 판정하고, 게스트면 방장에게 청한다 */
  private requestDrop(word: string): void {
    if (this.transport.isHost) {
      this.resolveDrop(this.transport.selfId, word, this.aimer.worldX)
      return
    }
    this.transport.broadcast({ t: 'drop', word, aimX: this.aimer.worldX })
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

    this.transport.broadcast({
      t: 'dropped',
      by,
      word,
      aimX,
      variantId: variant.id,
      itemId,
    })
    this.applyDrop(by, word, aimX, variant.id, itemId)

    /*
     * 덫을 밟았는지는 떨군 **뒤에** 본다. 물건은 어차피 떨어지고, 덫은 그 위에
     * 얹히는 대가다 — 먼저 보면 "덫이라 못 떨궜다"로 읽혀 규칙이 달라진다.
     * 자기가 건 덫은 밟히지 않는다. 스스로 치고 회복하면 방해가 아니라 회복 수단이 된다.
     */
    const aimedBy = this.aimedWord.get(word)
    if (aimedBy !== undefined && aimedBy !== by) {
      this.transport.broadcast({ t: 'harassHit', by: aimedBy, victim: by, word })
      this.applyAimHit(aimedBy, by, word)
      this.transport.broadcast({ t: 'lives', lives: this.match.snapshot().lives })
    }
  }

  /** 양쪽이 똑같이 실행하는 부분. 물건 정체는 방장이 정한 id를 그대로 쓴다 */
  private applyDrop(
    by: PlayerId,
    word: string,
    aimX: number,
    variantId: string,
    itemId: number,
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

    this.physics.spawnItemAt(variant, aimX, spawnYFor(this.cameraY), by, itemId)
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

  private handleMessage(from: PlayerId, message: Message): void {
    switch (message.t) {
      case 'drop':
        // 게스트가 보낸 청. 방장만 처리하고, 검증은 resolveDrop이 한다
        if (this.transport.isHost) {
          this.resolveDrop(from, message.word, message.aimX)
        }
        break
      case 'dropped':
        if (!this.transport.isHost) {
          this.applyDrop(
            message.by,
            message.word,
            message.aimX,
            message.variantId,
            message.itemId,
          )
        }
        break
      case 'harass':
        if (this.transport.isHost) {
          this.transport.broadcast({ t: 'harassed', by: from, word: message.word })
          this.applyAim(from, message.word)
        }
        break
      case 'harassed':
        if (!this.transport.isHost) {
          this.applyAim(message.by, message.word)
        }
        break
      case 'harassHit':
        // 판정은 방장이 한다. 참가자는 결과만 따른다
        if (!this.transport.isHost) {
          this.applyAimHit(message.by, message.victim, message.word)
        }
        break
      case 'words':
        if (!this.transport.isHost) {
          this.spawner.apply(message.words)
          this.emit()
        }
        break
      case 'lives':
        // 목숨은 방장이 정한 값을 그대로 따른다
        if (!this.transport.isHost) {
          this.applyLives(message.lives)
        }
        break
      case 'sync':
        if (!this.transport.isHost) {
          this.physics.applyFrames(message.bodies, (id) => VARIANT_BY_ID.get(id), message.welds)
          this.emit()
        }
        break
      case 'over':
        if (!this.transport.isHost) {
          this.loop.stop()
          this.recordWin(message.winner)
          this.emit()
        }
        break
      case 'rematch':
        if (this.transport.isHost) {
          this.wantRematch.add(from)
          this.publishRematch()
        }
        break
      case 'rematchList':
        if (!this.transport.isHost) {
          this.wantRematch.clear()
          for (const id of message.ready) {
            this.wantRematch.add(id)
          }
          this.rematchView = [...this.wantRematch]
          this.emit()
        }
        break
      case 'restart':
        if (!this.transport.isHost) {
          this.onRestart?.(message.seed)
        }
        break
      case 'bye':
        // 사고가 아니라 상대의 선택이다. 남은 사람에게는 나가는 길만 열어준다
        this.opponentLeft = true
        this.loop.stop()
        this.emit()
        break
      default:
        break
    }
  }

  /**
   * 덫이 작동했다. 건 사람이 하트를 되찾고 그 단어는 덫에서 풀린다.
   * 판정은 방장이 하고 양쪽이 같은 값을 그린다.
   */
  private refreshAimedView(): void {
    this.aimedView = [...this.aimedWord].map(([word, by]) => ({ word, by }))
  }

  /**
   * 노림이 먹혔다. **밟은 사람만** 반 칸 잃고 그 노림은 풀린다.
   * 판정은 방장이 하고 양쪽이 같은 값을 그린다.
   */
  private applyAimHit(by: PlayerId, victim: PlayerId, word: string): void {
    const aimed = this.aimOf.get(by)
    if (aimed === word) {
      this.aimOf.delete(by)
    }
    this.aimedWord.delete(word)
    this.refreshAimedView()
    // 노림 한 방으로도 탈락할 수 있다 — 그 사람만의 회차로 둔다
    this.match.startDeathBatch()
    this.match.loseLife(victim, AIM_DAMAGE)
    this.standingsView = this.match.standings()
    this.match.ensureTurnAlive()
    this.lastAim = { by, victim, word, seq: this.aimSeq += 1 }
    this.fire({ kind: 'suggested' })
    this.emit()
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
    // 차례인 사람이 방금 탈락했으면 넘긴다 — 안 그러면 죽은 사람 차례에서 판이 멈춘다
    this.match.ensureTurnAlive()
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
    this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
    // 판이 끝난 뒤에도 색은 계속 사라져야 한다 — 그리기가 매 프레임 이어지므로
    this.landing.advance(dt)
    if (this.match.over || this.connectionLost) {
      return
    }

    this.elapsed += dt

    // 모두가 함께 쓰는 쿨타임. 0이 되는 순간이 곧 다음 차례 사람의 시작이다
    if (this.dropCooldown > 0) {
      this.dropCooldown = Math.max(0, this.dropCooldown - dt)
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

    const { impacts, escaped, quake } = this.physics.step(dt)
    this.landing.note(impacts)
    for (const hit of impacts) {
      this.fire({
        kind: 'impact',
        strength: Math.min(hit.impact / IMPACT_FULL_SCALE, 1),
        size: Math.max(hit.variant.artBounds.hw, hit.variant.artBounds.hh) * 2,
        material: hit.variant.material,
        tone: hit.variant.tone,
        grain: hit.variant.grain,
      })
    }
    if (quake > 0) {
      this.fire({ kind: 'quake', strength: Math.min(quake / QUAKE_IMPACT_SCALE, 1) })
    }

    if (this.transport.isHost) {
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
    this.transport.broadcast({ t: 'words', words: this.spawner.words })
  }

  /** 심판은 방장만 본다 — 목숨과 턴은 한 곳에서만 정해져야 한다 */
  private hostJudge(dt: number, escaped: readonly OwnerId[]): void {
    let anyLost = false
    // 이번 판정에 함께 죽는 사람들은 공동 등수다
    this.match.startDeathBatch()
    for (const owner of escaped) {
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
      this.transport.broadcast({ t: 'lives', lives: this.match.snapshot().lives })
    }

    if (this.match.over) {
      this.loop.stop()
      this.recordWin(this.match.winner)
      this.transport.broadcast({ t: 'over', winner: this.match.winner })
      return
    }

    /*
     * 키프레임을 일정 간격으로 보낸다.
     *
     * 예전에는 턴이 끝날 때 보냈다. 턴이 사라지면서 "끝나는 지점"이 없어졌는데,
     * 물리는 양쪽에서 따로 돌기 때문에 맞춰주지 않으면 서서히 벌어진다.
     * 매 프레임 흘리면 무료 전송로의 한도를 태우므로 간격을 둔다.
     */
    this.sinceSync += dt
    if (this.sinceSync >= SYNC_INTERVAL_SEC) {
      this.sinceSync = 0
      this.transport.broadcast({
        t: 'sync',
        bodies: this.physics.frames(),
        welds: this.physics.weldPairs(),
      })
    }
  }

  private readonly render = (): void => {
    this.renderer?.draw({
      bodies: this.physics.snapshots(),
      aimX: this.aimer.worldX,
      showAim: !this.match.over && this.match.isAlive(this.transport.selfId),
      hiddenReveal: null,
      landing: this.landing.view,
      quake: 0,
      quakePhase: 0,
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
      // 꼬리 부스러기가 이 값의 차이로 시간을 흘린다
      time: this.elapsed,
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
      invulnerable: this.invulnerableRatios(),
      hurt:
        this.lastHurt === null
          ? null
          : { by: this.lastHurt, lives: this.match.livesOf(this.lastHurt) },
      // 매 프레임 복사하지 않는다 — 스포너가 목록을 바꿀 때 새 배열로 갈아치운다
      words: this.spawner.words,
      aimNormalized: this.aimer.normalized,
      aimed: this.aimedView,
      aimResult: this.aimResult,
      standings: this.standingsView,
      lastAim: this.lastAim,
      feedback: this.feedback,
      winner: snapshot.winner,
      connectionLost: this.connectionLost,
      matchId: this.matchId,
      wins: this.winsView,
      wantRematch: this.rematchView,
      opponentLeft: this.opponentLeft,
    })
  }
}

export { MatchEngine, DROP_INTERVAL_SEC, AIM_DAMAGE, matchIdOf }
export type { MatchViewState, MatchFeedback, MatchEngineOptions }
