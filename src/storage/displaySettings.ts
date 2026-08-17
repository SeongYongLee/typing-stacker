/**
 * 화면 설정을 브라우저에 남긴다.
 *
 * `audioSettings.ts`와 같은 자리다 — localStorage를 아는 곳은 `storage/`뿐이다.
 * 저장된 값은 사용자가 손으로 고칠 수 있으므로 그대로 믿지 않는다. 망가져 있으면
 * 기본값으로 돌아간다. 화면 설정 하나 때문에 게임이 열리지 않으면 안 된다.
 */
interface DisplaySettings {
  /**
   * 화면 흔들림의 세기 배수(0~1). 0이면 흔들리지 않는다.
   *
   * 끄는 길을 두는 이유는 취향만이 아니다. 흔들리는 화면이 어지러운 사람이 있고,
   * 이 게임은 무거운 물건이 떨어질 때마다 흔들린다 — 그 사람에게는 못 하는 게임이 된다.
   */
  readonly shake: number
  /**
   * 물건이 얹힐 때 화면에 번지는 색의 세기 배수(0~1). 0이면 번지지 않는다.
   *
   * 흔들림과 따로 두는 이유는 거슬리는 지점이 다르기 때문이다 — 흔들림은 어지럽고
   * 번지는 색은 눈이 피로하다. 하나로 묶으면 색만 끄려는 사람이 흔들림까지 잃는다.
   */
  readonly glow: number
  /**
   * 물건이 움직일 때 흘리는 부스러기의 진하기 배수(0~1). 0이면 흘리지 않는다.
   *
   * 색번짐과 또 따로 두는 이유는 거슬리는 방식이 다르기 때문이다 — 색번짐은 화면
   * 전체가 물들고 부스러기는 움직이는 점이 늘어난다. 움직이는 것에 예민한 사람은
   * 이쪽만 끄고 색은 남겨두고 싶을 수 있다.
   */
  readonly trail: number
  /**
   * 혼자 하기 시작 전에 규칙 화면을 보여줄지.
   *
   * 기본은 보여준다. 다만 규칙을 이미 익힌 사람에게 매 판 같은 화면은 시작 흐름을
   * 끊으므로, 끄는 값을 같은 설정 저장소에 남긴다.
   */
  readonly soloRules: boolean
  /** 첫 플레이 뒤 튜토리얼을 어떻게 제안할지. */
  readonly soloTutorial: 'required' | 'ask' | 'disabled'
}

const STORAGE_KEY = 'typing-stacker/display/v1'

/** 기본은 원래대로 다 흔들리고 다 번진다. 끄고 싶은 사람이 끄는 것이지 기본을 줄이지는 않는다 */
const DEFAULT_SETTINGS: DisplaySettings = {
  shake: 1,
  glow: 1,
  trail: 1,
  soloRules: true,
  soloTutorial: 'required',
}

function clampLevel(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(Math.max(value, 0), 1)
}

function boolSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function tutorialSetting(value: unknown): DisplaySettings['soloTutorial'] {
  return value === 'ask' || value === 'disabled' || value === 'required'
    ? value
    : DEFAULT_SETTINGS.soloTutorial
}

function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return DEFAULT_SETTINGS
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_SETTINGS
    }
    const record = parsed as Record<string, unknown>
    return {
      shake: clampLevel(record.shake, DEFAULT_SETTINGS.shake),
      glow: clampLevel(record.glow, DEFAULT_SETTINGS.glow),
      trail: clampLevel(record.trail, DEFAULT_SETTINGS.trail),
      soloRules: boolSetting(record.soloRules, DEFAULT_SETTINGS.soloRules),
      soloTutorial: tutorialSetting(record.soloTutorial),
    }
  } catch {
    // 저장소가 막혀 있어도(시크릿 모드) 게임은 열려야 한다
    return DEFAULT_SETTINGS
  }
}

function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 저장에 실패해도 이번 판에는 적용되어 있다
  }
}

export { loadDisplaySettings, saveDisplaySettings, DEFAULT_SETTINGS, STORAGE_KEY }
export type { DisplaySettings }
