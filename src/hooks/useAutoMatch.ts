import { useCallback, useEffect, useRef, useState } from 'react'
import { enterQueue, leaveQueue, pollDelay, type QueueStatus } from '../rank/queue.ts'

/**
 * 자동매칭 줄에 서 있는 동안의 상태.
 *
 * **줄에서 빠지는 것을 빠뜨리면 남이 손해를 본다.** 이미 사라진 사람과 짝이 맺어지면
 * 남은 사람은 아무도 오지 않는 방에서 혼자 기다리다 나와야 한다. 그래서 나가는 길을
 * 전부 막아둔다 — 취소, 화면 벗어남, 탭 닫기.
 *
 * 짝이 맺어지면 되풀이해 묻기를 멈추고 `onMatched`로 방 코드를 넘긴다. 방으로 붙는
 * 일까지 여기서 하지 않는 것은, 그 다음이 세션의 일이고 이 훅은 줄만 보기 때문이다.
 */

interface AutoMatchView {
  /** 줄에 서 있는가 */
  readonly searching: boolean
  readonly status: QueueStatus | null
  readonly start: () => void
  readonly cancel: () => void
}

function cancelAutoMatchSearch(
  active: { current: boolean },
  close: () => void,
  leave: () => Promise<void> = leaveQueue,
): void {
  const wasActive = active.current
  close()
  if (wasActive) {
    void leave()
  }
}

function useAutoMatch(onMatched: (code: string) => void): AutoMatchView {
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState<QueueStatus | null>(null)

  /*
   * 되풀이해 묻는 일이 화면 갱신과 얽히지 않게 ref로 둔다. state로 두면 응답이 올
   * 때마다 이펙트가 다시 돌아 타이머가 겹친다 — 그러면 요청이 회차마다 두 배로 늘어난다.
   */
  const activeRef = useRef(false)
  const matchedRef = useRef(false)
  const onMatchedRef = useRef(onMatched)
  onMatchedRef.current = onMatched

  const stop = useCallback(() => {
    activeRef.current = false
    setSearching(false)
    setStatus(null)
  }, [])

  const cancel = useCallback(() => {
    cancelAutoMatchSearch(activeRef, stop)
  }, [stop])

  const start = useCallback(() => {
    if (activeRef.current) {
      return
    }
    activeRef.current = true
    matchedRef.current = false
    setSearching(true)
    setStatus(null)
  }, [])

  useEffect(() => {
    if (!searching) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null

    const ask = async (): Promise<void> => {
      if (!activeRef.current) {
        return
      }
      const next = await enterQueue()
      if (!activeRef.current) {
        return
      }
      setStatus(next)
      if (next.kind === 'matched') {
        /*
         * 한 번만 넘긴다. 응답이 유실되어 같은 코드를 다시 받는 일이 정상 경로이므로
         * (서버가 짝을 지우지 않고 남겨둔다) 여기서 막지 않으면 방에 두 번 붙는다.
         */
        if (!matchedRef.current) {
          matchedRef.current = true
          activeRef.current = false
          setSearching(false)
          onMatchedRef.current(next.code)
        }
        return
      }
      /*
       * 서버가 이 기능을 모르면 다시 물어봐야 소용없다 — 배포는 저절로 되지 않는다.
       * 줄에 선 것도 아니므로 상태만 남기고 멈춘다.
       */
      if (next.kind === 'unsupported') {
        activeRef.current = false
        return
      }
      /*
       * 오래 기다릴수록 뜸하게 묻는다. 서버가 알려준 대기 시간을 그대로 쓴다 —
       * 이쪽에서 따로 세면 회차를 건너뛰거나 늦게 답이 올 때 두 값이 어긋난다.
       */
      // 닿지 못한 회차는 기다린 시간을 모른다. 그때는 기본 주기로 다시 묻는다
      const waited = next.kind === 'waiting' ? next.waitedSec : 0
      timer = setTimeout(() => void ask(), pollDelay(waited))
    }

    void ask()
    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [searching])

  /*
   * 화면을 벗어나면 줄에서 뺀다. 짝이 맺어져 나가는 경우에는 보내지 않는다 —
   * 그때는 서버가 그 줄을 짝의 표시로 들고 있어야 상대도 같은 코드를 받는다.
   */
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        activeRef.current = false
        void leaveQueue()
      }
    }
  }, [])

  /*
   * 탭을 닫는 경로. 여기서 알리지 않으면 서버가 6초를 기다려야 치우고, 그 사이에
   * 남은 사람이 없는 사람과 짝이 맺어진다. `fetch`는 페이지가 사라지며 끊기므로
   * `sendBeacon`처럼 끝까지 가는 길이 필요하지만, keepalive로 같은 효과를 낸다.
   */
  useEffect(() => {
    const onLeave = (): void => {
      if (activeRef.current) {
        activeRef.current = false
        void leaveQueue()
      }
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  return { searching, status, start, cancel }
}

export { useAutoMatch, cancelAutoMatchSearch }
export type { AutoMatchView }
