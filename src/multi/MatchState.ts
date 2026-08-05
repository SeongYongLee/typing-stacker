import type { PlayerId, PlayerInfo } from './protocol.ts'

/**
 * 대전의 규칙 상태 — 턴 순서, 하트, 탈락, 승자.
 *
 * 2명을 특수 케이스로 두지 않는다. 플레이어를 배열로 들고 인덱스를 순환시키므로
 * 인원이 늘어도 이 파일은 그대로다. 탈락한 사람은 순환에서 빠지고, 마지막 한 명이 승자다.
 *
 * 물리도 화면도 모르는 순수 규칙이라 node에서 그대로 테스트한다.
 */
class MatchState {
  private readonly order: PlayerInfo[]
  private readonly lives = new Map<PlayerId, number>()
  private turnIndex = 0

  constructor(players: readonly PlayerInfo[], livesPerPlayer: number) {
    if (players.length === 0) {
      throw new Error('플레이어가 없다')
    }
    this.order = [...players]
    for (const player of this.order) {
      this.lives.set(player.id, livesPerPlayer)
    }
  }

  get players(): readonly PlayerInfo[] {
    return this.order
  }

  /** 지금 떨굴 차례인 사람. 판이 끝났으면 null */
  get currentPlayer(): PlayerId | null {
    if (this.over) {
      return null
    }
    return this.order[this.turnIndex]?.id ?? null
  }

  get aliveCount(): number {
    return this.order.filter((player) => this.isAlive(player.id)).length
  }

  /** 생존자가 한 명 이하로 줄면 끝이다 */
  get over(): boolean {
    return this.aliveCount <= 1
  }

  /**
   * 승자. 마지막 한 명이 이긴다.
   * 한 번의 붕괴로 모두가 동시에 탈락하면 무승부라 null이다.
   */
  get winner(): PlayerId | null {
    if (!this.over) {
      return null
    }
    return this.order.find((player) => this.isAlive(player.id))?.id ?? null
  }

  livesOf(id: PlayerId): number {
    return this.lives.get(id) ?? 0
  }

  isAlive(id: PlayerId): boolean {
    return this.livesOf(id) > 0
  }

  /** 그 사람이 지금 물건을 떨굴 수 있는가. 상대가 보낸 drop을 검증하는 문이다 */
  canDrop(id: PlayerId): boolean {
    return !this.over && this.isAlive(id) && this.currentPlayer === id
  }

  /**
   * 물건이 받침대를 벗어나 주인의 하트가 깎인다.
   * 떨어뜨린 사람이 아니라 **쌓은 사람**이 잃는다 — 그래서 상대 물건을 밀어내는 것이 공격이 된다.
   */
  loseLife(owner: PlayerId): void {
    const remaining = this.lives.get(owner)
    if (remaining === undefined || remaining <= 0) {
      return
    }
    this.lives.set(owner, remaining - 1)
  }

  /**
   * 다음 생존자에게 턴을 넘긴다.
   * 탈락자를 건너뛰므로 인원이 줄어도 순환이 끊기지 않는다.
   */
  nextTurn(): void {
    if (this.over) {
      return
    }
    for (let step = 1; step <= this.order.length; step += 1) {
      const index = (this.turnIndex + step) % this.order.length
      const candidate = this.order[index]
      if (candidate !== undefined && this.isAlive(candidate.id)) {
        this.turnIndex = index
        return
      }
    }
  }

  /**
   * 방장이 알려준 차례로 맞춘다.
   *
   * 게스트가 스스로 nextTurn을 돌리지 않는 이유는 순서가 한 곳에서만 정해져야 하기 때문이다 —
   * 탈락이 끼면 "다음 사람"이 양쪽에서 달라질 수 있고, 그러면 둘이 서로 자기 차례라고 믿는다.
   * 모르는 사람이나 탈락자를 가리키면 무시한다.
   */
  setTurn(id: PlayerId): boolean {
    const index = this.order.findIndex((player) => player.id === id)
    if (index < 0 || !this.isAlive(id)) {
      return false
    }
    this.turnIndex = index
    return true
  }

  /**
   * 지금 턴 주인이 탈락했다면 살아있는 사람에게 턴을 옮긴다.
   * 자기 물건이 무너져 스스로 탈락하는 경우가 있어 하트를 깎은 뒤 불러야 한다.
   */
  ensureTurnAlive(): void {
    const current = this.order[this.turnIndex]
    if (current !== undefined && !this.isAlive(current.id)) {
      this.nextTurn()
    }
  }

  snapshot(): {
    readonly current: PlayerId | null
    readonly lives: readonly (readonly [PlayerId, number])[]
    readonly over: boolean
    readonly winner: PlayerId | null
  } {
    return {
      current: this.currentPlayer,
      lives: this.order.map((player) => [player.id, this.livesOf(player.id)] as const),
      over: this.over,
      winner: this.winner,
    }
  }
}

export { MatchState }
