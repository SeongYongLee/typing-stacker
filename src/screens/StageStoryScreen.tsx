import { useEffect, useRef, useState } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { WORDS } from '../game/data/words.ts'
import type { StageStory } from './stageStories.ts'
import './StageStoryScreen.css'

export function StageStoryScreen({ story, touch, onFinish }: { story: StageStory; touch: boolean; onFinish: () => void }) {
  const [line, setLine] = useState(0)
  const next = useRef<HTMLButtonElement>(null)
  const current = story.lines[line]!
  const last = line === story.lines.length - 1
  const item = WORDS.find(entry => entry.word === story.item)?.variants[0]
  useEffect(() => { next.current?.focus() }, [])
  return <section className="stage-story" role="dialog" aria-modal="true" aria-labelledby="stage-story-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onFinish() }
    if ((event.key === 'Enter' || event.key === ' ') && event.repeat) event.preventDefault()
    if (event.key === 'Tab') {
      const buttons=Array.from(event.currentTarget.querySelectorAll('button'))
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()
    }
  }}>
    <div className="stage-story-scene" aria-hidden="true"><div className="stage-story-window" /><div className="stage-story-counter" />{item && <img src={item.sprite} alt="" />}</div>
    <div className="stage-story-sheet">
      <div className="stage-story-heading"><span>분실물 보관소 · {story.time}</span><span>{line+1} / {story.lines.length}</span></div>
      <h1 id="stage-story-title">{story.title}</h1>
      <p className="stage-story-setting">{story.setting}</p>
      <div className="stage-story-dialogue" key={line} aria-live="polite"><span>{current.speaker}</span><p>{current.text}</p></div>
      <div className="stage-story-actions">
        <MenuButton onClick={onFinish}>건너뛰기</MenuButton>
        <button ref={next} type="button" className="menu-button" data-primary="yes" onClick={() => last ? onFinish() : setLine(line+1)}>{last ? '정리 시작' : '다음 이야기'}{!touch && <small>Enter</small>}</button>
      </div>
    </div>
  </section>
}
