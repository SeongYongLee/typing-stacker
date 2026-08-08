import { describe, expect, it } from 'vitest'
import { chaseOf, crownOf, rankOf } from '../src/rank/chase.ts'
import type { RunRecord } from '../src/rank/client.ts'

function record(name: string, score: number): RunRecord {
  return { id: name, name, score, stackCount: 0, maxHeight: 0, maxCombo: 0, kpm: 0 }
}

/** 실제 서버가 주는 모양 — 상위 일곱 개, 꼴찌가 몇백 점이다 */
const TOP = [
  record('a', 2153),
  record('b', 1759),
  record('c', 1455),
  record('d', 1234),
  record('e', 940),
  record('f', 784),
  record('g', 567),
]
const BEST = record('me', 1500)

describe('무엇을 쫓는가', () => {
  /*
   * 이것이 이 규칙의 존재 이유다. 상위 목록은 일곱 개뿐이라 대부분의 판은
   * 그 아래에서 시작하고 끝난다 — 등수만 쓰면 그동안 보여줄 것이 없다.
   */
  it('순위권 아래에서는 내 최고를 쫓는다', () => {
    expect(chaseOf(300, BEST, TOP)).toEqual({ label: '내 최고 점수', gap: 1200 })
  })

  it('순위권에 들어서면 바로 위 등수로 갈아탄다', () => {
    // 600점은 꼴찌(567)를 넘었으니 7위이고, 그 위는 6위(784)다
    expect(chaseOf(600, BEST, TOP)).toEqual({ label: '6위', gap: 184 })
  })

  it('올라갈수록 쫓는 등수가 따라 올라간다', () => {
    expect(chaseOf(1000, BEST, TOP)?.label).toBe('4위')
    expect(chaseOf(1300, BEST, TOP)?.label).toBe('3위')
    expect(chaseOf(1800, BEST, TOP)?.label).toBe('1위')
  })


  /*
   * 같은 점수인 기록은 목표로 내걸지 않는다. "0점 남았다"는 목표가 아니라
   * 이미 도착한 자리라, 아직 남은 것을 가리켜야 쫓을 것이 된다.
   */
  it('동점인 기록은 건너뛰고 그다음을 가리킨다', () => {
    expect(chaseOf(784, BEST, TOP)).toEqual({ label: '5위', gap: 156 })
  })

  it('맨 위에 닿으면 쫓을 것이 없다', () => {
    expect(chaseOf(2153, BEST, TOP)).toBeNull()
    expect(crownOf(2153, BEST, TOP)).toBe('1위')
  })

  it('내 최고를 넘었지만 순위권에는 못 미치면 신기록이다', () => {
    // 목록이 비어 있으면 견줄 남이 없다 — 남는 것은 제 기록뿐이다
    expect(chaseOf(1600, BEST, [])).toBeNull()
    expect(crownOf(1600, BEST, [])).toBe('신기록')
  })

  it('아직 아무 기록도 없고 순위권 아래면 자리를 비운다', () => {
    expect(chaseOf(100, null, TOP)).toBeNull()
    expect(crownOf(100, null, TOP)).toBeNull()
  })

  /*
   * 예상 순위는 상위 목록 안에 있을 때만 답할 수 있다. 서버가 일곱 개만 주므로
   * 그 아래에서는 스무 번째인지 백 번째인지 알 길이 없다 — 지어내지 않는다.
   */
  it('예상 순위는 순위권 안에서만 나온다', () => {
    expect(rankOf(300, TOP)).toBeNull()
    expect(rankOf(566, TOP)).toBeNull()
    expect(rankOf(567, TOP)).toBe(7)
    expect(rankOf(600, TOP)).toBe(7)
    expect(rankOf(1000, TOP)).toBe(5)
    expect(rankOf(2153, TOP)).toBe(1)
    expect(rankOf(9999, TOP)).toBe(1)
  })

  it('목록이 비어 있으면 순위를 말하지 않는다', () => {
    expect(rankOf(1000, [])).toBeNull()
  })

  /** 서버가 뒤섞어 주더라도 결과가 같아야 한다 */
  it('목록 순서에 기대지 않는다', () => {
    const shuffled = [TOP[3]!, TOP[0]!, TOP[6]!, TOP[2]!, TOP[5]!, TOP[1]!, TOP[4]!]
    expect(chaseOf(600, BEST, shuffled)).toEqual(chaseOf(600, BEST, TOP))
    expect(chaseOf(1300, BEST, shuffled)).toEqual(chaseOf(1300, BEST, TOP))
  })
})
