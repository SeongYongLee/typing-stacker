import type { PlayerId, PlayerInfo } from './protocol.ts'

/**
 * 대전의 규칙 상태 — 하트, 탈락, 승자.
 *
 * **턴은 없다.** 예전에는 한 사람씩 돌아가며 떨궜는데, 그러면 상대가 쌓는 동안
 * 내 손이 멈춰 있어야 했다. 타자게임에서 손을 멈추게 하는 것은 가장 큰 대가다.
 * 이제 둘 다 언제든 칠 수 있고, 물건이 한꺼번에 쏟아지는 것은 사람마다 따로 도는
 * 낙하 간격이 막는다(MatchEngine).
 *
 * 2명을 특수 케이스로 두지 않는다. 인원이 늘어도 이 파일은 그대로다.
 * 마지막 한 명이 승자다.
 *
 * 물리도 화면도 모르는 순수 규칙이라 node에서 그대로 테스트한다.
 */
class MatchState {
  private readonly order: PlayerInfo[]
  private readonly lives = new Map<PlayerId, number>()
  /** 회복으로도 이 위로는 올라가지 못한다 — 방해를 쌓아 무한히 버티면 판이 끝나지 않는다 */
  private readonly maxLives: number

  constructor(players: readonly PlayerInfo[], livesPerPlayer: number) {
    if (players.length === 0) {
      throw new Error('플레이어가 없다')
    }
    this.order = [...players]
    this.maxLives = livesPerPlayer
    for (const player of this.order) {
      this.lives.set(player.id, livesPerPlayer)
    }
  }

  get players(): readonly PlayerInfo[] {
    return this.order
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

  /**
   * 그 사람이 지금 물건을 떨굴 수 있는가. 상대가 보낸 drop을 검증하는 문이다.
   * 차례를 보지 않는다 — 살아 있고 판이 끝나지 않았으면 언제든 떨굴 수 있다.
   * 얼마나 자주 떨구는지는 방장이 낙하 간격으로 따로 막는다.
   */
  canDrop(id: PlayerId): boolean {
    return !this.over && this.isAlive(id)
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
   * 방해가 먹혔을 때 방해한 사람이 하트를 되찾는다.
   *
   * 되찾는 쪽이 **방해를 건 사람**인 이유는, 방해가 상대에게 놓는 덫이기 때문이다 —
   * 상대가 그 단어를 치면 덫이 작동한 것이고 그 값이 나에게 온다.
   * 이미 탈락한 사람은 되살아나지 않는다. 판이 끝나고도 되돌아오면 승패가 뒤집힌다.
   */
  heal(id: PlayerId, amount: number): void {
    const current = this.lives.get(id)
    if (current === undefined || current <= 0 || amount <= 0) {
      return
    }
    this.lives.set(id, Math.min(current + amount, this.maxLives))
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

export { MatchState }
