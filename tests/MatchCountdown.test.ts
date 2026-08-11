import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MatchCountdown } from '../src/screens/lobby/MatchCountdown.tsx'
import type { SessionPhase } from '../src/multi/MatchSession.ts'

vi.mock('../src/hooks/useStartAlert.ts', () => ({
  useStartAlert: () => {},
}))

const players = [
  { id: 'a', nickname: '자두', device: 'dev-a', icon: '' },
  { id: 'b', nickname: '세이지', device: 'dev-b', icon: '' },
]

function phase(matchMode: 'shared' | 'duel'): Extract<SessionPhase, { kind: 'countdown' }> {
  return {
    kind: 'countdown',
    players,
    selfId: 'b',
    seed: 1234,
    secondsLeft: 3,
    starter: 'a',
    matchMode,
  }
}

describe('MatchCountdown', () => {
  it('함께 쌓기는 첫 턴을 알려준다', () => {
    const html = renderToStaticMarkup(createElement(MatchCountdown, {
      phase: phase('shared'),
      theme: 'day',
    }))

    expect(html).toContain('자두 턴으로 시작')
  })

  it('대결은 내 위치를 강조하고 다른 위치를 흐리게 보여준다', () => {
    const html = renderToStaticMarkup(createElement(MatchCountdown, {
      phase: phase('duel'),
      theme: 'day',
    }))

    expect(html).toContain('data-duel-countdown-arena="true"')
    expect(html).toContain('data-countdown-scoreboard="true"')
    expect(html).toContain('data-countdown-input-row="true"')
    expect(html).toContain('data-countdown-player="self"')
    expect(html).toContain('data-countdown-player="other"')
    expect(html).toContain('opacity:0.28')
    expect(html).toContain('grid-template-rows:auto 1fr auto')
    expect(html).not.toContain('턴으로 시작')
    expect(html).toContain('data-countdown-self-position="b"')
    expect(html).toContain('세이지')
    expect(html).toContain('내 위치')
  })
})
