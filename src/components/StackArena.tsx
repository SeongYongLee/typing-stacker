import { useLayoutEffect, useRef } from 'react'
/**
 * 캔버스를 붙이고 크기를 알려주는 것만 필요하다.
 * 싱글(GameEngine)과 대전(MatchEngine)이 같은 아레나를 쓰므로 구조로만 받는다.
 */
interface ArenaHost {
  attachCanvas(canvas: HTMLCanvasElement): void
  detachCanvas(): void
  handleResize(): void
}

interface StackArenaProps {
  engine: ArenaHost
}

/**
 * 물리 아레나만 canvas다. 낙하 단어와 입력창은 DOM으로 남긴다.
 * 캔버스는 낙하 레인 뒤까지 화면 전체를 덮는다 — 받침대에서 튕겨 나간 물건과
 * 히든 연출이 아레나 점선 밖에서도 잘리지 않고 보여야 한다.
 */
function StackArena({ engine }: StackArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 첫 페인트 뒤에 붙이면 준비 화면이 사라진 직후 빈 캔버스가 한 프레임 보인다.
  useLayoutEffect(() => {
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
