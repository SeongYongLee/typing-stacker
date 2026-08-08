import { useCallback, useEffect, useState } from 'react'
import { SOLO_READY_MS, SOLO_START_MS } from './game/config.ts'
import { SoloStart, type SoloStep } from './components/SoloStart.tsx'
import { useAudioBoot, useMusic } from './hooks/useAudio.ts'
import { musicFor, type Route } from './screenMusic.ts'
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
  /** 혼자 하기가 열리기 전의 박자. null이면 판이 이미 돌고 있거나 다른 화면이다 */
  const [soloStep, setSoloStep] = useState<SoloStep | null>(null)
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

  /*
   * 혼자 하기는 READY → START 두 박자를 거쳐 연다. 이유는 `SOLO_READY_MS`에.
   *
   * 바로 시작하면 첫 단어가 이미 내려오고 있다 — 누른 손은 아직 마우스나 Enter에
   * 있고 자판으로 옮길 틈이 없다. 다시 하기도 마찬가지라 같은 길로 보낸다.
   *
   * 그동안 판을 만들지 않는다. `startRun()`을 먼저 부르고 화면만 덮으면 그 사이에
   * 단어가 내려오고 시간이 흐른다 — 기다려주는 것이 아니라 눈만 가리는 것이 된다.
   */
  const startSolo = useCallback(() => {
    if (engine === null) {
      return
    }
    setRoute('solo')
    setSoloStep('ready')
  }, [engine])

  useEffect(() => {
    if (soloStep === null || engine === null) {
      return
    }
    const timer = setTimeout(
      () => {
        if (soloStep === 'ready') {
          setSoloStep('start')
          return
        }
        // 판마다 단어 순서가 달라지도록 시드를 새로 뽑는다
        engine.reseed(Date.now() >>> 0)
        engine.startRun()
        setSoloStep(null)
      },
      soloStep === 'ready' ? SOLO_READY_MS : SOLO_START_MS,
    )
    return () => clearTimeout(timer)
  }, [soloStep, engine])

  const backToTitle = useCallback(() => {
    match.leave()
    // 이걸 끄지 않으면 타이틀로 나온 뒤에 판이 저 혼자 열린다
    setSoloStep(null)
    setRoute('title')
  }, [match])

  if (route === 'loopback') {
    return <LoopbackScreen onBack={() => setRoute('title')} />
  }

  if (route === 'name') {
    return <NameScreen onBack={() => setRoute('title')} />
  }

  if (route === 'options') {
    return <OptionsScreen onBack={() => setRoute('title')} />
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
        onName={() => setRoute('name')}
        onMultiplayer={() => setRoute('lobby')}
        onCollection={() => setRoute('collection')}
        onOptions={() => setRoute('options')}
        ready={engine !== null && state !== null && assetProgress >= 1}
        progress={assetProgress}
      />
    )
  }

  /*
   * 그동안에는 판을 덮지 않고 **대신** 보여준다.
   * 아래에 GameScreen을 그대로 두면 다시 하기에서 지난 판의 탑과 결과 화면이
   * 낱말 뒤로 비친다 — 새로 시작하는 자리인데 지난 판이 남아 있는 셈이다.
   */
  if (soloStep !== null) {
    return <SoloStart step={soloStep} />
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
