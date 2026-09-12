import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Whiteboard } from '../src/components/ArenaBackdrop.tsx'

describe('화이트보드 상태 문구', () => {
  it('회수 가능한 안내 단어와 Enter 입력 방법을 표시한다', () => {
    const markup = renderToStaticMarkup(
      createElement(Whiteboard, {
        words: ['책'], activeWords: ['책'], nightfall: 0, reminder: '책',
      }),
    )
    expect(markup).toContain('data-whiteboard-reminder="true"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('‘책’')
    expect(markup).toContain('Enter')
    expect(markup).toContain('돌려주세요')
  })

  it('물건이 사라져 회수할 수 없으면 오래된 안내를 표시하지 않는다', () => {
    const markup = renderToStaticMarkup(
      createElement(Whiteboard, {
        words: ['책'], activeWords: [], nightfall: 0, reminder: '책',
      }),
    )
    expect(markup).not.toContain('data-whiteboard-reminder')
  })

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

  it('회수된 단어의 원래 자리에 가져간 사람을 표시한다', () => {
    const markup = renderToStaticMarkup(
      createElement(Whiteboard, {
        words: ['새 단어'],
        activeWords: [],
        nightfall: 0,
        claim: { seq: 1, word: '아메리카노', index: 2, label: '자두가 가져감' },
      }),
    )

    expect(markup).toContain('data-whiteboard-claim="자두가 가져감"')
    expect(markup).toContain('자두가 가져감')
    expect(markup).toContain('whiteboard-claim-owner')
  })
})
