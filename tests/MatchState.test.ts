import { describe, expect, it } from 'vitest'
import { MatchState } from '../src/multi/MatchState.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

function players(...ids: string[]): PlayerInfo[] {
  return ids.map((id) => ({ id, nickname: id, device: `dev-${id}`, icon: '' }))
}

describe('MatchState — 2명', () => {
  it('차례인 사람만 떨굴 수 있다 — 받침대가 하나이기 때문이다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.currentPlayer).toBe('a')
    expect(match.canDrop('a')).toBe(true)
    expect(match.canDrop('b')).toBe(false)
    expect(match.livesOf('a')).toBe(3)
    expect(match.over).toBe(false)
  })

  it('방에 없는 사람은 떨굴 수 없다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    expect(match.canDrop('침입자')).toBe(false)
  })

  it('방장이 정한 사람부터 시작할 수 있다', () => {
    const match = new MatchState(players('a', 'b', 'c'), 3, 'c')
    expect(match.currentPlayer).toBe('c')
    expect(match.canDrop('c')).toBe(true)
    match.nextTurn()
    expect(match.currentPlayer).toBe('a')
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

  it('하트가 남아 있어도 별도 승리 조건으로 끝낼 수 있다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.finishWithWinner('b')

    expect(match.over).toBe(true)
    expect(match.winner).toBe('b')
    expect(match.livesOf('a')).toBe(3)
    expect(match.livesOf('b')).toBe(3)
    expect(match.standings()).toEqual([
      { id: 'a', placement: 2 },
      { id: 'b', placement: 1 },
    ])
  })
})

describe('MatchState.loseLife — 반 칸씩도 깎인다', () => {
  it('노림에 밟히면 반 칸 깎인다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('a', 0.5)
    expect(match.livesOf('a')).toBe(2.5)
  })

  it('기본은 한 칸이다 — 물건이 받침대를 벗어났을 때', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('a')
    expect(match.livesOf('a')).toBe(2)
  })

  /*
   * 반 칸씩 깎이는 길이 생겼으므로 0 아래로 내려갈 수 있다.
   * 음수가 되면 "살아 있는가"를 세는 곳이 전부 흔들린다.
   */
  it('0 아래로는 내려가지 않는다', () => {
    const match = new MatchState(players('a', 'b'), 1)
    match.loseLife('a', 0.5)
    match.loseLife('a', 0.5)
    match.loseLife('a', 0.5)
    expect(match.livesOf('a')).toBe(0)
  })

  it('이미 탈락한 사람은 더 깎이지 않는다', () => {
    const match = new MatchState(players('a', 'b'), 1)
    match.loseLife('a')
    match.loseLife('a', 0.5)
    expect(match.livesOf('a')).toBe(0)
  })

  it('모르는 사람이나 0 이하 값은 무시한다', () => {
    const match = new MatchState(players('a', 'b'), 3)
    match.loseLife('침입자', 0.5)
    match.loseLife('a', 0)
    match.loseLife('a', -1)
    expect(match.livesOf('a')).toBe(3)
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
    other.loseLife('a', 0.5)
    // 3 -> 2 -> 1 -> 0.5. 반 칸이 남았으면 아직 살아 있다
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
    match.loseLife('b', 0.5)
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

describe('차례 순환과 권위 지정', () => {
  it('한 바퀴를 돌아 처음으로 돌아온다', () => {
    const state = new MatchState(players('가', '나', '다'), 3)
    const seen: (string | null)[] = []
    for (let i = 0; i < 4; i += 1) {
      seen.push(state.currentPlayer)
      state.nextTurn()
    }
    expect(seen).toEqual(['가', '나', '다', '가'])
  })

  it('탈락한 사람은 건너뛴다', () => {
    const state = new MatchState(players('가', '나', '다'), 1)
    state.loseLife('나')
    expect(state.currentPlayer).toBe('가')
    state.nextTurn()
    expect(state.currentPlayer).toBe('다')
  })

  it('차례인 사람이 탈락하면 다음으로 넘어간다', () => {
    const state = new MatchState(players('가', '나', '다'), 1)
    expect(state.currentPlayer).toBe('가')
    state.loseLife('가')
    state.ensureTurnAlive()
    expect(state.currentPlayer).toBe('나')
  })

  it('방장이 정한 차례를 그대로 따른다', () => {
    const state = new MatchState(players('가', '나', '다'), 3)
    state.setTurn('다')
    expect(state.currentPlayer).toBe('다')
    expect(state.canDrop('다')).toBe(true)
  })

  it('모르는 사람을 차례로 지정해도 흔들리지 않는다', () => {
    const state = new MatchState(players('가', '나'), 3)
    state.setTurn('없는사람')
    expect(state.currentPlayer).toBe('가')
  })
})

function kill(match: MatchState, id: string, lives = 3): void {
  match.startDeathBatch()
  for (let i = 0; i < lives; i += 1) {
    match.loseLife(id)
  }
}

describe('등수', () => {
  it('아무도 죽지 않았으면 모두 공동 1등이다', () => {
    const match = new MatchState(players('가', '나', '다'), 3)
    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 1 },
      { id: '다', placement: 1 },
    ])
  })

  it('늦게 죽은 사람이 더 높은 등수다', () => {
    const match = new MatchState(players('가', '나', '다'), 3)
    kill(match, '다')
    kill(match, '나')
    // 가는 살아 있으니 1등, 나는 나중에 죽어 2등, 다가 3등
    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 2 },
      { id: '다', placement: 3 },
    ])
  })

  /*
   * 한 번의 붕괴로 두 사람의 물건이 함께 벗어날 수 있다. 그때 억지로 순서를 매기면
   * 물리 계산 순서가 등수를 정하게 된다 — 같은 회차에 죽었으면 공동 등수다.
   */
  it('같은 판정에서 함께 죽으면 공동 등수다', () => {
    const match = new MatchState(players('가', '나', '다', '라'), 1)
    // 라가 먼저 죽고, 그 뒤 나와 다가 같은 붕괴로 함께 죽는다
    kill(match, '라', 1)
    match.startDeathBatch()
    match.loseLife('나')
    match.loseLife('다')

    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 2 },
      { id: '다', placement: 2 },
      // 공동 2등이 둘이므로 다음은 4등이다
      { id: '라', placement: 4 },
    ])
  })

  it('모두가 한 번에 죽으면 전부 공동 1등이다 — 무승부다', () => {
    const match = new MatchState(players('가', '나'), 1)
    match.startDeathBatch()
    match.loseLife('가')
    match.loseLife('나')
    expect(match.over).toBe(true)
    expect(match.winner).toBeNull()
    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 1 },
    ])
  })

  /*
   * 참가자 쪽은 방장이 보낸 값으로만 죽는다(setLives). 거기서 기록하지 않으면
   * 등수가 방장에게만 남아 결과 화면이 사람마다 달라진다.
   */
  it('방장이 보낸 값으로 죽어도 등수에 남는다', () => {
    const match = new MatchState(players('가', '나', '다'), 3)
    match.startDeathBatch()
    match.setLives('다', 0)
    match.startDeathBatch()
    match.setLives('나', 0)

    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 2 },
      { id: '다', placement: 3 },
    ])
  })

  it('노림 한 방으로 죽어도 등수가 남는다', () => {
    const match = new MatchState(players('가', '나'), 3)
    match.startDeathBatch()
    for (let i = 0; i < 6; i += 1) {
      match.loseLife('나', 0.5)
    }
    expect(match.livesOf('나')).toBe(0)
    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 2 },
    ])
  })

  it('등수는 인원 수만큼 나온다 — 빠지는 사람이 없다', () => {
    const match = new MatchState(players('가', '나', '다', '라', '마'), 1)
    kill(match, '마', 1)
    kill(match, '라', 1)
    kill(match, '다', 1)
    kill(match, '나', 1)
    const rows = match.standings()
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.id)).toEqual(['가', '나', '다', '라', '마'])
    expect(rows.map((row) => row.placement)).toEqual([1, 2, 3, 4, 5])
  })
})
