import { afterEach, describe, expect, it } from 'vitest'
import { MatchSession, type SessionPhase } from '../src/multi/MatchSession.ts'
import { MAX_PLAYERS } from '../src/multi/protocol.ts'
import { Hub } from './helpers/hub.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 셋 이상이 붙는 판.
 *
 * 둘로는 드러나지 않는 것들이 여기서 드러난다 — 실제로 명단을 [방장, 방금 온 사람]
 * 둘로 덮어쓰고 있어서, 셋째가 들어오면 둘째가 사라졌다.
 */

const clock = new FrameClock()

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface Seat {
  session: MatchSession
  phase: () => SessionPhase | null
}

function seatsOf(count: number): Seat[] {
  clock.install()
  const links = Hub.of(count)
  return links.map((link, index) => {
    let phase: SessionPhase | null = null
    const session = MatchSession.attach(link, (on) => link.listen(on), {
      nickname: `사람${index}`,
      deviceId: `dev-${index}`,
      onPhase: (next) => {
        phase = next
      },
    })
    return { session, phase: () => phase }
  })
}

let seats: Seat[] = []

afterEach(() => {
  for (const seat of seats) {
    seat.session.dispose()
  }
  seats = []
  clock.uninstall()
})

function rosterOf(seat: Seat): string[] {
  const phase = seat.phase()
  return phase?.kind === 'ready' ? phase.players.map((player) => player.nickname) : []
}

describe('여러 명이 붙는다', () => {
  it('셋째가 들어와도 둘째가 사라지지 않는다', async () => {
    seats = seatsOf(3)
    await tick()
    await tick()

    for (const seat of seats) {
      expect(rosterOf(seat)).toEqual(['사람0', '사람1', '사람2'])
    }
  })

  it('정원까지 모두 명단에 남는다', async () => {
    seats = seatsOf(MAX_PLAYERS)
    await tick()
    await tick()

    expect(rosterOf(seats[0]!)).toHaveLength(MAX_PLAYERS)
    // 방장이 맨 앞이고 들어온 순서대로다 — 그 순서가 곧 차례다
    expect(rosterOf(seats[0]!)[0]).toBe('사람0')
  })

  it('한 명이라도 준비하지 않으면 시작하지 않는다', async () => {
    seats = seatsOf(3)
    await tick()
    await tick()

    seats[0]!.session.setReady()
    seats[1]!.session.setReady()
    await tick()
    await tick()

    for (const seat of seats) {
      expect(seat.phase()?.kind).toBe('ready')
    }
  })

  it('모두 준비하면 판이 열린다', async () => {
    seats = seatsOf(3)
    await tick()
    await tick()
    for (const seat of seats) {
      seat.session.setReady()
    }
    // 엔진 생성은 Rapier 초기화를 기다린다
    for (let wait = 0; wait < 200 && seats[0]!.phase()?.kind !== 'playing'; wait += 1) {
      await tick()
    }

    for (const seat of seats) {
      expect(seat.phase()?.kind).toBe('playing')
    }
  })

  /*
   * 여덟까지 붙으므로 한 명이 나갔다고 판을 접으면 안 된다.
   * 둘일 때는 남은 사람이 없어 접는 것이 맞았지만, 셋이면 둘이 남는다.
   */
  it('시작 전에 한 명이 나가도 남은 사람들끼리 기다린다', async () => {
    seats = seatsOf(3)
    await tick()
    await tick()

    seats[2]!.session.dispose()
    await tick()
    await tick()

    expect(seats[0]!.phase()?.kind).toBe('ready')
    expect(rosterOf(seats[0]!)).toEqual(['사람0', '사람1'])
  })

  it('나간 사람이 준비 명단에서도 빠져 남은 사람들만으로 시작한다', async () => {
    seats = seatsOf(3)
    await tick()
    await tick()

    seats[1]!.session.setReady()
    await tick()
    seats[1]!.session.dispose()
    await tick()
    await tick()

    seats[0]!.session.setReady()
    seats[2]!.session.setReady()
    for (let wait = 0; wait < 200 && seats[0]!.phase()?.kind !== 'playing'; wait += 1) {
      await tick()
    }
    expect(seats[0]!.phase()?.kind).toBe('playing')
  })
})
