import { describe, expect, it } from 'vitest'
import { ARENA, CAMERA_START_TOP, DIFFICULTY_FULL_HEIGHT, WORD } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import { targetCameraY } from '../src/game/systems/Camera.ts'
import {
  FULL,
  OPENING,
  difficultyAt,
  difficultyProgress,
} from '../src/game/systems/Difficulty.ts'

/**
 * 난이도는 시간이 아니라 탑 높이를 따라간다.
 * 여기서 지키는 것은 두 가지다 — 곡선이 의도한 방향으로 가는지, 그리고 값이
 * 다른 규칙과 어긋나지 않는지. 어긋나면 스폰이 막히거나 칠 시간이 사라진다.
 */

describe('difficultyProgress — 높이가 기준이다', () => {
  it('빈 받침대에서는 0이다', () => {
    expect(difficultyProgress(ARENA.platformTop)).toBe(0)
  })

  it('정해둔 높이만큼 쌓으면 1이 된다', () => {
    expect(difficultyProgress(ARENA.platformTop + DIFFICULTY_FULL_HEIGHT)).toBe(1)
  })

  it('그 위로는 더 오르지 않는다', () => {
    expect(difficultyProgress(ARENA.platformTop + DIFFICULTY_FULL_HEIGHT + 10)).toBe(1)
  })

  it('중간 높이는 중간 값이다', () => {
    expect(difficultyProgress(ARENA.platformTop + DIFFICULTY_FULL_HEIGHT / 2)).toBeCloseTo(
      0.5,
    )
  })

  /*
   * 카메라는 밀도보다 늦게 움직인다.
   *
   * 판이 넓어진 뒤에는 카메라가 먼저 올라가면 받침대와 고양이가 너무 일찍 화면에서
   * 멀어진다. 단어 압박은 기존 높이 곡선을 따르되, 시야는 화면의 2/3 정도가 찬 뒤에야
   * 움직여 아래쪽 판정이 안정적으로 읽히게 한다.
   */
  it('밀도가 다 오른 뒤에도 카메라는 더 늦게 움직인다', () => {
    expect(targetCameraY(CAMERA_START_TOP)).toBe(0)
    expect(targetCameraY(CAMERA_START_TOP + 0.1)).toBeGreaterThan(0)
    expect(difficultyProgress(CAMERA_START_TOP)).toBe(1)
  })

  it('받침대보다 낮아도 음수가 되지 않는다', () => {
    expect(difficultyProgress(ARENA.killY)).toBe(0)
  })
})

describe('difficultyAt — 쌓을수록 몰아친다', () => {
  it('판을 열 때는 단어가 뜸하게 나온다', () => {
    expect(difficultyAt(0).spawnInterval).toBe(OPENING.spawnInterval)
    expect(difficultyAt(0).maxConcurrent).toBe(OPENING.maxConcurrent)
  })

  it('다 오르면 지금까지의 밀도가 된다', () => {
    expect(difficultyAt(1)).toEqual(FULL)
  })

  it('오를수록 더 자주, 더 많이 내려온다', () => {
    let previous = difficultyAt(0)
    for (let t = 0.1; t <= 1; t += 0.1) {
      const current = difficultyAt(t)
      expect(current.spawnInterval).toBeLessThanOrEqual(previous.spawnInterval)
      expect(current.maxConcurrent).toBeGreaterThanOrEqual(previous.maxConcurrent)
      previous = current
    }
  })

  it('범위를 벗어난 값도 안전하다', () => {
    expect(difficultyAt(-5)).toEqual(difficultyAt(0))
    expect(difficultyAt(9)).toEqual(difficultyAt(1))
  })

  it('동시 낙하 상한은 정수다', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(Number.isInteger(difficultyAt(t).maxConcurrent)).toBe(true)
    }
  })
})

describe('난이도가 다른 규칙과 어긋나지 않는다', () => {
  const levels = [OPENING, FULL]

  it('동시 낙하 상한이 레인 칸 수를 넘지 않는다', () => {
    for (const level of levels) {
      expect(level.maxConcurrent).toBeLessThanOrEqual(WORD.slotsPerSide * 2)
    }
  })

  it('동시 낙하 상한이 단어 풀보다 작다 — 같으면 스폰이 막힌다', () => {
    // 활성 단어의 중복을 막으므로 상한이 풀 크기에 닿으면 고를 단어가 남지 않는다
    for (const level of levels) {
      expect(level.maxConcurrent).toBeLessThan(WORDS.length)
    }
  })

  it('단어를 칠 시간이 있다 — 낙하 시간이 스폰 간격보다 넉넉하다', () => {
    for (const level of levels) {
      expect(level.fallDuration).toBeGreaterThan(level.spawnInterval * 2)
    }
  })

  it('화살표 왕복이 사람이 읽을 수 있는 범위다', () => {
    for (const level of levels) {
      const roundTrip = 2 / level.aimSpeed
      expect(roundTrip).toBeGreaterThan(2)
      expect(roundTrip).toBeLessThan(8)
    }
  })
})
