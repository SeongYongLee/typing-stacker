import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunStats } from '../game/types/game.ts'
import { submitRun, type RankView } from '../rank/client.ts'

const RETRY_DELAY_MS = 3000
const MAX_ATTEMPTS = 4

type RankingStatus = 'sending' | 'retrying' | 'ready' | 'offline' | 'rejected'

interface RunRanking {
  readonly status: RankingStatus
  readonly view: RankView | null
  readonly attemptNumber: number
  /** 이번 판이 내 최고 기록을 갈아치웠는지 */
  readonly isBest: boolean
  readonly retry: () => void
}

/** One request at a time, with a bounded retry cycle owned by this result screen. */
function useRunRanking(stats: RunStats, enabled = true): RunRanking {
  const [status, setStatus] = useState<RankingStatus>('sending')
  const [view, setView] = useState<RankView | null>(null)
  const [isBest, setIsBest] = useState(false)
  const [cycle, setCycle] = useState(0)
  const [attemptNumber, setAttemptNumber] = useState(1)
  const busy = useRef(true)
  const latest = useRef(stats)
  latest.current = stats

  // Engine snapshots are fresh objects every frame; retry only for a new result or explicit request.
  const key = `${Math.round(stats.score)}|${stats.stackCount}|${stats.maxCombo}|${stats.kpm}`
  const retry = useCallback(() => {
    if (busy.current) return
    busy.current = true
    setStatus('sending')
    setAttemptNumber(1)
    setCycle(value => value + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      busy.current = true
      setStatus('ready')
      setView(null)
      setIsBest(false)
      return
    }
    const abort = new AbortController()
    const resultStats = latest.current
    let timer: ReturnType<typeof setTimeout> | undefined
    busy.current = true
    setView(null)
    setIsBest(false)

    const send = async (attempt: number) => {
      setAttemptNumber(attempt)
      setStatus('sending')
      const next = await submitRun(resultStats, abort.signal).catch(() => null)
      if (abort.signal.aborted) return
      if (next !== null && next.error === undefined) {
        setView(next)
        setIsBest(next.best !== null && next.best.score === Math.round(resultStats.score))
        setStatus('ready')
        // Success is terminal; stale clicks must not start another submission.
        return
      }
      if (attempt < MAX_ATTEMPTS) {
        setStatus('retrying')
        timer = setTimeout(() => { void send(attempt + 1) }, RETRY_DELAY_MS)
        return
      }
      setView(next)
      setStatus(next === null ? 'offline' : 'rejected')
      busy.current = false
    }
    void send(1)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [key, cycle, enabled])

  return { status, view, attemptNumber, isBest, retry }
}

export { useRunRanking }
export type { RunRanking, RankingStatus }
