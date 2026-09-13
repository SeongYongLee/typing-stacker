import { useEffect, useRef, useState } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { WORDS } from '../game/data/words.ts'
import type { StageStory } from './stageStories.ts'
import './StageStoryScreen.css'

export function StageStoryScreen({ story, touch, onFinish }: { story: StageStory; touch: boolean; onFinish: () => void }) {
  const [line, setLine] = useState(0)
  const [arriving, setArriving] = useState(true)
  const next = useRef<HTMLButtonElement>(null)
  const current = story.lines[line]!
  const last = line === story.lines.length - 1
  const item = WORDS.find(entry => entry.word === story.item)?.variants[0]
  useEffect(() => {
    const timer = window.setTimeout(() => setArriving(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2400)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => { next.current?.focus() }, [arriving])
  return <section className="stage-story" data-arriving={arriving} data-evening={story.time.startsWith('오후 4') || story.time.startsWith('오후 5') ? 'early' : 'late'} role="dialog" aria-modal="true" aria-labelledby="stage-story-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onFinish() }
    if ((event.key === 'Enter' || event.key === ' ') && event.repeat) event.preventDefault()
    if (event.key === 'Tab') {
      const buttons=Array.from(event.currentTarget.querySelectorAll('button'))
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()
    }
  }}>
    <div className="stage-story-scene" aria-hidden="true"><div className="stage-story-window"><div className="stage-story-rain" /></div><div className="stage-story-lamp" /><div className="stage-story-light" /><div className="stage-story-sign">분실물 보관소<small>돌아갈 곳이 있는 물건들</small></div><div className="stage-story-counter" />{item && <img src={item.sprite} alt="" />}</div>
    {arriving ? <div className="stage-story-arrival">
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
        <MenuButton onClick={onFinish}>건너뛰기</MenuButton>
        <button ref={next} type="button" className="menu-button" data-primary="yes" onClick={() => last ? onFinish() : setLine(line+1)}>{last ? '정리 시작' : '다음 이야기'}{!touch && <small>Enter</small>}</button>
      </div>
    </div>}
  </section>
}
