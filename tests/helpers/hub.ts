import type { Message, PlayerId } from '../../src/multi/protocol.ts'
import type { Transport, TransportEvent } from '../../src/multi/Transport.ts'

/**
 * 여러 명을 붙이는 시험용 전송로.
 *
 * `LoopbackTransport`는 둘을 잇는다. 정원이 여덟이 된 뒤로는 **셋 이상에서만 드러나는
 * 문제**가 생겼다 — 명단을 [방장, 방금 온 사람] 둘로 덮어써서 셋째가 들어오면 둘째가
 * 사라졌다. 둘로는 영영 못 잡는다.
 *
 * 토폴로지는 실제와 같은 스타다. 방장이 허브이고, 참가자가 보낸 것은 방장에게만 간다.
 * 배달은 마이크로태스크로 미룬다 — 실제 경로처럼 "보낸 즉시 도착"이 아니어야
 * 순서에 기대는 코드가 시험에서만 통과하는 일이 없다.
 */
class Hub {
  private readonly nodes: HubTransport[] = []

  /** 방장 하나와 참가자 여럿. 돌려주는 배열의 첫 번째가 방장이다 */
  static of(count: number): HubTransport[] {
    const hub = new Hub()
    for (let index = 0; index < count; index += 1) {
      hub.nodes.push(new HubTransport(hub, `p${index}`, index === 0))
    }
    return hub.nodes
  }

  peersOf(self: HubTransport): PlayerId[] {
    return this.nodes
      .filter((node) => node !== self && !node.closed)
      .map((node) => node.selfId)
  }

  /** 방장이 보내면 모두에게, 참가자가 보내면 방장에게만 */
  send(from: HubTransport, message: Message, to: PlayerId | null): void {
    const targets = this.nodes.filter((node) => {
      if (node === from || node.closed) return false
      if (to !== null) return node.selfId === to
      return from.isHost || node.isHost
    })
    for (const target of targets) {
      const copy: unknown = JSON.parse(JSON.stringify(message))
      void Promise.resolve().then(() => {
        target.deliver({ kind: 'message', from: from.selfId, message: copy as Message })
      })
    }
  }

  leave(who: HubTransport): void {
    for (const node of this.nodes) {
      if (node !== who && !node.closed) {
        void Promise.resolve().then(() => {
          node.deliver({ kind: 'peerLeft', peer: who.selfId })
        })
      }
    }
  }
}

class HubTransport implements Transport {
  readonly selfId: PlayerId
  readonly isHost: boolean
  readonly roomCode: string | null
  closed = false
  private readonly hub: Hub
  private onEvent: ((event: TransportEvent) => void) | null = null

  constructor(hub: Hub, selfId: PlayerId, isHost: boolean) {
    this.hub = hub
    this.selfId = selfId
    this.isHost = isHost
    this.roomCode = isHost ? 'testroom' : null
  }

  listen(onEvent: (event: TransportEvent) => void): void {
    this.onEvent = onEvent
  }

  deliver(event: TransportEvent): void {
    if (!this.closed) {
      this.onEvent?.(event)
    }
  }

  peers(): readonly PlayerId[] {
    return this.closed ? [] : this.hub.peersOf(this)
  }

  sendTo(peer: PlayerId, message: Message): void {
    this.hub.send(this, message, peer)
  }

  broadcast(message: Message): void {
    this.hub.send(this, message, null)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.hub.leave(this)
  }
}

export { Hub }
export type { HubTransport }
