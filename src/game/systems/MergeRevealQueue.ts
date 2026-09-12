import type { ItemVariant } from '../types/game.ts'

export interface MergeReveal {
  readonly seq: number
  readonly variant: ItemVariant
  readonly from: readonly ItemVariant[]
  elapsed: number
  readonly duration: number
}

/** Presentation time only: crafting and scoring never wait for this queue. */
export class MergeRevealQueue {
  current: MergeReveal | null = null
  private readonly pending: MergeReveal[] = []
  private seq = 0

  enqueue(variant: ItemVariant, from: readonly ItemVariant[], duration: number): void {
    const reveal = { seq: ++this.seq, variant, from: [...from], elapsed: 0, duration }
    if (this.current === null) this.current = reveal
    else this.pending.push(reveal)
  }

  advance(dt: number): void {
    if (this.current === null || dt <= 0) return
    this.current.elapsed += dt
    if (this.current.elapsed >= this.current.duration) {
      // Start at zero even after a slow frame: never skip a queued presentation.
      this.current = this.pending.shift() ?? null
    }
  }

  reset(): void {
    this.current = null
    this.pending.length = 0
  }
}
