import { craftKeyOf, type Recipe } from '../../src/game/data/recipes.ts'
import type { GameEngine } from '../../src/game/core/GameEngine.ts'
import type { ItemVariant, WordEntry } from '../../src/game/types/game.ts'
import type { Rng } from '../../src/game/systems/Rng.ts'
import { featuredEntries, soloStage, type SoloStageId } from '../../src/game/data/soloStages.ts'
import { recallIngredient, reachableRecallIds } from './RecallSupply.ts'
import { physicalRecipeRequest } from './PhysicalRecipeRequest.ts'

/** Deliberately test-only: exploratory rules must not silently become live game rules. */
export function installRecallExperiment(engine: GameEngine, variant: string) {
  const game=engine as unknown as {
    elapsed:number
    congestion:number
    mergeCongestionRelief:number
    recipeFlow:{focus:Recipe|null}
    stageId:SoloStageId
    whiteboardCandidates:readonly ItemVariant[]
    whiteboardTargets:ItemVariant[]
    whiteboardWords:string[]
    rng:Rng
    recipeCounts:Map<string,number>
    physics:{countsByVariant():ReadonlyMap<string,number>}
    spawner:{pickEntry:(candidates:readonly WordEntry[])=>WordEntry}
    refillWhiteboard():void
  }
  game.mergeCongestionRelief=variant==='merge-relief'?15:0
  if(variant==='targets-only'||variant==='request-supply') {
    game.refillWhiteboard=()=>{
      if(game.stageId===0)return
      const reachable=reachableRecallIds(featuredEntries(soloStage(game.stageId)))
      const candidates=game.whiteboardCandidates.filter(item=>reachable.has(item.id))
      if(game.whiteboardTargets.length===0) {
        const hidden=candidates.filter(item=>item.hidden)
        if(hidden.length)game.whiteboardTargets.push(hidden[game.rng.int(hidden.length)]!)
      }
      while(game.whiteboardTargets.length<3) {
        const available=candidates.filter(item=>!item.hidden&&!game.whiteboardTargets.some(target=>target.id===item.id))
        if(!available.length)break
        game.whiteboardTargets.push(available[game.rng.int(available.length)]!)
      }
      game.whiteboardWords=game.whiteboardTargets.map(item=>item.label)
    }
  }
  // startRun creates a new spawner, so supply interception must be installed afterwards.
  return ()=>{
    if(variant==='physical-request') {
      const original=game.spawner.pickEntry
      let linked:string|null=null, linkedAt=0, stage=game.stageId
      game.spawner.pickEntry=candidates=>{
        const selected=original(candidates)
        if(stage!==game.stageId){linked=null;stage=game.stageId}
        if(game.stageId===0)return selected
        const counts=game.physics.countsByVariant()
        if(linked && !game.whiteboardTargets.some(item=>item.id===linked))linked=null
        const slot=linked?game.whiteboardTargets.findIndex(item=>item.id===linked):0
        const current=game.whiteboardTargets[slot]
        if(!current || (counts.get(current.id)??0)>0 || (linked && game.elapsed-linkedAt<30))return selected
        const requested=physicalRecipeRequest(counts,game.whiteboardTargets)
        if(requested){
          game.whiteboardTargets[slot]=requested
          linked=requested.id
          linkedAt=game.elapsed
          game.whiteboardWords=game.whiteboardTargets.map(item=>item.label)
        }
        return selected
      }
      return
    }
    if(variant==='focus-request') {
      const original=game.spawner.pickEntry
      let linked:string|null=null, linkedAt=0, stage=game.stageId
      game.spawner.pickEntry=candidates=>{
        const selected=original(candidates)
        if(stage!==game.stageId){linked=null;stage=game.stageId}
        const focus=game.recipeFlow.focus
        const base=selected.variants.find(item=>!item.hidden)
        // Only link a recipe whose ingredient was actually offered, not ambient words.
        if(game.stageId===0 || !focus || !base || !focus.inputs.some(id=>craftKeyOf(id)===craftKeyOf(base.id)))return selected
        if(linked && !game.whiteboardTargets.some(item=>item.id===linked))linked=null
        const slot=linked ? game.whiteboardTargets.findIndex(item=>item.id===linked) : 0
        const current=game.whiteboardTargets[slot]
        const ready=current && (game.physics.countsByVariant().get(current.id)??0)>0
        if(!ready && (!linked || game.elapsed-linkedAt>=30) && !game.whiteboardTargets.some(item=>item.id===focus.result.id)) {
          game.whiteboardTargets[slot]=focus.result
          linked=focus.result.id
          linkedAt=game.elapsed
          game.whiteboardWords=game.whiteboardTargets.map(item=>item.label)
        }
        return selected
      }
      return
    }
    if(variant!=='supply-only'&&variant!=='request-supply')return
    const original=game.spawner.pickEntry
    let offers=0,stage=game.stageId
    game.spawner.pickEntry=candidates=>{
      if(stage!==game.stageId){offers=0;stage=game.stageId}
      offers++
      if(game.stageId>0 && offers%3===0 && !game.whiteboardTargets.some(target=>(game.physics.countsByVariant().get(target.id)??0)>0)) {
        const requested=recallIngredient(game.whiteboardTargets,game.recipeCounts,candidates)
        if(requested)return requested
      }
      return original(candidates)
    }
  }
}

/** Isolated numeric experiments; always restore the shared stage data after a test. */
export function installStageExperiment(variant: string): () => void {
  const stage=soloStage(1) as unknown as {returnTarget:number;congestionDrops:number}
  const original={returnTarget:stage.returnTarget,congestionDrops:stage.congestionDrops}
  // Freeze the old baseline even after an accepted tuning reaches the live config.
  stage.returnTarget=variant==='goal-10'||variant==='focus-request'||variant==='stage2-18'||variant==='physical-request'||variant==='merge-relief'?10:20
  stage.congestionDrops=variant==='alarm-5'?5:10
  const second=soloStage(2) as unknown as {returnTarget:number}
  const secondOriginal=second.returnTarget
  if(variant==='stage2-18')second.returnTarget=18
  return ()=>{Object.assign(stage,original);second.returnTarget=secondOriginal}
}
