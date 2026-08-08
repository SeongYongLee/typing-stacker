import { useEffect, useRef, useState } from 'react'
import type { RunStats } from '../game/types/game.ts'
import { submitRun, type RankView } from '../rank/client.ts'

type RankingStatus = 'sending' | 'ready' | 'offline'

interface RunRanking {
  readonly status: RankingStatus
  readonly view: RankView | null
  /** 이번 판이 내 최고 기록을 갈아치웠는지 */
  readonly isBest: boolean
}

/**
 * 판이 끝나면 기록을 한 번 보내고 순위를 받아온다.
 *
 * **판을 가리는 기준은 객체가 아니라 내용이다.** 엔진은 매 프레임 새 `stats` 객체를
 * 만들므로 객체 정체성에 매달면 초당 60번 보낸다. 반대로 "한 번 보냈으면 건너뛴다"는
 * 방식도 쓸 수 없다 — StrictMode가 이펙트를 두 번 돌릴 때 첫 요청은 정리 단계에서
 * 버려지고 두 번째는 건너뛰어 영원히 "보내는 중"에 머문다.
 *
 * 그래서 내용 열쇠가 바뀔 때만 다시 보낸다. 같은 열쇠로 두 번 가더라도 서버는
 * 최고 기록 하나만 남기므로 결과가 달라지지 않는다.
 *
 * 실패는 조용히 넘긴다. 서버가 죽었다고 결과 화면을 못 보면 안 된다.
 */
function useRunRanking(stats: RunStats): RunRanking {
  const [status, setStatus] = useState<RankingStatus>('sending')
  const [view, setView] = useState<RankView | null>(null)
  const [isBest, setIsBest] = useState(false)
  const latest = useRef(stats)
  latest.current = stats

  // 판이 끝나면 더 이상 바뀌지 않는 값들이다. 경과 시간은 넣지 않는다 — 흐르는 값이다
  const key = `${Math.round(stats.score)}|${stats.stackCount}|${stats.maxCombo}|${stats.kpm}`

  useEffect(() => {
    let alive = true
    setStatus('sending')
    setView(null)
    setIsBest(false)

    void submitRun(latest.current).then((next) => {
      if (!alive) {
        return
      }
      if (next === null || next.error !== undefined) {
        setStatus('offline')
        return
      }
      setStatus('ready')
      setView(next)
      // 서버가 돌려준 최고 기록이 이번 판이면 갈아치운 것이다
      setIsBest(next.best !== null && next.best.score === Math.round(latest.current.score))
    })
    return () => {
      alive = false
    }
  }, [key])

  return { status, view, isBest }
}

export { useRunRanking }
export type { RunRanking, RankingStatus }
