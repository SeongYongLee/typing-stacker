import { MatchEngine } from './MatchEngine.ts'
import { PeerTransport } from './PeerTransport.ts'
import { RelayTransport } from './RelayTransport.ts'
import { createRoomCode } from './protocol.ts'
import { sanitizeNickname } from './protocol.ts'
import type { PlayerInfo } from './protocol.ts'
import { failure } from './Transport.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

/** 붙은 뒤 시작 신호를 이만큼 기다린다. 넘으면 양쪽이 영원히 기다리는 대신 실패로 끊는다 */
const HANDSHAKE_TIMEOUT_MS = 10000

/**
 * 중계 서버 주소. 설정돼 있으면 P2P 대신 중계로 붙는다.
 *
 * P2P는 NAT을 통과해야만 동작하는데 그 조건이 망마다 달라서, 같은 Wi-Fi의 두 기기조차
 * 못 붙는 경우가 있다(공유기의 멀티캐스트 차단 + 헤어핀 NAT). 중계는 그 조건을 없앤다.
 * 주소가 없으면 P2P로 떨어지므로, 서버를 띄우지 않아도 예전처럼 동작은 한다.
 */
const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? ''

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
   * hello/start 교환, 시드 합의, 엔진 생성이 그대로 일어나므로 WebRTC가 없어도
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
      const players: PlayerInfo[] = [
        { id: transport.selfId, nickname: this.nickname },
        { id: event.from, nickname: event.message.nickname },
      ]
      const seed = Date.now() >>> 0
      transport.broadcast({ t: 'start', seed, players })
      void this.begin(players, seed)
      return
    }

    if (!transport.isHost && event.message.t === 'start') {
      void this.begin(event.message.players, event.message.seed)
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

  /** 양쪽이 같은 명단과 같은 시드로 판을 만든다 */
  private async begin(players: readonly PlayerInfo[], seed: number): Promise<void> {
    const transport = this.transport
    if (transport === null || this.started) {
      return
    }
    this.started = true
    this.clearHandshakeTimeout()

    const engine = await MatchEngine.create({
      transport,
      players,
      seed,
      onFailure: (reason) => this.onPhase({ kind: 'failed', failure: reason }),
    })
    if (this.disposed) {
      engine.dispose()
      return
    }
    this.engine = engine
    engine.start()
    this.onPhase({ kind: 'playing', engine })
  }

  dispose(): void {
    this.disposed = true
    this.clearHandshakeTimeout()
    this.engine?.dispose()
    this.engine = null
    this.transport?.close()
    this.transport = null
  }
}

/**
 * 중계 주소가 있으면 중계로, 없으면 P2P로 붙는다.
 * 방 코드를 만드는 쪽이 갈리는데, P2P는 코드가 곧 peer id라 전송로가 정하고
 * 중계는 우리가 정해 서버에 알려준다.
 */
function openTransport(
  mode: { kind: 'host' } | { kind: 'join'; code: string },
  handlers: { onEvent: (event: TransportEvent) => void },
): Promise<Transport> {
  if (RELAY_URL === '') {
    return mode.kind === 'host'
      ? PeerTransport.host(handlers)
      : PeerTransport.join(mode.code, handlers)
  }
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
