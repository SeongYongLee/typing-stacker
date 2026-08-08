import type { PlayerId, PlayerInfo } from './protocol.ts'

/**
 * 대전의 규칙 상태 — 하트, 탈락, 승자.
 *
 * **차례가 돌아간다.** 한 번에 한 사람만 떨군다 — 받침대가 하나뿐이라 동시에
 * 떨구면 누구 물건이 무엇을 밀었는지 알 수 없고, 쌓기가 운이 된다.
 *
 * 다만 앞사람의 물건이 **자리를 잡기를 기다리지는 않는다.** 기다리게 하면 구르는
 * 물건 하나에 판 전체가 멈춘다. 대신 모두가 함께 쓰는 짧은 쿨타임을 두고, 그것만
 * 끝나면 다음 사람이 바로 친다 (MatchEngine).
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
  /** 지금 떨굴 차례인 사람의 자리. 탈락자를 건너뛰며 돈다 */
  private turnIndex = 0

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

  /** 지금 떨굴 차례인 사람. 판이 끝났으면 null */
  get currentPlayer(): PlayerId | null {
    if (this.over) {
      return null
    }
    return this.order[this.turnIndex]?.id ?? null
  }

  /**
   * 다음 사람에게 넘긴다. 탈락한 사람은 건너뛴다.
   *
   * 살아 있는 사람을 찾을 때까지 한 바퀴만 돈다 — 아무도 살아 있지 않으면
   * 판이 이미 끝난 것이라 자리를 그대로 둔다.
   */
  nextTurn(): void {
    for (let step = 1; step <= this.order.length; step += 1) {
      const index = (this.turnIndex + step) % this.order.length
      const candidate = this.order[index]
      if (candidate !== undefined && this.isAlive(candidate.id)) {
        this.turnIndex = index
        return
      }
    }
  }

  /** 방장이 정한 차례를 그대로 따른다 (참가자 쪽) */
  setTurn(id: PlayerId): void {
    const index = this.order.findIndex((player) => player.id === id)
    if (index >= 0) {
      this.turnIndex = index
    }
  }

  /**
   * 차례인 사람이 방금 탈락했으면 다음으로 넘긴다.
   * 이걸 하지 않으면 죽은 사람 차례에서 판이 멈춘다.
   */
  ensureTurnAlive(): void {
    const current = this.order[this.turnIndex]
    if (current === undefined || !this.isAlive(current.id)) {
      this.nextTurn()
    }
  }

  livesOf(id: PlayerId): number {
    return this.lives.get(id) ?? 0
  }

  isAlive(id: PlayerId): boolean {
    return this.livesOf(id) > 0
  }

  /**
   * 그 사람이 지금 물건을 떨굴 수 있는가. 상대가 보낸 drop을 검증하는 문이다.
   * **자기 차례여야 한다.** 쿨타임이 남았는지는 시간을 아는 MatchEngine이 따로 본다.
   */
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
