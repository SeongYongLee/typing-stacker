import type { Rng } from './Rng.ts'
import type { WordEntry } from '../types/game.ts'

/**
 * 보관소 벽의 화이트보드 — **회수 목록.**
 *
 * ## 무엇을 하는가
 *
 * 보드에 단어 서넛이 적혀 있다. 그 단어가 레인에 내려오면 쪽지에 표식이 붙고,
 * 치면 물건이 탑에 얹히지 않는다 — 내려온 레인 쪽으로 경사판이 잠깐 나와 물건을
 * 흘려보낸다. **그렇게 나간 물건은 목숨을 깎지 않는다.**
 *
 * 그래서 이것은 **안전한 배출구**다. 이 게임은 벽이 없는 받침대에 쌓는 게임이라
 * 넓거나 잘 구르는 물건(자전거·우산·비행기)이 오면 그 자체가 사고인데, 지금까지
 * 그것을 피할 길이 없었다 — 치면 얹히고, 안 치면 놓쳐서 콤보가 끊긴다. 보드는
 * 그 둘 사이에 셋째 길을 낸다.
 *
 * ## 대가는 합성이다
 *
 * 회수한 물건은 사라지므로 **합성 재료로 쓸 수 없다.** 다만 현재 집중 레시피의
 * 재료까지 회수 대상으로 잡으면 RecipeFlow가 만든 기회를 보드가 바로 지우므로,
 * 호출부가 그 단어만 제외한다. 다른 레시피의 재료는 보드에 남을 수 있다.
 *
 * ## 밭에서만 뽑는다
 *
 * 지금 내려올 수 있는 단어만 적는다. 밭 밖 단어를 적으면 **영영 안 내려오는 항목**이
 * 보드 한 칸을 죽은 채 차지한다. 국면이 바뀌어 밭이 갈리면(`DayNight.ts`) 밭을
 * 벗어난 항목만 갈아끼운다 — 통째로 갈면 노리고 기다리던 것이 눈앞에서 사라진다.
 *
 * 이 클래스는 낮·밤을 모른다. 두 국면 모두 전체 단어가 열려 있고, 보드는 전달받은
 * 밭과 제외 목록만 본다. 대신 **밭을 통째로 덮지 않는다**는 바닥은 스스로 지킨다 —
 * 내려오는 것이 전부 회수 대상이면 아무것도 쌓이지 않는다.
 *
 * 브라우저도 물리도 모르는 순수 로직이라 node에서 그대로 시험한다.
 */

/**
 * 보드에 한 번에 적히는 단어 수.
 *
 * 하나만 적으면 그 단어가 안 내려오는 동안 배출구가 통째로 닫혀 있고, 규칙이 있다는
 * 것조차 잊힌다. 셋이면 초반 동시 낙하 상한과 같아 **화면에 하나쯤은 떠 있게** 된다.
 *
 * 더 늘리지 않는 것은 쉽게 버릴 수 있으면 자리 압박이 뭉그러지기 때문이다 — 이
 * 게임이 끝나는 이유는 얹을 자리가 좁아지는 것 하나인데, 배출구가 넓으면 그 시계가
 * 멈춘다.
 */
const WHITEBOARD_SIZE = 3

/**
 * 벽에 적힌 회수 목록.
 *
 * ## 난수를 따로 굴린다
 *
 * 보드는 **플레이어가 회수할 때마다** 새 단어를 뽑는다. RecipeFlow의 난수열에
 * 끼어들면 보드 한 칸 때문에 집중 레시피 순서가 밀리므로 목록 선택은 별도 난수를 쓴다.
 * 현재 GameEngine은 `0x5eed` 고정 시드를 넘기고, 화이트보드 우선 스폰 가중치 롤은
 * 별도로 WordSpawner의 판 난수를 쓴다. 자세한 관계는 `docs/RECIPE_FLOW.md`에 있다.
 */
class Whiteboard {
  private readonly rng: Rng
  private readonly size: number
  private list: string[] = []

  constructor(rng: Rng, size: number = WHITEBOARD_SIZE) {
    this.rng = rng
    this.size = Math.max(0, Math.min(Math.floor(size), WHITEBOARD_SIZE))
  }

  /** 지금 벽에 적혀 있는 단어들 */
  get words(): readonly string[] {
    return this.list
  }

  has(word: string): boolean {
    return this.list.includes(word)
  }

  /** 판을 다시 시작할 때 이전 목록을 비운다 */
  clear(): void {
    this.list = []
  }

  /** 튜토리얼처럼 목록이 정해진 경우에만 쓴다. */
  set(words: readonly string[]): void {
    this.list = [...new Set(words)].slice(0, this.size)
  }

  /**
   * 지금 밭에 맞춰 보드를 채운다. `excluded`는 현재 집중 레시피의 재료처럼 이번에
   * 회수 대상으로 잡으면 안 되는 단어다.
   *
   * **밭을 벗어나거나 제외된 항목만 갈아끼운다.** 국면이 바뀔 때마다 통째로 갈면 노리고
   * 기다리던 단어가 눈앞에서 사라지는데, 그건 플레이어가 한 계획을 규칙이 무르는
   * 것이라 가장 나쁜 종류의 변화다.
   *
   * 밭이 보드보다 좁으면 밭 크기까지만 적는다 — 보드가 밭을 통째로 덮으면 내려오는
   * 것이 전부 회수 대상이 되어 아무것도 쌓이지 않는다.
   */
  refill(pool: readonly WordEntry[], excluded: readonly string[] = []): void {
    this.refillSlots(pool, excluded)
  }

  /**
   * 이 단어를 회수했다. 그 자리를 밭의 다른 단어로 채우되 제외 단어는 넣지 않는다.
   *
   * 보드에 없는 단어면 아무 일도 없다고 알린다 — 부르는 쪽이 "회수인가 평범한
   * 드롭인가"를 이 반환값으로 가른다.
   */
  claim(word: string, pool: readonly WordEntry[], excluded: readonly string[] = []): boolean {
    const at = this.list.indexOf(word)
    if (at === -1) {
      return false
    }
    this.refillSlots(pool, excluded, at)
    return true
  }

  /** 유지되는 글자가 보드 안에서 뛰지 않도록 빈 자리만 같은 인덱스에서 채운다. */
  private refillSlots(
    pool: readonly WordEntry[],
    excluded: readonly string[],
    vacantIndex: number | null = null,
  ): void {
    const blocked = new Set(excluded)
    const available = new Set(
      pool.map((entry) => entry.word).filter((word) => !blocked.has(word)),
    )
    /* 밭 전체가 회수 대상이 되지 않도록 언제나 한 단어는 보드 밖에 남긴다. */
    const room = Math.max(Math.min(this.size, available.size - 1), 0)
    const slots: Array<string | undefined> = this.list
      .slice(0, room)
      .map((word, index) =>
        index === vacantIndex || !available.has(word) ? undefined : word,
      )
    while (slots.length < room) {
      slots.push(undefined)
    }

    const kept = new Set(slots.filter((word): word is string => word !== undefined))
    const candidates = [...available].filter((word) => !kept.has(word))
    for (let slot = 0; slot < slots.length && candidates.length > 0; slot += 1) {
      if (slots[slot] !== undefined) {
        continue
      }
      const index = this.rng.int(candidates.length)
      const chosen = candidates[index]
      const tail = candidates[candidates.length - 1]
      if (chosen === undefined || tail === undefined) {
        break
      }
      slots[slot] = chosen
      candidates[index] = tail
      candidates.pop()
    }
    this.list = slots.filter((word): word is string => word !== undefined)
  }
}

export { Whiteboard, WHITEBOARD_SIZE }
