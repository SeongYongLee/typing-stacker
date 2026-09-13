import { expect, it } from 'vitest'
import type { GameEngine } from '../../src/game/core/GameEngine.ts'
import { RECIPES } from '../../src/game/data/recipes.ts'
import { VARIANT_BY_ID, WORDS } from '../../src/game/data/words.ts'
import { installRecallExperiment } from './helpers/recallFlowExperiment.ts'

function fixture() {
  const recipe=RECIPES.find(recipe=>recipe.result.id==='fried-egg')!
  const selected=WORDS.find(entry=>entry.word==='계란')!
  const counts=new Map<string,number>()
  const game={elapsed:0,stageId:1,recipeFlow:{focus:recipe},physics:{countsByVariant:()=>counts},whiteboardTargets:[VARIANT_BY_ID.get('study-book')!],whiteboardWords:['책'],spawner:{pickEntry:()=>selected}}
  installRecallExperiment(game as unknown as GameEngine,'focus-request')()
  return {game,counts,selected}
}
it('links an offered recipe without changing the selected word',()=>{
  const {game,selected}=fixture()
  expect(game.spawner.pickEntry()).toBe(selected)
  expect(game.whiteboardWords).toEqual(['계란 프라이'])
})
it('does not replace a currently recallable request',()=>{
  const {game,counts}=fixture()
  counts.set('study-book',1)
  game.spawner.pickEntry()
  expect(game.whiteboardWords).toEqual(['책'])
})
it('does not churn a linked request when the internal focus moves',()=>{
  const {game}=fixture()
  game.spawner.pickEntry()
  game.recipeFlow.focus={...game.recipeFlow.focus,result:VARIANT_BY_ID.get('study-book')!}
  game.elapsed=29
  game.spawner.pickEntry()
  expect(game.whiteboardWords).toEqual(['계란 프라이'])
  game.elapsed=31
  game.spawner.pickEntry()
  expect(game.whiteboardWords).toEqual(['책'])
})
