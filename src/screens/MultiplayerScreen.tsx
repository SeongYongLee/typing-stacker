import { useCallback, useEffect } from 'react'
import { SplashBackdrop } from '../components/SplashBackdrop.tsx'
import { useMatchSession } from '../hooks/useMatchSession.ts'
import { LobbyScreen } from './LobbyScreen.tsx'
import { MatchScreen } from './MatchScreen.tsx'
import type { TitleTheme } from './titleTheme.ts'

interface MultiplayerScreenProps {
  readonly theme: TitleTheme
  readonly onBack: () => void
  readonly onPhaseChange: (phase: 'playing' | 'over' | null) => void
}

/**
 * 대전 세션과 무거운 대전 화면을 한 청크 안에 가둔다.
 * 타이틀에서는 이 파일 자체를 받지 않고, 함께 하기에 들어온 뒤에만 세션을 만든다.
 */
function MultiplayerScreen({ theme, onBack, onPhaseChange }: MultiplayerScreenProps) {
  const { phase, state, open, leave, setReady, sendChat } = useMatchSession()

  useEffect(() => {
    onPhaseChange(state?.phase ?? null)
  }, [onPhaseChange, state?.phase])

  const leaveToTitle = useCallback(() => {
    leave()
    onBack()
  }, [leave, onBack])

  if (phase?.kind === 'playing' && state !== null) {
    return <MatchScreen engine={phase.engine} state={state} onLeave={leaveToTitle} />
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

export { MultiplayerScreen }
