import { describe, expect, it } from 'vitest'
import { ScoreManager } from '../src/game/systems/ScoreManager.ts'
import { ARENA, SCORE } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 특정 물건 이름에 묶지 않는다 — 아트가 교체되면 단어 테이블이 통째로 바뀌므로,
 * 점수 규칙 테스트는 "기본 변형 하나"와 "히든 변형 하나"만 있으면 된다.
 */
function anyVariant(hidden: boolean): ItemVariant {
  for (const entry of WORDS) {
    const found = entry.variants.find((item) => item.hidden === hidden)
    if (found !== undefined) return found
  }
  throw new Error(`hidden=${hidden} 변형이 테이블에 없다`)
}

describe('ScoreManager', () => {
  it('물건이 멈추면 개수와 기본 점수가 오른다', () => {
    const score = new ScoreManager()
    score.onSettled(anyVariant(false), ARENA.platformTop)
    const stats = score.stats(0, 3, 60)
    expect(stats.stackCount).toBe(1)
    expect(stats.score).toBe(SCORE.perItem)
  })

  it('높이가 갱신될 때만 높이 보너스를 준다', () => {
    const score = new ScoreManager()
    const item = anyVariant(false)

    score.onSettled(item, ARENA.platformTop + 1)
    const afterFirst = score.stats(0, 3, 60).score

    // 더 낮은 곳에 멈춘 물건은 높이 보너스를 받지 못한다
    score.onSettled(item, ARENA.platformTop + 0.5)
    const afterSecond = score.stats(0, 3, 60).score

    expect(afterFirst).toBe(SCORE.perItem + SCORE.perHeightMeter)
    expect(afterSecond).toBe(afterFirst + SCORE.perItem)
    expect(score.stats(0, 3, 60).maxHeight).toBeCloseTo(1)
  })

  it('받침대 아래에서 멈춰도 높이는 음수가 되지 않는다', () => {
    const score = new ScoreManager()
    score.onSettled(anyVariant(false), ARENA.platformTop - 5)
    expect(score.stats(0, 3, 60).maxHeight).toBe(0)
  })

  it('히든 물건은 보너스 점수와 발견 목록에 반영된다', () => {
    const score = new ScoreManager()
    const hidden = anyVariant(true)
    score.onSettled(hidden, ARENA.platformTop)
    const stats = score.stats(0, 3, 60)
    expect(stats.score).toBe(SCORE.perItem + hidden.scoreBonus)
    expect(stats.hiddenFound).toEqual([hidden.label])
  })

  it('합성 결과는 합성 보너스와 결과물 보너스를 즉시 더한다', () => {
    const score = new ScoreManager()
    const crafted = anyVariant(true)

    score.onCrafted(crafted)

    expect(score.stats(0, 3, 60).score).toBe(SCORE.craftBonus + crafted.scoreBonus)
  })

  it('화이트보드 회수는 콤보 배수를 적용해 즉시 점수를 주되 쌓은 개수는 늘리지 않는다', () => {
    const score = new ScoreManager()
    const recalled = anyVariant(false)
    score.onWordMatched('사과')
    score.onRecalled(recalled)

    const stats = score.stats(0, 3, 60)
    expect(stats.rawScore).toBe(
      Math.round((SCORE.perItem + recalled.scoreBonus) * (1 + SCORE.comboStep)),
    )
    expect(stats.stackCount).toBe(0)
  })

  it('같은 히든을 또 찾아도 목록에는 한 번만 남는다', () => {
    const score = new ScoreManager()
    const hidden = anyVariant(true)
    score.onSettled(hidden, ARENA.platformTop)
    score.onSettled(hidden, ARENA.platformTop)
    expect(score.stats(0, 3, 60).hiddenFound).toHaveLength(1)
    expect(score.stats(0, 3, 60).stackCount).toBe(2)
  })

  it('놓친 것이 없으면 정확도는 1이고 점수가 깎이지 않는다', () => {
    const score = new ScoreManager()
    score.onSettled(anyVariant(false), ARENA.platformTop)
    const stats = score.stats(0, 3, 60)
    expect(stats.accuracy).toBe(1)
    expect(stats.score).toBe(stats.rawScore)
  })

  it('놓친 단어는 정확도를 통해 점수를 깎는다', () => {
    const score = new ScoreManager()
    score.onSettled(anyVariant(false), ARENA.platformTop)
    const stats = score.stats(7, 3, 60)
    expect(stats.missedWords).toBe(7)
    // 쌓은 것 1개 대 놓친 것 7개
    expect(stats.accuracy).toBeCloseTo(1 / 8)
    expect(stats.score).toBeLessThan(stats.rawScore)
    expect(stats.rawScore).toBe(SCORE.perItem)
  })

  it('많이 쌓을수록 놓친 하나의 무게가 옅어진다', () => {
    const few = new ScoreManager()
    const many = new ScoreManager()
    few.onSettled(anyVariant(false), ARENA.platformTop)
    for (let i = 0; i < 20; i += 1) {
      many.onSettled(anyVariant(false), ARENA.platformTop)
    }
    expect(many.stats(1, 3, 60).accuracy).toBeGreaterThan(few.stats(1, 3, 60).accuracy)
  })

  it('아무것도 하지 않은 판의 정확도는 1이다 — 0으로 나누지 않는다', () => {
    expect(new ScoreManager().stats(0, 3, 60).accuracy).toBe(1)
  })

  it('전부 놓쳐도 점수가 음수가 되지는 않는다 — 바닥이 있다', () => {
    const score = new ScoreManager()
    score.onSettled(anyVariant(false), ARENA.platformTop)
    const stats = score.stats(999, 3, 60)
    expect(stats.score).toBeGreaterThan(0)
    expect(stats.score).toBeGreaterThanOrEqual(stats.rawScore * SCORE.accuracyFloor)
  })

  it('콤보는 단어를 맞출 때마다 오른다', () => {
    const score = new ScoreManager()
    expect(score.stats(0, 3, 60).combo).toBe(0)
    score.onWordMatched('사과')
    score.onWordMatched('사과')
    score.onWordMatched('사과')
    expect(score.stats(0, 3, 60).combo).toBe(3)
    expect(score.stats(0, 3, 60).maxCombo).toBe(3)
  })

  it('목숨 손실은 콤보만 끊고 이미 얻은 점수는 깎지 않는다', () => {
    const score = new ScoreManager()
    score.onWordMatched('사과')
    score.onWordMatched('사과')
    score.onSettled(anyVariant(false), ARENA.platformTop)
    const before = score.stats(0, 3, 60)

    score.onLifeLost()
    const after = score.stats(0, 2, 60)

    expect(after.combo).toBe(0)
    expect(after.score).toBe(before.score)
    expect(after.rawScore).toBe(before.rawScore)
    // 최고 기록은 남는다
    expect(after.maxCombo).toBe(2)
  })

  it('오타는 현재 콤보를 끊고 최고 콤보는 유지한다', () => {
    const score = new ScoreManager()
    score.onWordMatched('사과')
    score.onWordMatched('번개')
    score.onInputMissed()

    const stats = score.stats(0, 3, 60)
    expect(stats.combo).toBe(0)
    expect(stats.maxCombo).toBe(2)
  })

  it('콤보 배수가 착지 점수에 곱해진다', () => {
    const plain = new ScoreManager()
    plain.onSettled(anyVariant(false), ARENA.platformTop)

    const combod = new ScoreManager()
    for (let i = 0; i < 5; i += 1) combod.onWordMatched('사과')
    combod.onSettled(anyVariant(false), ARENA.platformTop)

    expect(combod.multiplier).toBeCloseTo(1 + 5 * SCORE.comboStep)
    expect(combod.stats(0, 3, 60).score).toBeGreaterThan(plain.stats(0, 3, 60).score)
  })

  it('콤보 배수에는 상한이 있다', () => {
    const score = new ScoreManager()
    for (let i = 0; i < 500; i += 1) score.onWordMatched('사과')
    expect(score.multiplier).toBe(SCORE.comboMaxMultiplier)
  })

  it('타수는 맞춘 단어의 키 수를 경과 시간으로 나눈 값이다', () => {
    const score = new ScoreManager()
    score.onWordMatched('사과') // 5타
    score.onWordMatched('번개') // 5타
    // 30초에 10타 → 분당 20타
    expect(score.stats(0, 3, 30).kpm).toBe(20)
    // 오타나 놓친 단어는 세지 않으므로 시간만 흐르면 값이 떨어진다
    expect(score.stats(0, 3, 60).kpm).toBe(10)
  })

  it('남은 목숨은 그대로 전달만 한다', () => {
    const score = new ScoreManager()
    expect(score.stats(0, 1, 60).lives).toBe(1)
  })

  it('reset은 모든 상태를 되돌린다', () => {
    const score = new ScoreManager()
    score.onWordMatched('사과')
    score.onSettled(anyVariant(true), ARENA.platformTop + 3)
    score.reset()
    const stats = score.stats(0, 3, 60)
    expect(stats).toMatchObject({
      score: 0,
      stackCount: 0,
      maxHeight: 0,
      combo: 0,
      maxCombo: 0,
      kpm: 0,
      hiddenFound: [],
    })
  })
})
