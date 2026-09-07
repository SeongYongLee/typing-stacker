import { describe, expect, it } from 'vitest'
import { compactCamera } from '../src/game/renderer/compactCamera.ts'
import { ARENA } from '../src/game/config.ts'

describe('compact camera', () => {
  it('keeps small items readable in the standard mobile scene', () => {
    expect(compactCamera(390, 210, 2.1).scale * 0.4).toBeGreaterThanOrEqual(24)
  })
  it('keeps the stack visible with space above it for incoming items', () => {
    for (const stackTop of [0.8, 2.1, 4, 7]) {
      const { scale } = compactCamera(360, 180, stackTop)
      const screenY = (y: number) => 180 - (y - ARENA.killY - 0.18) * scale
      expect(screenY(stackTop)).toBeGreaterThanOrEqual(20)
      expect(screenY(ARENA.platformTop)).toBeLessThan(180)
    }
  })
  it('handles zero dimensions during viewport transitions', () => {
    expect(compactCamera(0, 0, 0.8).scale).toBeGreaterThan(0)
    expect(Number.isFinite(compactCamera(0, 0, 0.8).scale)).toBe(true)
  })
})
