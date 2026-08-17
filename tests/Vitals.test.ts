import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BARRIER, Delta, FEVER, Lives } from '../src/components/Vitals.tsx'

describe('Night Fever 점수', () => {
  it('밤에 오른 점수는 하트와 같은 연보라색으로 강조한다', () => {
    const markup = renderToStaticMarkup(createElement(Delta, { amount: 420, fever: true }))

    expect(markup).toContain('data-fever-score="true"')
    expect(markup).toContain(FEVER)
    expect(markup).toContain('aria-label="+420"')
  })

  it('밤이어도 내려간 점수는 위험 신호인 빨강을 유지한다', () => {
    const markup = renderToStaticMarkup(createElement(Delta, { amount: -80, fever: true }))

    expect(markup).not.toContain('data-fever-score')
    expect(markup).not.toContain(FEVER)
    expect(markup).toContain('aria-label="−80"')
  })
})

describe('Night Fever 하트', () => {
  it('싱글의 하나뿐인 하트를 연보라색으로 밝힌다', () => {
    const markup = renderToStaticMarkup(createElement(Lives, { lives: 1, fever: true, invulnerable: 1 }))

    expect(markup.match(/data-fever-heart="true"/g) ?? []).toHaveLength(1)
    expect(markup).toContain(FEVER)
    expect(markup).not.toContain(BARRIER)
  })

  it('새벽에는 Fever 색을 걷고 기존 파란 보호막을 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(Lives, { lives: 1, fever: false, invulnerable: 1 }))

    expect(markup).not.toContain('data-fever-heart')
    expect(markup).toContain(BARRIER)
  })
})
