import { ARENA, SCORE } from '../config.ts'
import type { ItemVariant, RunStats } from '../types/game.ts'

/**
 * 점수와 콤보.
 *
 * 콤보는 단어를 맞출 때마다 오르고, **목숨이 줄어들 때만** 초기화된다.
 * 오타나 놓친 단어로는 끊기지 않는다 — 끊기는 기준을 하나로 두면 플레이어가
 * "무엇을 지켜야 하는지"를 헷갈리지 않고, 그 하나가 이 게임의 본질인 쌓기다.
 */
class ScoreManager {
  private score = 0
  private stackCount = 0
  private maxHeight = 0
  private combo = 0
  private maxCombo = 0
  private readonly hidden = new Set<string>()

  /** 콤보 배수. 물건이 멈출 때 그 시점의 배수가 점수에 곱해진다 */
  get multiplier(): number {
    return Math.min(1 + this.combo * SCORE.comboStep, SCORE.comboMaxMultiplier)
  }

  /** 낙하 중인 단어를 맞췄을 때 */
  onWordMatched(): void {
    this.combo += 1
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo
    }
  }

  /** 물건이 받침대를 벗어나 목숨이 줄었을 때 */
  onLifeLost(): void {
    this.combo = 0
  }

  /** 물건이 안정적으로 멈췄을 때. topY는 그 물건의 월드 y좌표 */
  onSettled(variant: ItemVariant, topY: number): void {
    this.stackCount += 1
    this.score += Math.round((SCORE.perItem + variant.scoreBonus) * this.multiplier)
    if (variant.hidden) {
      this.hidden.add(variant.label)
    }

    const height = Math.max(topY - ARENA.platformTop, 0)
    if (height > this.maxHeight) {
      this.score += Math.round((height - this.maxHeight) * SCORE.perHeightMeter)
      this.maxHeight = height
    }
  }

  stats(missedWords: number, lives: number): RunStats {
    return {
      score: this.score,
      stackCount: this.stackCount,
      maxHeight: this.maxHeight,
      missedWords,
      lives,
      combo: this.combo,
      maxCombo: this.maxCombo,
      hiddenFound: [...this.hidden],
    }
  }

  reset(): void {
    this.score = 0
    this.stackCount = 0
    this.maxHeight = 0
    this.combo = 0
    this.maxCombo = 0
    this.hidden.clear()
  }
}

export { ScoreManager }
