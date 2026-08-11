import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionPhase } from '../src/multi/MatchSession.ts'
import type { MatchModeChoice } from '../src/multi/matchModes.ts'
import { ReadyRoom } from '../src/screens/lobby/ReadyRoom.tsx'

type ReadyPhase = Extract<SessionPhase, { kind: 'ready' }>

function phase(chatEnabled: boolean, matchModeChoice: MatchModeChoice = 'duel'): ReadyPhase {
  return {
    kind: 'ready',
    players: [{ id: 'me', nickname: '나', icon: '', device: 'device-me' }],
    ready: [],
    selfId: 'me',
    chat: [],
    chatEnabled,
    matchModeChoice,
    canChangeMatchMode: chatEnabled,
  }
}

function markup(
  chatEnabled: boolean,
  matchModeChoice: MatchModeChoice = 'duel',
  canChangeMatchMode = chatEnabled,
): string {
  return renderToStaticMarkup(createElement(ReadyRoom, {
    phase: { ...phase(chatEnabled, matchModeChoice), canChangeMatchMode },
    onReady: () => {},
    onChat: () => {},
    onMatchMode: () => {},
    onBack: () => {},
  }))
}

describe('ReadyRoom 게임 규칙', () => {
  it('규칙 한 줄을 다른 본문보다 크게 보여준다', () => {
    const html = markup(true)

    expect(html.match(/font-size:17px/g)?.length).toBeGreaterThanOrEqual(5)
    expect(html).toContain('font-size:22px')
    expect(html).toContain('list-style:none')
  })

  it('유저 목록은 8명 슬롯 최대 높이를 잡고 채팅 내역을 길게 보여준다', () => {
    const html = markup(true)

    expect(html).toContain('max-height:534px')
    expect(html).toContain('height:360px')
  })

  it('준비 상태 문구가 바뀌어도 상태 칸 폭은 유지된다', () => {
    const html = markup(true)

    expect(html).toContain('flex:0 0 106px')
    expect(html).toContain('white-space:nowrap')
  })

  it('친선전 준비 화면에서 대결 모드를 고정해 보여준다', () => {
    const html = markup(true)

    expect(html).toContain('data-ready-rules="manual"')
    expect(html).toContain('data-fixed-match-mode="duel"')
    expect(html).toContain('모드 · 대결')
    expect(html).toContain('먼저 골인 높이에 닿거나 마지막까지 하트를 남기면 이깁니다.')
    expect(html).not.toContain('함께 쌓기')
    expect(html).not.toContain('룰렛')
    expect(html).not.toContain('방 참가 코드')
    expect(html).not.toContain('친선전에서는')
  })

  it('친선전 참가자에게 호스트 전용 안내 문구를 붙이지 않는다', () => {
    const html = markup(true, 'duel', false)

    expect(html).toContain('모드 · 대결')
    expect(html).not.toContain('호스트만 변경')
  })

  it('랭크 게임 준비 화면에서 모드 규칙과 준비 버튼을 바로 보여준다', () => {
    const html = markup(false)

    expect(html).toContain('data-ready-rules="auto"')
    expect(html).toContain('먼저 골인 높이에 닿거나 마지막까지 하트를 남기면 이깁니다.')
    expect(html).not.toContain('함께 쌓기')
    expect(html).not.toContain('룰렛')
    expect(html).toContain('준비 (Enter)')
    expect(html).not.toContain('모드 설정')
    expect(html).not.toContain('호스트만 변경')
    expect(html).not.toContain('이긴 만큼 티어 점수가 오릅니다.')
  })

  it('대결 모드 준비 화면에서 승리 조건만 한 줄로 보여준다', () => {
    const html = markup(true, 'duel')

    expect(html).toContain('대결')
    expect(html).toContain('먼저 골인 높이에 닿거나 마지막까지 하트를 남기면 이깁니다.')
    expect(html).not.toContain('동시에 진행합니다.')
  })

  it('이전 룰렛 상태가 들어와도 대결로 고정한다', () => {
    const html = markup(false, 'roulette')

    expect(html).toContain('골인 높이')
    expect(html).not.toContain('룰렛')
  })
})
