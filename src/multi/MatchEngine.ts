import { AIM_HALF_RANGE, ARENA, INVULNERABLE_SEC, LIVES } from '../game/config.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import { followCameraY, spawnYFor } from '../game/systems/Camera.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../game/renderer/ArenaRenderer.ts'
import { Aimer } from '../game/systems/Aimer.ts'
import { difficultyAt, difficultyProgress } from '../game/systems/Difficulty.ts'
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

/** 아무도 무적이 아닐 때 돌려주는 고정 배열 — 매 프레임 빈 배열을 새로 만들지 않으려는 것 */
const NO_INVULNERABLE: readonly (readonly [PlayerId, number])[] = []

interface MatchViewState {
  readonly phase: 'playing' | 'over'
  readonly selfId: PlayerId
  readonly players: readonly PlayerInfo[]
  readonly lives: readonly (readonly [PlayerId, number])[]
  readonly current: PlayerId | null
  readonly myTurn: boolean
  /**
   * 떨어진 물건이 멈추기를 기다리는 중.
   *
   * 이 값이 없으면 이 구간이 양쪽 화면에 똑같이 "상대 차례"로 보인다 — 아무의 차례도
   * 아닌 것이 규칙인데 그렇게 말해주지 않아 판이 멈춘 것처럼 읽힌다.
   */
  readonly settling: boolean
  /**
   * 사람별 남은 무적 비율(1 → 0). 목숨을 잃은 직후 잠깐 붙는다.
   *
   * 없으면 탑이 한 번 무너질 때 그 사람의 물건이 줄줄이 벗어나며 목숨 셋이
   * 한순간에 날아간다 — 만회할 틈이 없다. 싱글과 같은 규칙이다.
   */
  readonly invulnerable: readonly (readonly [PlayerId, number])[]
  /** 방금 목숨을 잃은 사람. 누구인지가 핵심이라 가운데에 띄운다 */
  readonly hurt: { readonly by: PlayerId; readonly lives: number } | null
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

  /**
   * 단어 밭을 굴리는 난수와 물건을 뽑는 난수를 나눠 둔다.
   *
   * 하나로 쓰면 방장만 물건을 뽑으므로(참가자는 방장이 정한 id를 받는다) 첫 드롭에서
   * 두 난수열이 갈린다. 지금은 단어 밭도 방장이 소유해 이 갈림이 겉으로 드러나지
   * 않지만, 하나를 나눠 쓰는 구조 자체를 남겨두면 같은 함정에 다시 빠진다.
   */
  private rng: Rng
  private itemRng: Rng
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
  /** 방장이 마지막으로 보낸 단어 밭의 판번호 */
  private sentWordVersion = -1
  /**
   * 사람별 남은 무적 시간(초).
   *
   * 방장은 이것으로 목숨을 깎을지 말지를 정하고, 참가자는 화면에 베리어를 그리는 데만 쓴다.
   * 양쪽이 각자 굴려도 되는 이유는 판정이 방장 한 곳에서만 나기 때문이다 —
   * 참가자 쪽 값이 조금 어긋나도 승패에 닿지 않는다.
   */
  private readonly invulnerable = new Map<PlayerId, number>()
  /** 가장 최근에 목숨을 잃은 사람. 무적이 끝나면 지운다 */
  private lastHurt: PlayerId | null = null
  /** 지금 화면이 올려다보는 높이. 탑을 따라 올라간다 */
  private cameraY = 0
  /** 이번 판에 닿았던 가장 높은 난이도 진행도(0~1) */
  private difficultyPeak = 0

  private renderer: ArenaRenderer | null = null
  private listener: ((state: MatchViewState) => void) | null = null

  private constructor(physics: PhysicsWorld, options: MatchEngineOptions) {
    this.physics = physics
    this.transport = options.transport
    this.onFailure = options.onFailure ?? null
    this.match = new MatchState(options.players, LIVES)
    this.ownerColors = buildOwnerColors(options.players)
    this.rng = createRng(options.seed)
    this.itemRng = createRng((options.seed ^ 0x9e3779b9) >>> 0)
    this.spawner = new WordSpawner(this.rng, WORDS)
    if (!this.transport.isHost) {
      this.spawner.follow()
    }
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
    if (this.canDropNow()) {
      this.requestDrop(word)
      return
    }
    /*
     * 떨굴 수 없는 두 경우 — 상대 차례이거나, 떨군 물건이 자리를 잡는 중이다.
     * 둘 다 지목으로 보낸다. 자리를 잡는 구간을 비워두면 떨군 사람의 타자가
     * 아무 반응 없이 삼켜져서, 그 몇 초가 통째로 죽는다.
     */
    this.sendSuggestion(word)
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

  /**
   * 검사용 — 아레나 밖에 물건을 만들어 이탈을 일으킨다.
   *
   * 무적은 "여러 개가 한꺼번에 벗어날 때"만 드러나는 규칙인데, 그 상황을 실제 플레이로
   * 만들려면 탑을 무너뜨려야 해서 재현이 불안정하다. 여기서는 원인을 직접 만든다.
   */
  debugEscape(owner: PlayerId, count: number): void {
    const variant = WORDS[0]?.variants[0]
    if (variant === undefined) {
      return
    }
    for (let i = 0; i < count; i += 1) {
      this.physics.spawnItemAt(
        variant,
        ARENA.halfWidth + 2 + i,
        ARENA.platformTop + 1,
        owner,
        this.nextItemId,
      )
      this.nextItemId += 1
    }
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

  /** 지금 떨굴 수 있는지. 화면에 보여주는 myTurn과 같은 기준이어야 한다 */
  private canDropNow(): boolean {
    return this.isMyTurn() && !this.resolving
  }

  /**
   * 지목을 상대에게 보낸다.
   *
   * 방향에 따라 메시지가 다르다 — 참가자는 방장을 거쳐야 하지만(`suggest`),
   * 방장은 자기가 보낸 참가자용 메시지를 스스로 처리하지 않으므로 같은 방식으로
   * 보내면 아무 데도 닿지 않는다. 방장은 결과(`suggested`)를 바로 알린다.
   */
  private sendSuggestion(word: string): void {
    if (this.transport.isHost) {
      this.transport.broadcast({ t: 'suggested', by: this.transport.selfId, word })
    } else {
      this.transport.broadcast({ t: 'suggest', word })
    }
    this.feedback = {
      seq: this.feedbackSeq,
      text: word,
      kind: 'suggested',
      itemLabel: null,
      hidden: false,
    }
    this.emit()
  }

  /**
   * 턴이 바뀔 때 들고 있던 지목을 남길지 정한다.
   *
   * 지목은 **받은 사람이 쓸 수 있는 동안** 살아 있어야 한다. 내 차례가 시작되면
   * 지금 치라는 것이므로 남기고, 남의 차례가 시작되면 내가 들고 있던 것은 쓸 기회를
   * 잃었으므로 지운다.
   *
   * 무조건 지우면 자리를 잡는 동안 한 지목이 턴이 넘어가는 순간 사라진다 —
   * 정확히 그 지목이 가장 쓸모있는 순간에.
   */
  private keepSuggestionFor(current: PlayerId | null): void {
    if (current !== this.transport.selfId) {
      this.suggestion = null
    }
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
    const variant = resolveItem(word, this.itemRng)
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

    this.physics.spawnItemAt(variant, aimX, spawnYFor(this.cameraY), by, itemId)
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
      case 'words':
        if (!this.transport.isHost) {
          this.spawner.apply(message.words)
          this.emit()
        }
        break
      case 'turn':
        // 순서는 방장이 정한 것을 그대로 따른다. 스스로 굴리면 탈락이 끼었을 때
        // 양쪽이 서로 자기 차례라고 믿게 된다
        if (!this.transport.isHost) {
          this.match.setTurn(message.current)
          this.resolving = false
          this.keepSuggestionFor(this.match.currentPlayer)
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
      // 방장이 보낸 값과 비교해 **누가** 잃었는지를 알아낸다 — 연출에 필요한 것이 그것이다
      let lost = false
      while (this.match.livesOf(id) > count) {
        this.match.loseLife(id)
        lost = true
      }
      if (lost) {
        this.markHurt(id)
      }
    }
    this.match.ensureTurnAlive()
    this.emit()
  }

  /**
   * 목숨을 잃은 직후 잠깐 무적을 준다.
   *
   * 탑이 한 번 무너지면 그 사람의 물건이 줄줄이 벗어난다. 그때마다 깎으면 목숨 셋이
   * 한순간에 날아가 만회할 틈이 없다. 방장은 이 값으로 판정하고, 양쪽 다 화면에 그린다.
   */
  private markHurt(owner: PlayerId): void {
    this.invulnerable.set(owner, INVULNERABLE_SEC)
    this.lastHurt = owner
  }

  /**
   * 화면에 넘길 남은 비율. 아무도 무적이 아니면 **같은 빈 배열을 돌려준다** —
   * 매 프레임 새 배열을 만들면 그것만으로 쓰레기가 쌓인다.
   */
  private invulnerableRatios(): readonly (readonly [PlayerId, number])[] {
    if (this.invulnerable.size === 0) {
      return NO_INVULNERABLE
    }
    const ratios: [PlayerId, number][] = []
    for (const [id, left] of this.invulnerable) {
      ratios.push([id, left / INVULNERABLE_SEC])
    }
    return ratios
  }

  private isInvulnerable(owner: PlayerId): boolean {
    return (this.invulnerable.get(owner) ?? 0) > 0
  }

  private tickInvulnerable(dt: number): void {
    for (const [id, left] of this.invulnerable) {
      const next = left - dt
      if (next <= 0) {
        this.invulnerable.delete(id)
        if (this.lastHurt === id) {
          this.lastHurt = null
        }
      } else {
        this.invulnerable.set(id, next)
      }
    }
  }

  private readonly update = (dt: number): void => {
    this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
    if (this.match.over || this.connectionLost) {
      return
    }

    this.elapsed += dt
    /*
     * 난이도는 쌓은 높이를 따라간다. 한 번 오른 뒤에는 내려가지 않는다 —
     * 탑이 무너질 때마다 단어가 뜸해졌다 몰아쳤다 하면 무엇이 기준인지 알 수 없다.
     */
    this.difficultyPeak = Math.max(
      this.difficultyPeak,
      difficultyProgress(this.physics.stackTop()),
    )
    const difficulty = difficultyAt(this.difficultyPeak)
    this.tickInvulnerable(dt)
    this.aimer.update(dt, difficulty.aimSpeed)
    /*
     * 단어 밭은 방장이 소유한다. 참가자의 스포너는 따라가기만 하고 스스로 내지 않는다 —
     * 난이도가 쌓은 높이를 따라가는데 그 높이가 양쪽에서 미세하게 어긋나서,
     * 시드를 맞춰도 나오는 순간이 결국 갈린다.
     */
    this.spawner.update(dt, difficulty)

    const { escaped } = this.physics.step(dt)

    if (this.transport.isHost) {
      this.broadcastWordsIfChanged()
      this.hostJudge(dt, escaped)
    }
    this.emit()
  }

  /** 밭이 바뀐 프레임에만 보낸다. 매 프레임 흘리면 무료 전송로의 한도를 태운다 */
  private broadcastWordsIfChanged(): void {
    if (this.spawner.version === this.sentWordVersion) {
      return
    }
    this.sentWordVersion = this.spawner.version
    this.transport.broadcast({ t: 'words', words: this.spawner.words })
  }

  /** 심판은 방장만 본다 — 목숨과 턴은 한 곳에서만 정해져야 한다 */
  private hostJudge(dt: number, escaped: readonly OwnerId[]): void {
    let anyLost = false
    for (const owner of escaped) {
      // 무적인 사람의 물건은 세계에서 치우되 목숨은 깎지 않는다
      if (this.isInvulnerable(owner)) {
        continue
      }
      this.match.loseLife(owner)
      this.markHurt(owner)
      anyLost = true
    }
    if (anyLost) {
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
      this.match.nextTurn()
      this.keepSuggestionFor(this.match.currentPlayer)
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
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
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
      myTurn: this.canDropNow(),
      settling: this.resolving && !snapshot.over && !this.connectionLost,
      invulnerable: this.invulnerableRatios(),
      hurt:
        this.lastHurt === null
          ? null
          : { by: this.lastHurt, lives: this.match.livesOf(this.lastHurt) },
      // 매 프레임 복사하지 않는다 — 스포너가 목록을 바꿀 때 새 배열로 갈아치운다
      words: this.spawner.words,
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
