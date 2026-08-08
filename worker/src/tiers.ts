/**
 * 레이팅 구간에 붙인 이름.
 *
 * 순위를 매기는 곳(board)과 짝을 찾는 곳(matching)이 **같은 경계를 봐야 한다** —
 * "같은 티어끼리 붙인다"는 규칙이 표시용 티어와 어긋나면, 화면에는 같은 골드로
 * 보이는 둘이 서로 다른 대역에 들어가 영영 안 붙는다. 그래서 표를 따로 두고 둘이 읽는다.
 *
 * `src/rank/tiers.ts`에도 같은 표가 있다(표시는 거기서 한다). 바꿀 때 함께 고쳐야 한다.
 */
const TIERS = [
  { name: '브론즈', from: 0 },
  { name: '실버', from: 900 },
  { name: '골드', from: 1100 },
  { name: '플래티넘', from: 1300 },
  { name: '다이아', from: 1500 },
] as const

/** 시작값. 아직 한 판도 안 한 사람은 이 값으로 본다 */
const START_RATING = 1000

/** 몇 번째 티어인가. 대역을 "티어 몇 칸"으로 세기 위한 것이다 */
function tierIndexOf(rating: number): number {
  let index = 0
  for (let i = 0; i < TIERS.length; i += 1) {
    if (rating >= TIERS[i]!.from) {
      index = i
    }
  }
  return index
}

export { TIERS, START_RATING, tierIndexOf }
