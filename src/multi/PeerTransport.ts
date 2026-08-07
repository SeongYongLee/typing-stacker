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

/*
 * 연결은 항상 직접(P2P) 맺는다. **그래서 서로에게 IP가 보인다.**
 *
 * 한동안 TURN 경유를 강제해 IP를 가리는 모드가 기본이었는데, 그 모드는 어디서도
 * 연결되지 않았다 — PeerJS가 들고 있던 공용 TURN 호스트(eu-0/us-0.turn.peerjs.com)가
 * DNS에서 사라져서 relay 후보가 0개였다. 게다가 config를 넘기면 PeerJS 기본 config가
 * 통째로 교체되어 STUN 목록까지 함께 사라지고 있었다.
 *
 * 가릴 방법이 없는 스위치를 남겨두면 "켜면 연결 안 됨"이 되므로 걷어냈다.
 * 다시 가리려면 작동하는 TURN(자체 coturn이나 유료/키 발급 서비스)이 먼저 있어야 한다.
 * 그때까지는 로비에서 IP가 보인다는 사실을 명시한다.
 */

/** 방 코드가 겹치면 다시 뽑는다. 8자라 실제로 겹칠 일은 드물다 */
const CODE_RETRY_LIMIT = 5

/**
 * ICE 서버 목록을 직접 준다.
 *
 * PeerJS 기본 목록에는 **사라진 호스트**(eu-0/us-0.turn.peerjs.com)가 들어 있다.
 * 실기 로그에서 후보마다 `701`(호스트 조회 실패)이 쏟아지며 수집이 늘어졌다.
 *
 * STUN만으로는 부족하다는 것도 로그로 확인됐다 — 양쪽이 host·srflx 후보를 모으고
 * `ICE checking`까지 갔는데 짝이 지어지지 않았다. 같은 기기의 두 창은 mDNS 후보를
 * 해석해야 하고 srflx끼리는 라우터의 헤어핀 NAT이 필요한데, 둘 다 막히면 남는 길이 없다.
 * 그래서 중계(TURN)를 마지막 수단으로 둔다.
 *
 * 정책은 기본값('all')이라 **직접 붙을 수 있으면 중계를 타지 않는다** — 평소에는 서로
 * IP가 보이고, 직접 경로가 아예 없을 때만 중계로 우회한다.
 * openrelay는 공용 무료 서버라 언제든 사라질 수 있다(peerjs 것이 그렇게 됐다).
 * 대전이 중요해지면 자체 coturn이나 유료 TURN으로 갈아야 한다.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  {
    // UDP가 막힌 망에서는 443/tcp나 turns만 통과한다 — 포트 변형을 함께 둔다
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

/**
 * 개발 중에는 PeerJS의 시그널링 로그를 켠다(경고·에러 수준).
 * 연결이 안 될 때 브로커까지 갔는지, 상대 id를 찾았는지가 여기서 갈린다.
 */
const peerOptions = {
  debug: import.meta.env.DEV ? 2 : 0,
  config: { iceServers: ICE_SERVERS },
} as const

/**
 * ICE가 어디까지 갔는지 콘솔에 남긴다. **개발 모드에서만** 붙인다.
 *
 * "연결 중"에서 멈추는 증상은 원인이 여러 갈래인데(후보를 못 모음 / 모았지만 짝을 못 지음 /
 * 상대 후보가 안 옴) 화면으로는 구분되지 않는다. 후보 종류와 상태 전이를 찍어두면
 * 다음 시도 한 번으로 어느 갈래인지 정해진다.
 */
function traceIce(label: string, connection: DataConnection): void {
  if (!import.meta.env.DEV) {
    return
  }
  const attach = (pc: RTCPeerConnection): void => {
    const seen = new Set<string>()
    pc.addEventListener('icecandidate', (event) => {
      const type = event.candidate?.type ?? null
      if (type !== null && !seen.has(type)) {
        seen.add(type)
        console.info(`[대전:${label}] 내 후보 ${type} (${event.candidate?.protocol})`)
      }
      if (event.candidate === null) {
        console.info(`[대전:${label}] 후보 수집 끝 — 모은 종류: ${[...seen].join(', ') || '없음'}`)
      }
    })
    pc.addEventListener('icecandidateerror', (event) => {
      const error = event as RTCPeerConnectionIceErrorEvent
      console.warn(`[대전:${label}] 후보 오류 ${error.errorCode} ${error.url ?? ''}`)
    })
    pc.addEventListener('iceconnectionstatechange', () => {
      console.info(`[대전:${label}] ICE ${pc.iceConnectionState}`)
    })
  }

  // peerConnection은 협상이 시작된 뒤에 생긴다
  const pc = connection.peerConnection
  if (pc !== undefined && pc !== null) {
    attach(pc)
    return
  }
  connection.once('iceStateChanged', () => {
    const late = connection.peerConnection
    if (late !== undefined && late !== null) {
      attach(late)
    }
  })
}

interface PeerTransportOptions {
  readonly onEvent: (event: TransportEvent) => void
}

/** PeerJS 에러 종류를 사용자에게 할 말로 옮긴다 */
function toFailure(type: string, role: 'host' | 'guest'): TransportFailure {
  switch (type) {
    case 'connect-timeout':
      // 방은 찾았는데 미디어 경로가 안 열린 것이다 — "방이 없다"와 구분해야 한다
      return failure('pathBlocked')
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
  ) {
    this.peer = peer
    this.isHost = isHost
    this.roomCode = roomCode
    this.onEvent = onEvent

    peer.on('error', (error: { type?: string }) => {
      if (this.closed) return
      this.onEvent({
        kind: 'error',
        failure: toFailure(error.type ?? 'unknown', isHost ? 'host' : 'guest'),
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
    let lastError: TransportFailure = failure('unknown')

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = createRoomCode(Math.random)
      const peer = new Peer(ID_PREFIX + code, peerOptions)
      try {
        await waitForOpen(peer)
        return new PeerTransport(peer, true, code, options.onEvent)
      } catch (error) {
        peer.destroy()
        lastError = toFailure(errorType(error), 'host')
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
    const peer = new Peer(peerOptions)
    try {
      await waitForOpen(peer)
    } catch (error) {
      peer.destroy()
      throw toFailure(errorType(error), 'guest')
    }

    const transport = new PeerTransport(peer, false, code, options.onEvent)
    const connection = peer.connect(ID_PREFIX + code, { reliable: true })
    traceIce('참가자', connection)
    try {
      await waitForConnection(peer, connection)
    } catch (error) {
      peer.destroy()
      throw toFailure(errorType(error), 'guest')
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
    traceIce(this.isHost ? '방장' : '참가자', connection)
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

export { PeerTransport, ID_PREFIX }
export type { PeerTransportOptions }
