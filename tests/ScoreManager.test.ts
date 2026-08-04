import { describe, expect, it } from 'vitest'
import { ScoreManager } from '../src/game/systems/ScoreManager.ts'
import { ARENA, SCORE } from '../src/game/config.ts'
import { WORD_BY_TEXT } from '../src/game/data/words.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

function variantOf(word: string, hidden: boolean): ItemVariant {
  const entry = WORD_BY_TEXT.get(word)
  if (entry === undefined) throw new Error(`no entry: ${word}`)
  const found = entry.variants.find((item) => item.hidden === hidden)
  if (found === undefined) throw new Error(`no variant: ${word} hidden=${hidden}`)
  return found
}

describe('ScoreManager', () => {
  it('물건이 멈추면 개수와 기본 점수가 오른다', () => {
    const score = new ScoreManager()
    score.onSettled(variantOf('사과', false), ARENA.platformTop)
    const stats = score.stats(0, 3)
    expect(stats.stackCount).toBe(1)
    expect(stats.score).toBe(SCORE.perItem)
  })

  it('높이가 갱신될 때만 높이 보너스를 준다', () => {
    const score = new ScoreManager()
    const apple = variantOf('사과', false)

    score.onSettled(apple, ARENA.platformTop + 1)
    const afterFirst = score.stats(0, 3).score

    // 더 낮은 곳에 멈춘 물건은 높이 보너스를 받지 못한다
    score.onSettled(apple, ARENA.platformTop + 0.5)
    const afterSecond = score.stats(0, 3).score

    expect(afterFirst).toBe(SCORE.perItem + SCORE.perHeightMeter)
    expect(afterSecond).toBe(afterFirst + SCORE.perItem)
    expect(score.stats(0, 3).maxHeight).toBeCloseTo(1)
  })

  it('받침대 아래에서 멈춰도 높이는 음수가 되지 않는다', () => {
    const score = new ScoreManager()
    score.onSettled(variantOf('사과', false), ARENA.platformTop - 5)
    expect(score.stats(0, 3).maxHeight).toBe(0)
  })

  it('히든 물건은 보너스 점수와 발견 목록에 반영된다', () => {
    const score = new ScoreManager()
    const hiddenApple = variantOf('사과', true)
    score.onSettled(hiddenApple, ARENA.platformTop)
    const stats = score.stats(0, 3)
    expect(stats.score).toBe(SCORE.perItem + hiddenApple.scoreBonus)
    expect(stats.hiddenFound).toEqual([hiddenApple.label])
  })

  it('같은 히든을 또 찾아도 목록에는 한 번만 남는다', () => {
    const score = new ScoreManager()
    const hiddenApple = variantOf('사과', true)
    score.onSettled(hiddenApple, ARENA.platformTop)
    score.onSettled(hiddenApple, ARENA.platformTop)
    expect(score.stats(0, 3).hiddenFound).toHaveLength(1)
    expect(score.stats(0, 3).stackCount).toBe(2)
  })

  it('미스 개수는 그대로 전달만 한다 — 감점은 없다', () => {
    const score = new ScoreManager()
    score.onSettled(variantOf('사과', false), ARENA.platformTop)
    expect(score.stats(7, 3).missedWords).toBe(7)
    expect(score.stats(7, 3).score).toBe(SCORE.perItem)
  })

  it('콤보는 단어를 맞출 때마다 오른다', () => {
    const score = new ScoreManager()
    expect(score.stats(0, 3).combo).toBe(0)
    score.onWordMatched()
    score.onWordMatched()
    score.onWordMatched()
    expect(score.stats(0, 3).combo).toBe(3)
    expect(score.stats(0, 3).maxCombo).toBe(3)
  })

  it('콤보는 목숨을 잃을 때만 끊긴다', () => {
    const score = new ScoreManager()
    score.onWordMatched()
    score.onWordMatched()
    // 물건이 멈추거나 미스가 나도 콤보는 유지된다
    score.onSettled(variantOf('사과', false), ARENA.platformTop)
    expect(score.stats(9, 3).combo).toBe(2)

    score.onLifeLost()
    expect(score.stats(9, 2).combo).toBe(0)
    // 최고 기록은 남는다
    expect(score.stats(9, 2).maxCombo).toBe(2)
  })

  it('콤보 배수가 착지 점수에 곱해진다', () => {
    const plain = new ScoreManager()
    plain.onSettled(variantOf('사과', false), ARENA.platformTop)

    const combod = new ScoreManager()
    for (let i = 0; i < 5; i += 1) combod.onWordMatched()
    combod.onSettled(variantOf('사과', false), ARENA.platformTop)

    expect(combod.multiplier).toBeCloseTo(1 + 5 * SCORE.comboStep)
    expect(combod.stats(0, 3).score).toBeGreaterThan(plain.stats(0, 3).score)
  })

  it('콤보 배수에는 상한이 있다', () => {
    const score = new ScoreManager()
    for (let i = 0; i < 500; i += 1) score.onWordMatched()
    expect(score.multiplier).toBe(SCORE.comboMaxMultiplier)
  })

  it('남은 목숨은 그대로 전달만 한다', () => {
    const score = new ScoreManager()
    expect(score.stats(0, 1).lives).toBe(1)
  })

  it('reset은 모든 상태를 되돌린다', () => {
    const score = new ScoreManager()
    score.onWordMatched()
    score.onSettled(variantOf('사과', true), ARENA.platformTop + 3)
    score.reset()
    const stats = score.stats(0, 3)
    expect(stats).toMatchObject({
      score: 0,
      stackCount: 0,
      maxHeight: 0,
      combo: 0,
      maxCombo: 0,
      hiddenFound: [],
    })
  })
})
