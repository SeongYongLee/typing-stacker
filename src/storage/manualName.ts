import { NICKNAME_MAX, sanitizeNickname } from '../multi/protocol.ts'

/**
 * 수동 매칭에서 쓰는 이름.
 *
 * **기기 이름과 갈라둔다.** 기기 이름은 순위표에 올라 모두가 보는 값이라 재료로 만들
 * 수 있는 낱말만 받는데(`profile.ts`), 코드를 주고받아 모이는 자리는 아는 사람끼리라
 * 그 제약이 필요없다 — 서로 부르기로 한 이름을 그대로 쓰는 것이 맞다. 그래서 이 이름은
 * 자유 입력이고, 대신 그 방 안에서만 쓰인다(자동매칭·랭킹은 기기 이름을 그대로 쓴다).
 *
 * 저장하는 이유는 **같은 사람들과 다시 할 때 또 적지 않게** 하려는 것이다. 방을 열 때마다
 * 이름을 다시 짓게 하면 그것이 문턱이 된다.
 */
const STORAGE_KEY = 'typing-stacker/manual-name/v1'

/** 지금까지 쓴 이름. 한 번도 없으면 빈 문자열 — 화면은 이때 칸을 비워 잠가둔다 */
function loadManualName(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? '' : clean(raw)
  } catch {
    // 저장소가 막혀 있어도(시크릿 모드) 적어서 쓰는 것은 그대로 된다
    return ''
  }
}

function saveManualName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, clean(name))
  } catch {
    /* 저장만 안 될 뿐이다 */
  }
}

/**
 * 방에 들어갈 수 있는 이름인가.
 *
 * 보이지 않는 글자만 적어 넣는 것을 막는다 — `sanitizeNickname`이 제어문자를 걷어내면
 * 빈 이름이 되고, 그러면 상대 화면에 '이름없음'으로 뜬다. 그건 이름을 적게 한 뜻이 아니다.
 */
function isUsableName(raw: string): boolean {
  return clean(raw).length > 0
}

function clean(raw: string): string {
  const cleaned = sanitizeNickname(raw)
  // sanitizeNickname은 빈 값을 '이름없음'으로 바꾼다. 여기서는 비어 있음을 비어 있음으로 두어야 한다
  return raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().length === 0
    ? ''
    : cleaned.slice(0, NICKNAME_MAX)
}

export { loadManualName, saveManualName, isUsableName, STORAGE_KEY }
