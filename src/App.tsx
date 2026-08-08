import { useCallback, useState } from 'react'
import type { BgmTrackName } from './audio/tracks.ts'
import type { GamePhase } from './game/types/game.ts'
import { useAudioBoot, useMusic } from './hooks/useAudio.ts'
import { useGameEngine } from './hooks/useGameEngine.ts'
import { useMatchSession } from './hooks/useMatchSession.ts'
import { CollectionScreen } from './screens/CollectionScreen.tsx'
import { NameScreen } from './screens/NameScreen.tsx'
import { OptionsScreen } from './screens/OptionsScreen.tsx'
import { GameScreen } from './screens/GameScreen.tsx'
import { LobbyScreen } from './screens/LobbyScreen.tsx'
import { LoopbackScreen } from './screens/LoopbackScreen.tsx'
import { MatchScreen } from './screens/MatchScreen.tsx'
import { ResultScreen } from './screens/ResultScreen.tsx'
import { TitleScreen } from './screens/TitleScreen.tsx'

/** 지금 어느 화면에 있는지. 싱글과 대전은 서로 다른 엔진을 쓴다 */
type Route = 'title' | 'solo' | 'lobby' | 'collection' | 'options' | 'name' | 'loopback'

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

/**
 * 지금 흐를 곡.
 *
 * 판이 도는 동안에만 게임 곡이고, 멈춘 곳(일시정지 · 결과)은 조용하다 —
 * 화면이 멈췄는데 음악만 계속 돌면 판이 아직 도는 것처럼 들린다.
 *
 * 옵션이 타이틀 곡을 쓰는 이유는, 소리 설정을 만지는 자리에서 음악이 끊기면
 * 방금 바꾼 것 때문인지 원래 그런 것인지 알 수 없기 때문이다.
 */
function musicFor(
  route: Route,
  soloPhase: GamePhase | null,
  matchPhase: 'playing' | 'over' | null,
): BgmTrackName | null {
  switch (route) {
    case 'loopback':
      return null
    case 'collection':
      return 'collection'
    case 'options':
    case 'name':
      return 'title'
    case 'title':
      return 'title'
    case 'lobby':
      // 판이 시작되기 전(방 만들기·준비)에는 대기방 곡이 흐른다
      return matchPhase === null ? 'lobby' : matchPhase === 'playing' ? 'game' : null
    case 'solo':
      return soloPhase === 'playing' ? 'game' : null
  }
}

function App() {
  const [route, setRoute] = useState<Route>(initialRoute)
  const { engine, state, assetProgress } = useGameEngine()
  const match = useMatchSession()

  // 첫 제스처를 기다렸다 소리를 연다. 브라우저가 그 전에는 내주지 않는다
  useAudioBoot()
  /*
   * 어느 화면에서 무엇이 흐르는지를 여기 한 곳에 모은다.
   *
   * 화면마다 각자 정하게 두면 어느 쪽이 마지막으로 렌더됐는지에 따라 곡이 갈리고,
   * 화면 구조를 바꿀 때마다 그 순서가 조용히 뒤집힌다. 무엇보다 "지금 무슨 곡이
   * 나와야 하는가"는 한눈에 읽혀야 하는 규칙이다.
   */
  useMusic(musicFor(route, state?.phase ?? null, match.state?.phase ?? null))

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

  if (route === 'name') {
    // 옵션에서 들어왔으니 옵션으로 돌아간다 — 들어온 문으로 나가야 길을 잃지 않는다
    return <NameScreen onBack={() => setRoute('options')} />
  }

  if (route === 'options') {
    return (
      <OptionsScreen onBack={() => setRoute('title')} onName={() => setRoute('name')} />
    )
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
    return (
      <LobbyScreen
        phase={phase}
        onOpen={match.open}
        onReady={match.setReady}
        onBack={backToTitle}
      />
    )
  }

  if (route === 'title' || engine === null || state === null) {
    return (
      <TitleScreen
        onStart={startSolo}
        onMultiplayer={() => setRoute('lobby')}
        onCollection={() => setRoute('collection')}
        onOptions={() => setRoute('options')}
        ready={engine !== null && state !== null && assetProgress >= 1}
        progress={assetProgress}
      />
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <GameScreen
        engine={engine}
        state={state}
        onRestart={startSolo}
        onHome={backToTitle}
      />
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
