import { useEffect, useState } from 'react'
import { GameEngine, type GameState } from '../game/core/GameEngine.ts'

interface UseGameEngine {
  readonly engine: GameEngine | null
  readonly state: GameState | null
}

/**
 * React는 껍데기이고 게임은 GameEngine이 소유한다.
 * 엔진이 프레임마다 onStateChange로 스냅샷을 밀어주고, React는 그것만 그린다.
 */
function useGameEngine(): UseGameEngine {
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const [state, setState] = useState<GameState | null>(null)

  useEffect(() => {
    let disposed = false
    let created: GameEngine | null = null

    // 시드 자체는 매 세션 달라야 하므로 경계에서만 시간을 쓴다.
    // 시드가 정해진 뒤로는 모든 난수가 재현 가능하다 (1대1 멀티 대비).
    void GameEngine.create(Date.now() >>> 0).then((instance) => {
      if (disposed) {
        instance.dispose()
        return
      }
      created = instance
      instance.onStateChange(setState)
      setEngine(instance)
    })

    return () => {
      disposed = true
      created?.dispose()
      setEngine(null)
    }
  }, [])

  useEffect(() => {
    if (engine === null) {
      return
    }
    const onResize = () => engine.handleResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [engine])

  return { engine, state }
}

export { useGameEngine }
