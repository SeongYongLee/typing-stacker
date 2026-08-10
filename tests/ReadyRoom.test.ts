import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionPhase } from '../src/multi/MatchSession.ts'
import { ReadyRoom } from '../src/screens/lobby/ReadyRoom.tsx'

type ReadyPhase = Extract<SessionPhase, { kind: 'ready' }>

function phase(chatEnabled: boolean): ReadyPhase {
  return {
    kind: 'ready',
    players: [{ id: 'me', nickname: '나', icon: '', device: 'device-me' }],
    ready: [],
    selfId: 'me',
    chat: [],
    chatEnabled,
  }
}

function markup(chatEnabled: boolean): string {
  return renderToStaticMarkup(createElement(ReadyRoom, {
    phase: phase(chatEnabled),
    onReady: () => {},
    onChat: () => {},
    onBack: () => {},
  }))
}

describe('ReadyRoom 게임 규칙', () => {
  it('친선전 준비 화면에서 코드·인원·티어 규칙을 보여준다', () => {
    const html = markup(true)

    expect(html).toContain('data-ready-rules="manual"')
    expect(html).toContain('방 참가 코드')
    expect(html).toContain('최대 8명')
    expect(html).toContain('티어 점수는 바뀌지 않습니다.')
  })

  it('랭크 게임 준비 화면에서 매칭·티어 규칙을 보여준다', () => {
    const html = markup(false)

    expect(html).toContain('data-ready-rules="auto"')
    expect(html).toContain('1대1')
    expect(html).toContain('비슷한 티어')
    expect(html).toContain('이긴 만큼 티어 점수가 오릅니다.')
  })
})
