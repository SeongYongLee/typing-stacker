import { useCallback, useState } from 'react'
import { useGameEngine } from './hooks/useGameEngine.ts'
import { useMatchSession } from './hooks/useMatchSession.ts'
import { CollectionScreen } from './screens/CollectionScreen.tsx'
import { GameScreen } from './screens/GameScreen.tsx'
import { LobbyScreen } from './screens/LobbyScreen.tsx'
import { LoopbackScreen } from './screens/LoopbackScreen.tsx'
import { MatchScreen } from './screens/MatchScreen.tsx'
import { ResultScreen } from './screens/ResultScreen.tsx'
import { TitleScreen } from './screens/TitleScreen.tsx'

/** 지금 어느 화면에 있는지. 싱글과 대전은 서로 다른 엔진을 쓴다 */
type Route = 'title' | 'solo' | 'lobby' | 'collection' | 'loopback'

/**
 * 개발 중에만 열리는 입구. `?loopback=1`이면 한 화면에서 방장과 참가자를 함께 돌린다.
 * WebRTC 없이 대전을 확인할 수 있는 유일한 길이라, 대전을 만질 때는 여기서 먼저 본다.
 */
function initialRoute(): Route {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('loopback')) {
    return 'loopback'
  }
  return 'title'
}

function App() {
  const [route, setRoute] = useState<Route>(initialRoute)
  const { engine, state } = useGameEngine()
  const match = useMatchSession()

  const startSolo = useCallback(() => {
    if (engine === null) {
      return
    }
    // 판마다 단어 순서가 달라지도록 시드를 새로 뽑는다
    engine.reseed(Date.now() >>> 0)
    engine.startRun()
    setRoute('solo')
  }, [engine])

  const backToTitle = useCallback(() => {
    match.leave()
    setRoute('title')
  }, [match])

  if (route === 'loopback') {
    return <LoopbackScreen onBack={() => setRoute('title')} />
  }

  if (route === 'collection') {
    return (
      <CollectionScreen
        collected={state?.collected ?? []}
        onBack={() => setRoute('title')}
      />
    )
  }

  if (route === 'lobby') {
    const phase = match.phase
    if (phase?.kind === 'playing' && match.state !== null) {
      return (
        <MatchScreen engine={phase.engine} state={match.state} onLeave={backToTitle} />
      )
    }
    return <LobbyScreen phase={phase} onOpen={match.open} onBack={backToTitle} />
  }

  if (route === 'title' || engine === null || state === null) {
    return (
      <TitleScreen
        onStart={startSolo}
        onMultiplayer={() => setRoute('lobby')}
        onCollection={() => setRoute('collection')}
        ready={engine !== null && state !== null}
      />
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <GameScreen engine={engine} state={state} />
      {state.phase === 'over' && (
        <ResultScreen
          stats={state.stats}
          onRestart={startSolo}
          onHome={() => setRoute('title')}
        />
      )}
    </div>
  )
}

export { App }
