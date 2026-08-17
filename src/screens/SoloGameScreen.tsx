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
}

function CreditsOverlay({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center',
        background: 'rgba(7, 10, 18, 0.88)', color: '#fff7d7', textAlign: 'center',
      }}
    >
      <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 36 }}>모든 주인을 찾았습니다</h1>
        <p style={{ margin: 0, fontSize: 18, color: '#d7d9e7' }}>수상한 분실물 보관소</p>
        <button
          type="button"
          onClick={onContinue}
          style={{ padding: '11px 18px', border: '1px solid #f6d76f', borderRadius: 5, background: '#2b2730', color: '#fff7d7', fontSize: 17, fontWeight: 700 }}
        >
          계속 정리하기
        </button>
      </div>
    </div>
  )
}

export { SoloGameScreen }
