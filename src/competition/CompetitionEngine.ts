import { AIM_HALF_RANGE, ARENA, INVULNERABLE_SEC, LIVES } from '../game/config.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import type { EscapeEvent } from '../game/physics/PhysicsWorld.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../game/renderer/ArenaRenderer.ts'
import { Aimer } from '../game/systems/Aimer.ts'
import { followCameraY, spawnYFor } from '../game/systems/Camera.ts'
import { difficultyProgress } from '../game/systems/Difficulty.ts'
import { impactEventOf, quakeEventOf, trailHitOf } from '../game/systems/ImpactFeel.ts'
import { resolveItem } from '../game/systems/ItemResolver.ts'
import { LandingGlow } from '../game/systems/LandingGlow.ts'
import { createRng, type Rng } from '../game/systems/Rng.ts'
import type { TrailHit } from '../game/systems/TrailField.ts'
import { judgeInput } from '../game/systems/TypingJudge.ts'
import { WordSpawner } from '../game/systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../game/types/events.ts'
import type { FallingWord, OwnerId } from '../game/types/game.ts'
import { BodyCorrection } from '../multi/BodyCorrection.ts'
import { buildOwnerColors } from '../multi/ownerColors.ts'
import type { PlayerId, PlayerInfo } from '../multi/protocol.ts'
import type { Transport, TransportEvent } from '../multi/Transport.ts'
import {
  COMPETITION_DROP_INTERVAL_SEC,
  COMPETITION_MAX_BODIES,
  COMPETITION_RECONNECT_GRACE_SEC,
  competitionDifficulty,
} from './config.ts'
import { CompetitionState } from './CompetitionState.ts'
import type { CompetitionMessage } from './protocol.ts'

const SYNC_INTERVAL_SEC = 2.5
const DROP_LEAD_TICKS = 6
const NO_INVULNERABLE: readonly (readonly [PlayerId, number])[] = []

interface CompetitionFeedback {
  readonly seq: number
  readonly text: string
  readonly ok: boolean
  readonly itemLabel: string | null
  readonly hidden: boolean
}

interface CompetitionViewState {
  readonly phase: 'playing' | 'over'
  readonly selfId: PlayerId
  readonly players: readonly PlayerInfo[]
  readonly lives: readonly (readonly [PlayerId, number])[]
  readonly misses: readonly (readonly [PlayerId, number])[]
  readonly words: readonly FallingWord[]
  readonly aimNormalized: number
  readonly invulnerable: readonly (readonly [PlayerId, number])[]
  readonly feedback: CompetitionFeedback | null
  readonly winner: PlayerId | null
  readonly endReason: 'lastAlive' | 'capacity' | null
  readonly connectionLost: boolean
  readonly matchId: string
}

interface CompetitionEngineOptions {
  readonly transport: Transport<CompetitionMessage>
  readonly players: readonly PlayerInfo[]
  readonly seed: number
  readonly onFailure?: () => void
}

interface ScheduledDrop {
  readonly by: PlayerId
  readonly wordId: number
  readonly word: string
  readonly aimX: number
  readonly spawnY: number
  readonly variantId: string
  readonly itemId: number
  readonly applyAtTick: number
}

function hashText(seed: number, text: string): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function competitionMatchId(seed: number, players: readonly PlayerInfo[]): string {
  const devices = players.map((player) => player.device).sort().join('.')
  return `competition-${seed}-${players.length}-${hashText(seed, devices).toString(36)}`
}

/**
 * 경쟁 모드 한 판.
 *
 * 기존 대전과 물리·렌더러만 공유하고 규칙은 분리한다. 각 플레이어는 자기 단어 밭을
 * 가지며, 방장은 모든 밭과 공유 물리의 판정만 맡는다. 단어를 놓치거나 자기 물건이
 * 이탈하면 하트를 잃고 마지막 생존자가 이긴다.
 */
class CompetitionEngine {
  private readonly physics: PhysicsWorld
  private readonly loop = new GameLoop()
  private readonly transport: Transport<CompetitionMessage>
  private readonly match: CompetitionState
  private readonly matchId: string
  private readonly ownerColors: Map<OwnerId, string>
  private readonly landing = new LandingGlow()
  private readonly bodyCorrection = new BodyCorrection()
  private readonly frameImpacts: TrailHit[] = []
  private readonly visibleImpacts: TrailHit[] = []
  private readonly spawners = new Map<PlayerId, WordSpawner>()
  private readonly sentWordVersions = new Map<PlayerId, number>()
  private readonly misses = new Map<PlayerId, number>()
  private readonly cooldowns = new Map<PlayerId, number>()
  private readonly invulnerable = new Map<PlayerId, number>()
  private readonly pendingDrops: ScheduledDrop[] = []
  private readonly pendingGone = new Map<PlayerId, number>()
  private readonly onFailure: (() => void) | null
  private itemRng: Rng
  private aimer = new Aimer(AIM_HALF_RANGE)
  private elapsed = 0
  private cameraY = 0
  private difficultyPeak = 0
  private physicsTick = 0
  private sinceSync = 0
  private nextItemId = 1
  private feedback: CompetitionFeedback | null = null
  private feedbackSeq = 0
  private connectionLost = false
  private hostMissingSince: number | null = null
  private recordedOver = false
  private winnerView: PlayerId | null = null
  private endReason: 'lastAlive' | 'capacity' | null = null
  private renderer: ArenaRenderer | null = null
  private listener: ((state: CompetitionViewState) => void) | null = null
  private events: GameEventSink | null = null

  private constructor(physics: PhysicsWorld, options: CompetitionEngineOptions) {
    this.physics = physics
    this.transport = options.transport
    this.match = new CompetitionState(options.players, LIVES)
    this.matchId = competitionMatchId(options.seed, options.players)
    this.ownerColors = buildOwnerColors(options.players)
    this.onFailure = options.onFailure ?? null
    this.itemRng = createRng((options.seed ^ 0x9e3779b9) >>> 0)

    for (const player of options.players) {
      const spawner = new WordSpawner(createRng(hashText(options.seed, player.id)), WORDS)
      if (!this.isHost) spawner.follow()
      this.spawners.set(player.id, spawner)
      this.misses.set(player.id, 0)
      this.cooldowns.set(player.id, 0)
    }
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(options: CompetitionEngineOptions): Promise<CompetitionEngine> {
    return new CompetitionEngine(await PhysicsWorld.create(), options)
  }

  get isHost(): boolean {
    return this.transport.isHost
  }

  start(): void {
    this.loop.start()
    this.fire({ kind: 'runStart' })
    this.emit()
  }

  onStateChange(listener: (state: CompetitionViewState) => void): void {
    this.listener = listener
    this.emit()
  }

  onEvent(sink: GameEventSink): void {
    this.events = sink
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.renderer = new ArenaRenderer(canvas)
    this.render()
  }

  detachCanvas(): void {
    this.renderer = null
  }

  handleResize(): void {
    this.renderer?.resize()
    this.render()
  }

  submit(text: string): void {
    if (this.match.over || !this.match.isAlive(this.transport.selfId)) return
    const spawner = this.spawnerOf(this.transport.selfId)
    const result = judgeInput(spawner.words, text)
    this.feedbackSeq += 1
    if (result.kind === 'miss') {
      this.feedback = {
        seq: this.feedbackSeq,
        text: result.input,
        ok: false,
        itemLabel: null,
        hidden: false,
      }
      this.fire({ kind: 'wordMiss' })
      this.emit()
      return
    }
    if (this.isHost) {
      this.resolveDrop(this.transport.selfId, result.word.id, this.aimer.worldX)
    } else {
      this.transport.broadcast({
        t: 'cDrop',
        wordId: result.word.id,
        aimX: this.aimer.worldX,
        matchId: this.matchId,
      })
    }
  }

  handleTransportEvent(event: TransportEvent<CompetitionMessage>): void {
    switch (event.kind) {
      case 'message':
        this.handleMessage(event.from, event.message)
        return
      case 'peerLeft':
        if (event.peer === this.transport.hostId) {
          this.connectionLost = true
          this.hostMissingSince = this.elapsed
          this.emit()
        } else if (this.isHost) {
          this.pendingGone.set(event.peer, this.elapsed)
        }
        return
      case 'error':
        this.connectionLost = true
        this.loop.stop()
        this.onFailure?.()
        this.emit()
        return
      case 'reconnecting':
        return
      case 'resumed':
        this.connectionLost = false
        this.hostMissingSince = null
        if (this.isHost) this.broadcastAuthorityState()
        this.emit()
        return
      case 'peerJoined':
        if (this.isHost) {
          this.pendingGone.delete(event.peer)
          this.broadcastAuthorityState()
        } else if (event.peer === this.transport.hostId) {
          this.connectionLost = false
          this.hostMissingSince = null
          this.emit()
        }
        return
    }
  }

  announceLeave(): void {
    this.transport.broadcast({ t: 'cBye' })
  }

  dispose(): void {
    this.loop.stop()
    this.renderer = null
    this.listener = null
    this.events = null
    this.physics.dispose()
  }

  debugBodies(): { itemId: number; variantId: string; owner: string; x: number; y: number }[] {
    return this.physics.frames().map((frame) => ({
      itemId: frame.itemId,
      variantId: frame.variantId,
      owner: frame.owner,
      x: frame.x,
      y: frame.y,
    }))
  }

  debugSelf(): PlayerId {
    return this.transport.selfId
  }

  debugEscape(owner: PlayerId, count: number): void {
    const variant = WORDS[0]?.variants[0]
    if (variant === undefined) return
    for (let index = 0; index < count; index += 1) {
      this.physics.spawnItemAt(
        variant,
        ARENA.halfWidth + 2 + index,
        ARENA.platformTop + 1,
        owner,
        this.nextItemId++,
      )
    }
  }

  private spawnerOf(id: PlayerId): WordSpawner {
    const spawner = this.spawners.get(id)
    if (spawner === undefined) throw new Error(`단어 밭이 없다: ${id}`)
    return spawner
  }

  private resolveDrop(by: PlayerId, wordId: number, rawAimX: number): void {
    if (!this.isHost || this.recordedOver || this.match.over || !this.match.isAlive(by)) return
    if ((this.cooldowns.get(by) ?? 0) > 0) return
    if (this.physics.itemCount + this.pendingDrops.length >= COMPETITION_MAX_BODIES) {
      this.finishForCapacity()
      return
    }
    const spawner = this.spawnerOf(by)
    const target = spawner.words.find((word) => word.id === wordId && word.state === 'active')
    if (target === undefined) return

    const aimX = Math.min(Math.max(rawAimX, -AIM_HALF_RANGE), AIM_HALF_RANGE)
    const variant = resolveItem(target.word, this.itemRng)
    const itemId = this.nextItemId++
    const spawnY = spawnYFor(this.cameraY)
    const applyAtTick = this.physicsTick + DROP_LEAD_TICKS

    spawner.remove(wordId)
    this.publishWords(by, true)
    this.cooldowns.set(by, COMPETITION_DROP_INTERVAL_SEC)
    const drop: ScheduledDrop = {
      by,
      wordId,
      word: target.word,
      aimX,
      spawnY,
      variantId: variant.id,
      itemId,
      applyAtTick,
    }
    this.transport.broadcast({ t: 'cDropped', ...drop, matchId: this.matchId })
    this.acceptDrop(drop)
  }

  private acceptDrop(drop: ScheduledDrop): void {
    const variant = VARIANT_BY_ID.get(drop.variantId)
    if (variant === undefined) return
    const ownSpawner = this.spawners.get(drop.by)
    if (ownSpawner !== undefined) ownSpawner.remove(drop.wordId)
    this.pendingDrops.push(drop)
    this.pendingDrops.sort((a, b) => a.applyAtTick - b.applyAtTick)
    this.fire({ kind: 'drop', hidden: variant.hidden, material: variant.material, tone: variant.tone })
    if (variant.hidden) this.fire({ kind: 'reveal' })
    if (drop.by === this.transport.selfId) {
      this.feedbackSeq += 1
      this.feedback = {
        seq: this.feedbackSeq,
        text: drop.word,
        ok: true,
        itemLabel: variant.label,
        hidden: variant.hidden,
      }
    }
    this.emit()
  }

  private spawnScheduledDrops(): void {
    while (this.pendingDrops.length > 0) {
      const next = this.pendingDrops[0]!
      if (next.applyAtTick > this.physicsTick) return
      this.pendingDrops.shift()
      if (this.physics.frames().some((frame) => frame.itemId === next.itemId)) continue
      const variant = VARIANT_BY_ID.get(next.variantId)
      if (variant !== undefined) {
        this.physics.spawnItemAt(variant, next.aimX, next.spawnY, next.by, next.itemId)
      }
    }
  }

  private handleMessage(from: PlayerId, message: CompetitionMessage): void {
    if ('matchId' in message && message.matchId !== this.matchId) return
    switch (message.t) {
      case 'cDrop':
        if (this.isHost) this.resolveDrop(from, message.wordId, message.aimX)
        return
      case 'cDropped':
        if (!this.isHost && from === this.transport.hostId) {
          this.acceptDrop(message)
        }
        return
      case 'cWords':
        if (!this.isHost && from === this.transport.hostId && message.for === this.transport.selfId) {
          this.spawnerOf(this.transport.selfId).apply(message.words)
          this.emit()
        }
        return
      case 'cLives':
        if (!this.isHost && from === this.transport.hostId) {
          this.match.applyLives(message.lives)
          for (const [id, count] of message.misses) this.misses.set(id, count)
          this.emit()
        }
        return
      case 'cSync':
        if (!this.isHost && from === this.transport.hostId) {
          this.physicsTick = message.tick
          const corrections = this.physics.applyFrames(
            message.bodies,
            (id) => VARIANT_BY_ID.get(id),
            message.welds,
          )
          this.bodyCorrection.note(corrections)
          this.emit()
        }
        return
      case 'cLeft':
        if (!this.isHost && from === this.transport.hostId) {
          this.match.eliminate(message.who)
          this.emit()
        }
        return
      case 'cOver':
        if (!this.isHost && from === this.transport.hostId) {
          this.loop.stop()
          this.recordOver(message.winner, message.reason)
          this.emit()
        }
        return
      case 'cBye':
        if (this.isHost) this.eliminate(from)
        return
      default:
        return
    }
  }

  private eliminate(who: PlayerId): void {
    if (!this.match.eliminate(who)) return
    this.spawners.get(who)?.reset()
    this.transport.broadcast({ t: 'cLeft', who, matchId: this.matchId })
    this.publishLives()
    this.finishIfOver()
    this.emit()
  }

  private loseForMiss(who: PlayerId, amount: number): void {
    for (let index = 0; index < amount && this.match.isAlive(who); index += 1) {
      this.match.loseLife(who)
      this.misses.set(who, (this.misses.get(who) ?? 0) + 1)
      if (who === this.transport.selfId) {
        this.fire({ kind: 'lifeLost', livesLeft: this.match.livesOf(who) })
      }
    }
    if (!this.match.isAlive(who)) this.spawners.get(who)?.reset()
  }

  private markPhysicalHurt(who: PlayerId): void {
    this.match.loseLife(who)
    this.invulnerable.set(who, INVULNERABLE_SEC)
    if (who === this.transport.selfId) {
      this.fire({ kind: 'lifeLost', livesLeft: this.match.livesOf(who) })
    }
    if (!this.match.isAlive(who)) this.spawners.get(who)?.reset()
  }

  private publishWords(player: PlayerId, force = false): void {
    const spawner = this.spawnerOf(player)
    if (!force && this.sentWordVersions.get(player) === spawner.version) return
    this.sentWordVersions.set(player, spawner.version)
    if (player !== this.transport.selfId) {
      this.transport.sendTo(player, {
        t: 'cWords',
        for: player,
        words: spawner.words,
        matchId: this.matchId,
      })
    }
  }

  private publishLives(): void {
    this.transport.broadcast({
      t: 'cLives',
      lives: this.match.snapshot().lives,
      misses: [...this.misses],
      matchId: this.matchId,
    })
  }

  private broadcastAuthorityState(): void {
    if (!this.isHost) return
    for (const player of this.match.players) this.publishWords(player.id, true)
    this.publishLives()
    this.transport.broadcast({
      t: 'cSync',
      bodies: this.physics.frames(),
      welds: this.physics.weldPairs(),
      tick: this.physicsTick,
      matchId: this.matchId,
    })
    this.sinceSync = 0
  }

  private finishIfOver(): void {
    if (!this.match.over || this.recordedOver) return
    this.loop.stop()
    const winner = this.match.winner
    this.transport.broadcast({
      t: 'cOver', winner, reason: 'lastAlive', matchId: this.matchId,
    })
    this.recordOver(winner, 'lastAlive')
  }

  private finishForCapacity(): void {
    if (this.recordedOver) return
    this.loop.stop()
    this.transport.broadcast({
      t: 'cOver', winner: null, reason: 'capacity', matchId: this.matchId,
    })
    this.recordOver(null, 'capacity')
    this.emit()
  }

  private recordOver(winner: PlayerId | null, reason: 'lastAlive' | 'capacity'): void {
    if (this.recordedOver) return
    this.recordedOver = true
    this.winnerView = winner
    this.endReason = reason
    this.invulnerable.clear()
    this.fire({ kind: 'gameOver', won: winner === this.transport.selfId })
  }

  private tickTimers(dt: number): void {
    for (const [id, left] of this.cooldowns) {
      this.cooldowns.set(id, Math.max(0, left - dt))
    }
    for (const [id, left] of this.invulnerable) {
      const next = left - dt
      if (next <= 0) this.invulnerable.delete(id)
      else this.invulnerable.set(id, next)
    }
  }

  private invulnerableView(): readonly (readonly [PlayerId, number])[] {
    if (this.invulnerable.size === 0) return NO_INVULNERABLE
    return [...this.invulnerable].map(([id, left]) => [id, left / INVULNERABLE_SEC] as const)
  }

  private hostJudge(escaped: readonly EscapeEvent[]): void {
    let changed = false
    for (const { owner } of escaped) {
      if (!this.match.isAlive(owner) || (this.invulnerable.get(owner) ?? 0) > 0) continue
      this.markPhysicalHurt(owner)
      changed = true
    }
    if (changed) this.publishLives()
    this.finishIfOver()
  }

  private readonly update = (dt: number): void => {
    this.bodyCorrection.advance(dt)
    this.landing.advance(dt)
    this.frameImpacts.length = 0
    if (this.recordedOver || this.match.over) return

    this.elapsed += dt
    if (this.hostMissingSince !== null) {
      if (this.elapsed - this.hostMissingSince >= COMPETITION_RECONNECT_GRACE_SEC) {
        this.loop.stop()
        this.onFailure?.()
      }
      this.emit()
      return
    }
    if (this.isHost) {
      for (const [player, since] of this.pendingGone) {
        if (this.elapsed - since >= COMPETITION_RECONNECT_GRACE_SEC) {
          this.pendingGone.delete(player)
          this.eliminate(player)
        }
      }
    }
    if (this.recordedOver || this.connectionLost) return

    this.tickTimers(dt)
    this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
    this.difficultyPeak = Math.max(
      this.difficultyPeak,
      difficultyProgress(this.physics.stackTop()),
    )
    const difficulty = competitionDifficulty(this.difficultyPeak)
    this.aimer.update(dt, difficulty.aimSpeed)

    if (this.isHost) {
      let livesChanged = false
      for (const player of this.match.players) {
        if (!this.match.isAlive(player.id)) continue
        const missed = this.spawnerOf(player.id).update(dt, difficulty)
        if (missed.length > 0) {
          this.loseForMiss(player.id, missed.length)
          livesChanged = true
        }
        this.publishWords(player.id)
      }
      if (livesChanged) this.publishLives()
    } else if (this.match.isAlive(this.transport.selfId)) {
      this.spawnerOf(this.transport.selfId).update(dt, difficulty)
    }

    this.spawnScheduledDrops()
    const { impacts, escaped, quake } = this.physics.step(dt)
    this.physicsTick += 1
    this.landing.note(impacts)
    for (const hit of impacts) {
      this.frameImpacts.push(trailHitOf(hit))
      this.fire(impactEventOf(hit))
    }
    const shake = quakeEventOf(quake)
    if (shake !== null) this.fire(shake)

    if (this.isHost) {
      this.hostJudge(escaped)
      this.sinceSync += dt
      if (!this.match.over && this.sinceSync >= SYNC_INTERVAL_SEC) {
        this.sinceSync = 0
        this.transport.broadcast({
          t: 'cSync',
          bodies: this.physics.frames(),
          welds: this.physics.weldPairs(),
          tick: this.physicsTick,
          matchId: this.matchId,
        })
      }
    }
    this.emit()
  }

  private readonly render = (): void => {
    const bodies = this.isHost
      ? this.physics.snapshots()
      : this.bodyCorrection.apply(this.physics.snapshots())
    const suppressed = this.bodyCorrection.suppressedHandles
    this.visibleImpacts.length = 0
    for (const impact of this.frameImpacts) {
      if (!suppressed.has(impact.handle)) this.visibleImpacts.push(impact)
    }
    this.renderer?.draw({
      bodies,
      aimX: this.aimer.worldX,
      showAim: !this.recordedOver && !this.match.over && this.match.isAlive(this.transport.selfId),
      landing: this.landing.view,
      nightfall: 0,
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
      time: this.elapsed,
      impacts: this.visibleImpacts,
      suppressTrails: suppressed,
      ownerColors: this.ownerColors,
    })
  }

  private emit(): void {
    const snapshot = this.match.snapshot()
    this.listener?.({
      phase: this.recordedOver || snapshot.over ? 'over' : 'playing',
      selfId: this.transport.selfId,
      players: this.match.players,
      lives: snapshot.lives,
      misses: [...this.misses],
      words: this.spawnerOf(this.transport.selfId).words,
      aimNormalized: this.aimer.normalized,
      invulnerable: this.invulnerableView(),
      feedback: this.feedback,
      winner: this.recordedOver ? this.winnerView : snapshot.winner,
      endReason: this.endReason,
      connectionLost: this.connectionLost,
      matchId: this.matchId,
    })
  }

  private fire(event: GameEvent): void {
    this.events?.(event)
  }
}

export { CompetitionEngine, competitionMatchId }
export type {
  CompetitionEngineOptions,
  CompetitionFeedback,
  CompetitionViewState,
}
