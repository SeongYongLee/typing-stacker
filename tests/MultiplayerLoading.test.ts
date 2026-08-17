import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MultiplayerScreen } from '../src/screens/MultiplayerScreen.tsx'

vi.mock('../src/hooks/useMatchSession.ts', () => ({
  useMatchSession: () => ({
    phase: { kind: 'playing', engine: {} },
    state: { phase: 'playing' },
    open: () => {},
    leave: () => {},
    setReady: () => {},
    sendChat: () => {},
  }),
}))

describe('대전 화면 지연 로딩', () => {
  it('경기 화면 청크를 받는 동안 로딩 상태를 알린다', () => {
    const html = renderToStaticMarkup(createElement(MultiplayerScreen, {
      theme: 'day',
      onBack: () => {},
      onPhaseChange: () => {},
    }))

    expect(html).toContain('data-match-loading="true"')
    expect(html).toContain('경기장을 불러오는 중입니다')
  })
})
