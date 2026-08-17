import { lazy, Suspense, useCallback, useEffect } from 'react'
import { SplashBackdrop } from '../components/SplashBackdrop.tsx'
import { useMatchSession } from '../hooks/useMatchSession.ts'
import { LobbyScreen } from './LobbyScreen.tsx'
import type { TitleTheme } from './titleTheme.ts'

const loadMatchScreen = () => import('./MatchScreen.tsx')
const MatchScreen = lazy(() => loadMatchScreen().then((module) => ({
  default: module.MatchScreen,
})))

interface MultiplayerScreenProps {
  readonly theme: TitleTheme
  readonly onBack: () => void
  readonly onPhaseChange: (phase: 'playing' | 'over' | null) => void
}

/**
 * 타이틀에서는 이 파일 자체를 받지 않고, 함께 하기에 들어온 뒤에만 세션을 만든다.
 * 실제 경기 화면은 준비 단계에서 미리 받고 playing에 들어왔을 때만 렌더한다.
 */
function MultiplayerScreen({ theme, onBack, onPhaseChange }: MultiplayerScreenProps) {
  const { phase, state, open, leave, setReady, sendChat } = useMatchSession()

  useEffect(() => {
    onPhaseChange(state?.phase ?? null)
  }, [onPhaseChange, state?.phase])

  useEffect(() => {
    if (
      phase?.kind === 'ready' ||
      phase?.kind === 'roulette' ||
      phase?.kind === 'countdown'
    ) {
      void loadMatchScreen()
    }
  }, [phase?.kind])

  const leaveToTitle = useCallback(() => {
    leave()
    onBack()
  }, [leave, onBack])

  if (phase?.kind === 'playing' && state !== null) {
    return (
      <Suspense fallback={<MatchLoading theme={theme} />}>
        <MatchScreen engine={phase.engine} state={state} onLeave={leaveToTitle} />
      </Suspense>
    )
  }

  return (
    <SplashBackdrop theme={theme} animated={false}>
      <LobbyScreen
        phase={phase}
        onOpen={open}
        onReady={setReady}
        onChat={sendChat}
        onBack={phase === null ? leaveToTitle : leave}
        theme={theme}
      />
    </SplashBackdrop>
  )
}

function MatchLoading({ theme }: { theme: TitleTheme }) {
  return (
    <SplashBackdrop theme={theme} animated={false}>
      <span role="status" className="sr-only" data-match-loading>
        경기장을 불러오는 중입니다
      </span>
    </SplashBackdrop>
  )
}

export { MultiplayerScreen }
