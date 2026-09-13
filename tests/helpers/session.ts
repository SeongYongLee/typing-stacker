import { MatchSession, type SessionPhase } from '../../src/multi/MatchSession.ts'
import type { Transport, TransportEvent } from '../../src/multi/Transport.ts'

type TestTransport = Transport & { listen(on: (event: TransportEvent) => void): void }

export interface SessionSeat {
  session: MatchSession
  phase(): SessionPhase | null
}

/** The caller owns transport choice, clock installation, and session disposal. */
export function attachSession(link: TestTransport, nickname: string, deviceId: string): SessionSeat {
  let phase: SessionPhase | null = null
  const session = MatchSession.attach(link, (on) => link.listen(on), {
    nickname, deviceId, icon: '', countdownSec: 0,
    onPhase: (next) => { phase = next },
  })
  return { session, phase: () => phase }
}
