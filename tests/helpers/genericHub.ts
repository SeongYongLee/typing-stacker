import type { PlayerId } from '../../src/multi/protocol.ts'
import type { Transport, TransportEvent } from '../../src/multi/Transport.ts'

class GenericHub<TMessage> {
  private readonly nodes: GenericHubTransport<TMessage>[] = []

  static of<T>(count: number): GenericHubTransport<T>[] {
    const hub = new GenericHub<T>()
    for (let index = 0; index < count; index += 1) {
      hub.nodes.push(new GenericHubTransport(hub, `p${index}`, index === 0))
    }
    return hub.nodes
  }

  peersOf(self: GenericHubTransport<TMessage>): PlayerId[] {
    return this.nodes.filter((node) => node !== self && !node.closed).map((node) => node.selfId)
  }

  send(from: GenericHubTransport<TMessage>, message: TMessage, to: PlayerId | null): void {
    for (const target of this.nodes) {
      if (target === from || target.closed) continue
      if (to !== null && target.selfId !== to) continue
      const copy: TMessage = JSON.parse(JSON.stringify(message)) as TMessage
      void Promise.resolve().then(() => {
        target.deliver({ kind: 'message', from: from.selfId, message: copy })
      })
    }
  }

  leave(who: GenericHubTransport<TMessage>): void {
    for (const target of this.nodes) {
      if (target !== who && !target.closed) {
        void Promise.resolve().then(() => target.deliver({ kind: 'peerLeft', peer: who.selfId }))
      }
    }
  }
}

class GenericHubTransport<TMessage> implements Transport<TMessage> {
  readonly hostId = 'p0'
  readonly roomCode: string | null
  readonly sent: TMessage[] = []
  readonly selfId: PlayerId
  readonly isHost: boolean
  closed = false
  private readonly hub: GenericHub<TMessage>
  private listener: ((event: TransportEvent<TMessage>) => void) | null = null

  constructor(hub: GenericHub<TMessage>, selfId: PlayerId, isHost: boolean) {
    this.hub = hub
    this.selfId = selfId
    this.isHost = isHost
    this.roomCode = isHost ? 'testroom' : null
  }

  listen(listener: (event: TransportEvent<TMessage>) => void): void {
    this.listener = listener
  }

  deliver(event: TransportEvent<TMessage>): void {
    if (!this.closed) this.listener?.(event)
  }

  peers(): readonly PlayerId[] {
    return this.closed ? [] : this.hub.peersOf(this)
  }

  sendTo(peer: PlayerId, message: TMessage): void {
    if (this.closed) return
    this.sent.push(message)
    this.hub.send(this, message, peer)
  }

  broadcast(message: TMessage): void {
    if (this.closed) return
    this.sent.push(message)
    this.hub.send(this, message, null)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.hub.leave(this)
  }
}

export { GenericHub }
export type { GenericHubTransport }
