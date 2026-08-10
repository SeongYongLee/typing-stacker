import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LobbyScreen } from '../src/screens/LobbyScreen.tsx'

let selectedIndex = 1

vi.mock('../src/hooks/useMenuKeys.ts', () => ({
  useMenuKeys: () => ({
    index: selectedIndex,
    select: (next: number) => {
      selectedIndex = next
    },
  }),
}))

vi.mock('../src/hooks/useAutoMatch.ts', () => ({
  useAutoMatch: () => ({
    searching: false,
    status: null,
    start: () => {},
    cancel: () => {},
  }),
}))

vi.mock('../src/hooks/useLeaderboard.ts', () => ({
  useLeaderboard: () => ({
    status: 'offline',
    view: null,
  }),
}))

vi.mock('../src/hooks/useQueueSize.ts', () => ({
  useQueueSize: () => null,
}))

function markup(index: number): string {
  selectedIndex = index
  return renderToStaticMarkup(createElement(LobbyScreen, {
    phase: null,
    onOpen: () => {},
    onReady: () => {},
    onChat: () => {},
    onMatchMode: () => {},
    onBack: () => {},
  }))
}

describe('LobbyScreen 설명 패널', () => {
  it('랭크 게임을 고르면 랭크 공통 설명을 보여준다', () => {
    const html = markup(1)

    expect(html).toContain('랭크 게임은')
    expect(html).toContain('1대1')
    expect(html).toContain('이긴 만큼 티어 점수가 오릅니다')
  })

  it('친선전을 고르면 친선전 공통 설명을 보여준다', () => {
    const html = markup(2)

    expect(html).toContain('방 참가 코드')
    expect(html).toContain('최대 8명')
    expect(html).toContain('티어 점수는 바뀌지 않습니다')
  })
})
