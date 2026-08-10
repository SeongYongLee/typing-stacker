import { describe, expect, it } from 'vitest'
import { ARENA, MAX_ITEM_HALF_WIDTH } from '../src/game/config/arena.ts'
import { CATCH } from '../src/game/config/items.ts'
import { catchSpot, plankOf, recallDropX, HALF_LENGTH } from '../src/game/systems/Catcher.ts'

/**
 * 회수 판이 지켜야 하는 것들.
 *
 * **어겨도 물리는 멀쩡히 돌아간다.** 판을 잘못 놓아도 물건은 떨어지고 목숨은 세어지고
 * 판은 굴러간다 — 다만 회수돼야 할 물건이 탑에 얹히거나, 판이 탑 속에 박혀 쌓아둔
 * 것을 무너뜨린다. 눈으로만 "왜 저게 얹히지"로 보이는 종류라 값을 만질 때 조용히
 * 깨진다. 그래서 규칙 쪽에서 못 박는다.
 */

/**
 * 회수는 조준을 쓰지 않는다 — 떨구는 자리는 레인이 정한다(`recallDropX`).
 * 그래서 시험도 그 한 자리만 본다. 조준 어디서든 되는지를 보던 예전 판은 판이
 * 아레나를 가로지르는 경우를 통과시켰다.
 */
/** 빈 받침대부터 꽤 쌓인 탑까지 */
const TOPS = [0, ARENA.platformTop, 1.6, 2.4, 3.4]
const SIDES = ['left', 'right'] as const

describe('회수 판을 놓는 자리', () => {
  it('물건을 받침대 밖 손 위에 떨군다', () => {
    for (const side of SIDES) {
      {
        const dropX = recallDropX(side)
        expect(Math.abs(dropX), side).toBeGreaterThan(
          ARENA.platformHalfWidth + MAX_ITEM_HALF_WIDTH * 0.5,
        )
        expect(Math.abs(dropX), side).toBeLessThan(ARENA.halfWidth - MAX_ITEM_HALF_WIDTH * 0.5)
      }
    }
  })

  it('바깥 끝이 받침대 밖으로 나간다', () => {
    for (const side of SIDES) {
      {
        const dropX = recallDropX(side)
        const spot = catchSpot(dropX, side, 1.6)
        /*
         * 받침대 가장자리에서 멈추면 미끄러진 물건이 그 아래 탑의 어깨로 떨어진다 —
         * 회수한 줄 알았는데 얹히는 것이라 가장 나쁘다.
         */
        expect(Math.abs(spot.outerX), `${side} · ${dropX}`).toBeGreaterThan(
          ARENA.platformHalfWidth + MAX_ITEM_HALF_WIDTH * 0.5,
        )
        // 아레나 밖까지 나가면 판이 화면 밖에서 끝난다
        expect(Math.abs(spot.outerX)).toBeLessThan(ARENA.halfWidth)
      }
    }
  })

  it('바깥 끝이 안쪽보다 낮다 — 미끄러져 나가야 회수다', () => {
    for (const side of SIDES) {
      {
        const dropX = recallDropX(side)
        const spot = catchSpot(dropX, side, 1.6)
        expect(spot.outerY, `${side} · ${dropX}`).toBeLessThan(spot.innerY)
      }
    }
  })

  /** 탑 속에 생기면 회수가 아니라 붕괴다 */
  it('판 전체가 탑 꼭대기보다 위에 있다', () => {
    for (const side of SIDES) {
      {
        const dropX = recallDropX(side)
        for (const top of TOPS) {
          const spot = catchSpot(dropX, side, top)
          const lowest = Math.min(spot.innerY, spot.outerY)
          const floor = Math.max(top, ARENA.platformTop)
          expect(lowest, `${side} · ${dropX} · 탑 ${top}`).toBeGreaterThan(floor)
        }
      }
    }
  })

  it('빼내는 쪽이 단어가 내려온 레인을 따른다', () => {
    expect(recallDropX('left')).toBeLessThan(0)
    expect(recallDropX('right')).toBeGreaterThan(0)
  })
})

describe('물리와 그림이 쓰는 꼴', () => {
  it('두 끝을 가운데·길이·기울기로 바꾼다', () => {
    const spot = catchSpot(0.4, 'right', 1.6)
    const plank = plankOf(spot)
    expect(plank.x).toBeCloseTo((spot.innerX + spot.outerX) / 2, 6)
    expect(plank.y).toBeCloseTo((spot.innerY + spot.outerY) / 2, 6)
    expect(plank.halfLength * 2).toBeCloseTo(
      Math.hypot(spot.outerX - spot.innerX, spot.outerY - spot.innerY),
      6,
    )
  })

  /**
   * **길이가 늘 같아야 한다.** 조준을 따라가던 예전 규칙에서는 왼쪽 단어를 오른쪽
   * 끝에 조준하면 판이 5.42m(아레나 폭의 85%)까지 늘어, 1.4초 동안 다른 낙하 물건까지
   * 전부 받아냈다 — 배출구가 공중 발판이 됐다. 그림(손)도 그만큼 늘어난다.
   */
  it('좌우 어느 쪽이든 판 길이가 같다', () => {
    for (const side of SIDES) {
      {
        const plank = plankOf(catchSpot(recallDropX(side), side, 1.6))
        expect(plank.halfLength, side).toBeCloseTo(HALF_LENGTH, 6)
      }
    }
  })

  it('기울기가 좌우 대칭이다', () => {
    const left = plankOf(catchSpot(0, 'left', 1.6))
    const right = plankOf(catchSpot(0, 'right', 1.6))
    // 왼쪽으로 빼면 왼쪽이 낮고, 오른쪽으로 빼면 오른쪽이 낮다
    expect(Math.abs(Math.sin(left.angle))).toBeCloseTo(Math.abs(Math.sin(right.angle)), 6)
    expect(Math.tan(Math.abs(right.angle))).toBeCloseTo(CATCH.slope, 6)
  })
})
