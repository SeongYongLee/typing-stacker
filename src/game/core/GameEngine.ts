import {
  AIM_HALF_RANGE,
  DROP_COOLDOWN_MS,
  LIVES,
  QUAKE_DURATION,
  QUAKE_MAX_AMPLITUDE,
} from '../config.ts'
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

/** 히든 등장 연출 길이 */
const HIDDEN_REVEAL_SEC = 1.8

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
  /** 판이 새로 시작될 때마다 올라간다. UI가 입력창을 초기화하는 신호 */
  readonly runSeq: number
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
  private hiddenReveal: { variant: ItemVariant; elapsed: number } | null = null
  private quakeLeft = 0
  private quakeStrength = 0
  private quakePhase = 0
  private lives = LIVES
  private runSeq = 0
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
    this.lives = LIVES
    this.hiddenReveal = null
    this.quakeLeft = 0
    this.quakeStrength = 0
    this.dropQueue.length = 0
    this.runSeq += 1
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
    this.score.onWordMatched()
    // 물건의 정체는 이 순간 처음 결정되고, 그대로 플레이어에게 공개된다
    const variant = resolveItem(result.word.word, this.rng)
    this.queueDrop(variant, this.aimer.worldX)
    if (variant.hidden) {
      this.hiddenReveal = { variant, elapsed: 0 }
    }

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

  private advanceQuake(dt: number): void {
    this.quakePhase += dt
    if (this.quakeLeft > 0) {
      this.quakeLeft = Math.max(this.quakeLeft - dt, 0)
    }
  }

  /** 충격 세기를 흔들림으로 바꾼다. 세기는 0~1로 눌러 화면이 과하게 튀지 않게 한다 */
  private applyQuake(impact: number): void {
    if (impact <= 0) {
      return
    }
    const strength = Math.min(impact / 30, 1)
    if (strength > this.quakeStrength || this.quakeLeft <= 0) {
      this.quakeStrength = strength
    }
    this.quakeLeft = QUAKE_DURATION
  }

  private get quakeAmplitude(): number {
    if (this.quakeLeft <= 0) {
      return 0
    }
    const decay = this.quakeLeft / QUAKE_DURATION
    return QUAKE_MAX_AMPLITUDE * this.quakeStrength * decay * decay
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
    this.advanceQuake(dt)

    if (this.phase === 'collapsing') {
      this.collapseTimer += dt
      const result = this.physics.step(dt)
      this.applyQuake(result.quake)
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

    if (this.hiddenReveal !== null) {
      this.hiddenReveal.elapsed += dt
      if (this.hiddenReveal.elapsed >= HIDDEN_REVEAL_SEC) {
        this.hiddenReveal = null
      }
    }

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

    const { settled, escaped, quake } = this.physics.step(dt)
    this.applyQuake(quake)
    for (const event of settled) {
      this.score.onSettled(event.variant, event.topY)
    }

    if (escaped > 0) {
      this.lives = Math.max(this.lives - escaped, 0)
      // 콤보가 끊기는 유일한 조건이다 — 오타나 놓친 단어로는 끊기지 않는다
      this.score.onLifeLost()
      if (this.lives === 0) {
        this.phase = 'collapsing'
        this.collapseTimer = 0
      }
    }

    this.emit()
  }

  private readonly render = (): void => {
    const reveal = this.hiddenReveal
    this.renderer?.draw({
      bodies: this.physics.snapshots(),
      aimX: this.aimer.worldX,
      showAim: this.phase === 'playing',
      hiddenReveal:
        reveal === null
          ? null
          : {
              label: reveal.variant.label,
              art: reveal.variant.art,
              progress: reveal.elapsed / HIDDEN_REVEAL_SEC,
            },
      quake: this.quakeAmplitude,
      quakePhase: this.quakePhase,
    })
  }

  private emit(): void {
    this.listener?.({
      phase: this.phase,
      elapsed: this.elapsed,
      words: [...this.spawner.words],
      aimNormalized: this.aimer.normalized,
      stats: this.score.stats(this.spawner.missedCount, this.lives),
      feedback: this.feedback,
      runSeq: this.runSeq,
    })
  }
}

export { GameEngine }
export type { GameState, SubmitFeedback }
