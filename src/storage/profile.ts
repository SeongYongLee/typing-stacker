import { isMadeName, joinName, randomName } from '../game/data/nicknames.ts'
import { NICKNAME_MAX } from '../multi/protocol.ts'

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
 * 미리 하나 뽑아두면 그대로 시작해도 서로 구분된다.
 */
function suggestName(): string {
  return joinName(randomName())
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

/**
 * 이름만 바꾼다. id는 그대로 둔다 — 바뀌면 쌓아둔 기록과의 연결이 끊긴다.
 *
 * 재료로 만들 수 있는 이름만 받는다. 순위표는 모두가 보는 자리라 아무 말이나
 * 올라가면 지울 방법이 없고, 지키는 사람도 없다.
 */
function renameProfile(name: string): Profile {
  const next: Profile = {
    id: loadProfile().id,
    name: isMadeName(name) ? name : suggestName(),
  }
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
    /*
     * 저장소는 손으로 고칠 수 있는 자리다. 여기서 검사하지 않으면 자유 입력을
     * 막아둔 뜻이 사라진다 — 값을 고쳐 넣고 순위표에 올리면 그만이다.
     * 재료 밖의 이름이면 새로 뽑는다.
     */
    return {
      id,
      name: isMadeName(name) ? name.slice(0, NICKNAME_MAX) : suggestName(),
    }
  } catch {
    return null
  }
}

export { loadProfile, saveProfile, renameProfile, suggestName, STORAGE_KEY }
export type { Profile }
