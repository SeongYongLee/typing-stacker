import { useEffect, useSyncExternalStore } from 'react'
import type { GameEngine } from '../game/core/GameEngine.ts'
import type { EngineStateStore } from '../hooks/useGameEngine.ts'
import { GameScreen } from './GameScreen.tsx'
import { ResultScreen } from './ResultScreen.tsx'
import type { Phase } from '../game/systems/DayNight.ts'
import type { GamePhase } from '../game/types/game.ts'

interface SoloGameScreenProps {
  engine: GameEngine
  stateStore: EngineStateStore
  onRestart: () => void
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
  onHome,
  onSceneChange,
}: SoloGameScreenProps) {
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

  return (
    <>
      <GameScreen engine={engine} state={state} onRestart={onRestart} onHome={onHome} />
      {state.phase === 'over' && (
        <ResultScreen
          stats={state.stats}
          freshlyCollected={state.freshlyCollected}
          onRestart={onRestart}
          onHome={onHome}
        />
      )}
    </>
  )
}

export { SoloGameScreen }
