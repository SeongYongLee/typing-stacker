import { describe, expect, it } from 'vitest'
import { ARENA, ARENA_SCREEN_MAX_WIDTH, MIN_VIEWPORT_WIDTH } from '../src/game/config.ts'

/**
 * 최소 뷰포트 폭이 실제 레이아웃과 맞는가.
 *
 * `GameScreen`의 그리드가 `레인 172 + 아레나 260 + 레인 172`이고 여기에 간격과 여백이
 * 붙는다. 그 수치들은 화면 파일에 흩어져 있어서, 누가 레인을 넓히거나 여백을 키우면
 * **최소 폭이 조용히 어긋난다** — 좁은 화면에서만 넘치므로 손에서는 안 보인다.
 *
 * 그래서 여기서 관계를 지킨다. 값을 못 박는 것이 아니라 **넘치지 않는지**를 본다.
 */

/* `GameScreen`의 그리드 값. 그쪽이 바뀌면 여기도 바뀌어야 한다 */
const LANE_MIN = 172
const ARENA_MIN = 260
const LANE_MAX = 340
const GAP = 16
const PADDING_X = 20
const GRID_MAX_WIDTH = 1200

/** 판 화면이 넘치지 않는 가장 좁은 폭 */
const LAYOUT_FLOOR = LANE_MIN * 2 + ARENA_MIN + GAP * 2 + PADDING_X * 2

describe('최소 뷰포트 폭', () => {
  it('레이아웃이 넘치지 않는다', () => {
    expect(MIN_VIEWPORT_WIDTH, `그리드는 ${LAYOUT_FLOOR}px까지 버틴다`).toBeGreaterThanOrEqual(
      LAYOUT_FLOOR,
    )
  })

  /**
   * **"안 깨진다"와 "할 만하다"는 다르다.**
   *
   * 레이아웃 하한(676)에서는 아레나가 260px이라 받침대 4m가 1m당 65px로 그려진다 —
   * 물건이 26~72px, 부스러기가 3~7px이라 무엇이 떨어지는지 눈으로 못 읽는다.
   * 그래서 하한보다 넉넉해야 한다.
   */
  it('레이아웃 하한보다 넉넉하다', () => {
    expect(MIN_VIEWPORT_WIDTH).toBeGreaterThan(LAYOUT_FLOOR)
  })

  /**
   * **최소 폭에서 이미 아레나가 더 커질 수 없다.**
   *
   * 판 화면에 `maxWidth: 1200`이 있어서 그 위로는 아무것도 안 커진다. 최소 폭을
   * 그보다 낮게 잡으면 "여기부터는 설계된 크기가 아니다"를 받아들이는 것이고,
   * 여기서 걸리면 그 타협이 조용히 들어온 것이다.
   *
   * **`ARENA_SCREEN_MAX_WIDTH`(570)와 견주지 않는다.** 그 값은 도달하지 않는다 —
   * 그리드가 1128px(1200 − 여백 − 간격)을 레인 340 둘과 나누므로 아레나는 448에서
   * 멈춘다. 상한이 둘이고 낮은 쪽이 이기는 자리라, 큰 쪽을 기준으로 삼으면
   * 영영 통과하지 못한다.
   */
  it('최소 폭에서 아레나가 더 커질 수 없다', () => {
    expect(arenaAt(MIN_VIEWPORT_WIDTH)).toBe(arenaAt(4000))
  })

  /**
   * 받침대가 아니라 **아레나 전체**가 화면에 들어간다 — 튕겨 나간 물건이 보여야
   * 하기 때문이다(폭 6.4m). 그래서 화면 폭이 곧 물건 크기다.
   *
   * 가장 작은 물건이 0.4m이므로 이것이 읽히면 나머지는 다 읽힌다. 24px는 스티커
   * 아트의 검은 윤곽 안쪽이 뭉개지기 시작하는 크기다.
   */
  it('가장 작은 물건이 읽힐 만큼은 크다', () => {
    const perMeter = arenaAt(MIN_VIEWPORT_WIDTH) / (ARENA.halfWidth * 2)
    const smallest = perMeter * 0.4
    expect(smallest, `가장 작은 물건이 ${smallest.toFixed(0)}px`).toBeGreaterThan(24)
  })
})

/** 이 뷰포트 폭에서 아레나가 몇 px인가. `GameScreen`의 그리드를 그대로 흉내 낸다 */
function arenaAt(viewport: number): number {
  const available = Math.min(viewport, GRID_MAX_WIDTH) - PADDING_X * 2 - GAP * 2
  return Math.min(ARENA_SCREEN_MAX_WIDTH, Math.max(ARENA_MIN, available - LANE_MAX * 2))
}
