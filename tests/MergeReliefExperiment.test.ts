import {afterEach,beforeEach,expect,it} from 'vitest'
import {GameEngine,type GameState} from '../src/game/core/GameEngine.ts'
import type {PhysicsWorld} from '../src/game/physics/PhysicsWorld.ts'
import {RECIPES} from '../src/game/data/recipes.ts'
import {VARIANT_BY_ID} from '../src/game/data/words.ts'
import {ARENA} from '../src/game/config.ts'
import {FrameClock} from './helpers/frameClock.ts'
import {installRecallExperiment} from './helpers/recallFlowExperiment.ts'
const clock=new FrameClock()
let engine:GameEngine,state:GameState
beforeEach(async()=>{clock.install();engine=await GameEngine.create(93);engine.onStateChange(next=>{state=next});engine.startRun(false)})
afterEach(()=>{engine.dispose();clock.uninstall()})
function merge(congestion:number,tutorial=false){
  const game=engine as unknown as {loop:{stop():void};physics:PhysicsWorld;stageId:number;congestion:number;congestionRushLeft:number;tryMerge():void;emit():void}
  game.loop.stop()
  game.congestion=congestion;game.congestionRushLeft=10
  if(tutorial)game.stageId=0
  const recipe=RECIPES.find(r=>r.inputs.length===2&&r.inputs[0]===r.inputs[1])!
  const item=VARIANT_BY_ID.get(recipe.inputs[0]!)!
  game.physics.spawnItemAt(item,0,ARENA.platformTop+.5,'solo')
  for(let i=0;i<90;i++)game.physics.step(1/60)
  const first=game.physics.frames()[0]!
  game.physics.spawnItemAt(item,first.x,first.y+.35,'solo')
  for(let i=0;i<90;i++)game.physics.step(1/60)
  game.tryMerge();game.emit()
  expect(state.mergeReveal).not.toBeNull()
  expect(game.congestionRushLeft).toBe(10)
  return game
}
it.each([[40,25,15],[3,0,3],[0,0,0]])('real merge at %i congestion leaves %i and reports %i recovery',(before,after,amount)=>{
  merge(before)
  expect(state.stage.congestion).toBe(after)
  expect(state.stats.rawScore).toBeGreaterThan(0)
  expect(state.stage.congestionRecovery).toEqual(amount?{amount,combo:false,crafted:true}:null)
})
it('does not add relief to the tutorial',()=>{merge(40,true);expect(state.stage.congestion).toBe(40)})
it('historical control measurements disable relief',()=>{
  installRecallExperiment(engine,'goal-10')()
  merge(40)
  expect(state.stage.congestion).toBe(40)
})
