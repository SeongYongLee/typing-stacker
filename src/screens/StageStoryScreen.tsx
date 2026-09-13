import { useEffect, useRef, useState } from 'react'
import { SoloStart, type SoloStep } from '../components/SoloStart.tsx'
import { SOLO_READY_MS, SOLO_START_MS } from '../game/config/time.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { StageStoryScene } from './StageStoryScene.tsx'
import type { StageStory } from './stageStories.ts'
import './StageStoryScreen.css'

export function StageStoryScreen({ story, touch, onFinish, onPrepare }: { story: StageStory; touch: boolean; onFinish: () => void; onPrepare: () => void }) {
  const [preparing, setPreparing] = useState<SoloStep | 'input' | null>(null)
  const finish = useRef(onFinish)
  useEffect(() => { finish.current = onFinish }, [onFinish])
  const [line, setLine] = useState(0)
  const [arriving, setArriving] = useState(true)
  const next = useRef<HTMLButtonElement>(null)
  const current = story.lines[line]!
  const last = line === story.lines.length - 1
  useEffect(() => {
    const timer = window.setTimeout(() => setArriving(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2400)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => { next.current?.focus() }, [arriving, preparing])
  useEffect(() => {
    if (preparing === null || preparing === 'input') return
    const timer = window.setTimeout(() => {
      if (preparing === 'ready') setPreparing('start')
      else if (touch) setPreparing('input')
      else finish.current()
    }, preparing === 'ready' ? SOLO_READY_MS : SOLO_START_MS)
    return () => window.clearTimeout(timer)
  }, [preparing, touch])
  const prepare = () => { onPrepare(); setPreparing('ready') }
  return <section className="stage-story" data-preparing={preparing !== null} data-arriving={arriving} data-evening={story.time.startsWith('오후 4') || story.time.startsWith('오후 5') ? 'early' : 'late'} role="dialog" aria-modal="true" aria-labelledby="stage-story-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (preparing === null) prepare() }
    if ((event.key === 'Enter' || event.key === ' ') && event.repeat) event.preventDefault()
    if (event.key === 'Tab') {
      const buttons=Array.from(event.currentTarget.querySelectorAll('button'))
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()
    }
  }}>
    {preparing === null && <StageStoryScene story={story} />}
    {preparing !== null ? <div className="stage-story-start" aria-live="polite">
      <h1 id="stage-story-title" className="sr-only">정리를 시작합니다</h1>
      {preparing === 'input'
        ? <button ref={next} type="button" className="menu-button" data-primary="yes" onClick={onFinish}>입력하고 시작</button>
        : <SoloStart step={preparing} />}
    </div> : arriving ? <div className="stage-story-arrival">
      <span className="stage-story-arrival-label">보관소의 하루</span>
      <p className="stage-story-arrival-time">{story.time}</p>
      <h1 id="stage-story-title">{story.title}</h1>
      <p className="stage-story-arrival-visitor">{story.visitor}</p>
      <button ref={next} type="button" className="menu-button" onClick={() => setArriving(false)}>이야기 보기{!touch && <small>Enter</small>}</button>
    </div> : <div className="stage-story-sheet">
      <div className="stage-story-heading"><span>분실물 보관소 · {story.time}</span><span>{line+1} / {story.lines.length}</span></div>
      <h1 id="stage-story-title">{story.title}</h1>
      <p className="stage-story-setting">{story.setting}</p>
      <div className="stage-story-dialogue" key={line} aria-live="polite"><span>{current.speaker}</span><p>{current.text}</p></div>
      <div className="stage-story-actions">
        <MenuButton onClick={prepare}>건너뛰기</MenuButton>
        <button ref={next} type="button" className="menu-button" data-primary="yes" onClick={() => last ? prepare() : setLine(line+1)}>{last ? '정리 시작' : '다음 이야기'}{!touch && <small>Enter</small>}</button>
      </div>
    </div>}
  </section>
}
