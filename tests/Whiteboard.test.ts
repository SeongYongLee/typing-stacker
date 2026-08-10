import { describe, expect, it } from 'vitest'
import { WORDS } from '../src/game/data/words.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import { Whiteboard, WHITEBOARD_SIZE } from '../src/game/systems/Whiteboard.ts'
import type { WordEntry } from '../src/game/types/game.ts'

/** 보드가 밭 안에서만 뽑는지 보려면 밭 크기를 마음대로 만들 수 있어야 한다 */
function poolOf(count: number): readonly WordEntry[] {
  return WORDS.slice(0, count)
}

describe('화이트보드 — 무엇이 적히는가', () => {
  it('빈 보드를 밭으로 채운다', () => {
    const board = new Whiteboard(createRng(1))
    board.refill(WORDS)
    expect(board.words).toHaveLength(WHITEBOARD_SIZE)
  })

  /** 밭 밖 단어를 적으면 영영 안 내려오는 항목이 보드 한 칸을 죽은 채 차지한다 */
  it('밭에 있는 단어만 적는다', () => {
    const board = new Whiteboard(createRng(2))
    const pool = poolOf(12)
    board.refill(pool)
    const allowed = new Set(pool.map((entry) => entry.word))
    for (const word of board.words) {
      expect(allowed.has(word), word).toBe(true)
    }
  })

  it('같은 단어를 두 번 적지 않는다', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const board = new Whiteboard(createRng(seed))
      board.refill(WORDS)
      expect(new Set(board.words).size, `시드 ${seed}`).toBe(board.words.length)
    }
  })

  /** 늘 같은 셋이면 두 번째 판부터 보드를 볼 이유가 없다 */
  it('시드가 다르면 적히는 것도 갈린다', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed < 30; seed += 1) {
      const board = new Whiteboard(createRng(seed))
      board.refill(WORDS)
      seen.add([...board.words].sort().join(','))
    }
    expect(seen.size).toBeGreaterThan(3)
  })

  it('같은 시드는 같은 보드를 준다', () => {
    const first = new Whiteboard(createRng(9))
    const second = new Whiteboard(createRng(9))
    first.refill(WORDS)
    second.refill(WORDS)
    expect(second.words).toEqual(first.words)
  })
})

describe('화이트보드 — 밭이 좁을 때', () => {
  /**
   * 보드가 밭을 통째로 덮으면 내려오는 것이 **전부** 회수 대상이 되어 아무것도
   * 쌓이지 않는다. 판을 끝내는 것이 자리가 좁아지는 것 하나인데 그 시계가 멈춘다.
   */
  it('밭 전체를 덮지 않는다', () => {
    for (const size of [2, 3, 4, 6]) {
      const board = new Whiteboard(createRng(5))
      const pool = poolOf(size)
      board.refill(pool)
      expect(board.words.length, `밭 ${size}종`).toBeLessThan(size)
    }
  })

  it('두 단어뿐인 밭에서는 한 칸을 넘지 않는다', () => {
    const board = new Whiteboard(createRng(3))
    board.refill(poolOf(2))
    expect(board.words.length).toBeLessThanOrEqual(1)
  })

  it('밭이 하나면 보드가 닫힌다', () => {
    const board = new Whiteboard(createRng(3))
    board.refill(poolOf(1))
    expect(board.words).toHaveLength(0)
  })

  it('전체 단어 밭은 보드를 채우기에 넉넉하다', () => {
    const board = new Whiteboard(createRng(4))
    board.refill(WORDS)
    expect(board.words).toHaveLength(WHITEBOARD_SIZE)
  })
})

describe('화이트보드 — 밭이 바뀔 때', () => {
  /**
   * 통째로 갈면 노리고 기다리던 단어가 눈앞에서 사라진다. 플레이어가 한 계획을
   * 규칙이 무르는 것이라 가장 나쁜 종류의 변화다.
   */
  it('밭 안에 남아 있는 항목은 그대로 둔다', () => {
    const board = new Whiteboard(createRng(7))
    board.refill(WORDS)
    const before = [...board.words]

    board.refill(WORDS)
    expect(board.words).toEqual(before)
  })

  it('밭을 벗어난 항목만 갈아끼운다', () => {
    const board = new Whiteboard(createRng(11))
    board.refill(WORDS)
    const before = [...board.words]

    /* 보드의 첫 항목만 살려두는 밭으로 좁힌다 */
    const kept = before[0]
    expect(kept).toBeDefined()
    const narrowed = WORDS.filter(
      (entry) => entry.word === kept || !before.includes(entry.word),
    )
    board.refill(narrowed)

    expect(board.words).toContain(kept)
    for (const gone of before.slice(1)) {
      expect(board.words, `${gone}은 밭 밖이라 남으면 안 된다`).not.toContain(gone)
    }
  })

  it('현재 집중 레시피의 단어는 기존 보드에서도 갈아낸다', () => {
    const board = new Whiteboard(createRng(12))
    board.refill(WORDS)
    const before = [...board.words]
    const focused = before[0]
    expect(focused).toBeDefined()

    board.refill(WORDS, focused === undefined ? [] : [focused])

    expect(board.words).not.toContain(focused)
    expect(board.words).toHaveLength(WHITEBOARD_SIZE)
    for (const kept of before.slice(1)) {
      expect(board.words).toContain(kept)
    }
  })
})

describe('화이트보드 — 회수', () => {
  it('회수하면 그 자리만 새 단어로 채워진다', () => {
    const board = new Whiteboard(createRng(13))
    board.refill(WORDS)
    const before = [...board.words]
    const target = before[1]
    expect(target).toBeDefined()

    expect(board.claim(target ?? '', WORDS)).toBe(true)
    expect(board.has(target ?? '')).toBe(false)
    expect(board.words).toHaveLength(WHITEBOARD_SIZE)
    expect(board.words[0]).toBe(before[0])
    expect(board.words[2]).toBe(before[2])
  })

  /** 부르는 쪽이 이 반환값으로 "회수인가 평범한 드롭인가"를 가른다 */
  it('보드에 없는 단어는 회수가 아니다', () => {
    const board = new Whiteboard(createRng(17))
    board.refill(WORDS)
    const outsider = WORDS.map((entry) => entry.word).find((word) => !board.has(word))
    expect(outsider).toBeDefined()

    const before = [...board.words]
    expect(board.claim(outsider ?? '', WORDS)).toBe(false)
    expect(board.words).toEqual(before)
  })

  it('회수를 거듭해도 보드가 마르지 않는다', () => {
    const board = new Whiteboard(createRng(19))
    board.refill(WORDS)
    for (let i = 0; i < 50; i += 1) {
      const target = board.words[0]
      expect(target, `${i}번째에 보드가 비었다`).toBeDefined()
      board.claim(target ?? '', WORDS)
    }
    expect(board.words).toHaveLength(WHITEBOARD_SIZE)
  })

  it('비운 보드는 비어 있다', () => {
    const board = new Whiteboard(createRng(23))
    board.refill(WORDS)
    board.clear()
    expect(board.words).toHaveLength(0)
    expect(board.has(WORDS[0]?.word ?? '')).toBe(false)
  })
})
