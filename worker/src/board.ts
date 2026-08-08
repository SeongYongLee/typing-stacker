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
/** 한 판에 들어올 수 있는 인원. 서버가 먼저 늘어나야 클라이언트를 나중에 올릴 수 있다 */
const MAX_PLAYERS = 8
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export { TIERS, START_RATING, LIMITS, rateMatch, parseRun, parseReport }
