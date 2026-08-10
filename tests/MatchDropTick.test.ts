import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MatchEngine, type MatchViewState } from '../src/multi/MatchEngine.ts'
import type { Message, PlayerInfo } from '../src/multi/protocol.ts'
import { ChatLog } from '../src/multi/ChatLog.ts'
import { FrameClock } from './helpers/frameClock.ts'
import { DelayedLoopbackTransport } from './helpers/delayedLoopbackTransport.ts'

const PLAYERS: PlayerInfo[] = [
  { id: 'host-peer', nickname: '자두', device: 'dev-host', icon: '' },
  { id: 'guest-peer', nickname: '세이지', device: 'dev-guest', icon: '' },
]

interface Pair {
  readonly host: MatchEngine
  readonly guest: MatchEngine
  readonly hostState: () => MatchViewState
  readonly hostLink: DelayedLoopbackTransport
  readonly clock: FrameClock
}

async function makePair(delay: (message: Message) => number): Promise<Pair> {
  const clock = new FrameClock()
  clock.install()
  const [hostLink, guestLink] = DelayedLoopbackTransport.pair({
    clock,
    delay: (message) => delay(message),
  })
  const common = {
    players: PLAYERS,
    seed: 1234,
    wins: new Map(),
    chat: new ChatLog(),
    chatEnabled: true,
    chatClock: () => clock.now,
    ranked: false,
  }
  const host = await MatchEngine.create({ ...common, transport: hostLink })
  const guest = await MatchEngine.create({ ...common, transport: guestLink })
  hostLink.listen((event) => host.handleTransportEvent(event))
  guestLink.listen((event) => guest.handleTransportEvent(event))

  let hostView: MatchViewState | null = null
  host.onStateChange((state) => {
    hostView = state
  })
  host.start()
  guest.start()

  return {
    host,
    guest,
    hostLink,
    clock,
    hostState: () => {
      if (hostView === null) throw new Error('방장 상태가 없다')
      return hostView
    },
  }
}

function dropSomething(pair: Pair): void {
  const word = pair.hostState().words.find((candidate) => candidate.state === 'active')?.word
  expect(word).toBeTypeOf('string')
  pair.host.submit(word!)
}

let pair: Pair | null = null

beforeEach(() => {
  pair = null
})

afterEach(() => {
  pair?.host.dispose()
  pair?.guest.dispose()
  pair?.clock.uninstall()
})

describe('drop 적용 tick', () => {
  it('방장은 dropped에 미래 적용 tick을 싣고 그 tick 전에는 자기 물리에도 만들지 않는다', async () => {
    pair = await makePair((message) => (message.t === 'dropped' ? 48 : 0))
    await pair.clock.advance(1)

    dropSomething(pair)
    await pair.clock.flush()
    const dropped = pair.hostLink.sent.find((message) => message.t === 'dropped')
    expect(dropped?.t).toBe('dropped')
    expect(dropped?.t === 'dropped' && dropped.applyAtTick).toBeTypeOf('number')

    await pair.clock.advance(0.04)
    expect(pair.host.debugBodies()).toHaveLength(0)
    expect(pair.guest.debugBodies()).toHaveLength(0)

    await pair.clock.advance(0.12)
    expect(pair.host.debugBodies()).toHaveLength(1)
    expect(pair.guest.debugBodies()).toHaveLength(1)
    expect(pair.guest.debugBodies()[0]?.itemId).toBe(pair.host.debugBodies()[0]?.itemId)
  })

  it('적용 tick보다 늦게 도착한 dropped도 버리지 않고 즉시 만든다', async () => {
    pair = await makePair((message) => (message.t === 'dropped' ? 180 : 0))
    await pair.clock.advance(1)

    dropSomething(pair)
    await pair.clock.advance(0.14)
    expect(pair.host.debugBodies()).toHaveLength(1)
    expect(pair.guest.debugBodies()).toHaveLength(0)

    await pair.clock.advance(0.1)
    expect(pair.guest.debugBodies()).toHaveLength(1)
    expect(pair.guest.debugBodies()[0]?.variantId).toBe(pair.host.debugBodies()[0]?.variantId)
  })
})
