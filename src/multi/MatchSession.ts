import { MatchEngine } from './MatchEngine.ts'
import { RelayTransport } from './RelayTransport.ts'
import { createRoomCode } from './protocol.ts'
import { sanitizeNickname } from './protocol.ts'
import type { PlayerId, PlayerInfo } from './protocol.ts'
import { failure } from './Transport.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

/** 붙은 뒤 시작 신호를 이만큼 기다린다. 넘으면 양쪽이 영원히 기다리는 대신 실패로 끊는다 */
const HANDSHAKE_TIMEOUT_MS = 10000

/**
 * 중계 서버 주소.
 *
 * 직접 붙이는 길(WebRTC)은 NAT을 통과해야만 동작하는데 그 조건이 망마다 달라서, 같은
 * Wi-Fi의 두 기기도 LTE와 Wi-Fi도 붙지 못했다(멀티캐스트 차단·헤어핀 NAT·이동통신
 * CGNAT). 중계는 그 조건을 없앤다 — 바깥으로 나가는 WebSocket 하나면 되고 그건
 * 어디서나 열린다. 그래서 그 길은 남겨두지 않고 지웠다.
 *
 * **주소를 여기 적어두는 이유**는 이것이 비밀이 아니기 때문이다. 어차피 클라이언트
 * 번들에 그대로 실려 나가므로 숨겨봐야 얻는 게 없고, 대신 빌드 설정에 숨겨두면
 * 새로 받은 사람이 "왜 대전이 안 되지"를 코드에서 찾을 수 없다.
 * 로컬 중계로 시험할 때만 VITE_RELAY_URL로 덮어쓴다.
 */
const DEFAULT_RELAY_URL = 'wss://typing-stacker-relay.typing-stacker-relay.workers.dev'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? DEFAULT_RELAY_URL

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
  | { readonly kind: 'waiting'; readonly roomCode: string }
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
    }
  | { readonly kind: 'playing'; readonly engine: MatchEngine }
  | { readonly kind: 'failed'; readonly failure: TransportFailure }

interface SessionOptions {
  readonly nickname: string
  readonly onPhase: (phase: SessionPhase) => void
}

class MatchSession {
  private transport: Transport | null = null
  private engine: MatchEngine | null = null
  private readonly nickname: string
  private readonly onPhase: (phase: SessionPhase) => void
  private disposed = false
  /** 참가자 쪽에서 start를 두 번 받아도 판을 두 번 만들지 않게 */
  private started = false
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  /** 준비 단계의 명단. 방장이 정하고 참가자는 받아 쓴다 */
  private roster: readonly PlayerInfo[] = []
  private readonly ready = new Set<PlayerId>()
  /**
   * 판을 거듭하며 쌓이는 승수.
   *
   * 엔진이 아니라 여기서 들고 있는 이유는 엔진이 판마다 새로 만들어지기 때문이다.
   * 엔진에 이 Map을 그대로 넘겨 고치게 한다.
   */
  private readonly wins = new Map<PlayerId, number>()

  private constructor(options: SessionOptions) {
    this.nickname = sanitizeNickname(options.nickname)
    this.onPhase = options.onPhase
  }

  static open(mode: { kind: 'host' } | { kind: 'join'; code: string }, options: SessionOptions): MatchSession {
    const session = new MatchSession(options)
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
      session.onPhase({ kind: 'waiting', roomCode: transport.roomCode ?? '' })
    } else {
      session.onPhase({ kind: 'handshaking' })
      session.armHandshakeTimeout()
      transport.broadcast({ t: 'hello', nickname: session.nickname })
    }
    return session
  }

  private async connect(
    mode: { kind: 'host' } | { kind: 'join'; code: string },
  ): Promise<void> {
    const handlers = { onEvent: (event: TransportEvent) => this.handleEvent(event) }
    try {
      const transport = await openTransport(mode, handlers)

      if (this.disposed) {
        transport.close()
        return
      }
      this.transport = transport

      if (transport.isHost) {
        this.onPhase({ kind: 'waiting', roomCode: transport.roomCode ?? '' })
      } else {
        // 참가자는 붙자마자 자기를 알린다. 방장이 명단을 만들 수 있어야 한다
        this.onPhase({ kind: 'handshaking' })
        this.armHandshakeTimeout()
        transport.broadcast({ t: 'hello', nickname: this.nickname })
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
      // 아직 시작도 못 했는데 상대가 사라졌다
      this.onPhase({ kind: 'failed', failure: failure('peerLost') })
      return
    }
    if (event.kind !== 'message') {
      return
    }

    if (transport.isHost && event.message.t === 'hello') {
      this.roster = [
        { id: transport.selfId, nickname: this.nickname },
        { id: event.from, nickname: event.message.nickname },
      ]
      this.clearHandshakeTimeout()
      transport.broadcast({ t: 'roster', players: this.roster })
      this.emitReady()
      return
    }

    // 참가자가 준비를 눌렀다. 판을 여는 것은 모두가 눌렀을 때다
    if (transport.isHost && event.message.t === 'ready') {
      this.ready.add(event.from)
      this.publishReady()
      return
    }

    if (!transport.isHost && event.message.t === 'roster') {
      this.roster = event.message.players
      this.clearHandshakeTimeout()
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
      void this.begin(event.message.players, event.message.seed)
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
    transport.broadcast({ t: 'start', seed, players: this.roster })
    void this.begin(this.roster, seed)
  }

  private emitReady(): void {
    const transport = this.transport
    if (transport === null || this.started) {
      return
    }
    this.onPhase({
      kind: 'ready',
      players: this.roster,
      ready: [...this.ready],
      selfId: transport.selfId,
    })
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

  /** 양쪽이 같은 명단과 같은 시드로 판을 만든다 */
  private async begin(players: readonly PlayerInfo[], seed: number): Promise<void> {
    const transport = this.transport
    if (transport === null || this.started) {
      return
    }
    this.started = true
    this.roster = players
    this.clearHandshakeTimeout()

    const engine = await MatchEngine.create({
      transport,
      players,
      seed,
      wins: this.wins,
      onFailure: (reason) => this.onPhase({ kind: 'failed', failure: reason }),
      onRestart: (next) => this.restart(next),
    })
    if (this.disposed) {
      engine.dispose()
      return
    }
    // 다음 판이면 앞 판의 엔진을 확실히 치운다 — 남겨두면 물리 세계가 둘이 된다
    this.engine?.dispose()
    this.engine = engine
    engine.start()
    this.onPhase({ kind: 'playing', engine })
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
    this.started = false
    void this.begin(this.roster, seed)
  }

  dispose(): void {
    this.disposed = true
    this.clearHandshakeTimeout()
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
  mode: { kind: 'host' } | { kind: 'join'; code: string },
  handlers: { onEvent: (event: TransportEvent) => void },
): Promise<Transport> {
  return mode.kind === 'host'
    ? RelayTransport.host(RELAY_URL, createRoomCode(Math.random), handlers)
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

export { MatchSession }
export type { SessionPhase, SessionOptions }
