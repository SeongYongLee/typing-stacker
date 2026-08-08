import { useEffect, useState } from 'react'
import { fetchRank, type RankView } from '../rank/client.ts'

type LeaderboardStatus = 'loading' | 'ready' | 'offline'

interface Leaderboard {
  readonly status: LeaderboardStatus
  readonly view: RankView | null
}

/**
 * 시작 화면에 보여줄 순위를 한 번 받아온다.
 *
 * 판이 끝난 뒤 쓰는 `useRunRanking`과 달리 **보내지 않고 읽기만** 한다 —
 * 여기서는 아직 아무 판도 하지 않았다.
 *
 * 실패는 조용히 넘긴다. 서버가 죽었다고 시작 화면이 열리지 않으면 안 된다.
 * 그 경우 상태만 offline으로 두고 화면이 알아서 자리를 채운다.
 */
function useLeaderboard(): Leaderboard {
  const [status, setStatus] = useState<LeaderboardStatus>('loading')
  const [view, setView] = useState<RankView | null>(null)

  useEffect(() => {
    let alive = true
    void fetchRank().then((result) => {
      if (!alive) {
        return
      }
      if (result === null) {
        setStatus('offline')
        return
      }
      setView(result)
      setStatus('ready')
    })
    return () => {
      alive = false
    }
  }, [])

  return { status, view }
}

export { useLeaderboard }
export type { Leaderboard, LeaderboardStatus }
