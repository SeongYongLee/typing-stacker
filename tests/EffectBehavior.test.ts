import { expect, it, vi } from 'vitest'
import { effectEmission } from '../src/game/renderer/three/EffectEmission.ts'
import * as definitions from '../src/game/renderer/three/ItemEffects.ts'
import { EFFECT_GROUPS, itemEffect } from '../src/game/renderer/three/ItemEffects.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import { SpatialParticles } from '../src/game/renderer/three/SpatialParticles.ts'
import type { ArenaRenderState } from '../src/game/renderer/ArenaRenderer.ts'
const frame = (time: number): ArenaRenderState => ({ bodies: [], aimX: 0, showAim: false, landing: null, cameraY: 0, stackTop: 0, ownerColors: null, impacts: [], time })
const body = (id: string, rotation = 0) => ({ handle: 1, variant: VARIANT_BY_ID.get(id)!, x: 2, y: 3, rotation, owner: 'review', settled: false })
function impacted(id: string) {
  const field = new SpatialParticles(), b = body(id)
  field.update({ ...frame(0), bodies: [b], impacts: [{ handle: 1, id, x: b.x, y: b.y, color: b.variant.color, strength: 1 }] }, true)
  return field
}
it('provides seven distinct new categories and keeps inappropriate items out of older families', () => {
  expect(EFFECT_GROUPS).toHaveLength(19)
  for (const [id, item] of [['grains', 'rice-plant'], ['lights', 'candle'], ['sound', 'speaker'], ['gas', 'fart-cloud'], ['soil', 'cactus'], ['propulsion', 'spaceship'], ['reflection', 'crystal']]) {
    expect(EFFECT_GROUPS.find((g) => g.id === id)?.ids).toContain(item)
  }
  expect(EFFECT_GROUPS.find((g) => g.id === 'warm')?.ids).not.toContain('microwave')
  expect(EFFECT_GROUPS.find((g) => g.id === 'digital')?.ids).not.toContain('spaceship')
  expect(EFFECT_GROUPS.find((g) => g.id === 'magic')?.ids).not.toContain('crystal')
})
it('keeps local light anchors aligned and treats rocket light as a brief reflection', () => {
  for (const id of ['candle', 'spaceship']) {
    const a = body(id), b = body(id, Math.PI / 2), effect = itemEffect(a.variant)
    const p = effectEmission(effect, a, 'move'), q = effectEmission(effect, b, 'move')
    expect(q.x - b.x).toBeCloseTo(-(p.y - a.y))
    expect(q.y - b.y).toBeCloseTo(p.x - a.x)
  }
  const effect = itemEffect(body('spaceship').variant)
  expect(effect.trigger).not.toContain('move')
  expect(effect.motion).toBe('pulse')
  expect(effect.wave).toBe('none')
})
it('keeps a reflection glint on its surface', () => {
  const field = impacted('hand-mirror'), p = { ...field.particles[0]! }
  field.update(frame(0.1), true)
  expect(field.particles[0]!.x).toBe(p.x)
  expect(field.particles[0]!.y).toBe(p.y)
  expect(field.particles[0]!.scale).toBeGreaterThan(p.scale)
})
it('uses small contact dust for a saucer and rises for food steam', () => {
  const orbit = impacted('spaceship-saucer'), first = { ...orbit.particles[0]! }
  orbit.update(frame(0.1), true)
  expect(orbit.particles[0]!.z).not.toBe(first.z)
  expect(orbit.particles[0]!.shape).toBe('puff')
  expect(Math.abs(orbit.particles[0]!.x - first.originX)).toBeLessThan(0.2)
  const steam = impacted('fried-egg'), height = steam.particles[0]!.y
  steam.update(frame(0.1), true)
  expect(steam.particles[0]!.y).toBeGreaterThan(height)
})
it('uses a world-bottom contact anchor even when the container is sideways', () => {
  const b = body('milk-carton', Math.PI / 2)
  const p = effectEmission(itemEffect(b.variant), b, 'impact')
  expect(p.x).toBe(b.x)
  expect(p.y).toBeCloseTo(b.y - b.variant.artBounds.hw)
})

it('does not emit impact or merge particles when those triggers are absent', () => {
  const effect = { ...itemEffect(body('speaker').variant), trigger: ['move'] as const }
  const spy = vi.spyOn(definitions, 'itemEffect').mockReturnValue(effect)
  try {
    const field = impacted('hand-mirror')
    expect(field.particles).toHaveLength(0)
    expect(field.waves).toHaveLength(0)
    const variant = body('speaker').variant
    field.update({ ...frame(0.1), hiddenReveal: { label: variant.label, sprite: variant.sprite, from: [], progress: 0.2 } }, true)
    expect(field.particles).toHaveLength(0)
  } finally { spy.mockRestore() }
})
