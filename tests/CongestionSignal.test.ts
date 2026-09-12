import { expect, it } from 'vitest'
import { congestionLevel, congestionPeriod, CongestionSignal } from '../src/game/renderer/congestionSignal.ts'
import { Congestion3D } from '../src/game/renderer/three/Congestion3D.ts'
it('warns from 80 percent and accelerates with danger', () => {
  expect(congestionLevel(79, false)).toBe(0)
  expect(congestionLevel(80, false)).toBe(0.25)
  expect(congestionLevel(100, false)).toBe(1)
  expect(congestionLevel(0, true)).toBe(1)
  expect(congestionPeriod(1)).toBeLessThan(congestionPeriod(0.25))
  expect(congestionPeriod(1)).toBeGreaterThan(1)
})
it('freezes with the game clock and settles smoothly after recovery', () => {
  const signal = new CongestionSignal()
  signal.update(0, 1)
  for (let i = 1; i <= 20; i++) signal.update(i * 0.05, 1)
  const value = signal.update(1, 1), phase = signal.phase
  expect(signal.update(1, 1)).toBe(value)
  expect(signal.phase).toBe(phase)
  signal.update(1.05, 0)
  expect(signal.intensity).toBeGreaterThan(0)
  for (let i = 22; i <= 70; i++) signal.update(i * 0.05, 0)
  expect(signal.intensity).toBeLessThan(0.001)
  signal.update(0, 0)
  expect(signal.intensity).toBe(0)
})
it('emits only a bounded entry dust burst and suppresses it with reduced motion', () => {
  const effect = new Congestion3D()
  effect.update(0, 1, 2, 1.52, false)
  expect(effect.group.visible).toBe(true)
  expect(effect.group.children).toHaveLength(8)
  effect.update(1, 1, 2, 1.52, false)
  expect(effect.group.visible).toBe(false)
  effect.update(1.1, 0, 2, 1.52, false)
  effect.update(1.2, 1, 2, 1.52, true)
  expect(effect.group.visible).toBe(false)
  effect.dispose()
})
