import { describe, expect, it } from 'vitest'
import { MatchState } from '../src/multi/MatchState.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

function players(...ids: string[]): PlayerInfo[] {
  return ids.map((id) => ({ id, nickname: id }))
}

describe('MatchState — 2명', () => {
  it('첫 턴은 배열 순서의 첫 사람이다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.currentPlayer).toBe('a')
    expect(match.livesOf('a')).toBe(3)
    expect(match.livesOf('b')).toBe(3)
    expect(match.over).toBe(false)
  })

  it('턴은 번갈아 돌아간다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.nextTurn()
    expect(match.currentPlayer).toBe('b')
    match.nextTurn()
    expect(match.currentPlayer).toBe('a')
  })

  it('자기 턴이 아니면 떨굴 수 없다 — 상대가 보낸 drop을 막는 문', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.canDrop('a')).toBe(true)
    expect(match.canDrop('b')).toBe(false)
    match.nextTurn()
    expect(match.canDrop('a')).toBe(false)
    expect(match.canDrop('b')).toBe(true)
  })

  it('방에 없는 사람은 떨굴 수 없다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.canDrop('침입자')).toBe(false)
  })

  it('하트는 물건 주인이 잃는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    // a의 턴이지만 밀려 떨어진 물건이 b의 것이면 b가 잃는다
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
    expect(match.currentPlayer).toBeNull()
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

describe('MatchState — N명 (2명은 특수 케이스가 아니다)', () => {
  it('네 명이면 순서대로 돌고 한 바퀴 뒤 처음으로 온다', () => {
    const match = new MatchState(players('a', 'b', 'c', 'd'), 3)
    const seen: (string | null)[] = [match.currentPlayer]
    for (let i = 0; i < 4; i += 1) {
      match.nextTurn()
      seen.push(match.currentPlayer)
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'a'])
  })

  it('탈락자는 턴 순환에서 건너뛴다', () => {
    const match = new MatchState(players('a', 'b', 'c'), 1)
    match.loseLife('b')
    expect(match.isAlive('b')).toBe(false)

    expect(match.currentPlayer).toBe('a')
    match.nextTurn()
    expect(match.currentPlayer).toBe('c')
    match.nextTurn()
    expect(match.currentPlayer).toBe('a')
  })

  it('턴 주인이 자기 물건 때문에 탈락하면 턴이 옮겨진다', () => {
    const match = new MatchState(players('a', 'b', 'c'), 1)
    expect(match.currentPlayer).toBe('a')
    match.loseLife('a')
    match.ensureTurnAlive()
    expect(match.currentPlayer).toBe('b')
  })

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
})

describe('MatchState.snapshot', () => {
  it('화면이 필요한 값을 한 번에 담는다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('b')
    const snapshot = match.snapshot()
    expect(snapshot.current).toBe('a')
    expect(snapshot.lives).toEqual([
      ['a', 3],
      ['b', 2],
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
