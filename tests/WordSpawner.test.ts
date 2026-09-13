import { describe, expect, it } from 'vitest'
import { WordSpawner } from '../src/game/systems/WordSpawner.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import { FULL as DIFFICULTY } from '../src/game/systems/Difficulty.ts'
import { WORDS } from '../src/game/data/words.ts'
import { WORD } from '../src/game/config.ts'

function run(spawner: WordSpawner, seconds: number): void {
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    spawner.update(dt, DIFFICULTY)
  }
}

describe('WordSpawner', () => {
  it('첫 업데이트에 바로 첫 단어가 나온다', () => {
    const spawner = new WordSpawner(createRng(1), WORDS)
    spawner.update(1 / 60, DIFFICULTY)
    expect(spawner.words).toHaveLength(1)
  })

  it('지연 시작 옵션이면 첫 단어도 생성 주기를 기다린다', () => {
    const spawner = new WordSpawner(createRng(1), WORDS, null, { startImmediately: false })
    const difficulty = { ...DIFFICULTY, spawnInterval: 2.5 }

    spawner.update(2.49, difficulty)
    expect(spawner.words).toHaveLength(0)
    spawner.update(0.02, difficulty)
    expect(spawner.words).toHaveLength(1)
  })

  it.each([42, 7, 3])('seed %i: 활성 글자·슬롯이 중복되지 않고 용량을 지킨다', (seed) => {
    const spawner = new WordSpawner(createRng(seed), WORDS)
    const dt = 1 / 60
    for (let t = 0; t < 60; t += dt) {
      spawner.update(dt, DIFFICULTY)
      const active = spawner.words.filter((word) => word.state === 'active')
      const texts = active.map((word) => word.word)
      expect(new Set(texts).size).toBe(texts.length)
      expect(active.length).toBeLessThanOrEqual(DIFFICULTY.maxConcurrent)
      for (const side of ['left', 'right'] as const) {
        const slots = active.filter((word) => word.side === side).map((word) => word.slot)
        expect(new Set(slots).size).toBe(slots.length)
        for (const slot of slots) {
          expect(slot).toBeGreaterThanOrEqual(0)
          expect(slot).toBeLessThan(WORD.slotsPerSide)
        }
      }
    }
  })

  it('바닥선에 닿으면 missed가 되고 미스로 집계된다', () => {
    const spawner = new WordSpawner(createRng(5), WORDS)
    run(spawner, 30)
    expect(spawner.missedCount).toBeGreaterThan(0)
  })

  it('missed 단어는 페이드 후 목록에서 사라진다', () => {
    const spawner = new WordSpawner(createRng(5), WORDS)
    spawner.setScripted(true)
    spawner.spawnScripted(WORDS[0]!.word)
    const id = spawner.words[0]!.id
    expect(spawner.words[0]!.state).toBe('active')
    run(spawner, DIFFICULTY.fallDuration + 0.1)
    expect(spawner.words.find((word) => word.id === id)?.state).toBe('missed')
    run(spawner, 5)
    expect(spawner.words.some((word) => word.id === id)).toBe(false)
  })

  it('remove는 해당 단어만 즉시 지운다', () => {
    const spawner = new WordSpawner(createRng(9), WORDS)
    run(spawner, 8)
    const before = spawner.words.length
    const target = spawner.words[0]
    expect(target).toBeDefined()
    spawner.remove(target!.id)
    expect(spawner.words).toHaveLength(before - 1)
    expect(spawner.words.some((word) => word.id === target!.id)).toBe(false)
  })

  it('같은 시드는 같은 단어 순서를 낸다', () => {
    const a = new WordSpawner(createRng(1234), WORDS)
    const b = new WordSpawner(createRng(1234), WORDS)
    run(a, 60)
    run(b, 60)
    expect(a.words.map((word) => word.word)).toEqual(b.words.map((word) => word.word))
    expect(a.missedCount).toBe(b.missedCount)
  })

  it('reset은 모든 상태를 되돌린다', () => {
    const spawner = new WordSpawner(createRng(1), WORDS)
    run(spawner, 30)
    spawner.reset()
    expect(spawner.words).toHaveLength(0)
    expect(spawner.missedCount).toBe(0)
    spawner.update(1 / 60, DIFFICULTY)
    expect(spawner.words).toHaveLength(1)
  })

})
