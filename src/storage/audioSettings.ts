/**
 * 소리 설정을 브라우저에 남긴다.
 *
 * `collection.ts`와 같은 자리다 — localStorage를 아는 곳은 `storage/`뿐이고,
 * 게임 로직은 브라우저를 모른다.
 *
 * 저장된 값은 사용자가 손으로 고칠 수 있으므로 그대로 믿지 않는다. 값이 망가져
 * 있으면 기본값으로 돌아간다 — 소리 설정 하나 때문에 게임이 열리지 않으면 안 된다.
 */
interface AudioSettings {
  readonly muted: boolean
  /** 전체 음량 0~1 */
  readonly volume: number
  /** 배경음악을 틀지. 효과음과 따로 두는 이유는 끄고 싶은 이유가 서로 다르기 때문이다 */
  readonly bgm: boolean
}

const STORAGE_KEY = 'typing-stacker/audio/v1'

/**
 * 배경음악은 기본으로 켜두되 음량은 절반보다 조금 위에 둔다.
 * 처음 들어온 사람에게 소리가 아예 안 나면 "없는 기능"이 되고,
 * 크게 나면 그 판을 끄고 시작하게 된다.
 */
const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  volume: 0.5,
  bgm: true,
}

function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.volume
  }
  return Math.min(Math.max(value, 0), 1)
}

function loadAudioSettings(): AudioSettings {
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
      muted: record.muted === true,
      volume: clampVolume(record.volume),
      // 없던 값이면 켜둔다 — 기본값과 같은 판단이다
      bgm: record.bgm !== false,
    }
  } catch {
    // 저장소가 막혀 있어도(시크릿 모드) 게임은 시작되어야 한다
    return DEFAULT_SETTINGS
  }
}

function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 저장에 실패해도 이번 판의 소리는 그대로 난다
  }
}

export { loadAudioSettings, saveAudioSettings, DEFAULT_SETTINGS, STORAGE_KEY }
export type { AudioSettings }
