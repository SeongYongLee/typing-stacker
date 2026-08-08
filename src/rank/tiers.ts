/**
 * 레이팅 구간에 붙인 이름.
 *
 * 숫자만 보여주면 잘하고 있는지 알 수 없다 — 1120이 높은 건지 낮은 건지는
 * 다른 사람의 값을 봐야 알 수 있는데, 티어는 그 비교를 미리 해준다.
 *
 * **서버에도 같은 표가 있다**(worker/src/board.ts). 표시는 여기서, 저장은 거기서
 * 하므로 굳이 주고받지 않는다 — 대신 바꿀 때 두 곳을 함께 고쳐야 한다.
 */
const TIERS = [
  { name: '브론즈', from: 0, color: '#b98a5a' },
  { name: '실버', from: 900, color: '#b6bdd4' },
  { name: '골드', from: 1100, color: '#ffcf5c' },
  { name: '플래티넘', from: 1300, color: '#6bffd6' },
  { name: '다이아', from: 1500, color: '#8bd6ff' },
] as const

type Tier = (typeof TIERS)[number]

/** 시작값. 티어 구간의 한가운데(골드 바로 아래)에 둔다 */
const START_RATING = 1000

function tierOf(rating: number): Tier {
  let found: Tier = TIERS[0]
  for (const tier of TIERS) {
    if (rating >= tier.from) {
      found = tier
    }
  }
  return found
}

/**
 * 다음 티어까지의 진행도(0~1). 마지막 티어는 항상 1이다.
 * 등급만 보여주면 그 안에서 오르내리는 것이 보이지 않아 한 판이 무의미해 보인다.
 */
function tierProgress(rating: number): number {
  const index = TIERS.findIndex((tier) => tier === tierOf(rating))
  const current = TIERS[index]
  const next = TIERS[index + 1]
  if (current === undefined || next === undefined) {
    return 1
  }
  return Math.min(Math.max((rating - current.from) / (next.from - current.from), 0), 1)
}

export { TIERS, START_RATING, tierOf, tierProgress }
export type { Tier }
