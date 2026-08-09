import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { HIDDEN_CHANCE } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import { FrameClock } from './helpers/frameClock.ts'
import type { GameEvent } from '../src/game/types/events.ts'

/**
 * 한 판에 **특별한 것을 몇 번 만나는가**를 잰다.
 *
 * 이 게임의 재미는 "무엇이 나올까"이고, 그것을 실어 나르는 것이 히든과 합성이다.
 * 그런데 그 빈도는 상수 하나가 정하는 것이 아니라 **`히든 보유 단어 ÷ 전체 단어`**가
 * 정한다 — 아트 묶음이 올 때마다 분모가 움직이므로 `HIDDEN_CHANCE`만 보고는 알 수 없다.
 *
 * 실제로 그렇게 어긋난 적이 있다. 합성 세트가 들어오며 재료 30종이 전부 단어가 되어
 * 분모가 48 → 78로 뛰었고, 히든은 9 → 11로 둘만 늘어 **비율이 19% → 14%로 오히려
 * 내려갔다.** 반대로 2026-08-09 재작화 묶음은 히든을 많이 데려와 35%가 됐다.
 *
 * 그래서 **아트 묶음마다 다시 돌리는 자리**로 남긴다. 값을 고치는 검사가 아니라
 * 숫자를 뽑는 검사다 — 통과 조건은 "판이 굴러가는가"까지만 두고, 나온 숫자는
 * CLAUDE.md와 볼트의 밸런스 표에 누적한다.
 *
 * ## 봇
 *
 * 화면에 떠 있는 아무 단어나 친다. 조준은 그때그때의 화살표 자리 그대로다 —
 * 중앙에 고정하지 않는 이유는 **사람이 실제로 겪는 값**을 재려는 것이기 때문이다.
 * 쌓기 자체의 난이도는 `zz-bounce.measure.test.ts`의 중앙 조준 봇이 잰다.
 *
 * ## 왜 사건으로 세는가
 *
 * `drop`은 히든 여부를 싣고 `merge`는 합쳐진 순간에만 온다. 상태 스냅샷을 프레임마다
 * 비교하면 한 프레임에 두 번 일어난 일이 하나로 뭉개진다 — 상태와 사건을 나눈 이유
 * 그대로다(CLAUDE.md).
 */

/** 판 수. 60판이면 판당 값이 소수 둘째 자리까지 안정된다 */
const RUNS = 60
/** 한 판에 허용하는 최대 시간(초). 봇이 잘 쌓아 판이 안 끝나는 경우를 끊는다 */
const MAX_RUN_SEC = 180
/** 봇이 한 번 치는 간격(초). 사람의 타자 속도보다 빠르지만 스폰 간격보다는 느리다 */
const TICK = 0.25

interface RunResult {
  readonly seconds: number
  readonly drops: number
  readonly hidden: number
  readonly merges: number
  readonly stacked: number
  readonly height: number
}

describe('특별한 것을 만나는 빈도', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  async function runOne(seed: number): Promise<RunResult> {
    const engine = await GameEngine.create(seed)
    let state: GameState | null = null
    let drops = 0
    let hidden = 0
    let merges = 0
    engine.onStateChange((next) => {
      state = next
    })
    engine.onEvent((event: GameEvent) => {
      if (event.kind === 'drop') {
        drops += 1
        if (event.hidden) {
          hidden += 1
        }
      }
      if (event.kind === 'merge') {
        merges += 1
      }
    })
    engine.startRun()

    let seconds = 0
    let stacked = 0
    let height = 0
    for (; seconds < MAX_RUN_SEC; seconds += TICK) {
      await clock.advance(TICK)
      const now = state as GameState | null
      if (now === null) {
        continue
      }
      stacked = Math.max(stacked, now.stats.stackCount)
      height = Math.max(height, now.stats.maxHeight)
      if (now.phase === 'over') {
        break
      }
      const word = now.words.find((item) => item.state === 'active')
      if (word !== undefined) {
        engine.submit(word.word)
      }
    }

    engine.dispose()
    return { seconds, drops, hidden, merges, stacked, height }
  }

  it('60판을 돌려 숫자를 뽑는다', { timeout: 300_000 }, async () => {
    const runs: RunResult[] = []
    for (let i = 0; i < RUNS; i += 1) {
      runs.push(await runOne(20260809 + i * 7919))
    }

    const mean = (pick: (run: RunResult) => number): number =>
      runs.reduce((sum, run) => sum + pick(run), 0) / runs.length
    const share = (pick: (run: RunResult) => number): number =>
      runs.filter((run) => pick(run) === 0).length / runs.length

    const special = (run: RunResult): number => run.hidden + run.merges
    const withHidden = WORDS.filter((entry) => entry.variants.some((v) => v.hidden)).length
    const rows: [string, string][] = [
      ['판 길이', `${mean((r) => r.seconds).toFixed(1)}초`],
      ['떨군 횟수', mean((r) => r.drops).toFixed(1)],
      ['쌓인 개수', mean((r) => r.stacked).toFixed(1)],
      ['최고 높이', `${mean((r) => r.height).toFixed(2)}m`],
      [
        '히든',
        `판당 ${mean((r) => r.hidden).toFixed(2)}개 · 못 본 판 ${Math.round(share((r) => r.hidden) * 100)}%`,
      ],
      [
        '합성',
        `판당 ${mean((r) => r.merges).toFixed(2)}회 · 못 한 판 ${Math.round(share((r) => r.merges) * 100)}%`,
      ],
      [
        '특별한 것 합계',
        `판당 ${mean(special).toFixed(2)}개 · 아무것도 못 본 판 ${Math.round(share(special) * 100)}%`,
      ],
    ]
    console.log(
      `\n[밸런스 실측] 봇 ${RUNS}판 · 단어 ${WORDS.length}개 · 히든 보유 ${withHidden}개(${Math.round((withHidden / WORDS.length) * 100)}%) · HIDDEN_CHANCE ${HIDDEN_CHANCE}\n` +
        rows.map(([key, value]) => `  | ${key} | ${value} |`).join('\n'),
    )

    /*
     * 값을 못 박지 않는다. 아트가 올 때마다 움직이는 숫자라 문턱을 두면 이 검사가
     * **아트를 막는 자리**가 된다. 지키는 것은 "판이 실제로 굴러갔는가"까지다 —
     * 봇이 아무것도 못 치고 있으면 위의 숫자가 전부 거짓이 되므로 그것만 막는다.
     */
    expect(mean((r) => r.drops), '봇이 단어를 못 치고 있다').toBeGreaterThan(5)
    expect(mean((r) => r.seconds), '판이 즉시 끝난다').toBeGreaterThan(5)
  })
})
