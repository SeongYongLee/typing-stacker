import { describe, expect, it } from 'vitest'
import { CompetitionState } from '../src/competition/CompetitionState.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

function players(count: number): PlayerInfo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    nickname: `사람${index}`,
    device: `d${index}`,
    icon: '',
  }))
}

describe('CompetitionState', () => {
  it('마지막 한 명이 남을 때까지 끝나지 않는다', () => {
    const state = new CompetitionState(players(3), 3)
    state.eliminate('p0')
    expect(state.over).toBe(false)
    state.eliminate('p1')
    expect(state.over).toBe(true)
    expect(state.winner).toBe('p2')
  })

  it('단어 놓침과 물건 이탈은 같은 하트에서 차감할 수 있다', () => {
    const state = new CompetitionState(players(2), 3)
    expect(state.loseLife('p0')).toBe(true)
    expect(state.loseLife('p0')).toBe(true)
    expect(state.livesOf('p0')).toBe(1)
    state.loseLife('p0')
    expect(state.winner).toBe('p1')
  })

  it('같은 판정에서 모두 탈락하면 승자가 없다', () => {
    const state = new CompetitionState(players(2), 1)
    state.loseLife('p0')
    state.loseLife('p1')
    expect(state.over).toBe(true)
    expect(state.winner).toBeNull()
  })

  it('방장이 보낸 하트 스냅샷을 그대로 적용한다', () => {
    const state = new CompetitionState(players(3), 3)
    state.applyLives([['p0', 1], ['p1', 0], ['unknown', 0]])
    expect(state.livesOf('p0')).toBe(1)
    expect(state.livesOf('p1')).toBe(0)
    expect(state.livesOf('p2')).toBe(3)
  })
})
