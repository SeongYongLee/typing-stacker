import { useLayoutEffect, useRef } from 'react'
import type { GameEngine } from '../game/core/GameEngine.ts'
import type { Arena3DRenderer } from '../game/renderer/three/Arena3DRenderer.ts'
import './GameArena.css'

/** Renderer changes preserve the engine, physics and current run. */
export function GameArena({ engine, compact, onThreeChange }: {
  engine: GameEngine; compact: boolean; onThreeChange(ready: boolean): void
}) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = host.current
    if (root === null) return
    let disposed = false
    let canvas: HTMLCanvasElement | null = null
    let three: Arena3DRenderer | null = null
    const lost = (event: Event) => {
      event.preventDefault()
      if (!disposed) fallback()
    }
    const clear = () => {
      canvas?.removeEventListener('webglcontextlost', lost)
      engine.detachCanvas()
      three = null
      root.replaceChildren()
    }
    const makeCanvas = (label?: string) => {
      const element = document.createElement('canvas')
      if (label) element.setAttribute('aria-label', label)
      else element.setAttribute('aria-hidden', 'true')
      root.append(element)
      return element
    }
    const fallback = () => {
      clear()
      canvas = makeCanvas('상자와 쌓인 물건')
      root.dataset.rendererMode = '2d'
      engine.attachCanvas(canvas, compact)
      onThreeChange(false)
    }
    fallback()
    const observer = new ResizeObserver(() => engine.handleResize())
    observer.observe(root)
    void import('../game/renderer/three/Arena3DRenderer.ts').then(({ Arena3DRenderer }) => {
      if (disposed) return
      clear()
      canvas = makeCanvas('상자와 쌓인 물건')
      const overlay = makeCanvas()
      try {
        three = new Arena3DRenderer(canvas, overlay, {
          style: 'flat', yaw: 0, colliders: false, night: null,
          compact, backgroundAlignment: 'bottom',
        })
        three.setJelly(0.65)
        canvas.addEventListener('webglcontextlost', lost)
        engine.attachRenderer(three)
        root.dataset.rendererMode = '3d'
        onThreeChange(true)
      } catch {
        three?.dispose()
        fallback()
      }
    }).catch(() => { if (!disposed) fallback() })
    return () => {
      disposed = true
      observer.disconnect()
      clear()
    }
  }, [engine, compact, onThreeChange])
  return <div className="game-arena" ref={host} />
}
