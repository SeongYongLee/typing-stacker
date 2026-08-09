import type { Recipe } from '../data/recipes.ts'

/**
 * 지금 **서로 합칠 수 있는 것들**에 같은 표식을 붙인다 — 받침대에 놓인 물건과
 * 지금 내려오는 단어를 함께 본다.
 *
 * ## 왜
 *
 * 합성이 안 되는 원인은 둘이고 둘 다 비슷하게 무겁다 — 재료가 아예 안 모이는 판이 48%,
 * 모였는데 안 닿는 경우가 70%다. 앞쪽은 첫 밤과 밤에 밭을 좁혀 풀었지만(`Opening.ts`),
 * **뒤쪽은 화면이 알려주지 않으면 풀리지 않는다.** 짝이 받침대 어디에 있는지 모르면
 * 노릴 수가 없고, 그러면 합성은 손으로 만드는 것이 아니라 운으로 얻는 것이 된다.
 *
 * "안 닿는다"는 70%는 **중앙만 보고 떨구는 봇**으로 잰 값이다. 짝이 보이면 사람은
 * 그 옆을 겨냥할 수 있으므로, 그때 이 수치는 한계가 아니라 실력이 들어갈 자리가 된다.
 *
 * ## 내려오는 단어까지 함께 보는 이유
 *
 * 받침대만 보면 **이미 늦다.** 짝이 갖춰졌다는 것을 아는 순간에는 둘 다 이미 놓여
 * 있어서 할 수 있는 일이 없다. 알아야 할 것은 "지금 치면 저것과 붙는다"이고,
 * 그건 단어가 **아직 내려오는 동안** 알려줘야 조준으로 이어진다.
 *
 * 그래서 세는 대상은 받침대의 물건과 화면의 단어를 합친 것이다. 단어의 물건은
 * 기본 변형으로 친다 — 히든은 Enter를 친 순간 정해지므로 미리 알 수 없고,
 * 레시피가 재료로 삼는 것도 기본 변형이다.
 *
 * ## 색으로 가른다
 *
 * 단어는 글자 상자라 테두리 **색**을 바꾸고, 받침대의 물건은 전부 **동그라미**를 두른다.
 * 모양이 아니라 색이 짝을 잇는다 — 글자 상자와 물건은 생김새가 너무 달라서 같은
 * 모양을 씌워도 "같다"가 잘 안 읽히는데, 색은 무엇 위에 얹혀도 같은 색이다.
 *
 * ## 한 번 정한 색은 지킨다
 *
 * 매 프레임 처음부터 번호를 매기면 **다른 단어가 사라진 것만으로 내 색이 바뀐다.**
 * 갖춰진 조합의 목록이 달라지면서 번호가 밀리기 때문이다. 색이 짝을 잇는 유일한
 * 표식인데 그 색이 흔들리면, 방금 외운 "청록끼리 붙이면 된다"가 매번 무너진다.
 *
 * 그래서 **직전 배정을 받아 이어 쓴다.** 아직 짝이 갖춰져 있는 조합은 쓰던 번호를
 * 그대로 지키고, 새로 갖춰진 조합만 남은 번호를 가져간다.
 *
 * ## 왜 모든 재료에 미리 배정하지 않는가
 *
 * 재료는 46종인데 눈으로 갈라 읽히는 테두리 모양은 네댓 개가 한계다. 46종에 고정으로
 * 나눠주면 같은 모양이 여기저기 뜨는데 정작 그 둘은 짝이 아닌 경우가 대부분이다 —
 * 알려주려던 것과 반대로 헷갈리게 만든다.
 *
 * 그래서 **지금 받침대에 살아 있는 것들 중 실제로 짝이 갖춰진 조합에만** 그때그때
 * 모양을 준다. 동시에 갖춰지는 조합은 대개 한둘이라 네 모양이면 넉넉하고,
 * 화면에 뜬 표식은 언제나 "이것끼리 붙이면 된다"만 뜻한다.
 *
 * 브라우저도 물리도 모르는 순수 함수라 node에서 그대로 시험한다.
 */

/**
 * 표식 색. 짝마다 하나씩 돌아간다.
 *
 * **개수와 색을 한자리에 둔다.** 따로 두면 색을 늘리고 개수를 안 늘리거나 그 반대가
 * 되어, 표식이 조용히 겹치거나 색이 없는 번호가 생긴다.
 *
 * 고른 넷은 게임이 이미 뜻을 준 색을 피한 것이다 — 금색(조준·히든), 붉은색(잃음),
 * 초록(살아남음)은 쓰지 않는다. 어두운 배경과 스티커 아트 위에서 서로 갈려 보이는
 * 한색 계열로 골랐다.
 */
const PAIR_MARK_COLORS: readonly string[] = [
  '#45e0d0',
  '#ff79c6',
  '#8ab4ff',
  '#c792ff',
]

/** 쓸 수 있는 표식 수. 색이 곧 표식이므로 색의 개수가 그대로 상한이다 */
const MARK_COUNT = PAIR_MARK_COLORS.length

/**
 * 재료가 갖춰진 조합에 표식을 매긴다.
 *
 * @param available 받침대의 물건과 내려오는 단어를 합쳐 센 변형 id별 개수
 * @param previous 직전 배정. 쓰던 번호를 이어 쓰려는 것이다
 * @returns 변형 id → 표식 번호(0부터). 표식이 없는 것은 담기지 않는다
 *
 * 한 물건이 여러 조합에 낄 수 있다. 그때는 **먼저 갖춰진 조합**의 표식을 쓴다 —
 * 하나에 표식을 둘 씌우면 어느 쪽과 붙여야 하는지가 도로 흐려진다.
 */
function pairMarks(
  available: ReadonlyMap<string, number>,
  recipes: readonly Recipe[],
  previous: ReadonlyMap<string, number> = NONE,
): ReadonlyMap<string, number> {
  const groups = recipes.filter((recipe) => ready(recipe, available))
  const marks = new Map<string, number>()
  const taken = new Set<number>()

  /*
   * 쓰던 번호를 먼저 돌려준다. 두 조합이 같은 번호를 원하면 앞의 것이 지킨다 —
   * 어느 쪽이든 하나는 바뀌어야 하고, 순서를 정해두면 적어도 매 프레임 뒤바뀌지는 않는다.
   */
  const claim = new Map<Recipe, number>()
  for (const recipe of groups) {
    const ids = new Set(recipe.inputs)
    const worn = [...ids].map((id) => previous.get(id)).find((mark) => mark !== undefined)
    if (worn !== undefined && !taken.has(worn)) {
      claim.set(recipe, worn)
      taken.add(worn)
    }
  }

  for (const recipe of groups) {
    const ids = new Set(recipe.inputs)
    // 이미 표식이 붙은 물건만으로 이루어진 조합은 건너뛴다 — 새 번호를 줘봐야 헷갈리기만 한다
    if ([...ids].every((id) => marks.has(id))) {
      continue
    }
    const mark = claim.get(recipe) ?? free(taken)
    if (mark === null) {
      break
    }
    taken.add(mark)
    for (const id of ids) {
      if (!marks.has(id)) {
        marks.set(id, mark)
      }
    }
  }

  return marks
}

/**
 * 표식이 한 번 숨 쉬는 데 걸리는 시간(초).
 *
 * 단어 칩과 받침대의 물건이 **같은 값을 받아** 그린다. 각자 제 시계로 그리면 위상이
 * 어긋나 한쪽이 밝을 때 다른 쪽이 어두운데, 그러면 둘이 한 쌍이라는 것이 오히려 흐려진다.
 */
const PAIR_PULSE_SEC = 1.3

/**
 * 지금 표식의 밝기(0~1). 판이 흐른 시간만 있으면 된다.
 *
 * 엔진이 한 번 계산해 화면 둘에 같은 값을 넘긴다 — 계산을 양쪽에 두면 언젠가
 * 한쪽만 고쳐져 어긋난다.
 */
function pairPulse(elapsedSec: number): number {
  return 0.5 + 0.5 * Math.sin((elapsedSec / PAIR_PULSE_SEC) * Math.PI * 2)
}

/** 아직 안 쓴 가장 작은 번호. 다 찼으면 null */
function free(taken: ReadonlySet<number>): number | null {
  for (let i = 0; i < MARK_COUNT; i += 1) {
    if (!taken.has(i)) {
      return i
    }
  }
  return null
}

const NONE: ReadonlyMap<string, number> = new Map()

/** 이 레시피의 재료가 지금 다 있는가. 같은 재료 둘짜리는 둘이 있어야 한다 */
function ready(recipe: Recipe, available: ReadonlyMap<string, number>): boolean {
  const need = new Map<string, number>()
  for (const id of recipe.inputs) {
    need.set(id, (need.get(id) ?? 0) + 1)
  }
  for (const [id, count] of need) {
    if ((available.get(id) ?? 0) < count) {
      return false
    }
  }
  return true
}

export { pairMarks, pairPulse, MARK_COUNT, PAIR_MARK_COLORS, PAIR_PULSE_SEC }
