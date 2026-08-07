import { AIM_HALF_RANGE, LIVES } from '../game/config.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../game/renderer/ArenaRenderer.ts'
import { Aimer } from '../game/systems/Aimer.ts'
import { difficultyAt } from '../game/systems/Difficulty.ts'
import { resolveItem } from '../game/systems/ItemResolver.ts'
import { createRng, type Rng } from '../game/systems/Rng.ts'
import { judgeInput } from '../game/systems/TypingJudge.ts'
import { WordSpawner } from '../game/systems/WordSpawner.ts'
import type { FallingWord, OwnerId } from '../game/types/game.ts'
import { MatchState } from './MatchState.ts'
import { buildOwnerColors } from './ownerColors.ts'
import type { Message, PlayerId, PlayerInfo } from './protocol.ts'
import type { Transport, TransportEvent, TransportFailure } from './Transport.ts'

/**
 * 대전 한 판.
 *
 * 싱글의 GameEngine과 나눠 둔 이유는 규칙이 다르기 때문이다 — 여기서는 받침대가 하나이고
 * 턴이 돌아가며, 목숨은 물건 주인이 잃는다. 물리·렌더러·단어 시스템은 그대로 공유한다.
 *
 * **방장이 심판이다.** 양쪽이 각자 물리를 돌리지만 "누가 목숨을 잃었는지, 턴이 누구에게
 * 넘어가는지"는 방장만 정하고 결과를 보낸다. Rapier의 크로스 플랫폼 결정론에 승패를
 * 걸지 않으려는 것이고, 턴이 끝날 때마다 방장이 권위 키프레임을 보내 어긋남을 되돌린다.
 */

/** 이 시간 동안 아무것도 움직이지 않으면 턴을 넘긴다 */
const SETTLE_QUIET_SEC = 0.6
/** 물건이 영원히 구르는 경우를 대비한 상한 */
const TURN_RESOLVE_TIMEOUT_SEC = 12

interface MatchViewState {
  readonly phase: 'playing' | 'over'
  readonly selfId: PlayerId
  readonly players: readonly PlayerInfo[]
  readonly lives: readonly (readonly [PlayerId, number])[]
  readonly current: PlayerId | null
  readonly myTurn: boolean
  readonly words: readonly FallingWord[]
  readonly aimNormalized: number
  /** 상대가 지목한 단어. 강제력은 없고 표시만 한다 */
  readonly suggestion: { readonly by: PlayerId; readonly word: string } | null
  readonly feedback: MatchFeedback | null
  readonly winner: PlayerId | null
  readonly connectionLost: boolean
}

interface MatchFeedback {
  readonly seq: number
  readonly text: string
  readonly kind: 'dropped' | 'suggested' | 'miss' | 'notYourTurn'
  readonly itemLabel: string | null
  readonly hidden: boolean
}

interface MatchEngineOptions {
  readonly transport: Transport
  readonly players: readonly PlayerInfo[]
  readonly seed: number
  readonly onFailure?: (failure: TransportFailure) => void
}

class MatchEngine {
  private readonly physics: PhysicsWorld
  private readonly loop = new GameLoop()
  private readonly transport: Transport
  private readonly match: MatchState
  private readonly ownerColors: Map<OwnerId, string>
  private readonly onFailure: ((failure: TransportFailure) => void) | null

  private rng: Rng
  private spawner: WordSpawner
  private aimer = new Aimer(AIM_HALF_RANGE)
  private elapsed = 0

  /** 물건이 떨어진 뒤 자리를 잡기를 기다리는 중인지. 그동안은 아무도 떨굴 수 없다 */
  private resolving = false
  private quietFor = 0
  private resolveFor = 0

  private suggestion: { by: PlayerId; word: string } | null = null
  private feedback: MatchFeedback | null = null
  private feedbackSeq = 0
  private connectionLost = false
  /** 방장이 물건마다 매기는 번호. 양쪽이 같은 물건으로 취급하는 기준이다 */
  private nextItemId = 1

  private renderer: ArenaRenderer | null = null
  private listener: ((state: MatchViewState) => void) | null = null

  private constructor(physics: PhysicsWorld, options: MatchEngineOptions) {
    this.physics = physics
    this.transport = options.transport
    this.onFailure = options.onFailure ?? null
    this.match = new MatchState(options.players, LIVES)
    this.ownerColors = buildOwnerColors(options.players)
    this.rng = createRng(options.seed)
    this.spawner = new WordSpawner(this.rng, WORDS)
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(options: MatchEngineOptions): Promise<MatchEngine> {
    const physics = await PhysicsWorld.create()
    return new MatchEngine(physics, options)
  }

  get isHost(): boolean {
    return this.transport.isHost
  }

  start(): void {
    this.loop.start()
    this.emit()
  }

  onStateChange(listener: (state: MatchViewState) => void): void {
    this.listener = listener
    this.emit()
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

  /**
   * Enter를 누른 순간.
   * 내 턴이면 물건을 떨구고, 아니면 그 단어를 상대에게 지목한다 —
   * 대기 시간에도 타자가 의미를 갖게 하는 유일한 통로다.
   */
  submit(text: string): void {
    if (this.match.over) {
      return
    }
    const result = judgeInput(this.spawner.words, text)
    this.feedbackSeq += 1

    if (result.kind === 'miss') {
      this.feedback = {
        seq: this.feedbackSeq,
        text: result.input,
        kind: 'miss',
        itemLabel: null,
        hidden: false,
      }
      this.emit()
      return
    }

    const word = result.word.word
    if (this.isMyTurn()) {
      this.requestDrop(word)
    } else {
      this.transport.broadcast({ t: 'suggest', word })
      this.feedback = {
        seq: this.feedbackSeq,
        text: word,
        kind: 'suggested',
        itemLabel: null,
        hidden: false,
      }
      this.emit()
    }
  }

  handleTransportEvent(event: TransportEvent): void {
    switch (event.kind) {
      case 'message':
        this.handleMessage(event.from, event.message)
        break
      case 'peerLeft':
        // 스타 토폴로지라 상대가 사라지면 판을 이어갈 수 없다
        this.connectionLost = true
        this.loop.stop()
        this.emit()
        break
      case 'error':
        this.onFailure?.(event.failure)
        break
      case 'peerJoined':
        break
    }
  }

  /**
   * 검사용 — 지금 아레나에 있는 물건들.
   * 대전은 두 쪽의 상태가 어긋나면 승패가 갈리므로, 자동 검증이 양쪽을 대조할 통로가 필요하다.
   */
  debugBodies(): { itemId: number; variantId: string; owner: string; x: number; y: number }[] {
    return this.physics.frames().map((frame) => ({
      itemId: frame.itemId,
      variantId: frame.variantId,
      owner: frame.owner,
      x: frame.x,
      y: frame.y,
    }))
  }

  dispose(): void {
    this.loop.stop()
    this.renderer = null
    this.listener = null
    this.physics.dispose()
  }

  private isMyTurn(): boolean {
    return this.match.currentPlayer === this.transport.selfId
  }

  /** 내가 떨구려 한다. 방장이면 바로 판정하고, 게스트면 방장에게 청한다 */
  private requestDrop(word: string): void {
    if (this.resolving) {
      return
    }
    if (this.transport.isHost) {
      this.resolveDrop(this.transport.selfId, word, this.aimer.worldX)
      return
    }
    this.transport.broadcast({ t: 'drop', word, aimX: this.aimer.worldX })
  }

  /**
   * 방장만 부른다. 여기가 상대를 믿지 않는 지점이다 —
   * 자기 턴인지, 실제로 화면에 있던 단어인지, 조준이 범위 안인지 전부 확인한다.
   */
  private resolveDrop(by: PlayerId, word: string, rawAimX: number): void {
    if (this.resolving || !this.match.canDrop(by)) {
      return
    }
    const target = this.spawner.words.find(
      (candidate) => candidate.state === 'active' && candidate.word === word,
    )
    if (target === undefined) {
      return
    }
    const aimX = Math.min(Math.max(rawAimX, -AIM_HALF_RANGE), AIM_HALF_RANGE)
    const variant = resolveItem(word, this.rng)
    const itemId = this.nextItemId
    this.nextItemId += 1

    this.transport.broadcast({
      t: 'dropped',
      by,
      word,
      aimX,
      variantId: variant.id,
      itemId,
    })
    this.applyDrop(by, word, aimX, variant.id, itemId)
  }

  /** 양쪽이 똑같이 실행하는 부분. 물건 정체는 방장이 정한 id를 그대로 쓴다 */
  private applyDrop(
    by: PlayerId,
    word: string,
    aimX: number,
    variantId: string,
    itemId: number,
  ): void {
    const variant = VARIANT_BY_ID.get(variantId)
    if (variant === undefined) {
      return
    }
    const target = this.spawner.words.find(
      (candidate) => candidate.state === 'active' && candidate.word === word,
    )
    if (target !== undefined) {
      this.spawner.remove(target.id)
    }

    this.physics.spawnItem(variant, aimX, by, itemId)
    this.resolving = true
    this.quietFor = 0
    this.resolveFor = 0

    if (by === this.transport.selfId) {
      this.feedbackSeq += 1
      this.feedback = {
        seq: this.feedbackSeq,
        text: word,
        kind: 'dropped',
        itemLabel: variant.label,
        hidden: variant.hidden,
      }
    }
    this.emit()
  }

  private handleMessage(from: PlayerId, message: Message): void {
    switch (message.t) {
      case 'drop':
        // 게스트가 보낸 청. 방장만 처리하고, 검증은 resolveDrop이 한다
        if (this.transport.isHost) {
          this.resolveDrop(from, message.word, message.aimX)
        }
        break
      case 'dropped':
        if (!this.transport.isHost) {
          this.applyDrop(
            message.by,
            message.word,
            message.aimX,
            message.variantId,
            message.itemId,
          )
        }
        break
      case 'suggest':
        if (this.transport.isHost) {
          this.transport.broadcast({ t: 'suggested', by: from, word: message.word })
          this.showSuggestion(from, message.word)
        }
        break
      case 'suggested':
        if (!this.transport.isHost) {
          this.showSuggestion(message.by, message.word)
        }
        break
      case 'turn':
        // 순서는 방장이 정한 것을 그대로 따른다. 스스로 굴리면 탈락이 끼었을 때
        // 양쪽이 서로 자기 차례라고 믿게 된다
        if (!this.transport.isHost) {
          this.match.setTurn(message.current)
          this.resolving = false
          this.suggestion = null
          this.emit()
        }
        break
      case 'lives':
        // 목숨은 방장이 정한 값을 그대로 따른다
        if (!this.transport.isHost) {
          this.applyLives(message.lives)
        }
        break
      case 'sync':
        if (!this.transport.isHost) {
          this.physics.applyFrames(message.bodies, (id) => VARIANT_BY_ID.get(id))
          this.emit()
        }
        break
      case 'over':
        if (!this.transport.isHost) {
          this.loop.stop()
          this.emit()
        }
        break
      default:
        break
    }
  }

  private showSuggestion(by: PlayerId, word: string): void {
    if (by === this.transport.selfId) {
      return
    }
    this.suggestion = { by, word }
    this.emit()
  }

  private applyLives(lives: readonly (readonly [PlayerId, number])[]): void {
    for (const [id, count] of lives) {
      while (this.match.livesOf(id) > count) {
        this.match.loseLife(id)
      }
    }
    this.match.ensureTurnAlive()
    this.emit()
  }

  private readonly update = (dt: number): void => {
    if (this.match.over || this.connectionLost) {
      return
    }

    this.elapsed += dt
    const difficulty = difficultyAt(this.elapsed)
    this.aimer.update(dt, difficulty.aimSpeed)
    // 단어 밭은 양쪽이 같은 시드로 굴린다. 프레임 간격이 달라 위치는 조금씩 어긋나지만
    // 나오는 단어와 순서는 같다 — 대전에 필요한 것은 "같은 선택지"뿐이다
    this.spawner.update(dt, difficulty)

    const { escaped } = this.physics.step(dt)

    if (this.transport.isHost) {
      this.hostJudge(dt, escaped)
    }
    this.emit()
  }

  /** 심판은 방장만 본다 — 목숨과 턴은 한 곳에서만 정해져야 한다 */
  private hostJudge(dt: number, escaped: readonly OwnerId[]): void {
    if (escaped.length > 0) {
      for (const owner of escaped) {
        this.match.loseLife(owner)
      }
      this.match.ensureTurnAlive()
      this.transport.broadcast({ t: 'lives', lives: this.match.snapshot().lives })
    }

    if (this.match.over) {
      this.loop.stop()
      this.transport.broadcast({ t: 'over', winner: this.match.winner })
      return
    }

    if (!this.resolving) {
      return
    }

    this.resolveFor += dt
    this.quietFor = this.physics.isQuiet() ? this.quietFor + dt : 0

    if (this.quietFor >= SETTLE_QUIET_SEC || this.resolveFor >= TURN_RESOLVE_TIMEOUT_SEC) {
      this.resolving = false
      this.suggestion = null
      this.match.nextTurn()
      // 턴이 끝날 때만 권위 키프레임을 보낸다. 매 프레임 흘리면 무료 전송로의
      // 한도를 태우고, 턴제라 그럴 필요도 없다
      this.transport.broadcast({ t: 'sync', bodies: this.physics.frames() })
      this.transport.broadcast({ t: 'turn', current: this.match.currentPlayer ?? '' })
    }
  }

  private readonly render = (): void => {
    this.renderer?.draw({
      bodies: this.physics.snapshots(),
      aimX: this.aimer.worldX,
      showAim: this.isMyTurn() && !this.resolving && !this.match.over,
      hiddenReveal: null,
      quake: 0,
      quakePhase: 0,
      ownerColors: this.ownerColors,
    })
  }

  private emit(): void {
    const snapshot = this.match.snapshot()
    this.listener?.({
      phase: snapshot.over ? 'over' : 'playing',
      selfId: this.transport.selfId,
      players: this.match.players,
      lives: snapshot.lives,
      current: snapshot.current,
      myTurn: this.isMyTurn() && !this.resolving,
      words: [...this.spawner.words],
      aimNormalized: this.aimer.normalized,
      suggestion: this.suggestion,
      feedback: this.feedback,
      winner: snapshot.winner,
      connectionLost: this.connectionLost,
    })
  }
}

export { MatchEngine, SETTLE_QUIET_SEC, TURN_RESOLVE_TIMEOUT_SEC }
export type { MatchViewState, MatchFeedback, MatchEngineOptions }
