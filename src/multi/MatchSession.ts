import { MatchEngine, starterOf } from './MatchEngine.ts'
import { RelayTransport } from './RelayTransport.ts'
import { RELAY_URL } from './relayUrl.ts'
import { createRoomCode } from './protocol.ts'
import { sanitizeNickname } from './protocol.ts'
import type { PlayerId, PlayerInfo } from './protocol.ts'
import { COUNTDOWN_SEC } from '../game/config.ts'
import { ChatLog } from './ChatLog.ts'
import type { ChatLine } from './ChatLog.ts'
import { failure } from './Transport.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'
import {
  MATCH_MODE_CHOICE_LABELS,
  resolveMatchMode,
  type MatchMode,
  type MatchModeChoice,
} from './matchModes.ts'

/** 붙은 뒤 시작 신호를 이만큼 기다린다. 넘으면 양쪽이 영원히 기다리는 대신 실패로 끊는다 */
const HANDSHAKE_TIMEOUT_MS = 10000

/**
 * 자동매칭에서 상대가 준비를 누르기를 이만큼 기다린다.
 *
 * 넉넉해야 한다 — 상대는 방금 다른 창을 보고 있었을 수 있고, 이 시한에 걸리면
 * 성실히 기다린 사람이 줄로 되돌려보내진다. 그렇다고 길게 두면 이미 떠난 사람을
 * 그만큼 기다리는 셈이다. 준비 버튼 하나 누르는 데 필요한 시간의 몇 배로 잡았다.
 */
const READY_TIMEOUT_MS = 30000



/**
 * 방을 만들고 상대가 들어와 판이 시작되기까지의 절차.
 *
 * 이 층을 따로 둔 이유는 React가 얇아야 하기 때문이다 — 연결·핸드셰이크·엔진 생성을
 * 컴포넌트 안에서 하면 StrictMode의 이중 이펙트와 얽혀 진단하기 어려워진다.
 *
 * 핸드셰이크
 *   방장: 방을 만들고 기다린다 → 참가자의 hello를 받으면 시드와 명단을 정해 start를 보낸다
 *   참가자: 붙자마자 hello를 보내고 start를 기다린다
 * 시드를 방장이 정하는 이유는 양쪽에 같은 단어가 같은 순서로 내려와야 하기 때문이다.
 */
type SessionPhase =
  /** 아직 상대와 붙지도 못한 상태 */
  | { readonly kind: 'connecting' }
  /**
   * 붙었고 시작 신호를 주고받는 중.
   * `connecting`과 나눠둔 이유는 멈췄을 때 **어느 쪽에서 멈췄는지** 알아야 하기 때문이다 —
   * 하나로 두면 "경로가 안 열렸다"와 "붙었는데 응답이 없다"를 구분할 수 없다.
   */
  | { readonly kind: 'handshaking' }
  /** 방장이 상대를 기다리는 중. 이 코드를 상대에게 전달해야 한다 */
  | {
      readonly kind: 'waiting'
      readonly roomCode: string
      readonly matchModeChoice: MatchModeChoice
      readonly canChangeMatchMode: boolean
    }
  /**
   * 자동매칭으로 방을 받았고 상대가 들어오기를 기다린다.
   *
   * `waiting`과 나눠둔 이유는 **보여줄 코드가 없기 때문이다.** 자동매칭의 코드는
   * 서버가 만들어 둘에게만 알려준 것이라 남에게 전달할 일이 없고, 그것을 화면에 띄우면
   * "이 코드를 알려주라"는 뜻으로 읽힌다. 둘 중 먼저 도착한 쪽만 잠깐 이 상태에 있는다.
   */
  | { readonly kind: 'pairing' }
  /**
   * 명단이 정해졌고 양쪽이 준비를 누르기를 기다린다.
   *
   * 상대가 들어오자마자 시작하면 누구와 붙는지 볼 겨를도, 손을 키보드에 올릴 겨를도
   * 없다 — 첫 단어가 이미 내려오고 있다.
   */
  | {
      readonly kind: 'ready'
      readonly players: readonly PlayerInfo[]
      readonly ready: readonly PlayerId[]
      readonly selfId: PlayerId
      /** 주고받은 말. 코드로 모인 방에서만 오간다 */
      readonly chat: readonly ChatLine[]
      readonly chatEnabled: boolean
      readonly matchModeChoice: MatchModeChoice
      readonly canChangeMatchMode: boolean
    }
  /**
   * 모두 준비했고 곧 시작한다. 남은 셈을 화면이 크게 보여준다.
   * 양쪽이 각자 세지만 시작 신호를 받은 시점이 기준이라 거의 같이 끝난다.
   */
  | {
      readonly kind: 'countdown'
      readonly players: readonly PlayerInfo[]
      readonly secondsLeft: number
      /** 판이 열리면 처음 떨굴 사람 */
      readonly starter: PlayerId | null
      readonly matchMode: MatchMode
    }
  | { readonly kind: 'playing'; readonly engine: MatchEngine }
  | { readonly kind: 'failed'; readonly failure: TransportFailure }

/**
 * 방에 붙는 세 가지 길.
 *
 * `auto`가 `host`와 갈라져 있는 이유는 **코드를 이미 알고 있다는 것**이다. 방을 열되
 * 그 코드는 서버가 정해준 것이라 새로 만들지 않고, 상대도 같은 코드로 방을 열며 들어온다.
 */
type OpenMode =
  | { readonly kind: 'host'; readonly matchModeChoice?: MatchModeChoice }
  | { readonly kind: 'join'; readonly code: string; readonly matchModeChoice?: MatchModeChoice }
  | { readonly kind: 'auto'; readonly code: string }

interface SessionOptions {
  readonly nickname: string
  /**
   * 시작까지 세는 초. 0이면 곧바로 연다.
   *
   * 개발용 루프백은 0으로 둔다 — 그 화면은 대전 규칙을 눌러보려고 있는 것이라
   * 매번 셋을 세고 기다리면 확인이 번거로워진다.
   */
  readonly countdownSec?: number
  /** 이 기기의 id. 레이팅을 판 너머로 묶는 유일한 열쇠다 */
  readonly deviceId: string
  /**
   * 지금 시각(ms). 같은 말이 연달아 오는 것을 막는 데만 쓴다.
   * 시험에서 시간을 손으로 밀 수 있게 여기로 뺐다 — 기본은 벽시계다.
   */
  readonly chatClock?: () => number
  /** 상대 화면에 뜰 아이콘(물건 id). 안 골랐으면 빈 문자열 */
  readonly icon: string
  readonly onPhase: (phase: SessionPhase) => void
}

class MatchSession {
  private transport: Transport | null = null
  private engine: MatchEngine | null = null
  private creatingEngine = false
  /** 겹친 생성 중 늦게 끝난 엔진이 현재 판을 덮어쓰지 못하게 하는 세대 번호. */
  private engineGeneration = 0
  /** 새 물리 세계를 기다리는 동안 먼저 온 새 판 메시지. 순서를 보존해 재생한다. */
  private readonly pendingEngineEvents: TransportEvent[] = []
  private readonly nickname: string
  private readonly deviceId: string
  private readonly icon: string
  private readonly countdownSec: number
  private countdownTimer: ReturnType<typeof setTimeout> | null = null
  private readonly onPhase: (phase: SessionPhase) => void
  private disposed = false
  /** 참가자 쪽에서 start를 두 번 받아도 판을 두 번 만들지 않게 */
  private started = false
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  /** 자동매칭으로 붙었는가. 준비 시한을 두는 것도, 코드를 감추는 것도 이 경우뿐이다 */
  private autoMatched = false
  private matchModeChoice: MatchModeChoice = 'roulette'
  private systemMessageSeq = 0
  /**
   * 말을 걸 수 있는 방인가.
   *
   * **코드를 주고받아 모인 방만 그렇다.** 랭크 게임은 서로 모르는 사이라 말을 걸
   * 자리가 아니고, 모르는 사람에게 무엇이든 보낼 수 있는 통로를 열어두면 그것을
   * 지켜볼 사람이 없다.
   */
  private get chatEnabled(): boolean {
    return !this.autoMatched
  }
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  /** 준비 단계의 명단. 방장이 정하고 참가자는 받아 쓴다 */
  private roster: readonly PlayerInfo[] = []
  private readonly ready = new Set<PlayerId>()
  /** 방장이 모으는 참가자들. 방장 자신은 여기 없고 명단을 만들 때 앞에 붙는다 */
  private readonly joined = new Map<PlayerId, PlayerInfo>()
  /**
   * 판을 거듭하며 쌓이는 승수.
   *
   * 엔진이 아니라 여기서 들고 있는 이유는 엔진이 판마다 새로 만들어지기 때문이다.
   * 엔진에 이 Map을 그대로 넘겨 고치게 한다.
   */
  private readonly wins = new Map<PlayerId, number>()
  /**
   * 주고받은 말. **엔진이 아니라 여기서 들고 있다** — 준비 화면에서 나눈 말이 판이
   * 열리는 순간 사라지면 안 되는데, 엔진은 판마다 새로 만들어진다.
   */
  private readonly chat = new ChatLog()
  private readonly chatClock: () => number

  private constructor(options: SessionOptions) {
    this.nickname = sanitizeNickname(options.nickname)
    this.deviceId = options.deviceId
    this.icon = options.icon
    this.countdownSec = options.countdownSec ?? COUNTDOWN_SEC
    this.chatClock = options.chatClock ?? (() => Date.now())
    this.onPhase = options.onPhase
  }

  static open(mode: OpenMode, options: SessionOptions): MatchSession {
    const session = new MatchSession(options)
    session.autoMatched = mode.kind === 'auto'
    session.matchModeChoice = mode.kind === 'auto'
      ? 'roulette'
      : mode.matchModeChoice ?? 'roulette'
    session.onPhase({ kind: 'connecting' })
    void session.connect(mode)
    return session
  }

  /**
   * 이미 붙어 있는 전송로로 시작한다. 개발용 루프백 화면의 입구다.
   *
   * 연결 절차만 건너뛰고 **핸드셰이크부터는 실제와 같은 경로**를 탄다 —
   * hello/start 교환, 시드 합의, 엔진 생성이 그대로 일어나므로 서버가 없어도
   * 그 뒤의 모든 규칙을 확인할 수 있다.
   */
  static attach(
    transport: Transport,
    listen: (onEvent: (event: TransportEvent) => void) => void,
    options: SessionOptions,
  ): MatchSession {
    const session = new MatchSession(options)
    session.transport = transport
    listen((event) => session.handleEvent(event))
    if (transport.isHost) {
      session.emitWaiting()
    } else {
      session.onPhase({ kind: 'handshaking' })
      session.armHandshakeTimeout()
      transport.broadcast({
        t: 'hello',
        nickname: session.nickname,
        device: session.deviceId,
        icon: session.icon,
      })
    }
    return session
  }

  private async connect(mode: OpenMode): Promise<void> {
    const handlers = { onEvent: (event: TransportEvent) => this.handleEvent(event) }
    try {
      const transport = await openTransport(mode, handlers)

      if (this.disposed) {
        transport.close()
        return
      }
      this.transport = transport

      if (transport.isHost) {
        /*
         * 자동매칭에서는 **둘 다 방을 만들며 붙는다.** 서로를 모르니 누가 방을 열지
         * 정해줄 수가 없어서, 중계가 먼저 도착한 쪽을 방장으로 삼게 맡긴다.
         * 그래서 여기서 방장이 되었다는 것은 "내가 조금 빨랐다"는 뜻일 뿐이다.
         */
        this.onPhase(
          this.autoMatched
            ? { kind: 'pairing' }
            : {
                kind: 'waiting',
                roomCode: transport.roomCode ?? '',
                matchModeChoice: this.matchModeChoice,
                canChangeMatchMode: true,
              },
        )
      } else {
        // 참가자는 붙자마자 자기를 알린다. 방장이 명단을 만들 수 있어야 한다
        this.onPhase({ kind: 'handshaking' })
        this.armHandshakeTimeout()
        transport.broadcast({
          t: 'hello',
          nickname: this.nickname,
          device: this.deviceId,
          icon: this.icon,
        })
      }
    } catch (error) {
      if (!this.disposed) {
        this.onPhase({ kind: 'failed', failure: asFailure(error) })
      }
    }
  }

  private handleEvent(event: TransportEvent): void {
    if (this.disposed) {
      return
    }
    const transport = this.transport

    if (this.creatingEngine) {
      // 구형 참가자의 판 ID 없는 명령은 어느 판의 것인지 알 수 없어 새 엔진에 넘기지 않는다.
      if (
        this.transport?.isHost === true &&
        event.kind === 'message' &&
        (event.message.t === 'drop' || event.message.t === 'rematch') &&
        (!('matchId' in event.message) || event.message.matchId === undefined)
      ) {
        return
      }
      if (event.kind === 'error') {
        this.engineGeneration += 1
        this.creatingEngine = false
        this.started = false
        this.pendingEngineEvents.length = 0
        this.onPhase({ kind: 'failed', failure: event.failure })
        return
      }
      this.pendingEngineEvents.push(event)
      return
    }

    // 판이 시작된 뒤에는 엔진이 받아 처리한다
    if (this.engine !== null) {
      this.engine.handleTransportEvent(event)
      return
    }

    if (event.kind === 'error') {
      this.onPhase({ kind: 'failed', failure: event.failure })
      return
    }
    if (transport === null) {
      return
    }

    if (event.kind === 'peerJoined') {
      // 방장 쪽: 상대가 붙었다. 여기서 멈추면 hello가 오지 않은 것이다
      this.onPhase({ kind: 'handshaking' })
      this.armHandshakeTimeout()
      return
    }
    if (event.kind === 'peerLeft') {
      /*
       * 시작 전에 누가 나갔다. 여덟까지 붙으므로 **한 명이 나갔다고 판을 접지 않는다** —
       * 명단에서 빼고 남은 사람들끼리 기다린다. 아무도 남지 않았을 때만 실패다.
       */
      if (transport.isHost) {
        this.joined.delete(event.peer)
        this.ready.delete(event.peer)
        this.rebuildRoster()
        if (this.joined.size > 0) {
          transport.broadcast({
            t: 'roster',
            players: this.roster,
            matchModeChoice: this.matchModeChoice,
          })
          this.publishReady()
          return
        }
      } else if (this.roster.length > 2) {
        // 참가자 쪽은 방장이 보내줄 새 명단을 기다린다
        return
      }
      this.onPhase({ kind: 'failed', failure: failure('peerLost') })
      return
    }
    if (event.kind !== 'message') {
      return
    }
    // 참가자는 준비·시작 메시지도 실제 방장에게서 온 것만 따른다.
    if (!transport.isHost && event.from !== transport.hostId) {
      return
    }

    if (transport.isHost && event.message.t === 'hello') {
      /*
       * 명단에 **더한다.** 예전에는 [방장, 방금 온 사람] 둘로 덮어썼는데,
       * 정원이 여덟이 된 지금 그러면 셋째가 들어오는 순간 둘째가 사라진다.
       */
      this.joined.set(event.from, {
        id: event.from,
        nickname: event.message.nickname,
        device: event.message.device,
        icon: event.message.icon,
      })
      this.rebuildRoster()
      this.clearHandshakeTimeout()
      transport.broadcast({
        t: 'roster',
        players: this.roster,
        matchModeChoice: this.matchModeChoice,
      })
      this.emitReady()
      return
    }

    // 참가자가 준비를 눌렀다. 판을 여는 것은 모두가 눌렀을 때다
    if (event.message.t === 'chat') {
      // 거르는 것은 방장의 일이다. 참가자가 보낸 것은 여기서 한 번만 통과한다
      this.receiveChat(event.from, event.message.text)
      return
    }
    if (!transport.isHost && event.message.t === 'chatted') {
      this.chat.add(event.message.from, this.nameOf(event.message.from), event.message.text, this.chatClock())
      this.emitReady()
      return
    }

    if (transport.isHost && event.message.t === 'ready') {
      this.ready.add(event.from)
      this.publishReady()
      return
    }

    if (transport.isHost && event.message.t === 'mode') {
      // 모드는 방장이 정한다. 참가자의 요청은 지금 UI에서 보내지 않지만, 들어와도 무시한다
      return
    }

    if (!transport.isHost && event.message.t === 'roster') {
      this.roster = event.message.players
      if (event.message.matchModeChoice !== undefined) {
        this.matchModeChoice = event.message.matchModeChoice
      }
      this.clearHandshakeTimeout()
      this.emitReady()
      return
    }

    if (!transport.isHost && event.message.t === 'mode') {
      this.matchModeChoice = event.message.matchModeChoice
      this.ready.clear()
      this.emitReady()
      return
    }

    if (!transport.isHost && event.message.t === 'readyList') {
      this.ready.clear()
      for (const id of event.message.ready) {
        this.ready.add(id)
      }
      this.emitReady()
      return
    }

    if (!transport.isHost && event.message.t === 'start') {
      this.countDown(event.message.players, event.message.seed, event.message.matchMode)
    }
  }

  /** 화면에서 준비를 눌렀다 */
  setReady(): void {
    const transport = this.transport
    if (transport === null || this.started) {
      return
    }
    if (transport.isHost) {
      this.ready.add(transport.selfId)
      this.publishReady()
      return
    }
    // 참가자는 방장에게 청하고, 명단은 방장이 되돌려주는 것을 따른다
    transport.broadcast({ t: 'ready' })
  }

  /**
   * 준비 화면에서 한마디 한다. 판이 열린 뒤에는 엔진이 같은 일을 맡는다.
   *
   * 나눠 맡는 이유는 전송로를 쥔 쪽이 단계마다 다르기 때문이다 — 기록만은 하나를
   * 함께 써서, 판이 열려도 그때까지의 말이 그대로 이어진다.
   */
  sendChat(text: string): void {
    const transport = this.transport
    if (transport === null || !this.chatEnabled) {
      return
    }
    if (transport.isHost) {
      this.receiveChat(transport.selfId, text)
      return
    }
    transport.broadcast({ t: 'chat', text })
  }

  setMatchModeChoice(choice: MatchModeChoice): void {
    const transport = this.transport
    if (transport === null || this.started || this.autoMatched) {
      return
    }
    if (!transport.isHost) {
      transport.broadcast({ t: 'mode', matchModeChoice: choice })
      return
    }
    if (choice === this.matchModeChoice) {
      return
    }
    this.matchModeChoice = choice
    this.ready.clear()
    transport.broadcast({ t: 'mode', matchModeChoice: choice })
    transport.broadcast({ t: 'readyList', ready: [] })
    this.announceModeChange(choice)
    if (this.joined.size === 0) {
      this.emitWaiting()
      return
    }
    this.emitReady()
  }

  /** 방장만 한다. 걸러 남은 말만 모두에게 돌린다 */
  private receiveChat(from: PlayerId, text: string): void {
    const transport = this.transport
    if (transport === null || !transport.isHost || !this.chatEnabled) {
      return
    }
    const line = this.chat.add(from, this.nameOf(from), text, this.chatClock())
    if (line === null) {
      return
    }
    transport.broadcast({ t: 'chatted', from, text: line.text })
    this.emitReady()
  }

  private announceModeChange(choice: MatchModeChoice): void {
    const transport = this.transport
    if (transport === null || !transport.isHost || !this.chatEnabled) {
      return
    }
    const from = `system:${this.systemMessageSeq += 1}`
    const text = `모드가 ${MATCH_MODE_CHOICE_LABELS[choice]}로 바뀌었습니다. 준비가 해제되었습니다.`
    const line = this.chat.add(from, '알림', text, this.chatClock())
    if (line === null) {
      return
    }
    transport.broadcast({ t: 'chatted', from, text: line.text })
  }

  private nameOf(id: PlayerId): string {
    return this.roster.find((player) => player.id === id)?.nickname ?? '이름없음'
  }

  /** 방장이 자기를 맨 앞에 두고 들어온 순서대로 명단을 만든다 — 그 순서가 곧 차례다 */
  private rebuildRoster(): void {
    const transport = this.transport
    if (transport === null) {
      return
    }
    this.roster = [
      { id: transport.selfId, nickname: this.nickname, device: this.deviceId, icon: this.icon },
      ...this.joined.values(),
    ]
  }

  /** 방장만 부른다. 모두 준비됐으면 여기서 판이 열린다 */
  private publishReady(): void {
    const transport = this.transport
    if (transport === null) {
      return
    }
    transport.broadcast({ t: 'readyList', ready: [...this.ready] })
    this.emitReady()

    const allReady =
      this.roster.length > 0 && this.roster.every((player) => this.ready.has(player.id))
    if (!allReady) {
      return
    }
    const seed = Date.now() >>> 0
    const matchMode = resolveMatchMode(this.matchModeChoice, seed)
    transport.broadcast({ t: 'start', seed, players: this.roster, matchMode })
    this.countDown(this.roster, seed, matchMode)
  }

  private emitReady(): void {
    const transport = this.transport
    /*
     * 이미 세고 있으면 준비 화면으로 되돌리지 않는다.
     *
     * 세는 중에 누가 준비를 다시 누르면 방장이 명단을 다시 알리는데, 그때마다
     * 준비 화면이 다시 뜨면 셈이 화면에서 사라진다 — 판은 열리는데 아무도
     * 언제 열리는지 못 본다.
     */
    if (transport === null || this.started || this.countdownTimer !== null) {
      return
    }
    this.armReadyTimeout()
    this.onPhase({
      kind: 'ready',
      players: this.roster,
      ready: [...this.ready],
      selfId: transport.selfId,
      chat: this.chat.view,
      chatEnabled: this.chatEnabled,
      matchModeChoice: this.matchModeChoice,
      canChangeMatchMode: transport.isHost && this.chatEnabled,
    })
  }

  private emitWaiting(): void {
    const transport = this.transport
    if (transport === null || !transport.isHost || this.autoMatched) {
      return
    }
    this.onPhase({
      kind: 'waiting',
      roomCode: transport.roomCode ?? '',
      matchModeChoice: this.matchModeChoice,
      canChangeMatchMode: true,
    })
  }

  /**
   * 자동매칭에서만 준비에 시한을 둔다.
   *
   * 코드로 모을 때는 아는 사람끼리라 안 누르면 말로 해결한다. 모르는 사람과 붙으면
   * **창을 열어두고 가버린 것과 구분할 수 없어서**, 시한이 없으면 준비를 누른 쪽이
   * 영원히 그 화면에 남는다. 시한이 지나면 실패로 알리고, 화면은 그것을 받아 다시
   * 줄에 세운다 — 이 층은 줄을 모르므로 여기서 하는 일은 끊는 것까지다.
   */
  private armReadyTimeout(): void {
    if (!this.autoMatched || this.readyTimer !== null) {
      return
    }
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null
      if (!this.started && !this.disposed) {
        this.onPhase({ kind: 'failed', failure: failure('readyTimeout') })
      }
    }, READY_TIMEOUT_MS)
  }

  private clearReadyTimeout(): void {
    if (this.readyTimer !== null) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
  }

  /**
   * 시작 신호가 오지 않으면 영원히 기다리게 되므로 시한을 둔다.
   * 연결 자체는 성공했으니 전송로가 알려줄 실패가 없다 — 이 층이 스스로 끊어야 한다.
   */
  private armHandshakeTimeout(): void {
    if (this.handshakeTimer !== null) {
      return
    }
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null
      if (!this.started && !this.disposed) {
        this.onPhase({ kind: 'failed', failure: failure('handshakeStalled') })
      }
    }, HANDSHAKE_TIMEOUT_MS)
  }

  private clearHandshakeTimeout(): void {
    if (this.handshakeTimer !== null) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  /**
   * 시작까지 센다. 다 세면 판을 연다.
   *
   * 이미 세고 있으면 다시 시작하지 않는다 — start가 두 번 오더라도(재전송, 이중 이펙트)
   * 셈이 되돌아가면 안 된다.
   */
  private countDown(players: readonly PlayerInfo[], seed: number, matchMode: MatchMode): void {
    if (this.started || this.countdownTimer !== null) {
      return
    }
    // 다 준비했으므로 준비 시한은 여기서 끝난다
    this.clearReadyTimeout()
    if (this.countdownSec <= 0) {
      void this.begin(players, seed, matchMode)
      return
    }

    this.roster = players
    let left = this.countdownSec
    const starter = starterOf(seed, players)
    this.onPhase({ kind: 'countdown', players, secondsLeft: left, starter, matchMode })

    const tick = () => {
      left -= 1
      if (this.disposed) {
        return
      }
      if (left <= 0) {
        this.countdownTimer = null
        void this.begin(players, seed, matchMode)
        return
      }
      this.onPhase({ kind: 'countdown', players, secondsLeft: left, starter, matchMode })
      this.countdownTimer = setTimeout(tick, 1000)
    }
    this.countdownTimer = setTimeout(tick, 1000)
  }

  /** 양쪽이 같은 명단과 같은 시드로 판을 만든다 */
  private async begin(players: readonly PlayerInfo[], seed: number, matchMode: MatchMode): Promise<void> {
    const transport = this.transport
    if (transport === null || this.started) {
      return
    }
    this.started = true
    this.creatingEngine = true
    const generation = ++this.engineGeneration
    this.roster = players
    this.clearHandshakeTimeout()

    let engine: MatchEngine
    try {
      engine = await MatchEngine.create({
        transport,
        players,
        seed,
        matchMode,
        starter: starterOf(seed, players),
        wins: this.wins,
        chat: this.chat,
        chatEnabled: this.chatEnabled,
        chatClock: this.chatClock,
        // 코드로 모인 방은 상대를 고를 수 있어 사다리에 올리지 않는다
        ranked: this.autoMatched,
        onFailure: (reason) => this.onPhase({ kind: 'failed', failure: reason }),
        onRestart: (next) => this.restart(next),
      })
    } catch (error) {
      if (!this.disposed && generation === this.engineGeneration) {
        this.creatingEngine = false
        this.started = false
        this.onPhase({ kind: 'failed', failure: asFailure(error) })
      }
      return
    }
    if (this.disposed || generation !== this.engineGeneration) {
      engine.dispose()
      return
    }
    this.engine = engine
    this.creatingEngine = false
    engine.start()
    for (const event of this.pendingEngineEvents.splice(0)) {
      if (generation !== this.engineGeneration || this.engine !== engine) break
      engine.handleTransportEvent(event)
    }
    if (generation === this.engineGeneration && this.engine === engine) {
      this.onPhase({ kind: 'playing', engine })
    }
  }

  /**
   * 다음 판. 명단과 승수는 그대로 두고 판만 새로 연다.
   *
   * 엔진을 갈아치우는 일을 엔진 자신에게 맡길 수 없어서 여기로 올려두었다.
   * 시드가 바뀌므로 단어도 새로 나온다.
   */
  private restart(seed: number): void {
    if (this.disposed) {
      return
    }
    this.engineGeneration += 1
    this.engine?.dispose()
    this.engine = null
    this.creatingEngine = false
    this.pendingEngineEvents.length = 0
    this.started = false
    void this.begin(this.roster, seed, resolveMatchMode(this.matchModeChoice, seed))
  }

  dispose(): void {
    this.disposed = true
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer)
      this.countdownTimer = null
    }
    this.clearHandshakeTimeout()
    this.clearReadyTimeout()
    // 상대가 영문을 모른 채 기다리지 않게, 끊기 전에 나간다고 알린다
    this.engine?.announceLeave()
    this.engine?.dispose()
    this.engine = null
    this.transport?.close()
    this.transport = null
  }
}

/** 방 코드는 우리가 만들어 서버에 알려준다 — 서버는 그 이름의 방을 열어줄 뿐이다 */
function openTransport(
  mode: OpenMode,
  handlers: { onEvent: (event: TransportEvent) => void },
): Promise<Transport> {
  if (mode.kind === 'host') {
    return RelayTransport.host(RELAY_URL, createRoomCode(Math.random), handlers)
  }
  /*
   * 자동매칭도 **방을 만들며** 붙는다(`host`). 서로를 모르니 누가 열지 정해줄 수 없어서
   * 둘 다 열려고 하고, 중계가 먼저 온 쪽을 방장으로 삼는다. `join`으로 붙이면 늦게 온
   * 쪽이 "그 코드로 기다리는 방이 없다"를 받는데, 그건 누가 먼저 붙느냐에 달린 것이라
   * 절반의 확률로 실패한다.
   */
  return mode.kind === 'auto'
    ? RelayTransport.host(RELAY_URL, mode.code, handlers)
    : RelayTransport.join(RELAY_URL, mode.code, handlers)
}

function asFailure(error: unknown): TransportFailure {
  if (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    'message' in error
  ) {
    return error as TransportFailure
  }
  return failure('unknown')
}

export { MatchSession, READY_TIMEOUT_MS }
export type { SessionPhase, SessionOptions, OpenMode }
