import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MemoInput } from '../src/components/InputBar.tsx'
import type { HangulInput } from '../src/hooks/useHangulInput.ts'

const input: HangulInput = {
  ref: createRef<HTMLInputElement>(),
  value: '아메리카노',
  composing: false,
  tapSeq: 0,
  onChange: () => {},
  onKeyDown: () => {},
  onCompositionStart: () => {},
  onCompositionEnd: () => {},
  clear: () => {},
  focus: () => {},
  keepFocus: () => {},
}

describe('MemoInput 글꼴', () => {
  it('입력 글자와 연필 위치 측정자에 손글씨 글꼴을 함께 적용한다', () => {
    const markup = renderToStaticMarkup(
      createElement(MemoInput, { input, nightfall: 0, ariaLabel: '단어 입력' }),
    )

    const matches = markup.match(/GriunXHangeul A Foreign Hand/g) ?? []
    expect(matches).toHaveLength(2)
    expect(markup).toContain('font:400 28px/1.2')
  })
})
