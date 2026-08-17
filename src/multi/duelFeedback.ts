import type { DuelResult } from './DuelRace.ts'

interface DuelStatusMessage {
  readonly title: string
  readonly detail: string
  readonly tone: 'success' | 'danger'
}

/** 전체 경기가 끝나기 전에 자기 순위가 확정됐을 때 보여줄 본인 관점의 문장. */
function duelStatusMessage(result: DuelResult): DuelStatusMessage {
  if (result.outcome === 'survived') {
    return {
      title: '이겼습니다',
      detail: '마지막까지 생존했습니다',
      tone: 'success',
    }
  }
  return {
    title: '탈락했습니다',
    detail: `${result.placement}위로 경기를 마쳤습니다`,
    tone: 'danger',
  }
}

export { duelStatusMessage }
export type { DuelStatusMessage }
