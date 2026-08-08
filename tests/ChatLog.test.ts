import { describe, expect, it } from 'vitest'
import { ChatLog, MAX_LINES, MAX_TEXT, MIN_GAP_MS } from '../src/multi/ChatLog.ts'

/**
 * 주고받은 말.
 *
 * 판이 도는 동안 화면 한쪽에 뜨는 것이라, 여기서 막지 못한 것은 그대로 **남의 시야를
 * 덮는다.** 보내는 쪽에서 거르는 것만으로는 부족하다 — 고쳐 만든 클라이언트는 그
 * 제한을 지나쳐 오기 때문에, 받는 이 자리가 마지막 문이다.
 */

describe('채팅 기록', () => {
  it('보낸 말이 순서대로 쌓인다', () => {
    const log = new ChatLog()
    log.add('가', '방장', '안녕', 0)
    log.add('나', '참가자', '반가워요', 1000)
    expect(log.view.map((line) => line.text)).toEqual(['안녕', '반가워요'])
    expect(log.view.map((line) => line.nickname)).toEqual(['방장', '참가자'])
  })

  it('빈 말은 받지 않는다', () => {
    const log = new ChatLog()
    expect(log.add('가', '방장', '', 0)).toBeNull()
    expect(log.add('가', '방장', '   ', 1000)).toBeNull()
    expect(log.view).toHaveLength(0)
  })

  /*
   * 줄바꿈·제어문자가 섞이면 화면이 깨진다. 보이지 않는 글자만 적어 보내는 것도
   * 빈 말과 같이 다뤄야 한다 — 그러지 않으면 빈 줄로 화면을 밀어낼 수 있다.
   */
  it('보이지 않는 글자를 걷어낸다', () => {
    const log = new ChatLog()
    expect(log.add('가', '방장', '안\n녕\t하세요', 0)?.text).toBe('안녕하세요')
    expect(log.add('나', '참가자', '​​', 0)).toBeNull()
  })

  it('너무 긴 말은 자른다', () => {
    const log = new ChatLog()
    const line = log.add('가', '방장', '가'.repeat(300), 0)
    expect(line?.text.length).toBe(MAX_TEXT)
  })

  /*
   * 한 사람이 연달아 쏟으면 남의 화면을 덮는다. 판이 도는 동안에는 그 자체가 방해라
   * 노림을 없앤 뜻과 어긋난다.
   */
  it('같은 사람이 연달아 보내면 버린다', () => {
    const log = new ChatLog()
    expect(log.add('가', '방장', '하나', 0)).not.toBeNull()
    expect(log.add('가', '방장', '둘', MIN_GAP_MS - 1)).toBeNull()
    expect(log.add('가', '방장', '셋', MIN_GAP_MS)).not.toBeNull()
  })

  it('다른 사람은 같은 순간에도 보낼 수 있다', () => {
    const log = new ChatLog()
    expect(log.add('가', '방장', '하나', 0)).not.toBeNull()
    expect(log.add('나', '참가자', '둘', 0)).not.toBeNull()
  })

  it('오래된 줄은 밀려난다 — 긴 판에서 끝없이 쌓이면 안 된다', () => {
    const log = new ChatLog()
    for (let i = 0; i < MAX_LINES + 10; i += 1) {
      log.add(`p${i}`, '아무개', `말 ${i}`, i * 1000)
    }
    expect(log.view).toHaveLength(MAX_LINES)
    // 가장 최근 것이 남는다
    expect(log.view.at(-1)?.text).toBe(`말 ${MAX_LINES + 9}`)
  })

  /*
   * 화면이 매 프레임 읽는 값이다. 읽을 때마다 새 배열이면 React가 늘 바뀐 것으로 보고
   * 다시 그린다 — 판이 도는 동안 그 비용을 치를 이유가 없다.
   */
  it('바뀌지 않으면 같은 배열을 돌려준다', () => {
    const log = new ChatLog()
    log.add('가', '방장', '안녕', 0)
    expect(log.view).toBe(log.view)
    const before = log.view
    log.add('나', '참가자', '반가워요', 1000)
    expect(log.view).not.toBe(before)
  })
})
