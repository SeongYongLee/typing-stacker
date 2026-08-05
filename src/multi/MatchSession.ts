import { MatchEngine } from './MatchEngine.ts'
import { PeerTransport } from './PeerTransport.ts'
import { sanitizeNickname } from './protocol.ts'
import type { PlayerInfo } from './protocol.ts'
import { failure } from './Transport.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

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
  | { readonly kind: 'connecting' }
  /** 방장이 상대를 기다리는 중. 이 코드를 상대에게 전달해야 한다 */
  | { readonly kind: 'waiting'; readonly roomCode: string }
  | { readonly kind: 'playing'; readonly engine: MatchEngine }
  | { readonly kind: 'failed'; readonly failure: TransportFailure }

interface SessionOptions {
  readonly nickname: string
  readonly onPhase: (phase: SessionPhase) => void
  /** false면 IP를 가리지 않는다. 공용 TURN이 막혔을 때의 탈출구 */
  readonly hideIp?: boolean
}

class MatchSession {
  private transport: Transport | null = null
  private engine: MatchEngine | null = null
  private readonly nickname: string
  private readonly onPhase: (phase: SessionPhase) => void
  private disposed = false
  /** 참가자 쪽에서 start를 두 번 받아도 판을 두 번 만들지 않게 */
  private started = false

  private constructor(options: SessionOptions) {
    this.nickname = sanitizeNickname(options.nickname)
    this.onPhase = options.onPhase
  }

  static open(mode: { kind: 'host' } | { kind: 'join'; code: string }, options: SessionOptions): MatchSession {
    const session = new MatchSession(options)
    session.onPhase({ kind: 'connecting' })
    void session.connect(mode, options.hideIp)
    return session
  }

  private async connect(
    mode: { kind: 'host' } | { kind: 'join'; code: string },
    hideIp: boolean | undefined,
  ): Promise<void> {
    const handlers = {
      onEvent: (event: TransportEvent) => this.handleEvent(event),
      ...(hideIp === undefined ? {} : { hideIp }),
    }
    try {
      const transport =
        mode.kind === 'host'
          ? await PeerTransport.host(handlers)
          : await PeerTransport.join(mode.code, handlers)

      if (this.disposed) {
        transport.close()
        return
      }
      this.transport = transport

      if (transport.isHost) {
        this.onPhase({ kind: 'waiting', roomCode: transport.roomCode ?? '' })
      } else {
        // 참가자는 붙자마자 자기를 알린다. 방장이 명단을 만들 수 있어야 한다
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

  /** 양쪽이 같은 명단과 같은 시드로 판을 만든다 */
  private async begin(players: readonly PlayerInfo[], seed: number): Promise<void> {
    const transport = this.transport
    if (transport === null || this.started) {
      return
    }
    this.started = true

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
    this.engine?.dispose()
    this.engine = null
    this.transport?.close()
    this.transport = null
  }
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
