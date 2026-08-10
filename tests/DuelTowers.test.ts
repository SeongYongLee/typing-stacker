import { describe, expect, it } from 'vitest'
import type { PlayerInfo } from '../src/multi/protocol.ts'
import { DUEL_VISIBLE_TOWERS, visibleDuelTowerIds } from '../src/multi/duelTowers.ts'

function players(count: number): readonly PlayerInfo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    nickname: `P${index + 1}`,
    icon: '',
    device: `d${index + 1}`,
  }))
}

describe('visibleDuelTowerIds', () => {
  it('4명 이하면 모든 타워를 보여준다', () => {
    const roster = players(4)

    expect(visibleDuelTowerIds({
      players: roster,
      selfId: 'p2',
      alive: new Set(roster.map((player) => player.id)),
      seed: 1,
    })).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('5명 이상이면 내 타워를 포함해 최대 4개만 보여준다', () => {
    const roster = players(6)
    const visible = visibleDuelTowerIds({
      players: roster,
      selfId: 'p3',
      alive: new Set(roster.map((player) => player.id)),
      seed: 7,
    })

    expect(visible).toHaveLength(DUEL_VISIBLE_TOWERS)
    expect(visible).toContain('p3')
  })

  it('같은 시드는 같은 무작위 타워 목록을 고른다', () => {
    const roster = players(8)
    const alive = new Set(roster.map((player) => player.id))

    expect(visibleDuelTowerIds({ players: roster, selfId: 'p1', alive, seed: 42 }))
      .toEqual(visibleDuelTowerIds({ players: roster, selfId: 'p1', alive, seed: 42 }))
  })

  it('마지막 생존 타워는 계속 보여준다', () => {
    const roster = players(8)
    const visible = visibleDuelTowerIds({
      players: roster,
      selfId: 'p1',
      alive: new Set(['p8']),
      seed: 3,
    })

    expect(visible).toContain('p1')
    expect(visible).toContain('p8')
    expect(visible).toHaveLength(DUEL_VISIBLE_TOWERS)
  })
})
