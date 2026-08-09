import { afterEach, describe, expect, it } from 'vitest'
import { MatchEngine, type MatchViewState } from '../src/multi/MatchEngine.ts'
import { ChatLog } from '../src/multi/ChatLog.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'
import { Hub } from './helpers/hub.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 판 도중에 누가 사라졌을 때.
 *
 * 예전에는 **누구든** 사라지면 판을 접었다. 둘일 때는 맞는 동작이었지만 여덟까지
 * 늘린 뒤로는 한 사람의 네트워크 끊김이 나머지 일곱의 판을 죽인다. 그 사람만 빼고
 * 이어가야 한다.
 *
 * 셋 이상에서만 드러나는 일이라 손으로는 확인할 수 없다 — 실제로 둘로 짜인 시험을
 * 다 통과하면서도 이 구멍이 남아 있었다.
 */

const clock = new FrameClock()
let engines: MatchEngine[] = []

afterEach(() => {
  for (const engine of engines) {
    engine.dispose()
  }
  engines = []
  clock.uninstall()
})

interface Seat {
  engine: MatchEngine
  state: () => MatchViewState
  link: ReturnType<typeof Hub.of>[number]
}

async function seatsOf(count: number): Promise<Seat[]> {
  clock.install()
  const players: PlayerInfo[] = Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    nickname: `사람${index}`,
    device: `dev-${index}`,
    icon: '',
  }))
  const links = Hub.of(count)
  const seats: Seat[] = []
  for (const link of links) {
    const engine = await MatchEngine.create({
      transport: link,
      players,
      seed: 7,
      wins: new Map(),
      chat: new ChatLog(),
      chatEnabled: true,
      chatClock: () => 0,
      ranked: false,
    })
    let seen: MatchViewState | null = null
    engine.onStateChange((next) => {
      seen = next
    })
    link.listen((event) => engine.handleTransportEvent(event))
    engine.start()
    engines.push(engine)
    seats.push({ engine, link, state: () => seen!, })
  }
  return seats
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('판 도중에 누가 사라지면', () => {
  /*
   * 이 파일이 있는 이유다.
   */
  it('셋 중 하나가 나가도 남은 둘은 계속한다', async () => {
    const seats = await seatsOf(3)
    await clock.advance(1)

    // 참가자 하나가 사라진다
    seats[2]!.link.close()
    await settle()
    await settle()
    await clock.advance(0.3)

    for (const seat of [seats[0]!, seats[1]!]) {
      expect(seat.state().phase).toBe('playing')
      expect(seat.state().connectionLost).toBe(false)
    }
  })

  it('사라진 사람은 목숨을 잃고 등수가 매겨진다', async () => {
    const seats = await seatsOf(3)
    await clock.advance(1)
    seats[2]!.link.close()
    await settle()
    await settle()
    await clock.advance(0.3)

    const host = seats[0]!.state()
    expect(new Map(host.lives).get('p2')).toBe(0)
    expect(host.left).toContain('p2')
    // 남은 둘보다 아래다
    const placement = new Map(host.standings.map((row) => [row.id, row.placement]))
    expect(placement.get('p2')!).toBeGreaterThan(placement.get('p0')!)
  })

  it('남은 사람들이 같은 것을 본다', async () => {
    const seats = await seatsOf(3)
    await clock.advance(1)
    seats[2]!.link.close()
    await settle()
    await settle()
    await clock.advance(0.3)

    expect(seats[1]!.state().left).toContain('p2')
    expect(new Map(seats[1]!.state().lives).get('p2')).toBe(0)
  })

  /*
   * 물리와 판정을 방장이 쥐고 있고 참가자끼리는 서로 닿지도 못한다.
   * 방장이 사라지면 이어갈 방법이 없다.
   */
  it('방장이 사라지면 판이 끝난다', async () => {
    const seats = await seatsOf(3)
    await clock.advance(1)
    seats[0]!.link.close()
    await settle()
    await settle()
    await clock.advance(0.3)

    expect(seats[1]!.state().connectionLost).toBe(true)
  })

  it('둘만 남았다가 하나가 더 나가면 판이 끝난다', async () => {
    const seats = await seatsOf(3)
    await clock.advance(1)
    seats[2]!.link.close()
    await settle()
    await settle()
    await clock.advance(0.3)
    expect(seats[0]!.state().phase).toBe('playing')

    seats[1]!.link.close()
    await settle()
    await settle()
    await clock.advance(0.3)

    expect(seats[0]!.state().phase).toBe('over')
    expect(seats[0]!.state().winner).toBe('p0')
  })

  /*
   * 둘일 때는 예전 그대로다 — 남은 사람에게 "상대가 나갔다"를 보여주고 나가는 길만
   * 열어준다. 혼자 남아 물건을 쌓게 두는 것은 판이 아니다.
   */
  it('둘일 때 상대가 나가면 예전처럼 알린다', async () => {
    const seats = await seatsOf(2)
    await clock.advance(1)
    seats[1]!.engine.announceLeave()
    await settle()
    await settle()
    await clock.advance(0.3)

    expect(seats[0]!.state().opponentLeft).toBe(true)
  })
})
