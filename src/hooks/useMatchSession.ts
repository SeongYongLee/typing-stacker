import { useCallback, useEffect, useRef, useState } from 'react'
import type { MatchViewState } from '../multi/MatchEngine.ts'
import { MatchSession, type SessionPhase } from '../multi/MatchSession.ts'

interface JoinRequest {
  readonly mode: { readonly kind: 'host' } | { readonly kind: 'join'; readonly code: string }
  readonly nickname: string
  /** IP를 가릴지. 공용 TURN이 막힌 망에서는 꺼야 연결된다 */
  readonly hideIp: boolean
}

interface UseMatchSession {
  readonly phase: SessionPhase | null
  readonly state: MatchViewState | null
  readonly open: (request: JoinRequest) => void
  readonly leave: () => void
}

/**
 * 대전 세션의 수명을 React에 붙인다.
 *
 * 세션을 ref로 들고 있는 이유는 StrictMode가 이펙트를 두 번 돌려도 연결을 두 번
 * 맺지 않게 하려는 것이다 — Rapier 이중 초기화로 게임이 멈췄던 것과 같은 함정이다.
 */
function useMatchSession(): UseMatchSession {
  const sessionRef = useRef<MatchSession | null>(null)
  const [phase, setPhase] = useState<SessionPhase | null>(null)
  const [state, setState] = useState<MatchViewState | null>(null)

  const leave = useCallback(() => {
    sessionRef.current?.dispose()
    sessionRef.current = null
    setPhase(null)
    setState(null)
  }, [])

  const open = useCallback(
    (request: JoinRequest) => {
      sessionRef.current?.dispose()
      setState(null)
      sessionRef.current = MatchSession.open(request.mode, {
        nickname: request.nickname,
        hideIp: request.hideIp,
        onPhase: (next) => {
          setPhase(next)
          if (next.kind === 'playing') {
            next.engine.onStateChange(setState)
          }
        },
      })
    },
    [],
  )

  // 페이지를 떠날 때 연결을 확실히 끊는다. 남겨두면 상대는 계속 기다린다
  useEffect(() => {
    return () => {
      sessionRef.current?.dispose()
      sessionRef.current = null
    }
  }, [])

  return { phase, state, open, leave }
}

export { useMatchSession }
export type { JoinRequest, UseMatchSession }
