import { describe, expect, it } from 'vitest'
import { reveal, weightClassOf, type Voice } from '../src/audio/voices.ts'
import { FINAL_OUTPUT_GAIN } from '../src/audio/outputLevels.ts'
import { HEAVY_MASS } from '../src/game/config.ts'

function scheduledRevealGains(): number[] {
  const gains: number[] = []
  const parameter = (capture: boolean) => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime(value: number) {
      if (capture && value > 0.0001) gains.push(value)
    },
  })
  const connectable = {
    connect<T>(target: T): T { return target },
    disconnect() {},
  }
  const ctx = {
    createOscillator: () => ({
      ...connectable,
      type: 'sine',
      frequency: parameter(false),
      detune: { value: 0 },
      start() {},
      stop() {},
    }),
    createGain: () => ({ ...connectable, gain: parameter(true) }),
    createBufferSource: () => ({
      ...connectable,
      buffer: null,
      start() {},
      stop() {},
    }),
    createBiquadFilter: () => ({
      ...connectable,
      type: 'highpass',
      frequency: parameter(false),
      Q: { value: 0 },
    }),
  }
  reveal({
    ctx: ctx as unknown as AudioContext,
    out: {} as AudioNode,
    noise: { duration: 1 } as AudioBuffer,
    at: 0,
  } satisfies Voice)
  return gains
}

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

describe('히든 발견 종소리', () => {
  it('최종 출력이 1.3배 올라도 지금 들리는 세기를 유지한다', () => {
    const heardGains = scheduledRevealGains().map((gain) => gain * FINAL_OUTPUT_GAIN)
    expect(heardGains).toHaveLength(3)
    expect(heardGains[0]).toBeCloseTo(0.05)
    expect(heardGains[1]).toBeCloseTo(0.016)
    expect(heardGains[2]).toBeCloseTo(0.012)
  })
})
