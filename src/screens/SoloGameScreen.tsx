import { flushSync } from 'react-dom'
import { StageStoryScreen } from './StageStoryScreen.tsx'
import { STAGE_STORIES } from './stageStories.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { useEffect, useState, useSyncExternalStore, lazy, Suspense } from 'react'
import type { GameEngine } from '../game/core/GameEngine.ts'
import type { EngineStateStore } from '../hooks/useGameEngine.ts'
import { GameArena } from '../components/GameArena.tsx'
import { GameScreen } from './GameScreen.tsx'
import { ResultScreen } from './ResultScreen.tsx'
import type { Phase } from '../game/systems/DayNight.ts'
import type { GamePhase } from '../game/types/game.ts'

import { useTooNarrow, useMobileControls } from '../hooks/useViewport.ts'
const MobileGameScreen = lazy(() => import('./MobileGameScreen.tsx').then(({ MobileGame, MobileViewport }) => ({
  default: ({ engine, stateStore, onHome, onRestart, children, touch, arena, three }: Pick<SoloGameScreenProps, 'engine' | 'stateStore' | 'onHome' | 'onRestart'> & { children: React.ReactNode; touch: boolean; arena: React.ReactNode; three: boolean }) =>
    <MobileViewport engine={engine} touch={touch}><MobileGame arena={arena} windowLight={!three} showMergeToast={!three} touch={touch} engine={engine} store={stateStore} onHome={onHome} onRestart={onRestart} />{children}</MobileViewport>,
})))

interface SoloGameScreenProps {
  engine: GameEngine
  stateStore: EngineStateStore
  onRestart: () => void
  onStartGame: () => void
  onReplayTutorial: () => void
  onHome: () => void
  onSceneChange: (phase: GamePhase, timeOfDay: Phase) => void
}

/**
 * 매 프레임 바뀌는 엔진 상태의 React 경계.
 * 이 컴포넌트 밖의 App·타이틀·라우팅은 프레임 스냅샷을 구독하지 않는다.
 */
function SoloGameScreen({
  engine,
  stateStore,
  onRestart,
  onStartGame,
  onReplayTutorial,
  onHome,
  onSceneChange,
}: SoloGameScreenProps) {
  // The three-column field needs 676px; retain room for the HUD as well.
  const [three, setThree] = useState(false)
  const narrow = useTooNarrow(800)
  const preferredTouch = useMobileControls()
  // Apply control changes to the next run, preserving an open pause/options menu.
  const [touch] = useState(preferredTouch)
  const state = useSyncExternalStore(
    stateStore.subscribe,
    stateStore.getSnapshot,
    stateStore.getSnapshot,
  )
  const phase = state?.phase
  const timeOfDay = state?.timeOfDay.phase

  useEffect(() => {
    if (phase !== undefined && timeOfDay !== undefined) onSceneChange(phase, timeOfDay)
  }, [phase, timeOfDay, onSceneChange])

  if (state === null) return null

  const story = STAGE_STORIES[state.stage.id]

  const arena = <GameArena engine={engine} compact={narrow || touch} onThreeChange={setThree} />
  const overlays = (
    <>
      {state.stage.storyOpen && story && (<StageStoryScreen key={`${state.runSeq}-${state.stage.id}`} story={story} touch={touch} onPrepare={() => engine.previewStageStoryArena()} onFinish={() => {
        flushSync(() => engine.finishStageStory(touch))
        document.querySelector<HTMLInputElement>('[data-game-word-input], input[aria-label="단어 입력"]')?.focus()
      }} />)}
      {state.phase === 'credits' && <CreditsOverlay onContinue={() => engine.continueEndless()} />}
      {state.phase === 'over' && (
        <ResultScreen
          stats={state.stats}
          freshlyCollected={state.freshlyCollected}
          totalReturns={state.stage.totalReturns}
          congestionDemo={state.stage.congestionDemo === 'over'}
          onRestart={onRestart}
          onStartGame={onStartGame}
          onReplayTutorial={onReplayTutorial}
          onHome={onHome}
        />
      )}
    </>
  )
  if (narrow || touch) return <Suspense fallback={null}><MobileGameScreen arena={arena} three={three} touch={touch} engine={engine} stateStore={stateStore} onHome={onHome} onRestart={onRestart}>{overlays}</MobileGameScreen></Suspense>
  return <><GameScreen arena={arena} windowLight={!three} engine={engine} state={state} onRestart={onRestart} onHome={onHome} />{overlays}</>
}

function CreditsOverlay({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center',
        background: 'rgba(7, 10, 18, 0.88)', color: '#fff7d7', textAlign: 'center',
      }}
    >
      <div className="paper-sheet" style={{ display: 'grid', gap: 18, justifyItems: 'center', maxWidth: 'calc(100% - 32px)' }}>
        <h1 className="office-heading" style={{ margin: 0, fontSize: 36 }}>모든 주인을 찾았습니다</h1>
        <p style={{ margin: 0, fontSize: 18, color: 'var(--ink-muted)' }}>수상한 분실물 보관소</p>
        <MenuButton primary selected
          onClick={onContinue}
        >
          계속 정리하기
        </MenuButton>
      </div>
    </div>
  )
}

export { SoloGameScreen }
