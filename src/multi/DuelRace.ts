import type { PlayerId, PlayerInfo } from './protocol.ts'

type DuelOutcome = 'out' | 'survived'

interface DuelResult {
  readonly id: PlayerId
  readonly placement: number
  readonly outcome: DuelOutcome
}

/** 탈락 순위를 뒤에서 채우고 마지막 생존자를 1위로 확정한다. */
class DuelRace {
  private readonly order: readonly PlayerId[]
  private readonly byId = new Map<PlayerId, DuelResult>()

  constructor(players: readonly PlayerInfo[]) {
    this.order = players.map((player) => player.id)
  }

  get activeCount(): number {
    return this.order.length - this.byId.size
  }

  get results(): readonly DuelResult[] {
    return [...this.byId.values()].sort((a, b) => (
      a.placement - b.placement || this.order.indexOf(a.id) - this.order.indexOf(b.id)
    ))
  }

  isActive(id: PlayerId): boolean {
    return this.order.includes(id) && !this.byId.has(id)
  }

  resultOf(id: PlayerId): DuelResult | null {
    return this.byId.get(id) ?? null
  }

  eliminate(ids: readonly PlayerId[]): readonly DuelResult[] {
    const active = ids.filter((id, index) => this.isActive(id) && ids.indexOf(id) === index)
    if (active.length === 0) return []

    const outCount = [...this.byId.values()].filter((result) => result.outcome === 'out').length
    const placement = this.order.length - outCount - active.length + 1
    return active.map((id) => {
      const result = { id, placement, outcome: 'out' as const }
      this.byId.set(id, result)
      return result
    })
  }

  /** 한 명만 남으면 마지막 생존자로 1위를 확정한다. */
  settleLast(): DuelResult | null {
    if (this.activeCount !== 1) return null
    const id = this.order.find((candidate) => this.isActive(candidate))
    if (id === undefined) return null
    const result = { id, placement: 1, outcome: 'survived' as const }
    this.byId.set(id, result)
    return result
  }

  apply(results: readonly DuelResult[]): void {
    this.byId.clear()
    for (const result of results) {
      if (!this.order.includes(result.id) || this.byId.has(result.id)) continue
      this.byId.set(result.id, result)
    }
  }

  winner(): PlayerId | null {
    const first = this.results.filter((result) => result.placement === 1)
    return first.length === 1 ? first[0]!.id : null
  }
}

export { DuelRace }
export type { DuelOutcome, DuelResult }
