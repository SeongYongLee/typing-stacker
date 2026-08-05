/**
 * 놓친 단어는 사라지지 않고 **아레나 위에서 기다리는 물건**이 된다.
 *
 * 바로 떨어뜨리면 놓친 순간 대응할 방법이 없다. 뿌요뿌요의 예고 가비지처럼
 * 잠깐 머리 위에 떠 있게 해서, 그 사이에 단어를 맞히면 하나를 상쇄한다.
 * 그래야 "타이핑을 놓친 대가"가 생기면서도 만회할 여지가 남는다.
 *
 * 놓친 단어에 아무 대가가 없던 것이 이 게임이 쉬웠던 가장 큰 이유였다 —
 * 물건이 안 떨어지니 스택이 오히려 안전해져서, 천천히 치는 것이 유리했다.
 */

interface PendingItem {
  readonly id: number
  /** 예고 상자에 적히는 단어. 무슨 물건이 될지는 떨어질 때 결정된다 */
  readonly word: string
  /** 떨어질 아레나 x. 보이는 자리에서 그대로 내려온다 */
  readonly x: number
  /** 남은 대기 시간(초) */
  remaining: number
  /** 대기 시간을 얼마나 썼는지 (0~1). 게이지가 이 값을 그린다 */
  readonly total: number
}

class PendingQueue {
  private list: PendingItem[] = []
  private nextId = 1

  get items(): readonly PendingItem[] {
    return this.list
  }

  get size(): number {
    return this.list.length
  }

  add(word: string, x: number, delay: number): void {
    this.list.push({ id: this.nextId++, word, x, remaining: delay, total: delay })
  }

  /** 시간이 다 된 것들을 큐에서 빼서 돌려준다 — 호출부가 그것들을 실제로 떨군다 */
  update(dt: number): readonly PendingItem[] {
    for (const item of this.list) {
      item.remaining -= dt
    }
    const due = this.list.filter((item) => item.remaining <= 0)
    if (due.length > 0) {
      this.list = this.list.filter((item) => item.remaining > 0)
    }
    return due
  }

  /**
   * 하나를 상쇄한다. **가장 임박한 것**을 지운다 —
   * 곧 떨어질 것을 막는 것이 플레이어에게 가장 이득이고, 눈에도 그렇게 보인다.
   */
  cancelOne(): PendingItem | null {
    if (this.list.length === 0) {
      return null
    }
    let target = 0
    for (let i = 1; i < this.list.length; i += 1) {
      if (this.list[i]!.remaining < this.list[target]!.remaining) {
        target = i
      }
    }
    const [canceled] = this.list.splice(target, 1)
    return canceled ?? null
  }

  reset(): void {
    this.list = []
  }
}

export { PendingQueue }
export type { PendingItem }
