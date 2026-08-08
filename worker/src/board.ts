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
 */

/** 기기 id의 최대 길이. UUID가 36자다 */
const MAX_ID = 64
/** 판 이름의 최대 길이. 시드 + 기기 id 둘을 이어 붙이므로 id 하나보다 훨씬 길다 */
const MAX_MATCH_ID = 200
const MAX_NAME = 12
/** 랭킹에 돌려주는 인원 */
const TOP = 20

/**
 * 사람이 낼 수 있는 값의 한계.
 *
 * 넉넉하게 잡는다 — 성실한 사람이 걸리는 쪽이 조작을 놓치는 쪽보다 훨씬 나쁘다.
 * 한계에 닿는 기록이 실제로 나오기 시작하면 그때 올린다.
 */
const LIMITS = {
  /** 두벌식 기준 분당 키 수. 세계 기록권이 700~900타다 */
  kpm: 1500,
  /** 물건 하나를 떨궈 자리 잡기까지 최소로 걸리는 시간(초) */
  secondsPerItem: 0.8,
  /** 물건 하나가 벌 수 있는 점수의 상한 (기본 + 높이 + 콤보 배수 + 히든) */
  scorePerItem: 3000,
  /** 한 판에 쌓을 수 있다고 보는 개수 */
  stackCount: 500,
  /** 받침대 위로 쌓을 수 있다고 보는 높이(m) */
  height: 40,
} as const

interface RunRow {
  id: string
  name: string
  score: number
  stackCount: number
  maxHeight: number
  maxCombo: number
  kpm: number
  at: number
}

interface RatingRow {
  id: string
  name: string
  rating: number
  wins: number
  losses: number
  at: number
}

/** 레이팅 시작값. 티어 구간의 한가운데에 둔다 */
const START_RATING = 1000

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
 * Elo. **격차가 클수록 변동이 0에 가까워진다** — 이것이 매칭 없이도 약한 상대를
 * 반복해 이기는 파밍을 막는 장치다. 기대 승률이 0.95면 이겨도 K의 5%밖에 못 얻는다.
 * 반대로 그런 상대에게 지면 크게 잃는다. 그 비대칭이 억제력이다.
 */
function nextRating(mine: number, theirs: number, won: boolean, games: number): number {
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400))
  const delta = kFactor(games) * ((won ? 1 : 0) - expected)
  return Math.round(mine + delta)
}

export class Board {
  private readonly sql: SqlStorage

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        stackCount INTEGER NOT NULL,
        maxHeight REAL NOT NULL,
        maxCombo INTEGER NOT NULL,
        kpm INTEGER NOT NULL,
        at INTEGER NOT NULL
      )
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
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        matchId TEXT NOT NULL,
        reporter TEXT NOT NULL,
        winner TEXT NOT NULL,
        opponent TEXT NOT NULL,
        name TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (matchId, reporter)
      )
    `)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (request.method === 'GET' && path === '/rank/top') {
        return json({ top: this.top(), tiers: TIERS })
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
    } catch {
      // 망가진 본문 하나로 서버가 500을 뱉지 않게 한다 — 게임은 이 응답 없이도 돌아간다
      return json({ error: 'bad-request' }, 400)
    }
    return json({ error: 'not-found' }, 404)
  }

  /** 싱글 기록. 기기마다 **최고 기록 하나만** 남긴다 */
  private submitRun(raw: unknown): unknown {
    const run = parseRun(raw)
    if (run === null) {
      return { error: 'invalid' }
    }

    const best = this.sql
      .exec<RunRow>('SELECT * FROM runs WHERE id = ?', run.id)
      .toArray()[0]

    if (best === undefined || run.score > best.score) {
      this.sql.exec(
        `INSERT INTO runs (id, name, score, stackCount, maxHeight, maxCombo, kpm, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, score = excluded.score, stackCount = excluded.stackCount,
           maxHeight = excluded.maxHeight, maxCombo = excluded.maxCombo,
           kpm = excluded.kpm, at = excluded.at`,
        run.id, run.name, run.score, run.stackCount,
        run.maxHeight, run.maxCombo, run.kpm, Date.now(),
      )
    } else if (best.name !== run.name) {
      // 기록은 그대로 두고 이름만 따라간다 — 이름을 바꿨는데 순위표만 옛 이름이면 헷갈린다
      this.sql.exec('UPDATE runs SET name = ? WHERE id = ?', run.name, run.id)
    }

    return { best: this.bestOf(run.id), rank: this.rankOf(run.id), top: this.top() }
  }

  /**
   * 대전 결과. **양쪽이 같은 말을 할 때만** 레이팅을 고친다.
   * 어긋나면 그 판은 없던 것으로 한다 — 누가 거짓말했는지 가릴 방법이 없기 때문이다.
   */
  private reportMatch(raw: unknown): unknown {
    const report = parseReport(raw)
    if (report === null) {
      return { error: 'invalid' }
    }

    /*
     * 이미 반영한 판이면 두 번 세지 않는다. 대신 **그때 움직인 폭을 기억해 두었다가
     * 그대로 돌려준다** — 먼저 보고한 쪽은 그 순간 결과를 몰랐으므로, 다시 물어봤을 때
     * "얼마나 잃었는지"를 못 보면 등급만 덩그러니 바뀌어 있다.
     */
    const done = this.sql
      .exec<{ aId: string; aDelta: number; bId: string; bDelta: number }>(
        'SELECT aId, aDelta, bId, bDelta FROM matches WHERE matchId = ?',
        report.matchId,
      )
      .toArray()[0]
    if (done !== undefined) {
      const delta =
        done.aId === report.reporter
          ? done.aDelta
          : done.bId === report.reporter
            ? done.bDelta
            : 0
      return { applied: true, delta, ...this.me(report.reporter) }
    }

    this.sql.exec(
      `INSERT INTO reports (matchId, reporter, winner, opponent, name, at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(matchId, reporter) DO UPDATE SET
         winner = excluded.winner, opponent = excluded.opponent,
         name = excluded.name, at = excluded.at`,
      report.matchId, report.reporter, report.winner, report.opponent,
      report.name, Date.now(),
    )

    const both = this.sql
      .exec<{ reporter: string; winner: string; opponent: string; name: string }>(
        'SELECT reporter, winner, opponent, name FROM reports WHERE matchId = ?',
        report.matchId,
      )
      .toArray()

    if (both.length < 2) {
      return { pending: true, ...this.me(report.reporter) }
    }

    const [a, b] = both as [typeof both[0], typeof both[0]]
    const agree = a.winner === b.winner && a.reporter === b.opponent && b.reporter === a.opponent
    this.sql.exec('DELETE FROM reports WHERE matchId = ?', report.matchId)
    if (!agree) {
      return { disputed: true, ...this.me(report.reporter) }
    }

    // 오르내린 폭은 여기서만 알 수 있다 — 클라이언트가 이전 값을 들고 있게 하면
    // 새로고침 한 번에 사라지고, 두 번 보고했을 때 두 배로 보인다
    const beforeA = this.ratingOf(a.reporter, a.name).rating
    const beforeB = this.ratingOf(b.reporter, b.name).rating
    this.applyResult(a.reporter, a.name, b.reporter, b.name, a.winner)
    const aDelta = this.ratingOf(a.reporter, a.name).rating - beforeA
    const bDelta = this.ratingOf(b.reporter, b.name).rating - beforeB
    this.sql.exec(
      'INSERT INTO matches (matchId, aId, aDelta, bId, bDelta, at) VALUES (?, ?, ?, ?, ?, ?)',
      report.matchId, a.reporter, aDelta, b.reporter, bDelta, Date.now(),
    )
    return {
      applied: true,
      delta: a.reporter === report.reporter ? aDelta : bDelta,
      ...this.me(report.reporter),
    }
  }

  private applyResult(
    aId: string,
    aName: string,
    bId: string,
    bName: string,
    winner: string,
  ): void {
    const a = this.ratingOf(aId, aName)
    const b = this.ratingOf(bId, bName)
    // 무승부는 winner가 빈 문자열로 온다. 그때는 아무도 얻거나 잃지 않는다
    if (winner !== aId && winner !== bId) {
      return
    }
    const aWon = winner === aId
    const aNext = nextRating(a.rating, b.rating, aWon, a.wins + a.losses)
    const bNext = nextRating(b.rating, a.rating, !aWon, b.wins + b.losses)
    this.saveRating(aId, aName, aNext, a.wins + (aWon ? 1 : 0), a.losses + (aWon ? 0 : 1))
    this.saveRating(bId, bName, bNext, b.wins + (aWon ? 0 : 1), b.losses + (aWon ? 1 : 0))
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

  private bestOf(id: string): RunRow | null {
    return this.sql.exec<RunRow>('SELECT * FROM runs WHERE id = ?', id).toArray()[0] ?? null
  }

  /** 나보다 점수가 높은 사람 수 + 1 */
  private rankOf(id: string): number | null {
    const best = this.bestOf(id)
    if (best === null) {
      return null
    }
    const above = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs WHERE score > ?', best.score)
      .toArray()[0]
    return (above?.n ?? 0) + 1
  }

  private top(): RunRow[] {
    return this.sql
      .exec<RunRow>('SELECT * FROM runs ORDER BY score DESC, at ASC LIMIT ?', TOP)
      .toArray()
  }
}

/** 레이팅 구간에 이름을 붙인다. 숫자만 보여주면 잘하고 있는지 알 수 없다 */
const TIERS = [
  { name: '브론즈', from: 0 },
  { name: '실버', from: 900 },
  { name: '골드', from: 1100 },
  { name: '플래티넘', from: 1300 },
  { name: '다이아', from: 1500 },
] as const

function parseRun(raw: unknown): RunRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  const id = text(value['id'], MAX_ID)
  const name = text(value['name'], MAX_NAME)
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

  /*
   * 여기가 타당성 검사다. 점수가 맞는지가 아니라 **사람이 낼 수 있는 값인지**를 본다.
   * 하나하나가 물리적으로 불가능한 것만 고른 것이라, 성실한 판이 걸릴 일은 없다.
   */
  if (kpm > LIMITS.kpm) return null
  if (stackCount > LIMITS.stackCount) return null
  if (maxHeight > LIMITS.height) return null
  if (maxCombo > stackCount) return null
  if (score > stackCount * LIMITS.scorePerItem) return null
  if (duration < stackCount * LIMITS.secondsPerItem) return null

  return { id, name, score, stackCount, maxHeight, maxCombo, kpm, at: 0 }
}

function parseReport(raw: unknown): {
  matchId: string
  reporter: string
  opponent: string
  winner: string
  name: string
} | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  const matchId = text(value['matchId'], MAX_MATCH_ID)
  const reporter = text(value['reporter'], MAX_ID)
  const opponent = text(value['opponent'], MAX_ID)
  const name = text(value['name'], MAX_NAME)
  // 무승부는 빈 문자열이다
  const winner = typeof value['winner'] === 'string' ? value['winner'].slice(0, MAX_ID) : null

  if (matchId === null || reporter === null || opponent === null || name === null || winner === null) {
    return null
  }
  if (reporter === opponent) {
    // 혼자 두 몫을 보고해 합의를 흉내내는 길을 막는다
    return null
  }
  return { matchId, reporter, opponent, winner, name }
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export { TIERS, START_RATING, LIMITS, nextRating, parseRun, parseReport }
