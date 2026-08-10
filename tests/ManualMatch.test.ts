import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ManualMatch } from '../src/screens/lobby/ManualMatch.tsx'

describe('ManualMatch', () => {
  it('친선전 입력 단계에서는 공통 설명 패널을 다시 보여주지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ManualMatch, {
      onOpen: () => {},
      onBack: () => {},
    }))

    expect(html).not.toContain('aria-label="친선전 설명"')
    expect(html).not.toContain('최대 8명')
    expect(html).not.toContain('티어 점수는 바뀌지 않습니다')
  })

  it('내 정보 설정과 방 액션을 두 영역으로 나눈다', () => {
    const html = renderToStaticMarkup(createElement(ManualMatch, {
      onOpen: () => {},
      onBack: () => {},
    }))

    expect(html).toContain('grid-template-columns:repeat(auto-fit, minmax(300px, 1fr))')
    expect(html).toContain('이름')
    expect(html).toContain('아이콘')
    expect(html).toContain('방 생성하기')
    expect(html).toContain('방 참가하기')
  })
})
