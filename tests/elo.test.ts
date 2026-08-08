import { describe, expect, it } from 'vitest'
import { rateMatch, START_RATING, type Standing } from '../src/rank/elo.ts'

/** 판수는 다들 충분히 치렀다고 두고, 등수만 견준다 */
function player(id: string, rating: number, placement: number, games = 50): Standing {
  return { id, rating, games, placement }
}

describe('여러 명이 붙은 판의 레이팅', () => {
  it('둘이면 평범한 1대1 Elo와 같다', () => {
    const deltas = rateMatch([player('a', 1000, 1), player('b', 1000, 2)])
    // 같은 레이팅끼리는 기대가 0.5씩이라 K의 절반이 오간다
    expect(deltas.get('a')).toBe(12)
    expect(deltas.get('b')).toBe(-12)
  })

  it('오른 만큼 상대가 잃는다 — 점수가 새로 생기지 않는다', () => {
    const deltas = rateMatch([player('a', 1400, 2), player('b', 900, 1)])
    expect((deltas.get('a') ?? 0) + (deltas.get('b') ?? 0)).toBe(0)
  })

  /*
   * 높은 사람은 모든 쌍에서 이길 것으로 기대된다. 그중 여럿에게 밀리면
   * 기대와의 차이가 크므로 많이 잃는다.
   */
  it('높은 사람이 먼저 죽으면 많이 잃는다', () => {
    const strongLast = rateMatch([
      player('강자', 1600, 4),
      player('a', 1000, 1),
      player('b', 1000, 2),
      player('c', 1000, 3),
    ])
    const strongFirst = rateMatch([
      player('강자', 1600, 1),
      player('a', 1000, 2),
      player('b', 1000, 3),
      player('c', 1000, 4),
    ])
    expect(strongLast.get('강자')).toBeLessThan(-15)
    // 이겨도 얻는 것은 거의 없다 — 이길 것으로 기대됐기 때문이다
    expect(strongFirst.get('강자')).toBeLessThan(4)
    expect(strongFirst.get('강자')).toBeGreaterThanOrEqual(0)
  })

  it('낮은 사람이 오래 버티면 많이 오른다', () => {
    const deltas = rateMatch([
      player('약자', 700, 1),
      player('a', 1300, 2),
      player('b', 1300, 3),
      player('c', 1300, 4),
    ])
    expect(deltas.get('약자')).toBeGreaterThan(20)
  })

  it('같은 등수끼리는 그 쌍을 비긴 것으로 친다', () => {
    const deltas = rateMatch([
      player('a', 1000, 1),
      player('b', 1000, 1),
      player('c', 1000, 3),
    ])
    expect(deltas.get('a')).toBe(deltas.get('b'))
    expect(deltas.get('c')).toBeLessThan(0)
  })

  /*
   * 사람이 정한 규칙: "4명 중 2등도 오를 수 있다."
   * 등수가 아니라 **기대와의 차이**가 기준이라 저절로 그렇게 된다 —
   * 판의 평균보다 낮은 사람이 셋 중 둘을 이겼으면 기대를 넘은 것이다.
   */
  it('판보다 낮은 사람은 2등만 해도 오른다', () => {
    const deltas = rateMatch([
      player('고수', 1500, 1),
      player('신참', 900, 2),
      player('a', 1400, 3),
      player('b', 1400, 4),
    ])
    expect(deltas.get('신참')).toBeGreaterThan(0)
  })

  it('판보다 높은 사람은 2등이면 내려간다', () => {
    const deltas = rateMatch([
      player('a', 900, 1),
      player('고수', 1500, 2),
      player('b', 900, 3),
      player('c', 900, 4),
    ])
    expect(deltas.get('고수')).toBeLessThan(0)
  })

  it('판수가 적으면 크게 움직인다 — 자기 자리를 빨리 찾아야 한다', () => {
    const rookie = rateMatch([player('a', 1000, 1, 0), player('b', 1000, 2, 0)])
    const veteran = rateMatch([player('a', 1000, 1, 100), player('b', 1000, 2, 100)])
    expect(Math.abs(rookie.get('a') ?? 0)).toBeGreaterThan(Math.abs(veteran.get('a') ?? 0))
  })

  it('혼자면 아무 일도 없다', () => {
    expect(rateMatch([player('a', START_RATING, 1)]).get('a')).toBe(0)
  })
})
