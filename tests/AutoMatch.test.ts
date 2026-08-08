import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchSession, type SessionPhase } from '../src/multi/MatchSession.ts'
import { Hub } from './helpers/hub.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 자동매칭으로 붙은 판.
 *
 * 코드로 모을 때와 다른 점이 둘이다. **보여줄 코드가 없고**(서버가 정해 둘에게만
 * 알려준 것이라 남에게 전달할 일이 없다), **준비에 시한이 있다**(모르는 사람이라
 * 안 누르는 것과 떠난 것을 구분할 수 없다).
 */

const clock = new FrameClock()
let sessions: MatchSession[] = []

afterEach(() => {
  for (const session of sessions) {
    session.dispose()
  }
  sessions = []
  clock.uninstall()
  vi.useRealTimers()
})

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface Seat {
  session: MatchSession | null
  phase: SessionPhase | null
}

/** 자동매칭으로 붙은 둘. 실제 경로와 같이 **둘 다 방을 만들며** 붙는다 */
function pairedSeats(): Seat[] {
  clock.install()
  const links = Hub.of(2)
  const seats: Seat[] = []
  for (const [index, link] of links.entries()) {
    const seat: Seat = { phase: null, session: null }
    seat.session = MatchSession.attach(link, (on) => link.listen(on), {
      nickname: `사람${index}`,
      deviceId: `dev-${index}`,
      countdownSec: 0,
      onPhase: (next) => {
        seat.phase = next
      },
    })
    seats.push(seat)
    sessions.push(seat.session)
  }
  return seats
}

describe('자동매칭으로 붙은 판', () => {
  it('붙은 뒤 준비 화면까지 간다', async () => {
    const seats = pairedSeats()
    await settle()
    await settle()
    for (const seat of seats) {
      expect(seat.phase?.kind).toBe('ready')
    }
  })

  it('둘 다 준비하면 판이 열린다', async () => {
    const seats = pairedSeats()
    await settle()
    await settle()
    for (const seat of seats) {
      seat.session?.setReady()
    }
    for (let wait = 0; wait < 300 && seats[0]!.phase?.kind !== 'playing'; wait += 1) {
      await settle()
    }
    for (const seat of seats) {
      expect(seat.phase?.kind).toBe('playing')
    }
  })
})

/*
 * 준비 시한은 `MatchSession.open`으로 들어온 자동매칭에서만 걸린다. `attach`는 개발용
 * 루프백의 입구라 시한이 없다 — 그래서 시한 자체는 실패 종류가 사람에게 할 말을
 * 갖추고 있는지로 지킨다. 실제 시한 동작은 화면에서 줄로 되돌리는 경로와 함께 본다.
 */
describe('준비 시한', () => {
  it('상대가 준비하지 않았다는 것을 사람에게 말할 수 있다', async () => {
    const { FAILURE_TEXT } = await import('../src/multi/Transport.ts')
    expect(FAILURE_TEXT.readyTimeout).toBeTruthy()
    // 다시 시도할 수 있는 종류여야 한다 — 화면이 이것을 보고 줄에 다시 세운다
    const { failure } = await import('../src/multi/Transport.ts')
    expect(failure('readyTimeout').retryable).toBe(true)
  })
})
