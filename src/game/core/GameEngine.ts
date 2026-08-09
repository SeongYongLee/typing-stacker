import {
  AIM_HALF_RANGE,
  DROP_COOLDOWN_MS,
  HIDDEN_CHANCE,
  IMPACT_FULL_SCALE,
  INVULNERABLE_SEC,
  LEDGE,
  LIVES,
  OPENING_HIDDEN_CHANCE,
  SOLO_OWNER,
  QUAKE_DURATION,
  QUAKE_IMPACT_SCALE,
  QUAKE_MAX_AMPLITUDE,
} from '../config.ts'
import { VARIANT_BY_ID, WORDS } from '../data/words.ts'
import { shapeBounds } from '../shapes.ts'
import { PhysicsWorld, type ImpactEvent } from '../physics/PhysicsWorld.ts'
import { ArenaRenderer } from '../renderer/ArenaRenderer.ts'
import { Aimer } from '../systems/Aimer.ts'
import { difficultyAt, difficultyProgress } from '../systems/Difficulty.ts'
import { RECIPES } from '../data/recipes.ts'
import { placeLedge } from '../systems/Ledge.ts'
import { resolveCrafted, resolveItem } from '../systems/ItemResolver.ts'
import { canMergeAnything, findMerge } from '../systems/Merger.ts'
import { openingEntries } from '../systems/Opening.ts'
import { createRng, type Rng } from '../systems/Rng.ts'
import { followCameraY, spawnYFor } from '../systems/Camera.ts'
import { Collection } from '../systems/Collection.ts'
import { ScoreManager } from '../systems/ScoreManager.ts'
import { judgeInput } from '../systems/TypingJudge.ts'
import { WordSpawner } from '../systems/WordSpawner.ts'
import type { GameEvent, GameEventSink } from '../types/events.ts'
import type { FallingWord, GamePhase, ItemVariant, RunStats } from '../types/game.ts'
import { LandingGlow } from '../systems/LandingGlow.ts'
import type { TrailHit } from '../systems/TrailField.ts'
import { GameLoop } from './GameLoop.ts'

/** 표에서 못 찾은 재료를 걸러낸다 — 레시피는 id 문자열이라 오타가 조용히 지나갈 수 있다 */
function isVariant(item: ItemVariant | undefined): item is ItemVariant {
  return item !== undefined
}

/** 무너지는 장면을 이만큼 보여준 뒤 결과 화면으로 넘어간다 */
const COLLAPSE_VIEW_SEC = 1.3

/** 히든 등장 연출 길이 */
const HIDDEN_REVEAL_SEC = 1.8

/**
 * 합성 연출 길이.
 *
 * 운으로 만난 히든보다 길다. 저쪽은 결과물 하나만 읽으면 되지만 이쪽은 **재료 둘과
 * 결과물 셋**을 읽어야 하고, 그중 재료는 모이는 동안에만 보인다. 같은 1.8초에 밀어
 * 넣으면 재료를 알아보기 전에 겹쳐버려서, 정작 이 연출을 붙인 이유(무엇으로
 * 만들었는지 알리는 것)가 사라진다.
 */
const MERGE_REVEAL_SEC = 3

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
  /**
   * 지금 알리는 중인 물건.
   *
   * `from`이 있으면 **합성으로 얻은 것**이라 재료가 모이는 장면부터 보여준다.
   * 운으로 나온 히든은 재료가 없으므로 비어 있다 — 어느 길로 얻었는지가 이 하나로 갈린다.
   */
  private hiddenReveal:
    | {
        variant: ItemVariant
        from: readonly ItemVariant[]
        elapsed: number
        /** 이 연출이 도는 시간(초). 합성과 운이 다르다 */
        duration: number
      }
    | null = null
  /** 뭉쳐지는 중인 통나무. 다 앉으면 물리에 세우고 비운다 */
  private formingLedge: { x: number; y: number; halfWidth: number; elapsed: number } | null = null
  /** 방금 얹힌 물건의 색. 대전과 같은 것을 쓴다 */
  private readonly landing = new LandingGlow()
  /**
   * 이번 프레임에 부딪힌 자리들. 렌더러가 그 자리에서 물이 퍼지게 하는 데 쓴다.
   *
   * 배열을 새로 만들지 않고 **비워 쓴다.** 매 프레임 도는 자리라 새로 만들면
   * 그것만으로 쓰레기가 쌓인다 — 대부분의 프레임에는 부딪힘이 없어 빈 채로 넘어간다.
   */
  private readonly frameImpacts: TrailHit[] = []
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
  /**
   * 사건을 받아가는 쪽(지금은 소리). 렌더러와 같은 자리다 —
   * 엔진은 무슨 일이 일어났는지만 말하고, 그것을 무엇으로 바꿀지는 바깥이 정한다.
   */
  private events: GameEventSink | null = null

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

  /** 사건을 받아간다. 붙지 않으면 엔진은 아무것도 내보내지 않는다 */
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

  startRun(): void {
    this.phase = 'playing'
    this.elapsed = 0
    this.feedback = null
    this.sinceLastDrop = Number.POSITIVE_INFINITY
    this.collapseTimer = 0
    this.lives = LIVES
    this.invulnerableLeft = 0
    this.hiddenReveal = null
    this.formingLedge = null
    this.quakeLeft = 0
    this.quakeStrength = 0
    this.dropQueue.length = 0
    this.runSeq += 1
    this.rng = createRng(this.seed)
    this.spawner = new WordSpawner(this.rng, WORDS)
    /*
     * 판 앞머리에는 쉽게 합쳐지는 몇 단어만 내보낸다. 좁히기 전에는 25번을 떨궈도
     * 40판 중 7판만 첫 합성에 닿았다 — 만들어놓고 거의 아무도 못 보는 기능이었다.
     * 첫 합성이 일어나면 `tryMerge`가 푼다. 측정값은 systems/Opening.ts에.
     */
    this.spawner.restrict(openingEntries(this.rng, WORDS))
    this.aimer = new Aimer(AIM_HALF_RANGE)
    this.score.reset()
    this.collection.startRun()
    this.cameraY = 0
    this.difficultyPeak = 0
    this.physics.reset()
    this.loop.start()
    this.fire({ kind: 'runStart' })
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
      this.fire({ kind: 'wordMiss' })
      this.emit()
      return
    }

    this.spawner.remove(result.word.id)
    this.score.onWordMatched(result.word.word)
    this.fire({ kind: 'wordHit', combo: this.score.comboCount })
    // 물건의 정체는 이 순간 처음 결정되고, 그대로 플레이어에게 공개된다
    /*
     * 앞머리에는 히든을 눌러둔다. 그 구간의 밭은 히든 보유 단어만으로 이루어져 있어서
     * 같은 확률이라도 밀도가 일곱 배로 뛴다 — 재본 값은 config의 OPENING_HIDDEN_CHANCE에.
     */
    const variant = resolveItem(
      result.word.word,
      this.rng,
      this.spawner.restricted ? OPENING_HIDDEN_CHANCE : HIDDEN_CHANCE,
    )
    this.queueDrop(variant, this.aimer.worldX)
    this.discover(variant)
    if (variant.hidden) {
      this.hiddenReveal = {
        variant,
        from: [],
        elapsed: 0,
        duration: HIDDEN_REVEAL_SEC,
      }
      /*
       * 운으로 만난 히든에는 통나무를 주지 않는다. 여기 있었다가 뺐다 —
       * 이유는 `growLedge`에.
       */
      this.fire({ kind: 'reveal' })
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

  /**
   * 판을 멈춘다. 루프는 계속 돌린다 — 멈추면 화면이 통째로 얼어붙어
   * 일시정지 창 뒤로 아무것도 안 보인다. 대신 update가 시간을 흘리지 않는다.
   */
  pause(): void {
    if (this.phase !== 'playing') {
      return
    }
    this.phase = 'paused'
    this.emit()
  }

  resume(): void {
    if (this.phase !== 'paused') {
      return
    }
    this.phase = 'playing'
    this.emit()
  }

  dispose(): void {
    this.loop.stop()
    this.renderer = null
    this.listener = null
    this.events = null
    this.physics.dispose()
  }

  private fire(event: GameEvent): void {
    this.events?.(event)
  }

  /**
   * 부딪힘을 소리와 화면으로 나눠 보낸다.
   *
   * 세기를 0~1로 눌러 보내는 이유는 받는 쪽이 물리 단위를 몰라도 되게 하려는 것이다.
   * 지진은 이미 화면을 흔들고 있으므로 소리에도 따로 알려서, 쿵 소리와 흔들림이
   * 같은 순간에 오게 한다.
   *
   * **색 번짐은 사건 통로를 타지 않는다.** 소리는 엔진이 모르는 바깥일이라 사건으로
   * 넘기지만, 화면은 엔진이 프레임마다 스냅샷으로 밀어주는 것이다 — 히든 연출과
   * 같은 자리다. 그래서 소리 수신자가 붙지 않은 판(테스트·headless)에서도 색은 남는다.
   */
  private handleImpacts(
    impacts: readonly ImpactEvent[],
    quake: number,
  ): void {
    this.landing.note(impacts)
    for (const hit of impacts) {
      this.frameImpacts.push({
        id: hit.variant.id,
        color: hit.variant.color,
        x: hit.x,
        y: hit.y,
        strength: Math.min(hit.impact / IMPACT_FULL_SCALE, 1),
      })
    }
    if (this.events === null) {
      return
    }
    for (const hit of impacts) {
      this.fire({
        kind: 'impact',
        strength: Math.min(hit.impact / IMPACT_FULL_SCALE, 1),
        size: Math.max(hit.variant.artBounds.hw, hit.variant.artBounds.hh) * 2,
        material: hit.variant.material,
        tone: hit.variant.tone,
        grain: hit.variant.grain,
      })
    }
    if (quake > 0) {
      this.fire({ kind: 'quake', strength: Math.min(quake / QUAKE_IMPACT_SCALE, 1) })
    }
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
      this.dropNow(variant, x)
      return
    }
    // 쿨다운 중이면 조준한 x를 그대로 들고 대기한다. 입력을 버리지는 않는다.
    this.dropQueue.push({ variant, x })
  }

  /**
   * 물건을 실제로 세계에 떨군다.
   * 대기하다 떨어진 것도 여기를 지나므로, 낙하음이 물건이 생기는 순간과 어긋나지 않는다.
   */
  private dropNow(variant: ItemVariant, x: number): void {
    this.physics.spawnItemAt(variant, x, spawnYFor(this.cameraY), SOLO_OWNER)
    this.sinceLastDrop = 0
    this.fire({
      kind: 'drop',
      hidden: variant.hidden,
      material: variant.material,
      tone: variant.tone,
    })
  }

  private readonly update = (dt: number): void => {
    this.advanceQuake(dt)
    // 색은 판이 멈춰 있어도(일시정지·무너짐) 계속 사라져야 한다 — 그리기가 매 프레임 돈다
    this.landing.advance(dt)
    // 지난 프레임의 부딪힘은 이미 그려졌다. 비우지 않으면 물이 계속 퍼진다
    this.frameImpacts.length = 0

    if (this.phase === 'collapsing') {
      this.collapseTimer += dt
      this.cameraY = followCameraY(this.cameraY, this.physics.stackTop(), dt)
      const result = this.physics.step(dt)
      this.applyQuake(result.quake)
      // 쏟아지는 동안에도 부딪히는 소리는 나야 한다. 무너짐은 이 게임의 결말이다
      this.handleImpacts(result.impacts, result.quake)
      if (this.collapseTimer >= COLLAPSE_VIEW_SEC) {
        this.phase = 'over'
        this.loop.stop()
        this.fire({ kind: 'gameOver', won: null })
      }
      this.emit()
      return
    }

    if (this.phase !== 'playing') {
      // 멈춘 동안에도 그리기는 이어진다 — 아래 render가 매 프레임 돈다
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
      if (this.hiddenReveal.elapsed >= this.hiddenReveal.duration) {
        this.hiddenReveal = null
      }
    }
    this.advanceLedge(dt)

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
        this.dropNow(next.variant, next.x)
      }
    }

    const { settled, impacts, escaped, quake } = this.physics.step(dt)
    this.applyQuake(quake)
    this.handleImpacts(impacts, quake)
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
      this.fire({ kind: 'lifeLost', livesLeft: this.lives })
      if (this.lives === 0) {
        this.phase = 'collapsing'
        this.collapseTimer = 0
        this.fire({ kind: 'collapse' })
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
    /*
     * 접촉을 보기 전에 재료가 갖춰졌는지부터 묻는다.
     *
     * `contactGraph()`는 물건마다 콜라이더를 전부 훑고 WASM 경계를 여러 번 넘는 데다
     * 접촉 쌍마다 열쇠 문자열을 만든다 — 한 프레임에서 물리 시뮬레이션 자체보다 비쌌다.
     * 그런데 재료로 쓰이는 물건은 일부뿐이라 **대부분의 프레임에는 합칠 후보가 없다.**
     * 개수만 세어보면 그 일을 통째로 건너뛸 수 있고, 걸러지는 경우는 어차피
     * `findMerge`가 null을 주던 경우이므로 결과는 달라지지 않는다.
     */
    if (!canMergeAnything(RECIPES, this.physics.countsByVariant())) {
      return
    }
    const match = findMerge(this.physics.contactGraph(), RECIPES)
    if (match === null) {
      return
    }
    /*
     * 재료를 맞췄어도 **무엇이 나올지는 모른다.** 레시피 다섯은 낮은 확률로 다른
     * 형태를 내놓는다(우주선의 비행접시, 하트반지의 다이아반지 …). 확률은 히든과
     * 같은 값이고 판의 난수를 쓰므로 같은 시드면 같은 결과다.
     */
    const result = resolveCrafted(match.recipe, this.rng)
    const created = this.physics.mergeItems(match.itemIds, result, SOLO_OWNER)
    if (created === null) {
      return
    }
    /*
     * 합성으로 얻은 것도 히든이다 — 운으로 만난 것과 같은 자리에서 알린다.
     * 다만 **무엇으로 만들었는지**를 함께 넘긴다. 결과물만 띄우면 방금 무엇이
     * 사라졌는지 알 수 없어서, 붙여보고 싶은 짝을 다음 판에 기억하지 못한다.
     */
    this.hiddenReveal = {
      variant: result,
      from: match.recipe.inputs.map((id) => VARIANT_BY_ID.get(id)).filter(isVariant),
      elapsed: 0,
      duration: MERGE_REVEAL_SEC,
    }
    this.fire({ kind: 'merge' })
    this.score.onCrafted(result)
    this.discover(result)
    this.growLedge()
    /*
     * 앞머리 밭을 여기서 푼다. 목적이 "합성이라는 것이 있다"를 알리는 것이었으므로
     * 알린 이 순간이 끝나는 지점이다 — 시간이나 드롭 수로 끊으면 느린 사람은 배우기
     * 전에 풀리고 빠른 사람은 이미 아는 것을 계속 보게 된다. 이유는 systems/Opening.ts에.
     */
    this.spawner.release()
  }

  /**
   * 지금 서 있는 통나무들. 확인용이다.
   *
   * 통나무는 화면에만 나타나고 `GameState`에는 실리지 않아서(연출이라 규칙에 닿지
   * 않는다) 밖에서 볼 길이 없었다. 그래서 "합성했는데 안 생긴다"를 눈이 아니면
   * 확인할 수 없었다. 대전의 `debugBodies`와 같은 자리다.
   */
  debugLedges(): readonly { x: number; y: number; halfWidth: number }[] {
    return this.physics.ledges()
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

  /**
   * **합성했을 때만** 공중에 작은 통나무를 하나 세운다.
   *
   * 판을 끝내는 것은 점수가 아니라 얹을 자리가 좁아지는 것이니, 자리를 하나 더 주는
   * 것이 이 게임의 말로 된 보상이다. 자리를 고르는 규칙은 `systems/Ledge.ts`에 있다.
   *
   * ## 운으로 만난 히든에는 주지 않는다
   *
   * 처음에는 둘 다 줬다. 합성 결과물도 코드상 전부 히든이고 도감·연출에서 같게
   * 다루므로 그게 일관돼 보였다. 그런데 **손으로 만든 것과 운으로 만난 것은 다르다.**
   *
   * 합성은 재료 둘을 알아보고, 둘 다 떨구고, 서로 닿게 놓아야 일어난다. 실측으로
   * 재료가 갖춰져도 열에 일곱은 닿지 않는다 — 그 어려움을 넘은 대가가 새 자리다.
   * 운으로 나온 히든은 아무것도 하지 않아도 나오므로, 거기에 같은 것을 주면
   * **판을 여는 자리가 실력이 아니라 운으로 갈린다.**
   *
   * 빈도로도 그렇다. 둘 다 주면 판당 두 개꼴이라 보상이 아니라 절차가 된다.
   *
   * ## 자리가 없으면 그냥 지나간다
   *
   * 억지로 끼워 넣으면 통나무가 탑 속에 박혀 물건을 밀어내고, 보상이 오히려 판을
   * 무너뜨린다.
   *
   * 물건의 크기는 회전을 무시하고 외접 사각형으로 본다. 기울어 누운 물건은 실제보다
   * 넓게 잡히는데, 그쪽으로 틀리는 편이 안전하다 — 겹쳐 세우는 것보다 한 번 거르는
   * 것이 싸다.
   */
  private growLedge(): void {
    const items = this.physics.frames().flatMap((frame) => {
      const variant = VARIANT_BY_ID.get(frame.variantId)
      if (variant === undefined) {
        return []
      }
      const { hw, hh } = shapeBounds(variant.shape)
      return [{ x: frame.x, y: frame.y, hw, hh }]
    })
    const ledges = this.physics
      .ledges()
      .map((spot) => ({ ...spot, hw: spot.halfWidth, hh: LEDGE.halfHeight }))

    const spot = placeLedge(items, ledges, this.physics.stackTop(), this.rng)
    if (spot !== null) {
      // 아직 세우지 않는다. 연출이 뭉쳐 다 앉은 뒤에 실제 통나무가 된다
      this.formingLedge = { ...spot, elapsed: 0 }
    }
  }

  /**
   * 뭉쳐지던 것이 다 앉으면 그때 통나무를 세운다.
   *
   * **먼저 세워두고 연출만 얹으면 안 된다.** 아직 보이지도 않는 통나무가 물건을
   * 받아내서 허공에 걸린 것처럼 보인다 — 보이는 것과 부딪히는 것이 어긋나면 안 된다는
   * 이 프로젝트의 전제가 연출에도 그대로 적용된다.
   */
  private advanceLedge(dt: number): void {
    const forming = this.formingLedge
    if (forming === null) {
      return
    }
    forming.elapsed += dt
    if (forming.elapsed >= LEDGE.formSec) {
      this.physics.addLedge(forming.x, forming.y, forming.halfWidth)
      this.formingLedge = null
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
              from: reveal.from.map((item) => item.sprite),
              progress: reveal.elapsed / reveal.duration,
            },
      landing: this.landing.view,
      quake: this.quakeAmplitude,
      quakePhase: this.quakePhase,
      cameraY: this.cameraY,
      stackTop: this.physics.stackTop(),
      ledges: this.physics.ledges(),
      formingLedge:
        this.formingLedge === null
          ? null
          : {
              x: this.formingLedge.x,
              y: this.formingLedge.y,
              halfWidth: this.formingLedge.halfWidth,
              progress: Math.min(this.formingLedge.elapsed / LEDGE.formSec, 1),
            },
      /*
       * 꼬리 부스러기가 이 값의 차이로 시간을 흘린다. `elapsed`가 아니라 `quakePhase`를
       * 쓰는 이유는 이쪽이 **판이 멈춰도 계속 흐르기** 때문이다 — 무너지는 장면에서
       * 부스러기가 얼어붙으면 안 된다.
       */
      time: this.quakePhase,
      impacts: this.frameImpacts,
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
