import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchSession, type SessionPhase } from '../src/multi/MatchSession.ts'
import { Hub } from './helpers/hub.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 모두 준비한 뒤 판이 열리기까지의 셈.
 *
 * 다른 시험들은 `countdownSec: 0`으로 이 구간을 건너뛴다 — 판이 열리는지 보려는
 * 것이지 셈을 보려는 것이 아니기 때문이다. 그래서 셈 자체는 **여기서만** 지켜진다.
 * 여기까지 0으로 두면 기능이 아무 곳에서도 검증되지 않는다.
 */

const clock = new FrameClock()

interface Seat {
  session: MatchSession
  phase: () => SessionPhase | null
}

function seatsOf(count: number, countdownSec: number): Seat[] {
  clock.install()
  return Hub.of(count).map((link, index) => {
    let phase: SessionPhase | null = null
    const session = MatchSession.attach(link, (on) => link.listen(on), {
      nickname: `사람${index}`,
      deviceId: `dev-${index}`,
      icon: '',
      countdownSec,
      onPhase: (next) => {
        phase = next
      },
    })
    return { session, phase: () => phase }
  })
}

let seats: Seat[] = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const seat of seats) {
    seat.session.dispose()
  }
  seats = []
  vi.useRealTimers()
  clock.uninstall()
})

/** 붙는 것과 준비는 마이크로태스크로 오간다 — 가짜 시계로는 흐르지 않으므로 따로 비운다 */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
  }
}

describe('시작 셈', () => {
  it('모두 준비하면 곧바로 열지 않고 센다', async () => {
    seats = seatsOf(2, 3)
    await settle()
    for (const seat of seats) {
      seat.session.setReady()
    }
    await settle()

    for (const seat of seats) {
      const phase = seat.phase()
      expect(phase?.kind).toBe('countdown')
      if (phase?.kind === 'countdown') {
        expect(phase.secondsLeft).toBe(3)
        // 누구와 붙는지 이 화면에서도 보여야 한다
        expect(phase.players).toHaveLength(2)
        // 첫 차례도 이 화면에서 미리 보여준다
        expect(phase.players.some((player) => player.id === phase.starter)).toBe(true)
      }
    }
  })

  it('1초마다 줄어든다', async () => {
    seats = seatsOf(2, 3)
    await settle()
    for (const seat of seats) {
      seat.session.setReady()
    }
    await settle()

    const left = () => {
      const phase = seats[0]!.phase()
      return phase?.kind === 'countdown' ? phase.secondsLeft : null
    }
    expect(left()).toBe(3)
    await vi.advanceTimersByTimeAsync(1000)
    expect(left()).toBe(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(left()).toBe(1)
  })

  /*
   * start가 두 번 오더라도(재전송, 이펙트 이중 실행) 셈이 되돌아가면 안 된다 —
   * 3에서 다시 3으로 돌아가면 영영 시작하지 않는다.
   */
  it('다시 시작 신호가 와도 셈이 되돌아가지 않는다', async () => {
    seats = seatsOf(2, 3)
    await settle()
    for (const seat of seats) {
      seat.session.setReady()
    }
    await settle()
    await vi.advanceTimersByTimeAsync(1000)

    // 이미 준비를 누른 뒤에 또 누른다 — 방장이 명단을 다시 알린다
    seats[1]!.session.setReady()
    await settle()

    const phase = seats[0]!.phase()
    expect(phase?.kind).toBe('countdown')
    if (phase?.kind === 'countdown') {
      expect(phase.secondsLeft).toBe(2)
    }
  })

  it('셈이 0이면 곧바로 연다 — 개발용 루프백이 쓰는 길이다', async () => {
    // Rapier WASM 초기화는 실제 시간이 흘러야 끝난다
    vi.useRealTimers()
    seats = seatsOf(2, 0)
    await settle()
    for (const seat of seats) {
      seat.session.setReady()
    }
    // 엔진 생성은 Rapier 초기화를 기다린다
    for (let wait = 0; wait < 200 && seats[0]!.phase()?.kind !== 'playing'; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(seats[0]!.phase()?.kind).toBe('playing')
  })

  it('세는 중에 나가면 타이머가 남지 않는다', async () => {
    seats = seatsOf(2, 3)
    await settle()
    for (const seat of seats) {
      seat.session.setReady()
    }
    await settle()

    seats[0]!.session.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    // 판이 열리지 않았어야 한다 — 나간 세션이 뒤늦게 엔진을 만들면 안 된다
    expect(seats[0]!.phase()?.kind).toBe('countdown')
  })
})
