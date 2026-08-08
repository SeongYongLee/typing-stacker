import { WORDS } from '../game/data/words.ts'
import { NICKNAME_MAX, sanitizeNickname } from '../multi/protocol.ts'

/**
 * 이 기기의 신원.
 *
 * 랭킹과 티어는 **판을 넘어 쌓이는 값**이라 "이 기록이 누구 것인지"가 남아야 한다.
 * 계정을 만들지 않기로 했으므로 기기에 id 하나를 두고 그것을 신원으로 쓴다.
 *
 * 그래서 이 신원은 약하다 — 저장소를 지우면 초기화되고 기기를 옮기면 따라오지 않으며,
 * 손으로 고쳐 남의 id를 쓸 수도 있다. **서버는 이 값을 신원의 증거가 아니라
 * "기록을 묶는 이름표"로만 쓴다.** 순위를 지키는 것은 id가 아니라 값의 타당성 검사다.
 *
 * 도감과 같은 층에 둔다 — 여기가 localStorage를 아는 유일한 자리다.
 */
const STORAGE_KEY = 'typing-stacker/profile/v1'

interface Profile {
  /** 기기마다 하나. 서버가 기록을 묶는 열쇠다 */
  readonly id: string
  /** 랭킹과 대전에 보이는 이름 */
  readonly name: string
}

/**
 * 이름을 짓는 것이 게임에 들어가는 문턱이 되면 안 된다.
 * 게임에 나오는 단어 하나를 미리 넣어두면 그대로 시작해도 서로 구분된다.
 */
function suggestName(): string {
  const index = Math.floor(Math.random() * WORDS.length)
  return WORDS[index]?.word ?? '이름없음'
}

function newId(): string {
  // 오래된 브라우저나 안전하지 않은 출처에서는 randomUUID가 없다
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `x${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** 저장된 신원. 없으면 만들어 저장한다 */
function loadProfile(): Profile {
  const stored = read()
  if (stored !== null) {
    return stored
  }
  const made: Profile = { id: newId(), name: suggestName() }
  saveProfile(made)
  return made
}

function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // 저장소가 막혀 있어도(시크릿 모드) 게임은 그대로 돌아간다 — 그 판만 기록이 안 묶인다
  }
}

/** 이름만 바꾼다. id는 그대로 둔다 — 바뀌면 쌓아둔 기록과의 연결이 끊긴다 */
function renameProfile(name: string): Profile {
  const next: Profile = { id: loadProfile().id, name: sanitizeNickname(name) }
  saveProfile(next)
  return next
}

function read(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Profile).id !== 'string' ||
      typeof (parsed as Profile).name !== 'string'
    ) {
      return null
    }
    const { id, name } = parsed as Profile
    if (id.length === 0 || id.length > 64) {
      return null
    }
    return { id, name: name.slice(0, NICKNAME_MAX) }
  } catch {
    return null
  }
}

export { loadProfile, saveProfile, renameProfile, suggestName, STORAGE_KEY }
export type { Profile }
