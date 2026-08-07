import { useEffect, useRef, useState } from 'react'
import { LoopbackTransport } from '../multi/LoopbackTransport.ts'
import type { MatchViewState } from '../multi/MatchEngine.ts'
import { MatchSession, type SessionPhase } from '../multi/MatchSession.ts'

interface LoopbackSide {
  readonly phase: SessionPhase | null
  readonly state: MatchViewState | null
}

interface UseLoopbackMatch {
  readonly host: LoopbackSide
  readonly guest: LoopbackSide
}

/**
 * 한 페이지에서 방장과 참가자를 동시에 돌린다. **개발용 진입(`?loopback=1`)이 쓴다.**
 *
 * WebRTC는 이 환경에서 데이터 채널이 열리지 않아 대전을 자동으로 확인할 수 없다.
 * 전송로만 루프백으로 갈아끼우면 그 뒤의 모든 것 — 핸드셰이크, 턴 교대, 소유권,
 * 목숨, 화면과 입력 — 이 실제와 같은 경로로 돌아가므로 눌러보고 확인할 수 있다.
 *
 * 방장 세션을 먼저 만들어 듣게 한 뒤에 참가자를 붙인다. 순서를 뒤집으면 참가자의
 * hello가 아무도 없는 쪽으로 날아가 판이 시작되지 않는다.
 */
function useLoopbackMatch(): UseLoopbackMatch {
  const sessions = useRef<MatchSession[]>([])
  const [host, setHost] = useState<LoopbackSide>({ phase: null, state: null })
  const [guest, setGuest] = useState<LoopbackSide>({ phase: null, state: null })

  useEffect(() => {
    const [hostLink, guestLink] = LoopbackTransport.pair()

    const side = (set: (next: LoopbackSide) => void) => ({
      onPhase: (phase: SessionPhase) => {
        set({ phase, state: null })
        if (phase.kind === 'playing') {
          phase.engine.onStateChange((state) => set({ phase, state }))
        }
      },
    })

    const hostSession = MatchSession.attach(hostLink, (on) => hostLink.listen(on), {
      nickname: '방장',
      ...side(setHost),
    })
    const guestSession = MatchSession.attach(guestLink, (on) => guestLink.listen(on), {
      nickname: '참가자',
      ...side(setGuest),
    })
    sessions.current = [hostSession, guestSession]

    return () => {
      for (const session of sessions.current) {
        session.dispose()
      }
      sessions.current = []
    }
  }, [])

  return { host, guest }
}

export { useLoopbackMatch }
export type { LoopbackSide }
