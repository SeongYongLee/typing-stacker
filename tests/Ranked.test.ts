import { afterEach, describe, expect, it } from 'vitest'
import { MatchSession, type SessionPhase } from '../src/multi/MatchSession.ts'
import type { MatchViewState } from '../src/multi/MatchEngine.ts'
import { Hub } from './helpers/hub.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 어떤 판이 사다리에 오르는가.
 *
 * **자동 매칭만 오른다.** 코드로 모인 방은 누구와 붙을지 고를 수 있어서, 늘 이기는
 * 상대만 불러 판을 거듭하면 사다리가 실력이 아니라 상대를 고르는 능력을 재게 된다.
 *
 * 이 파일이 지키는 것은 **화면에 적어둔 말과 실제가 같은지**다. 로비는 "티어 점수는
 * 바뀌지 않습니다"라고 약속하는데, 그 약속이 깨지면 거짓말을 하는 화면이 된다 —
 * 그리고 그 어긋남은 판을 끝까지 하고 결과 화면을 봐야만 드러난다.
 */

const clock = new FrameClock()
let sessions: MatchSession[] = []

afterEach(() => {
  for (const session of sessions) {
    session.dispose()
  }
  sessions = []
  clock.uninstall()
})

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 코드로 모인 방을 흉내 낸다 — `attach`는 자동 매칭을 거치지 않는 입구다 */
async function playRoom(): Promise<SessionPhase[]> {
  clock.install()
  const phases: (SessionPhase | null)[] = [null, null]
  sessions = Hub.of(2).map((link, index) =>
    MatchSession.attach(link, (on) => link.listen(on), {
      nickname: `사람${index}`,
      deviceId: `dev-${index}`,
      icon: '',
      countdownSec: 0,
      onPhase: (next) => {
        phases[index] = next
      },
    }),
  )
  await settle()
  await settle()
  for (const session of sessions) {
    session.setReady()
  }
  for (let wait = 0; wait < 300 && phases[0]?.kind !== 'playing'; wait += 1) {
    await settle()
  }
  return phases.map((phase, index) => {
    if (phase === null) throw new Error(`사람${index}의 판이 열리지 않았다`)
    return phase
  })
}

/**
 * 지금 상태 한 장.
 *
 * `onStateChange`는 **리스너를 하나만 둔다** — 여기서 부르면 앞서 붙어 있던 것이
 * 떨어진다. 시험에서는 붙여둔 쪽이 없으니 괜찮지만, 화면에서 같은 일을 하면 그
 * 순간부터 React가 갱신을 못 받는다(실제로 검증 도구가 그렇게 화면을 멈춰 세웠다).
 */
function stateOf(phase: SessionPhase): MatchViewState {
  if (phase.kind !== 'playing') throw new Error(`판이 열리지 않았다: ${phase.kind}`)
  let seen: MatchViewState | null = null
  phase.engine.onStateChange((next) => {
    seen = next
  })
  if (seen === null) throw new Error('상태가 오지 않았다')
  return seen
}

describe('사다리에 오르는 판', () => {
  it('코드로 모인 방은 오르지 않는다', async () => {
    const phases = await playRoom()
    for (const phase of phases) {
      expect(stateOf(phase).ranked).toBe(false)
    }
  })

  /*
   * 채팅이 되는 방과 사다리에 오르는 방은 지금 정확히 반대다. 그래도 **한쪽에서
   * 파생시키지 않는다** — 뜻이 다른 두 가지라, 나중에 채팅 규칙을 바꾸면 랭킹이
   * 조용히 따라 바뀐다. 두 값이 따로 실려 오는지 여기서 지킨다.
   */
  it('채팅 여부와 따로 실려 온다', async () => {
    const state = stateOf((await playRoom())[0]!)
    expect(state).toHaveProperty('ranked')
    expect(state).toHaveProperty('inputMode')
  })
})
