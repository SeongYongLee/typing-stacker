/**
 * 레이팅 계산.
 *
 * 여러 명이 붙은 판을 **모든 쌍의 1대1 판**으로 본다. 4명이면 6판이다.
 * 각 쌍에서 더 오래 버틴 쪽이 이긴 것으로 치고, 쌍마다 Elo를 굴려 더한 뒤
 * (인원-1)로 나눈다 — 나누지 않으면 사람이 늘수록 한 판의 무게가 커진다.
 *
 * 이 방식이 주는 것들:
 *
 * - **높은 사람이 지면 많이 잃는다.** 모든 쌍에서 이길 것으로 기대되므로 그중
 *   여럿에게 밀리면 기대와의 차이가 크다.
 * - **먼저 죽을수록 많이 잃는다.** 등수가 곧 이긴 쌍의 수다.
 * - **4명 중 2등도 오를 수 있다.** 레이팅이 판의 평균보다 낮았다면 셋 중 둘을
 *   이긴 것 자체가 기대를 넘는다. 등수가 아니라 **기대와의 차이**가 기준이기 때문이다.
 *
 * 순수 함수라 node에서 그대로 테스트한다. 판정은 서버가 하지만(worker/src/board.ts)
 * 같은 규칙을 여기에도 두어 화면이 미리 보여줄 수 있게 한다.
 */

/** 레이팅 시작값. 티어 구간의 한가운데에 둔다 */
const START_RATING = 1000

/**
 * 한 판이 움직이는 폭.
 *
 * 판수가 적을 때 크게 움직여야 자기 자리를 빨리 찾는다. 그 뒤에는 작게 움직여야
 * 한 판의 운으로 등급이 출렁이지 않는다.
 */
function kFactor(games: number): number {
  if (games < 10) return 48
  if (games < 30) return 32
  return 24
}

interface Standing {
  readonly id: string
  readonly rating: number
  /** 지금까지 치른 판수. 적을수록 크게 움직인다 */
  readonly games: number
  /**
   * 등수. **1이 가장 늦게까지 버틴 사람**이다.
   * 같은 붕괴로 함께 탈락하면 같은 등수를 주고, 그 쌍은 비긴 것으로 친다.
   */
  readonly placement: number
}

/** 내가 상대를 이길 것으로 기대되는 정도(0~1) */
function expected(mine: number, theirs: number): number {
  return 1 / (1 + 10 ** ((theirs - mine) / 400))
}

/** 두 등수를 견줘 이 쌍의 결과를 낸다. 1 = 이겼다, 0.5 = 비겼다, 0 = 졌다 */
function outcome(mine: number, theirs: number): number {
  if (mine === theirs) return 0.5
  return mine < theirs ? 1 : 0
}

/**
 * 판이 끝난 뒤 사람마다 오르내릴 폭.
 *
 * 돌려주는 값은 **변동폭**이지 새 레이팅이 아니다 — 호출부가 지금 값에 더한다.
 * 인원이 둘이면 평범한 1대1 Elo와 정확히 같은 값이 나온다(쌍이 하나뿐이므로).
 */
function rateMatch(standings: readonly Standing[]): Map<string, number> {
  const deltas = new Map<string, number>()
  if (standings.length < 2) {
    for (const one of standings) {
      deltas.set(one.id, 0)
    }
    return deltas
  }

  const opponents = standings.length - 1
  for (const me of standings) {
    let sum = 0
    for (const other of standings) {
      if (other.id === me.id) {
        continue
      }
      sum += outcome(me.placement, other.placement) - expected(me.rating, other.rating)
    }
    deltas.set(me.id, Math.round((kFactor(me.games) * sum) / opponents))
  }
  return deltas
}

export { rateMatch, expected, kFactor, START_RATING }
export type { Standing }
