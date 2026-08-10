import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Combo, Lives, Score } from '../src/components/Vitals.tsx'

describe('플레이 HUD 크기와 색', () => {
  it('목숨 라벨과 하트를 기존의 두 배 크기로 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(Lives, { lives: 3 }))

    expect(markup).toContain('font-size:22px')
    expect(markup).toContain('font-size:44px')
  })

  it('점수와 콤보를 검은 글자의 색상 칩으로 보여준다', () => {
    const score = renderToStaticMarkup(createElement(Score, { score: 1234 }))
    const combo = renderToStaticMarkup(createElement(Combo, { combo: 7 }))

    expect(score).toContain('align-items:center')
    expect(score).toContain('font-size:52px')
    expect(score).toContain('background:#e4e68a')
    expect(score).toContain('color:#0d0f16')
    expect(combo).toContain('align-items:center')
    expect(combo).toContain('font-size:52px')
    expect(combo).toContain('background:#6bffb0')
    expect(combo).toContain('color:#0d0f16')
  })
})
