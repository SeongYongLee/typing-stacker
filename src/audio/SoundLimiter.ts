import type { GameEvent } from '../game/types/events.ts'

/**
 * 같은 소리가 몰릴 때 몇 개만 통과시킨다.
 *
 * 탑이 무너지면 부딪힘이 한 프레임에 열 개도 들어온다. 그대로 다 울리면 개별 소리가
 * 구분되지 않고 잡음 덩어리가 된다. 마스터의 컴프레서가 진폭은 잡아주지만
 * "무엇이 부딪혔는지 들린다"는 되살리지 못한다 — 그건 개수의 문제다.
 *
 * 버려지는 소리가 생기는 것은 의도다. 무너지는 순간에 필요한 것은 정확한 개수가
 * 아니라 "우르르 쏟아진다"는 인상이고, 개수를 지키려다 그 인상을 잃으면 손해다.
 *
 * WebAudio를 모르는 순수 로직이라 node에서 그대로 테스트가 돈다 —
 * 실제 소리는 귀로만 확인할 수 있지만, 몇 개를 흘려보내는지는 잴 수 있다.
 */

/**
 * 같은 종류를 다시 울리기까지의 최소 간격(초).
 * 적히지 않은 것은 DEFAULT_GAP을 쓴다.
 */
const MIN_GAP: Partial<Record<GameEvent['kind'], number>> = {
  // 키를 누르는 것과 1대1이어야 한다. 막으면 빠르게 칠 때 소리가 빠진다
  typed: 0.015,
  wordHit: 0.04,
  wordMiss: 0.05,
  drop: 0.05,
  menuMove: 0.035,
  menuSelect: 0.05,
  quake: 0.12,
  lifeLost: 0.2,
  collapse: 0.5,
  // 한 사람이 연달아 말하는 것은 기록이 막지만, 여럿이 동시에 말하면 여기서 걸린다
  chat: 0.15,
}

const DEFAULT_GAP = 0.06

/** 부딪힘은 이 창(초) 안에 이 개수까지만 울린다 */
const IMPACT_WINDOW_SEC = 0.09
const IMPACT_WINDOW_MAX = 3

class SoundLimiter {
  private readonly lastAt = new Map<GameEvent['kind'], number>()
  private impactWindowStart = Number.NEGATIVE_INFINITY
  private impactsInWindow = 0

  /**
   * 이 종류를 지금 울려도 되는가. 되면 시각을 적어두고 true를 준다.
   *
   * 묻는 것과 적어두는 것을 한 번에 하는 이유는 둘을 나누면 호출부가 한쪽을
   * 잊을 수 있고, 그러면 제한이 조용히 새기 때문이다.
   */
  allow(kind: GameEvent['kind'], now: number): boolean {
    if (kind === 'impact') {
      return this.allowImpact(now)
    }
    const gap = MIN_GAP[kind] ?? DEFAULT_GAP
    const last = this.lastAt.get(kind)
    if (last !== undefined && now - last < gap) {
      return false
    }
    this.lastAt.set(kind, now)
    return true
  }

  private allowImpact(now: number): boolean {
    if (now - this.impactWindowStart >= IMPACT_WINDOW_SEC) {
      this.impactWindowStart = now
      this.impactsInWindow = 0
    }
    if (this.impactsInWindow >= IMPACT_WINDOW_MAX) {
      return false
    }
    this.impactsInWindow += 1
    return true
  }

  reset(): void {
    this.lastAt.clear()
    this.impactWindowStart = Number.NEGATIVE_INFINITY
    this.impactsInWindow = 0
  }
}

export { SoundLimiter, MIN_GAP, DEFAULT_GAP, IMPACT_WINDOW_SEC, IMPACT_WINDOW_MAX }
