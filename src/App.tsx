import { useCallback } from 'react'
import { useGameEngine } from './hooks/useGameEngine.ts'
import { GameScreen } from './screens/GameScreen.tsx'
import { ResultScreen } from './screens/ResultScreen.tsx'
import { TitleScreen } from './screens/TitleScreen.tsx'

function App() {
  const { engine, state } = useGameEngine()

  const start = useCallback(() => {
    if (engine === null) {
      return
    }
    // 판마다 단어 순서가 달라지도록 시드를 새로 뽑는다
    engine.reseed(Date.now() >>> 0)
    engine.startRun()
  }, [engine])

  if (engine === null || state === null) {
    return <TitleScreen onStart={start} ready={false} />
  }

  if (state.phase === 'title') {
    return <TitleScreen onStart={start} ready />
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <GameScreen engine={engine} state={state} />
      {state.phase === 'over' && (
        <ResultScreen stats={state.stats} onRestart={start} />
      )}
    </div>
  )
}

export { App }
