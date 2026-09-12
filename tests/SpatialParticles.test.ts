import { ALL_VARIANTS, VARIANT_BY_ID } from '../src/game/data/words.ts'
import { itemEffect, EFFECT_GROUPS } from '../src/game/renderer/three/ItemEffects.ts'
import { expect, it } from 'vitest'
import type { ArenaRenderState } from '../src/game/renderer/ArenaRenderer.ts'
import { SpatialParticles, MAX_SPATIAL_PARTICLES } from '../src/game/renderer/three/SpatialParticles.ts'
const state = (time: number, impact = false): ArenaRenderState => ({
  bodies: [], aimX: 0, showAim: false, landing: null, ownerColors: null, cameraY: 0, stackTop: 1, time,
  impacts: impact ? [{ handle: 1, id: 'egg', x: 0, y: 1, color: '#ffffff', strength: 1 }] : [],
})
it('advances in depth, freezes on repeated frames, and expires every particle', () => {
  const field = new SpatialParticles()
  const hit = state(0, true), before = structuredClone(hit)
  field.update(hit, true)
  const first = structuredClone(field.particles)
  field.update(hit, true)
  expect(field.particles).toEqual(first)
  field.update(state(0.05), true)
  expect(field.particles.some((p, i) => p.z !== first[i]!.z)).toBe(true)
  expect(hit).toEqual(before)
  for (let i = 2; i <= 30; i++) field.update(state(i * 0.05), true)
  expect(field.particles).toHaveLength(0)
  expect(field.waves).toHaveLength(0)
})
it('bounds bursts and deterministically clears effects on restart or reduced motion', () => {
  const field = new SpatialParticles()
  field.update(state(0, true), true)
  const first = structuredClone(field.particles)
  for (let i = 1; i < 100; i++) field.update(state(i * 0.001, true), true)
  expect(field.particles.length).toBeLessThanOrEqual(MAX_SPATIAL_PARTICLES)
  expect(field.waves.length).toBeLessThanOrEqual(12)
  field.update(state(0, true), true)
  expect(field.particles).toEqual(first)
  field.update(state(0.01, true), false)
  expect(field.particles).toHaveLength(0)
  expect(field.waves).toHaveLength(0)
})

it('gives the six sample objects distinct geometry, movement, and waves', () => {
  const ids = ['study-book', 'egg', 'frying-pan', 'soccer-ball', 'umbrella', 'fried-egg']
  const signatures = ids.map((id) => {
    const field = new SpatialParticles()
    const frame = state(0, true)
    field.update({ ...frame, impacts: [{ ...frame.impacts[0]!, id }] }, true)
    const p = field.particles[0]!
    return JSON.stringify([p.shape, p.gravity, p.drag, p.color, field.waves[0]?.radius])
  })
  expect(new Set(signatures).size).toBe(6)
  expect(itemEffect(VARIANT_BY_ID.get('umbrella')).shape).toBe('droplet')
  expect(itemEffect(VARIANT_BY_ID.get('fried-egg')).gravity).toBeLessThan(0)
  expect(itemEffect(VARIANT_BY_ID.get('study-book')).flutter).toBeGreaterThan(0)
  for (const variant of ALL_VARIANTS) {
    const effect = itemEffect(variant)
    expect(effect.palette.length).toBeGreaterThan(0)
    expect(effect.size).toBeGreaterThan(0)
    expect(Number.isFinite(effect.gravity)).toBe(true)
  }
})

it('does not shed water from an umbrella during free fall', () => {
  const field = new SpatialParticles()
  const body = { handle: 1, variant: VARIANT_BY_ID.get('umbrella')!, owner: 'test', x: 0, y: 4, rotation: 0, settled: false }
  field.update({ ...state(0), bodies: [body] }, true)
  field.update({ ...state(0.1), bodies: [{ ...body, y: 3.8 }] }, true)
  expect(field.particles).toHaveLength(0)
})

it('maps every visual family to real distinct catalog IDs', () => {
  const ids = EFFECT_GROUPS.flatMap((group) => [...group.ids])
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids.length).toBeGreaterThan(80)
  for (const group of EFFECT_GROUPS) {
    for (const id of group.ids) {
      expect(VARIANT_BY_ID.has(id), id).toBe(true)
    }
  }
  for (const [id, shape] of [['sunflower', 'petal'], ['magic-wand', 'star'], ['laptop', 'puff'], ['bubble-bottle', 'bubble']]) {
    const field = new SpatialParticles()
    const frame = state(0, true)
    field.update({ ...frame, impacts: [{ ...frame.impacts[0]!, id: id! }] }, true)
    expect(field.particles[0]!.shape).toBe(shape)
  }
})
