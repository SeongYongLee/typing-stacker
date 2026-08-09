import { useEffect, useState } from 'react'
import type { MatchViewState } from '../multi/MatchEngine.ts'
import { reportMatch, type RankView } from '../rank/client.ts'
import { START_RATING } from '../rank/tiers.ts'

type MatchRankingStatus =
  | 'idle'
  /** 보고했고 상대의 보고를 기다린다 */
  | 'pending'
  | 'ready'
  /** 두 보고가 어긋나 그 판이 없던 것이 됐다 */
  | 'disputed'
  /** 서버에 닿지 못했거나 묶을 기기 id가 없다 */
  | 'offline'

/** 먼저 보고한 쪽이 결과를 다시 물어보는 시점(ms) */
const RETRY_MS = [1500, 4000]

interface MatchRanking {
  readonly status: MatchRankingStatus
  readonly rating: number
  /** 이 판으로 오르내린 폭. 아직 모르면 null */
  readonly delta: number | null
  readonly wins: number
  readonly losses: number
}

/**
 * 판이 끝나면 결과를 한 번 보고하고 새 레이팅을 받아온다.
 *
 * **양쪽이 보고해야 반영된다.** 한쪽 말만 믿으면 "내가 이겼다"를 그냥 보내면 되기
 * 때문이다. 먼저 보고한 쪽은 상대를 기다리고, 두 보고가 어긋나면 그 판은 없던 것이
 * 된다 — 누가 거짓말했는지 가릴 방법이 없다.
 *
 * 오르내린 폭은 **서버가 알려준다.** 이전 값을 클라이언트가 들고 있으면 새로고침
 * 한 번에 사라지고, 판이 이어질 때 어느 시점의 값인지도 흐려진다.
 *
 * 판마다 한 번만 보낸다. 기준은 `matchId`다 — 다음 판이면 시드가 바뀌어 값도 바뀐다.
 */
function useMatchRanking(state: MatchViewState): MatchRanking {
  const [status, setStatus] = useState<MatchRankingStatus>('idle')
  const [view, setView] = useState<RankView | null>(null)

  const over = state.phase === 'over'
  const { matchId } = state
  /*
   * 기기 id와 등수로 옮긴다. 전송로 id는 이 판에서만 쓰는 값이라 레이팅을 묶을 수 없다.
   * 기기 id가 빈 사람이 있으면(옛 버전과 붙었거나 저장소가 막힘) 그 판은 보고하지 않는다.
   */
  const standings = state.standings.map((row) => ({
    id: state.players.find((player) => player.id === row.id)?.device ?? '',
    placement: row.placement,
  }))
  const reportable = standings.length >= 2 && standings.every((row) => row.id.length > 0)
  const key = standings.map((row) => `${row.id}:${row.placement}`).join(',')

  /*
   * "한 번 보냈으면 건너뛴다"는 가드는 쓰지 않는다 — StrictMode가 이펙트를 두 번 돌릴 때
   * 첫 요청은 정리 단계에서 버려지고 두 번째는 건너뛰어 영원히 기다리게 된다.
   * 같은 판을 두 번 보고해도 서버가 같은 줄을 덮어쓸 뿐이라 결과가 달라지지 않는다.
   */
  useEffect(() => {
    if (!over) {
      return
    }
    // 묶을 곳이 없으면 보고하지 않는다 — 옛 버전과 붙었거나 저장소가 막힌 경우다
    if (!reportable) {
      setStatus('offline')
      return
    }
    setStatus('pending')

    let alive = true
    void reportMatch({ matchId, standings }).then(
      (next) => {
        if (!alive) {
          return
        }
        if (next === null) {
          setStatus('offline')
          return
        }
        if (next.error !== undefined) {
          // 서버가 값을 거절했다. 기본 레이팅을 '내 티어'로 보여주면 거짓말이 된다
          setStatus('offline')
          return
        }
        setView(next)
        if (next.disputed === true) {
          setStatus('disputed')
          return
        }
        if (next.pending !== true) {
          setStatus('ready')
          return
        }
        /*
         * 먼저 보고한 쪽이다. 상대의 보고가 도착하면 서버는 레이팅을 고치지만
         * **아무도 이쪽에 알려주지 않는다** — 중계는 게임 메시지만 나르고 랭킹은
         * 요청-응답이다. 그래서 잠깐 뒤에 같은 보고를 다시 보낸다 — 서버가 같은 판을
         * 두 번 세지 않으므로 안전하고, 그때 움직인 폭까지 돌려받는다. 그래도 아직이면
         * 기다리는 상태 그대로 둔다 — 거짓으로 티어를 보여주는 것보다 낫다.
         */
        setStatus('pending')
        for (const wait of RETRY_MS) {
          setTimeout(() => {
            if (!alive) {
              return
            }
            void reportMatch({ matchId, standings }).then((later) => {
              if (alive && later !== null && later.error === undefined && later.pending !== true) {
                setView(later)
                setStatus(later.disputed === true ? 'disputed' : 'ready')
              }
            })
          }, wait)
        }
      },
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, matchId, key, reportable])

  return {
    status,
    rating: view?.rating ?? START_RATING,
    delta: view?.delta ?? null,
    wins: view?.wins ?? 0,
    losses: view?.losses ?? 0,
  }
}

export { useMatchRanking }
export type { MatchRanking }
