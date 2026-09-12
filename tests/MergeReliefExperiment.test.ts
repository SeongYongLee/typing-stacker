import {expect,it,vi} from 'vitest'
import type {GameEngine} from '../src/game/core/GameEngine.ts'
import {WORDS} from '../src/game/data/words.ts'
import {installRecallExperiment} from './helpers/recallFlowExperiment.ts'

it('preserves craft scoring and reduces pending congestion only outside the tutorial',()=>{
  const onCrafted=vi.fn(),item=WORDS[0]!.variants[0]!
  const game={stageId:1,congestion:40,congestionRushLeft:10,score:{onCrafted}}
  installRecallExperiment(game as unknown as GameEngine,'merge-relief')()
  game.score.onCrafted(item)
  expect(onCrafted).toHaveBeenCalledWith(item)
  expect(game.congestion).toBe(25)
  expect(game.congestionRushLeft).toBe(10)
  game.congestion=3
  game.score.onCrafted(item)
  expect(game.congestion).toBe(0)
  game.stageId=0;game.congestion=40
  game.score.onCrafted(item)
  expect(game.congestion).toBe(40)
})
