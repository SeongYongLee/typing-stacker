import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchSession, READY_TIMEOUT_MS, type SessionPhase } from '../src/multi/MatchSession.ts'
import type { MatchViewState } from '../src/multi/MatchEngine.ts'
import { Hub, type HubTransport } from './helpers/hub.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 랭크 게임으로 붙은 판.
 *
 * 코드로 모을 때와 다른 것이 넷이다 — **보여줄 방 코드가 없고**(서버가 정해 둘에게만
 * 알려준 것이라 남에게 전할 일이 없다), **준비에 시한이 있고**(모르는 사람이라 안
 * 누르는 것과 떠난 것을 구분할 수 없다), **말을 걸 수 없고**, **사다리에 오른다.**
 *
 * 넷 다 `MatchSession`의 `autoMatched` 하나가 가른다. 그리고 그 값을 세우는 것은
 * **`open`뿐이다** — `attach`로 세운 판은 아무리 자동매칭처럼 보이게 만들어도
 * 코드로 모인 방이다.
 *
 * **한때 이 파일이 `attach`를 썼다.** 그래서 이름은 자동매칭인데 실제로는 넷 중
 * 아무것도 지나지 않았고, 남은 두 시험이 `MatchSession.test.ts`와 글자까지 같았다.
 * 사다리에 오르는 쪽(`ranked: true`)은 그동안 아무도 지키지 않고 있었다.
 *
 * `open`은 중계에 붙으므로 node에서 그대로 돌지 않는다. **`RelayTransport`만 갈아끼우고
 * 그 뒤는 실제 경로 그대로 간다** — 핸드셰이크·명단·준비·엔진 생성이 다 일어난다.
 */

const seam = vi.hoisted(() => ({ links: [] as unknown[] }))

vi.mock('../src/multi/RelayTransport.ts', () => ({
  RelayTransport: {
    /*
     * 자동매칭은 **둘 다 방을 만들며** 붙는다. 중계가 먼저 온 쪽을 방장으로 삼으므로
     * 여기서도 미리 세워둔 순서대로 내준다 — 첫 번째가 방장이다.
     */
    host: (_url: string, _code: string, options: { onEvent: (event: unknown) => void }) => {
      const link = seam.links.shift() as HubTransport | undefined
      if (link === undefined) {
        throw new Error('세워둔 전송로보다 많이 붙으려 한다')
      }
      link.listen(options.onEvent as Parameters<HubTransport['listen']>[0])
      return Promise.resolve(link)
    },
    join: () => Promise.reject(new Error('자동매칭은 join으로 붙지 않는다')),
  },
}))

const clock = new FrameClock()
let sessions: MatchSession[] = []

afterEach(() => {
  for (const session of sessions) {
    session.dispose()
  }
  sessions = []
  seam.links = []
  clock.uninstall()
  vi.useRealTimers()
})

interface Seat {
  session: MatchSession
  phase: () => SessionPhase | null
  /** 지나온 단계 전부. 스쳐 지나가는 단계는 마지막 것만 봐서는 잡히지 않는다 */
  trail: SessionPhase[]
}

/** 랭크 게임으로 붙은 둘. 실제 경로와 같이 둘 다 방을 만들며 붙는다 */
function ranked(): Seat[] {
  clock.install()
  // 베껴 쓴다 — `Hub.of`가 돌려주는 것이 허브의 노드 배열 그 자체라, 여기서 꺼내 쓰면
  // 허브에서 노드가 사라져 아무에게도 배달되지 않는다
  seam.links = [...Hub.of(2)]
  const seats: Seat[] = []
  for (let index = 0; index < 2; index += 1) {
    const trail: SessionPhase[] = []
    const session = MatchSession.open(
      { kind: 'auto', code: 'ROOM1234' },
      {
        nickname: `사람${index}`,
        deviceId: `dev-${index}`,
        icon: '',
        // 셈은 따로 시험한다 — 판이 열리는지 보려는 여기서는 건너뛴다
        countdownSec: 0,
        onPhase: (next) => {
          trail.push(next)
        },
      },
    )
    sessions.push(session)
    seats.push({ session, trail, phase: () => trail[trail.length - 1] ?? null })
  }
  return seats
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 양쪽이 준비를 누르고 판이 열릴 때까지 */
async function playTo(seats: Seat[]): Promise<void> {
  await settle()
  await settle()
  for (const seat of seats) {
    seat.session.setReady()
  }
  for (let wait = 0; wait < 300 && seats[0]?.phase()?.kind !== 'playing'; wait += 1) {
    await settle()
  }
}

/**
 * 지금 상태 한 장. `onStateChange`는 **리스너를 하나만 둔다** — 시험에서는 붙여둔
 * 쪽이 없어 괜찮지만, 화면에서 같은 일을 하면 그때부터 React가 갱신을 못 받는다.
 */
function stateOf(phase: SessionPhase | null): MatchViewState {
  if (phase?.kind !== 'playing') throw new Error(`판이 열리지 않았다: ${phase?.kind}`)
  let seen: MatchViewState | null = null
  phase.engine.onStateChange((next) => {
    seen = next
  })
  if (seen === null) throw new Error('상태가 오지 않았다')
  return seen
}

describe('랭크 게임으로 붙은 판', () => {
  /**
   * 방 코드는 남에게 전하라고 있는 것이다. 서로 모르는 둘을 서버가 붙여준 자리에는
   * 전할 사람이 없으므로, 코드를 보여주면 무엇을 하라는 것인지 알 수 없는 화면이 된다.
   */
  it('방 코드를 보여주지 않는다', async () => {
    const seats = ranked()
    await settle()
    await settle()

    // 방장이 된 쪽조차 코드가 아니라 "붙이는 중"을 지난다
    expect(seats[0]?.trail.map((phase) => phase.kind)).toContain('pairing')
    for (const seat of seats) {
      // 스쳐 지나간 단계까지 본다 — 코드 화면은 한 프레임만 떠도 보여준 것이다
      for (const phase of seat.trail) {
        expect(phase.kind, '코드를 기다리는 화면은 랭크 게임에 없다').not.toBe('waiting')
        expect(phase).not.toHaveProperty('roomCode')
      }
    }
  })

  it('붙으면 양쪽이 같은 명단을 보고 준비를 기다린다', async () => {
    const seats = ranked()
    await settle()
    await settle()

    for (const seat of seats) {
      const phase = seat.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind !== 'ready') return
      expect(phase.players.map((player) => player.nickname)).toEqual(['사람0', '사람1'])
    }
  })

  /*
   * 이 줄이 이 파일이 생긴 이유다. 레이팅이 실제로 오르는 경로는 이것 하나뿐인데,
   * 어긋나도 화면에는 순위까지 다 보이고 티어만 안 뜬다 — 판을 끝까지 하고 결과
   * 화면을 봐야 드러난다. 반대쪽(코드로 모인 방은 안 오른다)은 `Ranked.test.ts`에.
   */
  it('사다리에 오른다', async () => {
    const seats = ranked()
    await playTo(seats)

    for (const seat of seats) {
      expect(stateOf(seat.phase()).ranked).toBe(true)
    }
  })

  /**
   * 모르는 사람에게 무엇이든 보낼 수 있는 통로를 열어두면 그것을 지켜볼 사람이 없다.
   */
  it('말을 걸 수 없다', async () => {
    const seats = ranked()
    await settle()
    await settle()

    const phase = seats[0]?.phase()
    expect(phase?.kind).toBe('ready')
    if (phase?.kind !== 'ready') return
    expect(phase.chatEnabled).toBe(false)
  })

  /**
   * 시한이 없으면 준비를 누른 쪽이 그 화면에 영원히 남는다 — 상대가 창을 열어두고
   * 가버린 것과 아직 안 누른 것을 구분할 방법이 없기 때문이다.
   *
   * 끊는 것까지가 이 층의 일이다. 줄에 다시 세우는 것은 화면이 이 실패를 받아서 한다.
   */
  it('아무도 준비하지 않으면 시한이 지나 실패로 알린다', async () => {
    vi.useFakeTimers()
    const seats = ranked()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(seats[0]?.phase()?.kind, '준비 화면까지는 가야 한다').toBe('ready')

    // 시한 직전까지는 끊지 않는다 — 성실히 기다린 사람을 줄로 되돌려보내는 일이다
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1)
    expect(seats[0]?.phase()?.kind, '시한 전').toBe('ready')

    await vi.advanceTimersByTimeAsync(2)
    const phase = seats[0]?.phase()
    expect(phase?.kind, '시한 뒤').toBe('failed')
    if (phase?.kind !== 'failed') return
    expect(phase.failure.kind).toBe('readyTimeout')
    // 다시 시도할 수 있는 종류여야 한다 — 화면이 이것을 보고 줄에 다시 세운다
    expect(phase.failure.retryable).toBe(true)
  })

  /** 판이 열렸으면 시한은 사라져야 한다. 안 지우면 판 도중에 실패가 튀어나온다 */
  it('판이 열리면 시한은 더 걸리지 않는다', async () => {
    vi.useFakeTimers()
    const seats = ranked()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    for (const seat of seats) {
      seat.session.setReady()
    }
    for (let wait = 0; wait < 300 && seats[0]?.phase()?.kind !== 'playing'; wait += 1) {
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(seats[0]?.phase()?.kind).toBe('playing')

    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS * 2)
    expect(seats[0]?.phase()?.kind).toBe('playing')
  })
})
