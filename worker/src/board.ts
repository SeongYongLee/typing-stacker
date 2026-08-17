/**
 * 기록 저장소 — 싱글 랭킹과 대전 레이팅.
 *
 * **전역 Durable Object 하나**다. 방과 달리 기록은 한 곳에 모여야 순위를 매길 수 있다.
 * 하나뿐이라 쓰기가 직렬화되지만, 판이 끝날 때만 한 번 오가므로 이 규모에서는 문제가 없다.
 *
 * ## 무엇을 믿고 무엇을 믿지 않는가
 *
 * 물리도 점수도 전부 브라우저에 있어서 **서버는 점수를 재현할 수 없다.** 리플레이 검증은
 * Workers 무료 플랜의 요청당 CPU 10ms로는 불가능하다. 그래서 이 서버가 하는 일은
 * "맞는 점수인지 확인"이 아니라 **"사람이 낼 수 있는 값인지"**를 보는 것뿐이다.
 * 작정한 사람은 막지 못한다. 대신 성실한 사람의 순위가 터무니없는 값에 밀리지는 않는다.
 *
 * 대전 결과는 다르게 막는다 — **양쪽이 보고해서 일치할 때만** 반영한다. 한쪽 말만 믿으면
 * "내가 이겼다"를 그냥 보내면 되기 때문이다.
 *
 * ## 자동매칭도 여기 있다
 *
 * 짝을 찾으려면 **그 사람의 레이팅을 알아야 하는데**, 그 값을 클라이언트가 보내게 하면
 * 아무 티어나 적어 보낼 수 있다. 레이팅의 주인이 이 저장소라 큐도 여기 둔다 —
 * 들어온 기기 id로 표를 직접 찾아 쓰므로 아무것도 믿지 않아도 된다.
 */

import { findPair, waitedSecOf, bandOf, type Waiting } from './matching.ts'
import { START_RATING, TIERS, tierIndexOf } from './tiers.ts'
import { LIMITS, runLimitViolation } from './runLimits.ts'

/** 기기 id의 최대 길이. UUID가 36자다 */
const MAX_ID = 64
/** 판 이름의 최대 길이. 시드 + 기기 id 둘을 이어 붙이므로 id 하나보다 훨씬 길다 */
const MAX_MATCH_ID = 200
const MAX_NAME = 12
/** 한 판에 들어올 수 있는 인원. 서버가 먼저 늘어나야 클라이언트를 나중에 올릴 수 있다 */
const MAX_PLAYERS = 8
/** 랭킹에 돌려주는 인원 */
const TOP = 20

/**
 * 싱글 규칙이 크게 바뀔 때 올린다. 이전 기록은 지우지 않고 다른 규칙판으로 보관한다.
 *
 * 1은 2026-08-17 이전 규칙이다. 2부터 현재 스테이지·난이도 규칙을 사용한다.
 */
const CURRENT_SOLO_RULESET = 2

/** 티어 순위에 돌려주는 인원. 화면은 다섯 줄만 그리지만 여유를 둔다 */
const LADDER_TOP = 10

/** 자동매칭으로 맺는 인원 */
const QUEUE_MATCH_SIZE = 2

/**
 * 이만큼 물어보지 않으면 줄에서 치운다.
 *
 * 브라우저는 창을 닫을 때 알려주지 않으므로 **멎은 것으로만 사라진 것을 안다.**
 * 물어보는 주기(1.5초)의 몇 배로 둔다 — 짧으면 잠깐 끊긴 사람이 줄에서 빠지고,
 * 길면 이미 없는 사람과 짝이 맺어져 아무도 오지 않는 방이 열린다.
 */
const QUEUE_STALE_MS = 6000

/** 방 코드. 클라이언트의 것과 같은 글자만 쓴다 — 헷갈리는 l·o·i·1·0을 뺀 것이다 */
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const ROOM_CODE_LENGTH = 8

interface QueueRow {
  device: string
  name: string
  since: number
  seen: number
  code: string | null
}

interface RunRow {
  id: string
  name: string
  /**
   * 순위표에 함께 뜨는 물건 id. 안 골랐으면 빈 문자열.
   *
   * **물건 표를 여기서 보지 않는다.** 서버가 아는 물건 목록을 들고 있으면 아트가 늘 때마다
   * 워커를 함께 배포해야 하고, 안 하면 새 물건을 고른 사람만 아이콘이 사라진다.
   * 모양만 보고 통과시키고, 그릴 수 있는지는 화면이 판단한다.
   */
  icon: string
  score: number
  stackCount: number
  maxHeight: number
  maxCombo: number
  kpm: number
  at: number
}

/** 저장하지 않지만 서버 검증에는 필요한 한 판의 전체 입력. */
interface RunInput extends RunRow {
  durationSec: number
}

interface RatingRow {
  id: string
  name: string
  rating: number
  wins: number
  losses: number
  at: number
}

/*
 * 티어 표는 따로 산다. 순위를 매기는 이곳과 짝을 찾는 곳(matching)이 같은 경계를
 * 봐야 하는데, 여기 두면 한쪽이 import하면서 서로를 부르게 된다.
 */


/**
 * 한 판이 움직이는 폭.
 *
 * 판수가 적을 때 크게 움직여야 자기 자리를 빨리 찾는다. 그 뒤에는 작게 움직여야
 * 한 판의 운으로 등급이 출렁이지 않는다.
 */
function kFactor(games: number): number {
  if (games < 10) return 48
  if (games < 30) return 32
  return 24
}

/**
 * 여러 명이 붙은 판의 레이팅.
 *
 * N명 한 판을 **모든 쌍의 1대1 판**으로 본다. 4명이면 6판이다. 각 쌍에서 더 오래
 * 버틴 쪽이 이긴 것으로 치고, 쌍마다 Elo를 굴려 더한 뒤 (인원-1)로 나눈다 —
 * 나누지 않으면 사람이 늘수록 한 판의 무게가 커진다.
 *
 * **격차가 클수록 변동이 0에 가까워진다.** 그래서 약한 상대를 반복해 이겨도 얻는
 * 것이 없고, 매칭 없이도 파밍이 자연히 막힌다. 반대로 그런 상대에게 지면 크게 잃는다.
 *
 * 등수가 아니라 **기대와의 차이**가 기준이라, 판의 평균보다 낮은 사람은 4명 중
 * 2등만 해도 오른다. 둘이 붙으면 평범한 1대1 Elo와 정확히 같은 값이 나온다.
 *
 * src/rank/elo.ts에 같은 함수가 있다(화면이 미리 보여주는 데 쓴다). 워커는 앱 코드를
 * 가져올 수 없어 옮겨 적었다 — 고칠 때 두 곳을 함께 봐야 한다.
 */
interface Standing {
  readonly id: string
  readonly rating: number
  readonly games: number
  /** 1이 가장 늦게까지 버틴 사람. 같이 무너지면 같은 값을 준다 */
  readonly placement: number
}

function expected(mine: number, theirs: number): number {
  return 1 / (1 + 10 ** ((theirs - mine) / 400))
}

function rateMatch(standings: readonly Standing[]): Map<string, number> {
  const deltas = new Map<string, number>()
  if (standings.length < 2) {
    for (const one of standings) deltas.set(one.id, 0)
    return deltas
  }
  const opponents = standings.length - 1
  for (const me of standings) {
    let sum = 0
    for (const other of standings) {
      if (other.id === me.id) continue
      const result =
        me.placement === other.placement ? 0.5 : me.placement < other.placement ? 1 : 0
      sum += result - expected(me.rating, other.rating)
    }
    deltas.set(me.id, Math.round((kFactor(me.games) * sum) / opponents))
  }
  return deltas
}

export class Board {
  private readonly sql: SqlStorage

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql
    /*
     * 이미 만들어진 표에는 `CREATE TABLE IF NOT EXISTS`가 손대지 않는다.
     * 아이콘은 나중에 붙은 칸이라, 돌고 있는 방에는 이렇게 따로 넣어줘야 한다.
     * 두 번째부터는 "이미 있다"로 실패하므로 그냥 넘긴다 — 표를 먼저 뒤져보는 것보다
     * 이쪽이 짧고, 실패해도 잃는 것이 없다.
     */
    try {
      this.sql.exec("ALTER TABLE runs ADD COLUMN icon TEXT NOT NULL DEFAULT ''")
    } catch {
      /* 이미 있는 칸이다 */
    }
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL,
        stackCount INTEGER NOT NULL,
        maxHeight REAL NOT NULL,
        maxCombo INTEGER NOT NULL,
        kpm INTEGER NOT NULL,
        at INTEGER NOT NULL
      )
    `)
    /*
     * `runs`는 첫 랭킹부터 쓰던 표라 규칙이 바뀐 기록을 갈라 담을 수 없다. 지우면 대전
     * 순위표가 여기서 가져오던 아이콘도 함께 사라지므로, 프로필과 규칙별 기록을 각각
     * 분리한 뒤 옛 기록을 규칙 1로 옮겨 둔다. INSERT OR IGNORE라 생성자 재실행도 안전하다.
     */
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        at INTEGER NOT NULL
      )
    `)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS solo_runs (
        ruleset INTEGER NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL,
        stackCount INTEGER NOT NULL,
        maxHeight REAL NOT NULL,
        maxCombo INTEGER NOT NULL,
        kpm INTEGER NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (ruleset, id)
      )
    `)
    this.sql.exec(`
      INSERT OR IGNORE INTO profiles (id, name, icon, at)
      SELECT id, name, icon, at FROM runs
    `)
    this.sql.exec(`
      INSERT OR IGNORE INTO solo_runs
        (ruleset, id, name, icon, score, stackCount, maxHeight, maxCombo, kpm, at)
      SELECT 1, id, name, icon, score, stackCount, maxHeight, maxCombo, kpm, at FROM runs
    `)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ratings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rating INTEGER NOT NULL,
        wins INTEGER NOT NULL,
        losses INTEGER NOT NULL,
        at INTEGER NOT NULL
      )
    `)
    /*
     * 대전 결과는 양쪽이 보고해야 반영된다. 먼저 온 보고를 여기 두고 짝을 기다린다.
     * 판 하나(matchId)에 보고 하나 — 같은 사람이 두 번 보내도 덮어쓴다.
     */
    /*
     * 이미 반영한 판. **같은 판이 두 번 반영되면 안 된다** — 보고는 재시도될 수 있고
     * (새로고침, 이펙트 이중 실행) 그때마다 레이팅이 또 움직이면 한 판이 두 판이 된다.
     */
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        matchId TEXT PRIMARY KEY,
        aId TEXT NOT NULL,
        aDelta INTEGER NOT NULL,
        bId TEXT NOT NULL,
        bDelta INTEGER NOT NULL,
        at INTEGER NOT NULL
      )
    `)
    /*
     * 반영을 마친 판과 사람마다 움직인 폭. 인원이 둘로 고정되지 않으므로 JSON으로 담는다.
     * 같은 판이 두 번 반영되면 한 판이 두 판이 되므로 여기 있는지부터 본다.
     */
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS results (
        matchId TEXT PRIMARY KEY,
        deltas TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `)
    /*
     * 짝을 기다리는 보고.
     *
     * **이름이 reports가 아니라 reports_v2인 이유**: 이미 배포된 인스턴스에 1대1 시절의
     * reports 표가 남아 있는데, `CREATE TABLE IF NOT EXISTS`는 있는 표를 바꾸지 않는다.
     * 그대로 두면 새 열에 넣으려다 매번 터진다. 옛 표는 건드리지 않고 새 이름을 쓴다 —
     * 담긴 것은 아직 안 끝난 판의 보고뿐이라 잃어도 그 판만 다시 보고하면 된다.
     */
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS reports_v2 (
        matchId TEXT NOT NULL,
        reporter TEXT NOT NULL,
        standings TEXT NOT NULL,
        name TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (matchId, reporter)
      )
    `)
    /*
     * 자동매칭에서 짝을 기다리는 사람들.
     *
     * `since`는 줄에 선 시각이고 `seen`은 마지막으로 물어본 시각이다. **둘을 갈라야 한다** —
     * 대역은 기다린 만큼 넓어지므로 `since`가 움직이면 안 되고, 창을 닫고 사라진 사람은
     * `seen`이 멎는 것으로만 알 수 있다(브라우저는 떠날 때 알려주지 않는다).
     *
     * `code`는 짝이 맺어진 뒤 들어간다. 지우지 않고 남겨두는 이유는 응답이 한 번
     * 유실되어도 다음에 물어볼 때 같은 값을 받아야 하기 때문이다 — 한쪽만 방으로
     * 들어가면 그 사람은 아무도 오지 않는 방에서 혼자 기다린다.
     */
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        device TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        since INTEGER NOT NULL,
        seen INTEGER NOT NULL,
        code TEXT
      )
    `)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (request.method === 'GET' && path === '/rank/top') {
        return json({ top: this.top(), ladder: this.ladder(), tiers: TIERS })
      }
      if (request.method === 'GET' && path === '/rank/me') {
        return json(this.me(url.searchParams.get('id') ?? ''))
      }
      if (request.method === 'POST' && path === '/rank/run') {
        return json(this.submitRun(await request.json()))
      }
      if (request.method === 'POST' && path === '/rank/match') {
        return json(this.reportMatch(await request.json()))
      }
      if (request.method === 'GET' && path === '/rank/queue/size') {
        return json(this.queueSize())
      }
      if (request.method === 'POST' && path === '/rank/queue') {
        return json(this.enterQueue(await request.json()))
      }
      if (request.method === 'POST' && path === '/rank/queue/leave') {
        return json(this.leaveQueue(await request.json()))
      }
    } catch {
      // 망가진 본문 하나로 서버가 500을 뱉지 않게 한다 — 게임은 이 응답 없이도 돌아간다
      return json({ error: 'bad-request' }, 400)
    }
    return json({ error: 'not-found' }, 404)
  }

  /** 싱글 기록. 기기마다 **최고 기록 하나만** 남긴다 */
  private submitRun(raw: unknown): unknown {
    const run = readRun(raw)
    if (run === null) {
      return { error: 'invalid', reason: 'shape' }
    }
    const violation = runLimitViolation(run)
    if (violation !== null) {
      return { error: 'invalid', reason: violation }
    }

    this.sql.exec(
      `INSERT INTO profiles (id, name, icon, at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, icon = excluded.icon, at = excluded.at`,
      run.id, run.name, run.icon, Date.now(),
    )

    const best = this.bestOf(run.id)

    if (best === null || run.score > best.score) {
      this.sql.exec(
        `INSERT INTO solo_runs
           (ruleset, id, name, icon, score, stackCount, maxHeight, maxCombo, kpm, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ruleset, id) DO UPDATE SET
           name = excluded.name, icon = excluded.icon, score = excluded.score,
           stackCount = excluded.stackCount,
           maxHeight = excluded.maxHeight, maxCombo = excluded.maxCombo,
           kpm = excluded.kpm, at = excluded.at`,
        CURRENT_SOLO_RULESET, run.id, run.name, run.icon, run.score, run.stackCount,
        run.maxHeight, run.maxCombo, run.kpm, Date.now(),
      )
    } else if (best.name !== run.name || best.icon !== run.icon) {
      // 기록은 그대로 두고 이름과 아이콘만 따라간다 — 바꿨는데 순위표만 옛것이면 헷갈린다
      this.sql.exec(
        'UPDATE solo_runs SET name = ?, icon = ? WHERE ruleset = ? AND id = ?',
        run.name, run.icon, CURRENT_SOLO_RULESET, run.id,
      )
    }

    return { best: this.bestOf(run.id), rank: this.rankOf(run.id), top: this.top() }
  }

  /**
   * 대전 결과. **참가자 전원이 같은 말을 할 때만** 레이팅을 고친다.
   *
   * 한 사람 말만 믿으면 "내가 1등"을 그냥 보내면 된다. 그렇다고 다수결로 하면
   * 셋이 짜고 한 명을 몰아낼 수 있으므로, 하나라도 어긋나면 그 판은 없던 것으로
   * 한다 — 누가 거짓말했는지 가릴 방법이 없기 때문이다.
   */
  private reportMatch(raw: unknown): unknown {
    const report = parseReport(raw)
    if (report === null) {
      return { error: 'invalid' }
    }

    /*
     * 이미 반영한 판이면 두 번 세지 않는다. 대신 **그때 움직인 폭을 기억해 두었다가
     * 그대로 돌려준다** — 먼저 보고한 사람은 그 순간 결과를 몰랐으므로, 다시 물어봤을 때
     * "얼마나 잃었는지"를 못 보면 등급만 덩그러니 바뀌어 있다.
     */
    const done = this.sql
      .exec<{ deltas: string }>('SELECT deltas FROM results WHERE matchId = ?', report.matchId)
      .toArray()[0]
    if (done !== undefined) {
      return {
        applied: true,
        delta: readDeltas(done.deltas)[report.reporter] ?? 0,
        ...this.me(report.reporter),
      }
    }

    this.sql.exec(
      `INSERT INTO reports_v2 (matchId, reporter, standings, name, at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(matchId, reporter) DO UPDATE SET
         standings = excluded.standings, name = excluded.name, at = excluded.at`,
      report.matchId, report.reporter, canonical(report.standings), report.name, Date.now(),
    )

    const filed = this.sql
      .exec<{ reporter: string; standings: string; name: string }>(
        'SELECT reporter, standings, name FROM reports_v2 WHERE matchId = ?',
        report.matchId,
      )
      .toArray()

    // 명단에 있는 사람이 모두 보고해야 한다. 한 명이라도 빠지면 아직 기다린다
    const roster = new Set(report.standings.map((entry) => entry.id))
    const filedBy = new Set(filed.map((row) => row.reporter))
    const everyone = [...roster].every((id) => filedBy.has(id))
    if (!everyone || filed.length < roster.size) {
      return { pending: true, ...this.me(report.reporter) }
    }

    const mine = canonical(report.standings)
    const agree = filed.every((row) => row.standings === mine)
    this.sql.exec('DELETE FROM reports_v2 WHERE matchId = ?', report.matchId)
    if (!agree) {
      return { disputed: true, ...this.me(report.reporter) }
    }

    const names = new Map(filed.map((row) => [row.reporter, row.name]))
    const deltas = this.applyResult(report.standings, names)
    this.sql.exec(
      'INSERT INTO results (matchId, deltas, at) VALUES (?, ?, ?)',
      report.matchId, JSON.stringify(deltas), Date.now(),
    )
    return { applied: true, delta: deltas[report.reporter] ?? 0, ...this.me(report.reporter) }
  }

  /** 등수 명단으로 레이팅을 고치고, 사람마다 움직인 폭을 돌려준다 */
  private applyResult(
    standings: readonly { id: string; placement: number }[],
    names: ReadonlyMap<string, string>,
  ): Record<string, number> {
    const rows = standings.map((entry) => {
      const current = this.ratingOf(entry.id, names.get(entry.id) ?? entry.id)
      return {
        id: entry.id,
        rating: current.rating,
        games: current.wins + current.losses,
        placement: entry.placement,
        row: current,
      }
    })

    const deltas = rateMatch(rows)
    const best = Math.min(...standings.map((entry) => entry.placement))
    const out: Record<string, number> = {}
    for (const entry of rows) {
      const delta = deltas.get(entry.id) ?? 0
      // 1등이면 승, 아니면 패. 같이 1등이면 모두 승이다
      const won = entry.placement === best
      this.saveRating(
        entry.id,
        names.get(entry.id) ?? entry.row.name,
        entry.rating + delta,
        entry.row.wins + (won ? 1 : 0),
        entry.row.losses + (won ? 0 : 1),
      )
      out[entry.id] = delta
    }
    return out
  }

  private ratingOf(id: string, name: string): RatingRow {
    const found = this.sql
      .exec<RatingRow>('SELECT * FROM ratings WHERE id = ?', id)
      .toArray()[0]
    return found ?? { id, name, rating: START_RATING, wins: 0, losses: 0, at: 0 }
  }

  private saveRating(
    id: string,
    name: string,
    rating: number,
    wins: number,
    losses: number,
  ): void {
    this.sql.exec(
      `INSERT INTO ratings (id, name, rating, wins, losses, at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, rating = excluded.rating,
         wins = excluded.wins, losses = excluded.losses, at = excluded.at`,
      id, name, rating, wins, losses, Date.now(),
    )
  }

  private me(id: string): unknown {
    if (id.length === 0) {
      return {}
    }
    const rating = this.sql
      .exec<RatingRow>('SELECT * FROM ratings WHERE id = ?', id)
      .toArray()[0]
    return {
      best: this.bestOf(id),
      rank: this.rankOf(id),
      rating: rating?.rating ?? START_RATING,
      wins: rating?.wins ?? 0,
      losses: rating?.losses ?? 0,
    }
  }

  /**
   * 자동매칭. 줄에 서고, 그때마다 짝이 맺어졌는지 본다.
   *
   * **되풀이해 물어보는 방식이다.** WebSocket을 하나 더 열면 즉시 알릴 수 있지만,
   * 그러면 방으로 붙는 소켓과 큐를 보는 소켓 둘을 동시에 들고 수명을 맞춰야 한다 —
   * 붙는 순간이 곧 소켓을 갈아타는 순간이라 그 경계가 까다롭다. 몇 초 늦게 알려주는
   * 대신 붙일 자리가 적은 쪽을 골랐다. 랭킹과 같은 평범한 fetch다.
   *
   * 짝을 찾는 판단은 `matching.ts`에 있다. 여기서는 표를 읽고 쓰는 일만 한다.
   */
  private enterQueue(raw: unknown): unknown {
    const device = text((raw as Record<string, unknown>)?.['device'], MAX_ID)
    const name = text((raw as Record<string, unknown>)?.['name'], MAX_NAME) ?? '익명'
    if (device === null) {
      return { error: 'invalid' }
    }
    const now = Date.now()

    // 창을 닫고 사라진 사람을 먼저 치운다. 남겨두면 있지도 않은 사람과 짝이 맺어진다
    this.sql.exec('DELETE FROM queue WHERE seen < ?', now - QUEUE_STALE_MS)

    /*
     * 줄에 세운다. **이미 서 있으면 `since`를 그대로 둔다** — 물어볼 때마다 갱신하면
     * 기다린 시간이 늘 0이 되어 대역이 영영 안 넓어진다.
     */
    this.sql.exec(
      `INSERT INTO queue (device, name, since, seen, code)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(device) DO UPDATE SET name = excluded.name, seen = excluded.seen`,
      device, name, now, now,
    )

    const mine = this.queueRowOf(device)
    if (mine?.code != null) {
      return { state: 'matched', code: mine.code, players: QUEUE_MATCH_SIZE }
    }

    const open = this.sql
      .exec<QueueRow>('SELECT * FROM queue WHERE code IS NULL')
      .toArray()
    const waiting: Waiting[] = open.map((row) => ({
      device: row.device,
      rating: this.ratingOf(row.device, row.name).rating,
      since: row.since,
    }))

    const pair = findPair(waiting, now)
    if (pair !== null) {
      const code = roomCode()
      for (const one of pair) {
        this.sql.exec('UPDATE queue SET code = ? WHERE device = ?', code, one.device)
      }
      if (pair.some((one) => one.device === device)) {
        return { state: 'matched', code, players: QUEUE_MATCH_SIZE }
      }
    }

    /*
     * 아직 못 붙었으면 **얼마나 기다렸고 지금 어디까지 받아들이는지**를 함께 알린다.
     * 숫자가 없으면 기다리는 사람은 고장난 것과 구분할 수 없다.
     */
    const self = waiting.find((one) => one.device === device)
    const waited = self === undefined ? 0 : waitedSecOf(self, now)
    const band = bandOf(waited)
    const others = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM queue WHERE code IS NULL')
      .toArray()[0]
    return {
      state: 'waiting',
      waiting: others?.n ?? 1,
      waitedSec: Math.round(waited),
      /** 지금 어디까지 받아들이는가. 화면이 "같은 티어" / "옆 티어까지"로 풀어 쓴다 */
      band: Math.min(band, TIERS.length),
      tier: self === undefined ? 0 : tierIndexOf(self.rating),
    }
  }

  /**
   * 줄에 몇 명이 서 있는지만 본다. **줄에 서지 않고** 묻는 길이다.
   *
   * 로비에서 "지금 몇 명 기다리는 중"을 보여주려면 이것이 필요하다. 누르기 전에
   * 아는 것이 중요한데 — 아무도 없으면 눌러도 한참 기다릴 뿐이고, 그것을 모르면
   * 자동매칭이 고장난 것처럼 보인다.
   *
   * 여기서도 멎은 사람을 먼저 치운다. 그러지 않으면 이미 떠난 사람이 계속 세어져
   * "3명 기다리는 중"인데 눌러도 아무도 만나지 못한다.
   */
  private queueSize(): unknown {
    this.sql.exec('DELETE FROM queue WHERE seen < ?', Date.now() - QUEUE_STALE_MS)
    const row = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM queue WHERE code IS NULL')
      .toArray()[0]
    return { waiting: row?.n ?? 0 }
  }

  /** 줄에서 빠진다. 이것 없이도 `seen`이 멎어 치워지지만, 그동안 남을 헛되게 기다리게 한다 */
  private leaveQueue(raw: unknown): unknown {
    const device = text((raw as Record<string, unknown>)?.['device'], MAX_ID)
    if (device === null) {
      return { error: 'invalid' }
    }
    this.sql.exec('DELETE FROM queue WHERE device = ?', device)
    return { ok: true }
  }

  private queueRowOf(device: string): QueueRow | null {
    return (
      this.sql.exec<QueueRow>('SELECT * FROM queue WHERE device = ?', device).toArray()[0] ??
      null
    )
  }

  private bestOf(id: string): RunRow | null {
    return this.sql
      .exec<RunRow>(
        'SELECT id, name, icon, score, stackCount, maxHeight, maxCombo, kpm, at FROM solo_runs WHERE ruleset = ? AND id = ?',
        CURRENT_SOLO_RULESET, id,
      )
      .toArray()[0] ?? null
  }

  /** 나보다 점수가 높은 사람 수 + 1 */
  private rankOf(id: string): number | null {
    const best = this.bestOf(id)
    if (best === null) {
      return null
    }
    const above = this.sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM solo_runs WHERE ruleset = ? AND score > ?',
        CURRENT_SOLO_RULESET, best.score,
      )
      .toArray()[0]
    return (above?.n ?? 0) + 1
  }

  private top(): RunRow[] {
    return this.sql
      .exec<RunRow>(
        `SELECT id, name, icon, score, stackCount, maxHeight, maxCombo, kpm, at
         FROM solo_runs WHERE ruleset = ? ORDER BY score DESC, at ASC LIMIT ?`,
        CURRENT_SOLO_RULESET, TOP,
      )
      .toArray()
  }

  /**
   * 레이팅 순위. 대전 쪽의 순위표다.
   *
   * **한 판도 안 한 사람은 없다** — `ratings`에는 결과를 보고한 사람만 들어온다.
   * 시작값(1000)뿐인 줄이 순위표를 채우면 아무 의미가 없다.
   *
   * 아이콘은 싱글 규칙판과 분리된 `profiles`에서 가져온다. 싱글 랭킹을 새 규칙으로
   * 넘겨도 대전 순위표의 얼굴이 함께 사라지지 않아야 한다.
   */
  private ladder(): unknown[] {
    return this.sql
      .exec(
        `SELECT r.id, r.name, r.rating, r.wins, r.losses,
                COALESCE(u.icon, '') AS icon
         FROM ratings r LEFT JOIN profiles u ON u.id = r.id
         ORDER BY r.rating DESC, r.at ASC LIMIT ?`,
        LADDER_TOP,
      )
      .toArray()
  }
}

/** 물건 id로 쓸 수 있는 모양인가. 표에 있는지는 그리는 쪽이 본다 */
function iconId(raw: unknown): string {
  return typeof raw === 'string' && /^[a-z0-9-]{1,40}$/.test(raw) ? raw : ''
}

/** 외부 테스트와 진단에서 쓰는 완전한 기록 파서. */
function parseRun(raw: unknown): RunInput | null {
  const run = readRun(raw)
  return run !== null && runLimitViolation(run) === null ? run : null
}

/** 본문 모양만 읽는다. 제한 위반은 호출부가 이유와 함께 답할 수 있도록 따로 검사한다. */
function readRun(raw: unknown): RunInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  const id = text(value['id'], MAX_ID)
  const name = text(value['name'], MAX_NAME)
  const icon = iconId(value['icon'])
  const score = int(value['score'])
  const stackCount = int(value['stackCount'])
  const maxCombo = int(value['maxCombo'])
  const kpm = int(value['kpm'])
  const maxHeight = num(value['maxHeight'])
  const duration = num(value['durationSec'])

  if (
    id === null || name === null || score === null || stackCount === null ||
    maxCombo === null || kpm === null || maxHeight === null || duration === null
  ) {
    return null
  }

  return {
    id, name, icon, score, stackCount, maxHeight, maxCombo, kpm,
    durationSec: duration,
    at: 0,
  }
}

/**
 * 결과 보고를 읽는다.
 *
 * 새 모양은 등수 명단(`standings`)이고, **옛 모양(`winner`/`opponent`)도 그대로 받는다** —
 * 이미 배포된 클라이언트가 그 모양으로 보내기 때문이다. 서버가 먼저 바뀌어야
 * 클라이언트를 나중에 올릴 수 있다.
 */
function parseReport(raw: unknown): {
  matchId: string
  reporter: string
  name: string
  standings: { id: string; placement: number }[]
} | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  const matchId = text(value['matchId'], MAX_MATCH_ID)
  const reporter = text(value['reporter'], MAX_ID)
  const name = text(value['name'], MAX_NAME)
  if (matchId === null || reporter === null || name === null) {
    return null
  }

  const standings = Array.isArray(value['standings'])
    ? parseStandings(value['standings'])
    : parseLegacy(value, reporter)
  if (standings === null) {
    return null
  }
  // 보고한 사람이 명단에 없으면 남의 판을 대신 신고하는 것이다
  if (!standings.some((entry) => entry.id === reporter)) {
    return null
  }
  return { matchId, reporter, name, standings }
}

function parseStandings(raw: readonly unknown[]): { id: string; placement: number }[] | null {
  const seen = new Set<string>()
  const standings: { id: string; placement: number }[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const row = entry as Record<string, unknown>
    const id = text(row['id'], MAX_ID)
    const placement = int(row['placement'])
    if (id === null || placement === null || placement < 1) return null
    // 같은 사람이 두 번 들어가면 자기 몫을 두 번 챙길 수 있다
    if (seen.has(id)) return null
    seen.add(id)
    standings.push({ id, placement })
    if (standings.length > MAX_PLAYERS) return null
  }
  return standings.length >= 2 ? standings : null
}

/** 옛 모양: 이긴 사람 하나와 상대 하나. 무승부는 winner가 빈 문자열이다 */
function parseLegacy(
  value: Record<string, unknown>,
  reporter: string,
): { id: string; placement: number }[] | null {
  const opponent = text(value['opponent'], MAX_ID)
  const winner = typeof value['winner'] === 'string' ? value['winner'].slice(0, MAX_ID) : null
  if (opponent === null || winner === null || opponent === reporter) {
    return null
  }
  const place = (id: string) => (winner === '' ? 1 : winner === id ? 1 : 2)
  return [
    { id: reporter, placement: place(reporter) },
    { id: opponent, placement: place(opponent) },
  ]
}

/** 두 보고가 같은 말인지 문자열 하나로 견줄 수 있게 정렬해 굳힌다 */
function canonical(standings: readonly { id: string; placement: number }[]): string {
  return JSON.stringify(
    [...standings]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((entry) => [entry.id, entry.placement]),
  )
}

function readDeltas(raw: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, number>)
      : {}
  } catch {
    return {}
  }
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function int(value: unknown): number | null {
  const parsed = num(value)
  return parsed === null ? null : Math.floor(parsed)
}

/**
 * 방 코드를 만든다. 서버가 만드는 이유는 자동매칭에서 **두 사람이 같은 코드를 알아야**
 * 하는데 서로를 모르기 때문이다. 코드로 모을 때는 여전히 클라이언트가 만든다.
 */
function roomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  let code = ''
  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]
  }
  return code
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export { TIERS, START_RATING, LIMITS, rateMatch, parseRun, parseReport }
