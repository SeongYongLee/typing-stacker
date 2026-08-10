import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SoloRulesScreen } from '../src/screens/SoloRulesScreen.tsx'

describe('SoloRulesScreen', () => {
  it('옮겨온 혼자 하기 규칙과 게임 시작 버튼을 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(SoloRulesScreen, {
      onStart: () => {},
      onHideAndStart: () => {},
    }))

    expect(markup).toContain('GAME RULES')
    expect(markup).toContain('타자를 쳐서 물건이 떨어지지 않게 높게 쌓아보세요!')
    expect(markup).toContain('font-size:30px')
    expect(markup).toContain('좌우에서 내려오는 한글 단어를 타이핑합니다.')
    expect(markup).toContain('Enter를 누른 순간')
    expect(markup).toContain('목숨이 하나')
    expect(markup).toContain('5개(♥♥♥♥♥)')
    expect(markup).toContain('게임 시작')
    expect(markup).toContain('다시 보지 않기')
    expect(markup).toContain('font-size:17px')
    expect(markup).toContain('var(--display)')
  })
})
