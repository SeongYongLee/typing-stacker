import { afterEach, describe, expect, it } from 'vitest'
import { matchIdOf } from '../src/multi/MatchEngine.ts'
import { MatchSession, type SessionPhase } from '../src/multi/MatchSession.ts'
import { MAX_PLAYERS } from '../src/multi/protocol.ts'
import { FrameClock } from './helpers/frameClock.ts'
import { Hub } from './helpers/hub.ts'

/**
 * 판을 가리키는 이름.
 *
 * 서버가 여러 사람의 보고를 **한 판으로 묶는 기준**이라, 참가자 전원이 각자 만들어도
 * 같은 값이 나와야 한다. 그리고 **길이가 인원에 비례하면 안 된다** — 실제로 기기 id를
 * 그대로 이어 붙였다가 여덟이 붙었을 때 300자를 넘겨 서버 상한에 걸렸고, 그 판이
 * 통째로 버려졌다. 인원이 늘 때마다 상한을 올리는 것은 같은 함정을 다시 놓는 일이다.
 */

const uuid = (n: number) => `aaaaaaaa-bbbb-cccc-dddd-eeeeeeee${String(n).padStart(4, '0')}`

describe('판 이름', () => {
  it('순서가 달라도 같은 값이 나온다 — 각자 만들어도 묶인다', () => {
    const devices = [uuid(1), uuid(2), uuid(3)]
    const reversed = [...devices].reverse()
    expect(matchIdOf(1234, reversed)).toBe(matchIdOf(1234, devices))
  })

  it('시드가 다르면 다른 판이다', () => {
    const devices = [uuid(1), uuid(2)]
    expect(matchIdOf(1, devices)).not.toBe(matchIdOf(2, devices))
  })

  it('사람이 다르면 다른 판이다', () => {
    expect(matchIdOf(1, [uuid(1), uuid(2)])).not.toBe(matchIdOf(1, [uuid(1), uuid(3)]))
  })

  it('인원이 다르면 다른 판이다', () => {
    expect(matchIdOf(1, [uuid(1), uuid(2)])).not.toBe(
      matchIdOf(1, [uuid(1), uuid(2), uuid(3)]),
    )
  })

  /*
   * 여기가 이 파일이 있는 이유다. 정원까지 채워도 짧아야 한다 —
   * 서버의 길이 상한(200자)에 한참 못 미쳐야 인원을 더 늘려도 안전하다.
   */
  it('정원을 다 채워도 짧다', () => {
    const devices = Array.from({ length: MAX_PLAYERS }, (_, i) => uuid(i))
    const id = matchIdOf(4294967295, devices)
    expect(id.length).toBeLessThan(40)
  })

  it('인원이 늘어도 길이가 거의 그대로다', () => {
    const two = matchIdOf(1234, [uuid(1), uuid(2)])
    const many = matchIdOf(1234, Array.from({ length: MAX_PLAYERS }, (_, i) => uuid(i)))
    // 인원 수 자리만 늘 수 있다
    expect(Math.abs(many.length - two.length)).toBeLessThanOrEqual(2)
  })

  it('기기 id가 비어 있어도 터지지 않는다', () => {
    expect(matchIdOf(1, [])).toContain('-0-')
    expect(matchIdOf(1, ['', ''])).toContain('-2-')
  })
})

/*
 * 위의 것들은 함수만 본다. 실제로 붙은 판에서 여덟이 **각자 만든 값이 같은지**는
 * 세션을 세워봐야 안다 — 명단 순서가 사람마다 다르면 함수가 아무리 정렬해도
 * 넘겨주는 쪽에서 어긋날 수 있다. 하나라도 어긋나면 서버가 판을 묶지 못해
 * 정산이 통째로 버려진다.
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

async function playWith(count: number): Promise<SessionPhase[]> {
  clock.install()
  const phases: (SessionPhase | null)[] = Array.from({ length: count }, () => null)
  sessions = Hub.of(count).map((link, index) =>
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
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
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

function matchIdsOf(phases: SessionPhase[]): string[] {
  return phases.map((phase) => {
    if (phase.kind !== 'playing') throw new Error(`판이 열리지 않았다: ${phase.kind}`)
    let id: string | null = null
    phase.engine.onStateChange((state) => {
      id = state.matchId
    })
    if (id === null) throw new Error('판 이름이 상태에 실리지 않았다')
    return id
  })
}

describe('붙은 판의 이름', () => {
  it('여덟이 각자 만든 값이 모두 같다', async () => {
    const ids = matchIdsOf(await playWith(MAX_PLAYERS))
    expect(ids).toHaveLength(MAX_PLAYERS)
    expect(new Set(ids).size).toBe(1)
  })

  it('여덟이 붙어도 서버 상한에 한참 못 미친다', async () => {
    const [id] = matchIdsOf(await playWith(MAX_PLAYERS))
    // 서버 상한은 200자다
    expect(id!.length).toBeLessThan(40)
  })
})
