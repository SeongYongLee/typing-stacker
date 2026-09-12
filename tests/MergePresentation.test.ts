import { expect, it } from 'vitest'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import { ItemAssets } from '../src/game/renderer/three/ItemAssets.ts'
import { MergePresentation3D, mergeSeconds, mergeSlots, mergeHoldSeconds, mergeGatherEnd } from '../src/game/renderer/three/MergePresentation3D.ts'
import { SpatialParticles } from '../src/game/renderer/three/SpatialParticles.ts'
import type { ArenaRenderState } from '../src/game/renderer/ArenaRenderer.ts'
const result = VARIANT_BY_ID.get('fried-egg')!
const reveal = (seconds: number, duration = 3) => ({ label: result.label, sprite: result.sprite,
  from: ['egg', 'frying-pan'].map(id => VARIANT_BY_ID.get(id)!.sprite), duration, progress: seconds / duration })
const frame = (time: number, seconds: number): ArenaRenderState => ({ time, bodies: [], impacts: [], aimX: 0,
  showAim: false, landing: null, ownerColors: null, cameraY: 0, stackTop: 1, hiddenReveal: reveal(seconds) })
it('times the assembly independently of the result display duration', () => {
  expect(mergeSeconds(reveal(0.5, 4.2))).toBeCloseTo(0.5)
  expect(mergeSeconds(reveal(0.5))).toBeCloseTo(0.5)
})
it('emits once at contact, preserves result meaning, and moves particles through depth', () => {
  const field = new SpatialParticles()
  field.update(frame(0, 0), true)
  field.update(frame(0.1, 0.1), true)
  expect(field.particles).toHaveLength(0)
  field.update(frame(0.71, 0.71), true)
  expect(field.particles).toHaveLength(6)
  expect(new Set(field.particles.map(p => p.shape))).toEqual(new Set(['steam', 'puff']))
  expect(field.particles.every(p => p.z < 0 && p.vz > 0)).toBe(true)
  field.update(frame(0.73, 0.73), true)
  expect(field.particles).toHaveLength(6)
  const frozen = structuredClone(field.particles)
  field.update(frame(0.73, 0.73), true)
  expect(field.particles).toEqual(frozen)
  field.update(frame(0.75, 0.75), false)
  expect(field.particles).toHaveLength(0)
})
it('shows flat result without motion when disabled and releases presentation models', () => {
  const assets = new ItemAssets()
  const presentation = new MergePresentation3D(assets)
  presentation.update(reveal(0), { x: 0, y: 3 }, false)
  const models = presentation.group.children.filter(child => child.type === 'Group')
  expect(models).toHaveLength(3)
  expect(models.filter(model => model.visible)).toHaveLength(1)
  presentation.update(null, { x: 0, y: 3 }, true)
  expect(presentation.group.visible).toBe(false)
  expect(presentation.group.children.filter(child => child.type === 'Group')).toHaveLength(0)
  presentation.dispose(); assets.dispose()
})

it('gathers the source art and finishes the result squash after the readable source hold', () => {
  const assets = new ItemAssets(), presentation = new MergePresentation3D(assets)
  presentation.update(reveal(0), { x: 0, y: 3 }, true)
  const models = presentation.group.children.filter(child => child.type === 'Group')
  const source = models[0]!, resultModel = models[2]!
  const initialX = Math.abs(source.position.x)
  presentation.update(reveal(0.5), { x: 0, y: 3 }, true)
  expect(Math.abs(source.position.x)).toBe(initialX)
  expect(source.visible).toBe(true)
  expect(resultModel.visible).toBe(false)
  presentation.update(reveal(0.65), { x: 0, y: 3 }, true)
  expect(Math.abs(source.position.x)).toBeLessThan(initialX)
  presentation.update(reveal(0.925), { x: 0, y: 3 }, true)
  expect(source.visible).toBe(false)
  expect(resultModel.visible).toBe(true)
  expect(resultModel.scale.x).toBeGreaterThan(resultModel.scale.y)
  presentation.update(reveal(1.05), { x: 0, y: 3 }, true)
  expect(resultModel.scale.x).toBeCloseTo(resultModel.scale.y)
  presentation.dispose(); assets.dispose()
})

it.each([4, 5, 6])('keeps %i ingredients in separated centered rows', count => {
  const slots = mergeSlots(count)
  expect(slots).toHaveLength(count)
  expect(Math.max(...slots.map(p => Math.abs(p.x)))).toBeLessThanOrEqual(0.82)
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    expect(Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.y - slots[j]!.y)).toBeGreaterThan(0.7)
  }
  expect(mergeHoldSeconds(count)).toBe(1)
})

it.each([4, 5])('emits the promised number of bursts for %i ingredients', count => {
  const field = new SpatialParticles()
  const contact = mergeHoldSeconds(count) + mergeGatherEnd(count)
  const make = (time: number) => ({ ...frame(time, time), hiddenReveal: { ...reveal(time), from: Array(count).fill(result.sprite) } })
  field.update(make(contact - 0.01), true)
  expect(field.particles).toHaveLength(0)
  field.update(make(contact + 0.01), true)
  const first = field.particles.length
  expect(first).toBeGreaterThan(6)
  field.update(make(contact + 0.2), true)
  expect(field.particles.length).toBe(count === 5 ? first + 8 : first)
  const second = field.particles.length
  field.update(make(contact + 0.21), true)
  expect(field.particles).toHaveLength(second)
})
