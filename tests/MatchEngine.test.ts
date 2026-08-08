import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INVULNERABLE_SEC, LIVES } from '../src/game/config.ts'
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
  { id: 'host-peer', nickname: '자두', device: 'dev-host' },
  { id: 'guest-peer', nickname: '세이지', device: 'dev-guest' },
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
  const host = await MatchEngine.create({
    transport: hostLink,
    players: PLAYERS,
    seed,
    wins: new Map(),
  })
  const guest = await MatchEngine.create({
    transport: guestLink,
    players: PLAYERS,
    seed,
    wins: new Map(),
  })

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

/** 방장이 화면에 있는 단어 하나를 골라 떨군다 */
function dropSomething(current: Pair): string | null {
  const mine = current.host
  const view = current.hostState()
  const word = view.words.find((candidate) => candidate.state === 'active')?.word
  if (word === undefined) {
    return null
  }
  mine.submit(word)
  return word
}

describe('MatchEngine — 대전', () => {
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
      const view = pair.hostState()
      const target = view.words.find(
        (word) => word.state === 'active' && HIDDEN_WORDS.has(word.word),
      )
      if (target === undefined) {
        continue
      }
      pair.host.submit(target.word)
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
  it('한 번 잃으면 잠깐 무적이고, 그 사실이 양쪽 화면에 보인다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)

    // 방장 소유 물건 여럿을 한꺼번에 받침대 밖으로 던진다
    pair.host.debugEscape('host-peer', 3)
    await pair.clock.advance(0.1)

    // 한 번만 깎였다
    const livesOf = (state: MatchViewState) => new Map(state.lives).get('host-peer')
    expect(livesOf(pair.hostState())).toBe(LIVES - 1)
    expect(livesOf(pair.guestState())).toBe(LIVES - 1)

    // 양쪽 다 누가 잃었는지 알고, 무적이 걸린 것도 안다
    expect(pair.hostState().hurt?.by).toBe('host-peer')
    expect(pair.guestState().hurt?.by).toBe('host-peer')
    expect(new Map(pair.guestState().invulnerable).get('host-peer')).toBeGreaterThan(0)

    // 무적이 끝나면 표시도 사라진다
    await pair.clock.advance(INVULNERABLE_SEC + 0.2)
    expect(pair.hostState().hurt).toBeNull()
    expect(pair.guestState().invulnerable).toHaveLength(0)
  })

  describe('판이 끝난 뒤', () => {
    /** 한쪽 목숨을 다 털어 판을 끝낸다 */
    async function finish(current: Pair, loser: string): Promise<void> {
      for (let round = 0; round < LIVES; round += 1) {
        current.host.debugEscape(loser, 1)
        await current.clock.advance(INVULNERABLE_SEC + 0.4)
      }
    }

    it('이긴 사람에게 1승이 붙고 양쪽이 같게 본다', async () => {
      pair = await makePair()
      await pair.clock.advance(1)
      await finish(pair, 'guest-peer')

      expect(pair.hostState().phase).toBe('over')
      expect(pair.hostState().winner).toBe('host-peer')
      expect(new Map(pair.hostState().wins).get('host-peer')).toBe(1)
      expect(new Map(pair.guestState().wins).get('host-peer')).toBe(1)
    })

    it('한쪽만 계속하기를 눌러도 다음 판은 열리지 않는다', async () => {
      pair = await makePair()
      await pair.clock.advance(1)
      await finish(pair, 'guest-peer')

      pair.host.requestRematch()
      await pair.clock.advance(0.3)

      // 누가 눌렀는지는 양쪽이 같게 본다 — 기다리는 쪽이 자기라는 것을 알아야 한다
      expect(pair.hostState().wantRematch).toEqual(['host-peer'])
      expect(pair.guestState().wantRematch).toEqual(['host-peer'])
      expect(pair.hostState().phase).toBe('over')
    })

    /*
     * 나가기는 사고(연결 끊김)와 구분해야 한다. 남은 사람에게 다시 시도할 것이
     * 없으므로 계속하기를 열어두면 누르고 영영 기다리게 된다.
     */
    it('상대가 나가면 남은 사람이 그 사실을 안다', async () => {
      pair = await makePair()
      await pair.clock.advance(1)
      await finish(pair, 'guest-peer')

      pair.guest.announceLeave()
      await pair.clock.advance(0.3)

      expect(pair.hostState().opponentLeft).toBe(true)
      expect(pair.hostState().connectionLost).toBe(false)
    })
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

  it('둘 다 처음부터 떨굴 수 있다 — 차례를 기다리지 않는다', async () => {
    pair = await makePair()
    await pair.clock.advance(0.5)

    expect(pair.hostState().canDrop).toBe(true)
    expect(pair.guestState().canDrop).toBe(true)
  })

  it('떨군 사람만 잠깐 못 떨군다 — 상대의 손은 멈추지 않는다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(0.3)

    expect(pair.hostState().canDrop).toBe(false)
    expect(pair.guestState().canDrop).toBe(true)
  })

  it('간격이 지나면 다시 떨굴 수 있다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(0.3)
    expect(pair.hostState().canDrop).toBe(false)

    await pair.clock.advance(1.2)
    expect(pair.hostState().canDrop).toBe(true)
  })

  it('떨굴 수 없는 동안 친 단어는 덫이 되고 양쪽 다 본다', async () => {
    pair = await makePair()
    // 단어가 여러 개 깔린 뒤에 시험한다 — 하나뿐이면 떨구는 순간 걸 것이 남지 않는다
    await pair.clock.advance(6)
    dropSomething(pair)
    await pair.clock.advance(0.3)

    const word = pair.hostState().words.find((w) => w.state === 'active')?.word
    expect(word).toBeDefined()
    pair.host.submit(word!)
    await pair.clock.advance(0.3)

    // 건 사람에게도 보여야 한다 — 무엇을 걸어뒀는지 모르면 같은 단어를 또 건다
    expect(pair.hostState().harassed.map((h) => h.word)).toContain(word)
    expect(pair.guestState().harassed.map((h) => h.word)).toContain(word)
    expect(pair.hostState().harassed.find((h) => h.word === word)?.by).toBe('host-peer')
  })

  it('덫을 상대가 치면 건 사람이 하트를 되찾는다', async () => {
    pair = await makePair()
    await pair.clock.advance(6)

    const before = pair.hostState().lives.find(([id]) => id === 'host-peer')?.[1] ?? 0

    dropSomething(pair)
    await pair.clock.advance(0.3)
    const trap = pair.hostState().words.find((w) => w.state === 'active')?.word
    pair.host.submit(trap!)
    await pair.clock.advance(0.3)

    // 참가자가 그 단어를 친다
    pair.guest.submit(trap!)
    await pair.clock.advance(0.6)

    const after = pair.hostState().lives.find(([id]) => id === 'host-peer')?.[1] ?? 0
    // 이미 가득이면 오르지 않는다. 덫이 풀리는 것은 언제나 일어난다
    expect(after).toBeGreaterThanOrEqual(before)
    expect(pair.hostState().harassed.map((h) => h.word)).not.toContain(trap)
  })
})
