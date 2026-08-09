import { useEffect, useState } from 'react'
import { fetchRatings } from '../rank/client.ts'
import type { PlayerInfo } from '../multi/protocol.ts'

/**
 * 준비 화면에 선 사람들의 레이팅.
 *
 * **누구와 붙는지 시작 전에 알아야 한다.** 판이 끝나고서야 상대가 어느 티어였는지
 * 아는 것은 늦다 — 그때는 이길지 질지가 이미 정해진 뒤다.
 *
 * 서버에 물어본다. 각자 자기 티어를 실어 보내게 하면 아무 값이나 적을 수 있고,
 * 다이아라고 적힌 상대와 붙는 것이 실제와 다른 판이 된다.
 *
 * 명단이 바뀔 때만 다시 묻는다 — 사람이 드나드는 동안에는 준비 화면이 자주 다시
 * 그려지는데, 그때마다 물어보면 여덟이 모이는 사이에 수십 번이 된다.
 */
function useRosterTiers(players: readonly PlayerInfo[]): ReadonlyMap<string, number> {
  const [ratings, setRatings] = useState<ReadonlyMap<string, number>>(EMPTY)

  // 기기 id를 이어 붙인 것이 곧 "명단이 바뀌었는가"다
  const key = players
    .map((player) => player.device)
    .sort()
    .join(',')

  useEffect(() => {
    if (key.length === 0) {
      return
    }
    let alive = true
    void fetchRatings(key.split(',')).then((found) => {
      if (alive) {
        setRatings(found)
      }
    })
    return () => {
      alive = false
    }
  }, [key])

  return ratings
}

/** 아직 못 받았을 때 돌려주는 빈 표. 매번 새로 만들면 화면이 계속 다시 그려진다 */
const EMPTY: ReadonlyMap<string, number> = new Map()

export { useRosterTiers }
