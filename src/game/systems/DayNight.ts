/**
 * 180초 조명 주기를 낮과 밤의 화면 상태로 바꾼다.
 * 이 값은 배경과 시계 표현만 바꾸며 게임 규칙이나 난이도에는 영향을 주지 않는다.
 */
type Phase = 'day' | 'night'

interface TimeOfDay {
  readonly phase: Phase
  /** 이 국면 안에서 얼마나 왔는가(0~1) */
  readonly progress: number
  /** 밤 그림이 얼마나 보이는가(0~1). 국면 경계에서는 이어서 변한다 */
  readonly nightfall: number
}

/** 시계에서 낮과 밤이 차지하는 비율. 기존 눈금 구성을 유지한다. */
const DAY_CLOCK_SHARE = 2 / 3
/** 낮 점수 게이지의 마지막 12.5%에서 해가 진다. */
const DUSK_PROGRESS = 0.125
/** 밤의 마지막 25%에서 다시 밝아진다. */
const DAWN_PROGRESS = 0.25

/** 엔진이 정한 국면과 진행도를 화면에서 쓸 낮·밤 상태로 바꾼다. */
function timeOfDay(phase: Phase, progress: number): TimeOfDay {
  const at = clamp01(progress)
  if (phase === 'day') {
    return {
      phase: 'day',
      progress: at,
      // 이번 낮의 점수 목표에 가까워지면 미리 어두워지기 시작한다.
      nightfall: clamp01((at - (1 - DUSK_PROGRESS)) / DUSK_PROGRESS),
    }
  }

  return {
    phase: 'night',
    progress: at,
    // 밤의 끝자락에서 다시 밝아진다
    nightfall: clamp01((1 - at) / DAWN_PROGRESS),
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/**
 * 시계 한 바퀴 안에서 얼마나 왔는가(0 → 낮의 시작, 1 → 밤의 끝).
 *
 * 낮 구간에서는 그 낮에 정한 점수 목표까지 남은 양이, 밤 구간에서는 남은 시간이
 * 바늘을 움직인다.
 * 기존 눈금판처럼 낮은 3분의 2, 밤은 3분의 1을 차지한다.
 */
function cycleOf(time: TimeOfDay): number {
  if (time.phase === 'day') {
    return clamp01(time.progress * DAY_CLOCK_SHARE)
  }
  return clamp01(DAY_CLOCK_SHARE + time.progress * (1 - DAY_CLOCK_SHARE))
}

export {
  timeOfDay,
  cycleOf,
  DAY_CLOCK_SHARE,
  DUSK_PROGRESS,
  DAWN_PROGRESS,
}
export type { Phase, TimeOfDay }
