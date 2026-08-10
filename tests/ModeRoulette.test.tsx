import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionPhase } from '../src/multi/MatchSession.ts'
import { ModeRoulette } from '../src/screens/lobby/ModeRoulette.tsx'

type RoulettePhase = Extract<SessionPhase, { kind: 'roulette' }>

function phase(matchMode: 'shared' | 'duel'): RoulettePhase {
  return {
    kind: 'roulette',
    players: [
      { id: 'a', nickname: '자두', device: 'dev-a', icon: '' },
      { id: 'b', nickname: '세이지', device: 'dev-b', icon: '' },
    ],
    ready: ['a', 'b'],
    selfId: 'a',
    chat: [],
    chatEnabled: true,
    matchModeChoice: 'roulette',
    canChangeMatchMode: false,
    matchMode,
  }
}

describe('ModeRoulette', () => {
  it.each([
    ['shared', '함께 쌓기'],
    ['duel', '대결'],
  ] as const)('%s 결과에 맞는 회전과 모드명을 보여준다', (matchMode, label) => {
    const html = renderToStaticMarkup(createElement(ModeRoulette, { phase: phase(matchMode) }))

    expect(html).toContain(`data-result="${matchMode}"`)
    expect(html).toContain(`mode-roulette__wheel--${matchMode}`)
    expect(html).toContain(`<strong>${label}</strong>`)
  })
})
