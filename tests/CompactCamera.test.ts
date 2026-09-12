import { arenaProjection } from '../src/game/renderer/three/projection.ts'
import { windowWorldPoint } from '../src/game/renderer/three/WindowLight3D.ts'
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

// The 3D camera and window light must agree after the keyboard shrinks the arena.
it('reprojects compact window anchors to their original screen pixels', () => {
  for (const height of [180, 420, 650]) {
    const scale = compactCamera(390, height, 2.1).scale
    const projection = arenaProjection(390, height, 0, 0, scale)
    const world = windowWorldPoint(74, 53, 0, 390, height, 0, 0, scale)
    expect(projection.toScreenX(world.x)).toBeCloseTo(74)
    expect(projection.toScreenY(world.y)).toBeCloseTo(53)
    expect(projection.toScreenY(2.1)).toBeGreaterThanOrEqual(20)
  }
})
