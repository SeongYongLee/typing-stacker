import { describe, expect, it } from 'vitest'
import { MatchState } from '../src/multi/MatchState.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

/**
 * 차례와 대기.
 *
 * 받침대가 하나뿐이라 한 번에 한 사람만 떨군다 — 동시에 떨구면 누구 물건이 무엇을
 * 밀었는지 알 수 없고 쌓기가 운이 된다. 다만 앞사람의 물건이 **자리를 잡기를
 * 기다리지는 않는다**(그건 MatchEngine의 공유 쿨타임이 맡는다).
 */

function people(...ids: string[]): PlayerInfo[] {
  return ids.map((id) => ({ id, nickname: id, device: `dev-${id}` }))
}

describe('차례', () => {
  it('첫 차례는 명단의 첫 사람이다', () => {
    const state = new MatchState(people('가', '나', '다'), 3)
    expect(state.currentPlayer).toBe('가')
  })

  it('내 차례가 아니면 떨구지 못한다', () => {
    const state = new MatchState(people('가', '나'), 3)
    expect(state.canDrop('가')).toBe(true)
    expect(state.canDrop('나')).toBe(false)
  })

  it('한 바퀴를 돌아 처음으로 돌아온다', () => {
    const state = new MatchState(people('가', '나', '다'), 3)
    const seen: (string | null)[] = []
    for (let i = 0; i < 4; i += 1) {
      seen.push(state.currentPlayer)
      state.nextTurn()
    }
    expect(seen).toEqual(['가', '나', '다', '가'])
  })

  /*
   * 탈락자를 건너뛰지 않으면 죽은 사람 차례에서 판이 멈춘다.
   * 아무도 떨굴 수 없으니 시간만 흐르고 끝나지도 않는다.
   */
  it('탈락한 사람은 건너뛴다', () => {
    const state = new MatchState(people('가', '나', '다'), 1)
    state.loseLife('나')
    expect(state.currentPlayer).toBe('가')
    state.nextTurn()
    expect(state.currentPlayer).toBe('다')
  })

  it('차례인 사람이 탈락하면 다음으로 넘어간다', () => {
    const state = new MatchState(people('가', '나', '다'), 1)
    expect(state.currentPlayer).toBe('가')
    state.loseLife('가')
    state.ensureTurnAlive()
    expect(state.currentPlayer).toBe('나')
  })

  it('방장이 정한 차례를 그대로 따른다', () => {
    const state = new MatchState(people('가', '나', '다'), 3)
    state.setTurn('다')
    expect(state.currentPlayer).toBe('다')
    expect(state.canDrop('다')).toBe(true)
  })

  it('모르는 사람을 차례로 지정해도 흔들리지 않는다', () => {
    const state = new MatchState(people('가', '나'), 3)
    state.setTurn('없는사람')
    expect(state.currentPlayer).toBe('가')
  })

  it('판이 끝나면 아무의 차례도 아니다', () => {
    const state = new MatchState(people('가', '나'), 1)
    state.loseLife('나')
    expect(state.over).toBe(true)
    expect(state.currentPlayer).toBeNull()
    expect(state.canDrop('가')).toBe(false)
  })
})
