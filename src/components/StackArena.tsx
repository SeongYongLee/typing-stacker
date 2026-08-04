import { useEffect, useRef } from 'react'
import type { GameEngine } from '../game/core/GameEngine.ts'

interface StackArenaProps {
  engine: GameEngine
}

/**
 * 물리 아레나만 canvas다. 낙하 단어와 입력창은 DOM으로 남긴다.
 * 캔버스는 낙하 레인 뒤까지 화면 전체를 덮는다 — 받침대에서 튕겨 나간 물건과
 * 히든 연출이 아레나 점선 밖에서도 잘리지 않고 보여야 한다.
 */
function StackArena({ engine }: StackArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    engine.attachCanvas(canvas)

    const observer = new ResizeObserver(() => engine.handleResize())
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      engine.detachCanvas()
    }
  }, [engine])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

export { StackArena }
