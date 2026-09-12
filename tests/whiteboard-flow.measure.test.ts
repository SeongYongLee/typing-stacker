/// <reference types="node" />
import { afterEach, beforeEach, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { installRecallExperiment, installStageExperiment } from './helpers/recallFlowExperiment.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { FrameClock } from './helpers/frameClock.ts'

const enabled = process.env.MEASURE_FLOW === '1'
const clock = new FrameClock()
let restoreStage = () => {}
beforeEach(() => { if (enabled) clock.install() })
afterEach(() => { restoreStage(); if (enabled) clock.uninstall() })

it.skipIf(!enabled)('records comparable recall-flow runs without changing physics or granting items', {timeout:300_000}, async () => {
  restoreStage=installStageExperiment(process.env.FLOW_VARIANT??'baseline')
  const profiles=process.env.FLOW_PROFILE==='pressure'?['pressure']:['steady','slow']
  const rows = []
  for (const profile of profiles) {
    for(let index=0;index<12;index++) {
      const seed=20260913+Number(process.env.FLOW_SEED_OFFSET??0)+index*7919
      const engine=await GameEngine.create(seed)
      let snapshot:GameState|null=null
      engine.onStateChange(next=>{snapshot=next})
      let merges=0, firstMerge:number|null=null, drops=0, alarms=0
      let elapsed=0, blocked=0, active=0, firstRecall:number|null=null, firstClear:number|null=null, nextAction=0
      const words=new Set<string>(), results=new Set<string>()
      let previousRush=false
      let craftedRecalls=0, firstStageSeconds=0, firstStageMerges=0
      const craftedIds = new Set<string>()
      engine.onEvent(event=>{if(event.kind==='merge'){merges++;firstMerge??=elapsed;if((snapshot as GameState|null)?.stage.id===1)firstStageMerges++} if(event.kind==='drop' && event.source==='input')drops++})
      const afterStart=installRecallExperiment(engine,process.env.FLOW_VARIANT??'baseline')
      engine.startRun(false)
      afterStart()
      for(const recipe of RECIPES)for(const result of [recipe.result,...recipe.hiddenResults])craftedIds.add(result.label)
      while(elapsed<180) {
        await clock.advance(0.1, 1000/60)
        elapsed+=0.1
        const state=snapshot as GameState|null
        if(!state)continue
        if(state.phase==='over')break
        if(state.stage.totalReturns>0)firstRecall??=elapsed
        if(state.stage.id>1)firstClear??=elapsed
        if(state.mergeReveal)results.add(state.mergeReveal.label)
        if(state.stage.congestionRush && !previousRush)alarms++
        previousRush=state.stage.congestionRush
        if(state.phase!=='playing')continue
        active+=0.1
        if(state.stage.id===1)firstStageSeconds+=0.1
        if(state.activeWhiteboard.length===0)blocked+=0.1
        if(elapsed<nextAction)continue
        const recall=state.activeWhiteboard[0]
        const word=state.words.find(w=>w.state==='active')
        if(recall){if(craftedIds.has(recall))craftedRecalls++;engine.submit(recall);nextAction=elapsed+(profile==='steady'?0.9:profile==='pressure'?3.2:1.8);continue}
        // Both bots use the same simple central aiming rule, not an optimal planner.
        if(word && (Math.abs(state.aimNormalized)<0.35 || word.y>0.85)) {
          words.add(word.word)
          engine.submit(word.word)
          nextAction=elapsed+(profile==='steady'?0.9:profile==='pressure'?3.2:1.8)+word.word.length*(profile==='steady'?0.08:profile==='pressure'?0.35:0.22)
        }
      }
      const end=snapshot as unknown as GameState
      rows.push({profile,seed,seconds:+elapsed.toFixed(1),active:+active.toFixed(1),blockedFraction:active?blocked/active:0,firstRecall,firstMerge,firstClear,returns:end.stage.totalReturns,craftedRecalls,firstStageSeconds,firstStageMerges,drops,uniqueWords:words.size,merges,uniqueMerges:results.size,alarms,censored:end.phase!=='over'})
      engine.dispose()
    }
  }
  expect(rows.every(row=>row.drops>0)).toBe(true)
  const output={label:process.env.FLOW_LABEL??'current',baseCommit:'b3aaccb',variant:process.env.FLOW_VARIANT??'baseline',seedOffset:Number(process.env.FLOW_SEED_OFFSET??0),secondsLimit:180,rows}
  if(process.env.FLOW_OUTPUT)writeFileSync(process.env.FLOW_OUTPUT,JSON.stringify(output,null,2)+'\n')
  for(const profile of profiles) {
    const group=rows.filter(r=>r.profile===profile)
    const mean=(key:'returns'|'seconds'|'blockedFraction'|'uniqueWords'|'merges')=>group.reduce((sum,r)=>sum+r[key],0)/group.length
    console.log(JSON.stringify({profile,returns:mean('returns'),seconds:mean('seconds'),blockedFraction:mean('blockedFraction'),uniqueWords:mean('uniqueWords'),merges:mean('merges'),noRecall:group.filter(r=>r.firstRecall===null).length,clears:group.filter(r=>r.firstClear!==null).length}))
  }
})
