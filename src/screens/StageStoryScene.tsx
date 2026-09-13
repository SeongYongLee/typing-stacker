import { WORDS } from '../game/data/words.ts'
import type { StageStory } from './stageStories.ts'
import './StageStoryScreen.css'

/** The entrance and dialogue share the same room, camera and props. */
export function StageStoryScene({ story }: { story: StageStory }) {
  const item = WORDS.find(entry => entry.word === story.item)?.variants[0]
  const early = story.time.startsWith('오후 4') || story.time.startsWith('오후 5')
  return <div className="stage-story-room" data-evening={early ? 'early' : 'late'} aria-hidden="true">
    <div className="stage-story-scene">
      <div className="stage-story-window"><div className="stage-story-rain" /></div>
      <div className="stage-story-lamp" /><div className="stage-story-light" />
      <div className="stage-story-sign">분실물 보관소<small>돌아갈 곳이 있는 물건들</small></div>
      <div className="stage-story-counter" />
      {item && <img src={item.sprite} alt="" />}
    </div>
  </div>
}
