import { describe, expect, it } from 'vitest'
import { starterOf } from '../src/multi/MatchEngine.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

function players(...ids: string[]): PlayerInfo[] {
  return ids.map((id) => ({ id, nickname: id, device: `dev-${id}`, icon: '' }))
}

describe('대전 시작 차례', () => {
  it('같은 seed와 명단이면 같은 사람부터 시작한다', () => {
    const roster = players('a', 'b', 'c', 'd')
    expect(starterOf(12345, roster)).toBe(starterOf(12345, roster))
  })

  it('seed가 바뀌면 첫 차례가 한 사람에게 고정되지 않는다', () => {
    const roster = players('a', 'b', 'c')
    const seen = new Set<string | null>()
    for (let seed = 1; seed <= 64; seed += 1) {
      seen.add(starterOf(seed, roster))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('빈 명단이면 시작 차례가 없다', () => {
    expect(starterOf(1, [])).toBeNull()
  })
})
