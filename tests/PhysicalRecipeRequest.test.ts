import { expect, it } from 'vitest'
import { RECIPES } from '../src/game/data/recipes.ts'
import { physicalRecipeRequest } from './helpers/PhysicalRecipeRequest.ts'

it('does not request a result from an empty board or one copy of a two-copy ingredient',()=>{
  expect(physicalRecipeRequest(new Map(),[])).toBeNull()
  const recipe=RECIPES.find(r=>r.inputs.length===2&&r.inputs[0]===r.inputs[1])!
  expect(recipe).toBeDefined()
  expect(physicalRecipeRequest(new Map([[recipe.inputs[0]!,1]]),[])?.id).not.toBe(recipe.result.id)
  expect(physicalRecipeRequest(new Map([[recipe.inputs[0]!,2]]),[])?.id).toBe(recipe.result.id)
})
it('does not duplicate a request that is already on the board',()=>{
  const recipe=RECIPES[0]!
  const counts=new Map<string,number>()
  for(const id of recipe.inputs)counts.set(id,(counts.get(id)??0)+1)
  expect(physicalRecipeRequest(counts,[recipe.result])?.id).not.toBe(recipe.result.id)
})

it('preserves ready requests and keeps a linked slot stable while leaving word supply unchanged',async()=>{
  const {installRecallExperiment}=await import('./helpers/recallFlowExperiment.ts')
  const {VARIANT_BY_ID,WORDS}=await import('../src/game/data/words.ts')
  const recipe=RECIPES.find(r=>r.result.id==='fried-egg')!
  const counts=new Map<string,number>()
  for(const id of recipe.inputs)counts.set(id,(counts.get(id)??0)+1)
  const selected=WORDS[0]!
  const book=VARIANT_BY_ID.get('study-book')!
  const game={elapsed:0,stageId:1,physics:{countsByVariant:()=>counts},whiteboardTargets:[book],whiteboardWords:[book.label],spawner:{pickEntry:()=>selected}}
  type GameEngine=import('../src/game/core/GameEngine.ts').GameEngine
  installRecallExperiment(game as unknown as GameEngine,'physical-request')()
  counts.set(book.id,1)
  expect(game.spawner.pickEntry()).toBe(selected)
  expect(game.whiteboardTargets[0]).toBe(book)
  counts.delete(book.id)
  expect(game.spawner.pickEntry()).toBe(selected)
  expect(game.whiteboardTargets[0]).toBe(recipe.result)
  counts.clear()
  game.elapsed=29
  game.spawner.pickEntry()
  expect(game.whiteboardTargets[0]).toBe(recipe.result)
})
