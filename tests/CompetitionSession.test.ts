import { afterEach, describe, expect, it } from 'vitest'
import { CompetitionSession, type CompetitionSessionPhase } from '../src/competition/CompetitionSession.ts'
import type { CompetitionMessage } from '../src/competition/protocol.ts'
import { GenericHub, type GenericHubTransport } from './helpers/genericHub.ts'
import { FrameClock } from './helpers/frameClock.ts'

const clock = new FrameClock()
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface Seat {
  readonly session: CompetitionSession
  readonly phase: () => CompetitionSessionPhase | null
}

function seatsOf(count: number, countdownSec = 0): Seat[] {
  clock.install()
  const links = GenericHub.of<CompetitionMessage>(count)
  return links.map((link: GenericHubTransport<CompetitionMessage>, index) => {
    let phase: CompetitionSessionPhase | null = null
    const session = CompetitionSession.attach(link, (listen) => link.listen(listen), {
      nickname: `사람${index}`,
      deviceId: `d${index}`,
      icon: '',
      countdownSec,
      onPhase: (next) => { phase = next },
    })
    return { session, phase: () => phase }
  })
}

let seats: Seat[] = []

afterEach(() => {
  for (const seat of seats) seat.session.dispose()
  seats = []
  clock.uninstall()
})

describe('경쟁 모드 방', () => {
  it('여섯 명까지 같은 경쟁 명단에 들어온다', async () => {
    seats = seatsOf(6)
    await settle()
    await settle()
    for (const seat of seats) {
      const phase = seat.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind === 'ready') expect(phase.players).toHaveLength(6)
    }
  })

  it('일곱 번째 참가자는 경쟁 정원에서 거절되고 후속 준비 방송에도 돌아오지 않는다', async () => {
    seats = seatsOf(7)
    await settle()
    await settle()
    seats[0]!.session.setReady()
    await settle()
    await settle()
    const last = seats[6]?.phase()
    expect(last?.kind).toBe('failed')
    if (last?.kind === 'failed') expect(last.failure.kind).toBe('roomFull')
  })

  it('준비방에서 참가자 한 명이 나가도 남은 사람들은 같은 명단으로 계속한다', async () => {
    seats = seatsOf(4)
    await settle()
    await settle()
    seats[3]!.session.dispose()
    await settle()
    await settle()
    for (const seat of seats.slice(0, 3)) {
      const phase = seat.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind === 'ready') expect(phase.players).toHaveLength(3)
    }
  })

  it('카운트다운 중 참가자가 나가면 사라진 명단으로 엔진을 열지 않는다', async () => {
    seats = seatsOf(2, 3)
    await settle()
    await settle()
    for (const seat of seats) seat.session.setReady()
    await settle()
    expect(seats[0]!.phase()?.kind).toBe('countdown')

    seats[1]!.session.dispose()
    await settle()
    await settle()
    const host = seats[0]!.phase()
    expect(host?.kind).toBe('waiting')
  })

  it('모두 준비하면 턴 없는 경쟁 엔진이 열린다', async () => {
    seats = seatsOf(3)
    await settle()
    await settle()
    for (const seat of seats) seat.session.setReady()
    for (let wait = 0; wait < 300 && seats[0]?.phase()?.kind !== 'playing'; wait += 1) {
      await settle()
    }
    for (const seat of seats) expect(seat.phase()?.kind).toBe('playing')
  })
})
