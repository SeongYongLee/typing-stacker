import { useEffect, useRef } from 'react'
import backgroundDay from '../assets/splash/background-day.webp'
import backgroundNight from '../assets/splash/background-night.webp'
import type { TitleTheme } from '../screens/titleTheme.ts'
import { StartBackdrop } from './StartBackdrop.tsx'
import './DoorEntrance.css'

/** Keep the simulation unstarted until the entrance has finished. */
export function DoorEntrance({ theme, onFinish }: { theme: TitleTheme; onFinish: () => void }) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.focus()
    const timer = window.setTimeout(onFinish, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1800)
    return () => window.clearTimeout(timer)
  }, [onFinish])
  const background = theme === 'day' ? backgroundDay : backgroundNight
  return <div className="door-entrance" data-theme={theme} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onFinish() }
    if (event.key === 'Tab') { event.preventDefault(); button.current?.focus() }
    if (event.repeat) event.preventDefault()
  }}>
    <div className="door-entrance__room" aria-hidden="true"><StartBackdrop>{null}</StartBackdrop></div>
    <div className="door-entrance__outside" aria-hidden="true">
      <div className="door-entrance__art">
        <img className="door-entrance__frame" src={background} alt="" />
        <div className="door-entrance__leaf door-entrance__leaf--left"><img src={background} alt="" /></div>
        <div className="door-entrance__leaf door-entrance__leaf--right"><img src={background} alt="" /></div>
      </div>
    </div>
    <button ref={button} className="door-entrance__skip" type="button" onClick={onFinish}>바로 들어가기</button>
    <span className="sr-only" role="status">보관소 문을 열고 있습니다</span>
  </div>
}
