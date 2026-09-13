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

describe('TypingLane 상태 표시', () => {

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

  it('합성 가능한 단어에 재료와 히든 표식을 표시한다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      wordMarks: new Map([[word.word, 0]]),
      mergeHints: new Map([[word.word, [
        { id: 'clover', sprite: '/items/clover.webp', hidden: false },
        { id: 'leaf-hidden', sprite: '/items/leaf.webp', hidden: true },
      ]]]),
      pairPulse: 0,
    }))

    expect(markup).toContain('data-pair-mark="0"')
    expect(markup).toContain('data-merge-hints="2"')
    expect(markup).toContain('data-merge-hint="normal"')
    expect(markup).toContain('data-merge-hint="hidden"')
    expect(markup).toContain('★')
    expect(markup).toContain('/items/clover.webp')
    expect(markup).toContain('/items/leaf.webp')
  })

  it('재료 3개 이상 조합을 구분한다', () => {
    const markup = renderToStaticMarkup(createElement(TypingLane, {
      words: [word],
      side: 'left',
      wordMarks: new Map([[word.word, 0]]),
      mergeSizes: new Map([[word.word, 3]]),
      pairPulse: 1,
    }))

    expect(markup).toContain('data-merge-size="3"')
    expect(markup).toContain('data-complex-merge="true"')
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

    expect(bright).not.toBe(dim)
  })
})
