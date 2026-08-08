import { describe, expect, it } from 'vitest'
import {
  WIDEN_AT_SEC,
  accepts,
  bandOf,
  findPair,
  type Waiting,
} from '../worker/src/matching.ts'

/**
 * 자동매칭의 짝 고르기.
 *
 * 여기서 틀리면 "아무도 안 붙는다"나 "엉뚱한 상대가 걸린다"로 나타나고, 둘 다
 * 사람이 실제로 여럿 모여야 드러나서 손으로는 확인할 수 없다.
 */

const NOW = 1_000_000

function person(device: string, rating: number, waitedSec = 0): Waiting {
  return { device, rating, since: NOW - waitedSec * 1000 }
}

// 브론즈 0 · 실버 900 · 골드 1100 · 플래티넘 1300 · 다이아 1500
const BRONZE = 800
const SILVER = 1000
const GOLD = 1200
const DIAMOND = 1600

describe('대역', () => {
  it('처음에는 같은 티어만', () => {
    expect(bandOf(0)).toBe(0)
    expect(bandOf(WIDEN_AT_SEC[1] - 1)).toBe(0)
  })

  it('기다리면 옆 티어까지', () => {
    expect(bandOf(WIDEN_AT_SEC[1])).toBe(1)
  })

  it('더 기다리면 아무나', () => {
    // 다이아와 브론즈는 네 칸 차이다. 그것까지 통과해야 "아무나"다
    expect(bandOf(WIDEN_AT_SEC[2])).toBeGreaterThanOrEqual(4)
  })
})

describe('짝 고르기', () => {
  it('혼자면 안 붙는다', () => {
    expect(findPair([person('가', SILVER)], NOW)).toBeNull()
  })

  it('같은 티어 둘은 곧바로 붙는다', () => {
    const pair = findPair([person('가', SILVER), person('나', SILVER + 50)], NOW)
    expect(pair?.map((p) => p.device).sort()).toEqual(['가', '나'])
  })

  it('티어가 다르면 처음에는 안 붙는다', () => {
    expect(findPair([person('가', SILVER), person('나', GOLD)], NOW)).toBeNull()
  })

  it('둘 다 기다리면 옆 티어끼리 붙는다', () => {
    const waited = WIDEN_AT_SEC[1]
    const pair = findPair([person('가', SILVER, waited), person('나', GOLD, waited)], NOW)
    expect(pair).not.toBeNull()
  })

  /*
   * 여기가 이 파일의 핵심이다. 한쪽만 보고 붙이면 오래 기다린 다이아가 방금 들어온
   * 브론즈를 그 자리에서 끌어간다 — 끌려간 쪽은 기다린 적도 없이 네 칸 밖의 상대를
   * 만나고, 그게 "자동매칭은 가끔 말도 안 되는 상대가 걸린다"로 남는다.
   */
  it('오래 기다린 사람이 방금 들어온 사람을 끌어가지 못한다', () => {
    const patient = person('다이아', DIAMOND, WIDEN_AT_SEC[2] + 10)
    const fresh = person('브론즈', BRONZE, 0)
    expect(accepts(patient, fresh, NOW)).toBe(true)
    expect(accepts(fresh, patient, NOW)).toBe(false)
    expect(findPair([patient, fresh], NOW)).toBeNull()
  })

  it('둘 다 오래 기다렸으면 티어가 멀어도 붙는다', () => {
    const long = WIDEN_AT_SEC[2] + 5
    const pair = findPair([person('다이아', DIAMOND, long), person('브론즈', BRONZE, long)], NOW)
    expect(pair).not.toBeNull()
  })

  /*
   * 새로 들어온 사람이 먼저 붙어버리면 대역이 넓은(오래 기다린) 사람이 계속 뒤로
   * 밀려 굶는다. 줄에 오래 선 사람이 먼저다.
   */
  it('가장 오래 기다린 사람이 먼저 붙는다', () => {
    const pair = findPair(
      [person('오래', SILVER, 30), person('방금', SILVER, 0), person('중간', SILVER, 10)],
      NOW,
    )
    expect(pair?.some((p) => p.device === '오래')).toBe(true)
  })

  it('붙을 수 있는 사람 중에서는 레이팅이 가까운 쪽을 고른다', () => {
    const pair = findPair(
      [person('기준', SILVER, 5), person('먼쪽', SILVER + 90), person('가까운쪽', SILVER + 10)],
      NOW,
    )
    expect(pair?.map((p) => p.device).sort()).toEqual(['가까운쪽', '기준'])
  })

  it('셋이 있으면 둘만 붙는다 — 남은 한 명은 계속 기다린다', () => {
    const pair = findPair(
      [person('가', SILVER, 3), person('나', SILVER, 2), person('다', SILVER, 1)],
      NOW,
    )
    expect(pair).toHaveLength(2)
    expect(new Set(pair!.map((p) => p.device)).size).toBe(2)
  })

  it('자기 자신과는 붙지 않는다', () => {
    // 같은 기기가 두 번 들어오는 일은 막아야 하지만, 그래도 짝이 되어서는 안 된다
    expect(findPair([person('가', SILVER, 100)], NOW)).toBeNull()
  })
})
