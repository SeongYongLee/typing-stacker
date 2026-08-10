/**
 * 도감 — 지금까지 만난 히든 물건.
 *
 * 히든은 재료를 붙여 합성할 때 만난다. 어느 조합으로 얻었든 도감에는 같이 쌓인다 —
 * 플레이어에게 중요한 것은 "봤는가"이지 어떤 레시피에서 봤는가가 아니다.
 *
 * 판이 끝나도 남아야 하므로 바깥에서 저장한다. 이 클래스는 저장 방법을 모른다.
 * `add`가 **처음 보는 것일 때만** true를 돌려주므로, 호출부는 그때만 저장하면 된다.
 */
class Collection {
  private readonly known: Set<string>
  /** 이번 판에 처음 만난 것들. 결과 화면이 "새로 채운 칸"을 보여주는 데 쓴다 */
  private readonly fresh = new Set<string>()
  /**
   * 배열로 펼친 결과를 들고 있는다. 이 값은 매 프레임 스냅샷에 실려 나가는데,
   * 그때마다 Set을 복사하면 초당 120개의 배열이 쓰레기로 쌓인다 — 바뀔 때만 다시 만든다.
   */
  private knownList: readonly string[] = []
  private freshList: readonly string[] = []

  constructor(known: Iterable<string> = []) {
    this.known = new Set(known)
    this.knownList = [...this.known]
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
    this.knownList = [...this.known]
    this.freshList = [...this.fresh]
    return true
  }

  get ids(): readonly string[] {
    return this.knownList
  }

  get freshIds(): readonly string[] {
    return this.freshList
  }

  /** 판을 새로 시작할 때. 모아둔 것은 남기고 "이번 판에 새로 만난 것"만 비운다 */
  startRun(): void {
    this.fresh.clear()
    this.freshList = []
  }
}

export { Collection }
