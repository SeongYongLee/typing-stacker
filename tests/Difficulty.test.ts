import { describe, expect, it } from 'vitest'
import { DIFFICULTY } from '../src/game/systems/Difficulty.ts'
import { WORD } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'

/**
 * 난이도는 고정값 하나다. 시간에 따라 오르지 않으므로 곡선을 검사할 것이 없고,
 * 대신 이 값이 다른 규칙과 어긋나지 않는지만 지킨다 — 여기가 깨지면 스폰이 막히거나
 * 단어가 화면에 앉을 자리를 못 찾는다.
 */
describe('DIFFICULTY', () => {
  it('동시 낙하 상한이 레인 칸 수를 넘지 않는다', () => {
    expect(DIFFICULTY.maxConcurrent).toBeLessThanOrEqual(WORD.slotsPerSide * 2)
  })

  it('동시 낙하 상한이 단어 풀보다 작다 — 같으면 스폰이 막힌다', () => {
    // 활성 단어의 중복을 막으므로 상한이 풀 크기에 닿으면 고를 단어가 남지 않는다
    expect(DIFFICULTY.maxConcurrent).toBeLessThan(WORDS.length)
  })

  it('단어를 칠 시간이 있다 — 낙하 시간이 스폰 간격보다 넉넉하다', () => {
    expect(DIFFICULTY.fallDuration).toBeGreaterThan(DIFFICULTY.spawnInterval * 2)
  })

  it('화살표는 왕복하는 데 걸리는 시간이 사람이 읽을 수 있는 범위다', () => {
    const roundTrip = 2 / DIFFICULTY.aimSpeed
    expect(roundTrip).toBeGreaterThan(2)
    expect(roundTrip).toBeLessThan(8)
  })
})
