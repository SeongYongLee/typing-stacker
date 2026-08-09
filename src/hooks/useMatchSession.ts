import { useCallback, useEffect, useRef, useState } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import type { MatchViewState } from '../multi/MatchEngine.ts'
import { MatchSession, type OpenMode, type SessionPhase } from '../multi/MatchSession.ts'
import { loadProfile } from '../storage/profile.ts'

interface JoinRequest {
  readonly mode: OpenMode
  readonly nickname: string
  /**
   * 상대에게 보일 아이콘(물건 id).
   *
   * 이름과 함께 부르는 쪽이 정한다 — 랭크 게임은 기기 프로필을 쓰고 친선전은
   * 그 방에서만 쓰는 따로 둔 프로필을 쓰기 때문이다.
   */
  readonly icon: string
}

interface UseMatchSession {
  readonly phase: SessionPhase | null
  readonly state: MatchViewState | null
  readonly open: (request: JoinRequest) => void
  readonly leave: () => void
  /** 준비 단계에서 준비를 누른다 */
  readonly setReady: () => void
  /** 준비 화면에서 한마디 한다. 판이 열린 뒤에는 엔진이 같은 일을 맡는다 */
  readonly sendChat: (text: string) => void
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
        icon: request.icon,
        deviceId: loadProfile().id,
        onPhase: (next) => {
          setPhase(next)
          if (next.kind === 'playing') {
            /*
             * 붕괴처럼 만들기 어려운 상황을 검사에서 직접 일으키기 위한 통로.
             * 개발 빌드에만 존재한다 — 루프백 화면의 것과 같은 성격이지만,
             * 이쪽은 실제 중계를 거치는 경로라 배포본에 남기면 안 된다.
             */
            if (import.meta.env.DEV) {
              ;(window as unknown as { __match?: unknown }).__match = next.engine
            }
            next.engine.onStateChange(setState)
            next.engine.onEvent((event) => soundBoard().handle(event))
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

  const setReady = useCallback(() => {
    sessionRef.current?.setReady()
  }, [])

  const sendChat = useCallback((text: string) => {
    sessionRef.current?.sendChat(text)
  }, [])

  return { phase, state, open, leave, setReady, sendChat }
}

export { useMatchSession }
export type { JoinRequest, UseMatchSession }
