import type { PlayerId, PlayerInfo } from '../multi/protocol.ts'

/**
 * 경쟁 모드의 순수 승패 규칙.
 *
 * 턴과 점수는 없다. 물건이 이탈하거나 자기 단어를 놓치면 하트를 잃고,
 * 살아 있는 사람이 한 명 이하가 되는 순간 판이 끝난다.
 */
class CompetitionState {
  private readonly order: readonly PlayerInfo[]
  private readonly lives = new Map<PlayerId, number>()

  constructor(players: readonly PlayerInfo[], livesPerPlayer: number) {
    if (players.length < 2) {
      throw new Error('경쟁 모드는 두 명 이상이어야 한다')
    }
    this.order = [...players]
    for (const player of players) {
      this.lives.set(player.id, livesPerPlayer)
    }
  }

  get players(): readonly PlayerInfo[] {
    return this.order
  }

  get aliveCount(): number {
    let count = 0
    for (const player of this.order) {
      if (this.isAlive(player.id)) count += 1
    }
    return count
  }

  get over(): boolean {
    return this.aliveCount <= 1
  }

  get winner(): PlayerId | null {
    if (!this.over) return null
    return this.order.find((player) => this.isAlive(player.id))?.id ?? null
  }

  livesOf(id: PlayerId): number {
    return this.lives.get(id) ?? 0
  }

  isAlive(id: PlayerId): boolean {
    return this.livesOf(id) > 0
  }

  loseLife(id: PlayerId, amount = 1): boolean {
    const before = this.lives.get(id)
    if (before === undefined || before <= 0 || amount <= 0) return false
    this.lives.set(id, Math.max(0, before - amount))
    return true
  }

  eliminate(id: PlayerId): boolean {
    if (!this.isAlive(id)) return false
    this.lives.set(id, 0)
    return true
  }

  applyLives(rows: readonly (readonly [PlayerId, number])[]): void {
    for (const [id, value] of rows) {
      if (this.lives.has(id)) {
        this.lives.set(id, Math.max(0, value))
      }
    }
  }

  snapshot(): {
    readonly lives: readonly (readonly [PlayerId, number])[]
    readonly over: boolean
    readonly winner: PlayerId | null
  } {
    return {
      lives: this.order.map((player) => [player.id, this.livesOf(player.id)] as const),
      over: this.over,
      winner: this.winner,
    }
  }
}

export { CompetitionState }
