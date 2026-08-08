import { describe, expect, it } from 'vitest'
import { MatchState } from '../src/multi/MatchState.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

function players(...ids: string[]): PlayerInfo[] {
  return ids.map((id) => ({ id, nickname: id, device: `dev-${id}` }))
}

describe('MatchState — 2명', () => {
  it('둘 다 처음부터 떨굴 수 있다 — 차례를 기다리지 않는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.canDrop('a')).toBe(true)
    expect(match.canDrop('b')).toBe(true)
    expect(match.livesOf('a')).toBe(3)
    expect(match.over).toBe(false)
  })

  it('방에 없는 사람은 떨굴 수 없다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.canDrop('침입자')).toBe(false)
  })

  it('하트는 물건 주인이 잃는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    // 누가 밀어냈든 떨어진 물건이 b의 것이면 b가 잃는다
    match.loseLife('b')
    expect(match.livesOf('a')).toBe(3)
    expect(match.livesOf('b')).toBe(2)
  })

  it('하트를 다 잃으면 상대가 승자다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('b')
    match.loseLife('b')
    expect(match.over).toBe(false)
    match.loseLife('b')
    expect(match.over).toBe(true)
    expect(match.winner).toBe('a')
  })

  it('하트는 0 아래로 내려가지 않는다', () => {
    const match = new MatchState(players('a', 'b'), 1)
    match.loseLife('b')
    match.loseLife('b')
    match.loseLife('b')
    expect(match.livesOf('b')).toBe(0)
  })

  it('한 번의 붕괴로 둘 다 탈락하면 무승부다', () => {
    const match = new MatchState(players('a', 'b'), 1)
    match.loseLife('a')
    match.loseLife('b')
    expect(match.over).toBe(true)
    expect(match.winner).toBeNull()
  })

  it('판이 끝나면 아무도 떨굴 수 없다', () => {
    const match = new MatchState(players('a', 'b'), 1)
    match.loseLife('b')
    expect(match.canDrop('a')).toBe(false)
  })
})

describe('MatchState.heal — 방해가 먹히면 되찾는다', () => {
  it('반 칸씩 되찾는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('a')
    expect(match.livesOf('a')).toBe(2)
    match.heal('a', 0.5)
    expect(match.livesOf('a')).toBe(2.5)
  })

  it('처음 하트보다 많아지지 않는다 — 무한히 버티면 판이 끝나지 않는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.heal('a', 0.5)
    match.heal('a', 0.5)
    expect(match.livesOf('a')).toBe(3)
  })

  it('탈락한 사람은 되살아나지 않는다 — 승패가 뒤집히면 안 된다', () => {
    const match = new MatchState(players('a', 'b'), 1)
    match.loseLife('b')
    expect(match.over).toBe(true)
    match.heal('b', 0.5)
    expect(match.livesOf('b')).toBe(0)
    expect(match.winner).toBe('a')
  })

  it('모르는 사람이나 0 이하 값은 무시한다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('a')
    match.heal('침입자', 0.5)
    match.heal('a', 0)
    match.heal('a', -1)
    expect(match.livesOf('a')).toBe(2)
  })

  it('반 칸이 남아 있으면 아직 살아 있다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('a')
    match.loseLife('a')
    match.loseLife('a')
    expect(match.isAlive('a')).toBe(false)

    const other = new MatchState(players('a', 'b'), 3)
    other.loseLife('a')
    other.loseLife('a')
    other.heal('a', 0.5)
    other.loseLife('a')
    // 1 -> 0.5 로 남는다. 한 번 더 맞아야 끝난다
    expect(other.livesOf('a')).toBe(0.5)
    expect(other.isAlive('a')).toBe(true)
  })
})

describe('MatchState — N명 (2명은 특수 케이스가 아니다)', () => {
  it('마지막 한 명이 남으면 그 사람이 승자다', () => {
    const match = new MatchState(players('a', 'b', 'c'), 1)
    match.loseLife('a')
    match.loseLife('c')
    expect(match.over).toBe(true)
    expect(match.winner).toBe('b')
  })

  it('생존자가 둘 이상이면 끝나지 않는다', () => {
    const match = new MatchState(players('a', 'b', 'c'), 1)
    match.loseLife('a')
    expect(match.over).toBe(false)
    expect(match.aliveCount).toBe(2)
  })

  it('탈락한 사람은 떨굴 수 없다', () => {
    const match = new MatchState(players('a', 'b', 'c'), 1)
    match.loseLife('b')
    expect(match.canDrop('b')).toBe(false)
    expect(match.canDrop('a')).toBe(true)
  })
})

describe('MatchState.snapshot', () => {
  it('화면이 필요한 값을 한 번에 담는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('b')
    match.heal('b', 0.5)
    const snapshot = match.snapshot()
    expect(snapshot.lives).toEqual([
      ['a', 3],
      ['b', 2.5],
    ])
    expect(snapshot.over).toBe(false)
    expect(snapshot.winner).toBeNull()
  })
})

describe('MatchState 방어', () => {
  it('플레이어가 없으면 만들 수 없다', () => {
    expect(() => new MatchState([], 3)).toThrow()
  })

  it('혼자면 시작부터 끝난 상태다', () => {
    const match = new MatchState(players('a'), 3)
    expect(match.over).toBe(true)
    expect(match.winner).toBe('a')
  })
})
