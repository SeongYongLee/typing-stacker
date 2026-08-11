import { afterEach, describe, expect, it } from 'vitest'
import { INVULNERABLE_SEC, LIVES } from '../src/game/config.ts'
import { LoopbackTransport } from '../src/multi/LoopbackTransport.ts'
import type { MatchEngine, MatchViewState } from '../src/multi/MatchEngine.ts'
import { MatchSession, type SessionPhase } from '../src/multi/MatchSession.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 붙은 뒤 판이 열리기까지의 절차.
 *
 * 상대가 들어오자마자 시작하면 누구와 붙는지 볼 겨를도, 손을 키보드에 올릴 겨를도
 * 없다 — 첫 단어가 이미 내려오고 있다. **양쪽이 다 준비를 눌러야** 열린다.
 */

interface Side {
  session: MatchSession
  phase: () => SessionPhase | null
}

/** 루프백은 마이크로태스크로 배달한다 — 눌렀다고 바로 상대에게 닿아 있지 않다 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function stateOf(engine: MatchEngine): MatchViewState {
  let value: MatchViewState | null = null
  engine.onStateChange((state) => { value = state })
  if (value === null) throw new Error('대전 상태가 없다')
  return value
}

/*
 * node에는 requestAnimationFrame이 없다. 없으면 엔진의 start()가 터지는데
 * begin()이 비동기라 그 예외가 조용히 삼켜져 "준비에서 안 넘어간다"로 보인다.
 */
const clock = new FrameClock()

function pair(): { host: Side; guest: Side } {
  clock.install()
  const [hostLink, guestLink] = LoopbackTransport.pair()

  let hostPhase: SessionPhase | null = null
  let guestPhase: SessionPhase | null = null

  const hostSession = MatchSession.attach(hostLink, (on) => hostLink.listen(on), {
    nickname: '자두',
    deviceId: 'dev-host',
    icon: '',
    // 셈은 따로 시험한다 — 판이 열리는지 보려는 여기서는 건너뛴다
    countdownSec: 0,
    onPhase: (phase) => {
      hostPhase = phase
    },
  })
  const guestSession = MatchSession.attach(guestLink, (on) => guestLink.listen(on), {
    nickname: '세이지',
    deviceId: 'dev-guest',
    icon: '',
    countdownSec: 0,
    onPhase: (phase) => {
      guestPhase = phase
    },
  })

  return {
    host: { session: hostSession, phase: () => hostPhase },
    guest: { session: guestSession, phase: () => guestPhase },
  }
}

let open: { host: Side; guest: Side } | null = null

afterEach(() => {
  open?.host.session.dispose()
  open?.guest.session.dispose()
  open = null
  clock.uninstall()
})

describe('MatchSession — 준비하고 시작한다', () => {
  it('붙으면 양쪽이 같은 명단을 보고 준비를 기다린다', async () => {
    open = pair()
    await tick()

    for (const side of [open.host, open.guest]) {
      const phase = side.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind !== 'ready') return
      expect(phase.players.map((player) => player.nickname)).toEqual(['자두', '세이지'])
      expect(phase.ready).toHaveLength(0)
    }
  })

  it('한쪽만 준비하면 시작하지 않고, 그 사실이 양쪽에 보인다', async () => {
    open = pair()
    await tick()
    open.host.session.setReady()
    await tick()

    for (const side of [open.host, open.guest]) {
      const phase = side.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind !== 'ready') return
      // 누가 눌렀는지까지 양쪽이 같게 본다 — 기다리는 쪽이 자기라는 것을 알아야 한다
      expect(phase.ready).toHaveLength(1)
    }
  })

  it('친선전에서 모드 변경 요청을 무시하고 대결을 유지한다', async () => {
    open = pair()
    await tick()
    open.host.session.setReady()
    open.host.session.setMatchModeChoice('shared')
    await tick()
    await tick()

    for (const side of [open.host, open.guest]) {
      const phase = side.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind !== 'ready') return
      expect(phase.ready).toHaveLength(1)
      expect(phase.matchModeChoice).toBe('duel')
      expect(phase.canChangeMatchMode).toBe(false)
    }
  })

  it('둘 다 준비하면 판이 열린다', async () => {
    open = pair()
    await tick()
    open.host.session.setReady()
    open.guest.session.setReady()

    // 엔진 생성은 Rapier WASM 초기화를 기다린다 — 얼마나 걸릴지 정해두지 않고 기다린다
    for (let wait = 0; wait < 100 && open.host.phase()?.kind !== 'playing'; wait += 1) {
      await tick()
    }

    expect(open.host.phase()?.kind).toBe('playing')
    expect(open.guest.phase()?.kind).toBe('playing')
  })

  it('다음 판 엔진을 만드는 동안 온 첫 메시지를 잃지 않는다', async () => {
    open = pair()
    await tick()
    open.host.session.setReady()
    open.guest.session.setReady()
    for (let wait = 0; wait < 100 && open.host.phase()?.kind !== 'playing'; wait += 1) await tick()

    const firstHost = open.host.phase()
    const firstGuest = open.guest.phase()
    if (firstHost?.kind !== 'playing' || firstGuest?.kind !== 'playing') return
    const firstState = stateOf(firstHost.engine)
    const firstMatch = firstState.matchId
    const authority = firstState.matchMode === 'duel' ? firstGuest.engine : firstHost.engine
    for (let round = 0; round < LIVES; round += 1) {
      authority.debugEscape(firstGuest.engine.debugSelf(), 1)
      await clock.advance(INVULNERABLE_SEC + 0.4)
    }
    firstHost.engine.requestRematch()
    firstGuest.engine.requestRematch()

    for (let wait = 0; wait < 100; wait += 1) {
      await tick()
      const phase = open.host.phase()
      if (phase?.kind === 'playing' && stateOf(phase.engine).matchId !== firstMatch) break
    }
    const nextHost = open.host.phase()
    const nextGuest = open.guest.phase()
    expect(nextHost?.kind).toBe('playing')
    expect(nextGuest?.kind).toBe('playing')
    if (nextHost?.kind !== 'playing' || nextGuest?.kind !== 'playing') return
    expect(stateOf(nextHost.engine).matchId).not.toBe(firstMatch)
    await clock.advance(1)
    expect(stateOf(nextGuest.engine).words.map((word) => word.word))
      .toEqual(stateOf(nextHost.engine).words.map((word) => word.word))
  })

  it('친선전 결과에서 같은 연결과 채팅을 유지한 채 양쪽이 준비방으로 돌아간다', async () => {
    open = pair()
    await tick()
    open.host.session.sendChat('다음 판도 하자')
    open.host.session.setReady()
    open.guest.session.setReady()
    for (let wait = 0; wait < 100 && open.host.phase()?.kind !== 'playing'; wait += 1) await tick()

    const host = open.host.phase()
    const guest = open.guest.phase()
    if (host?.kind !== 'playing' || guest?.kind !== 'playing') return
    for (let round = 0; round < LIVES; round += 1) {
      guest.engine.debugEscape(guest.engine.debugSelf(), 1)
      await clock.advance(INVULNERABLE_SEC + 0.4)
    }
    host.engine.requestRoomReturn()
    await tick()

    for (const side of [open.host, open.guest]) {
      const phase = side.phase()
      expect(phase?.kind).toBe('ready')
      if (phase?.kind !== 'ready') return
      expect(phase.ready).toEqual([])
      expect(phase.chat.map((line) => line.text)).toContain('다음 판도 하자')
    }
  })

  it('같은 사람이 두 번 눌러도 혼자 시작되지 않는다', async () => {
    open = pair()
    await tick()
    open.host.session.setReady()
    open.host.session.setReady()
    await tick()

    expect(open.host.phase()?.kind).toBe('ready')
    expect(open.guest.phase()?.kind).toBe('ready')
  })
})
