import {
  DEFAULT_SETTINGS,
  loadDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from '../../storage/displaySettings.ts'

/**
 * 화면 설정을 페이지 하나가 소유한다.
 *
 * `SoundBoard`가 소리 설정을 들고 있는 것과 같은 자리다. React 상태로 두지 않는
 * 이유도 같다 — 렌더러는 매 프레임 도는데 React 바깥에 있고, 화면이 바뀌어도
 * 설정은 남아 있어야 한다.
 *
 * 첫 호출까지 저장소를 읽지 않는다. 모듈을 불러오는 것만으로 localStorage를 건드리면
 * 테스트(node)에서 터진다 — `game/renderer`는 브라우저에서만 쓰이지만 그 경계를
 * 모듈 로드 시점에 걸어두면 나중에 무엇이 딸려 들어올지 알 수 없다.
 */
let current: DisplaySettings | null = null
const listeners = new Set<() => void>()

function displaySettings(): DisplaySettings {
  if (current === null) {
    current = typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : loadDisplaySettings()
  }
  return current
}

function updateDisplaySettings(patch: Partial<DisplaySettings>): void {
  const next = { ...displaySettings(), ...patch }
  current = next
  saveDisplaySettings(next)
  for (const listener of listeners) {
    listener()
  }
}

function subscribeDisplaySettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 흔들림 세기 배수. 렌더러가 진폭에 곱한다 */
function shakeScale(): number {
  return displaySettings().shake
}

/** 얹힐 때 번지는 색의 세기 배수. 렌더러가 알파에 곱한다 */
function glowScale(): number {
  return displaySettings().glow
}

/** 흘리는 부스러기의 진하기 배수. 0이면 아예 만들지 않는다 */
function trailScale(): number {
  return displaySettings().trail
}

export {
  displaySettings,
  updateDisplaySettings,
  subscribeDisplaySettings,
  shakeScale,
  glowScale,
  trailScale,
}
