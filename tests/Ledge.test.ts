import { describe, expect, it } from 'vitest'
import { AIM_HALF_RANGE, ARENA, LEDGE, MAX_ITEM_HALF_WIDTH } from '../src/game/config.ts'
import { placeLedge, type Occupied } from '../src/game/systems/Ledge.ts'
import { createRng } from '../src/game/systems/Rng.ts'

function item(x: number, y: number, hw = 0.3, hh = 0.3): Occupied {
  return { x, y, hw, hh }
}

function asLedge(spot: { x: number; y: number; halfWidth: number }): Occupied {
  return { x: spot.x, y: spot.y, hw: spot.halfWidth, hh: LEDGE.halfHeight }
}

/** 아직 아무것도 못 쌓은 판 */
const EMPTY_TOP = ARENA.platformTop

describe('통나무를 놓을 자리', () => {
  /*
   * 이것이 이 규칙의 존재 이유다. 화살표가 닿지 못하는 곳에 놓으면 거기에 떨굴 수가
   * 없어 "자리를 하나 더 준다"가 성립하지 않는다 — 밀려난 물건을 받는 그물이 될 뿐이다.
   *
   * **중심**만 닿으면 된다. 통나무 전체를 범위 안에 넣으려다(±1.5) 통나무가 전부
   * 받침대 위 공중에만 생겨서, 새 자리가 아니라 있던 자리 위 선반이 됐던 적이 있다.
   */
  it('통나무 중심이 조준 범위 안에 들어온다', () => {
    const rng = createRng(1)
    for (let i = 0; i < 50; i += 1) {
      const spot = placeLedge([], [], EMPTY_TOP, rng)
      expect(spot).not.toBeNull()
      expect(Math.abs(spot!.x)).toBeLessThanOrEqual(AIM_HALF_RANGE + 1e-9)
    }
  })

  /*
   * 실기에서 잡힌 것이다. 평균을 내는 목록에는 **아직 떨어지는 중인 물건**도 들어 있어서,
   * 판 앞머리에 공중의 물건 하나뿐일 때 평균이 곧 스폰 높이(4.6)가 됐다. 통나무가
   * 화살표 자리에 서서 조준선을 가로막고 허공에 떠 있었다.
   */
  it('쌓아 올린 것보다 위로는 가지 않는다', () => {
    const flying = [item(0, ARENA.spawnY)]
    const spot = placeLedge(flying, [], EMPTY_TOP, createRng(2))
    expect(spot!.y).toBeLessThanOrEqual(ARENA.platformTop + LEDGE.minClearance + 1e-9)
    expect(spot!.y).toBeLessThan(ARENA.spawnY - 2)
  })

  it('쌓을수록 통나무도 높아진다', () => {
    const low = placeLedge([item(0, 1.2)], [], 1.5, createRng(3))
    const high = placeLedge([item(0, 3.0)], [], 3.3, createRng(3))
    expect(high!.y).toBeGreaterThan(low!.y)
  })

  it('받침대에 붙지 않는다 — 그 아래로 물건이 들어갈 수 있어야 한다', () => {
    const spot = placeLedge([], [], EMPTY_TOP, createRng(4))
    expect(spot!.y).toBeGreaterThanOrEqual(ARENA.platformTop + LEDGE.minClearance)
  })

  /*
   * 받침대 위 공중에 놓이면 이미 쌓을 수 있던 자리를 한 겹 덮는 것뿐이다.
   * 밖으로 나가야 없던 자리가 생기고, 옆으로 흘러내리던 물건도 거기서 걸린다.
   */
  it('받침대 밖을 먼저 고른다', () => {
    const rng = createRng(5)
    for (let i = 0; i < 30; i += 1) {
      const spot = placeLedge([], [], EMPTY_TOP, rng)
      expect(Math.abs(spot!.x)).toBeGreaterThan(ARENA.platformHalfWidth)
    }
  })

  /** 밖이 다 차 있으면 안쪽에라도 놓는다 — 거르는 것보다 덜 좋은 자리가 낫다 */
  it('밖이 막혀 있으면 안쪽으로 물러난다', () => {
    const y = ARENA.platformTop + LEDGE.minClearance
    const blockers = [-2.1, -1.9, 1.9, 2.1].map((x) => item(x, y, 0.7, 0.6))
    const spot = placeLedge(blockers, [], EMPTY_TOP, createRng(6))
    expect(spot).not.toBeNull()
    expect(Math.abs(spot!.x)).toBeLessThanOrEqual(ARENA.platformHalfWidth)
  })

  /*
   * 좁으면 가장 큰 물건이 양쪽으로 삐져나와 놓자마자 굴러떨어진다.
   * 새 자리를 줬는데 쓸 수 있는 물건이 따로 있는 셈이 된다.
   */
  it('아무리 짧아도 가장 큰 물건이 온전히 얹힌다', () => {
    expect(LEDGE.minHalfWidth).toBeGreaterThan(MAX_ITEM_HALF_WIDTH)
  })

  /** 같은 것만 서면 "같은 것이 세 번"이지 새 자리로 안 읽힌다 */
  it('길이와 자리가 판마다 다르다', () => {
    const rng = createRng(7)
    const widths = new Set<number>()
    const xs = new Set<number>()
    for (let i = 0; i < 20; i += 1) {
      const spot = placeLedge([], [], EMPTY_TOP, rng)
      widths.add(spot!.halfWidth)
      xs.add(spot!.x)
      expect(spot!.halfWidth).toBeGreaterThanOrEqual(LEDGE.minHalfWidth)
      expect(spot!.halfWidth).toBeLessThanOrEqual(LEDGE.maxHalfWidth)
    }
    expect(widths.size).toBeGreaterThan(10)
    expect(xs.size).toBeGreaterThan(10)
  })

  /*
   * 물건이 있는 자리에 세우면 통나무가 탑 속에 박혀 물건을 밀어낸다.
   * 스폰 높이가 이미 같은 함정을 겪었다(ARENA.spawnY 주석).
   */
  it('물건이 있는 자리는 피한다', () => {
    const rng = createRng(8)
    const items = [-1.5, -1.1, -0.7, -0.3].map((x) => item(x, 1.8, 0.4, 0.4))
    for (let i = 0; i < 30; i += 1) {
      const spot = placeLedge(items, [], 2.2, rng)
      if (spot === null) continue
      for (const other of items) {
        const gap = Math.abs(spot.x - other.x)
        const vertical = Math.abs(spot.y - other.y)
        expect(
          gap >= spot.halfWidth + other.hw + LEDGE.margin ||
            vertical >= LEDGE.halfHeight + other.hh + LEDGE.margin,
        ).toBe(true)
      }
    }
  })

  /** 억지로 끼워 넣느니 거른다 — 보상이 판을 무너뜨리면 보상이 아니다 */
  it('놓을 곳이 없으면 놓지 않는다', () => {
    const wall = []
    for (let x = -AIM_HALF_RANGE - 1; x <= AIM_HALF_RANGE + 1; x += 0.2) {
      wall.push(item(x, ARENA.platformTop + LEDGE.minClearance, 0.6, 0.6))
    }
    expect(placeLedge(wall, [], EMPTY_TOP, createRng(9))).toBeNull()
  })

  it('상한을 넘겨 놓지 않는다', () => {
    const rng = createRng(10)
    const ledges: Occupied[] = []
    for (let i = 0; i < LEDGE.maxCount + 3; i += 1) {
      const spot = placeLedge([], ledges, EMPTY_TOP, rng)
      if (spot === null) break
      ledges.push(asLedge(spot))
    }
    expect(ledges.length).toBeLessThanOrEqual(LEDGE.maxCount)
  })

  it('이미 선 통나무와도 겹치지 않는다', () => {
    const rng = createRng(11)
    const first = placeLedge([], [], EMPTY_TOP, rng)
    expect(first).not.toBeNull()
    const second = placeLedge([], [asLedge(first!)], EMPTY_TOP, rng)
    if (second !== null) {
      expect(Math.abs(second.x - first!.x)).toBeGreaterThanOrEqual(
        second.halfWidth + first!.halfWidth + LEDGE.margin - 1e-9,
      )
    }
  })

  /** 같은 시드면 같은 자리다. 서버가 같은 판을 다시 돌려 검증할 수 있어야 한다 */
  it('같은 시드는 같은 자리를 준다', () => {
    const a = placeLedge([], [], EMPTY_TOP, createRng(99))
    const b = placeLedge([], [], EMPTY_TOP, createRng(99))
    expect(a).toEqual(b)
  })
})
