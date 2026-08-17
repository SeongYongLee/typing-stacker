import { describe, expect, it } from 'vitest'
import { DuelRace } from '../src/multi/DuelRace.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

const PLAYERS: readonly PlayerInfo[] = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  nickname: id,
  icon: '',
  device: id,
}))

describe('DuelRace', () => {
  it('탈락 순위를 뒤에서 채운다', () => {
    const race = new DuelRace(PLAYERS)

    expect(race.eliminate(['d'])).toEqual([{ id: 'd', placement: 4, outcome: 'out' }])
    expect(race.activeCount).toBe(3)
    expect(race.winner()).toBeNull()
  })

  it('같은 판정에서 탈락하면 공동 순위다', () => {
    const race = new DuelRace(PLAYERS)

    expect(race.eliminate(['a', 'c'])).toEqual([
      { id: 'a', placement: 3, outcome: 'out' },
      { id: 'c', placement: 3, outcome: 'out' },
    ])
  })

  it('한 명만 남으면 마지막 생존자를 1위로 확정한다', () => {
    const race = new DuelRace(PLAYERS)
    race.eliminate(['d'])
    race.eliminate(['c'])
    race.eliminate(['b'])

    expect(race.settleLast()).toEqual({ id: 'a', placement: 1, outcome: 'survived' })
    expect(race.activeCount).toBe(0)
    expect(race.results.map(({ id, placement }) => [id, placement])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ])
  })

  it('모두 동시에 탈락해 공동 1위면 승자를 만들지 않는다', () => {
    const race = new DuelRace(PLAYERS.slice(0, 2))
    race.eliminate(['a', 'b'])

    expect(race.winner()).toBeNull()
  })
})
