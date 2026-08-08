import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WORDS } from '../src/game/data/words.ts'
import { MatchEngine, type MatchViewState } from '../src/multi/MatchEngine.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'
import { LoopbackTransport } from '../src/multi/LoopbackTransport.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 대전 로직 전체를 붙여서 확인한다.
 *
 * WebRTC는 이 환경에서 데이터 채널이 열리지 않아 실제 경로를 자동 검증할 수 없다.
 * 그래서 전송로만 루프백으로 갈아끼우고 그 위의 모든 것 — 턴 교대, 소유권,
 * 상대를 믿지 않는 검증, 권위 키프레임 — 을 확인한다.
 */

const PLAYERS: PlayerInfo[] = [
  { id: 'host-peer', nickname: '자두' },
  { id: 'guest-peer', nickname: '세이지' },
]

/** 떨굴 때 방장이 난수를 한 번 더 뽑는 단어들 — 난수열이 갈리는지 보려면 이 중에서 골라야 한다 */
const HIDDEN_WORDS = new Set(
  WORDS.filter((entry) => entry.variants.some((variant) => variant.hidden)).map(
    (entry) => entry.word,
  ),
)

interface Pair {
  host: MatchEngine
  guest: MatchEngine
  hostState: () => MatchViewState
  guestState: () => MatchViewState
  hostLink: LoopbackTransport
  guestLink: LoopbackTransport
  clock: FrameClock
}

async function makePair(seed = 1234): Promise<Pair> {
  const clock = new FrameClock()
  clock.install()

  const [hostLink, guestLink] = LoopbackTransport.pair()
  const host = await MatchEngine.create({ transport: hostLink, players: PLAYERS, seed })
  const guest = await MatchEngine.create({ transport: guestLink, players: PLAYERS, seed })

  hostLink.listen((event) => host.handleTransportEvent(event))
  guestLink.listen((event) => guest.handleTransportEvent(event))

  let hostView: MatchViewState | null = null
  let guestView: MatchViewState | null = null
  host.onStateChange((state) => {
    hostView = state
  })
  guest.onStateChange((state) => {
    guestView = state
  })

  host.start()
  guest.start()

  return {
    host,
    guest,
    hostLink,
    guestLink,
    clock,
    hostState: () => {
      if (hostView === null) throw new Error('방장 상태가 없다')
      return hostView
    },
    guestState: () => {
      if (guestView === null) throw new Error('참가자 상태가 없다')
      return guestView
    },
  }
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

/** 지금 차례인 쪽에서 화면에 있는 단어 하나를 골라 떨군다 */
function dropSomething(current: Pair): string | null {
  const mine = current.hostState().myTurn ? current.host : current.guest
  const view = current.hostState().myTurn ? current.hostState() : current.guestState()
  const word = view.words.find((candidate) => candidate.state === 'active')?.word
  if (word === undefined) {
    return null
  }
  mine.submit(word)
  return word
}

describe('MatchEngine — 턴제 대전', () => {
  it('첫 차례는 명단의 첫 사람이고 양쪽이 같게 본다', async () => {
    pair = await makePair()
    await pair.clock.advance(0.2)

    expect(pair.hostState().current).toBe('host-peer')
    expect(pair.guestState().current).toBe('host-peer')
    expect(pair.hostState().myTurn).toBe(true)
    expect(pair.guestState().myTurn).toBe(false)
  })

  it('양쪽에 같은 단어가 나온다', async () => {
    pair = await makePair(777)
    await pair.clock.advance(2)

    const hostWords = pair.hostState().words.map((word) => word.word)
    const guestWords = pair.guestState().words.map((word) => word.word)
    expect(hostWords.length).toBeGreaterThan(0)
    expect(guestWords).toEqual(hostWords)
  })

  /*
   * 한때 여기가 깨져 있었다. 단어 스포너와 물건 뽑기가 난수 하나를 같이 썼는데
   * 물건은 방장만 뽑으므로, 그 순간 두 난수열이 갈려 그때부터 서로 다른 단어가 내려왔다.
   *
   * **히든 변형이 있는 단어여야 재현된다.** 그런 단어가 아니면 방장도 난수를 더 뽑지
   * 않아 두 열이 그대로 맞는다 — 아무 단어나 떨구는 테스트로는 이 회귀를 놓친다.
   */
  it('히든이 걸린 단어를 떨궈도 양쪽 단어 밭이 갈리지 않는다', async () => {
    pair = await makePair(2024)

    let dropped: string | null = null
    for (let tick = 0; tick < 60 && dropped === null; tick += 1) {
      await pair.clock.advance(0.5)
      const hostTurn = pair.hostState().myTurn
      const view = hostTurn ? pair.hostState() : pair.guestState()
      const target = view.words.find(
        (word) => word.state === 'active' && HIDDEN_WORDS.has(word.word),
      )
      if (target === undefined) {
        continue
      }
      ;(hostTurn ? pair.host : pair.guest).submit(target.word)
      dropped = target.word
    }
    expect(dropped).not.toBeNull()

    // 갈렸다면 이 뒤에 나오는 단어부터 서로 달라진다
    await pair.clock.advance(8)
    const identify = (state: MatchViewState) =>
      state.words.map((word) => `${word.id}:${word.word}:${word.state}`)
    expect(identify(pair.guestState())).toEqual(identify(pair.hostState()))
  })

  it('방장이 떨구면 참가자 쪽에도 같은 물건이 생긴다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)

    const word = dropSomething(pair)
    expect(word).not.toBeNull()
    await pair.clock.advance(0.5)

    // 물건의 정체는 방장이 정하고 id로 보낸다 — 양쪽이 같아야 한다
    const hostItem = pair.host.debugBodies()[0]
    const guestItem = pair.guest.debugBodies()[0]
    expect(hostItem).toBeDefined()
    expect(guestItem).toBeDefined()
    expect(guestItem?.variantId).toBe(hostItem?.variantId)
    expect(guestItem?.owner).toBe('host-peer')
  })

  /*
   * 이 구간은 아무의 차례도 아니다. settling을 따로 두지 않으면 양쪽 화면에 똑같이
   * "상대 차례"가 떠서 판이 멈춘 것처럼 보인다.
   */
  it('물건이 자리를 잡는 동안은 양쪽 다 자기 차례가 아니고, 그 사실이 드러난다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(0.4)

    expect(pair.hostState().settling).toBe(true)
    expect(pair.guestState().settling).toBe(true)
    expect(pair.hostState().myTurn).toBe(false)
    expect(pair.guestState().myTurn).toBe(false)

    // 멈추면 풀린다
    await pair.clock.advance(6)
    expect(pair.hostState().settling).toBe(false)
    expect(pair.guestState().settling).toBe(false)
    expect(pair.guestState().myTurn).toBe(true)
  })

  it('떨군 물건이 자리를 잡으면 턴이 넘어간다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)

    // 낙하 + 안착 + 정적 판정까지 넉넉히 돌린다
    await pair.clock.advance(6)

    expect(pair.hostState().current).toBe('guest-peer')
    expect(pair.guestState().current).toBe('guest-peer')
    expect(pair.guestState().myTurn).toBe(true)
    expect(pair.hostState().myTurn).toBe(false)
  })

  it('내 차례가 아니면 떨구지 못한다 — 상대가 보낸 청을 방장이 거른다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)

    // 첫 턴은 방장인데 참가자가 떨구려 한다
    const word = pair.guestState().words.find((candidate) => candidate.state === 'active')?.word
    expect(word).toBeDefined()
    pair.guest.submit(word!)
    await pair.clock.advance(1)

    // 물건이 생기지 않고 턴도 그대로다
    expect(pair.host.debugBodies()).toHaveLength(0)
    expect(pair.hostState().current).toBe('host-peer')
  })

  it('내 차례가 아닐 때 친 단어는 상대에게 지목으로 간다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)

    const word = pair.guestState().words.find((candidate) => candidate.state === 'active')?.word
    pair.guest.submit(word!)
    await pair.clock.advance(0.3)

    expect(pair.hostState().suggestion?.word).toBe(word)
    expect(pair.hostState().suggestion?.by).toBe('guest-peer')
    // 지목한 쪽 화면에는 자기 지목이 뜨지 않는다
    expect(pair.guestState().suggestion).toBeNull()
  })

  it('턴이 끝나면 방장이 권위 키프레임을 보낸다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(6)

    const syncs = pair.hostLink.sent.filter((message) => message.t === 'sync')
    expect(syncs.length).toBeGreaterThan(0)

    // 키프레임은 턴 끝에만 보낸다 — 매 프레임 흘리면 무료 전송로 한도를 태운다
    expect(syncs.length).toBeLessThan(4)
  })

  it('키프레임을 받은 참가자가 방장과 같은 자리를 본다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(6)

    const hostBodies = pair.host.debugBodies()
    const guestBodies = pair.guest.debugBodies()
    expect(guestBodies).toHaveLength(hostBodies.length)
    for (const hostBody of hostBodies) {
      const match = guestBodies.find((body) => body.itemId === hostBody.itemId)
      expect(match).toBeDefined()
      // 밀리미터까지 같기를 요구하지 않는다. 여기서 잡으려는 것은 물건이 두 배로
      // 늘어나거나 엉뚱한 자리에 놓이는 어긋남이지 부동소수점 오차가 아니다
      expect(match!.x).toBeCloseTo(hostBody.x, 2)
      expect(match!.y).toBeCloseTo(hostBody.y, 2)
    }
  })

  it('상대가 사라지면 판을 이어가지 않는다', async () => {
    pair = await makePair()
    await pair.clock.advance(0.5)

    pair.guestLink.close()
    await pair.clock.advance(0.3)

    expect(pair.hostState().connectionLost).toBe(true)
  })

  it('없는 단어를 치면 아무 일도 일어나지 않는다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)

    pair.host.submit('없는단어입니다')
    await pair.clock.advance(0.5)

    expect(pair.host.debugBodies()).toHaveLength(0)
    expect(pair.hostState().feedback?.kind).toBe('miss')
  })
})
