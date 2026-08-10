import { useCallback, useEffect, useState } from 'react'
import { SOLO_READY_MS, SOLO_START_MS } from './game/config.ts'
import { SoloStart, type SoloStep } from './components/SoloStart.tsx'
import { StartBackdrop } from './components/StartBackdrop.tsx'
import { StartCurtain } from './components/StartCurtain.tsx'
import {
  SplashTransition,
  SPLASH_COVERED_MS,
  SPLASH_DARKEN_MS,
  SPLASH_REVEAL_MS,
  type SplashTransitionPhase,
} from './components/SplashTransition.tsx'
import { useAudioBoot, useMusic, useSplashDoor } from './hooks/useAudio.ts'
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
import { titleThemeForHour, type TitleTheme } from './screens/titleTheme.ts'

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
  // 스플래시 그림과 음악이 같은 낮·밤을 쓰고, 머무는 동안 갑자기 바뀌지 않게 고정한다
  const [titleTheme, setTitleTheme] = useState<TitleTheme>(() => (
    titleThemeForHour(new Date().getHours())
  ))
  /** 혼자 하기가 열리기 전의 박자. null이면 판이 이미 돌고 있거나 다른 화면이다 */
  const [soloStep, setSoloStep] = useState<SoloStep | null>(null)
  const [splashTransition, setSplashTransition] = useState<SplashTransitionPhase>('idle')
  const { engine, state, assetProgress } = useGameEngine()
  const match = useMatchSession()

  // 첫 제스처를 기다렸다 소리를 연다. 브라우저가 그 전에는 내주지 않는다
  useAudioBoot()
  // 검어지는 동안 문을 열고, 완전히 가려 화면을 바꾸는 순간 쿵 닫는다
  useSplashDoor(splashTransition === 'darkening' || splashTransition === 'covered')
  /*
   * 어느 화면에서 무엇이 흐르는지를 여기 한 곳에 모은다.
   *
   * 화면마다 각자 정하게 두면 어느 쪽이 마지막으로 렌더됐는지에 따라 곡이 갈리고,
   * 화면 구조를 바꿀 때마다 그 순서가 조용히 뒤집힌다. 무엇보다 "지금 무슨 곡이
   * 나와야 하는가"는 한눈에 읽혀야 하는 규칙이다.
   */
  useMusic(musicFor({
    route,
    titleTheme,
    soloPhase: state?.phase ?? null,
    soloTimeOfDay: state?.timeOfDay.phase ?? null,
    matchPhase: match.state?.phase ?? null,
  }))

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
    if (engine === null || splashTransition !== 'idle') {
      return
    }
    if (route === 'title') {
      // 문이 끼익 열리는 동안 스플래시를 검게 가린 뒤, 검은 틈에서 화면을 바꾼다
      setSplashTransition('darkening')
      return
    }
    setRoute('solo')
    setSoloStep('ready')
  }, [engine, route, splashTransition])

  useEffect(() => {
    if (splashTransition === 'idle') {
      return
    }
    const timer = setTimeout(() => {
      if (splashTransition === 'darkening') {
        setSplashTransition('covered')
        return
      }
      if (splashTransition === 'covered') {
        setRoute('solo')
        setSoloStep('ready')
        setSplashTransition('revealing')
        return
      }
      setSplashTransition('idle')
    }, splashTransition === 'darkening'
      ? SPLASH_DARKEN_MS
      : splashTransition === 'covered'
        ? SPLASH_COVERED_MS
        : SPLASH_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [splashTransition])

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

  /*
   * 시작 박자에서 판으로 넘어온 순간마다 오른다.
   *
   * 그때 `StartBackdrop`이 덮고 있던 어둠을 `StartCurtain`이 이어받아 걷는다. 넘어가는
   * 것은 **화면이 갈리는 순간**이지 판의 상태가 아니라서, `state.phase`로는 잡을 수
   * 없다 — 다시 하기든 첫 판이든 여기가 유일하게 한 번씩만 지나는 자리다.
   *
   * **이펙트가 아니라 렌더 중에 판단한다.** `useEffect`로 미뤘더니 판이 열린 첫
   * 프레임이 어둠 없이 한 번 그려지고 그다음에 0.7이 덮였다 — 밝게 번쩍였다가
   * 어두워졌다가 다시 밝아지는 것이라 이으려고 만든 것이 가장 심하게 끊었다. 브라우저가
   * 그 프레임을 그리느냐 마느냐가 타이밍에 달려 있어서 **가끔만** 나타났다.
   *
   * 렌더 중에 값을 바꾸면 React가 화면에 그리기 전에 이 컴포넌트를 다시 돌린다 —
   * 어둠 없는 프레임이 아예 생기지 않는다. `useLayoutEffect`도 그리기 전이지만
   * 자식까지 한 번 붙였다 떼므로, 여기서는 더 이른 이 자리가 맞다.
   */
  const [lastSolo, setLastSolo] = useState<SoloStep | null>(soloStep)
  const [liftSeq, setLiftSeq] = useState(0)
  /** 걷는 중인가. 다 걷히면 덮개를 뗀다 — 판 내내 남겨둘 이유가 없다 */
  const [lifting, setLifting] = useState(false)
  if (soloStep !== lastSolo) {
    setLastSolo(soloStep)
    if (soloStep === null && lastSolo !== null) {
      setLifting(true)
      setLiftSeq((seq) => seq + 1)
    }
  }

  const openTitle = useCallback(() => {
    // 타이틀에 머무는 동안은 고정하되, 다시 들어올 때는 지금 시각을 새로 읽는다
    setTitleTheme(titleThemeForHour(new Date().getHours()))
    setSplashTransition('idle')
    setRoute('title')
  }, [])

  const backToTitle = useCallback(() => {
    match.leave()
    // 이걸 끄지 않으면 타이틀로 나온 뒤에 판이 저 혼자 열린다
    setSoloStep(null)
    openTitle()
  }, [match, openTitle])

  if (route === 'loopback') {
    return <LoopbackScreen onBack={openTitle} />
  }

  if (route === 'name') {
    return <NameScreen onBack={openTitle} />
  }

  if (route === 'options') {
    return <OptionsScreen onBack={openTitle} />
  }

  if (route === 'collection') {
    return (
      <CollectionScreen
        collected={state?.collected ?? []}
        onBack={openTitle}
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
        onChat={match.sendChat}
        onBack={backToTitle}
      />
    )
  }

  if (route === 'title' || engine === null || state === null) {
    return (
      <>
        <TitleScreen
          onStart={startSolo}
          onName={() => setRoute('name')}
          onMultiplayer={() => setRoute('lobby')}
          onCollection={() => setRoute('collection')}
          onOptions={() => setRoute('options')}
          ready={engine !== null && state !== null && assetProgress >= 1}
          progress={assetProgress}
          theme={titleTheme}
        />
        <SplashTransition phase={splashTransition} />
      </>
    )
  }

  /*
   * 그동안에는 판을 덮지 않고 **대신** 보여준다.
   * 아래에 GameScreen을 그대로 두면 다시 하기에서 지난 판의 탑과 결과 화면이
   * 낱말 뒤로 비친다 — 새로 시작하는 자리인데 지난 판이 남아 있는 셈이다.
   *
   * 뒤에 까는 것은 **방 그림 하나뿐**이다(`StartBackdrop`). 판의 상태를 하나도
   * 안 들고 있어서 위의 제약에 걸리지 않으면서, 손을 올리는 그 몇 초가 빈 화면이
   * 아니라 들어가는 구간이 된다.
   */
  if (soloStep !== null) {
    return (
      <>
        <StartBackdrop>
          <SoloStart step={soloStep} />
        </StartBackdrop>
        <SplashTransition phase={splashTransition} />
      </>
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
      {/* 시작 박자의 어둠을 이어받아 걷고, 다 걷히면 떼어낸다 */}
      {lifting && <StartCurtain key={liftSeq} onDone={() => setLifting(false)} />}
      {state.phase === 'over' && (
        <ResultScreen
          stats={state.stats}
          onRestart={startSolo}
          onHome={openTitle}
        />
      )}
    </div>
  )
}

export { App }
