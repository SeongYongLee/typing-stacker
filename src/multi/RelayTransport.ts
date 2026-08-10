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
  | { t: 'welcome'; self: string; peers: string[]; host: boolean; hostId?: string }
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

/**
 * 끊긴 뒤 다시 붙어보는 시각(ms). 마지막 값이 곧 포기하는 시점이다.
 *
 * **방장이 기다려주는 유예(20초)보다 짧아야 한다.** 그보다 늦게 돌아오면 이미
 * 판에서 빠진 뒤라, 돌아와도 남남인 채로 빈 화면을 보게 된다.
 *
 * 앞쪽이 촘촘한 것은 대부분의 끊김이 짧기 때문이다 — 회선이 잠깐 흔들린 것이면
 * 1초 안에 붙고, 그때 사람은 아무것도 눈치채지 못한다.
 */
const RETRY_AT_MS = [400, 1200, 2500, 4500, 7000, 10000, 14000, 18000] as const

/**
 * 다시 붙을 때 쓰는 소켓 열기.
 *
 * 처음 붙는 길(`RelayTransport.open`)과 나눠둔 이유는 **여기서는 만들 것이 없기
 * 때문이다** — 이미 전송로가 있고 소켓만 갈아끼운다. 그리고 확인할 것이 하나 더
 * 있다: 쓰던 이름표를 실제로 되찾았는가. 못 되찾았으면 판에서는 남남이라
 * 돌아온 것이 아니다.
 */
function openSocket(url: string, wanted: PlayerId): Promise<WebSocket> {
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
      if (frame.self !== wanted) {
        socket.close()
        reject(failure('peerLost'))
        return
      }
      resolve(socket)
    }
    const onClose = (): void => {
      cleanup()
      reject(failure('peerLost'))
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

class RelayTransport implements Transport {
  private socket: WebSocket
  private readonly onEvent: (event: TransportEvent) => void
  private readonly members = new Set<PlayerId>()
  private closed = false
  /** 다시 붙는 데 필요한 것들. 처음 붙을 때 받아 들고 있는다 */
  private readonly baseUrl: string
  private retry = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  readonly selfId: PlayerId
  readonly isHost: boolean
  readonly hostId: PlayerId
  readonly roomCode: string | null

  private constructor(
    socket: WebSocket,
    selfId: PlayerId,
    isHost: boolean,
    hostId: PlayerId,
    roomCode: string,
    peers: readonly PlayerId[],
    onEvent: (event: TransportEvent) => void,
    baseUrl: string,
  ) {
    this.socket = socket
    this.selfId = selfId
    this.isHost = isHost
    this.hostId = hostId
    this.roomCode = roomCode
    this.onEvent = onEvent
    this.baseUrl = baseUrl
    for (const peer of peers) {
      this.members.add(peer)
    }
    this.bind(socket)
  }

  /**
   * 소켓 하나에 귀를 붙인다. 다시 붙을 때마다 새 소켓에 다시 붙여야 한다.
   *
   * **닫혔다고 곧바로 실패로 알리지 않는다.** 대부분의 끊김은 잠깐이고, 그때 판을
   * 접으면 회선이 흔들린 것과 판이 끝난 것을 사람이 구분할 수 없다.
   */
  private bind(socket: WebSocket): void {
    socket.addEventListener('message', (event) => this.receive(event.data))
    socket.addEventListener('close', () => this.lost())
    socket.addEventListener('error', () => this.lost())
  }

  /** 끊겼다. 정해둔 시각마다 다시 붙어보고, 다 써도 안 되면 그때 실패다 */
  private lost(): void {
    if (this.closed || this.retryTimer !== null) {
      return
    }
    const delay = RETRY_AT_MS[this.retry]
    if (delay === undefined) {
      this.fail('peerLost')
      return
    }
    this.retry += 1
    this.onEvent({ kind: 'reconnecting', attempt: this.retry })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.rejoin()
    }, delay)
  }

  /**
   * 쓰던 이름표를 되찾으며 다시 붙는다.
   *
   * `create=1`로 붙는 이유는 **모두가 잠깐 끊긴 경우** 때문이다. 방이 비어 있으면
   * 그냥 붙는 쪽은 "그 코드로 기다리는 방이 없다"를 받는데, 돌아온 사람에게 그것은
   * 사실이 아니다 — 방이 없는 게 아니라 아직 아무도 안 돌아온 것이다.
   */
  private async rejoin(): Promise<void> {
    if (this.closed) {
      return
    }
    const room = this.roomCode
    if (room === null) {
      this.fail('peerLost')
      return
    }
    const url = `${secure(this.baseUrl).replace(/\/$/, '')}/room/${room}?create=1&resume=${encodeURIComponent(this.selfId)}`
    try {
      const socket = await openSocket(url, this.selfId)
      if (this.closed) {
        socket.close()
        return
      }
      this.socket = socket
      this.retry = 0
      this.bind(socket)
      this.onEvent({ kind: 'resumed' })
    } catch {
      this.lost()
    }
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
    // 예약해둔 재시도까지 거둔다 — 안 그러면 나간 뒤에 혼자 다시 붙는다
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.socket.close()
  }

  private static open(
    baseUrl: string,
    code: string,
    create: boolean,
    options: RelayOptions,
  ): Promise<RelayTransport> {
    const url = `${secure(baseUrl).replace(/\/$/, '')}/room/${code}${create ? '?create=1' : ''}`
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
          new RelayTransport(
            socket,
            frame.self,
            frame.host,
            frame.hostId ?? (frame.host ? frame.self : frame.peers[0] ?? ''),
            code,
            frame.peers,
            options.onEvent,
            baseUrl,
          ),
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

/**
 * HTTPS 페이지에서 `ws://`는 혼합 콘텐츠로 **차단된다** — 그것도 조용히 실패한다.
 * 배포본(https)에 로컬 개발용 주소를 그대로 넣어두면 원인을 찾는 데 한참 걸리므로
 * 여기서 올려준다. 로컬(http)에서는 그대로 둔다.
 */
function secure(url: string): string {
  const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  return pageIsHttps && url.startsWith('ws://') ? url.replace(/^ws:/, 'wss:') : url
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
