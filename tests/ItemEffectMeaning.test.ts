import { expect, it } from 'vitest'
import rules from './fixtures/item-effect-meaning.json'
import { ALL_VARIANTS, VARIANT_BY_ID } from '../src/game/data/words.ts'
import { itemEffect } from '../src/game/renderer/three/ItemEffects.ts'
import { SpatialParticles } from '../src/game/renderer/three/SpatialParticles.ts'
import type { ArenaRenderState } from '../src/game/renderer/ArenaRenderer.ts'
const frame = (time: number): ArenaRenderState => ({ bodies: [], aimX: 0, showAim: false, landing: null, cameraY: 0, stackTop: 0, ownerColors: null, impacts: [], time })

it('requires an independent art review decision for every catalog item', () => {
  expect(rules.map((r) => r.id).sort()).toEqual(ALL_VARIANTS.map((v) => v.id).sort())
  expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length)
})
it.each(rules)('$label: $reason', (rule) => {
  const variant = VARIANT_BY_ID.get(rule.id)!
  const effect = itemEffect(variant)
  expect(effect.shape).toBe(rule.shape)
  expect(effect.palette).toEqual(rule.palette)
  expect(effect.trigger.includes('move')).toBe(rule.moveAllowed)
  const field = new SpatialParticles()
  field.update({ ...frame(0), impacts: [{ handle: 1, id: rule.id, x: 0, y: 1, color: variant.color, strength: 1 }] }, true)
  expect(field.particles.length).toBeGreaterThan(0)
  for (const particle of field.particles) {
    expect(particle.shape).toBe(rule.shape)
    expect(rule.palette).toContain(particle.color)
  }
  field.reset()
  const body = { handle: 1, variant, owner: 'review', x: 0, y: 4, rotation: 0, settled: false }
  field.update({ ...frame(0), bodies: [body] }, true)
  field.update({ ...frame(0.1), bodies: [{ ...body, y: 3.5 }] }, true)
  expect(field.particles.length > 0).toBe(rule.moveAllowed)
})
it.each([[0.4, 0], [-0.4, 0], [0, -0.4], [0, 0.4]])('keeps ordinary flight free of decorative trails (%s, %s)', (dx, dy) => {
  const variant = VARIANT_BY_ID.get('airplane')!
  const field = new SpatialParticles()
  const body = { handle: 1, variant, owner: 'review', x: 0, y: 4, rotation: 0, settled: false }
  field.update({ ...frame(0), bodies: [body] }, true)
  field.update({ ...frame(0.1), bodies: [{ ...body, x: dx, y: 4 + dy }] }, true)
  expect(field.particles).toHaveLength(0)
})

it.each(['fire-extinguisher', 'turtle', 'milk-carton'])('places %s contact dust below the body, not at its nozzle or contents', (id) => {
  const variant = VARIANT_BY_ID.get(id)!
  const field = new SpatialParticles()
  field.update({ ...frame(0), impacts: [{ handle: 1, id, x: 0, y: 2, color: variant.color, strength: 1 }] }, true)
  expect(field.particles[0]!.y).toBeCloseTo(2 - variant.artBounds.hh)
})

it('keeps all catalog items quiet between events and reserves stars for magic', () => {
  const magic = new Set(['magic-wand','winged-wand','magic-book','stardust','mirror-door'])
  for (const variant of ALL_VARIANTS) {
    const effect = itemEffect(variant)
    expect(effect.trigger, variant.id).not.toContain('move')
    expect(effect.wave, variant.id).toBe('none')
    expect(effect.count, variant.id).toBeLessThanOrEqual(magic.has(variant.id) ? 7 : 4)
    expect(effect.life, variant.id).toBeLessThanOrEqual(magic.has(variant.id) ? 0.85 : 0.65)
    if (effect.shape === 'star') expect(magic.has(variant.id), variant.id).toBe(true)
  }
})
