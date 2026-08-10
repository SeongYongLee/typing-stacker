import type { Message, PlayerId } from '../../src/multi/protocol.ts'
import { parseMessage } from '../../src/multi/protocol.ts'
import type { Transport, TransportEvent } from '../../src/multi/Transport.ts'
import type { FrameClock } from './frameClock.ts'

type Delay = (message: Message, from: PlayerId, to: PlayerId) => number

interface DelayedOptions {
  readonly clock: FrameClock
  readonly delay?: Delay
}

class DelayedLoopbackTransport implements Transport {
  readonly selfId: PlayerId
  readonly isHost: boolean
  readonly hostId: PlayerId
  readonly roomCode = 'delay123'
  readonly sent: Message[] = []
  private peer: DelayedLoopbackTransport | null = null
  private onEvent: ((event: TransportEvent) => void) | null = null
  private closed = false
  private readonly clock: FrameClock
  private readonly delay: Delay

  private constructor(
    selfId: PlayerId,
    hostId: PlayerId,
    isHost: boolean,
    options: DelayedOptions,
  ) {
    this.selfId = selfId
    this.hostId = hostId
    this.isHost = isHost
    this.clock = options.clock
    this.delay = options.delay ?? (() => 0)
  }

  static pair(
    options: DelayedOptions,
    hostId = 'host-peer',
    guestId = 'guest-peer',
  ): [DelayedLoopbackTransport, DelayedLoopbackTransport] {
    const host = new DelayedLoopbackTransport(hostId, hostId, true, options)
    const guest = new DelayedLoopbackTransport(guestId, hostId, false, options)
    host.peer = guest
    guest.peer = host
    return [host, guest]
  }

  listen(onEvent: (event: TransportEvent) => void): void {
    this.onEvent = onEvent
  }

  peers(): readonly PlayerId[] {
    return this.peer === null || this.closed ? [] : [this.peer.selfId]
  }

  sendTo(_peer: PlayerId, message: Message): void {
    this.deliver(message)
  }

  broadcast(message: Message): void {
    this.deliver(message)
  }

  close(): void {
    this.closed = true
    const peer = this.peer
    this.peer = null
    if (peer !== null) {
      peer.peer = null
      peer.onEvent?.({ kind: 'peerLeft', peer: this.selfId })
    }
  }

  private deliver(message: Message): void {
    if (this.closed || this.peer === null) {
      return
    }
    this.sent.push(message)
    const target = this.peer
    const from = this.selfId
    const to = target.selfId
    this.clock.defer(this.delay(message, from, to), () => {
      if (target.closed) {
        return
      }
      const parsed = parseMessage(JSON.parse(JSON.stringify(message)))
      if (parsed !== null) {
        target.onEvent?.({ kind: 'message', from, message: parsed })
      }
    })
  }
}

export { DelayedLoopbackTransport }
