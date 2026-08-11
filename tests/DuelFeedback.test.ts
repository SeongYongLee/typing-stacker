import { describe, expect, it } from 'vitest'
import { duelStatusMessage } from '../src/multi/duelFeedback.ts'

describe('대결 개인 결과 안내', () => {
  it('탈락은 본인이 죽었다는 문장으로 표시한다', () => {
    expect(duelStatusMessage({ id: 'a', placement: 3, outcome: 'out' })).toEqual({
      title: '탈락했습니다',
      detail: '3위로 경기를 마쳤습니다',
      tone: 'danger',
    })
  })

  it('첫 골인과 마지막 생존은 이겼다고 표시한다', () => {
    expect(duelStatusMessage({ id: 'a', placement: 1, outcome: 'goal' }).title)
      .toBe('이겼습니다')
    expect(duelStatusMessage({ id: 'a', placement: 1, outcome: 'survived' }).title)
      .toBe('이겼습니다')
  })

  it('1위가 아닌 골인은 골인과 확정 순위를 표시한다', () => {
    expect(duelStatusMessage({ id: 'a', placement: 2, outcome: 'goal' })).toEqual({
      title: '골인했습니다',
      detail: '2위가 확정됐습니다',
      tone: 'success',
    })
  })
})
