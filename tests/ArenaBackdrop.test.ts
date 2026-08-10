import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Whiteboard } from '../src/components/ArenaBackdrop.tsx'

describe('화이트보드 상태 문구', () => {
  it('왼쪽 위에 다른 보드 글자의 70% 크기로 주인 찾는 중을 표시한다', () => {
    const markup = renderToStaticMarkup(
      createElement(Whiteboard, { words: ['아메리카노'], activeWords: [], nightfall: 0 }),
    )

    expect(markup).toContain('data-whiteboard-status="true"')
    expect(markup).toContain('주인 찾는 중')
    expect(markup).toContain('left:10%')
    expect(markup).toContain('top:10%')
    expect(markup).toContain('color:#000')
    expect(markup).toContain('font-size:24.5px')
    expect(markup).toContain('font-size:35px')
  })
})
