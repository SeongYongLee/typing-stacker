import { useEffect, useRef } from 'react'
import type { GameEngine } from '../game/core/GameEngine.ts'

interface StackArenaProps {
  engine: GameEngine
}

/** 물리 아레나만 canvas다. 낙하 단어와 입력창은 DOM으로 남긴다. */
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
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

export { StackArena }
