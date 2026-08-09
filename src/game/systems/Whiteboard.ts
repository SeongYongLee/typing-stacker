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
 * 회수한 물건은 사라지므로 **합성 재료로 쓸 수 없다.** 보드에 재료가 적히는 순간
 * "치면 손해"가 되고, 그때 플레이어는 고르게 된다 — 짝을 기다려 쌓을 것인가,
 * 자리를 비우고 목숨을 아낄 것인가. 그 갈등이 이 규칙의 값어치다. 그래서 보드에서
 * 재료를 빼지 않는다.
 *
 * ## 밭에서만 뽑는다
 *
 * 지금 내려올 수 있는 단어만 적는다. 밭 밖 단어를 적으면 **영영 안 내려오는 항목**이
 * 보드 한 칸을 죽은 채 차지한다. 국면이 바뀌어 밭이 갈리면(`DayNight.ts`) 밭을
 * 벗어난 항목만 갈아끼운다 — 통째로 갈면 노리고 기다리던 것이 눈앞에서 사라진다.
 *
 * ## 첫 밤에는 열지 않는다 — 다만 그것을 정하는 것은 부르는 쪽이다
 *
 * 첫 밤은 **합성을 배우는 구간**인데 회수는 "쌓지 않고 버린다"라 정반대의 규칙이다.
 * 배우는 구간에 반대되는 것을 함께 내면 둘 다 안 배운다. 그래서 엔진이 첫 밤에는
 * `clear()`로 보드를 닫는다.
 *
 * 이 클래스가 스스로 국면을 보지는 않는다 — 국면은 시간이 정하는 것이고(`DayNight.ts`)
 * 여기가 그것까지 알면 밭 하나를 받아 답하는 순수 로직이 아니게 된다. 대신 **밭을
 * 통째로 덮지 않는다**는 바닥만 스스로 지킨다. 그건 국면과 무관하게 언제나 참이어야
 * 하는 것이라서다 — 내려오는 것이 전부 회수 대상이면 아무것도 쌓이지 않는다.
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
 * 판의 난수를 쓰지 않는다. 보드는 **플레이어가 회수할 때마다** 새 단어를 뽑는데,
 * 판의 난수열에 끼어들면 그 뒤의 단어 순서와 히든 결과가 통째로 밀린다. 그러면
 * **화이트보드를 켠 판과 끈 판을 같은 시드로 비교할 수 없다** — 밸런스를 잴 때
 * 필요한 것이 정확히 그 비교다. `TrailField`가 자기 난수를 굴리는 것과 같은 이유고,
 * 저쪽은 연출이라 그랬지만 이쪽은 **잴 수 있어야 해서** 그렇다.
 *
 * 시드는 판 시드에서 파생해 넘긴다. 같은 시드에 같은 플레이면 같은 보드가 나온다.
 */
class Whiteboard {
  private readonly rng: Rng
  private readonly size: number
  private list: string[] = []

  constructor(rng: Rng, size: number = WHITEBOARD_SIZE) {
    this.rng = rng
    this.size = size
  }

  /** 지금 벽에 적혀 있는 단어들 */
  get words(): readonly string[] {
    return this.list
  }

  has(word: string): boolean {
    return this.list.includes(word)
  }

  /** 보드를 비운다. 첫 밤처럼 보드를 열지 않는 구간에서 쓴다 */
  clear(): void {
    this.list = []
  }

  /**
   * 지금 밭에 맞춰 보드를 채운다.
   *
   * **밭을 벗어난 항목만 갈아끼운다.** 국면이 바뀔 때마다 통째로 갈면 노리고
   * 기다리던 단어가 눈앞에서 사라지는데, 그건 플레이어가 한 계획을 규칙이 무르는
   * 것이라 가장 나쁜 종류의 변화다.
   *
   * 밭이 보드보다 좁으면 밭 크기까지만 적는다 — 보드가 밭을 통째로 덮으면 내려오는
   * 것이 전부 회수 대상이 되어 아무것도 쌓이지 않는다.
   */
  refill(pool: readonly WordEntry[]): void {
    const available = new Set(pool.map((entry) => entry.word))
    this.list = this.list.filter((word) => available.has(word))

    /*
     * 밭이 보드보다 좁으면 그만큼만. `- 1`은 밭 전체를 덮지 않기 위한 것인데,
     * 밭이 하나뿐이면 0이 되어 보드가 닫힌다 — 그 구간에는 배출구가 없는 것이 맞다.
     */
    const room = Math.min(this.size, pool.length - 1)
    if (this.list.length >= room) {
      this.list = this.list.slice(0, Math.max(room, 0))
      return
    }

    const candidates = [...available].filter((word) => !this.has(word))
    while (this.list.length < room && candidates.length > 0) {
      const index = this.rng.int(candidates.length)
      const chosen = candidates[index]
      const tail = candidates[candidates.length - 1]
      if (chosen === undefined || tail === undefined) {
        break
      }
      this.list.push(chosen)
      candidates[index] = tail
      candidates.pop()
    }
  }

  /**
   * 이 단어를 회수했다. 그 자리를 밭의 다른 단어로 채운다.
   *
   * 보드에 없는 단어면 아무 일도 없다고 알린다 — 부르는 쪽이 "회수인가 평범한
   * 드롭인가"를 이 반환값으로 가른다.
   */
  claim(word: string, pool: readonly WordEntry[]): boolean {
    const at = this.list.indexOf(word)
    if (at === -1) {
      return false
    }
    this.list.splice(at, 1)
    this.refill(pool)
    return true
  }
}

export { Whiteboard, WHITEBOARD_SIZE }
