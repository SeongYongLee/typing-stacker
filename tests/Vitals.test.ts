import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BARRIER, FEVER, Lives } from '../src/components/Vitals.tsx'

describe('Night Fever 하트', () => {
  it('남아 있는 하트만 연보라색으로 빛내고 빈 하트는 그대로 둔다', () => {
    const markup = renderToStaticMarkup(createElement(Lives, { lives: 2, fever: true, invulnerable: 1 }))

    expect(markup.match(/data-fever-heart="true"/g) ?? []).toHaveLength(2)
    expect(markup).toContain(FEVER)
    expect(markup).toContain('♡')
    expect(markup).not.toContain(BARRIER)
  })

  it('새벽에는 Fever 색을 걷고 기존 파란 보호막을 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(Lives, { lives: 2, fever: false, invulnerable: 1 }))

    expect(markup).not.toContain('data-fever-heart')
    expect(markup).toContain(BARRIER)
  })
})
