import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TypingLane } from '../src/components/TypingLane.tsx'
import type { FallingWord } from '../src/game/types/game.ts'

const word: FallingWord = {
  id: 1,
  word: '아메리카노',
  side: 'left',
  slot: 0,
  y: 0.5,
  state: 'active',
  fade: 1,
}

describe('TypingLane 글꼴', () => {
  it('화이트보드와 같은 손글씨 글꼴과 크기로 단어를 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, { words: [word], side: 'left' }))

    expect(markup).toContain('font-family:&quot;GriunXHangeul A Foreign Hand&quot;')
    expect(markup).toContain('font-size:35px')
    expect(markup).toContain('font-weight:400')
  })
})
