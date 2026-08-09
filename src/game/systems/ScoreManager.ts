import { ARENA, SCORE } from '../config.ts'
import type { ItemVariant, RunStats } from '../types/game.ts'
import { countKeystrokes, keystrokesPerMinute } from './TypingSpeed.ts'

/**
 * 점수와 콤보.
 *
 * 콤보는 단어를 맞출 때마다 오르고, **놓치거나 목숨을 잃으면** 초기화된다.
 * 오타로는 끊기지 않는다 — 고쳐 치면 되는 것이고, 그 사이 단어는 계속 내려온다.
 *
 * 한때는 목숨을 잃을 때만 끊었다. 지키는 것을 하나로 두려던 것인데, 그러면 **타자를
 * 놓쳐도 콤보가 남아** 손을 멈추고 쌓기만 봐도 배수가 유지됐다. 타자 게임에서
 * 콤보가 타자와 무관한 값이 되는 셈이라, 놓치는 것도 끊기는 사유로 되돌렸다.
 *
 * 놓친 단어가 판을 방해하지는 않는다. 대가는 콤보와 점수(정확도)까지다 —
 * 예고 물건으로 되돌아와 손을 뺏던 방식은 쌓기에 쓸 시간을 갉아먹어 게임을 급하게 만들었다.
 */
class ScoreManager {
  private score = 0
  private stackCount = 0
  private maxHeight = 0
  private combo = 0
  private maxCombo = 0
  private keystrokes = 0
  private readonly hidden = new Set<string>()
  /**
   * 발견 목록을 배열로 펼친 것. stats()는 매 프레임 불리므로 그때마다 Set을 복사하면
   * 초당 60개의 배열이 쓰레기로 쌓인다 — 새로 발견할 때만 다시 만든다.
   */
  private hiddenList: readonly string[] = []

  /** 지금 콤보. 맞춘 순간의 값을 이벤트에 실어 보내려는 통로다 */
  get comboCount(): number {
    return this.combo
  }

  /** 콤보 배수. 물건이 멈출 때 그 시점의 배수가 점수에 곱해진다 */
  get multiplier(): number {
    return Math.min(1 + this.combo * SCORE.comboStep, SCORE.comboMaxMultiplier)
  }

  /**
   * 낙하 중인 단어를 맞췄을 때.
   * 타수는 **맞춘 단어만** 센다 — 오타를 쳐도 분모(경과 시간)는 흐르므로
   * 정확하게 치지 못하면 속도가 저절로 떨어진다.
   */
  onWordMatched(word: string): void {
    this.combo += 1
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo
    }
    this.keystrokes += countKeystrokes(word)
  }

  /**
   * 재료를 붙여 물건을 만들어냈을 때.
   * 운으로 만난 히든보다 값을 더 쳐준다 — 합성은 자리를 만들고 재료를 고른
   * 결과이지 운이 아니다.
   */
  onCrafted(variant: ItemVariant): void {
    this.remember(variant.label)
    this.score += SCORE.craftBonus + variant.scoreBonus
  }

  /**
   * 낙하 단어가 바닥까지 내려가 사라졌을 때.
   *
   * 한 프레임에 여러 개가 함께 사라져도 부르는 쪽이 한 번만 부른다 —
   * 콤보는 이미 0이라 두 번 깎을 것이 없다.
   */
  onWordMissed(): void {
    this.combo = 0
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
      this.remember(variant.label)
    }

    const height = Math.max(topY - ARENA.platformTop, 0)
    if (height > this.maxHeight) {
      this.score += Math.round((height - this.maxHeight) * SCORE.perHeightMeter)
      this.maxHeight = height
    }
  }

  /**
   * 쌓은 것과 놓친 것의 비율. 둘 다 없으면 1이다.
   * 놓친 단어가 아니라 **비율**을 보는 이유는 길게 버틴 판일수록 실수 하나가
   * 차지하는 몫이 작아야 하기 때문이다.
   */
  accuracy(missedWords: number): number {
    const total = this.stackCount + missedWords
    return total === 0 ? 1 : this.stackCount / total
  }

  /** 정확도를 반영한 점수. 화면에 보이는 최종 점수다 */
  finalScore(missedWords: number): number {
    const penalty =
      SCORE.accuracyFloor + (1 - SCORE.accuracyFloor) * this.accuracy(missedWords)
    return Math.round(this.score * penalty)
  }

  stats(missedWords: number, lives: number, elapsedSec: number): RunStats {
    return {
      score: this.finalScore(missedWords),
      rawScore: this.score,
      accuracy: this.accuracy(missedWords),
      stackCount: this.stackCount,
      maxHeight: this.maxHeight,
      missedWords,
      lives,
      combo: this.combo,
      maxCombo: this.maxCombo,
      kpm: keystrokesPerMinute(this.keystrokes, elapsedSec),
      durationSec: elapsedSec,
      hiddenFound: this.hiddenList,
    }
  }

  /** 발견 목록에 넣고, 실제로 늘었을 때만 펼친 배열을 다시 만든다 */
  private remember(label: string): void {
    const before = this.hidden.size
    this.hidden.add(label)
    if (this.hidden.size !== before) {
      this.hiddenList = [...this.hidden]
    }
  }

  reset(): void {
    this.score = 0
    this.stackCount = 0
    this.maxHeight = 0
    this.combo = 0
    this.maxCombo = 0
    this.keystrokes = 0
    this.hidden.clear()
    this.hiddenList = []
  }
}

export { ScoreManager }
