import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INVULNERABLE_SEC, LIVES } from '../src/game/config.ts'
import {
  DROP_INTERVAL_SEC,
  DUEL_WORD_RATE_MULTIPLIER,
  MatchEngine,
  difficultyForMatch,
  type MatchViewState,
} from '../src/multi/MatchEngine.ts'
import { MAX_ON_SCREEN, OPENING } from '../src/game/systems/Difficulty.ts'
import type { PlayerInfo } from '../src/multi/protocol.ts'
import type { MatchMode } from '../src/multi/matchModes.ts'
import { LoopbackTransport } from '../src/multi/LoopbackTransport.ts'
import { FrameClock } from './helpers/frameClock.ts'
import { ChatLog } from '../src/multi/ChatLog.ts'

/**
 * 대전 로직 전체를 붙여서 확인한다.
 *
 * WebRTC는 이 환경에서 데이터 채널이 열리지 않아 실제 경로를 자동 검증할 수 없다.
 * 그래서 전송로만 루프백으로 갈아끼우고 그 위의 모든 것 — 턴 교대, 소유권,
 * 상대를 믿지 않는 검증, 권위 키프레임 — 을 확인한다.
 */

const PLAYERS: PlayerInfo[] = [
  { id: 'host-peer', nickname: '자두', device: 'dev-host' , icon: ''},
  { id: 'guest-peer', nickname: '세이지', device: 'dev-guest' , icon: ''},
]

interface Pair {
  host: MatchEngine
  guest: MatchEngine
  hostState: () => MatchViewState
  guestState: () => MatchViewState
  hostLink: LoopbackTransport
  guestLink: LoopbackTransport
  clock: FrameClock
}

async function makePair(seed = 1234, chatEnabled = true, matchMode: MatchMode = 'shared'): Promise<Pair> {
  const clock = new FrameClock()
  clock.install()

  // 시각은 시험이 쥔다 — 벽시계를 쓰면 연달아 보내는 것을 막는 규칙이 시험을 흔든다
  let now = 0
  const chatClock = () => (now += 10_000)

  const [hostLink, guestLink] = LoopbackTransport.pair()
  const host = await MatchEngine.create({
    transport: hostLink,
    players: PLAYERS,
    seed,
    matchMode,
    wins: new Map(),
    chat: new ChatLog(),
    chatEnabled,
    chatClock,
    ranked: false,
  })
  const guest = await MatchEngine.create({
    transport: guestLink,
    players: PLAYERS,
    seed,
    matchMode,
    wins: new Map(),
    chat: new ChatLog(),
    chatEnabled,
    chatClock,
    ranked: false,
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
  it('대결 모드는 인원과 관계없이 단어 상한 10개와 2배 생성 속도를 쓴다', () => {
    const shared = difficultyForMatch(OPENING, 4, 'shared')
    const duel = difficultyForMatch(OPENING, 4, 'duel')

    expect(DUEL_WORD_RATE_MULTIPLIER).toBe(2)
    expect(duel.spawnInterval).toBe(shared.spawnInterval / DUEL_WORD_RATE_MULTIPLIER)
    expect(duel.maxConcurrent).toBe(MAX_ON_SCREEN)
    expect(duel.fallDuration).toBe(shared.fallDuration)
    for (let players = 2; players <= 8; players += 1) {
      expect(difficultyForMatch(OPENING, players, 'duel').maxConcurrent).toBe(MAX_ON_SCREEN)
    }
  })

  it('대결 모드는 첫 단어 뒤 절반 간격이 지나면 다음 단어를 낸다', async () => {
    pair = await makePair(778, true, 'duel')
    await pair.clock.advance(0.1)

    const firstId = pair.hostState().words[0]?.id
    expect(firstId).toBeDefined()

    const interval = OPENING.spawnInterval / DUEL_WORD_RATE_MULTIPLIER
    await pair.clock.advance(interval - 0.3)
    expect(pair.hostState().words.every((word) => word.id === firstId)).toBe(true)

    await pair.clock.advance(0.4)
    expect(pair.hostState().words.some((word) => word.id !== firstId)).toBe(true)
  })

  it('양쪽에 같은 단어가 나온다', async () => {
    pair = await makePair(777)
    await pair.clock.advance(2)

    const hostWords = pair.hostState().words.map((word) => word.word)
    const guestWords = pair.guestState().words.map((word) => word.word)
    expect(hostWords.length).toBeGreaterThan(0)
    expect(guestWords).toEqual(hostWords)
  })

  it('단어를 떨궈도 양쪽 단어 밭이 갈리지 않는다', async () => {
    pair = await makePair(2024)

    for (let tick = 0; tick < 6; tick += 1) {
      await pair.clock.advance(0.5)
      const target = pair.hostState().words.find((word) => word.state === 'active')
      if (target !== undefined) {
        pair.host.submit(target.word)
        break
      }
    }

    // 갈렸다면 이 뒤에 나오는 단어부터 서로 달라진다
    await pair.clock.advance(8)
    const identify = (state: MatchViewState) =>
      state.words.map((word) => `${word.id}:${word.word}:${word.state}`)
    expect(identify(pair.guestState())).toEqual(identify(pair.hostState()))
  })

  it('방장이 계산한 생성 높이를 참가자가 그대로 쓴다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(0.2)

    const dropped = pair.hostLink.sent.find((message) => message.t === 'dropped')
    expect(dropped?.t).toBe('dropped')
    if (dropped?.t !== 'dropped') return
    expect(dropped.spawnY).toBeTypeOf('number')
    expect(pair.host.debugBodies()[0]?.y).toBeCloseTo(pair.guest.debugBodies()[0]!.y, 5)
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

  it('대결 모드는 턴 없이 양쪽이 동시에 자기 쿨타임으로 떨군다', async () => {
    pair = await makePair(1515, true, 'duel')
    await pair.clock.advance(1)

    expect(pair.hostState().matchMode).toBe('duel')
    expect(pair.hostState().current).toBeNull()
    expect(pair.hostState().myTurn).toBe(true)
    expect(pair.guestState().myTurn).toBe(true)
    expect(pair.guestState().canDrop).toBe(true)
    expect(pair.guestState().turnLeft).toBeNull()

    const word = pair.guestState().words.find((candidate) => candidate.state === 'active')?.word
    expect(word).toBeDefined()
    if (word === undefined) return
    pair.guest.submit(word)
    await pair.clock.advance(0.5)

    expect(pair.host.debugBodies()[0]?.owner).toBe('guest-peer')
    expect(pair.guest.debugBodies()[0]?.owner).toBe('guest-peer')
    expect(pair.hostState().canDrop).toBe(true)
    expect(pair.guestState().canDrop).toBe(false)

    pair.host.debugEscape('guest-peer', 1)
    await pair.clock.advance(0.2)
    expect(new Map(pair.hostState().lives).get('guest-peer')).toBe(LIVES)

    // 상대 판의 방장 측 예측이 아니라, 실제 판 주인이 감지한 이탈만 판정한다.
    pair.guest.debugEscape('guest-peer', 1)
    await pair.clock.advance(0.1)

    const lives = new Map(pair.hostState().lives)
    expect(lives.get('host-peer')).toBe(LIVES)
    expect(lives.get('guest-peer')).toBe(LIVES - 1)
  })

  it('대결에서 단어를 가져간 사람과 원래 자리를 양쪽에 잠시 보여준다', async () => {
    pair = await makePair(1518, true, 'duel')
    await pair.clock.advance(1)
    const target = pair.guestState().words.find((candidate) => candidate.state === 'active')
    expect(target).toBeDefined()
    if (target === undefined) return

    pair.guest.submit(target.word)
    await pair.clock.advance(0.1)

    for (const state of [pair.hostState(), pair.guestState()]) {
      expect(state.wordClaims).toContainEqual(expect.objectContaining({
        by: 'guest-peer',
        word: target.word,
        side: target.side,
        slot: target.slot,
        lifeReward: false,
      }))
    }

    await pair.clock.advance(1.5)
    expect(pair.hostState().wordClaims).toHaveLength(0)
    expect(pair.guestState().wordClaims).toHaveLength(0)
  })

  it('대결 게임판 상태는 판 주인이 직접 배포한다', async () => {
    pair = await makePair(1517, true, 'duel')
    await pair.clock.advance(0.3)

    expect(pair.hostLink.sent.some((message) => (
      message.t === 'duelBoardState' && message.owner === 'host-peer'
    ))).toBe(true)
    expect(pair.guestLink.sent.some((message) => (
      message.t === 'duelBoardState' && message.owner === 'guest-peer'
    ))).toBe(true)
  })

  it('친선 대결의 드롭 쿨타임은 채팅 시간이 아니다', async () => {
    pair = await makePair(1516, true, 'duel')
    await pair.clock.advance(1)
    const word = pair.hostState().words.find((candidate) => candidate.state === 'active')?.word
    expect(word).toBeDefined()
    if (word === undefined) return

    pair.host.submit(word)
    await pair.clock.advance(0.1)

    expect(pair.hostState().canDrop).toBe(false)
    expect(pair.hostState().inputMode).toBe('idle')
    pair.host.submit('쿨타임 채팅')
    await pair.clock.advance(0.1)
    expect(pair.hostState().chat).toHaveLength(0)
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

    it('친선전은 결과 화면에서도 이전 대화를 유지하고 채팅을 이어간다', async () => {
      pair = await makePair(1520, true, 'shared')
      await pair.clock.advance(1)
      const chatter = pair.hostState().inputMode === 'chat' ? pair.host : pair.guest
      chatter.submit('게임 중 대화')
      await finish(pair, 'guest-peer')

      expect(pair.hostState().phase).toBe('over')
      expect(pair.hostState().inputMode).toBe('chat')
      expect(pair.hostState().chat.map((line) => line.text)).toContain('게임 중 대화')

      pair.host.submit('끝나고 대화')
      await pair.clock.flush()
      expect(pair.hostState().chat.map((line) => line.text)).toEqual([
        '게임 중 대화',
        '끝나고 대화',
      ])
      expect(pair.guestState().chat.map((line) => line.text)).toEqual([
        '게임 중 대화',
        '끝나고 대화',
      ])
    })

    /*
     * 나가기는 사고(연결 끊김)와 구분해야 한다. 남은 사람에게 다시 시도할 것이
     * 없으므로 계속하기를 열어두면 누르고 영영 기다리게 된다.
     */
    it('계속하기를 여러 번 눌러도 재시작 신호는 한 번만 보낸다', async () => {
      pair = await makePair()
      await pair.clock.advance(1)
      await finish(pair, 'guest-peer')

      pair.host.requestRematch()
      pair.guest.requestRematch()
      await pair.clock.advance(0.1)
      pair.host.requestRematch()
      pair.host.requestRematch()
      await pair.clock.advance(0.1)

      expect(pair.hostLink.sent.filter((message) => message.t === 'restart')).toHaveLength(1)
    })

    it('상대가 나가면 남은 사람이 그 사실을 안다', async () => {
      pair = await makePair()
      await pair.clock.advance(1)
      await finish(pair, 'guest-peer')

      pair.guest.announceLeave()
      await pair.clock.advance(0.1)
      pair.guestLink.close()
      await pair.clock.advance(0.2)

      expect(pair.hostState().opponentLeft).toBe(true)
      expect(pair.hostState().connectionLost).toBe(false)
    })
  })

  it('판이 끝나기 전에 온 구형 계속하기는 다음 판 동의로 쌓지 않는다', async () => {
    pair = await makePair()
    await pair.clock.advance(0.5)
    pair.guestLink.broadcast({ t: 'rematch' })
    await pair.clock.flush()
    expect(pair.hostState().wantRematch).toHaveLength(0)
  })

  it('방장이 아닌 발신자와 다른 판의 권위 메시지는 무시한다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(0.2)
    expect(pair.guest.debugBodies()).toHaveLength(1)

    pair.guest.handleTransportEvent({
      kind: 'message', from: 'spoofed-peer',
      message: { t: 'sync', bodies: [], welds: [], matchId: pair.guestState().matchId },
    })
    expect(pair.guest.debugBodies()).toHaveLength(1)

    pair.hostLink.broadcast({ t: 'sync', bodies: [], welds: [], matchId: 'wrong-round' })
    await pair.clock.flush()
    expect(pair.guest.debugBodies()).toHaveLength(1)
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

  it('첫 차례는 명단의 첫 사람이고 양쪽이 같게 본다', async () => {
    pair = await makePair()
    await pair.clock.advance(0.5)

    expect(pair.hostState().current).toBe('host-peer')
    expect(pair.guestState().current).toBe('host-peer')
    expect(pair.hostState().canDrop).toBe(true)
    expect(pair.guestState().canDrop).toBe(false)
  })

  /*
   * 받침대가 하나뿐이라 한 번에 한 사람만 떨군다. 다만 앞사람의 물건이 **자리를
   * 잡기를 기다리지는 않는다** — 기다리게 하면 구르는 물건 하나에 판이 몇 초씩 멈춘다.
   * 대신 모두가 함께 쓰는 짧은 쿨타임이 끝나는 순간 다음 사람이 친다.
   */
  it('떨구면 곧바로 다음 사람 차례가 되고, 쿨타임은 모두가 함께 쓴다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)
    await pair.clock.advance(0.3)

    // 차례는 이미 넘어갔지만 쿨타임이 도는 동안에는 아무도 떨구지 못한다
    expect(pair.hostState().current).toBe('guest-peer')
    expect(pair.guestState().current).toBe('guest-peer')
    expect(pair.hostState().canDrop).toBe(false)
    expect(pair.guestState().canDrop).toBe(false)

    // 남은 대기가 양쪽 화면에 같은 값으로 보인다
    expect(pair.guestState().dropCooldown).toBeGreaterThan(0)
    expect(pair.hostState().dropCooldown).toBeGreaterThan(0)
  })

  it('쿨타임이 끝나면 다음 차례 사람만 떨굴 수 있다', async () => {
    pair = await makePair()
    await pair.clock.advance(1)
    dropSomething(pair)

    await pair.clock.advance(DROP_INTERVAL_SEC + 0.2)
    expect(pair.guestState().canDrop).toBe(true)
    // 방금 떨군 사람은 자기 차례가 다시 올 때까지 못 떨군다
    expect(pair.hostState().canDrop).toBe(false)
  })

  it('내 차례가 아니면 친 말이 채팅으로 간다', async () => {
    pair = await makePair()
    await pair.clock.advance(6)
    dropSomething(pair)
    await pair.clock.advance(0.3)

    // 방금 떨궜으니 차례가 넘어갔다 — 지금 치는 것은 말이다
    expect(pair.hostState().canDrop).toBe(false)
    expect(pair.hostState().inputMode).toBe('chat')

    pair.host.submit('잘하네요')
    await pair.clock.advance(0.3)

    expect(pair.hostState().chat.map((line) => line.text)).toEqual(['잘하네요'])
    // 양쪽이 같게 본다 — 한 말은 방장을 거쳐 퍼진다
    expect(pair.guestState().chat.map((line) => line.text)).toEqual(['잘하네요'])
  })

  /*
   * 낙하 단어와 맞는지 검사하기 **전에** 갈라야 한다. 뒤에 두면 한마디가 오타로
   * 처리되어 그대로 사라진다.
   */
  it('낙하 단어와 같은 말이라도 내 차례가 아니면 채팅이다', async () => {
    pair = await makePair()
    await pair.clock.advance(6)
    dropSomething(pair)
    await pair.clock.advance(0.3)

    const word = pair.hostState().words.find((w) => w.state === 'active')?.word
    expect(word).toBeDefined()
    const before = pair.hostState().words.length

    pair.host.submit(word!)
    await pair.clock.advance(0.3)

    expect(pair.hostState().chat.map((line) => line.text)).toEqual([word])
    // 단어는 그대로 남아 있다 — 떨어지지 않았다
    expect(pair.hostState().words.length).toBe(before)
  })

  it('내 차례에 친 것은 말이 아니라 물건이다', async () => {
    pair = await makePair()
    await pair.clock.advance(6)

    expect(pair.hostState().inputMode).toBe('drop')
    const word = pair.hostState().words.find((w) => w.state === 'active')?.word
    pair.host.submit(word!)
    await pair.clock.advance(0.4)

    expect(pair.hostState().chat).toHaveLength(0)
  })

  /*
   * 랭크 게임으로 만난 사이에는 말을 걸 수 없다. 그때 입력창이 아무 일도 하지 않는
   * 것을 화면이 알아야 잠가둘 수 있다.
   */
  it('말을 걸 수 없는 방에서는 아무 일도 하지 않는다', async () => {
    pair = await makePair(1234, false)
    await pair.clock.advance(6)
    dropSomething(pair)
    await pair.clock.advance(0.3)

    expect(pair.hostState().inputMode).toBe('idle')
    pair.host.submit('안녕')
    await pair.clock.advance(0.3)
    expect(pair.hostState().chat).toHaveLength(0)
  })
})
