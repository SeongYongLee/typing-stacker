import { describe, expect, it } from 'vitest'
import { WORD } from '../src/game/config.ts'
import { FULL, MAX_ON_SCREEN, difficultyAt, forPlayers } from '../src/game/systems/Difficulty.ts'
import { MAX_PLAYERS } from '../src/multi/protocol.ts'

/**
 * 인원에 비례한 단어 밭.
 *
 * 대전에서 차례를 기다리는 사람은 덫을 걸며 손을 놀린다. 덫은 단어를 없애지 않고
 * 표시만 하므로, 사람이 늘면 걸 단어가 곧 바닥난다 — 그때부터 기다리는 사람은
 * 칠 것이 없다. 그래서 사람 수만큼 밭을 넓힌다.
 */

const full = difficultyAt(1)

describe('인원에 비례한 단어 밭', () => {
  it('둘이면 싱글과 똑같다 — 기준이 둘이다', () => {
    expect(forPlayers(full, 2)).toEqual(full)
  })

  it('혼자여도 줄어들지 않는다', () => {
    expect(forPlayers(full, 1)).toEqual(full)
  })

  it('사람이 늘면 동시에 뜨는 수와 나오는 빈도가 함께 오른다', () => {
    const four = forPlayers(full, 4)
    expect(four.maxConcurrent).toBeGreaterThan(full.maxConcurrent)
    expect(four.spawnInterval).toBeLessThan(full.spawnInterval)
  })

  /*
   * 상한만 올리고 빈도를 그대로 두면 자리는 있는데 채워지지 않고,
   * 빈도만 올리면 상한에 막혀 나오다 만다. 둘을 함께 움직여야 한다.
   */
  it('넷이면 둘의 두 배로 자주 나온다', () => {
    expect(forPlayers(full, 4).spawnInterval).toBeCloseTo(full.spawnInterval / 2, 5)
  })

  it('사람이 늘수록 밭이 넓어지기만 한다 — 줄어드는 구간이 없다', () => {
    let previous = forPlayers(full, 2)
    for (let players = 3; players <= MAX_PLAYERS; players += 1) {
      const now = forPlayers(full, players)
      expect(now.maxConcurrent).toBeGreaterThanOrEqual(previous.maxConcurrent)
      expect(now.spawnInterval).toBeLessThanOrEqual(previous.spawnInterval)
      previous = now
    }
  })

  /*
   * 레인 칸이 진짜 상한이다. 자리보다 많이 내보내면 스포너가 조용히 걸러서,
   * 설정만 커지고 화면은 그대로인 상태가 된다.
   */
  it('레인 칸을 넘지 않는다', () => {
    expect(MAX_ON_SCREEN).toBe(WORD.slotsPerSide * 2)
    expect(forPlayers(full, MAX_PLAYERS).maxConcurrent).toBeLessThanOrEqual(MAX_ON_SCREEN)
  })

  it('정원이 다 차도 자리가 남아 밭이 채워진다', () => {
    // 딱 맞으면 좌우 어느 한쪽이 먼저 차서 자리를 못 찾는 단어가 생긴다
    expect(forPlayers(full, MAX_PLAYERS).maxConcurrent).toBeLessThan(MAX_ON_SCREEN + 1)
    expect(MAX_ON_SCREEN).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it('아무리 많아도 숨 쉴 틈은 남긴다', () => {
    expect(forPlayers(full, MAX_PLAYERS).spawnInterval).toBeGreaterThan(0.3)
  })

  it('가장 여유로운 시작 난이도에도 같은 규칙이 걸린다', () => {
    const opening = difficultyAt(0)
    const many = forPlayers(opening, MAX_PLAYERS)
    expect(many.maxConcurrent).toBeGreaterThan(opening.maxConcurrent)
    expect(many.spawnInterval).toBeLessThan(opening.spawnInterval)
    // 떨어지는 속도와 조준은 인원과 무관하다 — 그건 난이도지 밀도가 아니다
    expect(many.fallDuration).toBe(opening.fallDuration)
    expect(many.aimSpeed).toBe(opening.aimSpeed)
    expect(FULL.fallDuration).toBe(opening.fallDuration)
  })
})
