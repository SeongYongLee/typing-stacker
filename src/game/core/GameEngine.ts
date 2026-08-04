import { AIM_HALF_RANGE, DROP_COOLDOWN_MS } from '../config.ts'
import { WORDS } from '../data/words.ts'
import { PhysicsWorld } from '../physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../renderer/ArenaRenderer.ts'
import { Aimer } from '../systems/Aimer.ts'
import { difficultyAt } from '../systems/Difficulty.ts'
import { resolveItem } from '../systems/ItemResolver.ts'
import { createRng, type Rng } from '../systems/Rng.ts'
import { ScoreManager } from '../systems/ScoreManager.ts'
import { judgeInput } from '../systems/TypingJudge.ts'
import { WordSpawner } from '../systems/WordSpawner.ts'
import type { FallingWord, GamePhase, ItemVariant, RunStats } from '../types/game.ts'
import { GameLoop } from './GameLoop.ts'

/** 무너지는 장면을 이만큼 보여준 뒤 결과 화면으로 넘어간다 */
const COLLAPSE_VIEW_SEC = 1.3

interface SubmitFeedback {
  /** 같은 내용을 다시 제출해도 애니메이션이 다시 돌게 하는 일회용 키 */
  readonly seq: number
  readonly text: string
  readonly ok: boolean
  readonly itemLabel: string | null
  readonly hidden: boolean
}

interface GameState {
  readonly phase: GamePhase
  readonly elapsed: number
  readonly words: readonly FallingWord[]
  readonly aimNormalized: number
  readonly stats: RunStats
  readonly feedback: SubmitFeedback | null
}

interface PendingDrop {
  readonly variant: ItemVariant
  readonly x: number
}

class GameEngine {
  private readonly physics: PhysicsWorld
  private readonly loop = new GameLoop()
  private readonly score = new ScoreManager()
  private rng: Rng
  private spawner: WordSpawner
  private aimer = new Aimer(AIM_HALF_RANGE)

  private phase: GamePhase = 'title'
  private elapsed = 0
  private seed: number
  private feedback: SubmitFeedback | null = null
  private feedbackSeq = 0

  private sinceLastDrop = Number.POSITIVE_INFINITY
  private collapseTimer = 0
  private readonly dropQueue: PendingDrop[] = []

  private renderer: ArenaRenderer | null = null
  private listener: ((state: GameState) => void) | null = null

  private constructor(physics: PhysicsWorld, seed: number) {
    this.physics = physics
    this.seed = seed
    this.rng = createRng(seed)
    this.spawner = new WordSpawner(this.rng, WORDS)
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(seed: number): Promise<GameEngine> {
    const physics = await PhysicsWorld.create()
    return new GameEngine(physics, seed)
  }

  onStateChange(listener: (state: GameState) => void): void {
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

  startRun(): void {
    this.phase = 'playing'
    this.elapsed = 0
    this.feedback = null
    this.sinceLastDrop = Number.POSITIVE_INFINITY
    this.collapseTimer = 0
    this.dropQueue.length = 0
    this.rng = createRng(this.seed)
    this.spawner = new WordSpawner(this.rng, WORDS)
    this.aimer = new Aimer(AIM_HALF_RANGE)
    this.score.reset()
    this.physics.reset()
    this.loop.start()
    this.emit()
  }

  /** 다음 판은 다른 단어 순서로 시작한다 */
  reseed(seed: number): void {
    this.seed = seed
  }

  toTitle(): void {
    this.loop.stop()
    this.phase = 'title'
    this.emit()
  }

  /**
   * Enter를 누른 순간 호출된다. 조준 x좌표는 지금 화면에 그려져 있는 화살표
   * 위치를 그대로 쓴다 — 보이는 것과 판정이 어긋나지 않아야 한다.
   */
  submit(text: string): void {
    if (this.phase !== 'playing') {
      return
    }

    const result = judgeInput(this.spawner.words, text)
    this.feedbackSeq += 1

    if (result.kind === 'miss') {
      this.feedback = {
        seq: this.feedbackSeq,
        text: result.input,
        ok: false,
        itemLabel: null,
        hidden: false,
      }
      this.emit()
      return
    }

    this.spawner.remove(result.word.id)
    // 물건의 정체는 이 순간 처음 결정되고, 그대로 플레이어에게 공개된다
    const variant = resolveItem(result.word.word, this.rng)
    this.queueDrop(variant, this.aimer.worldX)

    this.feedback = {
      seq: this.feedbackSeq,
      text: result.word.word,
      ok: true,
      itemLabel: variant.label,
      hidden: variant.hidden,
    }
    this.emit()
  }

  dispose(): void {
    this.loop.stop()
    this.renderer = null
    this.listener = null
    this.physics.dispose()
  }

  private queueDrop(variant: ItemVariant, x: number): void {
    if (this.sinceLastDrop >= DROP_COOLDOWN_MS / 1000) {
      this.physics.spawnItem(variant, x)
      this.sinceLastDrop = 0
      return
    }
    // 쿨다운 중이면 조준한 x를 그대로 들고 대기한다. 입력을 버리지는 않는다.
    this.dropQueue.push({ variant, x })
  }

  private readonly update = (dt: number): void => {
    if (this.phase === 'collapsing') {
      this.collapseTimer += dt
      this.physics.step(dt)
      if (this.collapseTimer >= COLLAPSE_VIEW_SEC) {
        this.phase = 'over'
        this.loop.stop()
      }
      this.emit()
      return
    }

    if (this.phase !== 'playing') {
      return
    }

    this.elapsed += dt
    this.sinceLastDrop += dt

    const difficulty = difficultyAt(this.elapsed)
    this.aimer.update(dt, difficulty.aimSpeed)
    this.spawner.update(dt, difficulty)

    if (this.dropQueue.length > 0 && this.sinceLastDrop >= DROP_COOLDOWN_MS / 1000) {
      const next = this.dropQueue.shift()
      if (next !== undefined) {
        this.physics.spawnItem(next.variant, next.x)
        this.sinceLastDrop = 0
      }
    }

    const { settled, escaped } = this.physics.step(dt)
    for (const event of settled) {
      this.score.onSettled(event.variant, event.topY)
    }

    if (escaped) {
      this.phase = 'collapsing'
      this.collapseTimer = 0
    }

    this.emit()
  }

  private readonly render = (): void => {
    this.renderer?.draw({
      bodies: this.physics.snapshots(),
      aimX: this.aimer.worldX,
      showAim: this.phase === 'playing',
    })
  }

  private emit(): void {
    this.listener?.({
      phase: this.phase,
      elapsed: this.elapsed,
      words: [...this.spawner.words],
      aimNormalized: this.aimer.normalized,
      stats: this.score.stats(this.spawner.missedCount),
      feedback: this.feedback,
    })
  }
}

export { GameEngine }
export type { GameState, SubmitFeedback }
