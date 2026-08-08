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
 * PeerJS 기본 목록에는 **사라진 호스트**(eu-0/us-0.turn.peerjs.com)가 들어 있어
 * 후보마다 `701`(호스트 조회 실패)이 쏟아지고 수집이 늘어졌다.
 *
 * STUN만 둔다. 중계(TURN)를 넣어봤지만 쓸 수 있는 공용 무료 TURN이 없었다 —
 * openrelay.metered.ca는 실기에서 모든 주소가 701이고, 셸에서 확인해도 TURN 포트
 * (3478·443)가 응답하지 않는다. 죽은 주소를 목록에 두면 연결마다 실패 조회로 몇 초를
 * 버리고 로그만 어지럽힌다.
 *
 * 그래서 **직접 경로가 없는 두 사람은 아직 붙지 못한다.** 같은 기기의 두 창(mDNS 해석
 * 실패)과 대칭 NAT이 그런 경우다. 그 둘을 확인하려면 `?loopback=1`(규칙·화면)과
 * 같은 망의 두 기기(실제 연결)를 쓴다. 중계가 정말 필요해지면 자체 coturn을 띄워야 한다.
 *
 * 운영자가 다른 STUN을 둘 둔 이유는 하나가 조용히 사라져도 대전이 죽지 않게 하려는
 * 것이다 — peerjs TURN이 그렇게 사라졌고, 그것을 알아채는 데 오래 걸렸다.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
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
 * 연결이 어디까지 갔는지 콘솔에 남긴다. **개발 모드에서만** 붙인다.
 *
 * "안 붙는다"의 원인은 네 갈래인데 화면으로는 구분되지 않는다.
 *   ① 내 후보를 못 모음  ② 상대 후보가 안 옴(시그널링)  ③ 후보는 다 있는데 짝이 안 지어짐
 *   ④ 짝은 지어졌는데 데이터 채널이 안 열림
 * 그래서 내 후보·상대 후보·짝 상태를 모두 찍는다. 특히 주소가 mDNS(.local)인지까지
 * 남기는데, 같은 망의 두 기기가 못 붙는 흔한 이유가 공유기의 멀티캐스트 차단이기 때문이다.
 */
function traceIce(label: string, connection: DataConnection): void {
  if (!import.meta.env.DEV) {
    return
  }
  const say = (message: string): void => console.info(`[대전:${label}] ${message}`)

  const attach = (pc: RTCPeerConnection): void => {
    const mine = new Set<string>()
    const remoteKinds = new Set<string>()
    let remoteCount = 0

    pc.addEventListener('icecandidate', (event) => {
      const candidate = event.candidate
      if (candidate === null) {
        say(`내 후보 수집 끝 — ${[...mine].join(', ') || '없음'}`)
        return
      }
      // mDNS로 가려진 주소인지가 중요하다. 상대가 이 이름을 풀지 못하면 그 후보는 쓸모없다
      const address = candidate.address ?? ''
      const form = address.endsWith('.local') ? 'mDNS' : address === '' ? '?' : 'IP'
      const key = `${candidate.type}/${candidate.protocol}/${form}`
      if (!mine.has(key)) {
        mine.add(key)
        say(`내 후보 ${key}`)
      }
    })

    pc.addEventListener('icecandidateerror', (event) => {
      const error = event as RTCPeerConnectionIceErrorEvent
      console.warn(`[대전:${label}] 후보 오류 ${error.errorCode} ${error.url ?? ''}`)
    })

    // 상대 후보가 실제로 도착하는지 — 시그널링이 살아 있는지를 가르는 유일한 신호다
    const addIceCandidate = pc.addIceCandidate.bind(pc)
    pc.addIceCandidate = (candidate?: RTCIceCandidateInit | null): Promise<void> => {
      const line = typeof candidate?.candidate === 'string' ? candidate.candidate : ''
      const kind = line.split(' ')[7] ?? '?'
      if (!remoteKinds.has(kind)) {
        remoteKinds.add(kind)
        say(`상대 후보 ${kind} 도착`)
      }
      remoteCount += 1
      return addIceCandidate(candidate)
    }

    pc.addEventListener('iceconnectionstatechange', () => {
      say(`ICE ${pc.iceConnectionState} (상대 후보 ${remoteCount}개)`)
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        void reportPairs(pc, say)
      }
    })
    pc.addEventListener('signalingstatechange', () => say(`시그널링 ${pc.signalingState}`))
    pc.addEventListener('connectionstatechange', () => say(`연결 ${pc.connectionState}`))
  }

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

/** 실패했을 때 어떤 짝이 어디까지 갔는지 — 여기서 "왜 못 붙었는지"가 확정된다 */
async function reportPairs(
  pc: RTCPeerConnection,
  say: (message: string) => void,
): Promise<void> {
  const stats = await pc.getStats()
  const names = new Map<string, string>()
  const pairs: string[] = []

  stats.forEach((report) => {
    if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
      const address = String(report.address ?? '?')
      const form = address.endsWith('.local') ? 'mDNS' : address
      names.set(report.id, `${report.candidateType}/${report.protocol}/${form}`)
    }
  })
  stats.forEach((report) => {
    if (report.type === 'candidate-pair') {
      const from = names.get(String(report.localCandidateId)) ?? '?'
      const to = names.get(String(report.remoteCandidateId)) ?? '?'
      pairs.push(`${from} ↔ ${to} : ${String(report.state)}`)
    }
  })
  say(pairs.length === 0 ? '짝이 하나도 만들어지지 않았다' : `짝 상태\n  ${pairs.join('\n  ')}`)
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
