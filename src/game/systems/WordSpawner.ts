import { WORD } from '../config.ts'
import type { FallingWord, DifficultyLevel, Side, WordEntry } from '../types/game.ts'
import type { Rng } from './Rng.ts'

const FADE_SECONDS = 0.6
const SIDES: readonly Side[] = ['left', 'right']

class WordSpawner {
  private readonly rng: Rng
  private readonly entries: readonly WordEntry[]
  private list: FallingWord[] = []
  private timer = 0
  private nextId = 1
  private missed = 0

  constructor(rng: Rng, entries: readonly WordEntry[]) {
    this.rng = rng
    this.entries = entries
    // 시작하자마자 첫 단어가 나오도록 타이머를 채워둔다
    this.timer = Number.POSITIVE_INFINITY
  }

  get words(): readonly FallingWord[] {
    return this.list
  }

  get missedCount(): number {
    return this.missed
  }

  /** 이번 프레임에 바닥선에 닿은 단어들을 돌려준다 — 호출부가 그 대가를 매긴다 */
  update(dt: number, difficulty: DifficultyLevel): readonly FallingWord[] {
    const fallSpeed = 1 / difficulty.fallDuration
    const justMissed: FallingWord[] = []

    for (const word of this.list) {
      if (word.state === 'active') {
        word.y += fallSpeed * dt
        if (word.y >= 1) {
          word.y = 1
          word.state = 'missed'
          this.missed += 1
          justMissed.push(word)
        }
      } else {
        word.fade -= dt / FADE_SECONDS
      }
    }
    this.list = this.list.filter((word) => word.fade > 0)

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
  }

  reset(): void {
    this.list = []
    this.timer = Number.POSITIVE_INFINITY
    this.missed = 0
  }

  private spawn(difficulty: DifficultyLevel): void {
    const active = this.list.filter((word) => word.state === 'active')
    if (active.length >= difficulty.maxConcurrent) {
      return
    }

    // 같은 단어가 화면에 둘 있으면 어느 것을 맞춘 것인지 모호해진다
    const taken = new Set(active.map((word) => word.word))
    const candidates = this.entries.filter((entry) => !taken.has(entry.word))
    if (candidates.length === 0) {
      return
    }

    const side = this.pickSide(active)
    const slot = this.pickSlot(active, side)
    if (slot === null) {
      return
    }

    this.list.push({
      id: this.nextId++,
      word: this.rng.pick(candidates).word,
      side,
      slot,
      y: 0,
      state: 'active',
      fade: 1,
    })
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
