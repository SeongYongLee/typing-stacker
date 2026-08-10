import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NameScreen } from '../src/screens/NameScreen.tsx'

describe('NameScreen', () => {
  it('도감 안내는 내 프로필 설명 아래에 두고 미리보기 아래 복귀 문구는 보여주지 않는다', () => {
    const html = renderToStaticMarkup(createElement(NameScreen, {
      onBack: () => {},
    }))

    expect(html.indexOf('순위표와 대전 상대에게 이렇게 보입니다'))
      .toBeLessThan(html.indexOf('도감에 모은 물건을 프로필 사진으로 쓸 수 있습니다'))
    expect(html.indexOf('도감에 모은 물건을 프로필 사진으로 쓸 수 있습니다'))
      .toBeLessThan(html.indexOf('data-name-picker'))
    expect(html).not.toContain('쓰던 이름 그대로')
    expect(html).not.toContain('돌아가면')
  })
})
