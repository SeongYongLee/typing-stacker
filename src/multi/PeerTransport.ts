import Peer, { type DataConnection } from 'peerjs'
import { MAX_PLAYERS, createRoomCode, parseMessage } from './protocol.ts'
import type { Message, PlayerId } from './protocol.ts'
import { failure } from './Transport.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

/**
 * peer id는 공용 브로커의 전역 네임스페이스다. 다른 앱과 부딪히지 않게 접두어를 붙인다.
 * 사용자에게 보여주는 방 코드는 접두어를 뗀 부분이다.
 */
const ID_PREFIX = 'typing-stacker-'

/**
 * WebRTC는 연결을 맺으려면 ICE 후보를 교환하고 거기에 공인 IP가 들어간다.
 * 즉 기본 동작으로는 **상대에게 내 IP가 보인다.**
 *
 * relay를 강제하면 모든 트래픽이 TURN을 거쳐 상대는 TURN 서버 주소만 보게 된다.
 * 대가는 공용 TURN 의존이다 — 그것이 막히면 연결 자체가 실패한다. 그래서 끌 수 있게 뒀다.
 * (PeerJS 기본 설정에 STUN과 공용 TURN이 이미 들어있어 서버를 따로 둘 필요는 없다.)
 */
const HIDE_IP_BY_DEFAULT = true

/** 방 코드가 겹치면 다시 뽑는다. 8자라 실제로 겹칠 일은 드물다 */
const CODE_RETRY_LIMIT = 5

interface PeerTransportOptions {
  readonly onEvent: (event: TransportEvent) => void
  /** false면 IP를 가리지 않고 직접 연결을 허용한다 (연결 성공률이 올라간다) */
  readonly hideIp?: boolean
}

function rtcConfig(hideIp: boolean): RTCConfiguration | undefined {
  return hideIp ? { iceTransportPolicy: 'relay' } : undefined
}

/**
 * PeerJS 에러 종류를 사용자에게 할 말로 옮긴다.
 * hideIp를 함께 보는 이유는 같은 증상(경로가 안 열림)이 relay 강제 때문일 수 있어서다.
 */
function toFailure(type: string, role: 'host' | 'guest', hideIp: boolean): TransportFailure {
  switch (type) {
    case 'connect-timeout':
      // 방은 찾았는데 미디어 경로가 안 열린 것이다 — "방이 없다"와 구분해야 한다
      return failure(hideIp ? 'relayBlocked' : 'peerLost')
    case 'unavailable-id':
      return failure('codeTaken')
    case 'peer-unavailable':
      return failure(role === 'guest' ? 'roomNotFound' : 'peerLost')
    case 'browser-incompatible':
      return failure('unsupported', false)
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
    case 'ssl-unavailable':
      return failure('brokerUnreachable')
    default:
      return failure('unknown')
  }
}

class PeerTransport implements Transport {
  private readonly peer: Peer
  private readonly connections = new Map<PlayerId, DataConnection>()
  private readonly onEvent: (event: TransportEvent) => void
  readonly isHost: boolean
  readonly roomCode: string | null
  private closed = false

  private constructor(
    peer: Peer,
    isHost: boolean,
    roomCode: string | null,
    onEvent: (event: TransportEvent) => void,
    hideIp: boolean,
  ) {
    this.peer = peer
    this.isHost = isHost
    this.roomCode = roomCode
    this.onEvent = onEvent

    peer.on('error', (error: { type?: string }) => {
      if (this.closed) return
      this.onEvent({
        kind: 'error',
        failure: toFailure(error.type ?? 'unknown', isHost ? 'host' : 'guest', hideIp),
      })
    })

    if (isHost) {
      peer.on('connection', (connection) => this.acceptOrReject(connection))
    }
  }

  get selfId(): PlayerId {
    return this.peer.id
  }

  peers(): readonly PlayerId[] {
    return [...this.connections.keys()]
  }

  /**
   * 방을 만든다. 코드가 겹치면 다시 뽑아 재시도한다.
   * 무작위 대입으로 남의 방에 들어오는 것을 막는 것은 코드 길이(protocol.ts)가 담당한다.
   */
  static async host(options: PeerTransportOptions): Promise<PeerTransport> {
    const hideIp = options.hideIp ?? HIDE_IP_BY_DEFAULT
    let lastError: TransportFailure = failure('unknown')

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = createRoomCode(Math.random)
      const peer = new Peer(ID_PREFIX + code, { config: rtcConfig(hideIp) })
      try {
        await waitForOpen(peer)
        return new PeerTransport(peer, true, code, options.onEvent, hideIp)
      } catch (error) {
        peer.destroy()
        lastError = toFailure(errorType(error), 'host', hideIp)
        // 코드 충돌이 아니면 다시 뽑아도 같은 결과다
        if (lastError.kind !== 'codeTaken') {
          throw lastError
        }
      }
    }
    throw lastError
  }

  /** 방에 들어간다. 방장이 정원 초과로 거절하면 'full'을 받는다 */
  static async join(code: string, options: PeerTransportOptions): Promise<PeerTransport> {
    const hideIp = options.hideIp ?? HIDE_IP_BY_DEFAULT
    const peer = new Peer({ config: rtcConfig(hideIp) })
    try {
      await waitForOpen(peer)
    } catch (error) {
      peer.destroy()
      throw toFailure(errorType(error), 'guest', hideIp)
    }

    const transport = new PeerTransport(peer, false, code, options.onEvent, hideIp)
    const connection = peer.connect(ID_PREFIX + code, { reliable: true })
    try {
      await waitForConnection(peer, connection)
    } catch (error) {
      peer.destroy()
      throw toFailure(errorType(error), 'guest', hideIp)
    }
    transport.register(connection)
    return transport
  }

  sendTo(peer: PlayerId, message: Message): void {
    const connection = this.connections.get(peer)
    if (connection !== undefined && connection.open) {
      connection.send(message)
    }
  }

  broadcast(message: Message): void {
    for (const connection of this.connections.values()) {
      if (connection.open) {
        connection.send(message)
      }
    }
  }

  close(): void {
    this.closed = true
    for (const connection of this.connections.values()) {
      connection.close()
    }
    this.connections.clear()
    this.peer.destroy()
  }

  /**
   * 정원을 넘는 연결은 거절한다.
   * 이걸 빼먹으면 코드를 아는 제3자가 들어와 진행 중인 판을 망친다.
   */
  private acceptOrReject(connection: DataConnection): void {
    if (this.connections.size >= MAX_PLAYERS - 1) {
      connection.on('open', () => {
        connection.send({ t: 'full' } satisfies Message)
        // 거절 메시지가 실제로 나갈 시간을 준 뒤 끊는다
        setTimeout(() => connection.close(), 250)
      })
      return
    }
    this.register(connection)
  }

  private register(connection: DataConnection): void {
    const peerId = connection.peer
    this.connections.set(peerId, connection)

    const announce = () => this.onEvent({ kind: 'peerJoined', peer: peerId })
    if (connection.open) {
      announce()
    } else {
      connection.on('open', announce)
    }

    connection.on('data', (raw) => {
      // 상대가 보낸 것은 전부 거짓일 수 있다. 통과하지 못한 것은 조용히 버린다
      const message = parseMessage(raw)
      if (message !== null) {
        this.onEvent({ kind: 'message', from: peerId, message })
      }
    })

    const drop = () => {
      if (this.connections.delete(peerId) && !this.closed) {
        this.onEvent({ kind: 'peerLeft', peer: peerId })
      }
    }
    connection.on('close', drop)
    connection.on('error', drop)
  }
}

function errorType(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type?: unknown }).type
    if (typeof type === 'string') return type
  }
  return 'unknown'
}

/** 브로커 등록을 기다린다. 응답이 없으면 무한 대기하지 않게 시한을 둔다 */
function waitForOpen(peer: Peer, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject({ type: 'network' })
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      peer.off('open', onOpen)
      peer.off('error', onError)
    }
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = (error: unknown) => {
      cleanup()
      reject(error)
    }
    peer.on('open', onOpen)
    peer.on('error', onError)
  })
}

/**
 * 연결이 열리기를 기다린다.
 *
 * Peer의 에러도 함께 듣는 이유는 **없는 방 코드일 때 peer-unavailable이 연결이 아니라
 * Peer 쪽으로 오기** 때문이다. 연결만 보고 있으면 시한이 먼저 끝나 "경로가 안 열렸다"로
 * 잘못 안내하게 된다 — 오타는 가장 흔한 실수라서 조치가 정확해야 한다.
 */
function waitForConnection(
  peer: Peer,
  connection: DataConnection,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject({ type: 'connect-timeout' })
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      connection.off('open', onOpen)
      connection.off('error', onError)
      peer.off('error', onError)
    }
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = (error: unknown) => {
      cleanup()
      reject(error)
    }
    connection.on('open', onOpen)
    connection.on('error', onError)
    peer.on('error', onError)
  })
}

export { PeerTransport, ID_PREFIX, HIDE_IP_BY_DEFAULT }
export type { PeerTransportOptions }
