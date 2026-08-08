import { PAIR_INGREDIENT_IDS } from '../data/recipes.ts'
import type { Rng } from './Rng.ts'
import type { WordEntry } from '../types/game.ts'

/**
 * 판이 시작될 때 내보낼 단어를 좁힌다.
 *
 * ## 왜
 *
 * 합성은 만들어놓고 **거의 아무도 못 보는 기능**이었다. 중앙 조준 봇으로 재보니
 * 25번을 떨궈도 40판 중 **7판**만 첫 합성에 닿았다. 재료 30종이 단어 78개에 흩어져
 * 있어서, 짝이 받침대에 동시에 살아 있을 일이 드물기 때문이다.
 *
 * 그래서 판 앞머리에는 **같은 물건 둘짜리 재료 몇 개만** 내보낸다. 한 단어를 두 번
 * 치면 재료가 갖춰지고 도형이 같아 잘 붙는다. 같은 봇으로 39/40판이 됐다.
 *
 * | 밭 | 성공 | 첫 합성까지(중앙값) | 이탈 |
 * |---|---|---|---|
 * | 78종 (좁히기 전) | 7/40 | — | 10.3개 |
 * | 7종 | 36/40 | 10번 | 4.6개 |
 * | **3종** | **39/40** | **9번** | 2.5개 |
 * | 2종 | 40/40 | 7번 | 1.9개 |
 * | 1종 | 40/40 | 5번 | 1.6개 |
 *
 * ## 왜 셋인가
 *
 * 좁힐수록 빨라지지만 **초반 동시 낙하 상한이 3**이다(`Difficulty.ts`의 `OPENING`).
 * 셋으로 맞추면 화면에 뜨는 단어 수가 좁히기 전과 같아서, 달라지는 것은
 * "같은 단어가 되풀이된다"뿐이고 손이 멈추지 않는다. 둘로 줄이면 두 번 중 한 번은
 * 칠 것이 없어 기다리게 되는데, 타자게임에서 손이 멈추는 것은 가장 큰 대가다.
 *
 * ## 언제 풀리는가
 *
 * **첫 합성이 일어나는 순간**이다. 시간이나 드롭 수로 끊지 않는다 — 느린 사람은
 * 배우기 전에 풀리고 빠른 사람은 이미 아는 것을 계속 보게 된다. 목적이 "합성이라는
 * 것이 있다"를 알리는 것이므로, 알린 그 순간이 끝나는 지점이다.
 *
 * 이것으로 푸는 것은 두 병목 중 **재료가 갖춰지는 쪽**뿐이다. "갖춰져도 열에 일곱은
 * 안 닿는다"는 쪽은 짝이 받침대 어디에 있는지 화면이 알려줘야 풀린다.
 */

/** 판 앞머리에 내보낼 단어 수. 초반 동시 낙하 상한과 같게 둔다 */
const OPENING_WORD_COUNT = 3

/**
 * 앞머리 밭을 고른다.
 *
 * 난수를 받는 이유는 판마다 다른 짝이 나와야 하기 때문이다 — 늘 같은 셋이면 두 번째
 * 판부터 앞머리가 외운 것을 다시 치는 시간이 된다. 같은 시드면 같은 셋이 나온다.
 *
 * 재료가 아닌 단어는 섞지 않는다. 하나라도 섞이면 그 단어를 친 물건이 합성에 쓸모가
 * 없는 채 받침대를 차지해, 좁혀서 얻은 것을 그만큼 되돌린다.
 *
 * ## 끈적한 것은 뺀다
 *
 * `sticky` 물건은 닿은 것을 그 자리에 고정 관절로 묶는다. 앞머리는 **쌓기가 어떤
 * 것인지 배우는 구간**인데, 그 구간의 물건이 붙어버리면 탑이 부자연스럽게 굳어
 * "이 게임은 잘 안 무너진다"는 잘못된 감각을 먼저 배운다. 밭이 좁아서 같은 물건이
 * 되풀이되므로 그 효과가 판 전체에 걸린다는 점이 특히 나쁘다.
 *
 * **기본형과 히든을 함께 본다.** 같은 것 둘의 결과물이 곧 그 단어의 히든이라,
 * 히든만 끈적해도 **첫 합성의 보상**이 붙어버리는 물건이 된다 — 소시지가 그렇다
 * (문어소시지가 끈적하다). 달팽이는 기본형부터 끈적하다.
 *
 * 이 둘을 빼도 후보가 다섯 남아 밭을 채우는 데 지장이 없다.
 */
function openingEntries(
  rng: Rng,
  entries: readonly WordEntry[],
  count: number = OPENING_WORD_COUNT,
): readonly WordEntry[] {
  /*
   * 재료 id로 단어를 찾는다. 기본형(히든이 아닌 변형)의 id가 재료 목록에 있으면
   * 그 단어를 치면 그 재료가 나온다는 뜻이다.
   */
  const byIngredient = new Map<string, WordEntry>()
  for (const entry of entries) {
    if (entry.variants.some((variant) => variant.sticky)) {
      continue
    }
    for (const variant of entry.variants) {
      if (!variant.hidden && PAIR_INGREDIENT_IDS.includes(variant.id)) {
        byIngredient.set(variant.id, entry)
      }
    }
  }

  const pool = [...byIngredient.values()]
  if (pool.length <= count) {
    // 아트가 줄거나 레시피가 바뀌어 후보가 모자라면 있는 것을 다 쓴다
    return pool
  }

  /*
   * 뽑을 때마다 뒤에서 하나를 당겨와 자리를 메운다(부분 셔플). 뽑은 것을 배열에서
   * 지우면 뒤가 밀려 O(n²)이 되고, 다시 뽑아 겹치는지 보는 방식은 난수 소비 횟수가
   * 판마다 달라져 **같은 시드가 같은 판을 만들지 못한다.**
   */
  const bag = [...pool]
  const picked: WordEntry[] = []
  for (let i = 0; i < count; i += 1) {
    const index = rng.int(bag.length - i)
    const chosen = bag[index]
    const tail = bag[bag.length - 1 - i]
    if (chosen === undefined || tail === undefined) {
      break
    }
    picked.push(chosen)
    bag[index] = tail
  }
  return picked
}

export { openingEntries, OPENING_WORD_COUNT }
