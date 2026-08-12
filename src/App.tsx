import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { SOLO_READY_MS, SOLO_START_MS } from './game/config/time.ts'
import { SoloStart, type SoloStep } from './components/SoloStart.tsx'
import { SplashBackdrop } from './components/SplashBackdrop.tsx'
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
import { TitleScreen } from './screens/TitleScreen.tsx'
import { titleThemeForHour, type TitleTheme } from './screens/titleTheme.ts'
import { displaySettings, updateDisplaySettings } from './game/renderer/displayPrefs.ts'
import type { GamePhase } from './game/types/game.ts'
import type { Phase } from './game/systems/DayNight.ts'

const loadCollectionScreen = () => import('./screens/CollectionScreen.tsx')
const loadNameScreen = () => import('./screens/NameScreen.tsx')
const loadOptionsScreen = () => import('./screens/OptionsScreen.tsx')
const loadSoloGameScreen = () => import('./screens/SoloGameScreen.tsx')
const loadLoopbackScreen = () => import('./screens/LoopbackScreen.tsx')
const loadMultiplayerScreen = () => import('./screens/MultiplayerScreen.tsx')
const loadSoloRulesScreen = () => import('./screens/SoloRulesScreen.tsx')

const CollectionScreen = lazy(() => loadCollectionScreen().then((module) => ({
  default: module.CollectionScreen,
})))
const NameScreen = lazy(() => loadNameScreen().then((module) => ({ default: module.NameScreen })))
const OptionsScreen = lazy(() => loadOptionsScreen().then((module) => ({
  default: module.OptionsScreen,
})))
const SoloGameScreen = lazy(() => loadSoloGameScreen().then((module) => ({
  default: module.SoloGameScreen,
})))
const LoopbackScreen = lazy(() => loadLoopbackScreen().then((module) => ({
  default: module.LoopbackScreen,
})))
const MultiplayerScreen = lazy(() => loadMultiplayerScreen().then((module) => ({
  default: module.MultiplayerScreen,
})))
const SoloRulesScreen = lazy(() => loadSoloRulesScreen().then((module) => ({
  default: module.SoloRulesScreen,
})))

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

type SoloStage = 'rules' | SoloStep

function openingSoloStage(): SoloStage {
  return displaySettings().soloRules ? 'rules' : 'ready'
}

function DeferredRoute({ children, theme }: { children: ReactNode; theme: TitleTheme }) {
  return (
    <Suspense fallback={<RouteLoading theme={theme} />}>
      {children}
    </Suspense>
  )
}

function RouteLoading({ theme }: { theme: TitleTheme }) {
  return (
    <SplashBackdrop theme={theme} animated={false}>
      <span className="sr-only">화면을 불러오는 중입니다</span>
    </SplashBackdrop>
  )
}

function App() {
  const [route, setRoute] = useState<Route>(initialRoute)
  // 스플래시 그림과 음악이 같은 낮·밤을 쓰고, 머무는 동안 갑자기 바뀌지 않게 고정한다
  const [titleTheme, setTitleTheme] = useState<TitleTheme>(() => (
    titleThemeForHour(new Date().getHours())
  ))
  /** 규칙 확인부터 시작 신호까지. null이면 판이 이미 돌고 있거나 다른 화면이다 */
  const [soloStage, setSoloStage] = useState<SoloStage | null>(null)
  const [splashTransition, setSplashTransition] = useState<SplashTransitionPhase>('idle')
  /** 타이틀의 핵심 그림보다 게임 자산 요청이 먼저 대역폭을 차지하지 않게 한다. */
  const [titleReady, setTitleReady] = useState(false)
  const [matchPhase, setMatchPhase] = useState<'playing' | 'over' | null>(null)
  const [soloMusic, setSoloMusic] = useState<{
    phase: GamePhase | null
    timeOfDay: Phase | null
  }>({ phase: null, timeOfDay: null })
  const enableGameLoading = useCallback(() => setTitleReady(true), [])
  const { engine, stateStore, ready, assetProgress } = useGameEngine(titleReady)

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
    soloPhase: soloMusic.phase,
    soloTimeOfDay: soloMusic.timeOfDay,
    matchPhase,
  }))

  /*
   * 혼자 하기는 규칙을 확인한 뒤 READY → START 두 박자를 거쳐 연다.
   *
   * 매 판 규칙 화면을 거친다. 다시 하기도 같은 길로 보내야 첫 판과 재시작의 시작
   * 조건이 갈리지 않고, 게임 시작 버튼을 누른 뒤에는 손을 자판으로 옮길 틈이 생긴다.
   *
   * 그동안 판을 만들지 않는다. `startRun()`을 먼저 부르고 화면만 덮으면 그 사이에
   * 단어가 내려오고 시간이 흐른다 — 기다려주는 것이 아니라 눈만 가리는 것이 된다.
   */
  const startSolo = useCallback(() => {
    if (engine === null || splashTransition !== 'idle') {
      return
    }
    void Promise.all([loadSoloGameScreen(), loadSoloRulesScreen()])
    if (route === 'title') {
      // 문이 끼익 열리는 동안 스플래시를 검게 가린 뒤, 검은 틈에서 화면을 바꾼다
      setSplashTransition('darkening')
      return
    }
    setRoute('solo')
    setSoloStage(openingSoloStage())
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
        setSoloStage(openingSoloStage())
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

  const beginSolo = useCallback(() => {
    setSoloStage('ready')
  }, [])

  const hideRulesAndBeginSolo = useCallback(() => {
    updateDisplaySettings({ soloRules: false })
    setSoloStage('ready')
  }, [])

  useEffect(() => {
    if (soloStage === null || soloStage === 'rules' || engine === null) {
      return
    }
    const timer = setTimeout(
      () => {
        if (soloStage === 'ready') {
          setSoloStage('start')
          return
        }
        // 판마다 단어 순서가 달라지도록 시드를 새로 뽑는다
        engine.reseed(Date.now() >>> 0)
        engine.startRun()
        setSoloStage(null)
      },
      soloStage === 'ready' ? SOLO_READY_MS : SOLO_START_MS,
    )
    return () => clearTimeout(timer)
  }, [soloStage, engine])

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
  const [lastSolo, setLastSolo] = useState<SoloStage | null>(soloStage)
  const [liftSeq, setLiftSeq] = useState(0)
  /** 걷는 중인가. 다 걷히면 덮개를 뗀다 — 판 내내 남겨둘 이유가 없다 */
  const [lifting, setLifting] = useState(false)
  if (soloStage !== lastSolo) {
    setLastSolo(soloStage)
    if (soloStage === null && lastSolo !== null) {
      setLifting(true)
      setLiftSeq((seq) => seq + 1)
    }
  }

  const openTitle = useCallback(() => {
    // 타이틀에 머무는 동안은 고정하되, 다시 들어올 때는 지금 시각을 새로 읽는다
    setTitleTheme(titleThemeForHour(new Date().getHours()))
    setSplashTransition('idle')
    setMatchPhase(null)
    setRoute('title')
  }, [])

  const backToTitle = useCallback(() => {
    // 이걸 끄지 않으면 타이틀로 나온 뒤에 판이 저 혼자 열린다
    setSoloStage(null)
    openTitle()
  }, [openTitle])

  const openMultiplayer = useCallback(() => {
    void loadMultiplayerScreen()
    setRoute('lobby')
  }, [])

  const updateSoloMusic = useCallback((phase: GamePhase, timeOfDay: Phase) => {
    setSoloMusic((before) => (
      before.phase === phase && before.timeOfDay === timeOfDay
        ? before
        : { phase, timeOfDay }
    ))
  }, [])

  if (route === 'loopback') {
    return (
      <DeferredRoute theme={titleTheme}>
        <LoopbackScreen onBack={openTitle} />
      </DeferredRoute>
    )
  }

  if (route === 'name') {
    return (
      <DeferredRoute theme={titleTheme}>
        <NameScreen onBack={openTitle} />
      </DeferredRoute>
    )
  }

  if (route === 'options') {
    return (
      <DeferredRoute theme={titleTheme}>
        <OptionsScreen onBack={openTitle} />
      </DeferredRoute>
    )
  }

  if (route === 'collection') {
    return (
      <DeferredRoute theme={titleTheme}>
        <CollectionScreen
          collected={stateStore?.getSnapshot()?.collected ?? []}
          onBack={openTitle}
        />
      </DeferredRoute>
    )
  }

  if (route === 'lobby') {
    return (
      <DeferredRoute theme={titleTheme}>
        <MultiplayerScreen
          theme={titleTheme}
          onBack={backToTitle}
          onPhaseChange={setMatchPhase}
        />
      </DeferredRoute>
    )
  }

  if (route === 'title' || engine === null || stateStore === null) {
    return (
      <>
        <TitleScreen
          onStart={startSolo}
          onName={() => setRoute('name')}
          onMultiplayer={openMultiplayer}
          onCollection={() => setRoute('collection')}
          onOptions={() => setRoute('options')}
          ready={ready && assetProgress >= 1}
          progress={assetProgress}
          theme={titleTheme}
          onReady={enableGameLoading}
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
  if (soloStage !== null) {
    return (
      <>
        <StartBackdrop>
          {soloStage === 'rules' ? (
            <Suspense fallback={null}>
              <SoloRulesScreen onStart={beginSolo} onHideAndStart={hideRulesAndBeginSolo} />
            </Suspense>
          ) : (
            <SoloStart step={soloStage} />
          )}
        </StartBackdrop>
        <SplashTransition phase={splashTransition} />
      </>
    )
  }

  return (
    <Suspense fallback={<StartBackdrop><span /></StartBackdrop>}>
      <div style={{ position: 'relative', height: '100%' }}>
        <SoloGameScreen
          engine={engine}
          stateStore={stateStore}
          onRestart={startSolo}
          onHome={backToTitle}
          onSceneChange={updateSoloMusic}
        />
        {/* 시작 박자의 어둠을 이어받아 걷고, 다 걷히면 떼어낸다 */}
        {lifting && <StartCurtain key={liftSeq} onDone={() => setLifting(false)} />}
      </div>
    </Suspense>
  )
}

export { App }
