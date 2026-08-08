/**
 * 소리 설정을 브라우저에 남긴다.
 *
 * `collection.ts`와 같은 자리다 — localStorage를 아는 곳은 `storage/`뿐이고,
 * 게임 로직은 브라우저를 모른다.
 *
 * 저장된 값은 사용자가 손으로 고칠 수 있으므로 그대로 믿지 않는다. 값이 망가져
 * 있으면 기본값으로 돌아간다 — 소리 설정 하나 때문에 게임이 열리지 않으면 안 된다.
 *
 * ## 음량을 둘로 나눈 이유
 *
 * 하나였을 때는 "음악이 거슬린다"와 "소리가 크다"를 구분할 수 없었다. 해법이
 * 정반대인데도 방법이 하나뿐이라, 음악을 줄이려면 필요한 효과음까지 같이 줄여야 했다.
 * 이 게임에서 효과음은 장식이 아니라 **얹혔는지 알려주는 정보**라 그 손해가 크다.
 *
 * 전체 음량은 따로 두지 않는다. 둘의 곱일 뿐이라 같은 일을 두 군데서 하게 되고,
 * 전체를 줄였는데 효과음이 이미 0이면 아무 일도 일어나지 않아 고장난 것처럼 보인다.
 */
interface AudioSettings {
  /** 효과음 음량 0~1 */
  readonly sfxVolume: number
  /** 배경음악 음량 0~1. 0이면 꺼진 것으로 본다 */
  readonly bgmVolume: number
}

const STORAGE_KEY = 'typing-stacker/audio/v1'

/**
 * 처음 들어온 사람에게 소리가 아예 안 나면 "없는 기능"이 되고, 크게 나면 그 판을
 * 끄고 시작하게 된다. 배경음악을 효과음보다 낮게 두는 이유는 이 게임에서 귀가
 * 실제로 쓰는 정보가 얹혔는지·놓쳤는지이기 때문이다.
 */
const DEFAULT_SETTINGS: AudioSettings = {
  sfxVolume: 1,
  bgmVolume: 0.7,
}

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
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
      sfxVolume: clamp01(record.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      /*
       * 음량을 나누기 전에는 배경음악이 켬/끔 하나였다. 그때 저장한 값을 그대로
       * 살려준다 — 껐던 사람에게 다시 음악이 나오면 설정이 무시된 것으로 보인다.
       */
      bgmVolume: clamp01(
        record.bgmVolume,
        record.bgm === false ? 0 : DEFAULT_SETTINGS.bgmVolume,
      ),
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
