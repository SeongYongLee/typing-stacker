import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ArenaClock } from '../src/components/ArenaClock.tsx'
import type { TimeOfDay } from '../src/game/systems/DayNight.ts'

const day: TimeOfDay = { phase: 'day', progress: 0.5, nightfall: 0 }

describe('ArenaClock 해·달 아이콘', () => {
  it('기존의 절반 크기로 줄이고 시계에서 띄운다', () => {
    const markup = renderToStaticMarkup(createElement(ArenaClock, { time: day }))

    expect(markup).toContain('left:37.5%')
    expect(markup).toContain('bottom:108%')
    expect(markup).toContain('width:25%')
  })
})
