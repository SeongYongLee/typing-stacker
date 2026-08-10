import { describe, expect, it } from 'vitest'
import {
  WHITEBOARD_SCALE,
  whiteboardWordChanges,
} from '../src/components/whiteboardTransition.ts'

describe('화이트보드 단어 전환', () => {
  it('배경 보드는 원래 폭의 90%를 쓴다', () => {
    expect(WHITEBOARD_SCALE).toBe(0.9)
  })

  it('유지되는 단어는 건드리지 않고 교체된 자리만 지우고 쓴다', () => {
    const changes = whiteboardWordChanges(
      ['씨앗', '우산', '자전거'],
      ['달', '우산', '자전거'],
    )

    expect(changes.removed).toEqual([{ word: '씨앗', index: 0 }])
    expect(changes.added).toEqual([{ word: '달', index: 0 }])
  })

  it('처음 열린 보드는 세 단어를 쓰기 대상으로 돌려준다', () => {
    const changes = whiteboardWordChanges([], ['씨앗', '우산', '자전거'])

    expect(changes.removed).toEqual([])
    expect(changes.added).toEqual([
      { word: '씨앗', index: 0 },
      { word: '우산', index: 1 },
      { word: '자전거', index: 2 },
    ])
  })
})
