import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MenuButton } from '../src/components/MenuButton.tsx'

function markup(primary: boolean): string {
  const props = {
    selected: false,
    onClick: () => {},
    primary,
    children: primary ? '혼자 하기' : '함께 하기',
  }
  return renderToStaticMarkup(createElement(MenuButton, { ...props }))
}

describe('MenuButton 글자 크기', () => {
  it('Primary와 일반 버튼을 같은 크기로 보여준다', () => {
    expect(markup(true)).toContain('font-size:15px')
    expect(markup(false)).toContain('font-size:15px')
  })
})
