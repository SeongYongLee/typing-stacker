import { describe, expect, it } from 'vitest'
import { parseMessage } from '../src/multi/protocol.ts'

/**
 * 권위 키프레임 규약.
 *
 * 자리만 실어 보내면 부족하다 — 끈적함이 만드는 관절은 **구조**라서, 한쪽에만
 * 생기면 자리를 아무리 맞춰도 다음 스텝부터 탑이 다르게 움직인다. 그래서
 * 붙어 있는 짝도 함께 나른다.
 */

const BODY = {
  itemId: 1,
  variantId: 'apple',
  owner: 'p1',
  x: 0.5,
  y: 1.2,
  rotation: 0.1,
}

describe('sync 키프레임', () => {
  it('붙어 있는 짝을 함께 나른다', () => {
    const parsed = parseMessage({
      t: 'sync',
      bodies: [BODY],
      welds: [
        [1, 2],
        [2, 3],
      ],
    })
    expect(parsed).toMatchObject({
      t: 'sync',
      welds: [
        [1, 2],
        [2, 3],
      ],
    })
  })

  /*
   * 관절이 빠진 키프레임도 받아들인다. 한쪽만 새 버전일 때 판이 아예 안 도는 것보다,
   * 자리만 맞고 구조는 갈린 채로라도 도는 편이 낫다.
   */
  it('관절이 없는 옛 키프레임도 통과시킨다', () => {
    const parsed = parseMessage({ t: 'sync', bodies: [BODY] })
    expect(parsed).toMatchObject({ t: 'sync', welds: [] })
  })

  it('짝이 아닌 것과 숫자가 아닌 것은 버린다', () => {
    const parsed = parseMessage({
      t: 'sync',
      bodies: [BODY],
      welds: [[1, 2], [3], ['a', 'b'], [4, 5], 7],
    })
    expect(parsed).toMatchObject({
      welds: [
        [1, 2],
        [4, 5],
      ],
    })
  })

  it('관절을 무한히 받지는 않는다', () => {
    const many = Array.from({ length: 400 }, (_, i) => [i, i + 1])
    const parsed = parseMessage({ t: 'sync', bodies: [BODY], welds: many })
    expect(parsed?.t).toBe('sync')
    if (parsed?.t !== 'sync') {
      return
    }
    expect(parsed.welds.length).toBeLessThanOrEqual(256)
    expect(parsed.welds.length).toBeGreaterThan(0)
  })
})
