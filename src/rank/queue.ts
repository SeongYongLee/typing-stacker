import { RELAY_URL } from '../multi/relayUrl.ts'
import { loadProfile } from '../storage/profile.ts'

/**
 * 자동매칭 줄과 이야기하는 통로.
 *
 * **레이팅을 보내지 않는다.** 어느 티어끼리 붙일지는 서버가 정하는데, 그 값을 이쪽에서
 * 적어 보내면 아무 티어나 적어 넣을 수 있다. 서버가 기기 id로 자기 표를 직접 찾는다.
 *
 * 랭킹과 같은 자리(`/rank/*`)에 있는 이유도 그것이다 — 레이팅의 주인이 그 저장소다.
 */

const BASE = RELAY_URL.replace(/^ws/, 'http')

/**
 * 다시 물어보는 주기.
 *
 * 짧게 하면 붙는 순간이 빨라지지만 그만큼 요청이 늘고, 무료 한도는 하루 요청 수로
 * 잰다. 짝이 맺어졌는지는 1.5초 안에 알려주면 사람이 늦다고 느끼지 않는다.
 * **서버가 줄에서 치우는 기준(6초)보다 훨씬 짧아야 한다** — 그러지 않으면 멀쩡히
 * 기다리는 사람이 줄에서 빠진다.
 */
const POLL_MS = 1500

/**
 * 오래 기다릴수록 뜸하게 묻는다.
 *
 * 처음에는 자주 물어야 한다 — 그때가 짝이 맺어질 가능성이 가장 높고, 붙는 순간이
 * 늦으면 사람이 바로 느낀다. 하지만 5분을 기다리는 사람에게까지 1.5초를 유지하면
 * 그 한 사람이 200번을 부른다. 요청 수는 무료 한도에서 가장 먼저 차는 값이다.
 *
 * **서버가 줄에서 치우는 기준(6초)을 넘으면 안 된다.** 넘으면 멀쩡히 기다리는
 * 사람이 줄에서 빠지고, 본인은 여전히 기다리는 줄 안다. 그래서 4초에서 멈춘다.
 */
function pollDelay(waitedSec: number): number {
  if (waitedSec < 15) {
    return POLL_MS
  }
  return waitedSec < 45 ? 2500 : 4000
}

/** 한 번의 응답을 기다리는 상한. 넘으면 그 회차만 건너뛰고 다음에 다시 묻는다 */
const TIMEOUT_MS = 5000

type QueueStatus =
  | {
      readonly kind: 'waiting'
      /** 줄에 선 사람 수(나를 포함) */
      readonly waiting: number
      readonly waitedSec: number
      /** 지금 몇 칸 떨어진 티어까지 받아들이는가. 0이면 같은 티어만 */
      readonly band: number
      readonly tier: number
    }
  | { readonly kind: 'matched'; readonly code: string; readonly players: number }
  /** 서버에 닿지 못했다. 줄에서 빠진 것은 아니므로 다음 회차에 다시 묻는다 */
  | { readonly kind: 'unreachable' }
  /**
   * 닿기는 했는데 서버가 이 기능을 모른다.
   *
   * **'닿지 못했다'와 갈라야 한다.** 둘은 사람이 할 수 있는 일이 정반대다 — 서버가
   * 죽은 것이면 기다리는 수밖에 없지만, 이쪽은 화면만 새로 나가고 서버가 옛 판인
   * 것이라 배포하면 곧바로 풀린다. 실제로 자동매칭을 처음 켠 날 서버를 배포하지
   * 않아 404가 났는데, 화면에는 "서버에 닿지 못했습니다"만 떠서 원인을 알 수 없었다.
   *
   * 다시 물어봐도 소용없으므로 되풀이를 멈춘다. 배포는 저절로 되지 않는다.
   */
  | { readonly kind: 'unsupported' }

/** 줄에 서고, 그 자리에서 짝이 맺어졌는지 본다 */
async function enterQueue(): Promise<QueueStatus> {
  const profile = loadProfile()
  const body = await post('/rank/queue', { device: profile.id, name: profile.name })
  if (body === UNSUPPORTED) {
    return { kind: 'unsupported' }
  }
  if (body === null) {
    return { kind: 'unreachable' }
  }
  if (body['state'] === 'matched' && typeof body['code'] === 'string') {
    return {
      kind: 'matched',
      code: body['code'],
      players: typeof body['players'] === 'number' ? body['players'] : 2,
    }
  }
  if (body['state'] === 'waiting') {
    return {
      kind: 'waiting',
      waiting: numberOf(body['waiting'], 1),
      waitedSec: numberOf(body['waitedSec'], 0),
      band: numberOf(body['band'], 0),
      tier: numberOf(body['tier'], 0),
    }
  }
  return { kind: 'unreachable' }
}

/**
 * 줄에서 빠진다.
 *
 * 이것 없이도 물어보기를 멈추면 서버가 6초 뒤 치우지만, 그 6초 동안 남은 사람은
 * 이미 없는 사람과 짝이 맺어질 수 있다 — 그러면 아무도 오지 않는 방에서 혼자 기다린다.
 * 그래서 나갈 때는 반드시 알린다.
 */
async function leaveQueue(): Promise<void> {
  /*
   * `keepalive`를 붙이는 이유는 이 호출이 **탭을 닫는 순간에도** 나가야 하기 때문이다.
   * 평범한 fetch는 페이지가 사라지면 함께 취소되어 서버에 닿지 않는다.
   */
  await post('/rank/queue/leave', { device: loadProfile().id }, true)
}

/**
 * 줄에 몇 명이 서 있는지만 본다. **줄에 서지 않는다.**
 *
 * 로비에서 누르기 전에 보여주려는 것이다 — 아무도 없으면 눌러도 한참 기다릴 뿐이고,
 * 그것을 모르면 자동매칭이 고장난 것처럼 보인다. 닿지 못하면 null이라 화면이
 * "0명"과 "모른다"를 구분해서 그릴 수 있다.
 */
async function fetchQueueSize(): Promise<number | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}/rank/queue/size`, { signal: abort.signal })
    if (!response.ok) {
      return null
    }
    const parsed: unknown = await response.json()
    const waiting = (parsed as Record<string, unknown> | null)?.['waiting']
    return typeof waiting === 'number' && Number.isFinite(waiting) ? waiting : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 서버가 이 경로를 모른다는 표시. null(닿지 못함)과 갈라야 해서 따로 둔다 */
const UNSUPPORTED = Symbol('unsupported')

async function post(
  path: string,
  body: unknown,
  keepalive = false,
): Promise<Record<string, unknown> | null | typeof UNSUPPORTED> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
      signal: abort.signal,
    })
    /*
     * 404는 "서버가 살아 있는데 이 기능이 없다"는 뜻이다. 화면이 죽은 서버와 같은
     * 말을 하면 배포를 잊은 것을 알아챌 길이 없다.
     */
    if (response.status === 404) {
      return UNSUPPORTED
    }
    if (!response.ok) {
      return null
    }
    const parsed: unknown = await response.json()
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export { enterQueue, leaveQueue, fetchQueueSize, pollDelay, POLL_MS }
export type { QueueStatus }
