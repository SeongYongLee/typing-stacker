import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import type { ArenaRendererPort } from '../src/game/renderer/ArenaRendererPort.ts'
import type { ArenaRenderState } from '../src/game/renderer/ArenaRenderer.ts'
import { FrameClock } from './helpers/frameClock.ts'

function renderer(): ArenaRendererPort {
  return { draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
}

describe('renderer ownership and simulation independence', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  it('releases each renderer once when replacing, detaching and disposing', async () => {
    const engine = await GameEngine.create(12)
    try {
      const first = renderer(), second = renderer()
      engine.attachRenderer(first)
      engine.attachRenderer(first)
      expect(first.dispose).not.toHaveBeenCalled()
      engine.attachRenderer(second)
      expect(first.dispose).toHaveBeenCalledTimes(1)
      engine.handleResize()
      expect(second.resize).toHaveBeenCalledOnce()
      engine.detachCanvas(); engine.detachCanvas()
      expect(second.dispose).toHaveBeenCalledTimes(1)
      expect(second.draw).toHaveBeenCalled()
    } finally { engine.dispose() }
  })

  it('preserves the same seeded tutorial results with rendering, switching and no renderer', async () => {
    const plain = await GameEngine.create(20260907)
    const visible = await GameEngine.create(20260907)
    let a: GameState | null = null, b: GameState | null = null
    let latest: ArenaRenderState | null = null
    plain.onStateChange((s) => { a = s })
    visible.onStateChange((s) => { b = s })
    try {
      visible.attachRenderer({ ...renderer(), draw: (s) => { latest = s } })
      plain.startRun(true); visible.startRun(true)
      for (const word of ['', '책', '계란', '계란', '계란', '프라이팬']) {
        plain.submit(word); visible.submit(word)
        await clock.advance(0.5)
      }
      const before = JSON.stringify(latest)
      visible.attachRenderer({ ...renderer(), draw: (s) => { latest = s } })
      expect(JSON.stringify(latest)).toBe(before)
      await clock.advance(3)
      expect(b).toEqual(a)
    } finally { plain.dispose(); visible.dispose() }
  })
})
