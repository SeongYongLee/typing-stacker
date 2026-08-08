import { TIERS, tierIndexOf } from './tiers.ts'

/**
 * 기다리는 사람들 중에서 짝을 고른다.
 *
 * 저장·통신에서 떼어낸 순수 함수다 — Durable Object를 띄우지 않고 node에서 그대로
 * 시험할 수 있어야 하는데, 여기서 틀리면 "아무도 안 붙는다"나 "엉뚱한 사람과 붙는다"로
 * 나타나고 둘 다 실제로 사람이 둘 이상 모여야 드러나기 때문이다.
 */

/** 짝이 될 사람 하나. `since`는 줄에 선 시각(ms) */
interface Waiting {
  readonly device: string
  readonly rating: number
  readonly since: number
}

/**
 * 대역이 넓어지는 시각표.
 *
 * 같은 티어끼리만 붙이면 사람이 적을 때 영영 안 붙는다 — 지금 이 게임의 실제 상황이
 * 그렇다. 그렇다고 처음부터 아무나 붙이면 티어가 매칭에서 아무 의미가 없다.
 * 그래서 **기다린 만큼 넓힌다**: 처음에는 같은 티어, 조금 지나면 옆 티어, 오래
 * 기다리면 아무나.
 *
 * 숫자는 "이쯤이면 포기하고 아무나 만나도 낫다"는 감각으로 골랐다. 사람이 늘면
 * 앞쪽 구간에서 붙는 일이 늘어 저절로 좁아진다.
 */
const WIDEN_AT_SEC = [0, 15, 35] as const

/** 몇 칸 떨어진 티어까지 받아들이는가 */
function bandOf(waitedSec: number): number {
  if (waitedSec >= WIDEN_AT_SEC[2]) {
    // 아무나. 티어 수보다 크게 두어 어떤 차이든 통과한다
    return TIERS.length
  }
  return waitedSec >= WIDEN_AT_SEC[1] ? 1 : 0
}

function waitedSecOf(entry: Waiting, now: number): number {
  return Math.max(0, (now - entry.since) / 1000)
}

/**
 * 한쪽이 상대를 받아들이는가. **양쪽 모두 받아들여야 짝이 된다.**
 *
 * 한쪽만 봐도 되게 하면, 오래 기다린 다이아가 방금 들어온 브론즈를 그 자리에서
 * 끌어간다. 끌려간 쪽은 기다린 적도 없이 대역 밖의 상대를 만나므로 자동매칭이
 * "가끔 말도 안 되는 상대가 걸린다"로 기억된다 — 기다림의 대가는 기다린 사람만 진다.
 */
function accepts(self: Waiting, other: Waiting, now: number): boolean {
  const gap = Math.abs(tierIndexOf(self.rating) - tierIndexOf(other.rating))
  return gap <= bandOf(waitedSecOf(self, now))
}

/**
 * 짝 하나를 찾는다. 없으면 null.
 *
 * **가장 오래 기다린 사람부터 본다.** 새로 들어온 사람이 먼저 붙어버리면 대역이
 * 넓은(= 오래 기다린) 사람이 계속 뒤로 밀려 굶는다. 그 사람의 상대로는 레이팅이
 * 가장 가까운 쪽을 고른다 — 어차피 붙일 수 있는 사람 중에서라면 가까운 편이 낫다.
 */
function findPair(waiting: readonly Waiting[], now: number): [Waiting, Waiting] | null {
  const byWait = [...waiting].sort((a, b) => a.since - b.since)

  for (const self of byWait) {
    let best: Waiting | null = null
    let bestGap = Number.POSITIVE_INFINITY
    for (const other of byWait) {
      if (other.device === self.device) continue
      if (!accepts(self, other, now) || !accepts(other, self, now)) continue
      const gap = Math.abs(self.rating - other.rating)
      if (gap < bestGap) {
        best = other
        bestGap = gap
      }
    }
    if (best !== null) {
      return [self, best]
    }
  }
  return null
}

export { bandOf, accepts, findPair, waitedSecOf, WIDEN_AT_SEC }
export type { Waiting }
