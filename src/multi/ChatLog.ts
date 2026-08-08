import type { PlayerId } from './protocol.ts'

/**
 * 주고받은 말.
 *
 * **세션이 들고 엔진이 함께 쓴다.** 채팅은 준비 화면에서도 판이 도는 동안에도 이어져야
 * 하는데, 그 둘은 서로 다른 층이 맡고 있다(세션과 엔진). 기록을 어느 한쪽에 두면
 * 판이 열리는 순간 그때까지의 말이 사라지거나, 같은 것을 두 벌 만들게 된다.
 *
 * 전송로도 화면도 모른다 — node에서 그대로 시험할 수 있어야 한다.
 */

interface ChatLine {
  /** 화면이 같은 줄을 다시 그리지 않게 하는 표시. 들어온 순서이기도 하다 */
  readonly seq: number
  readonly from: PlayerId
  readonly nickname: string
  readonly text: string
}

/** 한 줄의 최대 길이. 길면 화면을 밀어내고, 판이 도는 동안에는 그게 곧 방해가 된다 */
const MAX_TEXT = 60

/**
 * 남겨두는 줄 수.
 *
 * 무한히 쌓으면 긴 판에서 메모리가 늘고 화면도 다 그릴 수 없다. 지나간 말을 되짚는
 * 곳이 아니라 지금 오가는 말을 보는 곳이라 최근 것만 있으면 된다.
 */
const MAX_LINES = 40

/**
 * 같은 사람이 이만큼 안에 또 보내면 버린다.
 *
 * 판이 도는 동안 화면 한쪽에 뜨는 것이라, 한 사람이 연달아 쏟으면 남의 시야를 덮는다.
 * 보내는 쪽에서 막는 것만으로는 부족하다 — 고쳐 만든 클라이언트는 그 제한을 지나친다.
 */
const MIN_GAP_MS = 600

class ChatLog {
  private readonly lines: ChatLine[] = []
  private seq = 0
  private readonly lastAt = new Map<PlayerId, number>()
  /** 매 프레임 새 배열을 만들지 않으려고 들고 있는 사본 */
  private cached: readonly ChatLine[] = []

  /** 받아들였으면 그 줄, 버렸으면 null */
  add(from: PlayerId, nickname: string, text: string, now: number): ChatLine | null {
    const clean = sanitize(text)
    if (clean.length === 0) {
      return null
    }
    const previous = this.lastAt.get(from)
    if (previous !== undefined && now - previous < MIN_GAP_MS) {
      return null
    }
    this.lastAt.set(from, now)

    const line: ChatLine = { seq: (this.seq += 1), from, nickname, text: clean }
    this.lines.push(line)
    if (this.lines.length > MAX_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LINES)
    }
    this.cached = [...this.lines]
    return line
  }

  get view(): readonly ChatLine[] {
    return this.cached
  }
}

/**
 * 보이지 않는 글자를 걷어내고 길이를 자른다.
 *
 * 줄바꿈과 제어문자가 섞이면 화면이 깨지고, 길이를 안 자르면 한 줄로 화면을 덮을 수 있다.
 * 받는 쪽에서도 해야 한다 — 보내는 쪽만 믿으면 고쳐 만든 클라이언트가 그대로 지나간다.
 */
function sanitize(raw: string): string {
  return raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX_TEXT)
}

export { ChatLog, sanitize, MAX_TEXT, MAX_LINES, MIN_GAP_MS }
export type { ChatLine }
