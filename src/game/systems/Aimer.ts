/**
 * 아레나 상단을 좌우로 등속 왕복하는 조준자.
 * 사인 이징이 아니라 삼각파인 이유는 속도가 일정해야 플레이어가 도착 시점을
 * 예측할 수 있고, Enter 타이밍이 곧 조준인 이 게임에서 그 예측 가능성이 곧 공정성이다.
 */
class Aimer {
  /** 0 → 2를 순환한다. 0~1 구간은 오른쪽 이동, 1~2 구간은 왼쪽 이동 */
  private phase: number
  private readonly halfRange: number

  constructor(halfRange: number, startPhase = 0) {
    this.halfRange = halfRange
    this.phase = startPhase
  }

  update(dt: number, speed: number): void {
    this.phase = (this.phase + dt * speed) % 2
  }

  /** -1(왼쪽 끝) ~ 1(오른쪽 끝) */
  get normalized(): number {
    const triangle = this.phase < 1 ? this.phase : 2 - this.phase
    return triangle * 2 - 1
  }

  get worldX(): number {
    return this.normalized * this.halfRange
  }
}

export { Aimer }
