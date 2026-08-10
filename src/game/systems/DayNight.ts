import { DAY_SEC, NIGHT_SEC } from '../config.ts'

/**
 * 판의 시간 — 낮과 Night Fever.
 *
 * 낮에는 평소처럼 타이핑해 쌓고, 밤에는 레시피 재료가 더 촘촘하게 나오며
 * `NightFever`가 레시피 묶음을 직접 떨군다. 화면·음악·무적 규칙이 모두 이 국면을
 * 함께 보므로, **화면이 밤이면 Fever**라는 한 가지 계약만 남는다.
 *
 * 낙하 속도와 단어 밀도는 여기서 바꾸지 않는다. 그쪽은 탑 높이를 따라가는
 * `Difficulty`의 책임이고, 시간은 어떤 종류의 기회가 열리는지만 정한다.
 */
type Phase = 'day' | 'night'

interface TimeOfDay {
  readonly phase: Phase
  /** 이 국면 안에서 얼마나 왔는가(0~1) */
  readonly progress: number
  /** 밤 그림이 얼마나 보이는가(0~1). 국면 경계에서는 이어서 변한다 */
  readonly nightfall: number
}

/** 해가 지고 뜨는 데 걸리는 시간(초) */
const TWILIGHT_SEC = 2.5

/** 판을 낮에서 시작해 `DAY_SEC + NIGHT_SEC` 주기로 반복한다. */
function timeOfDay(elapsedSec: number): TimeOfDay {
  const cycle = DAY_SEC + NIGHT_SEC
  const at = ((elapsedSec % cycle) + cycle) % cycle

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

/**
 * 한 주기 안에서 얼마나 왔는가(0 → 낮의 시작, 1 → 밤의 끝).
 *
 * 낮이 밤보다 길므로 눈금판에서도 낮이 더 넓은 각을 차지한다. 바늘은 판을 여는
 * 순간부터 등속으로 돌며, 한 바퀴가 정확히 낮 20초와 밤 10초다.
 */
function cycleOf(time: TimeOfDay): number {
  const cycle = DAY_SEC + NIGHT_SEC
  if (time.phase === 'day') {
    return clamp01((time.progress * DAY_SEC) / cycle)
  }
  return clamp01((DAY_SEC + time.progress * NIGHT_SEC) / cycle)
}

export { timeOfDay, cycleOf, TWILIGHT_SEC }
export type { Phase, TimeOfDay }
