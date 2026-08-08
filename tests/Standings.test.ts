import { describe, expect, it } from 'vitest'
import { MatchState } from '../src/multi/MatchState.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

/**
 * 등수.
 *
 * 우승자만 알면 2등과 꼴찌를 구분할 수 없다. 결과 화면이 순위를 보여줘야 하고,
 * 서버의 레이팅도 등수 없이는 계산되지 않는다 — 여덟이 붙는 판에서 "이겼다/졌다"
 * 둘로는 아무것도 못 매긴다.
 */

function people(...ids: string[]): PlayerInfo[] {
  return ids.map((id) => ({ id, nickname: id, device: `dev-${id}` }))
}

function kill(match: MatchState, id: string, lives = 3): void {
  match.startDeathBatch()
  for (let i = 0; i < lives; i += 1) {
    match.loseLife(id)
  }
}

describe('등수', () => {
  it('아무도 죽지 않았으면 모두 공동 1등이다', () => {
    const match = new MatchState(people('가', '나', '다'), 3)
    expect(match.standings()).toEqual([
      { id: '가', placement: 1 },
      { id: '나', placement: 1 },
      { id: '다', placement: 1 },
    ])
  })

  it('늦게 죽은 사람이 더 높은 등수다', () => {
    const match = new MatchState(people('가', '나', '다'), 3)
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
    const match = new MatchState(people('가', '나', '다', '라'), 1)
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
    const match = new MatchState(people('가', '나'), 1)
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
    const match = new MatchState(people('가', '나', '다'), 3)
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
    const match = new MatchState(people('가', '나'), 3)
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
    const match = new MatchState(people('가', '나', '다', '라', '마'), 1)
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
