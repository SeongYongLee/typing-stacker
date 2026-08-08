import { useEffect, useState } from 'react'
import { fetchQueueSize } from '../rank/queue.ts'

/**
 * 지금 자동매칭 줄에 몇 명이 서 있는지. **줄에 서지 않고** 본다.
 *
 * 누르기 전에 알아야 하는 값이다 — 아무도 없으면 눌러도 한참 기다릴 뿐인데, 그것을
 * 모르면 자동매칭이 고장난 것처럼 보인다.
 *
 * 다시 묻는 주기가 줄에 서 있을 때(1.5초)보다 훨씬 길다. 이쪽은 아직 아무것도
 * 시작하지 않은 사람이 보는 값이라 몇 초 낡아도 되고, 로비를 열어둔 채 두는 사람이
 * 요청을 계속 쓰게 둘 이유가 없다.
 */
const REFRESH_MS = 6000

function useQueueSize(active: boolean): number | null {
  const [waiting, setWaiting] = useState<number | null>(null)

  useEffect(() => {
    if (!active) {
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const ask = async (): Promise<void> => {
      const next = await fetchQueueSize()
      if (!alive) {
        return
      }
      setWaiting(next)
      timer = setTimeout(() => void ask(), REFRESH_MS)
    }

    void ask()
    return () => {
      alive = false
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [active])

  return waiting
}

export { useQueueSize }
