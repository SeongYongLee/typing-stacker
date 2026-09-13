import { useEffect, useLayoutEffect, useRef } from 'react'
import './RoomLight.css'
import { canvasPixelRatio } from '../game/renderer/canvasResolution.ts'

/** Shared window lighting for preparation, countdown and Canvas gameplay screens. */
export function RoomLight({ nightfall, className = 'arena-room-light' }: {
  nightfall: number; className?: string
}) {
  const brightness = useRef(nightfall)
  const invalidate = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    brightness.current = Math.max(0, Math.min(1, nightfall))
    invalidate.current?.()
  }, [nightfall])
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    void Promise.all([
      import('three'),
      import('../game/renderer/three/WindowLight3D.ts'),
      import('../game/renderer/three/projection.ts'),
    ]).then(([{ WebGLRenderer, Scene, OrthographicCamera }, { WindowLight3D }, { arenaProjection }]) => {
      const element = canvas.current
      if (disposed || element === null) return
      let renderer: InstanceType<typeof WebGLRenderer>
      try { renderer = new WebGLRenderer({ canvas: element, alpha: true, antialias: true }) }
      catch { return }
      const light = new WindowLight3D()
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
      scene.add(light.group)
      renderer.setClearColor(0, 0)
      const reduced = matchMedia('(prefers-reduced-motion: reduce)')
      let width = 1, height = 1, dpr = 1, frame = 0, last = -Infinity, lost = false
      const paint = (now: number) => {
        frame = 0
        if (disposed || lost || document.hidden) return
        if (now - last >= 1000 / 30) {
          last = now
          const p = arenaProjection(width, height, 0)
          Object.assign(camera, { left: -p.halfWidth, right: p.halfWidth, top: p.halfHeight, bottom: -p.halfHeight })
          camera.position.set(0, p.centerY, 20)
          camera.lookAt(0, p.centerY, 0)
          camera.updateProjectionMatrix()
          light.update(width, height, 0, 0, { width, height, offsetX: 0, offsetY: 0, alignment: 'bottom' },
            brightness.current, now / 1000, reduced.matches, dpr)
          renderer.render(scene, camera)
          element.dataset.ready = 'true'
          element.dataset.nightfall = String(brightness.current)
        }
        if (!reduced.matches) frame = requestAnimationFrame(paint)
      }
      const restart = () => { cancelAnimationFrame(frame); last = -Infinity; frame = requestAnimationFrame(paint) }
      const resize = () => {
        const rect = element.getBoundingClientRect()
        width = Math.max(1, rect.width); height = Math.max(1, rect.height)
        dpr = canvasPixelRatio(width, height, Math.min(1.5, window.devicePixelRatio))
        renderer.setPixelRatio(dpr); renderer.setSize(width, height, false)
        restart()
      }
      const contextLost = (event: Event) => {
        event.preventDefault(); lost = true; cancelAnimationFrame(frame)
        element.dataset.ready = 'false'
      }
      const observer = new ResizeObserver(resize)
      observer.observe(element)
      element.addEventListener('webglcontextlost', contextLost)
      document.addEventListener('visibilitychange', restart)
      reduced.addEventListener('change', restart)
      invalidate.current = () => { if (reduced.matches) restart() }
      resize()
      cleanup = () => {
        invalidate.current = null
        cancelAnimationFrame(frame); observer.disconnect()
        element.removeEventListener('webglcontextlost', contextLost)
        document.removeEventListener('visibilitychange', restart)
        reduced.removeEventListener('change', restart)
        light.dispose(); renderer.dispose(); element.dataset.ready = 'false'
      }
    }).catch(() => { /* The original room image remains usable without WebGL. */ })
    return () => { disposed = true; cleanup() }
  }, [])
  return <canvas ref={canvas} className={`room-light ${className}`} data-room-light="3d" aria-hidden="true" />
}
