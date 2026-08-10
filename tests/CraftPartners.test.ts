import { describe, expect, it } from 'vitest'
import { RECIPES } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import { craftPartnerWords } from '../src/game/systems/CraftPartners.ts'

describe('craftPartnerWords', () => {
  it('이미 있는 재료의 부족한 짝 단어를 돌려준다', () => {
    const words = craftPartnerWords(new Map([['sunflower-seed', 1]]), RECIPES, WORDS)

    expect(words).toContain('물뿌리개')
  })

  it('같은 물건 둘짜리는 하나가 있을 때 같은 단어를 선호한다', () => {
    const words = craftPartnerWords(new Map([['clover', 1]]), RECIPES, WORDS)

    expect(words).toContain('클로버')
  })

  it('이미 재료가 모두 갖춰진 레시피는 더 부르지 않는다', () => {
    const words = craftPartnerWords(new Map([['clover', 2]]), RECIPES, WORDS)

    expect(words).not.toContain('클로버')
  })
})
