import type { DuelResult } from './DuelRace.ts'

interface DuelStatusMessage {
  readonly title: string
  readonly detail: string
  readonly tone: 'success' | 'danger'
}

/** 전체 경기가 끝나기 전에 자기 순위가 확정됐을 때 보여줄 본인 관점의 문장. */
function duelStatusMessage(result: DuelResult): DuelStatusMessage {
  if (result.outcome !== 'out' && result.placement === 1) {
    return {
      title: '이겼습니다',
      detail: result.outcome === 'goal'
        ? '가장 먼저 골인했습니다'
        : '마지막까지 생존했습니다',
      tone: 'success',
    }
  }
  if (result.outcome === 'out') {
    return {
      title: '탈락했습니다',
      detail: `${result.placement}위로 경기를 마쳤습니다`,
      tone: 'danger',
    }
  }
  return {
    title: result.outcome === 'goal' ? '골인했습니다' : '생존했습니다',
    detail: `${result.placement}위가 확정됐습니다`,
    tone: 'success',
  }
}

export { duelStatusMessage }
export type { DuelStatusMessage }
