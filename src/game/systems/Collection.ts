/**
 * 도감 — 지금까지 만난 히든 물건.
 *
 * 히든을 얻는 길은 둘이다. 하나는 단어를 맞췄을 때 낮은 확률로 나오는 것이고,
 * 다른 하나는 재료를 붙여 합성하는 것이다. 어느 쪽으로 얻었든 도감에는 같이 쌓인다 —
 * 플레이어에게 중요한 것은 "봤는가"이지 어떻게 봤는가가 아니다.
 *
 * 판이 끝나도 남아야 하므로 바깥에서 저장한다. 이 클래스는 저장 방법을 모른다.
 * `add`가 **처음 보는 것일 때만** true를 돌려주므로, 호출부는 그때만 저장하면 된다.
 */
class Collection {
  private readonly known: Set<string>
  /** 이번 판에 처음 만난 것들. 결과 화면이 "새로 채운 칸"을 보여주는 데 쓴다 */
  private readonly fresh = new Set<string>()

  constructor(known: Iterable<string> = []) {
    this.known = new Set(known)
  }

  has(id: string): boolean {
    return this.known.has(id)
  }

  /** 처음 보는 것이면 true. 이미 있던 것이면 false */
  add(id: string): boolean {
    if (this.known.has(id)) {
      return false
    }
    this.known.add(id)
    this.fresh.add(id)
    return true
  }

  get ids(): readonly string[] {
    return [...this.known]
  }

  get freshIds(): readonly string[] {
    return [...this.fresh]
  }

  /** 판을 새로 시작할 때. 모아둔 것은 남기고 "이번 판에 새로 만난 것"만 비운다 */
  startRun(): void {
    this.fresh.clear()
  }
}

export { Collection }
