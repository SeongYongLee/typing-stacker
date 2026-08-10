import { COUNTDOWN_SEC } from '../game/config.ts'
import { createRoomCode, sanitizeNickname, type PlayerId, type PlayerInfo } from '../multi/protocol.ts'
import { RelayTransport } from '../multi/RelayTransport.ts'
import { RELAY_URL } from '../multi/relayUrl.ts'
import { failure, type Transport, type TransportEvent, type TransportFailure } from '../multi/Transport.ts'
import { COMPETITION_MAX_PLAYERS } from './config.ts'
import { CompetitionEngine } from './CompetitionEngine.ts'
import { parseCompetitionMessage, type CompetitionMessage } from './protocol.ts'

const HANDSHAKE_TIMEOUT_MS = 10000

type CompetitionOpenMode =
  | { readonly kind: 'host' }
  | { readonly kind: 'join'; readonly code: string }

type CompetitionSessionPhase =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'handshaking' }
  | { readonly kind: 'waiting'; readonly roomCode: string }
  | {
      readonly kind: 'ready'
      readonly players: readonly PlayerInfo[]
      readonly ready: readonly PlayerId[]
      readonly selfId: PlayerId
    }
  | {
      readonly kind: 'countdown'
      readonly players: readonly PlayerInfo[]
      readonly secondsLeft: number
    }
  | { readonly kind: 'playing'; readonly engine: CompetitionEngine }
  | { readonly kind: 'failed'; readonly failure: TransportFailure }

interface CompetitionSessionOptions {
  readonly nickname: string
  readonly deviceId: string
  readonly icon: string
  readonly countdownSec?: number
  readonly onPhase: (phase: CompetitionSessionPhase) => void
}

class CompetitionSession {
  private transport: Transport<CompetitionMessage> | null = null
  private engine: CompetitionEngine | null = null
  private creatingEngine = false
  private readonly pendingEngineEvents: TransportEvent<CompetitionMessage>[] = []
  private readonly nickname: string
  private readonly deviceId: string
  private readonly icon: string
  private readonly countdownSec: number
  private readonly onPhase: (phase: CompetitionSessionPhase) => void
  private readonly joined = new Map<PlayerId, PlayerInfo>()
  private readonly ready = new Set<PlayerId>()
  private roster: readonly PlayerInfo[] = []
  private started = false
  private disposed = false
  private countdownTimer: ReturnType<typeof setTimeout> | null = null
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null

  private constructor(options: CompetitionSessionOptions) {
    this.nickname = sanitizeNickname(options.nickname)
    this.deviceId = options.deviceId
    this.icon = options.icon
    this.countdownSec = options.countdownSec ?? COUNTDOWN_SEC
    this.onPhase = options.onPhase
  }

  static open(
    mode: CompetitionOpenMode,
    options: CompetitionSessionOptions,
  ): CompetitionSession {
    const session = new CompetitionSession(options)
    session.onPhase({ kind: 'connecting' })
    void session.connect(mode)
    return session
  }

  static attach(
    transport: Transport<CompetitionMessage>,
    listen: (onEvent: (event: TransportEvent<CompetitionMessage>) => void) => void,
    options: CompetitionSessionOptions,
  ): CompetitionSession {
    const session = new CompetitionSession(options)
    session.transport = transport
    listen((event) => session.handleEvent(event))
    session.enterConnected()
    return session
  }

  private async connect(mode: CompetitionOpenMode): Promise<void> {
    try {
      const options = { onEvent: (event: TransportEvent<CompetitionMessage>) => this.handleEvent(event) }
      const transport = mode.kind === 'host'
        ? await RelayTransport.hostWithParser(
            RELAY_URL,
            createRoomCode(Math.random),
            options,
            parseCompetitionMessage,
          )
        : await RelayTransport.joinWithParser(
            RELAY_URL,
            mode.code,
            options,
            parseCompetitionMessage,
          )
      if (this.disposed) {
        transport.close()
        return
      }
      this.transport = transport
      this.enterConnected()
    } catch (error) {
      if (!this.disposed) this.onPhase({ kind: 'failed', failure: asFailure(error) })
    }
  }

  private enterConnected(): void {
    const transport = this.transport
    if (transport === null) return
    if (transport.isHost) {
      this.rebuildRoster()
      this.onPhase({ kind: 'waiting', roomCode: transport.roomCode ?? '' })
      return
    }
    this.onPhase({ kind: 'handshaking' })
    this.armHandshakeTimeout()
    transport.broadcast({
      t: 'cHello',
      nickname: this.nickname,
      device: this.deviceId,
      icon: this.icon,
    })
  }

  private handleEvent(event: TransportEvent<CompetitionMessage>): void {
    if (this.disposed) return
    if (this.creatingEngine) {
      if (event.kind === 'error') {
        this.creatingEngine = false
        this.started = false
        this.pendingEngineEvents.length = 0
        this.onPhase({ kind: 'failed', failure: event.failure })
      } else {
        this.pendingEngineEvents.push(event)
      }
      return
    }
    if (this.engine !== null) {
      this.engine.handleTransportEvent(event)
      return
    }
    if (event.kind === 'error') {
      this.onPhase({ kind: 'failed', failure: event.failure })
      return
    }
    const transport = this.transport
    if (transport === null) return

    if (event.kind === 'peerLeft') {
      if (!transport.isHost) {
        // 방장이 나간 경우만 방을 잃는다. 다른 참가자가 나가면 방장이 곧 새 명단을 보낸다.
        if (event.peer === transport.hostId) {
          this.onPhase({ kind: 'failed', failure: failure('peerLost') })
        }
        return
      }
      this.joined.delete(event.peer)
      this.ready.delete(event.peer)
      this.cancelCountdown()
      this.rebuildRoster()
      if (this.joined.size === 0) {
        this.onPhase({ kind: 'waiting', roomCode: transport.roomCode ?? '' })
      } else {
        this.publishRoster()
      }
      return
    }
    if (event.kind === 'resumed') {
      if (transport.isHost) {
        this.publishRoster()
      } else {
        transport.broadcast({
          t: 'cHello',
          nickname: this.nickname,
          device: this.deviceId,
          icon: this.icon,
        })
      }
      return
    }
    if (event.kind !== 'message') return
    const message = event.message

    if (transport.isHost && message.t === 'cHello') {
      if (!this.joined.has(event.from) && this.roster.length >= COMPETITION_MAX_PLAYERS) {
        transport.sendTo(event.from, { t: 'cFull' })
        return
      }
      this.joined.set(event.from, {
        id: event.from,
        nickname: message.nickname,
        device: message.device,
        icon: message.icon,
      })
      this.clearHandshakeTimeout()
      this.rebuildRoster()
      this.publishRoster()
      return
    }
    if (!transport.isHost && event.from !== transport.hostId) return

    switch (message.t) {
      case 'cFull':
        transport.close()
        this.transport = null
        this.onPhase({ kind: 'failed', failure: failure('roomFull', false) })
        return
      case 'cRoster':
        if (!transport.isHost) {
          this.cancelCountdown()
          this.roster = message.players
          this.clearHandshakeTimeout()
          this.emitReady()
        }
        return
      case 'cReady':
        if (transport.isHost && this.roster.some((player) => player.id === event.from)) {
          this.ready.add(event.from)
          this.publishReady()
        }
        return
      case 'cReadyList':
        if (!transport.isHost) {
          this.ready.clear()
          for (const id of message.ready) this.ready.add(id)
          this.emitReady()
        }
        return
      case 'cStart':
        if (!transport.isHost) this.countDown(message.players, message.seed)
        return
      default:
        return
    }
  }

  setReady(): void {
    const transport = this.transport
    if (transport === null || this.started) return
    if (transport.isHost) {
      this.ready.add(transport.selfId)
      this.publishReady()
    } else {
      transport.broadcast({ t: 'cReady' })
    }
  }

  private rebuildRoster(): void {
    const transport = this.transport
    if (transport === null) return
    this.roster = [
      { id: transport.selfId, nickname: this.nickname, device: this.deviceId, icon: this.icon },
      ...this.joined.values(),
    ].slice(0, COMPETITION_MAX_PLAYERS)
  }

  private publishRoster(): void {
    const transport = this.transport
    if (transport === null || !transport.isHost) return
    transport.broadcast({ t: 'cRoster', players: this.roster })
    this.publishReady()
  }

  private publishReady(): void {
    const transport = this.transport
    if (transport === null || !transport.isHost) return
    transport.broadcast({ t: 'cReadyList', ready: [...this.ready] })
    this.emitReady()
    const canStart = this.roster.length >= 2 && this.roster.every((player) => this.ready.has(player.id))
    if (!canStart || this.started) return
    const seed = Date.now() >>> 0
    transport.broadcast({ t: 'cStart', seed, players: this.roster })
    this.countDown(this.roster, seed)
  }

  private emitReady(): void {
    const transport = this.transport
    if (transport === null || this.started || this.countdownTimer !== null) return
    this.onPhase({
      kind: 'ready',
      players: this.roster,
      ready: [...this.ready],
      selfId: transport.selfId,
    })
  }

  private countDown(players: readonly PlayerInfo[], seed: number): void {
    if (this.started || this.countdownTimer !== null) return
    if (this.countdownSec <= 0) {
      void this.begin(players, seed)
      return
    }
    let left = this.countdownSec
    this.onPhase({ kind: 'countdown', players, secondsLeft: left })
    const tick = (): void => {
      left -= 1
      if (this.disposed) return
      if (left <= 0) {
        this.countdownTimer = null
        void this.begin(players, seed)
        return
      }
      this.onPhase({ kind: 'countdown', players, secondsLeft: left })
      this.countdownTimer = setTimeout(tick, 1000)
    }
    this.countdownTimer = setTimeout(tick, 1000)
  }

  private async begin(players: readonly PlayerInfo[], seed: number): Promise<void> {
    const transport = this.transport
    if (transport === null || this.started) return
    this.started = true
    this.creatingEngine = true
    this.clearHandshakeTimeout()
    try {
      const engine = await CompetitionEngine.create({
        transport,
        players,
        seed,
        onFailure: () => this.onPhase({ kind: 'failed', failure: failure('peerLost') }),
      })
      if (this.disposed) {
        engine.dispose()
        return
      }
      this.engine = engine
      this.creatingEngine = false
      engine.start()
      for (const event of this.pendingEngineEvents.splice(0)) {
        engine.handleTransportEvent(event)
      }
      this.onPhase({ kind: 'playing', engine })
    } catch {
      this.creatingEngine = false
      this.pendingEngineEvents.length = 0
      this.started = false
      this.onPhase({ kind: 'failed', failure: failure('unknown') })
    }
  }

  private cancelCountdown(): void {
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer)
      this.countdownTimer = null
    }
  }

  private armHandshakeTimeout(): void {
    if (this.handshakeTimer !== null) return
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null
      if (!this.disposed && !this.started) {
        this.onPhase({ kind: 'failed', failure: failure('handshakeStalled') })
      }
    }, HANDSHAKE_TIMEOUT_MS)
  }

  private clearHandshakeTimeout(): void {
    if (this.handshakeTimer !== null) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancelCountdown()
    this.clearHandshakeTimeout()
    this.engine?.announceLeave()
    this.engine?.dispose()
    this.engine = null
    this.creatingEngine = false
    this.pendingEngineEvents.length = 0
    this.transport?.close()
    this.transport = null
  }
}

function asFailure(error: unknown): TransportFailure {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    return error as TransportFailure
  }
  return failure('unknown')
}

export { CompetitionSession }
export type {
  CompetitionOpenMode,
  CompetitionSessionOptions,
  CompetitionSessionPhase,
}
