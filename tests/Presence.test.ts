import { describe, expect, it } from 'vitest'
import { Presence, REJOIN_GRACE_SEC } from '../src/multi/Presence.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'

/**
 * 누구를 언제까지 기다리고, 방장이 사라지면 누가 이어받는가.
 *
 * `PlayerLeft.test.ts`가 이 판정의 **결과**를 엔진 위에서 확인한다면 이 파일은
 * **경계**를 본다 — 유예가 정확히 끝나는 순간, 이미 탈락한 사람, 아무도 안 남은 판.
 * 전송로를 세우지 않아도 되니 그런 자리를 하나씩 짚어볼 수 있다.
 */

const roster: PlayerInfo[] = ['a', 'b', 'c'].map((id) => ({
  id,
  nickname: id.toUpperCase(),
  icon: '',
  device: `device-${id}`,
}))

const alwaysAlive = () => true

function presence() {
  return new Presence(roster, 'me')
}

describe('사라진 사람을 기다리는 동안', () => {
  it('처음 방장은 명단 맨 앞이다', () => {
    expect(presence().host).toBe('a')
  })

  it('명단이 비어 있으면 자기가 방장이다', () => {
    // 혼자 남았거나 명단이 아직 안 왔을 때. 심판이 없는 판은 만들지 않는다
    expect(new Presence([], 'me').host).toBe('me')
  })

  /*
   * 유예가 끝나는 그 순간에 뺀다. 다음 프레임을 더 기다리면 프레임 간격만큼
   * 늘어나고, 그 간격은 기기마다 달라서 양쪽이 다른 순간에 뺄 수 있다.
   */
  it('유예가 지나야 뺀다', () => {
    const p = presence()
    p.await('b', 10)
    expect(p.expired(10 + REJOIN_GRACE_SEC - 0.1)).toEqual([])
    expect(p.expired(10 + REJOIN_GRACE_SEC)).toEqual(['b'])
  })

  it('한 번 뺀 사람을 또 빼지 않는다', () => {
    const p = presence()
    p.await('b', 0)
    expect(p.expired(REJOIN_GRACE_SEC)).toEqual(['b'])
    expect(p.expired(REJOIN_GRACE_SEC + 100)).toEqual([])
  })

  it('돌아오면 없던 일이 된다', () => {
    const p = presence()
    p.await('b', 0)
    p.returned('b')
    expect(p.expired(REJOIN_GRACE_SEC + 100)).toEqual([])
  })

  it('빠진 사람은 한 번만 적힌다', () => {
    const p = presence()
    p.markGone('b')
    p.markGone('b')
    expect(p.gone).toEqual(['b'])
  })
})

describe('방장을 넘길 때', () => {
  it('남은 사람 중 명단에서 앞선 사람이 받는다', () => {
    const p = presence()
    p.handOver('a', roster, alwaysAlive, 'me')
    expect(p.host).toBe('b')
  })

  /*
   * 이미 탈락한 사람이 심판이 되면 그 사람이 나가는 순간 또 넘겨야 한다.
   */
  it('탈락한 사람은 건너뛴다', () => {
    const p = presence()
    p.handOver('a', roster, (id) => id !== 'b', 'me')
    expect(p.host).toBe('c')
  })

  it('받을 사람이 없으면 자기가 맡는다', () => {
    const p = presence()
    p.handOver('a', roster, () => false, 'me')
    expect(p.host).toBe('me')
  })
})
