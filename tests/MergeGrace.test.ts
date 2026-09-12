import { expect, it } from 'vitest'
import { MergeGrace } from '../src/game/systems/MergeGrace.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import type { ContactGraph } from '../src/game/systems/Merger.ts'
const graph = (ids = ['padlock', 'quill-feather', 'study-book'], edges: [number, number][] = [[0,1],[1,2]]): ContactGraph => ({
  nodes: ids.map((variantId, itemId) => ({ variantId, itemId })), edges,
})
it('merges a plain pair immediately and does not wait for distant or unrelated objects', () => {
  for (const g of [graph(['padlock','quill-feather'], [[0,1]]), graph(undefined, [[0,1]]), graph(['padlock','quill-feather','egg'])]) {
    const grace = new MergeGrace()
    expect(grace.choose(g, RECIPES)?.recipe.result.id).toBe('secret-diary')
    expect(grace.view).toBeNull()
  }
})
it('waits for attached extra ingredients then prefers the completed larger recipe', () => {
  const grace = new MergeGrace()
  expect(grace.choose(graph(), RECIPES)).toBeNull()
  expect(grace.view?.itemIds).toEqual([0,1,2])
  grace.advance(0.4)
  expect(grace.view?.progress).toBeCloseTo(0.4)
  const full = graph(['padlock','quill-feather','study-book','stardust'], [[0,1],[1,2],[2,3]])
  expect(grace.choose(full, RECIPES)?.recipe.result.id).toBe('magic-book')
  // Also prioritize a complete large recipe on the very first check.
  expect(new MergeGrace().choose(full, RECIPES)?.recipe.result.id).toBe('magic-book')
})
it('does not renew the deadline and finishes the small recipe at expiry', () => {
  const grace = new MergeGrace()
  grace.choose(graph(), RECIPES)
  for (let i = 0; i < 4; i++) { grace.advance(0.2); expect(grace.choose(graph(), RECIPES)).toBeNull() }
  grace.advance(0.21)
  expect(grace.choose(graph(), RECIPES)?.recipe.result.id).toBe('secret-diary')
  grace.advance(0.2); expect(grace.view).toBeNull()
})
it('releases immediately when extra ingredients detach and cancels when the pair breaks', () => {
  const grace = new MergeGrace()
  grace.choose(graph(), RECIPES)
  expect(grace.choose(graph(undefined, [[0,1]]), RECIPES)?.recipe.result.id).toBe('secret-diary')
  grace.reset(); grace.choose(graph(), RECIPES)
  expect(grace.choose(graph(undefined, [[1,2]]), RECIPES)).toBeNull()
  grace.advance(0.2); expect(grace.view).toBeNull()
})
it('does not block an independent merge elsewhere', () => {
  const grace = new MergeGrace()
  grace.choose(graph(), RECIPES)
  const g = graph(['padlock','quill-feather','study-book','egg','frying-pan'], [[0,1],[1,2],[3,4]])
  expect(grace.choose(g, RECIPES)?.recipe.result.id).toBe('fried-egg')
  expect(grace.view?.itemIds).toEqual([0,1,2])
})
it('freezes without time advancement and clears pending hints on restart', () => {
  const grace = new MergeGrace()
  grace.choose(graph(), RECIPES); grace.advance(0.3)
  const before = grace.view
  grace.choose(graph(), RECIPES)
  expect(grace.view).toEqual(before)
  grace.reset(); expect(grace.view).toBeNull()
  grace.choose(graph(), RECIPES); expect(grace.view?.progress).toBe(0)
})
it.each(['lucky-flowerpot','magic-book','space-poster'])('protects the actual %s recipe', result => {
  const recipe = RECIPES.find(r => r.result.id === result)!
  const full = graph([...recipe.inputs], recipe.inputs.slice(1).map((_, i) => [i, i+1]))
  expect(new MergeGrace().choose(full, RECIPES)?.recipe.result.id).toBe(result)
})
