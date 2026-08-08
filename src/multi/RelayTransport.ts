import { parseMessage } from './protocol.ts'
import type { Message, PlayerId } from './protocol.ts'
import { failure } from './Transport.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

/**
 * 중계 서버를 거쳐 붙는 전송로.
 *
 * WebRTC는 NAT을 통과해야만 동작하는데 그 조건이 망마다 다르다 — 같은 Wi-Fi의 두 기기는
 * 공유기가 멀티캐스트를 막으면 서로의 mDNS 후보를 풀지 못하고, 같은 공인 IP 뒤라
 * 헤어핀 NAT까지 필요하다. 쓸 수 있는 공용 무료 TURN은 더 이상 없다(peerjs·openrelay 모두).
 *
 * 중계는 그 조건을 통째로 없앤다. **바깥으로 나가는 WebSocket 하나**면 되고 그건 어디서나 열린다.
 * 대신 서버가 하나 필요하다 — worker/에 있는 Cloudflare Worker가 그것이다.
 *
 * 토폴로지는 P2P와 같게 유지한다. 첫 번째로 들어온 쪽이 방장이고, 방장이 명단과 시드를
 * 정한다 — 그래야 MatchSession 위쪽이 전송로가 무엇인지 몰라도 된다.
 */

/** 서버가 보내는 것 */
type ServerFrame =
  | { t: 'welcome'; self: string; peers: string[]; host: boolean }
  | { t: 'peerJoined'; peer: string }
  | { t: 'peerLeft'; peer: string }
  | { t: 'msg'; from: string; data: unknown }

interface RelayOptions {
  readonly onEvent: (event: TransportEvent) => void
}

/** 방이 없다·찼다를 닫는 코드로 알려준다 (worker/src/index.ts와 짝이다) */
const CLOSE_NO_ROOM = 4404
const CLOSE_FULL = 4409

/** 서버가 첫 인사를 이 안에 주지 않으면 뭔가 잘못된 것이다 */
const WELCOME_TIMEOUT_MS = 8000

class RelayTransport implements Transport {
  private readonly socket: WebSocket
  private readonly onEvent: (event: TransportEvent) => void
  private readonly members = new Set<PlayerId>()
  private closed = false
  readonly selfId: PlayerId
  readonly isHost: boolean
  readonly roomCode: string | null

  private constructor(
    socket: WebSocket,
    selfId: PlayerId,
    isHost: boolean,
    roomCode: string,
    peers: readonly PlayerId[],
    onEvent: (event: TransportEvent) => void,
  ) {
    this.socket = socket
    this.selfId = selfId
    this.isHost = isHost
    this.roomCode = roomCode
    this.onEvent = onEvent
    for (const peer of peers) {
      this.members.add(peer)
    }

    socket.addEventListener('message', (event) => this.receive(event.data))
    socket.addEventListener('close', () => this.fail('peerLost'))
    socket.addEventListener('error', () => this.fail('peerLost'))
  }

  static host(baseUrl: string, code: string, options: RelayOptions): Promise<RelayTransport> {
    return RelayTransport.open(baseUrl, code, true, options)
  }

  static join(baseUrl: string, code: string, options: RelayOptions): Promise<RelayTransport> {
    return RelayTransport.open(baseUrl, code, false, options)
  }

  peers(): readonly PlayerId[] {
    return [...this.members]
  }

  sendTo(peer: PlayerId, message: Message): void {
    this.send({ to: peer, data: message })
  }

  broadcast(message: Message): void {
    this.send({ data: message })
  }

  close(): void {
    this.closed = true
    this.socket.close()
  }

  private static open(
    baseUrl: string,
    code: string,
    create: boolean,
    options: RelayOptions,
  ): Promise<RelayTransport> {
    const url = `${baseUrl.replace(/\/$/, '')}/room/${code}${create ? '?create=1' : ''}`
    const socket = new WebSocket(url)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        socket.close()
        reject(failure('brokerUnreachable'))
      }, WELCOME_TIMEOUT_MS)

      const cleanup = (): void => {
        clearTimeout(timer)
        socket.removeEventListener('message', onMessage)
        socket.removeEventListener('close', onClose)
        socket.removeEventListener('error', onError)
      }

      const onMessage = (event: MessageEvent): void => {
        const frame = parseFrame(event.data)
        if (frame === null || frame.t !== 'welcome') {
          return
        }
        cleanup()
        resolve(
          new RelayTransport(socket, frame.self, frame.host, code, frame.peers, options.onEvent),
        )
      }

      // 거절은 닫는 코드로 온다 — 그래야 "방이 없다"와 "찼다"를 구분해 안내할 수 있다
      const onClose = (event: CloseEvent): void => {
        cleanup()
        if (event.code === CLOSE_NO_ROOM) {
          reject(failure('roomNotFound'))
          return
        }
        if (event.code === CLOSE_FULL) {
          reject(failure('roomFull'))
          return
        }
        reject(failure('brokerUnreachable'))
      }

      const onError = (): void => {
        cleanup()
        reject(failure('brokerUnreachable'))
      }

      socket.addEventListener('message', onMessage)
      socket.addEventListener('close', onClose)
      socket.addEventListener('error', onError)
    })
  }

  private send(payload: { to?: PlayerId; data: Message }): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return
    }
    this.socket.send(JSON.stringify(payload))
  }

  private receive(raw: unknown): void {
    const frame = parseFrame(raw)
    if (frame === null || this.closed) {
      return
    }
    switch (frame.t) {
      case 'peerJoined':
        this.members.add(frame.peer)
        this.onEvent({ kind: 'peerJoined', peer: frame.peer })
        return
      case 'peerLeft':
        this.members.delete(frame.peer)
        this.onEvent({ kind: 'peerLeft', peer: frame.peer })
        return
      case 'msg': {
        // 상대가 보낸 것은 전부 거짓일 수 있다. 통과하지 못한 것은 조용히 버린다
        const message = parseMessage(frame.data)
        if (message !== null) {
          this.onEvent({ kind: 'message', from: frame.from, message })
        }
        return
      }
      default:
        return
    }
  }

  private fail(kind: TransportFailure['kind']): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.onEvent({ kind: 'error', failure: failure(kind) })
  }
}

function parseFrame(raw: unknown): ServerFrame | null {
  if (typeof raw !== 'string') {
    return null
  }
  try {
    const value = JSON.parse(raw) as ServerFrame
    return typeof value === 'object' && value !== null && typeof value.t === 'string'
      ? value
      : null
  } catch {
    return null
  }
}

export { RelayTransport }
