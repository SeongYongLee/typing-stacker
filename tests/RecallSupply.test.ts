import { expect, it } from 'vitest'
import { recallIngredient, reachableRecallIds } from './helpers/RecallSupply.ts'
import { WORDS, VARIANT_BY_ID } from '../src/game/data/words.ts'

const food = WORDS.filter(entry => ['계란', '프라이팬'].includes(entry.word))
const friedEgg = VARIANT_BY_ID.get('fried-egg')!
it('makes a recipe request only when its ingredients are in the stage pool', () => {
  expect(reachableRecallIds(food).has('fried-egg')).toBe(true)
  expect(reachableRecallIds(food.filter(entry => entry.word === '계란')).has('fried-egg')).toBe(false)
})
it('offers the missing ingredient rather than duplicating an existing one', () => {
  expect(recallIngredient([friedEgg], new Map([['egg',1]]),food)?.word).toBe('프라이팬')
  expect(recallIngredient([friedEgg], new Map([['egg',1],['frying-pan',1]]),food)).toBe(null)
  expect(recallIngredient([friedEgg], new Map([['fried-egg',1]]),food)).toBe(null)
})
it('never offers a word excluded by the spawner (for example an already-visible word)', () => {
  expect(recallIngredient([friedEgg],new Map([['egg',1]]),food.filter(entry=>entry.word==='계란'))).toBe(null)
})
