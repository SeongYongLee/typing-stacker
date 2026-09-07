import { describe, expect, it } from 'vitest'
import { featuredEntries, recipeWordsFor, SOLO_STAGES } from '../src/game/data/soloStages.ts'
import { tagsOf } from '../src/game/data/itemTags.ts'

describe('싱글 스테이지', () => {
  it('단계가 갈수록 단어 압박과 상자 폭이 줄고 경보 반입은 늘어난다', () => {
    for (let index = 1; index < SOLO_STAGES.length; index += 1) {
      const previous = SOLO_STAGES[index - 1]!
      const stage = SOLO_STAGES[index]!
      expect(stage.difficulty.spawnInterval).toBeLessThanOrEqual(previous.difficulty.spawnInterval)
      if (stage.id > 1) {
        expect(stage.difficulty.fallDuration).toBeLessThanOrEqual(previous.difficulty.fallDuration)
      }
      expect(stage.box.halfWidth).toBeLessThanOrEqual(previous.box.halfWidth)
      expect(stage.congestionDrops).toBeGreaterThanOrEqual(previous.congestionDrops)
    }
  })

  it('튜토리얼에는 경보 물건을 반입하지 않고 정식 스테이지는 열 개부터 세 개씩 늘어난다', () => {
    expect(SOLO_STAGES[0]?.congestionDrops).toBe(0)
    for (const stage of SOLO_STAGES.filter((stage) => stage.id > 0)) {
      expect(stage.congestionDrops).toBe(10 + (stage.id - 1) * 3)
    }
  })

  it('싱글은 스테이지별 동시 단어 상한 대신 레인 전체 열 칸을 쓴다', () => {
    for (const stage of SOLO_STAGES) {
      expect(stage.difficulty.maxConcurrent).toBe(10)
    }
  })

  it('정식 스테이지는 12·11·10·9초로 여유를 줄이고 마지막에 6초가 된다', () => {
    const stages = SOLO_STAGES.filter((stage) => stage.id > 0)
    expect(stages.map((stage) => stage.difficulty.fallDuration)).toEqual([12, 11, 10, 9, 6])
  })

  it('정식 스테이지는 생성 간격이 3초에서 2초까지 0.25초씩 짧아진다', () => {
    expect(SOLO_STAGES[1]?.difficulty.spawnInterval).toBe(3)
    const stages = SOLO_STAGES.filter((stage) => stage.id > 0)
    expect(stages.at(-1)?.difficulty.spawnInterval).toBe(2)
    for (let index = 1; index < stages.length; index += 1) {
      const previous = stages[index - 1]!
      const stage = stages[index]!
      expect(stage.difficulty.spawnInterval).toBe(previous.difficulty.spawnInterval - 0.25)
    }
  })

  it('각 정식 스테이지에는 표시 물건과 태그 물건이 있다', () => {
    for (const stage of SOLO_STAGES.filter((stage) => stage.id > 0)) {
      const entries = featuredEntries(stage)
      expect(entries.length).toBeGreaterThan(3)
      expect(entries.some((entry) => stage.featuredWords.includes(entry.word))).toBe(true)
      expect(entries.some((entry) => tagsOf(entry.word).some((tag) => stage.tags.includes(tag)))).toBe(true)
    }
  })

  it('스테이지 히든의 단어 재료는 후보 풀에 포함된다', () => {
    for (const stage of SOLO_STAGES) {
      const words = new Set(featuredEntries(stage).map((entry) => entry.word))
      for (const word of recipeWordsFor(stage.hiddenResults)) {
        expect(words, `${stage.title}: ${word}`).toContain(word)
      }
    }
  })

})
