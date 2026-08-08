import { VARIANT_BY_ID } from '../game/data/words.ts'

/**
 * 도감을 브라우저에 남긴다.
 *
 * 여기가 localStorage를 아는 유일한 자리다. `game/systems`는 브라우저를 몰라야
 * node에서 그대로 테스트가 돌기 때문에, 저장은 경계인 이 파일에 모아둔다.
 *
 * 저장된 값은 사용자가 손으로 고칠 수 있는 곳에 있으므로 그대로 믿지 않는다.
 * 지금 존재하는 물건 id만 통과시키면, 이름이 바뀐 옛 기록이나 장난으로 넣은 값이
 * 도감에 유령 칸으로 남지 않는다.
 */
/*
 * 물건이 20종에서 57종으로 늘면서 판을 새로 열었다. 옛 기록을 그대로 두면
 * 새 물건만 비어 있는 도감이 되어 "어디까지 모았나"가 뒤섞인다.
 */
const STORAGE_KEY = 'typing-stacker/collection/v2'

function loadCollection(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (id): id is string => typeof id === 'string' && VARIANT_BY_ID.has(id),
    )
  } catch {
    // 저장소가 막혀 있거나(시크릿 모드) 값이 망가졌어도 게임은 시작되어야 한다
    return []
  }
}

function saveCollection(ids: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // 저장에 실패해도 이번 판은 그대로 진행된다
  }
}

export { loadCollection, saveCollection, STORAGE_KEY }
