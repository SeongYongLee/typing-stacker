import { describe, expect, it } from 'vitest'
import { judgeInput } from '../src/game/systems/TypingJudge.ts'
import type { FallingWord } from '../src/game/types/game.ts'

function word(overrides: Partial<FallingWord> & { word: string }): FallingWord {
  return {
    id: 1,
    side: 'left',
    slot: 0,
    y: 0.5,
    state: 'active',
    fade: 1,
    ...overrides,
  }
}

describe('judgeInput', () => {
  it('일치하는 활성 단어를 잡는다', () => {
    const words = [word({ id: 1, word: '사과' }), word({ id: 2, word: '망치' })]
    const result = judgeInput(words, '망치')
    expect(result.kind).toBe('hit')
    expect(result.kind === 'hit' && result.word.id).toBe(2)
  })

  it('빈 입력은 miss다', () => {
    const words = [word({ word: '사과' })]
    expect(judgeInput(words, '').kind).toBe('miss')
    expect(judgeInput(words, '   ').kind).toBe('miss')
  })

  it('앞뒤 공백은 무시한다', () => {
    const words = [word({ word: '사과' })]
    expect(judgeInput(words, ' 사과 ').kind).toBe('hit')
  })

  it('바닥에 닿은 단어는 더 이상 입력할 수 없다', () => {
    const words = [word({ word: '사과', state: 'missed', y: 1 })]
    expect(judgeInput(words, '사과').kind).toBe('miss')
  })

  it('부분 일치는 잡지 않는다', () => {
    const words = [word({ word: '항아리' })]
    expect(judgeInput(words, '항아').kind).toBe('miss')
    expect(judgeInput(words, '항아리다').kind).toBe('miss')
  })

  it('여러 개가 일치하면 가장 아래 것을 잡는다', () => {
    const words = [
      word({ id: 1, word: '사과', y: 0.2 }),
      word({ id: 2, word: '사과', y: 0.9 }),
    ]
    const result = judgeInput(words, '사과')
    expect(result.kind === 'hit' && result.word.id).toBe(2)
  })
})
