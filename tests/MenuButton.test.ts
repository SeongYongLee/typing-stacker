import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MenuButton } from '../src/components/MenuButton.tsx'

function markup(primary: boolean, selected: boolean): string {
  const props = {
    selected,
    onClick: () => {},
    primary,
    children: primary ? '혼자 하기' : '함께 하기',
  }
  return renderToStaticMarkup(createElement(MenuButton, { ...props }))
}

describe('MenuButton 글자 크기', () => {
  it.each([
    { primary: true, selected: true },
    { primary: true, selected: false },
    { primary: false, selected: true },
    { primary: false, selected: false },
  ])('Primary와 일반 버튼을 선택 상태와 관계없이 같은 크기로 보여준다', ({ primary, selected }) => {
    expect(markup(primary, selected)).toContain('font-size:15px')
  })
})
