import { ARENA, SCORE } from '../config.ts'
import type { ItemVariant, RunStats } from '../types/game.ts'

/**
 * 콤보는 이번 범위에서 제외했다. 점수는 쌓기 결과 자체만 반영한다.
 * (착지 순간 Enter로 저스트 판정을 잡는 콤보는 백로그 — CLAUDE.md 참고)
 */
class ScoreManager {
  private score = 0
  private stackCount = 0
  private maxHeight = 0
  private readonly hidden = new Set<string>()

  /** 물건이 안정적으로 멈췄을 때 호출한다. topY는 그 물건의 월드 y좌표 */
  onSettled(variant: ItemVariant, topY: number): void {
    this.stackCount += 1
    this.score += SCORE.perItem + variant.scoreBonus
    if (variant.hidden) {
      this.hidden.add(variant.label)
    }

    const height = Math.max(topY - ARENA.platformTop, 0)
    if (height > this.maxHeight) {
      this.score += Math.round((height - this.maxHeight) * SCORE.perHeightMeter)
      this.maxHeight = height
    }
  }

  stats(missedWords: number): RunStats {
    return {
      score: this.score,
      stackCount: this.stackCount,
      maxHeight: this.maxHeight,
      missedWords,
      hiddenFound: [...this.hidden],
    }
  }

  reset(): void {
    this.score = 0
    this.stackCount = 0
    this.maxHeight = 0
    this.hidden.clear()
  }
}

export { ScoreManager }
