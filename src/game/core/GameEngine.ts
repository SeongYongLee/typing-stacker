import {
  AIM_HALF_RANGE,
  DROP_COOLDOWN_MS,
  INVULNERABLE_SEC,
  LIVES,
  SOLO_OWNER,
  QUAKE_DURATION,
  QUAKE_IMPACT_SCALE,
  QUAKE_MAX_AMPLITUDE,
} from '../config.ts'
import { WORDS } from '../data/words.ts'
import { PhysicsWorld } from '../physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../renderer/ArenaRenderer.ts'
import { Aimer } from '../systems/Aimer.ts'
import { difficultyAt, difficultyProgress } from '../systems/Difficulty.ts'
import { RECIPES } from '../data/recipes.ts'
import { resolveItem } from '../systems/ItemResolver.ts'
import { findMerge } from '../systems/Merger.ts'
import { createRng, type Rng } from '../systems/Rng.ts'
import { followCameraY, spawnYFor } from '../systems/Camera.ts'
import { Collection } from '../systems/Collection.ts'
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
  /** 이 입력으로 대기 중인 물건을 막았는지 */
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
  /**
   * 남은 무적 시간의 비율(1 → 방금 깎였다, 0 → 무적 아님).
   * 하트에 씌우는 베리어가 이 값으로 옅어진다.
   */
  readonly invulnerable: number
  /** 지금까지 도감에 모은 히든 물건 id */
  readonly collected: readonly string[]
  /** 그중 이번 판에 처음 만난 것 */
  readonly freshlyCollected: readonly string[]
}

interface PendingDrop {
  readonly variant: ItemVariant
  readonly x: number
}

/**
 * 놓친 단어가 서 있던 자리를 아레나 x로 옮긴다.
 * 왼쪽 레인의 왼쪽 칸일수록 아레나 왼쪽에서 떨어진다 — 어디로 내려올지 미리 보이므로
 * 미리 대비할 수 있고, 조준 범위 안이라 예고 물건도 받침대에 온전히 얹힌다.
 */

class GameEngine {
  private readonly physics: PhysicsWorld
  private readonly loop = new GameLoop()
  private readonly score = new ScoreManager()
  private readonly collection: Collection
  /** 도감에 새 칸이 채워졌을 때. 바깥이 저장을 맡는다 */
  private onDiscover: ((ids: readonly string[]) => void) | null = null
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
  /** 지금 화면이 올려다보는 높이. 탑을 따라 부드럽게 올라간다 */
  private cameraY = 0
  /** 이번 판에 닿았던 가장 높은 난이도 진행도(0~1) */
  private difficultyPeak = 0
  private lives = LIVES
  /** 남은 무적 시간(초). 목숨을 잃은 직후의 연쇄 이탈을 한 번으로 묶는다 */
  private invulnerableLeft = 0
  private runSeq = 0
  private readonly dropQueue: PendingDrop[] = []

  private renderer: ArenaRenderer | null = null
  private listener: ((state: GameState) => void) | null = null

  private constructor(physics: PhysicsWorld, seed: number, known: readonly string[]) {
    this.physics = physics
    this.seed = seed
    this.collection = new Collection(known)
    this.rng = createRng(seed)
    this.spawner = new WordSpawner(this.rng, WORDS)
    this.loop.setCallbacks(this.update, this.render)
  }

  static async create(seed: number, known: readonly string[] = []): Promise<GameEngine> {
    const physics = await PhysicsWorld.create()
    return new GameEngine(physics, seed, known)
  }

  /** 도감이 늘어날 때마다 부른다. 저장은 바깥(브라우저를 아는 쪽)이 한다 */
  onCollectionChange(listener: (ids: readonly string[]) => void): void {
    this.onDiscover = listener
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
    this.invulnerableLeft = 0
    this.hiddenReveal = null
    this.quakeLeft = 0
    this.quakeStrength = 0
    this.dropQueue.length = 0
    this.runSeq += 1
    this.rng = createRng(this.seed)
    this.spawner = new WordSpawner(this.rng, WORDS)
    this.aimer = new Aimer(AIM_HALF_RANGE)
    this.score.reset()
    this.collection.startRun()
    this.cameraY = 0
    this.difficultyPeak = 0
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

    this.feedbackSeq += 1

    const result = judgeInput(this.spawner.words, text)

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
    this.score.onWordMatched(result.word.word)
    // 물건의 정체는 이 순간 처음 결정되고, 그대로 플레이어에게 공개된다
    const variant = resolveItem(result.word.word, this.rng)
    this.queueDrop(variant, this.aimer.worldX)
    this.discover(variant)
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
    const strength = Math.min(impact / QUAKE_IMPACT_SCALE, 1)
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
      this.physics.spawnItemAt(variant, x, spawnYFor(this.cameraY), SOLO_OWNER)
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
      this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
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
    this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
    if (this.invulnerableLeft > 0) {
      this.invulnerableLeft = Math.max(this.invulnerableLeft - dt, 0)
    }

    if (this.hiddenReveal !== null) {
      this.hiddenReveal.elapsed += dt
      if (this.hiddenReveal.elapsed >= HIDDEN_REVEAL_SEC) {
        this.hiddenReveal = null
      }
    }

    /*
     * 난이도는 쌓은 높이를 따라간다. 한 번 오른 뒤에는 내려가지 않는다 —
     * 탑이 무너질 때마다 단어가 뜸해졌다 몰아쳤다 하면 무엇이 기준인지 알 수 없다.
     */
    this.difficultyPeak = Math.max(
      this.difficultyPeak,
      difficultyProgress(this.physics.stackTop()),
    )
    const difficulty = difficultyAt(this.difficultyPeak)
    this.aimer.update(dt, difficulty.aimSpeed)
    // 놓친 단어는 그냥 사라진다. 대가는 점수에서만 치른다(ScoreManager.accuracy)
    this.spawner.update(dt, difficulty)

    if (this.dropQueue.length > 0 && this.sinceLastDrop >= DROP_COOLDOWN_MS / 1000) {
      const next = this.dropQueue.shift()
      if (next !== undefined) {
        this.physics.spawnItemAt(next.variant, next.x, spawnYFor(this.cameraY), SOLO_OWNER)
        this.sinceLastDrop = 0
      }
    }

    const { settled, escaped, quake } = this.physics.step(dt)
    this.applyQuake(quake)
    for (const event of settled) {
      this.score.onSettled(event.variant, event.topY)
    }

    this.tryMerge()

    /*
     * 무너짐 한 번은 이탈 여러 개를 만든다. 그것을 각각 세면 목숨 3개가 한순간에
     * 사라지므로, 한 번 깎인 뒤에는 잠깐 무적으로 둔다 — 개수가 아니라 **사건**을 센다.
     */
    if (escaped.length > 0 && this.invulnerableLeft <= 0) {
      this.lives = Math.max(this.lives - 1, 0)
      this.invulnerableLeft = INVULNERABLE_SEC
      // 콤보가 끊기는 유일한 조건이다 — 오타나 놓친 단어로는 끊기지 않는다
      this.score.onLifeLost()
      if (this.lives === 0) {
        this.phase = 'collapsing'
        this.collapseTimer = 0
      }
    }

    this.emit()
  }

  /**
   * 닿아 있는 재료가 레시피를 이루면 합친다.
   *
   * 한 프레임에 하나만 합치는 이유는 재료가 겹칠 수 있어서다. 하나를 합친 뒤
   * 남은 것으로 다음 프레임에 다시 판단하면 규칙이 단순하고, 화면에서도
   * 연쇄가 한 번에 하나씩 터지는 것으로 보인다.
   */
  private tryMerge(): void {
    const match = findMerge(this.physics.contactGraph(), RECIPES)
    if (match === null) {
      return
    }
    const created = this.physics.mergeItems(match.itemIds, match.recipe.result, SOLO_OWNER)
    if (created === null) {
      return
    }
    // 합성으로 얻은 것도 히든이다 — 운으로 만난 것과 같은 자리에서 알린다
    this.hiddenReveal = { variant: match.recipe.result, elapsed: 0 }
    this.score.onCrafted(match.recipe.result)
    this.discover(match.recipe.result)
  }

  /**
   * 물건을 만났다. 도감은 히든만이 아니라 전부를 센다 —
   * 기본 물건이 먼저 채워져야 도감이 비어 보이지 않고, 그 사이에 남은 빈 칸이
   * 무엇을 더 찾아야 하는지 알려준다.
   */
  private discover(variant: ItemVariant): void {
    if (this.collection.add(variant.id)) {
      this.onDiscover?.(this.collection.ids)
    }
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
              sprite: reveal.variant.sprite,
              progress: reveal.elapsed / HIDDEN_REVEAL_SEC,
            },
      quake: this.quakeAmplitude,
      quakePhase: this.quakePhase,
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
      // 싱글은 주인이 하나뿐이라 구분해 그릴 것이 없다
      ownerColors: null,
    })
  }

  private emit(): void {
    this.listener?.({
      phase: this.phase,
      elapsed: this.elapsed,
      // 스포너가 목록을 바꿀 때 새 배열로 갈아치우므로 여기서 또 복사하지 않는다 —
      // 매 프레임 복사하면 GC가 주기적으로 돌아 화면이 살짝 멈춘다
      words: this.spawner.words,
      aimNormalized: this.aimer.normalized,
      stats: this.score.stats(this.spawner.missedCount, this.lives, this.elapsed),
      feedback: this.feedback,
      runSeq: this.runSeq,
      invulnerable: this.invulnerableLeft / INVULNERABLE_SEC,
      collected: this.collection.ids,
      freshlyCollected: this.collection.freshIds,
    })
  }
}

export { GameEngine }
export type { GameState, SubmitFeedback }
