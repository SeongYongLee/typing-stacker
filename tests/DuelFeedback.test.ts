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

  it('마지막 생존자는 이겼다고 표시한다', () => {
    expect(duelStatusMessage({ id: 'a', placement: 1, outcome: 'survived' })).toEqual({
      title: '이겼습니다',
      detail: '마지막까지 생존했습니다',
      tone: 'success',
    })
  })
})
