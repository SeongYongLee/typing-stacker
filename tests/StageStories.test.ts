import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {GameEngine,type GameState} from '../src/game/core/GameEngine.ts'
import {FrameClock} from './helpers/frameClock.ts'
import {STAGE_STORIES} from '../src/screens/stageStories.ts'
import type {SoloStageId} from '../src/game/data/soloStages.ts'
const clock=new FrameClock()
let engine:GameEngine,state:GameState
beforeEach(async()=>{clock.install();engine=await GameEngine.create(17);engine.setStageStoriesEnabled(true);engine.onStateChange(next=>{state=next})})
afterEach(()=>{engine.dispose();clock.uninstall()})
it('holds time and words until story completion, then resumes exactly once',async()=>{
 engine.startRun(false)
 expect(state.stage.storyOpen).toBe(true)
 await clock.advance(20)
 expect(state.stats.durationSec).toBe(0)
 expect(state.words).toHaveLength(0)
 engine.finishStageStory()
 expect(state.phase).toBe('playing')
 engine.finishStageStory(true)
 expect(state.phase).toBe('playing')
 await clock.advance(4)
 expect(state.stats.durationSec).toBeGreaterThan(0)
 expect(state.words.length).toBeGreaterThan(0)
})
it('opens a story for each normal stage and waits for mobile input when requested',()=>{
 engine.startRun(false)
 const internal=engine as unknown as {enterStage(id:SoloStageId):void;emit():void}
 for(const id of [1,2,3,4,5] as const){
   internal.enterStage(id);internal.emit()
   expect(STAGE_STORIES[id]?.lines).toHaveLength(3)
   expect(state.stage.storyOpen).toBe(true)
   engine.finishStageStory(true)
   expect(state.phase).toBe('paused')
   engine.resume();expect(state.phase).toBe('playing')
 }
})
it('does not replace the tutorial and resets story on restart and title',()=>{
 engine.startRun(false);engine.toTitle();expect(state.stage.storyOpen).toBe(false)
 engine.startRun(true);expect(state.stage.storyOpen).toBe(false)
 engine.startRun(false);expect(state.stage.storyOpen).toBe(true)
})

it('does not redraw the hidden arena during a story and resumes drawing afterwards',async()=>{
 const draw=vi.fn()
 const internal=engine as unknown as {renderer:unknown}
 internal.renderer={draw,dispose:vi.fn()}
 engine.startRun(false)
 await clock.advance(1)
 expect(draw).not.toHaveBeenCalled()
 engine.finishStageStory()
 await clock.advance(.1)
 expect(draw).toHaveBeenCalled()
})
