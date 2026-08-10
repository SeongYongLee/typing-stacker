import { WORD } from '../config.ts'
import type { FallingWord, DifficultyLevel, Side, WordEntry } from '../types/game.ts'
import type { Rng } from './Rng.ts'

const FADE_SECONDS = 0.6
const SIDES: readonly Side[] = ['left', 'right']
const PREFERRED_WEIGHT = 4

class WordSpawner {
  private readonly rng: Rng
  private readonly entries: readonly WordEntry[]
  /**
   * 지금 실제로 뽑는 밭. 보통은 `entries` 전체지만 첫 밤과 밤에는 좁혀둔다.
   *
   * 스포너를 새로 만들어 갈아치우는 방법을 쓰지 않은 이유는, 그러면 **내려오던 단어가
   * 사라지기** 때문이다. 밭이 넓어지는 것은 다음에 뽑을 때부터 달라지는 일이지
   * 화면을 갈아엎는 일이 아니다.
   */
  private pool: readonly WordEntry[]
  private preferred = new Set<string>()
  private list: FallingWord[] = []
  private timer = 0
  private nextId = 1
  private missed = 0
  /**
   * 스스로 단어를 내지 않고 밖에서 준 밭을 따르는 모드.
   *
   * 대전 참가자가 이 모드로 돈다. 같은 시드로 양쪽이 각자 굴리는 방법은 쓸 수 없었다 —
   * 난이도가 쌓은 높이를 따라가는데 그 높이가 양쪽에서 미세하게 어긋나고,
   * 한 번 어긋나면 단어가 나오는 순간이 영영 갈린다.
   */
  private following = false
  /**
   * 밭이 바뀔 때마다 오른다.
   * 대전에서 방장이 "보낼 것이 생겼는지"를 매 프레임 문자열로 비교하지 않고 알아채는 통로다.
   */
  private revision = 0

  constructor(rng: Rng, entries: readonly WordEntry[]) {
    this.rng = rng
    this.entries = entries
    this.pool = entries
    // 시작하자마자 첫 단어가 나오도록 타이머를 채워둔다
    this.timer = Number.POSITIVE_INFINITY
  }

  get words(): readonly FallingWord[] {
    return this.list
  }

  get missedCount(): number {
    return this.missed
  }

  get version(): number {
    return this.revision
  }

  /** 이제부터 밖에서 준 밭만 따른다 */
  follow(): void {
    this.following = true
  }

  /**
   * 다시 내가 밭을 낸다. 방장이 사라져 다음 사람이 이어받을 때 쓴다.
   *
   * 지금 깔린 단어는 그대로 두고 **이제부터** 스스로 낸다 — 밭을 비우면 이어받는
   * 순간 화면의 단어가 전부 사라져, 치고 있던 사람의 손이 끊긴다.
   */
  lead(): void {
    this.following = false
  }

  /**
   * 뽑을 단어를 이것들로 좁힌다. 첫 밤에 첫 합성을 앞당기고, 밤에 재료만 여는 데 쓴다.
   *
   * 빈 목록이 오면 좁히지 않는다 — 밭이 비면 단어가 하나도 안 나와 판이 멈춘다.
   * 이유와 측정값은 `systems/Opening.ts`에 있다.
   */
  restrict(pool: readonly WordEntry[]): void {
    this.pool = pool.length > 0 ? pool : this.entries
  }

  /** 밭을 전체로 되돌린다. 이미 내려오는 단어는 그대로 둔다 */
  release(): void {
    this.pool = this.entries
  }

  /** 이 단어들은 다음 스폰에서 조금 더 자주 뽑힌다. 목록 밖 단어는 무시된다. */
  prefer(words: readonly string[]): void {
    this.preferred = new Set(words)
  }

  /** 지금 밭이 좁혀져 있는가. 화면이 알려줄 일이 생기면 이것을 본다 */
  get restricted(): boolean {
    return this.pool !== this.entries
  }

  /**
   * 밖에서 온 밭으로 갈아끼운다.
   *
   * 이미 있던 단어의 y는 그대로 둔다 — 올 때마다 남의 값으로 스냅하면 글자가 떨며 내려간다.
   * 무엇이 있고 언제 사라지는지만 밖에서 받고, 내려가는 움직임은 여기서 굴린다.
   */
  apply(frames: readonly FallingWord[]): void {
    const previous = new Map(this.list.map((word) => [word.id, word]))
    this.list = frames.map((frame) => {
      const existing = previous.get(frame.id)
      if (existing === undefined || existing.state !== frame.state) {
        return { ...frame }
      }
      return { ...frame, y: existing.y, fade: existing.fade }
    })
    this.revision += 1
  }

  /** 이번 프레임에 바닥선에 닿은 단어들을 돌려준다 — 호출부가 그 대가를 매긴다 */
  update(dt: number, difficulty: DifficultyLevel): readonly FallingWord[] {
    const fallSpeed = 1 / difficulty.fallDuration
    const justMissed: FallingWord[] = []

    for (const word of this.list) {
      if (word.state !== 'active') {
        word.fade -= dt / FADE_SECONDS
        continue
      }
      word.y += fallSpeed * dt
      if (word.y < 1) {
        continue
      }
      word.y = 1
      // 따라가는 쪽은 놓쳤는지를 스스로 정하지 않는다 — 바닥에 붙어 통보를 기다린다
      if (this.following) {
        continue
      }
      word.state = 'missed'
      this.missed += 1
      this.revision += 1
      justMissed.push(word)
    }

    const before = this.list.length
    this.list = this.list.filter((word) => word.fade > 0)
    if (this.list.length !== before) {
      this.revision += 1
    }

    if (this.following) {
      return justMissed
    }

    this.timer += dt
    if (this.timer >= difficulty.spawnInterval) {
      this.timer = 0
      this.spawn(difficulty)
    }

    return justMissed
  }

  /** 타이핑으로 맞춘 단어를 즉시 제거한다 (fade 없이) */
  remove(id: number): void {
    this.list = this.list.filter((word) => word.id !== id)
    this.revision += 1
  }

  reset(): void {
    this.list = []
    this.timer = Number.POSITIVE_INFINITY
    this.missed = 0
    this.revision += 1
  }

  private spawn(difficulty: DifficultyLevel): void {
    const active = this.list.filter((word) => word.state === 'active')
    if (active.length >= difficulty.maxConcurrent) {
      return
    }

    // 같은 단어가 화면에 둘 있으면 어느 것을 맞춘 것인지 모호해진다
    const taken = new Set(active.map((word) => word.word))
    const candidates = this.pool.filter((entry) => !taken.has(entry.word))
    if (candidates.length === 0) {
      return
    }

    const side = this.pickSide(active)
    const slot = this.pickSlot(active, side)
    if (slot === null) {
      return
    }

    this.revision += 1
    this.list.push({
      id: this.nextId++,
      word: this.pickWord(candidates),
      side,
      slot,
      y: 0,
      state: 'active',
      fade: 1,
    })
  }

  private pickWord(candidates: readonly WordEntry[]): string {
    let total = 0
    for (const entry of candidates) {
      total += this.preferred.has(entry.word) ? PREFERRED_WEIGHT : 1
    }
    let roll = this.rng.next() * total
    for (const entry of candidates) {
      roll -= this.preferred.has(entry.word) ? PREFERRED_WEIGHT : 1
      if (roll < 0) {
        return entry.word
      }
    }
    return candidates[candidates.length - 1]?.word ?? this.rng.pick(candidates).word
  }

  /** 한쪽에만 몰리지 않게 적은 쪽을 우선한다 */
  private pickSide(active: readonly FallingWord[]): Side {
    const left = active.filter((word) => word.side === 'left').length
    const right = active.length - left
    if (left < right) return 'left'
    if (right < left) return 'right'
    return this.rng.pick(SIDES)
  }

  private pickSlot(active: readonly FallingWord[], side: Side): number | null {
    const used = new Set(
      active.filter((word) => word.side === side).map((word) => word.slot),
    )
    const free: number[] = []
    for (let slot = 0; slot < WORD.slotsPerSide; slot += 1) {
      if (!used.has(slot)) {
        free.push(slot)
      }
    }
    return free.length === 0 ? null : this.rng.pick(free)
  }
}

export { WordSpawner, FADE_SECONDS }
