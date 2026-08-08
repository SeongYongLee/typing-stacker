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
}

const MAX_PEERS = 2

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
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

interface Member {
  readonly id: string
  readonly socket: WebSocket
}

/** 방 하나. 붙어 있는 둘 사이에서 메시지를 그대로 옮긴다 */
export class MatchRoom {
  private readonly members = new Map<string, Member>()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const wantsToCreate = url.searchParams.get('create') === '1'

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()

    /*
     * 거절도 **연결을 받아들인 뒤 닫는 코드로** 알린다.
     * 브라우저의 WebSocket은 업그레이드 실패의 HTTP 상태를 읽을 수 없어서,
     * 상태 코드로 거절하면 "방이 없다"와 "방이 찼다"를 구분할 수 없다 —
     * 코드 오타가 가장 흔한 실수라 그 구분이 곧 안내의 정확도다.
     */
    if (!wantsToCreate && this.members.size === 0) {
      server.close(4404, '그 코드로 기다리는 방이 없다')
      return new Response(null, { status: 101, webSocket: client })
    }
    if (this.members.size >= MAX_PEERS) {
      server.close(4409, '방이 찼다')
      return new Response(null, { status: 101, webSocket: client })
    }

    const id = crypto.randomUUID()
    const others = [...this.members.keys()]
    this.members.set(id, { id, socket: server })

    server.send(JSON.stringify({ t: 'welcome', self: id, peers: others, host: others.length === 0 }))
    this.broadcast({ t: 'peerJoined', peer: id }, id)

    server.addEventListener('message', (event) => {
      const parsed = parse(event.data)
      if (parsed === null) {
        return
      }
      const envelope = { t: 'msg', from: id, data: parsed.data }
      if (typeof parsed.to === 'string') {
        this.members.get(parsed.to)?.socket.send(JSON.stringify(envelope))
        return
      }
      this.broadcast(envelope, id)
    })

    const drop = (): void => {
      if (this.members.delete(id)) {
        this.broadcast({ t: 'peerLeft', peer: id }, id)
      }
    }
    server.addEventListener('close', drop)
    server.addEventListener('error', drop)

    return new Response(null, { status: 101, webSocket: client })
  }

  private broadcast(message: unknown, exceptId: string): void {
    const text = JSON.stringify(message)
    for (const member of this.members.values()) {
      if (member.id !== exceptId) {
        member.socket.send(text)
      }
    }
  }
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
