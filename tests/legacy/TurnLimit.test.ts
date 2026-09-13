import { afterEach, describe, expect, it } from 'vitest'
import { MatchEngine, TURN_LIMIT_SEC, type MatchViewState } from '../../src/multi/MatchEngine.ts'
import { ChatLog } from '../../src/multi/ChatLog.ts'
import { LoopbackTransport } from '../../src/multi/LoopbackTransport.ts'
import type { PlayerInfo } from '../../src/multi/protocol.ts'
import { FrameClock } from '../helpers/frameClock.ts'

/**
 * 차례에 걸린 시한.
 *
 * **받침대가 하나뿐이라 한 사람이 손을 놓으면 판 전체가 멎는다.** 나머지는 나가는 것
 * 말고 할 수 있는 일이 없다. 시한이 지나면 방장이 대신 떨궈 차례를 넘긴다.
 *
 * 여기서 지키는 것은 세 가지다 — 시간이 되면 실제로 떨어지는가, **방장만** 판정하는가
 * (양쪽이 각자 재면 같은 순간에 두 번 떨어진다), 그리고 난수를 건드리지 않는가.
 */

const PLAYERS: PlayerInfo[] = [
  { id: 'host-peer', nickname: '방장', device: 'dev-host', icon: '' },
  { id: 'guest-peer', nickname: '참가자', device: 'dev-guest', icon: '' },
]

interface Pair {
  host: MatchEngine
  guest: MatchEngine
  clock: FrameClock
  hostState: () => MatchViewState
  guestState: () => MatchViewState
}

let pair: Pair | null = null

afterEach(() => {
  pair?.host.dispose()
  pair?.guest.dispose()
  pair?.clock.uninstall()
  pair = null
})

async function makePair(): Promise<Pair> {
  const clock = new FrameClock()
  clock.install()
  const [hostLink, guestLink] = LoopbackTransport.pair()
  const common = {
    players: PLAYERS,
    seed: 4242,
    // 시한 시험은 방장이 손을 놓거나 치는지를 본다. 시작자 랜덤성은 별도 시험이 맡는다.
    starter: 'host-peer',
    wins: new Map<string, number>(),
    chat: new ChatLog(),
    chatEnabled: true,
    chatClock: () => 0,
    ranked: false,
  }
  const host = await MatchEngine.create({ ...common, transport: hostLink })
  const guest = await MatchEngine.create({ ...common, transport: guestLink })
  // 붙여주지 않으면 서로의 메시지가 닿지 않는다 — 두 판이 따로 도는 셈이 된다
  hostLink.listen((event) => host.handleTransportEvent(event))
  guestLink.listen((event) => guest.handleTransportEvent(event))
  let hostSeen: MatchViewState | null = null
  let guestSeen: MatchViewState | null = null
  host.onStateChange((state) => {
    hostSeen = state
  })
  guest.onStateChange((state) => {
    guestSeen = state
  })
  host.start()
  guest.start()
  return {
    host,
    guest,
    clock,
    hostState: () => hostSeen!,
    guestState: () => guestSeen!,
  }
}

/** 받침대에 얹힌 물건 수 */
function stacked(engine: MatchEngine): number {
  return engine.debugBodies().length
}

describe('차례 시한', () => {
  it('남은 시간이 줄어든다', async () => {
    pair = await makePair()
    await pair.clock.advance(3)
    const left = pair.hostState().turnLeft
    expect(left).not.toBeNull()
    expect(left!).toBeLessThan(TURN_LIMIT_SEC)
    expect(left!).toBeGreaterThan(0)
  })

  /*
   * 이 파일의 핵심. 손을 놓아도 판이 멎지 않아야 한다.
   */
  it('시한 뒤 한 물건을 양쪽에 떨구고 차례와 시계를 넘긴다', async () => {
    pair = await makePair()
    // 단어가 깔릴 시간을 준다
    await pair.clock.advance(4)
    expect(stacked(pair.host)).toBe(0)
    const first = pair.hostState().current

    // 이미 4초를 썼으므로 시한까지 남은 만큼만 더 흘린다
    await pair.clock.advance(TURN_LIMIT_SEC - 4 + 0.6)
    expect(pair.hostState().current).not.toBe(first)
    expect(pair.hostState().turnLeft!).toBeGreaterThan(TURN_LIMIT_SEC - 2)
    await pair.clock.advance(0.4)
    expect(stacked(pair.host)).toBe(1)
    expect(stacked(pair.guest)).toBe(1)
  })

  it('시간 안에 치면 대신 떨구지 않는다', async () => {
    pair = await makePair()
    await pair.clock.advance(4)
    const word = pair.hostState().words.find((one) => one.state === 'active')?.word
    expect(word).toBeDefined()
    pair.host.submit(word!)
    await pair.clock.advance(0.5)

    const after = stacked(pair.host)
    expect(after).toBe(1)
    // 시한의 절반쯤 더 흘려도 늘지 않는다 — 차례가 넘어갔고 그쪽 시계는 다시 시작이다
    await pair.clock.advance(TURN_LIMIT_SEC / 2)

    expect(stacked(pair.host)).toBe(after)
  })
})
