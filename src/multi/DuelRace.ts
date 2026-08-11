import type { PlayerId, PlayerInfo } from './protocol.ts'

type DuelOutcome = 'goal' | 'out' | 'survived'

interface DuelResult {
  readonly id: PlayerId
  readonly placement: number
  readonly outcome: DuelOutcome
}

/** 대결의 골인·탈락 순위를 앞과 뒤에서 각각 채운다. */
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

  finishGoals(ids: readonly PlayerId[]): readonly DuelResult[] {
    const added: DuelResult[] = []
    let placement = [...this.byId.values()].filter((result) => result.outcome === 'goal').length + 1
    for (const id of ids) {
      if (!this.isActive(id)) continue
      const result = { id, placement, outcome: 'goal' as const }
      this.byId.set(id, result)
      added.push(result)
      placement += 1
    }
    return added
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

  /** 한 명만 남으면 그 사람에게 골인자와 탈락자 사이의 빈 순위를 준다. */
  settleLast(): DuelResult | null {
    if (this.activeCount !== 1) return null
    const id = this.order.find((candidate) => this.isActive(candidate))
    if (id === undefined) return null
    const goalCount = [...this.byId.values()].filter((result) => result.outcome === 'goal').length
    const result = { id, placement: goalCount + 1, outcome: 'survived' as const }
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
