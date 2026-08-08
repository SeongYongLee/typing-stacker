import type { RunRecord } from './client.ts'

/**
 * 판이 도는 동안 **무엇을 쫓고 있는가**를 정한다.
 *
 * 전역 등수만 쓰면 대부분의 판에서 빈 채로 있다. 서버가 주는 상위 목록이 일곱 개뿐이고
 * 그 꼴찌가 몇백 점이라, 거기 닿기 전까지는 따라갈 대상이 없다.
 *
 * 그래서 **내 최고 기록이 기본**이다. 그건 언제나 있고, "1등까지 얼마"보다 손이
 * 실제로 빨라지는 목표다. 순위권에 들어서면 그때 등수로 갈아탄다 — 그 지점부터는
 * 바로 위가 더 가깝고 더 값지다.
 *
 * 화면을 모른다. 여기는 규칙만 있고 어떻게 보일지는 `RunChase`가 정한다.
 */

/** 지금 쫓고 있는 것 */
interface Chase {
  readonly label: string
  /** 넘어서기까지 남은 점수 */
  readonly gap: number
}

/** 점수 높은 순. 서버가 정렬해 주더라도 여기서 다시 세운다 — 순서를 남에게 맡기지 않는다 */
function ranked(top: readonly RunRecord[]): RunRecord[] {
  return [...top].sort((a, b) => b.score - a.score)
}

/**
 * 지금 점수라면 몇 위일지. `null`이면 순위권 밖이라 알 수 없다.
 *
 * **상위 목록 안에 들어섰을 때만 답할 수 있다.** 서버는 일곱 개만 주므로 그 꼴찌보다
 * 낮으면 스무 번째인지 백 번째인지 알 길이 없다. 모르는 것을 숫자로 지어내면
 * 그 숫자를 보고 판을 판단하게 되므로, 모를 때는 모른다고 두고 화면이 다른 말을 한다.
 */
function rankOf(score: number, top: readonly RunRecord[]): number | null {
  const list = ranked(top)
  const lowest = list[list.length - 1]
  if (lowest === undefined || score < lowest.score) {
    return null
  }
  return list.filter((record) => record.score > score).length + 1
}

/**
 * 지금 쫓는 것. `null`이면 더 위가 없다 — 그때는 `crownOf`가 답한다.
 *
 * **동점은 이미 닿은 것으로 보고 그다음을 가리킨다**(`record.score > score`인 것만
 * 위로 친다). 같은 점수인 기록을 목표로 내걸면 "0점 남았다"가 뜨는데, 그건 목표가
 * 아니라 이미 도착한 자리다. 아직 남은 것을 가리켜야 쫓을 것이 된다.
 */
function chaseOf(
  score: number,
  best: RunRecord | null,
  top: readonly RunRecord[],
): Chase | null {
  const list = ranked(top)
  const lowest = list[list.length - 1]

  // 순위권 안에 들어섰으면 바로 위 등수를 쫓는다
  if (lowest !== undefined && score >= lowest.score) {
    const aheadIndex = list.findLastIndex((record) => record.score > score)
    if (aheadIndex < 0) {
      return null
    }
    return { label: `${aheadIndex + 1}위`, gap: list[aheadIndex]!.score - score }
  }

  if (best !== null && score < best.score) {
    return { label: '내 최고 점수', gap: best.score - score }
  }
  return null
}

/**
 * 더 위가 없을 때 뭐라고 할지.
 *
 * 순위권 안이면 1위이고, 목록이 비었거나 아직 못 미쳤어도 제 기록은 깼을 수 있다.
 * 둘 다 아니면 `null` — 쫓을 것도 자랑할 것도 없으니 자리를 비운다.
 */
function crownOf(
  score: number,
  best: RunRecord | null,
  top: readonly RunRecord[],
): string | null {
  const highest = ranked(top)[0]
  if (highest !== undefined && score >= highest.score) {
    return '1위'
  }
  if (best !== null && score >= best.score) {
    return '신기록'
  }
  return null
}

export { chaseOf, crownOf, rankOf }
export type { Chase }
