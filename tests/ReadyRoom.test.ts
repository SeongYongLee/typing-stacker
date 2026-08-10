import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionPhase } from '../src/multi/MatchSession.ts'
import type { MatchModeChoice } from '../src/multi/matchModes.ts'
import { ReadyRoom } from '../src/screens/lobby/ReadyRoom.tsx'

type ReadyPhase = Extract<SessionPhase, { kind: 'ready' }>

function phase(chatEnabled: boolean, matchModeChoice: MatchModeChoice = 'shared'): ReadyPhase {
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

function markup(chatEnabled: boolean, matchModeChoice: MatchModeChoice = 'shared'): string {
  return renderToStaticMarkup(createElement(ReadyRoom, {
    phase: phase(chatEnabled, matchModeChoice),
    onReady: () => {},
    onChat: () => {},
    onMatchMode: () => {},
    onBack: () => {},
  }))
}

describe('ReadyRoom 게임 규칙', () => {
  it('왼쪽 내용과 규칙 설명을 GAME RULES 본문과 같은 17px로 보여준다', () => {
    const html = markup(true)

    expect(html.match(/font-size:17px/g)?.length).toBeGreaterThanOrEqual(5)
    expect(html).not.toMatch(/font-size:(?:12|13|14|15)px/)
  })

  it('친선전 준비 화면에서 코드·턴제·티어 규칙을 보여준다', () => {
    const html = markup(true)

    expect(html).toContain('data-ready-rules="manual"')
    expect(html).toContain('모드:')
    expect(html).toContain('함께 쌓기')
    expect(html).toContain('모드 · 함께 쌓기')
    expect(html).toContain('방 참가 코드')
    expect(html).toContain('최대 8명')
    expect(html).toContain('한 탑을 함께')
    expect(html).toContain('한 번씩')
    expect(html).toContain('그 물건 주인')
    expect(html).toContain('마지막 생존자')
    expect(html).toContain('친선전에서는')
  })

  it('랭크 게임 준비 화면에서 턴제·매칭·티어 규칙을 보여준다', () => {
    const html = markup(false)

    expect(html).toContain('data-ready-rules="auto"')
    expect(html).toContain('1대1')
    expect(html).toContain('한 탑을 함께')
    expect(html).toContain('한 번씩')
    expect(html).toContain('그 물건 주인')
    expect(html).toContain('마지막 생존자')
    expect(html).toContain('비슷한 티어')
    expect(html).toContain('이긴 만큼 티어 점수가 오릅니다.')
  })

  it('대결 모드 준비 화면에서 각자 탑과 동시 진행 규칙을 보여준다', () => {
    const html = markup(true, 'duel')

    expect(html).toContain('대결')
    expect(html).toContain('각자 자기 받침대')
    expect(html).toContain('동시에 진행합니다.')
    expect(html).toContain('목표 높이')
  })

  it('룰렛 준비 화면에서 자동 선택을 알려준다', () => {
    const html = markup(false, 'roulette')

    expect(html).toContain('룰렛')
    expect(html).toContain('자동으로 고릅니다')
    expect(html).toContain('선택된 모드')
  })
})
