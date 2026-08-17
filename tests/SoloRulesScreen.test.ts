import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SoloRulesScreen } from '../src/screens/SoloRulesScreen.tsx'

describe('SoloRulesScreen', () => {
  it('두 번째 시작에서 키보드로 고를 수 있는 튜토리얼 선택지를 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(SoloRulesScreen, {
      onStart: () => {},
      onHideAndStart: () => {},
    }))

    expect(markup).toContain('TUTORIAL')
    expect(markup).toContain('튜토리얼을 다시 볼까요?')
    expect(markup).toContain('font-size:30px')
    expect(markup).toContain('화이트보드의 동그라미 항목')
    expect(markup).toContain('혼잡 경보')
    expect(markup).toContain('튜토리얼 보기')
    expect(markup).toContain('앞으로 튜토리얼 보지 않기')
    expect(markup).not.toContain('이후에는 튜토리얼 없이 바로 게임을 시작합니다.')
    expect(markup).toContain('font-size:17px')
    expect(markup).toContain('var(--display)')
  })
})
