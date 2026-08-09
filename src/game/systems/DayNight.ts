import { DAY_SEC, FIRST_NIGHT_SEC, NIGHT_SEC } from '../config.ts'

/**
 * 판의 시간 — 첫 밤 · 낮 · 밤.
 *
 * ## 무엇을 가르는가
 *
 * 시간이 정하는 것은 **어떤 단어가 내려오는가** 하나뿐이다. 낙하 속도도 밀도도
 * 시간과 무관하다(그쪽은 `Difficulty.ts`가 쌓은 높이로 정한다) — 압박의 축을 둘로
 * 늘리면 서로 겹쳐서 어느 쪽이 판을 끝냈는지 알 수 없게 된다.
 *
 * | 국면 | 내려오는 단어 | 왜 |
 * |---|---|---|
 * | 첫 밤 | 정해둔 재료 두엇 | 치는 족족 짝이 갖춰진다. 합성을 배우는 구간 |
 * | 낮 | 전부 | 판의 보통 상태 |
 * | 밤 | 재료만 | 몰아서 합칠 수 있는 구간 |
 *
 * ## 판은 밤에서 시작한다
 *
 * 첫 밤은 **밭이 가장 좁다.** 낮부터 시작하면 재료가 78개 단어에 흩어져 있어
 * 첫 합성까지 한참 걸리는데, 그 사이에 이 게임이 무엇을 하는 게임인지 배우지 못한 채
 * 판이 끝난다. 밤으로 열면 처음 몇 번의 타자로 합성을 본다.
 *
 * 첫 밤은 한 번뿐이고 그 뒤로는 낮과 밤이 번갈아 돈다 — 배우는 구간이 되풀이되면
 * 그때부터는 배울 것이 없는데 밭만 좁아진 구간이 된다.
 *
 * 브라우저도 물리도 모르는 순수 함수라 node에서 그대로 시험한다.
 */

type Phase = 'firstNight' | 'day' | 'night'

interface TimeOfDay {
  readonly phase: Phase
  /** 이 국면 안에서 얼마나 왔는가(0~1). 시계 바늘이 이 값으로 돈다 */
  readonly progress: number
  /**
   * 밤에 얼마나 잠겼는가(0~1). 낮이면 0, 밤이면 1.
   *
   * 국면이 바뀌는 순간 화면이 툭 바뀌지 않도록 **경계에서 이어서 넘어간다** —
   * 해가 지고 뜨는 것은 순간이 아니다.
   */
  readonly nightfall: number
}

/**
 * 해가 지고 뜨는 데 걸리는 시간(초). 이 동안 두 그림이 겹쳐 넘어간다.
 *
 * 밤보다 넉넉히 짧아야 한다. 저물자마자 다시 밝아지면 밤 한복판조차 완전히 어둡지
 * 않아서, 밤에 온 것이 아니라 스쳐 지나간 것이 된다.
 */
const TWILIGHT_SEC = 2.5

/**
 * 지금 몇 시인가. 판이 흐른 시간만 있으면 된다 —
 * 상태를 들고 있지 않으므로 같은 시각이면 늘 같은 답이다.
 */
function timeOfDay(elapsedSec: number): TimeOfDay {
  if (elapsedSec < FIRST_NIGHT_SEC) {
    return {
      phase: 'firstNight',
      progress: clamp01(elapsedSec / FIRST_NIGHT_SEC),
      // 첫 밤의 끝자락에서 날이 밝기 시작한다
      nightfall: clamp01((FIRST_NIGHT_SEC - elapsedSec) / TWILIGHT_SEC),
    }
  }

  const cycle = DAY_SEC + NIGHT_SEC
  const at = (elapsedSec - FIRST_NIGHT_SEC) % cycle

  if (at < DAY_SEC) {
    return {
      phase: 'day',
      progress: clamp01(at / DAY_SEC),
      // 낮의 끝자락에서 미리 어두워지기 시작한다
      nightfall: clamp01((at - (DAY_SEC - TWILIGHT_SEC)) / TWILIGHT_SEC),
    }
  }

  const intoNight = at - DAY_SEC
  return {
    phase: 'night',
    progress: clamp01(intoNight / NIGHT_SEC),
    // 밤의 끝자락에서 다시 밝아진다
    nightfall: clamp01((NIGHT_SEC - intoNight) / TWILIGHT_SEC),
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

export { timeOfDay, TWILIGHT_SEC }
export type { Phase, TimeOfDay }
