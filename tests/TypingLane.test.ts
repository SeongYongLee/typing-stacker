import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TypingLane } from '../src/components/TypingLane.tsx'
import type { FallingWord } from '../src/game/types/game.ts'

const word: FallingWord = {
  id: 1,
  word: '아메리카노',
  side: 'left',
  slot: 0,
  y: 0.5,
  state: 'active',
  fade: 1,
}

describe('TypingLane 글꼴', () => {
  it('화이트보드와 같은 손글씨 글꼴과 크기로 단어를 보여준다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, { words: [word], side: 'left' }))

    expect(markup).toContain('font-family:&quot;GriunXHangeul A Foreign Hand&quot;')
    expect(markup).toContain('font-size:35px')
    expect(markup).toContain('font-weight:400')
  })

  it('대결에서 입력된 단어 자리에 획득자를 남긴다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, {
      words: [],
      side: 'left',
      claims: [{ seq: 1, side: 'left', slot: 0, y: 0.5, label: '자두가 가져감' }],
    }))

    expect(markup).toContain('data-word-claim="자두가 가져감"')
    expect(markup).toContain('top:50%')
    expect(markup).toContain('자두가 가져감')
  })

  it('합성 가능한 단어는 단일 굵은 테두리와 겹친 빛으로 강조한다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      wordMarks: new Map([[word.word, 0]]),
      mergeHints: new Map([[word.word, ['/items/clover.webp', '/items/leaf.webp']]]),
      pairPulse: 0,
    }))

    expect(markup).toContain('data-pair-mark="0"')
    expect(markup).toContain('border-width:3px')
    expect(markup).not.toContain('outline:')
    expect(markup).toContain('inset 0 0 5px')
    expect(markup).toContain('data-merge-hints="2"')
    expect(markup.match(/data-merge-hint="true"/g)).toHaveLength(2)
    expect(markup).toContain('/items/clover.webp')
    expect(markup).toContain('/items/leaf.webp')
  })

  it('대결에서만 화이트보드와 이어진 단어 왼쪽 위에 하트를 표시한다', () => {
    const duel = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      recallWords: [word.word],
      recallMarker: 'heart',
    }))
    const solo = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      recallWords: [word.word],
    }))

    expect(duel).toContain('data-recall-heart="true"')
    expect(duel).toContain('♥')
    expect(solo).not.toContain('data-recall-heart')
  })

  it('싱글에서는 화이트보드와 이어진 단어 왼쪽 위에 회수 손을 표시한다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      recallWords: [word.word],
      recallMarker: 'hand',
    }))

    expect(markup).toContain('data-recall-hand="true"')
    expect(markup).toContain('arena/catch-day.webp')
    expect(markup).not.toContain('data-recall-heart')
  })

  it('화이트보드 연결 단어의 중성 광원이 합성 표식과 같은 맥동값으로 움직인다', () => {
    const dim = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      recallWords: [word.word],
      pairPulse: 0,
    }))
    const bright = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      recallWords: [word.word],
      pairPulse: 1,
    }))

    expect(dim).toContain('0 0 10px rgba(255, 248, 213, 0.52)')
    expect(bright).toContain('0 0 20px rgba(255, 248, 213, 0.9)')
    expect(bright).not.toBe(dim)
  })
})
