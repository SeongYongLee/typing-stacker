import { RELAY_URL } from '../multi/relayUrl.ts'
import type { RunStats } from '../game/types/game.ts'
import { loadProfile } from '../storage/profile.ts'
import {
  clearPendingRun,
  loadPendingRun,
  queuePendingRun,
  type PendingRun,
} from '../storage/pendingRun.ts'
import { START_RATING } from './tiers.ts'

/**
 * 랭킹 서버와 이야기하는 통로.
 *
 * **랭킹이 안 되어도 게임은 그대로 돌아가야 한다.** 서버가 죽었든 네트워크가 막혔든
 * 판을 끝낸 사람이 결과 화면조차 못 보는 일은 없어야 하므로, 이 층의 모든 실패는
 * null로 되돌아온다. 호출부는 "아직 모른다"와 "0위"를 구분해서 보여준다.
 */

/** 중계와 같은 서버다. ws를 http로 바꿔 쓴다 */
const BASE = RELAY_URL.replace(/^ws/, 'http')

/** 응답을 기다리는 상한. 넘으면 랭킹 없이 결과 화면을 보여준다 */
const TIMEOUT_MS = 6000

interface RunRecord {
  readonly id: string
  readonly name: string
  /** 순위표에 함께 뜨는 물건 id. 안 골랐거나 옛 기록이면 빈 문자열 */
  readonly icon?: string
  readonly score: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly maxCombo: number
  readonly kpm: number
}

interface RankView {
  /** 서버가 값을 거절했다. 화면은 이것을 "순위 없음"과 구분해서 보여준다 */
  readonly error?: string
  /** 거절된 값. 서버 제한과 클라이언트 모양 오류를 구분해 안내하고 재전송하는 데 쓴다 */
  readonly reason?: string
  /** 내 최고 기록. 아직 하나도 없으면 null */
  readonly best: RunRecord | null
  /** 내 순위(1부터). 기록이 없으면 null */
  readonly rank: number | null
  readonly top: readonly RunRecord[]
  /**
   * 레이팅 순위. 대전 쪽의 순위표다.
   *
   * 옛 서버는 이 값을 모른다 — 그때는 빈 배열이라 화면이 조용히 순위표만 감춘다.
   */
  readonly ladder: readonly LadderRecord[]
  readonly rating: number
  readonly wins: number
  readonly losses: number
  /** 방금 보고한 대전으로 오르내린 폭. 서버만 알 수 있는 값이다 */
  readonly delta?: number
  /** 상대의 보고를 기다리는 중 */
  readonly pending?: boolean
  /** 두 보고가 어긋나 그 판을 없던 것으로 했다 */
  readonly disputed?: boolean
}

interface LadderRecord {
  readonly id: string
  readonly name: string
  readonly icon?: string
  readonly rating: number
  readonly wins: number
  readonly losses: number
}

const EMPTY: RankView = {
  best: null,
  rank: null,
  top: [],
  ladder: [],
  rating: START_RATING,
  wins: 0,
  losses: 0,
}

/** 판이 끝나면 기록을 보내고 순위를 받는다 */
async function submitRun(stats: RunStats): Promise<RankView | null> {
  const profile = loadProfile()
  const pending = queuePendingRun({
    id: profile.id,
    name: profile.name,
    icon: profile.icon,
    score: Math.round(stats.score),
    stackCount: stats.stackCount,
    maxHeight: stats.maxHeight,
    maxCombo: stats.maxCombo,
    kpm: stats.kpm,
    durationSec: stats.durationSec,
  })
  return sendPendingRun(pending)
}

/** 타이틀 재진입이나 온라인 복귀 때 남아 있는 기록을 다시 보낸다. */
async function flushPendingRun(): Promise<RankView | null> {
  const pending = loadPendingRun()
  return pending === null ? null : sendPendingRun(pending)
}

async function sendPendingRun(pending: PendingRun): Promise<RankView | null> {
  const result = await post('/rank/run', pending)
  if (result !== null && result.error === undefined) {
    // 서버가 실제로 받은 기록만 치운다. 제한 불일치는 서버 배포 뒤 나아질 수 있다.
    clearPendingRun(pending)
  }
  return result
}

/**
 * 대전 한 판의 결과를 보고한다.
 *
 * **참가자 전원이** 같은 `matchId`로 같은 등수를 보내야 반영된다 — 한 사람 말만 믿으면
 * "내가 1등"을 그냥 보내면 되기 때문이다. 하나라도 어긋나면 서버가 그 판을 없던 것으로 한다.
 */
async function reportMatch(input: {
  matchId: string
  /** 기기 id와 등수. 1이 마지막까지 버틴 사람이고, 함께 탈락하면 같은 값이다 */
  standings: readonly { readonly id: string; readonly placement: number }[]
}): Promise<RankView | null> {
  const profile = loadProfile()
  return post('/rank/match', {
    matchId: input.matchId,
    reporter: profile.id,
    name: profile.name,
    standings: input.standings,
  })
}

/**
 * 여럿의 레이팅을 한 번에 본다. 준비 화면에서 **누구와 붙는지** 보여주려는 것이다.
 *
 * **각자 자기 레이팅을 실어 보내게 하지 않는다.** 그렇게 하면 아무 티어나 적어
 * 보낼 수 있고, 다이아라고 적힌 상대와 붙는 것이 실제와 다른 판이 된다.
 * 서버가 기기 id로 자기 표를 찾아 답한 것만 믿는다.
 *
 * 닿지 못한 사람은 목록에서 빠진다 — 화면은 그 사람의 티어를 비워둔다.
 * 한 명 때문에 전부 안 보이는 것보다 낫다.
 */
async function fetchRatings(
  deviceIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const found = new Map<string, number>()
  const wanted = [...new Set(deviceIds.filter((id) => id.length > 0))]
  await Promise.all(
    wanted.map(async (id) => {
      const one = await get(`/rank/me?id=${encodeURIComponent(id)}`)
      if (one !== null && typeof one.rating === 'number') {
        found.set(id, one.rating)
      }
    }),
  )
  return found
}

/** 지금 내 기록과 상위 목록 */
async function fetchRank(): Promise<RankView | null> {
  const profile = loadProfile()
  const [, me, top] = await Promise.all([
    flushPendingRun(),
    get(`/rank/me?id=${encodeURIComponent(profile.id)}`),
    get('/rank/top'),
  ])
  if (me === null && top === null) {
    return null
  }
  return { ...EMPTY, ...(me ?? {}), ...(top ?? {}) }
}

async function post(path: string, body: unknown): Promise<RankView | null> {
  const raw = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return raw === null ? null : { ...EMPTY, ...raw }
}

async function get(path: string): Promise<Partial<RankView> | null> {
  return request(path, { method: 'GET' })
}

async function request(path: string, init: RequestInit): Promise<Partial<RankView> | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}${path}`, { ...init, signal: abort.signal })
    if (!response.ok) {
      return null
    }
    const parsed: unknown = await response.json()
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<RankView>) : null
  } catch {
    // 서버가 없어도 게임은 끝까지 돌아간다 — 랭킹만 비워둔다
    return null
  } finally {
    clearTimeout(timer)
  }
}

export { submitRun, flushPendingRun, reportMatch, fetchRank, fetchRatings, EMPTY }
export type { RankView, RunRecord, LadderRecord }
