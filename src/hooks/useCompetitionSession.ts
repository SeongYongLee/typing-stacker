import { useCallback, useEffect, useRef, useState } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import type { CompetitionViewState } from '../competition/CompetitionEngine.ts'
import {
  CompetitionSession,
  type CompetitionOpenMode,
  type CompetitionSessionPhase,
} from '../competition/CompetitionSession.ts'
import { loadProfile } from '../storage/profile.ts'

interface CompetitionJoinRequest {
  readonly mode: CompetitionOpenMode
  readonly nickname: string
  readonly icon: string
}

function useCompetitionSession() {
  const sessionRef = useRef<CompetitionSession | null>(null)
  const [phase, setPhase] = useState<CompetitionSessionPhase | null>(null)
  const [state, setState] = useState<CompetitionViewState | null>(null)

  const leave = useCallback(() => {
    sessionRef.current?.dispose()
    sessionRef.current = null
    setPhase(null)
    setState(null)
  }, [])

  const open = useCallback((request: CompetitionJoinRequest) => {
    sessionRef.current?.dispose()
    setState(null)
    sessionRef.current = CompetitionSession.open(request.mode, {
      nickname: request.nickname,
      icon: request.icon,
      deviceId: loadProfile().id,
      onPhase: (next) => {
        setPhase(next)
        if (next.kind === 'playing') {
          next.engine.onStateChange(setState)
          next.engine.onEvent((event) => soundBoard().handle(event))
          if (import.meta.env.DEV) {
            ;(window as unknown as { __competition?: unknown }).__competition = next.engine
          }
        }
      },
    })
  }, [])

  const setReady = useCallback(() => sessionRef.current?.setReady(), [])

  useEffect(() => () => {
    sessionRef.current?.dispose()
    sessionRef.current = null
  }, [])

  return { phase, state, open, leave, setReady }
}

export { useCompetitionSession }
export type { CompetitionJoinRequest }
