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
}

const STORAGE_KEY = 'typing-stacker/display/v1'

/** 기본은 원래대로 다 흔들린다. 끄고 싶은 사람이 끄는 것이지 기본을 줄이지는 않는다 */
const DEFAULT_SETTINGS: DisplaySettings = {
  shake: 1,
}

function clampShake(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.shake
  }
  return Math.min(Math.max(value, 0), 1)
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
    return { shake: clampShake((parsed as Record<string, unknown>).shake) }
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
