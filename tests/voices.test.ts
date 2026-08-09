import { describe, expect, it } from 'vitest'
import { weightClassOf } from '../src/audio/voices.ts'
import { HEAVY_MASS } from '../src/game/config.ts'

describe('박스 착지음의 무게대', () => {
  it('아주 가벼움부터 무거움까지 네 감각으로 가른다', () => {
    expect(weightClassOf(0.04)).toBe('veryLight')
    expect(weightClassOf(0.12)).toBe('light')
    expect(weightClassOf(0.25)).toBe('medium')
    expect(weightClassOf(0.8)).toBe('heavy')
  })

  it('물리에서 무거운 물건은 소리에서도 쿵에 든다', () => {
    expect(weightClassOf(HEAVY_MASS - 0.001)).toBe('medium')
    expect(weightClassOf(HEAVY_MASS)).toBe('heavy')
  })
})
