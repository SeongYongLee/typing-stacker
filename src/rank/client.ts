import { RELAY_URL } from '../multi/relayUrl.ts'
import type { RunStats } from '../game/types/game.ts'
import { loadProfile } from '../storage/profile.ts'
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
  readonly score: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly maxCombo: number
  readonly kpm: number
}

interface RankView {
  /** 서버가 값을 거절했다. 화면은 이것을 "순위 없음"과 구분해서 보여준다 */
  readonly error?: string
  /** 내 최고 기록. 아직 하나도 없으면 null */
  readonly best: RunRecord | null
  /** 내 순위(1부터). 기록이 없으면 null */
  readonly rank: number | null
  readonly top: readonly RunRecord[]
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

const EMPTY: RankView = {
  best: null,
  rank: null,
  top: [],
  rating: START_RATING,
  wins: 0,
  losses: 0,
}

/** 판이 끝나면 기록을 보내고 순위를 받는다 */
async function submitRun(stats: RunStats): Promise<RankView | null> {
  const profile = loadProfile()
  return post('/rank/run', {
    id: profile.id,
    name: profile.name,
    score: Math.round(stats.score),
    stackCount: stats.stackCount,
    maxHeight: stats.maxHeight,
    maxCombo: stats.maxCombo,
    kpm: stats.kpm,
    durationSec: stats.durationSec,
  })
}

/**
 * 대전 한 판의 결과를 보고한다.
 *
 * 양쪽이 같은 `matchId`로 보내야 반영된다 — 한쪽 말만 믿으면 "내가 이겼다"를 그냥
 * 보내면 되기 때문이다. 어긋나면 서버가 그 판을 없던 것으로 한다.
 */
async function reportMatch(input: {
  matchId: string
  opponent: string
  /** 이긴 사람의 기기 id. 무승부면 빈 문자열 */
  winner: string
}): Promise<RankView | null> {
  const profile = loadProfile()
  return post('/rank/match', {
    matchId: input.matchId,
    reporter: profile.id,
    opponent: input.opponent,
    winner: input.winner,
    name: profile.name,
  })
}

/**
 * 내 레이팅만 다시 본다.
 *
 * 먼저 보고한 쪽은 그 순간 상대의 보고가 아직 없어 "기다리는 중"을 받는다.
 * 그 뒤로는 아무도 알려주지 않으므로 이쪽에서 한 번 더 물어봐야 결과를 알 수 있다.
 */
async function fetchMyRating(): Promise<RankView | null> {
  const profile = loadProfile()
  const me = await get(`/rank/me?id=${encodeURIComponent(profile.id)}`)
  return me === null ? null : { ...EMPTY, ...me }
}

/** 지금 내 기록과 상위 목록 */
async function fetchRank(): Promise<RankView | null> {
  const profile = loadProfile()
  const [me, top] = await Promise.all([
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

export { submitRun, reportMatch, fetchRank, fetchMyRating, EMPTY }
export type { RankView, RunRecord }
