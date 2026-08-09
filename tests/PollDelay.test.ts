import { describe, expect, it } from 'vitest'
import { POLL_MS, pollDelay } from '../src/rank/queue.ts'

/**
 * 줄에 서서 얼마나 자주 물어볼 것인가.
 *
 * 요청 수는 무료 한도에서 **가장 먼저 차는 값**이고, 실측으로 Durable Object 호출이
 * 워커 요청의 3배였다. 그 대부분이 이 폴링이다.
 *
 * 다만 늦추는 데는 천장이 있다 — **서버가 6초 안에 안 물어보면 줄에서 치운다.**
 * 넘기면 멀쩡히 기다리는 사람이 줄에서 빠지고, 본인은 여전히 기다리는 줄 안다.
 */

/** 서버가 줄에서 치우는 기준(`worker/src/board.ts`의 `QUEUE_STALE_MS`) */
const SERVER_STALE_MS = 6000

describe('묻는 주기', () => {
  it('처음에는 자주 묻는다', () => {
    expect(pollDelay(0)).toBe(POLL_MS)
    expect(pollDelay(10)).toBe(POLL_MS)
  })

  it('기다릴수록 뜸해진다', () => {
    expect(pollDelay(20)).toBeGreaterThan(pollDelay(5))
    expect(pollDelay(60)).toBeGreaterThan(pollDelay(20))
  })

  /*
   * 이 파일이 있는 이유다. 이 선을 넘으면 아끼려던 요청 대신 사람을 잃는다.
   */
  it('서버가 치우는 기준을 넘지 않는다', () => {
    for (const waited of [0, 14, 15, 44, 45, 120, 600, 36000]) {
      expect(pollDelay(waited)).toBeLessThan(SERVER_STALE_MS)
    }
  })

  it('아무리 오래 기다려도 한 값에서 멈춘다', () => {
    expect(pollDelay(600)).toBe(pollDelay(36000))
  })

  it('이상한 값이 와도 기준을 넘지 않는다', () => {
    // 서버 응답이 깨졌거나 시계가 뒤로 갔을 때
    for (const odd of [-1, -1000, Number.NaN]) {
      expect(pollDelay(odd)).toBeLessThan(SERVER_STALE_MS)
      expect(pollDelay(odd)).toBeGreaterThan(0)
    }
  })

  /*
   * 아끼는 양을 적어둔다. 이 숫자가 없으면 "느려진 것 같은데 얼마나 이득이지"를
   * 다시 재게 된다.
   */
  it('5분을 기다리면 요청이 절반 아래로 준다', () => {
    const count = (limitSec: number, delay: (waited: number) => number) => {
      let at = 0
      let n = 0
      while (at < limitSec) {
        at += delay(at) / 1000
        n += 1
      }
      return n
    }
    const before = count(300, () => POLL_MS)
    const after = count(300, pollDelay)
    expect(before).toBe(200)
    expect(after).toBeLessThan(before / 2)
  })
})
