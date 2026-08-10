import { afterEach, describe, expect, it } from 'vitest'
import { CompetitionEngine, type CompetitionViewState } from '../src/competition/CompetitionEngine.ts'
import type { CompetitionMessage } from '../src/competition/protocol.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'
import { GenericHub, type GenericHubTransport } from './helpers/genericHub.ts'
import { FrameClock } from './helpers/frameClock.ts'

const PLAYERS: PlayerInfo[] = [
  { id: 'p0', nickname: '자두', device: 'd0', icon: '' },
  { id: 'p1', nickname: '세이지', device: 'd1', icon: '' },
]

interface Pair {
  readonly host: CompetitionEngine
  readonly guest: CompetitionEngine
  readonly links: readonly GenericHubTransport<CompetitionMessage>[]
  readonly hostState: () => CompetitionViewState
  readonly guestState: () => CompetitionViewState
  readonly clock: FrameClock
}

async function pairOf(): Promise<Pair> {
  const clock = new FrameClock()
  clock.install()
  const links = GenericHub.of<CompetitionMessage>(2)
  const host = await CompetitionEngine.create({ transport: links[0]!, players: PLAYERS, seed: 42 })
  const guest = await CompetitionEngine.create({ transport: links[1]!, players: PLAYERS, seed: 42 })
  links[0]!.listen((event) => host.handleTransportEvent(event))
  links[1]!.listen((event) => guest.handleTransportEvent(event))
  let hostState: CompetitionViewState | null = null
  let guestState: CompetitionViewState | null = null
  host.onStateChange((next) => { hostState = next })
  guest.onStateChange((next) => { guestState = next })
  host.start()
  guest.start()
  return {
    host,
    guest,
    links,
    clock,
    hostState: () => {
      if (hostState === null) throw new Error('방장 상태가 없다')
      return hostState
    },
    guestState: () => {
      if (guestState === null) throw new Error('참가자 상태가 없다')
      return guestState
    },
  }
}

let pair: Pair | null = null

afterEach(() => {
  pair?.host.dispose()
  pair?.guest.dispose()
  pair?.clock.uninstall()
  pair = null
})

describe('CompetitionEngine', () => {
  it('각 플레이어에게 자기 단어 밭만 보내고 둘 다 기다림 없이 드롭한다', async () => {
    pair = await pairOf()
    await pair.clock.advance(0.2)

    const hostWord = pair.hostState().words[0]?.word
    const guestWord = pair.guestState().words[0]?.word
    expect(hostWord).toBeTypeOf('string')
    expect(guestWord).toBeTypeOf('string')

    pair.host.submit(hostWord!)
    pair.guest.submit(guestWord!)
    await pair.clock.advance(0.3)

    const owners = pair.host.debugBodies().map((body) => body.owner).sort()
    expect(owners).toEqual(['p0', 'p1'])
    expect(pair.guest.debugBodies().map((body) => body.owner).sort()).toEqual(owners)

    const targeted = pair.links[0]!.sent.filter((message) => message.t === 'cWords')
    expect(targeted.some((message) => message.t === 'cWords' && message.for === 'p1')).toBe(true)
  })

  it('방장이 잠깐 끊겨도 즉시 패배시키지 않고 같은 방장 복귀를 기다린다', async () => {
    pair = await pairOf()
    pair.links[1]!.deliver({ kind: 'peerLeft', peer: 'p0' })
    expect(pair.guestState().connectionLost).toBe(true)
    expect(pair.guestState().phase).toBe('playing')

    await pair.clock.advance(1)
    pair.links[1]!.deliver({ kind: 'peerJoined', peer: 'p0' })
    expect(pair.guestState().connectionLost).toBe(false)
    expect(pair.guestState().phase).toBe('playing')
  })

  it('여섯 명이 같은 탑에 동시에 드롭해도 각자의 물건 주인이 유지된다', async () => {
    const clock = new FrameClock()
    clock.install()
    const players = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index}`,
      nickname: `사람${index}`,
      device: `d${index}`,
      icon: '',
    }))
    const links = GenericHub.of<CompetitionMessage>(6)
    const engines: CompetitionEngine[] = []
    const states: (CompetitionViewState | null)[] = Array.from({ length: 6 }, () => null)
    try {
      for (let index = 0; index < 6; index += 1) {
        const engine = await CompetitionEngine.create({
          transport: links[index]!,
          players,
          seed: 77,
        })
        links[index]!.listen((event) => engine.handleTransportEvent(event))
        engine.onStateChange((next) => { states[index] = next })
        engines.push(engine)
        engine.start()
      }
      for (let step = 0; step < 20; step += 1) {
        await clock.advance(0.2)
        for (let index = 0; index < engines.length; index += 1) {
          const active = states[index]?.words.find((word) => word.state === 'active')
          if (active !== undefined) engines[index]!.submit(active.word)
        }
      }
      const hostBodies = engines[0]!.debugBodies()
      expect(new Set(hostBodies.map((body) => body.owner))).toEqual(
        new Set(players.map((player) => player.id)),
      )
      for (const engine of engines.slice(1)) {
        expect(engine.debugBodies().map((body) => body.itemId).sort((a, b) => a - b)).toEqual(
          hostBodies.map((body) => body.itemId).sort((a, b) => a - b),
        )
      }
    } finally {
      for (const engine of engines) engine.dispose()
      clock.uninstall()
    }
  }, 15000)

  it('자기 단어를 세 번 놓치면 탈락하고 입력을 이어간 사람이 승리한다', async () => {
    pair = await pairOf()

    for (let step = 0; step < 80 && pair.hostState().phase === 'playing'; step += 1) {
      await pair.clock.advance(0.2)
      const active = pair.hostState().words.find((word) => word.state === 'active')
      if (active !== undefined) pair.host.submit(active.word)
    }

    expect(new Map(pair.hostState().lives).get('p1')).toBe(0)
    expect(pair.hostState().winner).toBe('p0')
    expect(pair.guestState().winner).toBe('p0')
    expect(new Map(pair.hostState().misses).get('p1')).toBeGreaterThanOrEqual(3)
  })
})
