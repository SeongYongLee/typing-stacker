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
    secondsLeft: 3,
    starter: 'a',
    matchMode,
  }
}

describe('MatchCountdown', () => {
  it('함께 쌓기는 첫 턴을 알려준다', () => {
    const html = renderToStaticMarkup(createElement(MatchCountdown, { phase: phase('shared') }))

    expect(html).toContain('자두 턴으로 시작')
  })

  it('대결은 턴 없이 동시에 시작한다고 보여준다', () => {
    const html = renderToStaticMarkup(createElement(MatchCountdown, { phase: phase('duel') }))

    expect(html).toContain('동시 시작')
    expect(html).not.toContain('턴으로 시작')
  })
})
