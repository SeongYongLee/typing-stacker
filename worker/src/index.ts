/**
 * 대전 중계 서버.
 *
 * P2P(WebRTC)는 NAT을 통과해야만 동작하는데, 그 조건이 망마다 다르다 —
 * 같은 Wi-Fi의 두 기기는 공유기가 멀티캐스트를 막으면 서로의 mDNS 후보를 풀지 못하고,
 * 같은 공인 IP 뒤라 헤어핀 NAT까지 필요하다. 공용 무료 TURN은 더 이상 없다.
 *
 * 중계는 그 조건을 통째로 없앤다. 양쪽 모두 **바깥으로 나가는 WebSocket 하나**만 열면 되고,
 * 그건 어떤 망에서도 열린다. 턴제 단어게임이라 한 번 더 거치는 지연은 문제되지 않는다.
 *
 * 방 하나 = Durable Object 하나. 같은 코드는 같은 인스턴스로 가므로 방을 찾는 절차가 없다.
 */

interface Env {
  ROOMS: DurableObjectNamespace
  BOARD: DurableObjectNamespace
}

const MAX_PEERS = 8

/**
 * 이 주소들에서 열린 페이지만 받는다.
 *
 * 무료 한도(하루 요청 10만·13,000 GB-s)를 넘기면 그날은 대전이 막힌다. 우리가 쓰다
 * 넘기는 것은 어쩔 수 없지만, **남이 이 중계를 공짜 인프라로 쓰다 넘기는 것**은 막아야 한다.
 * 브라우저는 Origin 헤더를 위조할 수 없으므로 이것만으로 우연한 남용은 걸러진다.
 */
const ALLOWED_ORIGINS = [
  'https://seongyonglee.github.io',
  'https://typelostfound.quest',
  'https://www.typelostfound.quest',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]

/**
 * 한 메시지의 상한. 우리 프로토콜에서 가장 큰 것은 물리 키프레임인데 그래도 수 KB다.
 * 상한이 없으면 중계를 데이터 파이프로 쓸 수 있고, 그건 곧 한도 소진이다.
 */
const MAX_MESSAGE_BYTES = 64 * 1024

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // 출처 검사는 두 길 모두에 태운다 — 랭킹도 남이 쓰면 같은 한도를 태운다
    const origin = request.headers.get('Origin')
    if (origin !== null && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('허용되지 않은 출처다', { status: 403 })
    }

    if (url.pathname.startsWith('/rank/')) {
      if (request.method === 'OPTIONS') {
        return cors(new Response(null, { status: 204 }), origin)
      }
      /*
       * 기록은 한 곳에 모여야 순위를 매길 수 있으므로 **고정된 이름 하나**를 쓴다.
       * 방과 달리 인스턴스가 하나뿐이라 쓰기가 직렬화되지만, 판이 끝날 때만 오간다.
       */
      const board = env.BOARD.get(env.BOARD.idFromName('global'))
      return cors(await board.fetch(request), origin)
    }

    const code = url.pathname.replace(/^\/room\//, '').trim().toLowerCase()
    if (!/^[a-z0-9]{4,12}$/.test(code)) {
      return new Response('방 코드가 올바르지 않다', { status: 400 })
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket으로 붙어야 한다', { status: 426 })
    }

    // 코드를 이름으로 쓰면 같은 코드가 항상 같은 방으로 간다
    const room = env.ROOMS.get(env.ROOMS.idFromName(code))
    return room.fetch(request)
  },
}

/**
 * 랭킹은 WebSocket이 아니라 평범한 fetch라 브라우저가 CORS를 본다.
 * 허용 목록은 위에서 이미 걸렀으므로 여기서는 통과시킨 출처만 되돌려준다.
 */
function cors(response: Response, origin: string | null): Response {
  if (origin === null) {
    return response
  }
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new Response(response.body, { status: response.status, headers })
}

export { Board } from './board.ts'

/**
 * 방 하나. 붙어 있는 둘 사이에서 메시지를 그대로 옮긴다.
 *
 * **하이버네이션 API로 붙인다.** `accept()`로 받으면 연결이 열려 있는 내내 duration이
 * 과금되는데, 턴제 게임은 대부분의 시간이 "아무 일도 없는" 상태다 — 사람이 단어를
 * 생각하는 동안 서버가 메모리에 떠 있을 이유가 없다. `acceptWebSocket()`은 메시지가
 * 없는 동안 인스턴스를 재워서 그 시간을 청구하지 않는다.
 *
 * 대신 잠든 사이 인스턴스 변수는 사라진다. 그래서 참가자 id를 소켓 자체에 붙여둔다
 * (serializeAttachment) — 깨어났을 때 누가 누구인지 그것으로 복원한다.
 */
export class MatchRoom {
  private readonly state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const wantsToCreate = url.searchParams.get('create') === '1'

    const sockets = this.state.getWebSockets()
    const existingHostId = await this.resolveExistingHostId(sockets)

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    /*
     * 거절도 **연결을 받아들인 뒤 닫는 코드로** 알린다.
     * 브라우저의 WebSocket은 업그레이드 실패의 HTTP 상태를 읽을 수 없어서,
     * 상태 코드로 거절하면 "방이 없다"와 "방이 찼다"를 구분할 수 없다 —
     * 코드 오타가 가장 흔한 실수라 그 구분이 곧 안내의 정확도다.
     */
    if (!wantsToCreate && sockets.length === 0) {
      server.accept()
      server.close(4404, '그 코드로 기다리는 방이 없다')
      return new Response(null, { status: 101, webSocket: client })
    }
    if (sockets.length >= MAX_PEERS) {
      server.accept()
      server.close(4409, '방이 찼다')
      return new Response(null, { status: 101, webSocket: client })
    }

    const others = sockets.map((socket) => idOf(socket)).filter((peer) => peer !== null)

    /*
     * **끊겼다 돌아온 사람은 쓰던 이름표를 되찾는다.**
     *
     * 붙을 때마다 새 id를 주면 돌아온 사람을 아무도 알아보지 못한다 — 목숨도 차례도
     * 쌓아둔 물건도 전부 그 id에 매달려 있어서, 새 id로 들어오면 판에서는 남남이다.
     * 그래서 `?resume=`으로 쓰던 것을 청하면 돌려준다.
     *
     * **지금 그 이름표를 쓰는 소켓이 없을 때만** 준다. 살아 있는 사람의 것을 뺏으면
     * 둘이 한 사람이 되어 판이 뒤엉킨다. 남이 떠난 뒤 그 이름표를 주워 쓰는 것까지는
     * 막지 못하지만(같은 방에 있던 사람은 서로의 id를 안다), 그러려면 상대가 먼저
     * 사라져야 하고 얻는 것도 그 사람의 자리뿐이다.
     */
    const asked = url.searchParams.get('resume')
    const taken = asked !== null && others.includes(asked)
    const id = asked !== null && !taken ? asked : crypto.randomUUID()
    const returning = id === asked
    // 배포 전부터 열려 있던 방만 기존 소켓 순서를 한 번 사용하고, 이후에는 저장소가 정본이다.
    const hostId = existingHostId ?? (sockets.length === 0 ? id : idOf(sockets[0]!) ?? id)
    if (existingHostId === null) await this.state.storage.put('hostId', hostId)

    this.state.acceptWebSocket(server)
    // 잠들었다 깨어나도 누가 누구인지와 처음 방장이 누구인지 알아야 한다
    server.serializeAttachment({ id, hostId, host: id === hostId })

    server.send(JSON.stringify({
      t: 'welcome', self: id, peers: others, host: id === hostId, hostId, returning,
    }))
    this.broadcast({ t: 'peerJoined', peer: id }, id)

    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const size = typeof raw === 'string' ? raw.length : raw.byteLength
    if (size > MAX_MESSAGE_BYTES) {
      return
    }
    const from = idOf(socket)
    const parsed = parse(raw)
    if (from === null || parsed === null) {
      return
    }
    const envelope = { t: 'msg', from, data: parsed.data }
    if (typeof parsed.to === 'string') {
      const target = this.state
        .getWebSockets()
        .find((candidate) => idOf(candidate) === parsed.to)
      target?.send(JSON.stringify(envelope))
      return
    }
    this.broadcast(envelope, from)
  }

  webSocketClose(socket: WebSocket): void {
    const id = idOf(socket)
    if (id !== null) {
      this.broadcast({ t: 'peerLeft', peer: id }, id)
    }
  }

  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket)
  }

  private broadcast(message: unknown, exceptId: string): void {
    const text = JSON.stringify(message)
    for (const socket of this.state.getWebSockets()) {
      if (idOf(socket) !== exceptId) {
        socket.send(text)
      }
    }
  }

  /** 방장 ID는 소켓 배열 순서가 아니라 DO 저장소와 명시적 attachment로 보존한다. */
  private async resolveExistingHostId(sockets: readonly WebSocket[]): Promise<string | null> {
    if (sockets.length === 0) return null
    const isConnected = (id: string): boolean => sockets.some((socket) => idOf(socket) === id)
    const stored = await this.state.storage.get<string>('hostId')
    if (stored !== undefined && isConnected(stored)) return stored

    const explicit = sockets.find((socket) => isHost(socket))
    const explicitId = explicit === undefined ? null : idOf(explicit)
    if (explicitId !== null) {
      await this.state.storage.put('hostId', explicitId)
      return explicitId
    }

    const attached = hostIdOf(sockets[0]!)
    if (attached !== null && isConnected(attached)) {
      await this.state.storage.put('hostId', attached)
      return attached
    }

    return null
  }
}

/** 소켓에 붙여둔 참가자 id. 하이버네이션에서 깨어난 뒤에도 이것만은 남는다 */
function idOf(socket: WebSocket): string | null {
  const attachment = socket.deserializeAttachment() as { id?: unknown } | null
  return typeof attachment?.id === 'string' ? attachment.id : null
}

function hostIdOf(socket: WebSocket): string | null {
  const attachment = socket.deserializeAttachment() as { hostId?: unknown } | null
  return typeof attachment?.hostId === 'string' ? attachment.hostId : null
}

function isHost(socket: WebSocket): boolean {
  const attachment = socket.deserializeAttachment() as { host?: unknown } | null
  return attachment?.host === true
}

/** 상대가 보낸 것은 무엇이든 올 수 있다. 모양이 맞지 않으면 조용히 버린다 */
function parse(raw: unknown): { to?: string; data: unknown } | null {
  if (typeof raw !== 'string') {
    return null
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (typeof value !== 'object' || value === null || !('data' in value)) {
      return null
    }
    return { to: typeof value.to === 'string' ? value.to : undefined, data: value.data }
  } catch {
    return null
  }
}
